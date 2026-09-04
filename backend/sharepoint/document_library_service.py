"""
document_library_service.py

Handles upload of generated AI Audit Reports
to the SharePoint Document Library.

Folder Structure

AI Audit Reports
    └── 2026
          └── Arthur_AI_reporting
                 └── STAR
                        Report.xlsx

Uses:
    Microsoft Graph API

Responsibilities

✓ Locate Document Library Drive
✓ Create folders (if required)
✓ Upload report
✓ Return SharePoint webUrl
"""

from __future__ import annotations
from datetime import datetime
from sharepoint.graph_client import GraphClient
from config.settings import settings
from urllib.parse import quote

class DocumentLibraryService:

    """
    Uploads audit reports into the SharePoint
    Document Library.

    Library
        AI Audit Reports
    Folder Structure

        Year/
            Project/
                AuditType/
                    Report.xlsx
    """

    def __init__(self, graph: GraphClient):

        self.graph = graph

        self.site_id = settings.SHAREPOINT_SITE_ID

        self.library_name = (
            settings.SHAREPOINT_REPORT_LIBRARY_NAME
        )
        self.summary_library_name = (
            settings.SHAREPOINT_SUMMARY_LIBRARY_NAME 
            )

        # Cached after first lookup
        self._drive_id = None

    # ==========================================================
    # DOCUMENT LIBRARY
    # ==========================================================

    def _get_drive_id(self) -> str:
        """
        Returns Drive ID for

        AI Audit Reports

        Cached after first lookup.
        """

        if self._drive_id:

            return self._drive_id

        endpoint = (
            f"https://graph.microsoft.com/v1.0/"
            f"sites/{self.site_id}/drives"
        )

        response = self.graph.get(endpoint)

        drives = response.get("value", [])

        for drive in drives:

            if drive["name"].lower() == \
               self.library_name.lower():

                self._drive_id = drive["id"]

                print(
                    f"Found Document Library:"
                    f" {self.library_name}"
                )

                return self._drive_id

        raise Exception(

            f"Document Library "

            f"'{self.library_name}' "

            f"not found."

        )
    

    # ==========================================================
    # FOLDER HELPERS
    # ==========================================================

    def _folder_exists(

        self,

        parent_path: str,

        folder_name: str,

    ) -> bool:

        """
        Checks whether folder exists.

        parent_path examples

            ""

            "2026"

            "2026/Arthur"

        """

        drive = self._get_drive_id()

        if parent_path:

            path = (
                f"{parent_path}/{folder_name}"
            )

        else:

            path = folder_name

        endpoint = (

            f"https://graph.microsoft.com/v1.0/"

            f"drives/{drive}"

            f"/root:/{path}"

        )

        try:

            self.graph.get(endpoint)

            return True

        except Exception as ex:
            print(f"Folder not found : {folder_name}")    
            return False
        

    def _create_folder(

        self,

        parent_path: str,

        folder_name: str,

    ):

        """
        Creates folder.

        Graph automatically ignores

        duplicates because of

        conflictBehavior="replace"
        """

        drive = self._get_drive_id()

        if parent_path:

            endpoint = (

                f"https://graph.microsoft.com/v1.0/"

                f"drives/{drive}"

                f"/root:/{parent_path}:/children"

            )

        else:

            endpoint = (

                f"https://graph.microsoft.com/v1.0/"

                f"drives/{drive}"

                "/root/children"

            )

        payload = {

            "name": folder_name,

            "folder": {},

            "@microsoft.graph.conflictBehavior":

                "fail"

        }

        self.graph.post(

            endpoint,

            payload,

        )

        print(

            f"Created folder: "

            f"{folder_name}"

        )

    
    def _ensure_folder(

        self,

        parent_path: str,

        folder_name: str,

    ):

        """
        Creates folder only if missing.
        """

        if self._folder_exists(

            parent_path,

            folder_name,

        ):

            return

        self._create_folder(

            parent_path,

            folder_name,

        )

    # ==========================================================
    # REPORT FOLDER
    # ==========================================================

    def _ensure_report_folder(

        self,

        project_name: str,

        audit_type: str,

    ) -> str:

        """
        Creates

            2026/

                Project/

                    STAR/

        Returns folder path.
        """

        year = str(datetime.now().year)

        self._ensure_folder("",year)

        self._ensure_folder(
            year,
            project_name,
        )


        self._ensure_folder(

            f"{year}/{project_name}",

            audit_type,

        )

        return (

            f"{year}/"

            f"{project_name}/"

            f"{audit_type}"

        )
    


    def _upload_file(
        self,
        folder_path: str,
        local_file_path: str,
        report_name: str,
    ) -> dict:

        drive = self._get_drive_id()

        with open(local_file_path, "rb") as f:
            file_bytes = f.read()

        endpoint = (
            f"https://graph.microsoft.com/v1.0/"
            f"drives/{drive}"
            f"/root:/{folder_path}/{report_name}:/content"
        )

        print(f"Uploading report: {report_name}")

        graph_response = self.graph.put_bytes(
            endpoint,
            file_bytes,
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )

        # ── DIAGNOSTIC: print full Graph response ──────────────────
        # import json
        # print("\n" + "=" * 60)
        # print("RAW GRAPH UPLOAD RESPONSE")
        # print("=" * 60)
        # print(json.dumps(graph_response, indent=2))
        # print("=" * 60 + "\n")
        # # ───────────────────────────────────────────────────────────

        return graph_response
    
    # ==========================================================
    # RESPONSE HELPERS
    # ==========================================================
