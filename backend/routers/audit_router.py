"""
Two session creation flows:
  1. POST /audit/sessions/powerapp   ← user redirected FROM Power Apps with item_id
  2. POST /audit/sessions/manual     ← user fills form ON your site with project details

Both create the same AuditSession row + Project row, then connect to WS to run pipeline.
The rest of the code (WebSocket, listing, deletion) is unchanged.
"""
from __future__ import annotations
import asyncio
import json
import uuid as _uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from auth.auth import get_current_user
from db.database import get_db
from db.models import (
    AuditSession, AuditResult, CombinedSummary,
    AuditReport, Document, Project, User,
)
from pipeline.audit_pipeline import AuditPipeline
from agent.validation.validation_hook import AsyncQueueCallback

router = APIRouter(prefix="/audit", tags=["Audit"])


# ─────────────────────────────────────────────
# SCHEMAS
# ─────────────────────────────────────────────
class StartAuditFromPowerAppRequest(BaseModel):
    """Flow 1: User comes from Power Apps with just the SharePoint item ID"""
    sharepoint_item_id: str


class StartAuditManualRequest(BaseModel):
    """Flow 2: User enters project details directly on your site"""
    project_name: str
    client_name: str
    project_code: str
    # SharePoint item ID is optional — user can audit without SharePoint
    # (stores null in DB, pipeline will skip SharePoint fetch if null)
    sharepoint_item_id: Optional[str] = None


class SessionOut(BaseModel):
    session_id: str
    audit_type: Optional[str] = None
    sharepoint_item_id: Optional[str] = None
    audit_status: str
    completion_time: Optional[datetime] = None
    error_message: Optional[str] = None

    class Config:
        from_attributes = True


# ─────────────────────────────────────────────
# DB PERSIST HELPERS
# (same as before)
# ─────────────────────────────────────────────

async def _persist_project(db: AsyncSession, overview: dict) -> None:
    item_id = overview.get("item_id")
    if not item_id:
        return  # skip if no item_id (manual flow without SharePoint)

    result = await db.execute(select(Project).where(Project.sharepoint_item_id == item_id))
    project = result.scalar_one_or_none()
    if project is None:
        project = Project(
            sharepoint_item_id=item_id,
            project_name=overview.get("project_name"),
            client_name=overview.get("client_name"),
            project_code=overview.get("project_code"),
        )
        db.add(project)
    else:
        project.project_name = overview.get("project_name")
        project.client_name  = overview.get("client_name")
        project.project_code = overview.get("project_code")
    await db.flush()


async def _persist_documents(
    db: AsyncSession, session_id: str, identified: list[dict]
) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for doc in identified:
        d = Document(
            session_id=session_id,
            file_name=doc["filename"],
            framework_category=doc.get("matched_category"),
            document_metadata={
                "confidence": doc.get("confidence"),
                "reasoning":  doc.get("reasoning"),
                "source":     doc.get("source"),
                "url":        doc.get("url", ""),
            },
            document_status="queued",
            processing_stage="identified"  
        )
        db.add(d)
        await db.flush()
        mapping[doc["filename"]] = d.document_id

    await db.commit()
    return mapping

#---------Adding function to update the status of documents in doc queue
async def _update_document_status(
    db: AsyncSession,
    document_id:str,
    status:str,
    stage:str=None,
    error:str=None
):

    result = await db.execute(
        select(Document)
        .where(Document.document_id==document_id)
    )

    document=result.scalar_one_or_none()


    if not document:
        return


    document.document_status=status


    if stage:
        document.processing_stage=stage


    if status=="auditing":
        document.started_at=datetime.now(timezone.utc)


    if status=="completed":
        document.completed_at=datetime.now(timezone.utc)


    if error:
        document.error_message=error


    await db.flush()


async def _persist_audit_results(
    db: AsyncSession,
    session_id: str,
    individual_audits: list[dict],
    doc_id_map: dict[str, str],
) -> None:
    for audit in individual_audits:
        criteria = audit.get("audit_results", [])
        r = AuditResult(
            session_id=session_id,
            document_id=doc_id_map.get(audit["filename"]),
            score=str(audit.get("overall_score", 0)),
            finding=json.dumps([c.get("finding", "") for c in criteria]),
            evidence=json.dumps([c.get("evidence", "") for c in criteria]),
            recommendation=json.dumps([c.get("recommendation", "") for c in criteria]),
            full_results=criteria,
        )
        db.add(r)
    await db.flush()


