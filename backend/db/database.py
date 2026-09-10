"""
how do I physically connect to the database and hand out connections safely? It creates the engine (the connection pool) and the get_db dependency that FastAPI injects into every route.

this file has the SQLAlchemy engine wired to the Supabase (PostGreSQL)

"""

from __future__ import annotations

#The declarative_base() function in SQLAlchemy is used to create a base class for declarative class definitions. This base class is essential for defining mapped classes that interact with the database.
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
 
from config.settings import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    pool_pre_ping = True,
    pool_size = 5,
    max_overflow = 5,
    pool_recycle = 1800,
    echo = False,  # set it True to log SQL during dev,
    
    # Required for Supabase Transaction Pooler (PgBouncer in transaction mode)
    # Without this, SQLAlchemy tries to use prepared statements which PgBouncer blocks
    connect_args={"statement_cache_size": 0},
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)
 
 
class Base(DeclarativeBase):
    pass

 
# Dependency — use in FastAPI route handlers
async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
 