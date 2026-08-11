from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config.settings import settings
from db.database import engine, Base
from auth.auth import router as auth_router
from routers.audit_router import router as audit_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


app = FastAPI(title="Delivery Excellence AI Auditor", version="2.0.0", lifespan=lifespan ,redirect_slashes=False)

# CORS must be added BEFORE any routes, and allow_origins must not be ["*"]
# when allow_credentials=True — list origins explicitly
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