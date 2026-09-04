"""
polaris_models.py

AuditFormDetail  — one row per STAR/DEX audit form submission.
ManualAuditFinding — one row per auditor findings submission.

Key design decisions:
  - sharepoint_site_id intentionally omitted: always read from SHAREPOINT_SITE_ID env var.
  - sharepoint_drive_id / sharepoint_item_id_ref intentionally omitted: not used.
  - Project.sharepoint_item_id (in models.py) is the bridge key between Supabase and SharePoint.
    For Polaris audits it now holds the REAL SP list item ID (not a synthetic polaris_xxx).
  - source_documents JSONB stores per-file metadata for STAR uploads:
      [{file_name, mime_type, file_size, sharepoint_url}, ...]
    where sharepoint_url is the attachment URL returned by AttachmentService.
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

    detail_id   = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id  = Column(
        String,
        ForeignKey("audit_sessions.session_id", ondelete="CASCADE"),
        unique=True, nullable=False, index=True,
    )
    audit_type  = Column(String, nullable=False)

    # ── Common fields ─────────────────────────────────────────────────────────
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

    # ── STAR-only fields ──────────────────────────────────────────────────────
    estimated_project_margin    = Column(String, nullable=True)
    discount_provided           = Column(String, nullable=True)
    discount_percentage         = Column(String, nullable=True)
    discount_approver_email     = Column(String, nullable=True)

    # ── DEX-only fields ───────────────────────────────────────────────────────
    consumed_budget             = Column(String, nullable=True)
    current_project_margin      = Column(String, nullable=True)
    # The user-supplied SharePoint folder URL (stored for reference/display).
    # The actual document fetch uses this via get_audit_context() from the SP list item.
    sharepoint_link             = Column(Text,   nullable=True)
    # NOTE: sharepoint_site_id intentionally NOT stored — always from env var.

    # ── STAR source documents ─────────────────────────────────────────────────
    # JSONB array: [{file_name, mime_type, file_size, sharepoint_url}, ...]
    # sharepoint_url = absolute URL of the list item attachment in SharePoint.
    source_documents            = Column(JSONB, default=list)

    # ── Submission metadata ───────────────────────────────────────────────────
    submitted_at                = Column(DateTime(timezone=True), default=_now)
    submitted_by                = Column(String, nullable=True)

    # ── RBAC: Auditor assignment ──────────────────────────────────────────────
    # assigned_auditor_id: set when the auditor already exists in users table.
    # assigned_auditor_email: always set — allows matching when auditor logs in
    #   for the first time (before their users row exists in the DB).
    assigned_auditor_id         = Column(PG_UUID(as_uuid=True), nullable=True)
    assigned_auditor_name       = Column(String, nullable=True)
    assigned_auditor_email      = Column(String, nullable=True)


class ManualAuditFinding(Base):
    __tablename__ = "manual_audit_findings"

    finding_id       = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id       = Column(
        String,
        ForeignKey("audit_sessions.session_id", ondelete="CASCADE"),
        unique=True, nullable=False, index=True,
    )
    auditor_name     = Column(String, nullable=True)
    auditor_email    = Column(String, nullable=True)
    auditor_comments = Column(Text,   nullable=True)
    overall_score    = Column(Float,  nullable=True)
    # Schema per category entry:
    # [{
    #   category: str,
    #   remarks: str | None,
    #   scores: [{sub_category, manual_score, applicable, ai_score, remarks}]
    # }]
    categories       = Column(JSONB, default=list)
    submitted_at     = Column(DateTime(timezone=True), default=_now)
