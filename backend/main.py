from contextlib import asynccontextmanager
import asyncio
from concurrent.futures import ThreadPoolExecutor
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Response

from config.settings import settings
from db.database import engine, Base
from auth.auth import router as auth_router, _get_msal_app
from routers.audit_router import router as audit_router
from routers.polaris_router import router as polaris_router

import db.polaris_models

_executor = ThreadPoolExecutor(max_workers=8, thread_name_prefix="audit_worker")

_app_ready = False

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _app_ready

    # Create DB tables — must complete before we're ready
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Fire MSAL warm-up in background (non-blocking)
    asyncio.create_task(_prewarm_msal())

    _app_ready = True   # ← signal readiness only after DB is done
    yield

    _app_ready = False
    await engine.dispose()
    _executor.shutdown(wait=False)


async def _prewarm_msal():
    """Build MSAL app in background thread right after server starts.
    This makes the first user login instant instead of slow."""
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(_executor, _get_msal_app)
        print("✓ MSAL pre-warmed successfully")
    except Exception as e:
        print(f"⚠ MSAL pre-warm failed (will retry on first login): {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):

    # Create DB tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Pre-warm MSAL in background — doesn't block startup
    asyncio.create_task(_prewarm_msal())

    yield
    await engine.dispose()
    _executor.shutdown(wait=False)



frontend_origin = settings.FRONTEND_ORIGIN.strip().rstrip("/")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_origin],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS","PATCH"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

app.include_router(auth_router)
app.include_router(audit_router)
app.include_router(polaris_router)

@app.get("/", tags=["Health"])
async def root():
    return {"status": "ok", "version": "2.0.0", "app": "Polaris"}


# In main.py
@app.get("/health", tags=["Health"])
async def health():
    if not _app_ready:
        return Response(status_code=503, content="starting")
    return {"status": "healthy"}