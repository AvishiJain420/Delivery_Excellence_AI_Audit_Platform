from fastapi import APIRouter
from pydantic import BaseModel

from email_service import EmailService
from sharepoint.graph_client import GraphClient


router = APIRouter(
    prefix="/audit",
    tags=["Audit"]
)


class AuditNotificationRequest(BaseModel):
    fullName: str
    project_name: str
    client_name: str
    project_code: str
    audit_type: str
    session_id: str | None = None
    item_id: str | None = None


@router.post("/notify")
def send_audit_notification(
    request: AuditNotificationRequest,
):

    body = f"""
    <html>
      <body>

        <p>Greetings Steering Committee,</p>

        <p>
          A new <b>{request.audit_type}</b> project audit request
          has been successfully submitted by
          <b>{request.fullName}</b>.
        </p>

        <table style="border-collapse: collapse;">
          <tr>
            <td style="padding: 5px 15px 5px 0;">
              <b>Client</b>
            </td>
            <td style="padding: 5px;">
              {request.client_name}
            </td>
          </tr>

          <tr>
            <td style="padding: 5px 15px 5px 0;">
              <b>Project</b>
            </td>
            <td style="padding: 5px;">
              {request.project_name}
            </td>
          </tr>

          <tr>
            <td style="padding: 5px 15px 5px 0;">
              <b>Project Code</b>
            </td>
            <td style="padding: 5px;">
              {request.project_code}
            </td>
          </tr>

          <tr>
            <td style="padding: 5px 15px 5px 0;">
              <b>Audit Type</b>
            </td>
            <td style="padding: 5px;">
              {request.audit_type}
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

    graph = GraphClient()
    email_service = EmailService(graph)

    email_service.send_email(
        recipient="dex@procdna.com",
        subject=(
            f"New {request.audit_type} Audit Request - "
            f"{request.project_name}"
        ),
        body=body,
    )

    return {
        "success": True,
        "message": "Audit notification email sent successfully",
    }