"""
polaris_router.py — Complete updated version

Changes in this version:
  • assign_auditor: accepts {auditor_email, auditor_name} (no auditor_id required)
  • AuditFormDetail now uses assigned_auditor_email for matching
  • Queue: auditor matched by user_id OR email; adds ai_audit_report_url to rows
  • Findings save: includes 'applicable' field per sub-score
  • All existing RBAC rules preserved
"""
from __future__ import annotations
import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from auth.auth import get_current_user
from db.database import get_db
from db.models import AuditSession, Project, User, CombinedSummary, AuditReport
from db.polaris_models import AuditFormDetail, ManualAuditFinding

router = APIRouter(prefix="/polaris", tags=["Polaris"])

def _now() -> datetime:
    return datetime.now(timezone.utc)


# ─── RBAC dependencies ────────────────────────────────────────────────────────

async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(403, "Admin access required")
    return current_user

async def require_auditor_or_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in ("admin", "auditor"):
        raise HTTPException(403, "Auditor or admin access required")
    return current_user


# ─── Schemas ──────────────────────────────────────────────────────────────────

class DexAuditRequest(BaseModel):
    client_name: str
    project_name: str
    project_code: str
    project_manager: str
    sow_signed_date: str
    phase: Optional[str] = None
    project_start_date: Optional[str] = None
    project_end_date: Optional[str] = None
    actual_project_start_date: str
    estimated_project_end_date: str
    project_duration_months: Optional[str] = None
    project_duration_weeks: Optional[str] = None
    estimated_budget: str
    consumed_budget: Optional[str] = None
    current_project_margin: Optional[str] = None
    sharepoint_link: str
    project_details: Optional[str] = None

class FindingScore(BaseModel):
    sub_category: str
    manual_score: float
    applicable: bool = True
    ai_score: Optional[float] = None
    remarks: Optional[str] = None

class FindingCategory(BaseModel):
    category: str
    scores: List[FindingScore]
    remarks: Optional[str] = None

class FindingsRequest(BaseModel):
    session_id: str
    auditor_name: Optional[str] = None
    auditor_email: Optional[str] = None
    auditor_comments: Optional[str] = None
    overall_score: Optional[float] = None
    categories: List[FindingCategory]

class AssignAuditorRequest(BaseModel):
    auditor_email: str    # email of the auditor (may not exist in DB yet)
    auditor_name: str     # display name


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def _create_project_and_session(
    db: AsyncSession,
    sharepoint_item_id: str,   # ← NOW takes the real SP list item ID
    project_name: str,
    client_name: str,
    project_code: Optional[str],
    audit_type: str,
    user: User,
    ) -> tuple[Project, AuditSession]:
    """
    Creates Project (keyed on real SP item ID) + AuditSession.
    sharepoint_item_id must already exist in SharePoint before calling this.
    """
    project = Project(
        sharepoint_item_id=sharepoint_item_id,
        project_name=project_name,
        client_name=client_name,
        project_code=project_code or "",
    )
    db.add(project)
    await db.flush()

    session = AuditSession(
        session_id=str(uuid.uuid4()),
        audit_type=audit_type,
        sharepoint_item_id=sharepoint_item_id,
        user_id=user.user_id,
        audit_status="pending",
    )
    db.add(session)
    await db.flush()
    return project, session


async def _try_resolve_sp_link(sharepoint_link: str) -> dict:
    try:
        from sharepoint.graph_client import GraphClient
        from urllib.parse import urlparse
        gc = GraphClient()
        parsed = urlparse(sharepoint_link)
        hostname, path = parsed.netloc, parsed.path.rstrip("/")
        endpoint = f"https://graph.microsoft.com/v1.0/sites/{hostname}:{path}"
        info = gc.get(endpoint)
        return {"site_id": info.get("id"), "sharepoint_url": sharepoint_link}
    except Exception as exc:
        print(f"[DEX] SP URL resolution failed: {exc}")
        return {"sharepoint_url": sharepoint_link}


# ─── Auditor management ───────────────────────────────────────────────────────

