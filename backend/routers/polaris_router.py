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
import uuid,json
from datetime import datetime, timezone
from typing import Optional, List

import logging

from config.settings import settings
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy import select, desc, func , cast , or_, String as SAString
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from auth.auth import get_current_user
from db.database import get_db
from db.models import AuditSession, Project, User, CombinedSummary, AuditReport
from db.polaris_models import AuditFormDetail, ManualAuditFinding , AuditSessionAuditor
from sharepoint.graph_client import GraphClient
from sharepoint.email_service import EmailService
from sharepoint.sharepoint_service import SharePointService
from sharepoint.document_library_service import ( NewsletterLibraryService, SummaryLibraryService)


router = APIRouter(prefix="/polaris", tags=["Polaris"])
logger = logging.getLogger(__name__)

def _now() -> datetime:
    return datetime.now(timezone.utc)

def _cast_str(value) -> str:
    """Safely convert a UUID or None to string for comparison."""
    return str(value) if value is not None else ""

async def _is_auditor_assigned(
    db: AsyncSession,
    session_id: str,
    current_user: User,
) -> bool:
    """
    Returns True if the current auditor is assigned to this session.

    Supports both:
      - auditor_user_id
      - auditor_email

    This allows assignment to work even before the auditor has
    a User row in the database.
    """
    if current_user.role != "auditor":
        return False

    user_email = (current_user.azure_email or "").strip().lower()

    result = await db.execute(
        select(AuditSessionAuditor.auditor_assignment_id)
        .where(
            AuditSessionAuditor.session_id == session_id,
            or_(
                AuditSessionAuditor.auditor_user_id == current_user.user_id,
                func.lower(AuditSessionAuditor.auditor_email) == user_email,
            ),
        )
        .limit(1)
    )

    return result.scalar_one_or_none() is not None

def _send_audit_submission_email(
    *,
    audit_type: str,
    full_name: str,
    project_name: str,
    client_name: str,
    project_code: str,
    session_id: str,
    item_id: str,
) -> None:
    """
    Send notification to the DEX Steering Committee after
    an audit has been successfully created.
    """

    body = f"""
    <html>
      <body>

        <p>Greetings Steering Committee,</p>

        <p>
          A new <b>{audit_type}</b> project audit request has been
          successfully submitted by <b>{full_name}</b>.
        </p>

        <table style="border-collapse: collapse;">
          <tr>
            <td style="padding: 5px 15px 5px 0;">
              <b>Client</b>
            </td>
            <td style="padding: 5px;">
              {client_name}
            </td>
          </tr>

          <tr>
            <td style="padding: 5px 15px 5px 0;">
              <b>Project</b>
            </td>
            <td style="padding: 5px;">
              {project_name}
            </td>
          </tr>

          <tr>
            <td style="padding: 5px 15px 5px 0;">
              <b>Project Code</b>
            </td>
            <td style="padding: 5px;">
              {project_code or "-"}
            </td>
          </tr>

          <tr>
            <td style="padding: 5px 15px 5px 0;">
              <b>Audit Type</b>
            </td>
            <td style="padding: 5px;">
              {audit_type}
            </td>
          </tr>
        </table>

        <p>
          Please find the link to review the pending audit queue
          at your earliest convenience.
        </p>

        <p>
          Regards,<br>
          Polaris
        </p>

      </body>
    </html>
    """

    try:
        graph = GraphClient()
        email_service = EmailService(graph)

        email_service.send_email(
            recipient="dex@procdna.com",
            subject=f"New {audit_type} Audit Request - {project_name}",
            body=body,
        )

        print(
            f"[Email] {audit_type} submission notification sent "
            f"for session {session_id}"
        )

    except Exception as exc:
        # Do NOT fail the audit submission just because email failed.
        print(
            f"[Email] Failed to send {audit_type} submission "
            f"notification for session {session_id}: {exc}"

       )