# document_library_service.p

    def _extract_direct_url(
        self,
        graph_response: dict,
        fallback_url: str,
    ) -> str:
        try:
            parent     = graph_response.get("parentReference", {})
            drive_path = parent.get("path", "")
            file_name  = graph_response.get("name", "")

            if drive_path and file_name:
                if "root:" in drive_path:
                    folder_path = drive_path.split("root:")[1]
                else:
                    folder_path = ""

                if folder_path:
                    site_base = settings.SHAREPOINT_SITE_URL.rstrip("/")
                    
                    # URL-encode each path segment individually
                    # so spaces become %20 but slashes are preserved
                    encoded_folder = "/".join(
                        quote(segment, safe="")
                        for segment in folder_path.strip("/").split("/")
                    )
                    encoded_filename = quote(file_name, safe="")

                    direct_url = (
                        f"{site_base}"
                        f"/{quote(self.library_name, safe='')}"
                        f"/{encoded_folder}"
                        f"/{encoded_filename}"
                    )
                    print(f"Direct URL built: {direct_url}")
                    return direct_url

        except Exception as e:
            print(f"Could not build direct URL: {e}")

        return fallback_url


    def _build_upload_response(
        self,
        graph_response: dict,
        local_path: str,
    ) -> dict:
        """
        Converts Graph upload response into application response.
        Uses the direct SharePoint file URL, not the _layouts redirect URL,
        because Graph API rejects the redirect URL in hyperlink field PATCHes.
        """

        # Graph returns webUrl as a _layouts/Doc.aspx redirect — unusable for PATCH.
        # parentReference.siteUrl + path gives the real file URL.
        raw_web_url = graph_response.get("webUrl", "")
        report_url  = self._extract_direct_url(graph_response, raw_web_url)

        return {
            "status":        "UPLOADED",
            "report_name":   graph_response.get("name"),
            "report_url":    report_url,
            "drive_item_id": graph_response.get("id"),
            "local_path":    local_path,
            "size":          graph_response.get("size", 0),
        }

    
    # ==========================================================
    # VALIDATION
    # ==========================================================

    def _validate_file(
        self,
        local_file_path: str,
    ):
        """
        Validate report exists.
        """

        from pathlib import Path

        path = Path(local_file_path)

        if not path.exists():

            raise FileNotFoundError(

                f"Report not found: "

                f"{local_file_path}"

            )

        if path.stat().st_size == 0:

            raise Exception(

                "Generated report is empty."

            )
        
    # ==========================================================
    # PUBLIC HELPERS
    # ==========================================================

    def prepare_upload(
        self,
        local_file_path: str,
        project_name: str,
        audit_type: str,
    ):
        """
        Shared helper used by upload_audit_report().
        """

        self._validate_file(
            local_file_path
        )

        folder_path = self._ensure_report_folder(
            project_name,
            audit_type,
        )

        from pathlib import Path

        report_name = Path(
            local_file_path
        ).name

        return (

            folder_path,

            report_name,

        )
    
    # ==========================================================
    # PUBLIC API
    # ==========================================================

    def upload_audit_report(
        self,
        local_file_path: str,
        project_name: str,
        audit_type: str,
    ) -> dict:
        """
        Upload audit report to SharePoint Document Library.

        Returns

        {
            status,
            report_name,
            report_url,
            drive_item_id,
            local_path,
            size
        }
        """

        print("\n" + "=" * 60)
        print("Uploading Audit Report")
        print("=" * 60)

        folder_path, report_name = self.prepare_upload(
            local_file_path,
            project_name,
            audit_type,
        )

        graph_response = self._upload_file(
            folder_path,
            local_file_path,
            report_name,
        )

        result = self._build_upload_response(
            graph_response,
            local_file_path,
        )

        print(
            f"Upload Complete\n"
            f"Report : {result['report_name']}\n"
            f"URL    : {result['report_url']}"
        )

        return result
    

    def upload_and_get_url(
        self,
        local_file_path: str,
        project_name: str,
        audit_type: str,
    ) -> str:
        """
        Upload report and return only the webUrl.
        """

        result = self.upload_audit_report(
            local_file_path,
            project_name,
            audit_type,
        )

        return result["report_url"]

    def download_audit_report(
        self,
        drive_item_id: str,
    ) -> tuple[bytes, str, str]:
        """
        Download an audit report from the SharePoint
        document library using its Microsoft Graph DriveItem ID.

        Returns:
            file_content,
            report_name,
            content_type
        """

        if not drive_item_id:
            raise ValueError(
                "drive_item_id is required to download the audit report."
            )

        # Reuse the same document-library drive ID
        # already used during report upload.
        drive_id = self._get_drive_id()

        # Get report metadata first so we can return
        # the original filename and MIME type.
        metadata_url = (
            f"https://graph.microsoft.com/v1.0/"
            f"drives/{drive_id}/items/{drive_item_id}"
        )

        metadata = self.graph.get(metadata_url)

        report_name = (
            metadata.get("name")
            or "audit_report.xlsx"
        )

        content_type = (
            metadata.get("file", {}).get("mimeType")
            or (
                "application/"
                "vnd.openxmlformats-officedocument."
                "spreadsheetml.sheet"
            )
        )

        # Microsoft Graph redirects this endpoint to the
        # actual file download URL. requests follows the
        # redirect automatically.
        content_url = (
            f"https://graph.microsoft.com/v1.0/"
            f"drives/{drive_id}/items/{drive_item_id}/content"
        )

        file_content = self.graph.get_bytes(
            content_url
        )

        print(
            f"[SharePoint Download] "
            f"drive_id={drive_id}"
        )

        print(
            f"[SharePoint Download] "
            f"drive_item_id={drive_item_id}"
        )

        print(
            f"[SharePoint Download] "
            f"Graph filename={metadata.get('name')}"
        )

        return (
            file_content,
            report_name,
            content_type,
        )

