import re
from urllib.parse import urlparse
from config.settings import settings
from sharepoint.graph_client import GraphClient
from sharepoint.star_service import AttachmentService
from sharepoint.list_service import SharePointListService
from sharepoint.dex_service import DExDocumentService
from sharepoint.document_library_service import DocumentLibraryService

# Document library -----> Upload excel
# List Service ------> Update ReportURL
class SharePointService:

    def __init__(self):
        # One shared Graph client for list metadata + DEX flow
        graph = GraphClient()
        self.graph = graph
        self.list_service       = SharePointListService(graph)
        self.attachment_service = AttachmentService()       # uses ACS, no graph
        self.dex_service        = DExDocumentService(graph)
        self.document_library_service = DocumentLibraryService(graph)

    @staticmethod
    def _normalize_sharepoint_link(raw_link) -> str:
        """
        Normalize a SharePoint link coming from a multi-line text field.

        The value may be:
        - A normal URL
        - A URL surrounded by whitespace
        - An HTML anchor tag
        - Plain text containing a SharePoint URL
        """

        if raw_link is None:
            raise ValueError(
                "SharepointLink field is empty. "
                "Please provide the SharePoint folder link."
            )

        link = str(raw_link).strip()

        if not link:
            raise ValueError(
                "SharepointLink field is empty. "
                "Please provide the SharePoint folder link."
            )

        print(f"Raw SharepointLink value: {repr(link)}")

        # --------------------------------------------------
        # Case 1: Already a normal URL
        # --------------------------------------------------
        if link.startswith(("http://", "https://")):
            parsed = urlparse(link)

            if parsed.scheme and parsed.netloc:
                return link

        # --------------------------------------------------
        # Case 2: HTML anchor
        # Example:
        # <a href="https://tenant.sharepoint.com/...">...</a>
        # --------------------------------------------------
        href_match = re.search(
            r'href=["\'](https?://[^"\']+)["\']',
            link,
            re.IGNORECASE,
        )

        if href_match:
            normalized = href_match.group(1).strip()
            print(f"Extracted URL from HTML: {normalized}")
            return normalized

        # --------------------------------------------------
        # Case 3: Plain text containing a URL
        # --------------------------------------------------
        url_match = re.search(
            r'https?://[^\s<>"\']+',
            link,
            re.IGNORECASE,
        )

        if url_match:
            normalized = url_match.group(0).rstrip(".,);")
            print(f"Extracted URL from text: {normalized}")
            return normalized

        # --------------------------------------------------
        # Nothing usable found
        # --------------------------------------------------
        raise ValueError(
            f"SharepointLink does not contain a valid URL. "
            f"Received value: {repr(link)}"
        )

    
    def get_audit_context(self, item_id: str) -> dict:

        print(f"\nFetching SharePoint item: {item_id}")

        record = self.list_service.get_list_item(
            settings.SHAREPOINT_SITE_ID,
            settings.SHAREPOINT_LIST_ID,
            item_id
        )

        fields     = record.get("fields", {})
        audit_type = fields.get("AuditType", "")

        print(f"Audit Type: {audit_type}")

        # ── STAR: fetch physical attachments via SharePoint REST + ACS token
        if audit_type.upper() == "STAR":

            print("STAR framework detected")

            attachments = self.attachment_service.get_item_attachments(
                item_id
            )

            # Filter the attachments which start with "AUDITOR_REPORT"
            filtered_attachments = []

            for attachment in attachments:
                filename = attachment["name"]
                if filename.upper().startswith("AUDITOR_REPORT"):
                    print(
                        f"Skipping previous audit report: {filename}"
                    )
                    continue

                filtered_attachments.append(attachment)    
        
            doc_list =[
                {"name" : d["name"],"source" : "attachment"}
                for d in filtered_attachments
            ]

            attachments = filtered_attachments

            return {
                "client_name":  fields.get("ClientName"),
                "project_name": fields.get("ProjectName"),
                "project_code": fields.get("ProjectCode"),
                "audit_type":   audit_type,
                "documents_list" : doc_list,
                "documents":    attachments  # list of {name, url, content_bytes}
            }

# in case of DEx , no AUDITOR_REPORT would be present in the sharepoint location
        elif audit_type.upper() == "DEX":
            print("DEx framework detected")

            raw_link = fields.get("ShrepointLink")
            parsed = self.dex_service.parse_sharepoint_link(raw_link)

            # NEW: actually list files inside the folder
            files = self.dex_service.list_folder_files(parsed["sharepoint_url"])

            doc_list = [
                {"name": f["name"], "source": "sharepoint_folder"}
                for f in files
            ]

            return {
                "client_name":     fields.get("ClientName"),
                "project_name":    fields.get("ProjectName"),
                "project_code":    fields.get("ProjectCode"),
                "audit_type":      audit_type,
                "documents_list":  doc_list,
                "sharepoint_link": parsed["sharepoint_url"],
                "folder_path":     parsed["folder_path"],
                "documents":       files   # includes download_url + drive_id if you need to fetch content later
            }

        else:
            raise ValueError(f"Unsupported audit type: {audit_type}")

#-----------------------------Testing codes only ------------------------------
    def get_list_items(self):
        print("Get all items from the list")
        record = self.list_service.get_all_items()
        print(record)

    def get_drive_items(self):
        print("Get all drive items from the list")
        record = self.list_service.get_drive_items()
        print(record)

#---------------code for uploading the Audit report create to the Document library in sharepoint and sharing the final report url from there
    # ==========================================================
    # AUDIT REPORT
    # ==========================================================

    def upload_audit_report(
        self,
        item_id: str,
        local_report_path: str,
        project_name: str,
        audit_type: str,
    ) -> dict:
        """
        Upload Excel report to SharePoint Document Library.

        Then

        Update SharePoint List

        ReportURL column.

        Returns

        {

            report_name,

            report_url,

            drive_item_id,

            local_path,

            size

        }

        """

        print("\n" + "=" * 60)

        print("Uploading Final Audit Report")

        print("=" * 60)

        upload_result = (

            self.document_library_service.upload_audit_report(

                local_file_path=local_report_path,

                project_name=project_name,

                audit_type=audit_type,

            )

        )

        report_url = upload_result["report_url"]

        self.list_service.update_report_url(

            item_id,

            report_url,

        )

        print()

        print("Report successfully uploaded.")

        print(

            f"URL : "

            f"{report_url}"

        )

        return upload_result