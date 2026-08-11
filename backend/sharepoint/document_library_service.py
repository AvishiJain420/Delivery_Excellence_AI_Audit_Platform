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