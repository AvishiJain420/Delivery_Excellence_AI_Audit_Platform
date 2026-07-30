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
        endpoint = f"https://graph.microsoft.com/v1.0/sites/{settings.SHAREPOINT_SITE_ID}/drives"
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
        print(json.dumps(fields, indent=2))   # ← was referencing undefined `payload`, use `fields`

        #-------Patch function in Power Apps is used to create, update, or merge records in a data source-----------
        self.graph.patch(endpoint, fields)
        print("SharePoint List updated.")

    # ==========================================================
    # UPDATE REPORT URL  ← NEW
    # ==========================================================

    def update_report_url(
        self,
        item_id: str,
        report_url: str,
    ):
        """
        Stores the uploaded AI Audit Report URL
        into the SharePoint Multiple Lines of Text column.
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
    # UPDATE STATUS
    # ==========================================================

    def update_status(
        self,
        item_id: str,
        status: str,
    ):
        """
        Updates AuditStatus field.
        Example values: Processing, Completed, Failed
        """
        payload = {"AuditStatus": status}
        self.update_fields(
            settings.SHAREPOINT_SITE_ID,
            settings.SHAREPOINT_LIST_ID,
            item_id,
            payload,
        )

    # #-------------Testing------------------
    # def test(self):
    #     columns = self.graph.get(
    #     f"https://graph.microsoft.com/v1.0/sites/{settings.SHAREPOINT_SITE_ID}/lists/{settings.SHAREPOINT_LIST_ID}/columns"
    #     )

    #     for col in columns["value"]:
    #         print(f"{col['displayName']} --> {col['name']}")