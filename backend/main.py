from contextlib import asynccontextmanager
import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config.settings import settings
from db.database import engine, Base
from auth.auth import router as auth_router, _get_msal_app
from routers.audit_router import router as audit_router


async def _prewarm_msal():
    """Build MSAL app in background thread right after server starts.
    This makes the first user login instant instead of slow."""
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _get_msal_app)
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


app = FastAPI(
    title="Delivery Excellence AI Auditor",
    version="2.0.0",
    lifespan=lifespan,
    redirect_slashes=False,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "null",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

app.include_router(auth_router)
app.include_router(audit_router)

@app.get("/", tags=["Health"])
async def root():
    return {"status": "ok", "version": "2.0.0"}