async def _persist_summary(db: AsyncSession, session_id: str, summary: dict) -> None:
    s = CombinedSummary(
        session_id=session_id,
        overall_project_score=summary.get("overall_project_score"),
        executive_summary=summary.get("executive_summary"),
        cross_document_findings=summary.get("cross_document_findings", []),
        gaps_and_risks=summary.get("gaps_and_risks") or summary.get("risks", []),
        strengths=summary.get("strengths", []),
        recommendation=summary.get("recommendations") or summary.get("recommendation", []),
    )
    db.add(s)
    await db.flush()


async def _persist_report(db: AsyncSession, session_id: str, upload: dict) -> None:
    r = AuditReport(
        session_id=session_id,
        sharepoint_url=upload.get("report_url"),
        report_name=upload.get("report_name"),
    )
    db.add(r)
    await db.flush()


async def _set_status(
    db: AsyncSession, session: AuditSession, status: str, error: str = None
) -> None:
    session.audit_status = status
    if error:
        session.error_message = error
    if status in ("done", "failed"):
        session.completion_time = datetime.now(timezone.utc)
    await db.flush()


# ─────────────────────────────────────────────
# FLOW 1: Power Apps redirect flow
# ─────────────────────────────────────────────

@router.post("/sessions/powerapp", status_code=201)
async def start_session_from_powerapp(
    body: StartAuditFromPowerAppRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Flow 1: User is redirected from Power Apps with a SharePoint item ID.
    
    This endpoint:
      1. Fetches project details from SharePoint (validates item exists)
      2. Creates or updates the Project row
      3. Creates the AuditSession row
      4. Returns session_id for the frontend to open the WebSocket
    """
    from sharepoint.sharepoint_service import SharePointService

    # Fetch project details from SharePoint
    sp = SharePointService()
    try:
        context = sp.get_audit_context(body.sharepoint_item_id)
    except Exception as e:
        raise HTTPException(
            status_code=404,
            detail=f"SharePoint item {body.sharepoint_item_id} not found: {str(e)}"
        )

    # Upsert Project
    result = await db.execute(
        select(Project).where(Project.sharepoint_item_id == body.sharepoint_item_id)
    )
    project = result.scalar_one_or_none()

    if not project:
        project = Project(
            sharepoint_item_id=body.sharepoint_item_id,
            project_name=context.get("project_name"),
            client_name=context.get("client_name"),
            project_code=context.get("project_code"),
        )
        db.add(project)
    else:
        project.project_name = context.get("project_name")
        project.client_name  = context.get("client_name")
        project.project_code = context.get("project_code")

    await db.flush()

    # -----------------------------
    # CREATE AUDIT SESSION
    # -----------------------------
    session = AuditSession(
        sharepoint_item_id=body.sharepoint_item_id,
        user_id=current_user.user_id,
        audit_type=context.get("audit_type", ""),
        audit_status="pending",
    )

    db.add(session)

    await db.flush()
    await db.commit()

    return {
        "session_id": session.session_id,
        "audit_status": session.audit_status,
        "project_name": project.project_name,
        "client_name": project.client_name,
        "audit_type": context.get("audit_type"),
        "flow": "powerapp",
    }


# ─────────────────────────────────────────────
# FLOW 2: Manual form entry flow
# ─────────────────────────────────────────────

@router.post("/sessions/manual", status_code=201)
async def start_session_manual(
    body: StartAuditManualRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Flow 2: User fills in project details directly on your site.
    
    This endpoint:
      1. Creates a Project row from user input (no SharePoint fetch)
      2. Creates an AuditSession row
      3. User will upload documents manually in the UI later
        (the pipeline will skip SharePoint document fetch if sharepoint_item_id is null)
    
    Note: For now, this creates a project but the pipeline still expects SharePoint.
    In Phase 2, you'll add document upload UI and a manual document ingestion pipeline.
    """
    # If user provided a SharePoint item ID, try to validate it
    if body.sharepoint_item_id:
        result = await db.execute(
            select(Project).where(Project.sharepoint_item_id == body.sharepoint_item_id)
        )
        project = result.scalar_one_or_none()

        if not project:
            project = Project(
                sharepoint_item_id=body.sharepoint_item_id,
                project_name=body.project_name,
                client_name=body.client_name,
                project_code=body.project_code,
            )
            db.add(project)
        else:
            project.project_name = body.project_name
            project.client_name  = body.client_name
            project.project_code = body.project_code
    else:
        # No SharePoint item ID — create a standalone project row
        # (You'll need to update the Project model to allow sharepoint_item_id to be nullable for this)
        # For now, generate a synthetic item_id so the FK constraint is satisfied
        synthetic_item_id = f"manual_{_uuid.uuid4().hex[:8]}"
        project = Project(
            sharepoint_item_id=synthetic_item_id,
            project_name=body.project_name,
            client_name=body.client_name,
            project_code=body.project_code,
        )
        db.add(project)

    await db.flush()

    # Create Session
    session = AuditSession(
        sharepoint_item_id=project.sharepoint_item_id,
        user_id=current_user.user_id,
        audit_type="manual",  # marker that this is a manual flow
        audit_status="pending",
    )
    db.add(session)
    await db.flush()
    await db.commit()

    return {
        "session_id":      session.session_id,
        "audit_status":    session.audit_status,
        "project_name":    project.project_name,
        "client_name":     project.client_name,
        "flow":            "manual",
    }


# ─────────────────────────────────────────────
# SHARED REST ENDPOINTS (unchanged from before)
# ─────────────────────────────────────────────

# @router.get("/sessions")
# async def list_sessions(
#     current_user: User = Depends(get_current_user),
#     db: AsyncSession = Depends(get_db),
# ):
#     result = await db.execute(
#         select(AuditSession)
#         .where(AuditSession.user_id == current_user.user_id)
#         .order_by(desc(AuditSession.completion_time))
#     )
#     return [SessionOut.model_validate(s) for s in result.scalars().all()]

@router.get("/sessions")
async def list_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):

    result = await db.execute(
        select(AuditSession)
        .options(
            selectinload(AuditSession.project),
            selectinload(AuditSession.documents),
            selectinload(AuditSession.summary),
        )
        .where(
            AuditSession.user_id == current_user.user_id
        )
        .order_by(
            desc(AuditSession.completion_time)
        )
    )

    sessions = result.scalars().all()

    return [
        {
            "session_id": s.session_id,

            "audit_type": s.audit_type,

            "sharepoint_item_id": s.sharepoint_item_id,

            "audit_status": s.audit_status,

            "completion_time": (
                s.completion_time.isoformat()
                if s.completion_time
                else None
            ),

            "error_message": s.error_message,

            # Project details
            "project_name": (
                s.project.project_name
                if s.project
                else "Unknown Project"
            ),

            "client_name": (
                s.project.client_name
                if s.project
                else None
            ),

            "project_code": (
                s.project.project_code
                if s.project
                else None
            ),

            # Return document count directly for the history/dashboard table
            "document_count": len(s.documents),

            # Return the final overall score directly.
            # The database stores the score on a 0–5 scale.
            "overall_project_score": (
                float(s.summary.overall_project_score)
                if s.summary
                and s.summary.overall_project_score is not None
                else None
            ),
        }
        for s in sessions
    ]

