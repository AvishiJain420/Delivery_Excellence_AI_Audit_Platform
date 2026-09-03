"""
polaris_models.py — Updated: adds assigned_auditor_email field
"""
from __future__ import annotations
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Float, ForeignKey, DateTime, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from db.database import Base

def _now() -> datetime:
    return datetime.now(timezone.utc)


class AuditFormDetail(Base):
    __tablename__ = "audit_form_details"

    detail_id                   = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id                  = Column(String, ForeignKey("audit_sessions.session_id", ondelete="CASCADE"),
                                         unique=True, nullable=False, index=True)
    audit_type                  = Column(String, nullable=False)

    # Common
    project_manager             = Column(String, nullable=True)
    sow_signed_date             = Column(String, nullable=True)
    estimated_sow_signed_date   = Column(String, nullable=True)
    phase                       = Column(String, nullable=True)
    project_start_date          = Column(String, nullable=True)
    project_end_date            = Column(String, nullable=True)
    actual_project_start_date   = Column(String, nullable=True)
    estimated_project_end_date  = Column(String, nullable=True)
    project_duration_months     = Column(String, nullable=True)
    project_duration_weeks      = Column(String, nullable=True)
    estimated_budget            = Column(String, nullable=True)
    project_details             = Column(Text,   nullable=True)

    # STAR-only
    estimated_project_margin    = Column(String, nullable=True)
    discount_provided           = Column(String, nullable=True)
    discount_percentage         = Column(String, nullable=True)
    discount_approver_email     = Column(String, nullable=True)

    # DEX-only
    consumed_budget             = Column(String, nullable=True)
    current_project_margin      = Column(String, nullable=True)
    sharepoint_link             = Column(Text,   nullable=True)
    sharepoint_site_id          = Column(String, nullable=True)

    # Source documents (STAR uploads) — JSONB array
    source_documents            = Column(JSONB, default=list)

    # Submission metadata
    submitted_at                = Column(DateTime(timezone=True), default=_now)
    submitted_by                = Column(String, nullable=True)

    # RBAC: Auditor assignment
    assigned_auditor_id         = Column(PG_UUID(as_uuid=True), nullable=True)
    assigned_auditor_name       = Column(String, nullable=True)
    assigned_auditor_email      = Column(String, nullable=True)   # ← NEW — for pending assignments


class ManualAuditFinding(Base):
    __tablename__ = "manual_audit_findings"

    finding_id       = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id       = Column(String, ForeignKey("audit_sessions.session_id", ondelete="CASCADE"),
                              unique=True, nullable=False, index=True)
    auditor_name     = Column(String, nullable=True)
    auditor_email    = Column(String, nullable=True)
    auditor_comments = Column(Text,   nullable=True)
    overall_score    = Column(Float,  nullable=True)
    # [{category, remarks, scores:[{sub_category, manual_score, applicable, ai_score, remarks}]}]
    categories       = Column(JSONB, default=list)
    submitted_at     = Column(DateTime(timezone=True), default=_now)
