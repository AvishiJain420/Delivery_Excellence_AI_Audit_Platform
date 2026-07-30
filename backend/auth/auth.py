"""
UNDERSTANDING THE FLOW:
  1. Frontend calls GET /auth/azure/login
  2. Backend builds the Microsoft login URL and returns it
  3. Frontend redirects the browser to that URL
  4. User authenticates with Microsoft (including MFA — Microsoft handles this)
  5. Microsoft redirects back to /auth/azure/callback?code=...&state=...
  6. Backend exchanges the code for tokens via MSAL (server-to-server)
  7. Backend verifies the id_token, extracts oid + email + name
  8. Backend upserts the user in your DB (create if new, update if returning)
  9. Backend issues YOUR JWT and returns it to the frontend
  10. Frontend stores the JWT and uses it for all future API calls
 
WHY /auth/azure/callback is a GET not a POST:
  Azure redirects the browser. Browser redirects are always GET requests.
  The auth code arrives as a query parameter in the URL, not in a POST body.
 
WHY we use a 'state' parameter:
  CSRF protection. Before sending the user to Azure, we generate a random
  string and store it. When Azure sends the user back, we verify that the
  'state' in the callback matches what we stored. This prevents an attacker
  from tricking your backend into accepting a forged callback.
  We store state in a simple dict for now — in production, use Redis or
  a DB-backed nonce table with a short TTL.
"""

from __future__ import annotations
import secrets
import uuid
from datetime import datetime , timedelta ,timezone
from typing import Optional
import msal
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import traceback
from config.settings import settings
from db.database import get_db
from db.models import User

router = APIRouter(prefix="/auth", tags=["Authentication"])

# ─────────────────────────────────────────────
# TOKEN CONFIG
# ─────────────────────────────────────────────
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS   = 7

# ─────────────────────────────────────────────
# STATE STORE  (CSRF protection)
# In production, replace with Redis with a 10-minute TTL.
# Key: random state string → Value: True (just existence check)
# ─────────────────────────────────────────────
_state_store: dict[str, bool] = {}


# ─────────────────────────────────────────────
# MSAL CLIENT FACTORY
# WHY a function instead of a module-level singleton?
# MSAL's ConfidentialClientApplication has an internal token cache.
# Creating one per request is safe and simple. In production you'd
# share one instance with a distributed cache (Redis), but for your
# team size a fresh instance per auth flow is perfectly fine.
# ─────────────────────────────────────────────
def _build_msal_app() -> msal.ConfidentialClientApplication:
    return msal.ConfidentialClientApplication(
        client_id=settings.CLIENT_ID,
        client_credential=settings.CLIENT_SECRET,
        # This URL tells MSAL where to find Azure AD's endpoints
        # (authorization URL, token URL, JWKS URL for signature verification)
        authority=f"https://login.microsoftonline.com/{settings.TENANT_ID}",
    )


# ─────────────────────────────────────────────
# JWT HELPERS  (identical to previous version)
# ─────────────────────────────────────────────
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/azure/login")


def _create_token(data: dict, expires_delta: timedelta) -> str:
    payload = {**data, "exp": datetime.now(timezone.utc) + expires_delta}
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=ALGORITHM)


def create_access_token(user_id: str) -> str:
    return _create_token(
        {"sub": user_id, "type": "access"},
        timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )


def create_refresh_token(user_id: str) -> str:
    return _create_token(
        {"sub": user_id, "type": "refresh"},
        timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    )


# ─────────────────────────────────────────────
# DEPENDENCY — get current authenticated user
# THIS FUNCTION IS IDENTICAL TO THE PREVIOUS VERSION.
# audit_router.py uses Depends(get_current_user) and it just works —
# it doesn't care whether the JWT came from Azure auth or password auth.
# ─────────────────────────────────────────────
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


# ─────────────────────────────────────────────
# SCHEMAS
# ─────────────────────────────────────────────
class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    user_id: uuid.UUID
    user_name: str
    azure_email: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# ─────────────────────────────────────────────
# ROUTE 1: GET /auth/azure/login
#
# What it does:
#   Generates a state token for CSRF protection, builds the Microsoft
#   login URL, and returns it. The frontend then redirects the browser
#   to this URL. The user sees Microsoft's login page (with MFA).
#
# Why return the URL instead of redirecting directly?
#   If your frontend is a SPA (React/Vue), it needs to store the state
#   somewhere before the redirect. Returning JSON lets the frontend
#   handle the redirect itself. Alternatively you can return
#   RedirectResponse(url=auth_url) and let the backend redirect.
# ─────────────────────────────────────────────
@router.get("/azure/login")
async def azure_login():
    state = secrets.token_urlsafe(32)   # cryptographically random
    _state_store[state] = True           # store for callback verification

    msal_app = _build_msal_app()
    auth_url = msal_app.get_authorization_request_url(
        scopes=settings.AZURE_AD_SCOPE.split(),
        # state is round-tripped through Azure back to your callback
        # so you can verify it hasn't been tampered with
        state=state,
        redirect_uri=settings.AZURE_AD_REDIRECT_URI,
    )
    # Return as JSON — frontend does the redirect
    return {"auth_url": auth_url}