"""

══════════════════════════════════════════════════════════════════════════════
 2. SummaryLibraryService  (manual audit summary reports)
══════════════════════════════════════════════════════════════════════════════

SummaryLibraryService   — uploads manually prepared audit summary reports
   (PDF/DOCX) uploaded by auditors via the findings page.
   Folder structure: <AuditType> / <filename>
   Library name configured via SHAREPOINT_SUMMARY_LIBRARY_NAME env var.
   Accepts in-memory bytes — no local file path required.

"""
class SummaryLibraryService:
    """
    Uploads auditor-prepared summary reports to the 'Audit Summary' library.

    Folder structure (flat — no year, no project sub-folder):
        Audit Summary/
            STAR/
                My_Audit_Report.pdf
            DEX/
                Another_Report.docx

    Accepts in-memory bytes so the file never needs to touch disk.
    """

    def __init__(self, graph: GraphClient):
        self.graph        = graph
        self.site_id      = settings.SHAREPOINT_SITE_ID
        self.library_name = settings.SHAREPOINT_SUMMARY_LIBRARY_NAME
        self._drive_id    = None

    # ── Drive lookup ──────────────────────────────────────────────────────────

    def _get_drive_id(self) -> str:
        if self._drive_id:
            return self._drive_id
        endpoint = f"https://graph.microsoft.com/v1.0/sites/{self.site_id}/drives"
        for drive in self.graph.get(endpoint).get("value", []):
            if drive["name"].lower() == self.library_name.lower():
                self._drive_id = drive["id"]
                print(f"[Summary] Found library: {self.library_name} (drive={drive['id']})")
                return self._drive_id
        raise Exception(
            f"SharePoint library '{self.library_name}' not found. "
            "Check SHAREPOINT_SUMMARY_LIBRARY_NAME env var."
        )

    # ── Folder helpers ────────────────────────────────────────────────────────

    def _ensure_audit_type_folder(self, audit_type: str):
        """Ensure STAR/ or DEX/ folder exists at library root."""
        drive    = self._get_drive_id()
        endpoint = f"https://graph.microsoft.com/v1.0/drives/{drive}/root:/{audit_type}"
        try:
            self.graph.get(endpoint)
        except Exception:
            # Folder does not exist — create it
            self.graph.post(
                f"https://graph.microsoft.com/v1.0/drives/{drive}/root/children",
                {
                    "name": audit_type,
                    "folder": {},
                    "@microsoft.graph.conflictBehavior": "fail",
                },
            )
            print(f"[Summary] Created folder: {audit_type}/")

    # ── Upload ────────────────────────────────────────────────────────────────

    def upload_summary_report(
        self,
        *,
        file_name: str,
        file_content: bytes,
        audit_type: str,          # "STAR" or "DEX"
        content_type: str = "application/octet-stream",
    ) -> dict:
        """
        Upload an in-memory file as a manual audit summary report.

        Returns:
            {
                "report_name": str,
                "report_url":  str,   # direct SP URL for display/download
                "drive_item_id": str,
                "size": int,
            }
        """
        # Normalise audit_type to uppercase so folder is always STAR/ or DEX/
        folder = audit_type.upper()
        self._ensure_audit_type_folder(folder)

        drive    = self._get_drive_id()
        endpoint = (
            f"https://graph.microsoft.com/v1.0/"
            f"drives/{drive}/root:/{folder}/{file_name}:/content"
        )

        print(f"[Summary] Uploading: {folder}/{file_name} ({len(file_content)} bytes)")
        graph_resp = self.graph.put_bytes(endpoint, file_content, content_type=content_type)

        # Build a clean direct URL (not the _layouts redirect)
        raw_url     = graph_resp.get("webUrl", "")
        site_base   = settings.SHAREPOINT_SITE_URL.rstrip("/")
        direct_url  = (
            f"{site_base}"
            f"/{quote(self.library_name, safe='')}"
            f"/{quote(folder, safe='')}"
            f"/{quote(file_name, safe='')}"
        )
        # Fall back to Graph's webUrl if we couldn't build the direct one
        report_url  = direct_url if site_base else raw_url

        result = {
            "report_name":   graph_resp.get("name", file_name),
            "report_url":    report_url,
            "drive_item_id": graph_resp.get("id"),
            "size":          graph_resp.get("size", len(file_content)),
        }
        print(f"[Summary] Uploaded: {result['report_url']}")
        return result

