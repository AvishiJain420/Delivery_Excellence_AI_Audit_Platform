"""
what do my tables look like, and how do Python objects map to rows? Every class in there is one table. Every Column(...) is one column. When SQLAlchemy sees session.documents, it silently runs the JOIN for you.
"""
from __future__ import annotations
 
import uuid
from datetime import datetime, timezone
 
from sqlalchemy import Column, String, Float, ForeignKey, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
 
from db.database import Base

def _now() -> datetime:
    return datetime.now(timezone.utc)

# User Schema

class User(Base):
    __tablename__ ="users"

    user_id = Column(UUID(as_uuid=True),primary_key = True , default =uuid.uuid4)
    user_name = Column(String , nullable = False)

    #azure_oid is the "oid" from azure id token
    # This is how you look up a returning user — if their oid is in your DB,
    # they've logged in before; if not, create a new row (upsert pattern).
    azure_oid  = Column(String, nullable=False, unique=True, index=True)
 
    # We store email for display purposes and for sending notifications,
    # but it's NOT used as a login identifier (azure_oid is).
    azure_email = Column(String, nullable=True, index=True)
 
    created_at = Column(DateTime(timezone=True), default=_now)

    #backpopulates shows the bidirectional relationship between tables
    #lazy="select" – Controls how related data is loaded. "select" means SQLAlchemy will load the related AuditSession objects on demand with a separate SQL query when you first access the attribute.
    sessions = relationship("AuditSession" , back_populates="user" ,lazy="select")

 
# ─────────────────────────────────────────────
# PROJECT
# ─────────────────────────────────────────────
class Project(Base):
    __tablename__ = "projects"
 
    sharepoint_item_id = Column(String, primary_key=True)
    project_name       = Column(String)
    client_name        = Column(String)
    project_code       = Column(String)
 
    sessions = relationship("AuditSession", back_populates="project", lazy="select")
 
 
# ─────────────────────────────────────────────
# AUDIT SESSION
# ─────────────────────────────────────────────
class AuditSession(Base):
    __tablename__ = "audit_sessions"
 
    session_id         = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    audit_type         = Column(String, nullable=False)
    sharepoint_item_id = Column(String, ForeignKey("projects.sharepoint_item_id"), nullable=False)
    user_id            = Column(UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=True)
    audit_status       = Column(String, default="pending")
    completion_time    = Column(DateTime(timezone=True), nullable=True)
    error_message      = Column(Text, nullable=True)
 
    project       = relationship("Project",        back_populates="sessions",    lazy="select")
    user          = relationship("User",           back_populates="sessions",    lazy="select")
    documents     = relationship("Document",       back_populates="session",     lazy="select", cascade="all, delete-orphan")
    audit_results = relationship("AuditResult",   back_populates="session",     lazy="select", cascade="all, delete-orphan")
    summary       = relationship("CombinedSummary", back_populates="session",   lazy="select", uselist=False, cascade="all, delete-orphan")
    report        = relationship("AuditReport",    back_populates="session",    lazy="select", uselist=False, cascade="all, delete-orphan")
 
 
# ─────────────────────────────────────────────
# DOCUMENT
# ─────────────────────────────────────────────
# class Document(Base):
#     __tablename__ = "documents"
 
#     document_id        = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
#     session_id         = Column(String, ForeignKey("audit_sessions.session_id"), nullable=False)
#     file_name          = Column(String, nullable=False)
#     framework_category = Column(String)
#     document_metadata  = Column(JSONB, default=dict)
 
#     session      = relationship("AuditSession", back_populates="documents",  lazy="select")
#     audit_result = relationship("AuditResult",  back_populates="document",   lazy="select", uselist=False)
class Document(Base):
    __tablename__ = "documents"
 
    document_id        = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    session_id         = Column(
        String,
        ForeignKey("audit_sessions.session_id"),
        nullable=False,
        index=True
    )

    file_name          = Column(String, nullable=False)

    framework_category = Column(String)

    document_metadata  = Column(JSONB, default=dict)

    document_status = Column(
        String,
        default="queued",
        nullable=False
    )

    # current processing step
    processing_stage = Column(
        String,
        nullable=True
    )

    started_at = Column(
        DateTime(timezone=True),
        nullable=True
    )

    completed_at = Column(
        DateTime(timezone=True),
        nullable=True
    )

    error_message = Column(
        Text,
        nullable=True
    )

    session = relationship(
        "AuditSession",
        back_populates="documents",
        lazy="select"
    )

    audit_result = relationship(
        "AuditResult",
        back_populates="document",
        lazy="select",
        uselist=False
    )
 
# ─────────────────────────────────────────────
# AUDIT RESULT
# ─────────────────────────────────────────────
class AuditResult(Base):
    __tablename__ = "audit_results"
 
    audit_id        = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id      = Column(String, ForeignKey("audit_sessions.session_id"), nullable=False)
    document_id     = Column(String, ForeignKey("documents.document_id"),     nullable=True)
    score           = Column(String)
    finding         = Column(Text)
    evidence        = Column(Text)
    recommendation  = Column(Text)
    full_results    = Column(JSONB, default=list)
    completion_time = Column(DateTime(timezone=True), default=_now)
 
    session  = relationship("AuditSession", back_populates="audit_results", lazy="select")
    document = relationship("Document",     back_populates="audit_result",  lazy="select")
 
 
# ─────────────────────────────────────────────
# COMBINED SUMMARY
# ─────────────────────────────────────────────
class CombinedSummary(Base):
    __tablename__ = "combined_summaries"
 
    summary_id              = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id              = Column(String, ForeignKey("audit_sessions.session_id"), unique=True, nullable=False)
    overall_project_score   = Column(Float)
    executive_summary       = Column(Text)
    cross_document_findings = Column(JSONB, default=list)
    gaps_and_risks          = Column(JSONB, default=list)
    strengths               = Column(JSONB, default=list)
    recommendation          = Column(JSONB, default=list)
 
    session = relationship("AuditSession", back_populates="summary", lazy="select")
 
 
# ─────────────────────────────────────────────
# AUDIT REPORT
# ─────────────────────────────────────────────
class AuditReport(Base):
    __tablename__ = "audit_reports"
 
    report_id       = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id      = Column(String, ForeignKey("audit_sessions.session_id"), unique=True, nullable=False)
    sharepoint_url  = Column(Text)
    report_name     = Column(String)
    completion_time = Column(DateTime(timezone=True), default=_now)
 
    session = relationship("AuditSession", back_populates="report", lazy="select")
    drive_item_id = Column(
    String,
    nullable=True,
        )