@router.get("/auditors")
async def list_auditors(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Return all users with role='auditor'. Admin only."""
    result = await db.execute(select(User).where(User.role == "auditor"))
    return [
        {"user_id": str(u.user_id), "user_name": u.user_name, "azure_email": u.azure_email}
        for u in result.scalars().all()
    ]


@router.post("/audit/{session_id}/assign-auditor")
async def assign_auditor(
    session_id: str,
    body: AssignAuditorRequest,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Assign auditor to a session by email.
    - If user exists in DB as auditor: sets assigned_auditor_id too.
    - If user doesn't exist yet (pending Azure AD): stores email+name only.
      When they log in with the Auditor role, they'll see the session.
    """
    fd_result = await db.execute(
        select(AuditFormDetail).where(AuditFormDetail.session_id == session_id)
    )
    fd = fd_result.scalar_one_or_none()
    if not fd:
        raise HTTPException(404, "Audit session not found")

    # Try to find existing auditor user by email
    user_result = await db.execute(
        select(User).where(
            func.lower(User.azure_email) == body.auditor_email.lower(),
            User.role == "auditor",
        )
    )
    existing_user = user_result.scalar_one_or_none()

    fd.assigned_auditor_email = body.auditor_email.lower()
    fd.assigned_auditor_name  = body.auditor_name
    fd.assigned_auditor_id    = existing_user.user_id if existing_user else None

    await db.commit()

    return {
        "session_id": session_id,
        "assigned_auditor_name": body.auditor_name,
        "assigned_auditor_email": body.auditor_email,
        "status": "assigned_and_linked" if existing_user else "assigned_pending_azure_setup",
    }

# ─── STAR Audit ───────────────────────────────────────────────────────────────

@router.post("/audit/star", status_code=201)
async def initiate_star_audit(
    client_name: str = Form(...),
    project_name: str = Form(...),
    project_manager: str = Form(...),
    project_code: str = Form(default=""),
    estimated_budget: str = Form(...),
    estimated_sow_signed_date: Optional[str] = Form(None),
    project_start_date: Optional[str] = Form(None),
    project_end_date: Optional[str] = Form(None),
    project_duration_months: Optional[str] = Form(None),
    project_duration_weeks: Optional[str] = Form(None),
    estimated_project_margin: Optional[str] = Form(None),
    discount_provided: Optional[str] = Form(None),
    discount_percentage: Optional[str] = Form(None),
    discount_approver_email: Optional[str] = Form(None),
    project_details: Optional[str] = Form(None),
    files: List[UploadFile] = File(default=[]),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # 1. Read all file bytes eagerly before any awaits that might close streams
    file_tuples: list[tuple[str, bytes, str]] = []
    for upload_file in files:
        content = await upload_file.read()
        file_tuples.append((
            upload_file.filename or "document",
            content,
            upload_file.content_type or "application/octet-stream",
        ))

    # 2. Create SP list item first — its ID becomes sharepoint_item_id
    sp_item_id: Optional[str] = None
    attachment_records: list[dict] = []
    try:
        from sharepoint.sharepoint_service import SharePointService
        svc = SharePointService()

        sp_item_id = svc.create_polaris_list_item(
            audit_type="STAR",
            project_name=project_name,
            project_code=project_code or "",
            client_name=client_name,
            project_manager=project_manager,
            # No sharepoint_link for STAR — files go as attachments
        )

        # 3. Attach uploaded files to the SP list item
        if file_tuples and sp_item_id:
            attachment_records = svc.attachment_service.upload_attachments_for_item(
                sp_item_id, file_tuples
            )

    except Exception as exc:
        print(f"[STAR] SharePoint item creation failed: {exc}")
        # Non-fatal: fall back to synthetic ID so DB submission still succeeds
        sp_item_id = f"polaris_{uuid.uuid4().hex[:14]}"

    # 4. Create Project + AuditSession in Supabase, keyed on real SP item ID
    project, session = await _create_project_and_session(
        db,
        sharepoint_item_id=sp_item_id,
        project_name=project_name,
        client_name=client_name,
        project_code=project_code or None,
        audit_type="STAR",
        user=current_user,
    )

    # 5. Build source_documents metadata
    source_documents = []
    for fname, content, mime in file_tuples:
        att = next((r for r in attachment_records if r["file_name"] == fname), {})
        source_documents.append({
            "file_name":       fname,
            "mime_type":       mime,
            "file_size":       len(content),
            "sharepoint_url":  att.get("attachment_url"),
        })

    # 6. Persist form detail to Supabase
    detail = AuditFormDetail(
        session_id=session.session_id,
        audit_type="STAR",
        project_manager=project_manager,
        estimated_sow_signed_date=estimated_sow_signed_date,
        project_start_date=project_start_date,
        project_end_date=project_end_date,
        project_duration_months=project_duration_months,
        project_duration_weeks=project_duration_weeks,
        estimated_budget=estimated_budget,
        estimated_project_margin=estimated_project_margin,
        discount_provided=discount_provided,
        discount_percentage=discount_percentage,
        discount_approver_email=discount_approver_email,
        project_details=project_details,
        source_documents=source_documents,
        submitted_at=_now(),
        submitted_by=current_user.azure_email or current_user.user_name,
    )
    db.add(detail)
    await db.commit()

    return {
        "session_id":        session.session_id,
        "sharepoint_item_id": sp_item_id,   # ← frontend uses this for /audit?item_id=XX
        "audit_type":        "STAR",
        "project_name":      project_name,
        "client_name":       client_name,
        "audit_status":      "pending",
        "documents_uploaded": len(source_documents),
    }


# ─── DEX Audit ────────────────────────────────────────────────────────────────

@router.post("/audit/dex", status_code=201)
async def initiate_dex_audit(
    body: DexAuditRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # 1. Create SP list item with the user-supplied sharepoint_link in ShrepointLink column
    sp_item_id: Optional[str] = None
    try:
        from sharepoint.sharepoint_service import SharePointService
        svc = SharePointService()

        sp_item_id = svc.create_polaris_list_item(
            audit_type="DEX",
            project_name=body.project_name,
            project_code=body.project_code or "",
            client_name=body.client_name,
            project_manager=body.project_manager,
            sharepoint_link=body.sharepoint_link,   # stored in ShrepointLink column
        )
    except Exception as exc:
        print(f"[DEX] SharePoint item creation failed: {exc}")
        sp_item_id = f"polaris_{uuid.uuid4().hex[:14]}"

    # 2. Create Project + AuditSession in Supabase
    project, session = await _create_project_and_session(
        db,
        sharepoint_item_id=sp_item_id,
        project_name=body.project_name,
        client_name=body.client_name,
        project_code=body.project_code or None,
        audit_type="DEX",
        user=current_user,
    )

    # 3. Persist form detail (sharepoint_link stored for reference;
    #    the SP list item is the source of truth for the AI pipeline)
    detail = AuditFormDetail(
        session_id=session.session_id,
        audit_type="DEX",
        project_manager=body.project_manager,
        sow_signed_date=body.sow_signed_date,
        phase=body.phase,
        project_start_date=body.project_start_date,
        project_end_date=body.project_end_date,
        actual_project_start_date=body.actual_project_start_date,
        estimated_project_end_date=body.estimated_project_end_date,
        project_duration_months=body.project_duration_months,
        project_duration_weeks=body.project_duration_weeks,
        estimated_budget=body.estimated_budget,
        consumed_budget=body.consumed_budget,
        current_project_margin=body.current_project_margin,
        sharepoint_link=body.sharepoint_link,
        project_details=body.project_details,
        submitted_at=_now(),
        submitted_by=current_user.azure_email or current_user.user_name,
    )
    db.add(detail)
    await db.commit()

    return {
        "session_id":        session.session_id,
        "sharepoint_item_id": sp_item_id,   # ← frontend uses this for /audit?item_id=XX
        "audit_type":        "DEX",
        "project_name":      body.project_name,
        "client_name":       body.client_name,
        "audit_status":      "pending",
    }

# ─── Auditor Queue ────────────────────────────────────────────────────────────

@router.get("/audit/queue")
async def get_audit_queue(
    current_user: User = Depends(require_auditor_or_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    RBAC:
      admin   → sees all STAR/DEX sessions
      auditor → sees only sessions where assigned_auditor_id = their user_id
                OR assigned_auditor_email = their azure_email (pending assignment)
    """
    q = (
        select(AuditSession)
        .options(
            selectinload(AuditSession.project),
            selectinload(AuditSession.documents),
            selectinload(AuditSession.report),
        )
        .where(AuditSession.audit_type.in_(["STAR", "DEX"]))
        .order_by(desc(AuditSession.session_id))
    )
    sessions = (await db.execute(q)).scalars().all()
    ids = [s.session_id for s in sessions]
    if not ids:
        return []

    fd_map = {d.session_id: d for d in
              (await db.execute(select(AuditFormDetail).where(AuditFormDetail.session_id.in_(ids)))).scalars()}
    fi_set = {f.session_id for f in
              (await db.execute(select(ManualAuditFinding.session_id)
                                .where(ManualAuditFinding.session_id.in_(ids)))).scalars()}

    user_email = (current_user.azure_email or "").lower()

    rows = []
    for s in sessions:
        fd = fd_map.get(s.session_id)

        # Auditor RBAC: match by user_id OR by email
        if current_user.role == "auditor":
            id_match    = fd and fd.assigned_auditor_id is not None and str(fd.assigned_auditor_id) == str(current_user.user_id)
            email_match = fd and fd.assigned_auditor_email is not None and fd.assigned_auditor_email == user_email
            if not (id_match or email_match):
                continue

        docs_count = len(fd.source_documents or []) if fd else len(s.documents or [])
        rows.append({
            "session_id": s.session_id,
            "client_name": s.project.client_name if s.project else "",
            "project_name": s.project.project_name if s.project else "",
            "project_code": s.project.project_code if s.project else None,
            "docs_submitted": docs_count,
            "audit_initiation_date": fd.submitted_at.isoformat() if fd and fd.submitted_at else None,
            "audit_type": s.audit_type or "",
            "project_start_date": fd.project_start_date if fd else None,
            "ai_audit_status": s.audit_status,
            "ai_audit_report_url": s.report.sharepoint_url if s.report else None,
            "overall_status": "completed" if s.session_id in fi_set else "pending",
            "assigned_auditor_name": fd.assigned_auditor_name if fd else None,
            "assigned_auditor_email": fd.assigned_auditor_email if fd else None,
        })
    return rows


# ─── Overall Audit History ────────────────────────────────────────────────────

@router.get("/audit/history")
async def get_overall_audit_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(AuditSession)
        .options(
            selectinload(AuditSession.project),
            selectinload(AuditSession.summary),
            selectinload(AuditSession.report),
        )
        .where(AuditSession.audit_type.in_(["STAR", "DEX"]))
        .order_by(desc(AuditSession.session_id))
    )
    if current_user.role == "user":
        q = q.where(AuditSession.user_id == current_user.user_id)

    sessions = (await db.execute(q)).scalars().all()
    ids = [s.session_id for s in sessions]
    if not ids:
        return []

    fd_map = {d.session_id: d for d in
              (await db.execute(select(AuditFormDetail).where(AuditFormDetail.session_id.in_(ids)))).scalars()}
    fi_map = {f.session_id: f for f in
              (await db.execute(select(ManualAuditFinding).where(ManualAuditFinding.session_id.in_(ids)))).scalars()}

    user_email = (current_user.azure_email or "").lower()

    rows = []
    for s in sessions:
        fd = fd_map.get(s.session_id)
        fi = fi_map.get(s.session_id)

        # Auditor sees only assigned sessions
        if current_user.role == "auditor":
            id_match    = fd and fd.assigned_auditor_id is not None and str(fd.assigned_auditor_id) == str(current_user.user_id)
            email_match = fd and fd.assigned_auditor_email is not None and fd.assigned_auditor_email == user_email
            if not (id_match or email_match):
                continue

        ai_score = float(s.summary.overall_project_score) if s.summary and s.summary.overall_project_score else None
        rows.append({
            "session_id": s.session_id,
            "client_name": s.project.client_name if s.project else "",
            "project_name": s.project.project_name if s.project else "",
            "project_code": s.project.project_code if s.project else None,
            "audit_type": s.audit_type,
            "submitted_at": fd.submitted_at.isoformat() if fd and fd.submitted_at else None,
            "submitted_by": fd.submitted_by if fd else None,
            "ai_audit_status": s.audit_status,
            "ai_audit_score": ai_score,
            "manual_score": fi.overall_score if fi else None,
            "overall_status": "completed" if fi else ("under_review" if s.audit_status == "done" else "pending"),
            "has_report": bool(s.report),
            "report_url": s.report.sharepoint_url if s.report else None,
            "assigned_auditor_name": fd.assigned_auditor_name if fd else None,
        })
    return rows


# ─── Combined Audit Detail ────────────────────────────────────────────────────

@router.get("/audit/{session_id}/details")
async def get_audit_detail(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(AuditSession)
        .options(
            selectinload(AuditSession.project),
            selectinload(AuditSession.documents),
            selectinload(AuditSession.summary),
            selectinload(AuditSession.report),
        )
        .where(AuditSession.session_id == session_id)
    )
    if current_user.role == "user":
        q = q.where(AuditSession.user_id == current_user.user_id)

    session = (await db.execute(q)).scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Audit session not found")

    fd = (await db.execute(select(AuditFormDetail).where(AuditFormDetail.session_id == session_id))).scalar_one_or_none()
    fi = (await db.execute(select(ManualAuditFinding).where(ManualAuditFinding.session_id == session_id))).scalar_one_or_none()

    # Auditor RBAC
    if current_user.role == "auditor":
        user_email  = (current_user.azure_email or "").lower()
        id_match    = fd and fd.assigned_auditor_id is not None and str(fd.assigned_auditor_id) == str(current_user.user_id)
        email_match = fd and fd.assigned_auditor_email is not None and fd.assigned_auditor_email == user_email
        if not (id_match or email_match):
            raise HTTPException(403, "You are not assigned to this audit")

    ai_score   = float(session.summary.overall_project_score) if session.summary and session.summary.overall_project_score else None
    report_url = session.report.sharepoint_url if session.report else None

    sp_docs = {d.get("file_name"): d for d in (fd.source_documents or [])} if fd else {}
    documents = []
    seen = set()
    for doc in session.documents:
        sp = sp_docs.get(doc.file_name, {})
        documents.append({
            "document_id": doc.document_id,
            "file_name": doc.file_name,
            "sharepoint_url": sp.get("sharepoint_url") or doc.document_metadata.get("url"),
            "mime_type": sp.get("mime_type"),
            "status": doc.document_status,
        })
        seen.add(doc.file_name)
    for fname, sp in sp_docs.items():
        if fname not in seen:
            documents.append({
                "document_id": None,
                "file_name": fname,
                "sharepoint_url": sp.get("sharepoint_url"),
                "mime_type": sp.get("mime_type"),
                "status": "uploaded",
            })

    findings_payload = None
    if fi:
        findings_payload = {
            "finding_id": fi.finding_id,
            "session_id": fi.session_id,
            "auditor_name": fi.auditor_name,
            "auditor_email": fi.auditor_email,
            "auditor_comments": fi.auditor_comments,
            "overall_score": fi.overall_score,
            "categories": fi.categories or [],
            "submitted_at": fi.submitted_at.isoformat() if fi.submitted_at else None,
        }

    return {
        "session_id": session_id,
        "audit_type": session.audit_type or (fd.audit_type if fd else ""),
        "ai_audit_status": session.audit_status,
        "ai_audit_score": ai_score,
        "ai_audit_report_url": report_url,
        "submitted_at": fd.submitted_at.isoformat() if fd and fd.submitted_at else None,
        "submitted_by": fd.submitted_by if fd else None,
        "assigned_auditor_name": fd.assigned_auditor_name if fd else None,
        "assigned_auditor_email": fd.assigned_auditor_email if fd else None,
        "assigned_auditor_id": str(fd.assigned_auditor_id) if fd and fd.assigned_auditor_id else None,
        "project_name": session.project.project_name if session.project else "",
        "client_name": session.project.client_name if session.project else "",
        "project_code": session.project.project_code if session.project else None,
        "project_manager": fd.project_manager if fd else None,
        "sow_signed_date": (fd.sow_signed_date or fd.estimated_sow_signed_date) if fd else None,
        "phase": fd.phase if fd else None,
        "project_start_date": fd.project_start_date if fd else None,
        "project_end_date": fd.project_end_date if fd else None,
        "actual_project_start_date": fd.actual_project_start_date if fd else None,
        "estimated_project_end_date": fd.estimated_project_end_date if fd else None,
        "project_duration_months": fd.project_duration_months if fd else None,
        "project_duration_weeks": fd.project_duration_weeks if fd else None,
        "estimated_budget": fd.estimated_budget if fd else None,
        "estimated_project_margin": fd.estimated_project_margin if fd else None,
        "consumed_budget": fd.consumed_budget if fd else None,
        "current_project_margin": fd.current_project_margin if fd else None,
        "discount_provided": fd.discount_provided if fd else None,
        "discount_percentage": fd.discount_percentage if fd else None,
        "discount_approver_email": fd.discount_approver_email if fd else None,
        "sharepoint_link": fd.sharepoint_link if fd else None,
        "sharepoint_item_id": session.sharepoint_item_id,
        "project_details": fd.project_details if fd else None,
        "documents": documents,
        "findings": findings_payload,
        "overall_status": "completed" if fi else ("under_review" if session.audit_status == "done" else "pending"),
    }


# ─── Findings ─────────────────────────────────────────────────────────────────

@router.get("/audit/{session_id}/findings")
async def get_findings(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    fi = (await db.execute(select(ManualAuditFinding).where(ManualAuditFinding.session_id == session_id))).scalar_one_or_none()
    if not fi:
        raise HTTPException(404, "No findings for this session")
    return {
        "finding_id": fi.finding_id,
        "session_id": fi.session_id,
        "auditor_name": fi.auditor_name,
        "auditor_email": fi.auditor_email,
        "auditor_comments": fi.auditor_comments,
        "overall_score": fi.overall_score,
        "categories": fi.categories or [],
        "submitted_at": fi.submitted_at.isoformat() if fi.submitted_at else None,
    }


@router.post("/audit/{session_id}/findings", status_code=201)
async def save_findings(
    session_id: str,
    body: FindingsRequest,
    current_user: User = Depends(require_auditor_or_admin),
    db: AsyncSession = Depends(get_db),
):
    # Auditor: can only save for assigned sessions
    if current_user.role == "auditor":
        fd = (await db.execute(select(AuditFormDetail).where(AuditFormDetail.session_id == session_id))).scalar_one_or_none()
        user_email  = (current_user.azure_email or "").lower()
        id_match    = fd and fd.assigned_auditor_id is not None and str(fd.assigned_auditor_id) == str(current_user.user_id)
        email_match = fd and fd.assigned_auditor_email is not None and fd.assigned_auditor_email == user_email
        if not (id_match or email_match):
            raise HTTPException(403, "You are not assigned to this audit")

    s = (await db.execute(select(AuditSession).where(AuditSession.session_id == session_id))).scalar_one_or_none()
    if not s:
        raise HTTPException(404, "Session not found")

    cats_json = [
        {
            "category": c.category,
            "remarks": c.remarks,
            "scores": [
                {
                    "sub_category": sc.sub_category,
                    "manual_score": sc.manual_score,
                    "applicable": sc.applicable,
                    "ai_score": sc.ai_score,
                    "remarks": sc.remarks,
                }
                for sc in c.scores
            ],
        }
        for c in body.categories
    ]

    fi = (await db.execute(select(ManualAuditFinding).where(ManualAuditFinding.session_id == session_id))).scalar_one_or_none()
    if fi:
        fi.auditor_name     = body.auditor_name
        fi.auditor_email    = body.auditor_email
        fi.auditor_comments = body.auditor_comments
        fi.overall_score    = body.overall_score
        fi.categories       = cats_json
        fi.submitted_at     = _now()
    else:
        fi = ManualAuditFinding(
            finding_id=str(uuid.uuid4()),
            session_id=session_id,
            auditor_name=body.auditor_name,
            auditor_email=body.auditor_email,
            auditor_comments=body.auditor_comments,
            overall_score=body.overall_score,
            categories=cats_json,
            submitted_at=_now(),
        )
        db.add(fi)
    await db.commit()
    return {"finding_id": fi.finding_id, "status": "saved"}