@router.get("/sessions/{session_id}")
async def get_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AuditSession).where(
            AuditSession.session_id == session_id,
            AuditSession.user_id == current_user.user_id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Session not found")

    await db.refresh(session, ["project", "documents", "audit_results", "summary", "report"])

    return {
        "session_id":         session.session_id,
        "audit_type":         session.audit_type,
        "sharepoint_item_id": session.sharepoint_item_id,
        "audit_status":       session.audit_status,
        "completion_time":    session.completion_time.isoformat() if session.completion_time else None,
        "error_message":      session.error_message,
        "project": {
            "project_name": session.project.project_name,
            "client_name":  session.project.client_name,
            "project_code": session.project.project_code,
        } if session.project else None,

        # "documents": [
        #     {"document_id": d.document_id, "file_name": d.file_name, "framework_category": d.framework_category}
        #     for d in session.documents
        # ],
        
        "documents":[
            {
            "document_id":d.document_id,

            "file_name":d.file_name,

            "framework_category":d.framework_category,


            "status":d.document_status,


            "stage":d.processing_stage,


            "started_at":
            d.started_at.isoformat()
            if d.started_at else None,


            "completed_at":
            d.completed_at.isoformat()
            if d.completed_at else None,


            "error":
            d.error_message

            }

            for d in session.documents
            ],
        
        "audit_results": [
            {"audit_id": r.audit_id, "document_id": r.document_id, "score": r.score, "full_results": r.full_results}
            for r in session.audit_results
        ],
        "summary": {
            "overall_project_score":  session.summary.overall_project_score,
            "executive_summary":      session.summary.executive_summary,
            "cross_document_findings": session.summary.cross_document_findings,
            "gaps_and_risks":         session.summary.gaps_and_risks,
            "strengths":              session.summary.strengths,
            "recommendation":         session.summary.recommendation,
        } if session.summary else None,
        "report": {
            "report_id":      session.report.report_id,
            "sharepoint_url": session.report.sharepoint_url,
            "report_name":    session.report.report_name,
        } if session.report else None,
    }


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AuditSession).where(
            AuditSession.session_id == session_id,
            AuditSession.user_id == current_user.user_id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Session not found")
    await db.delete(session)


@router.get("/projects")
async def list_projects(
    _: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Project))
    return [
        {
            "sharepoint_item_id": p.sharepoint_item_id,
            "project_name": p.project_name,
            "client_name":  p.client_name,
            "project_code": p.project_code,
        }
        for p in result.scalars().all()
    ]