"""
NewsletterLibraryService — lists all PDF files inside the newsletters
SharePoint folder (configured via SHAREPOINT_NEWSLETTERS_URL).
Returns [{name, web_url, download_url, last_modified}, ...] sorted newest first.
"""
# ══════════════════════════════════════════════════════════════════════════════
# 3. NewsletterLibraryService  (list newsletter PDFs from SharePoint folder)
# ══════════════════════════════════════════════════════════════════════════════

class NewsletterLibraryService:
    """
    Lists all PDF files in the SharePoint newsletters folder.

    The folder URL is taken from SHAREPOINT_NEWSLETTERS_URL env var.
    Files are returned sorted newest-first by lastModifiedDateTime.

    Each entry:
        {
            "name":          str,   # file name, e.g. "Newsletter_Edition_5.pdf"
            "web_url":       str,   # direct browser-openable URL
            "download_url":  str,   # pre-authenticated download URL (short-lived)
            "last_modified": str,   # ISO 8601 datetime string
            "size":          int,   # bytes
        }
    """

    def __init__(self, graph: GraphClient):
        self.graph        = graph
        self.site_id      = settings.SHAREPOINT_SITE_ID
        self.folder_url   = settings.SHAREPOINT_NEWSLETTERS_URL
        self._drive_id:  str | None = None
        self._folder_id: str | None = None

    # ── Resolve the folder once, cache it ─────────────────────────────────────

    def _resolve_folder(self) -> tuple[str, str]:
        """Returns (drive_id, folder_item_id)."""
        if self._drive_id and self._folder_id:
            return self._drive_id, self._folder_id

        if not self.folder_url:
            raise ValueError(
                "SHAREPOINT_NEWSLETTERS_URL is not set. "
                "Add it to your .env file."
            )

        # Use Graph's sharing-link resolver to handle any SP URL format
        import base64
        encoded = base64.urlsafe_b64encode(self.folder_url.encode()).rstrip(b"=").decode()
        shares_url = f"https://graph.microsoft.com/v1.0/shares/u!{encoded}/driveItem"

        folder_item     = self.graph.get(shares_url)
        self._drive_id  = folder_item["parentReference"]["driveId"]
        self._folder_id = folder_item["id"]
        print(f"[Newsletters] Resolved folder: drive={self._drive_id} item={self._folder_id}")
        return self._drive_id, self._folder_id

    # ── List files ────────────────────────────────────────────────────────────

    def list_newsletters(self) -> list[dict]:
        """
        Returns all PDF files in the newsletter folder, newest first.
        Non-PDF files are silently skipped.
        """
        drive_id, folder_id = self._resolve_folder()

        results = []
        url: str | None = (
            f"https://graph.microsoft.com/v1.0/"
            f"drives/{drive_id}/items/{folder_id}/children"
            "?$select=name,webUrl,file,size,lastModifiedDateTime,@microsoft.graph.downloadUrl"
            "&$top=200"
        )

        while url:
            page = self.graph.get(url)
            for item in page.get("value", []):
                # Only PDFs
                mime = item.get("file", {}).get("mimeType", "")
                if mime != "application/pdf" and not item["name"].lower().endswith(".pdf"):
                    continue
                results.append({
                    "name":          item["name"],
                    "web_url":       item.get("webUrl", ""),
                    "download_url":  item.get("@microsoft.graph.downloadUrl", ""),
                    "last_modified": item.get("lastModifiedDateTime", ""),
                    "size":          item.get("size", 0),
                })
            url = page.get("@odata.nextLink")

        # Sort newest first
        results.sort(key=lambda x: x["last_modified"], reverse=True)
        print(f"[Newsletters] Found {len(results)} newsletter(s)")
        return results
