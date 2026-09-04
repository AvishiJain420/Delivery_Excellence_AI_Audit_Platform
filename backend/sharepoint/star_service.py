import requests
import jwt
from sharepoint.auth import Authenticator
from config.settings import settings


class AttachmentService:

    def __init__(self):
        self.auth = Authenticator()
        self.site_url   = settings.SHAREPOINT_SITE_URL
        self.list_title = settings.SHAREPOINT_LIST_TITLE

    # ── READ: fetch all attachments from a list item ──────────────────────────

    def get_item_attachments(self, item_id: str) -> list[dict]:
        """
        Fetches attachments from a SharePoint Custom List Item using
        SharePoint REST API with ACS access token.
        Returns list of {name, content_bytes, url}.
        """
        token = self.auth.get_sharepoint_token()
        jwt.decode(token, options={"verify_signature": False})  # kept for debug parity

        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json;odata=nometadata",
        }

        # List attachment file metadata
        url = (
            f"{self.site_url}/_api/web/"
            f"lists/getbytitle('{self.list_title}')/"
            f"items({item_id})/AttachmentFiles"
        )

        r = requests.get(url, headers=headers, timeout=30)
        if not r.ok:
            print("ERROR:", r.status_code, r.text)
            r.raise_for_status()

        files = r.json().get("value", [])
        results = []

        for f in files:
            name    = f["FileName"]
            rel_url = f["ServerRelativeUrl"]

            download_url = (
                f"{self.site_url}/_api/web/"
                f"getfilebyserverrelativeurl('{rel_url}')/$value"
            )

            file_resp = requests.get(download_url, headers=headers, timeout=30)
            file_resp.raise_for_status()

            results.append({
                "name":          name,
                "content_bytes": file_resp.content,
                "url":           f"{self.site_url}{rel_url}",
            })

        return results

    # ── WRITE: upload a single file as a list item attachment ─────────────────

    def upload_attachment(
        self,
        item_id: str,
        file_name: str,
        file_content: bytes,
    ) -> str:
        """
        Upload one file as a SharePoint list item attachment using the REST API.

        Uses the ACS (SharePoint app-only) token — same auth as get_item_attachments.

        Returns the absolute SharePoint URL of the uploaded attachment,
        e.g. https://tenant.sharepoint.com/sites/polaris/Lists/PolarisAudit/Attachments/42/doc.pdf
        """
        token = self.auth.get_sharepoint_token()

        headers = {
            "Authorization": f"Bearer {token}",
            "Accept":        "application/json;odata=nometadata",
            "Content-Type":  "application/octet-stream",
        }

        # SharePoint REST endpoint for adding an attachment to a list item
        upload_url = (
            f"{self.site_url}/_api/web/"
            f"lists/getbytitle('{self.list_title}')/"
            f"items({item_id})/AttachmentFiles/add(FileName='{file_name}')"
        )

        print(f"[SP] Uploading attachment: {file_name} → item {item_id}")
        r = requests.post(upload_url, headers=headers, data=file_content, timeout=60)

        if not r.ok:
            print(f"[SP] Attachment upload error {r.status_code}: {r.text}")
            r.raise_for_status()

        # Response contains ServerRelativeUrl
        resp_json       = r.json()
        server_rel_url  = resp_json.get("ServerRelativeUrl", "")
        absolute_url    = f"{self.site_url}{server_rel_url}" if server_rel_url else ""

        print(f"[SP] Attachment uploaded: {absolute_url}")
        return absolute_url

    # ── WRITE: upload multiple in-memory files as attachments ─────────────────

    def upload_attachments_for_item(
        self,
        item_id: str,
        files: list[tuple[str, bytes, str]],  # (filename, content_bytes, mime_type)
    ) -> list[dict]:
        """
        Upload multiple in-memory files as SharePoint list item attachments.
        Called by polaris_router.py after creating the SP list item.

        Returns list of {"file_name", "attachment_url"} per file.
        attachment_url is None if that particular upload failed (non-fatal).
        """
        results = []
        for file_name, content_bytes, _mime_type in files:
            try:
                url = self.upload_attachment(
                    item_id=item_id,
                    file_name=file_name,
                    file_content=content_bytes,
                )
                results.append({"file_name": file_name, "attachment_url": url})
            except Exception as exc:
                print(f"[SP] Attachment failed for {file_name}: {exc}")
                results.append({"file_name": file_name, "attachment_url": None})
        return results
