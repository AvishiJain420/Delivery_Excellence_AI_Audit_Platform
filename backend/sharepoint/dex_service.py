import requests
import base64
import urllib.parse
from bs4 import BeautifulSoup

from sharepoint.graph_client import GraphClient
from config.settings import settings

class DExDocumentService:

    def __init__(self, graph: GraphClient):
        self.graph = graph

    def parse_sharepoint_link(self, raw_html: str) -> dict:
        """
        Parses the SharePoint Rich Text column and extracts:

        1. Absolute SharePoint URL
        2. Server-relative folder path
        """

        if not raw_html:
            raise ValueError("SharePoint Link field is empty.")

        soup = BeautifulSoup(raw_html, "html.parser")

        anchor = soup.find("a")

        if anchor is None:
            raise ValueError("No hyperlink found in SharePoint Link field.")

        href = anchor.get("href")

        if not href:
            raise ValueError("Hyperlink does not contain href.")

        # Convert relative URL into absolute URL
        if href.startswith("/"):

            tenant = settings.SHAREPOINT_TENANT_URL.rstrip("/")

            href = f"{tenant}{href}"

        parsed = urllib.parse.urlparse(href)

        params = urllib.parse.parse_qs(parsed.query)

        folder_path = None

        if "id" in params:
            folder_path = urllib.parse.unquote(params["id"][0])

        return {
            "sharepoint_url": href,
            "folder_path": folder_path
        }


    def _resolve_folder_item(self, sharepoint_url: str) -> dict:
        """
        Converts a SharePoint folder URL into a Graph driveItem reference
        (gives us driveId + itemId needed to list its contents).
        """
        encoded = base64.urlsafe_b64encode(
            sharepoint_url.encode()
        ).decode().rstrip("=")
        share_token = f"u!{encoded}"

        meta_url = f"https://graph.microsoft.com/v1.0/shares/{share_token}/driveItem"
        print("Resolving SharePoint folder via Graph...")
        return self.graph.get(meta_url)


    def list_folder_files(self, sharepoint_url: str, recursive: bool = True) -> list[dict]:
        """
        Lists all files inside a SharePoint folder (given its sharing URL).
        Returns flat list of file metadata: name, download_url, id.
        Skips sub-folders unless recursive=True, in which case it walks in.
        """
        folder_item = self._resolve_folder_item(sharepoint_url)
        drive_id = folder_item["parentReference"]["driveId"]
        item_id = folder_item["id"]

        return self._list_children(drive_id, item_id, recursive)

    def _list_children(self, drive_id: str, item_id: str, recursive: bool) -> list[dict]:
        children_url = (
            f"https://graph.microsoft.com/v1.0/"
            f"drives/{drive_id}/items/{item_id}/children"
        )

        results = []
        url = children_url

        while url:
            page = self.graph.get(url)

            for child in page.get("value", []):
                if "file" in child:
                    results.append({
                        "name": child["name"],
                        "id": child["id"],
                        "download_url": child.get("@microsoft.graph.downloadUrl"),
                        "drive_id": drive_id
                    })
                elif "folder" in child and recursive:
                    print(f"  Entering subfolder: {child['name']}")
                    results.extend(
                        self._list_children(drive_id, child["id"], recursive)
                    )

            url = page.get("@odata.nextLink")  # pagination, in case folder has many files

        return results

    def download_file(self, download_url: str) -> bytes:
        print("Downloading DEX document...")
        response = requests.get(download_url, timeout=30)
        response.raise_for_status()
        return response.content