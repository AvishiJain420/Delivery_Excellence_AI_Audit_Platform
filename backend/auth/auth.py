from __future__ import annotations
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional
import msal
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import asyncio
from urllib.parse import quote
from config.settings import settings
from db.database import get_db
from db.models import User

router = APIRouter(prefix="/auth", tags=["Authentication"])

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480
REFRESH_TOKEN_EXPIRE_DAYS = 7

_state_store: dict[str, str] = {}

# Lazy — built on first use, never at import time
_msal_app: msal.ConfidentialClientApplication | None = None

def _get_msal_app() -> msal.ConfidentialClientApplication:
    global _msal_app
    if _msal_app is None:
        _msal_app = msal.ConfidentialClientApplication(
            client_id=settings.CLIENT_ID,
            client_credential=settings.CLIENT_SECRET,
            authority=f"https://login.microsoftonline.com/{settings.TENANT_ID}",
        )
    return _msal_app

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/azure/login")

def _create_token(data: dict, expires_delta: timedelta) -> str:
    payload = {**data, "exp": datetime.now(timezone.utc) + expires_delta}
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=ALGORITHM)

def create_access_token(user_id: str, role: str = "user") -> str:
    return _create_token(
        {"sub": user_id, "type": "access", "role": role},
        timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )

def create_refresh_token(user_id: str) -> str:
    return _create_token(
        {"sub": user_id, "type": "refresh"},
        timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    )

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        token_type: str = payload.get("type")
        if user_id is None or token_type != "access":
            raise credentials_error
    except JWTError:
        raise credentials_error

    result = await db.execute(select(User).where(User.user_id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_error
    return user

async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

class UserOut(BaseModel):
    user_id: uuid.UUID
    user_name: str
    azure_email: Optional[str]
    role: str
    created_at: datetime

    class Config:
        from_attributes = True

@router.get("/azure/login")
async def azure_login(return_to: Optional[str] = "/dashboard"):
    nonce = secrets.token_urlsafe(32)
    if not return_to or not return_to.startswith("/") or return_to.startswith("/auth"):
        return_to = "/dashboard"
    _state_store[nonce] = return_to
    loop = asyncio.get_event_loop()
    auth_url = await loop.run_in_executor(
        None,
        lambda: _get_msal_app().get_authorization_request_url(
            scopes=settings.AZURE_AD_SCOPE.split(),
            state=nonce,
            redirect_uri=settings.AZURE_AD_REDIRECT_URI,
        )
    )
    return {"auth_url": auth_url}

@router.get("/azure/callback")
async def azure_callback(
    code: str,
    state: str,
    db: AsyncSession = Depends(get_db),
    error: Optional[str] = None,
    error_description: Optional[str] = None,
):
    if error:
        raise HTTPException(status_code=400, detail=f"Azure authentication error: {error_description or error}")

    if state not in _state_store:
        raise HTTPException(status_code=400, detail="Invalid state parameter.")

    return_to = _state_store.pop(state)
    loop = asyncio.get_event_loop()

    result = await loop.run_in_executor(
        None,
        lambda: _get_msal_app().acquire_token_by_authorization_code(
            code=code,
            scopes=settings.AZURE_AD_SCOPE.split(),
            redirect_uri=settings.AZURE_AD_REDIRECT_URI,
        )
    )

    if "error" in result:
        raise HTTPException(status_code=400, detail=f"Token acquisition failed: {result.get('error_description', result['error'])}")

    claims: dict = result.get("id_token_claims", {})
    oid: str = claims.get("oid") or claims.get("sub")
    if not oid:
        raise HTTPException(status_code=400, detail="Could not extract user identity from token")

    name: str  = claims.get("name", "Unknown")
    email: str = claims.get("preferred_username") or claims.get("email", "")

    existing = await db.execute(select(User).where(User.azure_oid == oid))
    user: Optional[User] = existing.scalar_one_or_none()

    entra_roles = claims.get("roles", [])
    if not isinstance(entra_roles, list):
        entra_roles = []
    assigned_role = (
        "admin"   if any(isinstance(r, str) and r.lower() == "admin"   for r in entra_roles)
        else "auditor" if any(isinstance(r, str) and r.lower() == "auditor" for r in entra_roles)
        else "user"
    )

    if user is None:
        user = User(
            user_id=uuid.uuid4(),
            user_name=name,
            azure_oid=oid,
            azure_email=email,
            role=assigned_role,
        )
        db.add(user)
        await db.flush()
    else:
        user.user_name   = name
        user.azure_email = email
        user.role        = assigned_role

    await db.commit()

    access_token  = create_access_token(str(user.user_id), role=user.role)
    refresh_token = create_refresh_token(str(user.user_id))

    frontend_redirect = (
        f"{settings.FRONTEND_ORIGIN}/auth/callback"
        f"?return_to={quote(return_to, safe='')}"
        f"#access_token={access_token}"
        f"&refresh_token={refresh_token}"
        f"&token_type=bearer"
    )
    return RedirectResponse(url=frontend_redirect)

class RefreshRequest(BaseModel):
    refresh_token: str

@router.post("/refresh", response_model=TokenResponse)
async def refresh_tokens(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    try:
        payload = jwt.decode(body.refresh_token, settings.JWT_SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "refresh":
            raise ValueError
        user_id = payload["sub"]
    except (JWTError, ValueError, KeyError):
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    try:
        user_uuid = uuid.UUID(user_id)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=401, detail="Invalid user ID")

    result = await db.execute(select(User).where(User.user_id == user_uuid))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return TokenResponse(
        access_token=create_access_token(str(user.user_id), role=user.role),
        refresh_token=create_refresh_token(str(user.user_id)),
    )

@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return current_user