def _send_auditor_assignment_email(
    *,
    auditor_email: str,
    auditor_name: str,
    project_name: str,
    client_name: str,
    audit_type: str,
    session_id: str,
) -> None:
    body = f"""
    <html>
      <body>
        <p>Hello {auditor_name},</p>

        <p>
          You have been assigned as the auditor for the following
          <b>{audit_type}</b> audit:
        </p>

        <table style="border-collapse: collapse;">
          <tr>
            <td style="padding: 5px 15px 5px 0;"><b>Client</b></td>
            <td style="padding: 5px;">{client_name}</td>
          </tr>
          <tr>
            <td style="padding: 5px 15px 5px 0;"><b>Project</b></td>
            <td style="padding: 5px;">{project_name}</td>
          </tr>
          <tr>
            <td style="padding: 5px 15px 5px 0;"><b>Audit Type</b></td>
            <td style="padding: 5px;">{audit_type}</td>
          </tr>
        </table>

        <p>
          Please log in to Polaris to review and complete the audit.
        </p>

        <p>
          Regards,<br>
          Polaris
        </p>
      </body>
    </html>
    """

    try:
        graph = GraphClient()
        email_service = EmailService(graph)

        email_service.send_email(
            recipient=auditor_email,
            subject=f"You have been assigned as auditor - {project_name}",
            body=body,
        )

        print(
            f"[Email] Auditor assignment notification sent to "
            f"{auditor_email} for session {session_id}"
        )

    except Exception as exc:
        # Assignment should not fail because email failed.
        print(
            f"[Email] Failed to send auditor assignment notification "
            f"for session {session_id}: {exc}"
        )

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
    project_code_value = (
        project_code.strip()
        if audit_type.upper() == "DEX" and project_code
        else None
    )
    
    project = Project(
        sharepoint_item_id=sharepoint_item_id,
        project_name=project_name,
        client_name=client_name,
        project_code=project_code_value,
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

@router.post("/audit/{session_id}/auditors")
async def assign_auditor(
    session_id: str,
    body: AssignAuditorRequest,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Assign an auditor to an audit session.

    Multiple auditors can be assigned to the same session.

    Assignment is stored in AuditSessionAuditor.
    AuditFormDetail is also updated for backward compatibility
    with existing frontend/history fields.
    """

    # 1. Verify session exists and load project
    session_result = await db.execute(
        select(AuditSession)
        .options(selectinload(AuditSession.project))
        .where(AuditSession.session_id == session_id)
    )

    session = session_result.scalar_one_or_none()

    if not session:
        raise HTTPException(
            status_code=404,
            detail="Audit session not found",
        )

    auditor_email = body.auditor_email.strip().lower()
    auditor_name = body.auditor_name.strip()

    # 2. Check whether this exact assignment already exists
    existing_assignment_result = await db.execute(
        select(AuditSessionAuditor)
        .where(
            AuditSessionAuditor.session_id == session_id,
            func.lower(AuditSessionAuditor.auditor_email) == auditor_email,
        )
    )

    existing_assignment = (
        existing_assignment_result.scalar_one_or_none()
    )

    if existing_assignment:
        # Update existing assignment instead of creating duplicate
        existing_assignment.auditor_name = auditor_name
        existing_assignment.assigned_by_email = (
            current_user.azure_email or current_user.user_name
        )

        assignment = existing_assignment

    else:
        # 3. Try to resolve existing User
        user_result = await db.execute(
            select(User).where(
                func.lower(User.azure_email) == auditor_email,
            )
        )

        existing_user = user_result.scalar_one_or_none()

        # 4. Create new assignment
        assignment = AuditSessionAuditor(
            session_id=session_id,
            auditor_email=auditor_email,
            auditor_name=auditor_name,
            auditor_user_id=(
                existing_user.user_id
                if existing_user
                else None
            ),
            assigned_by_email=(
                current_user.azure_email
                or current_user.user_name
            ),
        )

        db.add(assignment)

    # 5. Keep AuditFormDetail updated for backward compatibility
    fd_result = await db.execute(
        select(AuditFormDetail).where(
            AuditFormDetail.session_id == session_id
        )
    )

    fd = fd_result.scalar_one_or_none()

    if not fd:
        fd = AuditFormDetail(
            session_id=session_id,
            audit_type=session.audit_type or "STAR",
        )
        db.add(fd)

    fd.assigned_auditor_email = auditor_email
    fd.assigned_auditor_name = auditor_name

    # If user already exists, keep legacy ID populated
    user_result = await db.execute(
        select(User).where(
            func.lower(User.azure_email) == auditor_email,
        )
    )

    existing_user = user_result.scalar_one_or_none()

    fd.assigned_auditor_id = (
        existing_user.user_id
        if existing_user
        else None
    )

    await db.commit()

    # 6. Send assignment email ONLY to the newly added auditor
    try:
        _send_auditor_assignment_email(
            auditor_email=auditor_email,
            auditor_name=auditor_name,
            project_name=(
                session.project.project_name
                if session.project
                else ""
            ),
            client_name=(
                session.project.client_name
                if session.project
                else ""
            ),
            audit_type=session.audit_type or "STAR",
            session_id=session.session_id,
        )
    except Exception:
        logger.exception(
            "Failed to send assignment email to %s",
            auditor_email,
        )

    return {
        "session_id": session_id,
        "assigned_auditor_name": auditor_name,
        "assigned_auditor_email": auditor_email,
        "assigned_auditor_id": (
            str(existing_user.user_id)
            if existing_user
            else None
        ),
        "status": (
            "assigned_and_linked"
            if existing_user
            else "assigned_pending_azure_setup"
        ),
    }

@router.delete("/audit/{session_id}/auditors/{auditor_email}", status_code=204)
async def remove_auditor(
    session_id: str,
    auditor_email: str,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    auditor_email = auditor_email.strip().lower()

    result = await db.execute(
        select(AuditSessionAuditor).where(
            AuditSessionAuditor.session_id == session_id,
            func.lower(AuditSessionAuditor.auditor_email) == auditor_email,
        )
    )

    assignment = result.scalar_one_or_none()

    if not assignment:
        raise HTTPException(
            status_code=404,
            detail="Auditor assignment not found",
        )

    await db.delete(assignment)
    await db.commit()

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

    # Send submission notification
    _send_audit_submission_email(
        audit_type="STAR",
        full_name=current_user.user_name,
        project_name=project_name,
        client_name=client_name,
        project_code=project_code or "",
        session_id=session.session_id,
        item_id=str(sp_item_id),
    )

    return {
        "session_id":        session.session_id,
        "sharepoint_item_id": sp_item_id,
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

    # Send submission notification
    _send_audit_submission_email(
        audit_type="DEX",
        full_name=current_user.user_name,
        project_name=body.project_name,
        client_name=body.client_name,
        project_code=body.project_code or "",
        session_id=session.session_id,
        item_id=str(sp_item_id),
    )

    return {
        "session_id":        session.session_id,
        "sharepoint_item_id": sp_item_id,
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
                OR assigned_auditor_email = their azure_email
    """

    q = (
        select(AuditSession)
        .options(
            selectinload(AuditSession.project),
            selectinload(AuditSession.documents),
            selectinload(AuditSession.report),
        )
        .where(
            AuditSession.audit_type.in_(["STAR", "DEX"]),
            AuditSession.is_deleted == False,)
        .order_by(desc(AuditSession.session_id))
    )

    sessions = (await db.execute(q)).scalars().all()

    ids = [s.session_id for s in sessions]

    if not ids:
        return []

    # ── Form details ────────────────────────────────────────────────────────
    fd_result = await db.execute(
        select(AuditFormDetail)
        .where(AuditFormDetail.session_id.in_(ids))
    )

    fd_map = {
        d.session_id: d
        for d in fd_result.scalars().all()
    }

    assignment_result = await db.execute(
        select(AuditSessionAuditor).where(
            AuditSessionAuditor.session_id.in_(ids)
        )
    )

    assignments_by_session: dict[str, list[AuditSessionAuditor]] = {}

    for assignment in assignment_result.scalars().all():
        assignments_by_session.setdefault(
            str(assignment.session_id), []
        ).append(assignment)

    # ── Findings ────────────────────────────────────────────────────────────
    # We select ONLY session_id, therefore .scalars() already gives strings.
    fi_result = await db.execute(
        select(ManualAuditFinding.session_id)
        .where(ManualAuditFinding.session_id.in_(ids))
    )

    fi_set = set(fi_result.scalars().all())

    user_email = (current_user.azure_email or "").lower()

    rows = []

    for s in sessions:
        fd = fd_map.get(s.session_id)

        # ── Auditor RBAC ───────────────────────────────────────────────────
        if current_user.role == "auditor":

            assigned = False

            for assignment in assignments_by_session.get(str(s.session_id), []):
                if (
                    assignment.auditor_user_id is not None
                    and str(assignment.auditor_user_id)
                    == str(current_user.user_id)
                ):
                    assigned = True
                    break

                if (
                    assignment.auditor_email
                    and assignment.auditor_email.strip().lower()
                    == user_email
                ):
                    assigned = True
                    break

            if not assigned:
                continue

        # ── Document count ──────────────────────────────────────────────────
        docs_count = len(s.documents or [])

        rows.append({
            "session_id": s.session_id,
            "client_name": s.project.client_name if s.project else "",
            "project_name": s.project.project_name if s.project else "",
            "project_code": s.project.project_code if s.project else None,

            "docs_submitted": docs_count,

            "audit_initiation_date": (
                fd.submitted_at.isoformat()
                if fd and fd.submitted_at
                else None
            ),

            "audit_type": s.audit_type or "",

            "project_start_date": (
                fd.project_start_date
                if fd
                else None
            ),

            "ai_audit_status": s.audit_status,

            "ai_audit_report_url": (
                s.report.sharepoint_url
                if s.report
                else None
            ),

            "overall_status": (
                "completed"
                if s.session_id in fi_set
                else "pending"
            ),

            "assigned_auditors": [
                    {
                        "auditor_assignment_id": str(a.auditor_assignment_id),
                        "auditor_email": a.auditor_email,
                        "auditor_name": a.auditor_name,
                    }
                    for a in assignments_by_session.get(str(s.session_id), [])
                ],
            })

    return rows

# ─── Delete Audit Session (Admins only) ─────────────────────────────────────────────────────
@router.delete("/audit/{session_id}", status_code=204)
async def delete_polaris_audit(
    session_id: str,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AuditSession).where(
            AuditSession.session_id == session_id,
            AuditSession.audit_type.in_(["STAR", "DEX"]),
            AuditSession.is_deleted == False,
        )
    )

    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(
            status_code=404,
            detail="Audit session not found",
        )

    # Soft delete — keep all audit/cost/token data
    session.is_deleted = True
    session.deleted_at = _now()
    session.deleted_by = current_user.user_id

    await db.commit()

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
        .where(
            AuditSession.audit_type.in_(["STAR", "DEX"]),
            AuditSession.is_deleted == False,
            )
        .order_by(desc(AuditSession.session_id))
    )
    if current_user.role == "user":
        q = q.where(
            cast(AuditSession.user_id, SAString) == str(current_user.user_id)
        )

    sessions = (await db.execute(q)).scalars().all()
    ids = [s.session_id for s in sessions]
    if not ids:
        return []

    # Load all auditor assignments for these sessions
    assignment_result = await db.execute(
        select(AuditSessionAuditor).where(
            AuditSessionAuditor.session_id.in_(ids)
        )
    )

    assignments_by_session: dict[str, list[AuditSessionAuditor]] = {}

    for assignment in assignment_result.scalars().all():
        assignments_by_session.setdefault(
            str(assignment.session_id), []
        ).append(assignment)

    fd_map = {d.session_id: d for d in
              (await db.execute(select(AuditFormDetail).where(AuditFormDetail.session_id.in_(ids)))).scalars()}
    fi_map = {f.session_id: f for f in
              (await db.execute(select(ManualAuditFinding).where(ManualAuditFinding.session_id.in_(ids)))).scalars()}

    user_email = (current_user.azure_email or "").strip().lower()

    assigned_ids: set[str] = set()

    if current_user.role == "auditor":
        assigned_result = await db.execute(
            select(AuditSessionAuditor.session_id).where(
                or_(
                    AuditSessionAuditor.auditor_user_id == current_user.user_id,
                    func.lower(AuditSessionAuditor.auditor_email) == user_email,
                )
            )
        )

        assigned_ids = {
            str(x)
            for x in assigned_result.scalars().all()
        }

    rows = []
    seen: set[str] = set()
    for s in sessions:
        if str(s.session_id) in seen:
            continue

        seen.add(str(s.session_id))

        fd = fd_map.get(s.session_id)
        fi = fi_map.get(s.session_id)

        # Auditor sees only assigned sessions
        if current_user.role == "auditor":
            is_owner = _cast_str(s.user_id) == str(current_user.user_id)
            is_assigned = str(s.session_id) in assigned_ids

            if not (is_owner or is_assigned):
                continue

        ai_score = (
            float(s.summary.overall_project_score)
            if s.summary
            and s.summary.overall_project_score is not None
            else None
        )

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
            "assigned_auditors": [
                {
                    "auditor_assignment_id": str(a.auditor_assignment_id),
                    "auditor_name": a.auditor_name,
                    "auditor_email": a.auditor_email,
                }
                for a in assignments_by_session.get(str(s.session_id), [])
            ],
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
        .where(
            AuditSession.session_id == session_id,
            AuditSession.is_deleted == False,
        )
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

        is_owner = (
            _cast_str(session.user_id)
            == str(current_user.user_id)
        )

        is_assigned = await _is_auditor_assigned(
            db,
            session_id,
            current_user,
        )

        if not (is_owner or is_assigned):
            raise HTTPException(
                403,
                "You are not authorized to access this audit",
            )

    ai_score   = float(session.summary.overall_project_score) if session.summary and session.summary.overall_project_score else None
    report_url = session.report.sharepoint_url if session.report else None

    summary_report_url = None

    if session.sharepoint_item_id:
        try:
            sp = SharePointService()

            sp_record = sp.list_service.get_list_item(
                settings.SHAREPOINT_SITE_ID,
                settings.SHAREPOINT_LIST_ID,
                str(session.sharepoint_item_id),
            )

            sp_fields = sp_record.get("fields", {})

            # Resolve by display name so we do not assume the
            # SharePoint internal field name.
            column_endpoint = (
                f"https://graph.microsoft.com/v1.0/"
                f"sites/{settings.SHAREPOINT_SITE_ID}/"
                f"lists/{settings.SHAREPOINT_LIST_ID}/"
                "/columns"
            )

            columns_response = sp.graph.get(column_endpoint)

            summary_column_name = None

            for column in columns_response.get("value", []):
                if (
                    column.get("displayName", "").strip().lower()
                    == "summary report link"
                ):
                    summary_column_name = column.get("name")
                    break

            if summary_column_name:
                summary_report_url = sp_fields.get(
                    summary_column_name
                )

        except Exception as exc:
            print(
                f"[History] Could not fetch Summary Report Link: {exc}"
            )


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
        "manual_report_url": summary_report_url,
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
    session = (
        await db.execute(
            select(AuditSession).where(
                AuditSession.session_id == session_id,
                 AuditSession.is_deleted == False,
            )
        )
    ).scalar_one_or_none()

    if not session:
        raise HTTPException(404, "Session not found")

    if current_user.role == "user":
        if _cast_str(session.user_id) != str(current_user.user_id):
            raise HTTPException(403, "You are not authorized to access this audit")

    elif current_user.role == "auditor":
        is_owner = (
            _cast_str(session.user_id)
            == str(current_user.user_id)
        )

        is_assigned = await _is_auditor_assigned(
            db,
            session_id,
            current_user,
        )

        if not (is_owner or is_assigned):
            raise HTTPException(
                403,
                "You are not authorized to access this audit",
            )
        
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
    auditor_name: Optional[str] = Form(None),
    auditor_email: Optional[str] = Form(None),
    auditor_comments: Optional[str] = Form(None),
    overall_score: Optional[float] = Form(None),
    categories_json: str = Form(..., alias="categories"),
    manual_report: Optional[UploadFile] = File(None),
    current_user: User = Depends(require_auditor_or_admin),
    db: AsyncSession = Depends(get_db),
):
    # Auditor: can only save for assigned sessions
    if current_user.role == "auditor":

        is_assigned = await _is_auditor_assigned(
            db,
            session_id,
            current_user,
        )

        if not is_assigned:
            raise HTTPException(
                403,
                "You are not assigned to this audit",
            )

    # ------------------------------------------------------------------
    # Get the audit session.
    #
    # IMPORTANT:
    # session.sharepoint_item_id is the REAL SharePoint List Item ID.
    # This is the SAME item ID used for the AI report.
    # ------------------------------------------------------------------

    s = (
        await db.execute(
            select(AuditSession).where(
                AuditSession.session_id == session_id,
                AuditSession.is_deleted == False,
            )
        )
    ).scalar_one_or_none()

    if not s:
        raise HTTPException(404, "Session not found")

    # ------------------------------------------------------------------
    # Parse categories sent by the frontend as JSON string
    # inside multipart/form-data.
    # ------------------------------------------------------------------

    try:
        categories = json.loads(categories_json)
    except json.JSONDecodeError:
        raise HTTPException(
            400,
            "Invalid categories JSON"
        )

    cats_json = [
        {
            "category": c.get("category"),
            "remarks": c.get("remarks"),
            "scores": [
                {
                    "sub_category": sc.get("sub_category"),
                    "manual_score": sc.get("manual_score"),
                    "applicable": sc.get("applicable", True),
                    "ai_score": sc.get("ai_score"),
                    "remarks": sc.get("remarks"),
                }
                for sc in c.get("scores", [])
            ],
        }
        for c in categories
    ]

    # ------------------------------------------------------------------
    # Upload manual audit summary report if one was selected.
    #
    # The uploaded file goes to:
    #
    # Audit Summary/
    #     STAR/
    #         filename.pdf
    #
    # or
    #
    # Audit Summary/
    #     DEX/
    #         filename.pdf
    #
    # Then the resulting URL is written to the SAME SharePoint
    # List Item used by this audit.
    # ------------------------------------------------------------------

    manual_report_url: Optional[str] = None
    manual_report_drive_item_id: Optional[str] = None

    if manual_report and manual_report.filename:

        file_bytes = await manual_report.read()

        if not file_bytes:
            raise HTTPException(
                400,
                "Manual report file is empty"
            )

        content_type = (
            manual_report.content_type
            or "application/octet-stream"
        )

        audit_type = (s.audit_type or "STAR").upper()

        try:
            sp = SharePointService()

            summary_service = SummaryLibraryService(
                sp.graph
            )

            upload_result = (
                summary_service.upload_summary_report(
                    file_name=manual_report.filename,
                    file_content=file_bytes,
                    audit_type=audit_type,
                    content_type=content_type,
                )
            )

            manual_report_url = upload_result["report_url"]
            manual_report_drive_item_id = upload_result.get(
                "drive_item_id"
            )

            print(
                f"[Findings] Manual report uploaded: "
                f"{manual_report_url}"
            )

            # ----------------------------------------------------------
            # IMPORTANT:
            # Use the SAME SharePoint List Item ID as the audit.
            #
            # DO NOT use manual_report_drive_item_id here.
            # That ID belongs to the Document Library file.
            # ----------------------------------------------------------

            if not s.sharepoint_item_id:
                raise ValueError(
                    "Audit session has no SharePoint List Item ID."
                )

            sp.list_service.update_summary_report_url(
                item_id=str(s.sharepoint_item_id),
                report_url=manual_report_url,
            )

        except HTTPException:
            raise

        except Exception as exc:
            print(
                f"[Findings] Manual report upload failed: {exc}"
            )

            raise HTTPException(
                502,
                f"Could not upload manual audit report: {exc}"
            )

    # ------------------------------------------------------------------
    # Save / update manual findings in Supabase
    # ------------------------------------------------------------------

    fi = (
        await db.execute(
            select(ManualAuditFinding).where(
                ManualAuditFinding.session_id == session_id
            )
        )
    ).scalar_one_or_none()

    if fi:
        fi.auditor_name = auditor_name
        fi.auditor_email = auditor_email
        fi.auditor_comments = auditor_comments
        fi.overall_score = overall_score
        fi.categories = cats_json
        fi.submitted_at = _now()

    else:
        fi = ManualAuditFinding(
            finding_id=str(uuid.uuid4()),
            session_id=session_id,
            auditor_name=auditor_name,
            auditor_email=auditor_email,
            auditor_comments=auditor_comments,
            overall_score=overall_score,
            categories=cats_json,
            submitted_at=_now(),
        )

        db.add(fi)

    await db.commit()

    return {
        "finding_id": fi.finding_id,
        "status": "saved",
        "manual_report_url": manual_report_url,
        "manual_report_sp_item_id": (
            str(s.sharepoint_item_id)
            if s.sharepoint_item_id
            else None
        ),
        "manual_report_drive_item_id": manual_report_drive_item_id,
    }



# ─── Newsletters ──────────────────────────────────────────────────────────────

@router.get("/newsletters")
async def list_newsletters(
    current_user: User = Depends(get_current_user),
):
    """
    Returns all newsletter PDFs from the SharePoint newsletters folder,
    sorted newest-first. No DB involvement — pure SharePoint listing.
    """
    try:
        svc = NewsletterLibraryService(
            SharePointService().graph
        )

        return svc.list_newsletters()

    except ValueError as exc:
        # SHAREPOINT_NEWSLETTERS_URL not configured
        raise HTTPException(503, str(exc))

    except Exception as exc:
        print(f"[Newsletters] Error: {exc}")
        raise HTTPException(
            502,
            "Could not fetch newsletters from SharePoint"
        )
