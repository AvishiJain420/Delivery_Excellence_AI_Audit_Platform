from sharepoint.graph_client import GraphClient
from config.settings import settings
import json


class SharePointListService:

    def __init__(self, graph: GraphClient):
        self.graph = graph

    def get_list_item(self, site_id, list_id, item_id):
        endpoint = (
            f"https://graph.microsoft.com/v1.0/"
            f"sites/{site_id}/"
            f"lists/{list_id}/"
            f"items/{item_id}"
            "?expand=fields"
        )
        return self.graph.get(endpoint)

    def get_all_items(self):
        endpoint = (
            "https://graph.microsoft.com/v1.0/"
            f"sites/{settings.SHAREPOINT_SITE_ID}/"
            f"lists/{settings.SHAREPOINT_LIST_ID}/"
            f"items?expand=fields"
        )
        return self.graph.get(endpoint)

    def get_item_raw(self, site_id, list_id, item_id):
        endpoint = (
            f"https://graph.microsoft.com/v1.0/"
            f"sites/{site_id}/"
            f"lists/{list_id}/"
            f"items/{item_id}"
        )
        return self.graph.get(endpoint)

    def get_drive_items(self):
        endpoint = (
            f"https://graph.microsoft.com/v1.0/"
            f"sites/{settings.SHAREPOINT_SITE_ID}/drives"
        )
        print(self.graph.get(endpoint))

    # ==========================================================
    # UPDATE LIST ITEM FIELDS
    # ==========================================================

    def update_fields(
        self,
        site_id: str,
        list_id: str,
        item_id: str,
        fields: dict,
    ):
        endpoint = (
            f"https://graph.microsoft.com/v1.0/"
            f"sites/{site_id}"
            f"/lists/{list_id}"
            f"/items/{item_id}"
            "/fields"
        )

        print("PATCH Payload:")
        print(json.dumps(fields, indent=2))

        self.graph.patch(endpoint, fields)

        print("SharePoint List updated.")

    # ==========================================================
    # UPDATE AI REPORT URL
    # ==========================================================

    def update_report_url(
        self,
        item_id: str,
        report_url: str,
    ):
        """
        Stores the uploaded AI Audit Report URL
        into the SharePoint AI Report Link column.
        """

        payload = {
            "AIReportLink": report_url
        }

        print("\nUpdating AI Report Link...")
        print(payload)

        self.update_fields(
            settings.SHAREPOINT_SITE_ID,
            settings.SHAREPOINT_LIST_ID,
            item_id,
            payload,
        )

        print("AI Report Link updated successfully.")

    # ==========================================================
    # RESOLVE SHAREPOINT COLUMN INTERNAL NAME
    # ==========================================================

    def _get_column_internal_name(
        self,
        display_name: str,
    ) -> str:
        """
        Resolve a SharePoint column's internal name
        from its display name.

        Example:

            Display name:
                Summary Report Link

            Internal name:
                Summary_x0020_Report_x0020_Link
        """

        endpoint = (
            f"https://graph.microsoft.com/v1.0/"
            f"sites/{settings.SHAREPOINT_SITE_ID}/"
            f"lists/{settings.SHAREPOINT_LIST_ID}/"
            "/columns"
        )

        response = self.graph.get(endpoint)

        for column in response.get("value", []):
            if (
                column.get("displayName", "").strip().lower()
                == display_name.strip().lower()
            ):
                internal_name = column.get("name")

                if internal_name:
                    print(
                        f"[SP] Resolved column "
                        f"'{display_name}' -> '{internal_name}'"
                    )
                    return internal_name

        raise ValueError(
            f"SharePoint column '{display_name}' was not found."
        )

    # ==========================================================
    # UPDATE MANUAL SUMMARY REPORT URL
    # ==========================================================

    def update_summary_report_url(
        self,
        item_id: str,
        report_url: str,
    ):
        """
        Stores the manually uploaded audit summary report URL
        in the SharePoint List column whose display name is:

            Summary Report Link
        """

        column_name = self._get_column_internal_name(
            "Summary Report Link"
        )

        payload = {
            column_name: report_url
        }

        print("\nUpdating Summary Report Link...")
        print(payload)

        self.update_fields(
            settings.SHAREPOINT_SITE_ID,
            settings.SHAREPOINT_LIST_ID,
            item_id,
            payload,
        )

        print("Summary Report Link updated successfully.")

    # ==========================================================
    # UPDATE STATUS
    # ==========================================================

    def update_status(
        self,
        item_id: str,
        status: str,
    ):
        """
        Updates AuditStatus field.

        Example values:
            Processing
            Completed
            Failed
        """

        payload = {
            "AuditStatus": status
        }

        self.update_fields(
            settings.SHAREPOINT_SITE_ID,
            settings.SHAREPOINT_LIST_ID,
            item_id,
            payload,
        )