# ─────────────────────────────────────────────
# ROUTE 2: GET /auth/azure/callback
#
# What it does:
#   Azure redirects here after the user authenticates.
#   The URL contains: ?code=AUTH_CODE&state=STATE&session_state=...
#
#   Steps:
#     1. Verify state matches (CSRF check)
#     2. Exchange code for tokens via MSAL (server → Microsoft server call)
#     3. Extract user claims from id_token (oid, email, name)
#     4. Upsert user in your database
#     5. Issue your own JWT
#     6. Redirect frontend to the app with the JWT in the URL fragment
#        (or return JSON if your callback is handled differently)
#
# WHY this must be a GET:
#   Browser redirects from Microsoft are always GET requests.
#   The auth code is in the query string, not the body.
# ─────────────────────────────────────────────
@router.get("/azure/callback")
async def azure_callback(
    code: str,
    state: str,
    db: AsyncSession = Depends(get_db),
    error: Optional[str] = None,
    error_description: Optional[str] = None,
):
    
    # Handle cases where the user cancelled login or MFA failed
    if error:
        raise HTTPException(
            status_code=400,
            detail=f"Azure authentication error: {error_description or error}"
        )
    
    print("Incoming state:", state)
    print("Stored states:", list(_state_store.keys()))
    
    # CSRF check — verify state is one we generated
    if state not in _state_store:
        raise HTTPException(status_code=400, detail="Invalid state parameter. Possible CSRF attack.")
    del _state_store[state]   # one-time use

    # Exchange the authorization code for tokens
    # This is a synchronous MSAL call — it makes an HTTPS request to
    # Microsoft's token endpoint. In a high-traffic app you'd run this
    # in a thread executor. For your team size it's fine as-is.
    msal_app = _build_msal_app()
    result = msal_app.acquire_token_by_authorization_code(
        code=code,
        scopes=settings.AZURE_AD_SCOPE.split(),
        redirect_uri=settings.AZURE_AD_REDIRECT_URI,
    )

    print(result)

    # MSAL returns an error dict if something went wrong
    if "error" in result:
        raise HTTPException(
            status_code=400,
            detail=f"Token acquisition failed: {result.get('error_description', result['error'])}"
        )

    # id_token_claims is a dict of the verified JWT claims from Azure
    # It's already decoded and signature-verified by MSAL — you don't
    # need to call jwt.decode() yourself.
    claims: dict = result.get("id_token_claims", {})

    # oid: the stable, permanent Azure object ID for this user
    # This never changes even if they rename their Microsoft account
    oid: str = claims.get("oid") or claims.get("sub")
    if not oid:
        raise HTTPException(status_code=400, detail="Could not extract user identity from token")

    name: str  = claims.get("name", "Unknown")
    email: str = claims.get("preferred_username") or claims.get("email", "")

    # Upsert: find existing user by oid, or create a new one
    # This is the "auto-registration" — first time a user logs in,
    # they get a row in your DB automatically. No separate signup step.
    existing = await db.execute(select(User).where(User.azure_oid == oid))
    user: Optional[User] = existing.scalar_one_or_none()

    if user is None:
        # First login — create the user
        user = User(
            user_id=uuid.uuid4(),
            user_name=name,
            azure_oid=oid,
            azure_email=email,
        )
        db.add(user)
        await db.flush()   # assign DB-generated defaults before using user.user_id
    else:
        # Returning user — update name/email in case they changed in Azure
        user.user_name  = name
        user.azure_email = email

    await db.commit()

    # Issue your own tokens
    access_token  = create_access_token(str(user.user_id))
    refresh_token = create_refresh_token(str(user.user_id))

    # Redirect the browser back to the frontend with the tokens.
    # Fragment (#) means the tokens never hit your server logs or
    # any proxy's access logs — the browser keeps them client-side.
    # Change FRONTEND_ORIGIN/auth/callback to wherever your frontend
    # expects to receive and store the tokens.

    frontend_redirect = (
        f"{settings.FRONTEND_ORIGIN}/auth/callback"
        f"#access_token={access_token}"
        f"&refresh_token={refresh_token}"
        f"&token_type=bearer"
    )
   
    # frontend_redirect = (
    #     f"http://localhost:3000/auth/callback"   # ← temp: redirects to local test page
    #     f"#access_token={access_token}"
    #     f"&refresh_token={refresh_token}"
    #     f"&token_type=bearer"
    # )
    # frontend_redirect = (
    #     f"http://localhost:5500/test_auth.html"   # ← temp: redirects to local test page
    #     f"#access_token={access_token}"
    #     f"&refresh_token={refresh_token}"
    #     f"&token_type=bearer"
    # )

    print(frontend_redirect)
    return RedirectResponse(url=frontend_redirect)


# ─────────────────────────────────────────────
# ROUTE 3: POST /auth/refresh  (identical to previous version)
# ─────────────────────────────────────────────
class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/refresh", response_model=TokenResponse)
async def refresh_tokens(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    """Issue a new access+refresh token pair given a valid refresh token."""
    try:
        payload = jwt.decode(body.refresh_token, settings.JWT_SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "refresh":
            raise ValueError
        user_id = payload["sub"]
    except (JWTError, ValueError, KeyError):
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    result = await db.execute(select(User).where(User.user_id == uuid.UUID(user_id)))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=401, detail="User not found")

    return TokenResponse(
        access_token=create_access_token(user_id),
        refresh_token=create_refresh_token(user_id),
    )


# ─────────────────────────────────────────────
# ROUTE 4: GET /auth/me  (identical to previous version)
# ─────────────────────────────────────────────
@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return current_user