# ─────────────────────────────────────────────
# WEBSOCKET — runs the full pipeline
# (same as before — no changes)
# ─────────────────────────────────────────────

@router.websocket("/sessions/{session_id}/run")
async def run_audit_ws(
    websocket: WebSocket,
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Full pipeline over WebSocket. Auth via ?token= query param.

    Client sends ONE message during "validation_required" stage:
        { "approved": true, "corrections": [] }

    All other messages flow server → client.
    """
    await websocket.accept()

    from jose import JWTError, jwt
    from config.settings import settings as cfg

    token = websocket.query_params.get("token")
    if not token:
        await websocket.send_json({"stage": "error", "message": "Missing auth token"})
        await websocket.close(code=4001)
        return

    try:
        payload = jwt.decode(token, cfg.JWT_SECRET_KEY, algorithms=["HS256"])
        user_id = payload["sub"]
    except JWTError:
        await websocket.send_json({"stage": "error", "message": "Invalid token"})
        await websocket.close(code=4001)
        return

    result = await db.execute(
        select(AuditSession).where(
            AuditSession.session_id == session_id,
            AuditSession.user_id == _uuid.UUID(user_id),
        )
    )
    session: AuditSession = result.scalar_one_or_none()
    if not session:
        await websocket.send_json({"stage": "error", "message": "Session not found"})
        await websocket.close(code=4004)
        return

    if session.audit_status in ("done", "failed"):
        await websocket.send_json({
            "stage": "error",
            "message": f"Session already {session.audit_status}",
        })
        await websocket.close()
        return

    async def send(stage: str, data=None, **extra):
        msg = {"stage": stage}
        if data is not None:
            msg["data"] = data
        msg.update(extra)
        await websocket.send_json(msg)

    async def heartbeat():

        while True:
            await asyncio.sleep(10)

            try:
                await websocket.send_json({
                    "stage": "heartbeat"
                })

            except Exception:
                break

    callback = AsyncQueueCallback()
    pipeline = AuditPipeline(validation_callback=callback)
    heartbeat_task = asyncio.create_task(heartbeat())   

    try:
        await _set_status(db, session, "fetching")
        await send("fetching")

        overview = await asyncio.get_event_loop().run_in_executor(
            None, pipeline.get_project_details, session.sharepoint_item_id
        )
        session.audit_type = overview.get("audit_type", "")
        await _persist_project(db, overview)
        await send("project_loaded", data={
            "project_name": overview.get("project_name"),
            "client_name":  overview.get("client_name"),
            "audit_type":   overview.get("audit_type"),
        })

        await asyncio.get_event_loop().run_in_executor(
            None, pipeline.framework_document_list
        )

        await _set_status(db, session, "identifying")
        await send("identifying")

        identify_task = asyncio.create_task(pipeline.identify_documents())
        question = await callback.question_queue.get()
        await send("validation_required", identified_docs=question["identified_docs"])

        client_msg = await websocket.receive_json()
        await callback.answer_queue.put({
            "approved":    client_msg.get("approved", True),
            "corrections": client_msg.get("corrections", []),
        })

        await send("documents_validated")

        identified = await identify_task
        doc_id_map = await _persist_documents(db, session_id, identified)

        for filename, document_id in doc_id_map.items():

            await send(
                "document_update",
                data={
                    "document_id": document_id,
                    "filename": filename,
                    "status": "queued",
                    "stage": "identified"
                }
            )

        await send("identified", data={"count": len(identified)})

        for filename, document_id in doc_id_map.items():

            await send(
                "document_update",
                data={
                    "document_id": document_id,
                    "filename": filename,
                    "status": "queued"
                }
            )

        await asyncio.get_event_loop().run_in_executor(
            None, pipeline.filter_framework_for_llm
        )

        await _set_status(db, session, "parsing")
        await send("parsing")

        try:

            parsed_documents = await asyncio.get_running_loop().run_in_executor(
                None,
                pipeline.parse_documents
            )

            for doc in parsed_documents:
                document_id = doc_id_map.get(
                    doc.filename
                )
                if document_id:
                    await _update_document_status(
                        db,
                        document_id,
                        "processing",
                        "parsed"
                    )
                    
                    await send(
                        "document_update",
                        data={
                            "document_id": document_id,
                            "filename": doc.filename,
                            "status": "parsed"
                        }
                    )

            await db.commit()

        except asyncio.CancelledError:
            print("Audit cancelled while parsing documents.")
            return
        
        await send("parsed", data={"count": len(pipeline._parsed_documents)})

        await _set_status(db, session, "auditing")
        await send("auditing")

        for filename, document_id in doc_id_map.items():

            await _update_document_status(
                db,
                document_id,
                "auditing",
                "llm_evaluation"
            )

            await send(
                "document_update",
                data={
                    "document_id": document_id,
                    "filename": filename,
                    "status": "auditing"
                }
            )

        individual_audits = await asyncio.get_event_loop().run_in_executor(
            None, pipeline.audit_documents
        )

        await db.commit()
        
        await _persist_audit_results(db, session_id, individual_audits, doc_id_map)

        for audit in individual_audits:

            document_id = doc_id_map.get(
                audit["filename"]
            )

            if document_id:

                await _update_document_status(
                    db,
                    document_id,
                    "completed",
                    "audited"
                )


                await send(
                    "document_update",
                    data={
                        "document_id": document_id,
                        "filename": audit["filename"],
                        "status": "completed"
                    }
                )

        await send("audited", data={"count": len(individual_audits)})

        await _set_status(db, session, "summarising")
        await send("summarising")
        summary = await asyncio.get_event_loop().run_in_executor(
            None, pipeline.combined_summary
        )
        await _persist_summary(db, session_id, summary)
        await send("summarised", data={
            "overall_project_score": summary.get("overall_project_score"),
        })

        await _set_status(db, session, "exporting")
        await send("exporting")
        await asyncio.get_event_loop().run_in_executor(
            None, pipeline.export_audit_report
        )

        await _set_status(db, session, "uploading")
        await send("uploading")
        upload_result = await asyncio.get_event_loop().run_in_executor(
            None, pipeline.upload_audit_report
        )
        await _persist_report(db, session_id, upload_result)

        await _set_status(db, session, "done")
        await send("done", data={
            "session_id":      session_id,
            "overall_score":   summary.get("overall_project_score"),
            "report_url":      upload_result.get("report_url"),
            "report_name":     upload_result.get("report_name"),
        })
        await db.commit()

    except WebSocketDisconnect:
        await _set_status(db, session, "failed", error="Client disconnected")
        await db.commit()

    except asyncio.CancelledError:
        print("Audit cancelled.")
        return

    except RuntimeError as exc:
        await _set_status(db, session, "failed", error=str(exc))
        await db.commit()
        try:
            await send("error", message=str(exc))
        except Exception:
            pass

    except Exception as exc:
        import traceback
        traceback.print_exc()
        await _set_status(db, session, "failed", error=str(exc))
        await db.commit()
        try:
            await send("error", message=f"Pipeline error: {str(exc)[:100]}")
        except Exception:
            pass

    finally:
        heartbeat_task.cancel()
        try:
            await websocket.close()
        except Exception:
            pass