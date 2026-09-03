# import requests
# import jwt
# from sharepoint.auth import Authenticator
# from config.settings import settings


# class AttachmentService:

#     def __init__(self, graph=None):
#         #here we dont need Graph client , ACS token wll be used for REST
#         self.auth = Authenticator()
#         self.site_url = settings.SHAREPOINT_SITE_URL
#         self.list_title =  settings.SHAREPOINT_LIST_TITLE

#     def get_item_attachments(self, item_id: str) -> list[dict]:
#         """
#        Fetches attacments from a Sharepoint Custom List Item using Sharepoint REST API with ACS access token
#         """

#         token = self.auth.get_sharepoint_acs_token()

# #-------------Testing------------------
#         claims = jwt.decode(token , options={"verify_signature" : False})
#         print(claims)
#         print("Token exists:", token is not None)
#         print("Token length:", len(token) if token else 0)
#         print("Token prefix:", token[:40] if token else None)
# #-------------------------------------------------------------------------

#         headers = {
#             "Authorization" : f"Bearer {token}",
#             "Accept" : "application/json;odata=verbose"
#         }

#         # Step 1: Get list of attachment file names + relative URLs
#         list_url = (
#             f"{self.site_url}/_api/web/"
#             f"lists/getbytitle('{self.list_title}')/"
#             f"items({item_id})/AttachmentFiles"
#         )

#         print(f"Fetching attachments for item {item_id}...")
#         r = requests.get(list_url, headers=headers, timeout=30)

#         if not r.ok:
#             print(f"AttachmentFiles error {r.status_code}: {r.text}")
#             r.raise_for_status()

#         files = r.json().get("d", {}).get("results", [])
#         print(f"Found {len(files)} attachment(s)")

#         results = []
#         for f in files:
#             name = f.get("FileName")
#             server_relative_url = f.get("ServerRelativeUrl")

#             print(f"  Downloading: {name}")

#             # Step 2: Download each file's raw content
#             download_url = (
#                 f"{self.site_url}/_api/web/"
#                 f"getfilebyserverrelativeurl('{server_relative_url}')/$value"
#             )

#             content = requests.get(
#                 download_url,
#                 headers=headers,
#                 timeout=30
#             )
#             content.raise_for_status()

#             results.append({
#                 "name":          name,
#                 "url":           f"{self.site_url}{server_relative_url}",
#                 "content_bytes": content.content
#             })

#         return results

import requests

import jwt

from sharepoint.auth import Authenticator

from config.settings import settings
 
 
class AttachmentService:
 
    def __init__(self):

        self.auth = Authenticator()

        self.site_url = settings.SHAREPOINT_SITE_URL

        self.list_title = settings.SHAREPOINT_LIST_TITLE
 

    def get_item_attachments(self, item_id: str):
 
        # ---------------- TOKEN ----------------

        token = self.auth.get_sharepoint_token()
        claims = jwt.decode(token, options={"verify_signature": False})
        # print("AUD:", claims.get("aud"))
        # print("APP ID:", claims.get("appid"))
        # print("ROLES:", claims.get("roles"))
 
        headers = {

            "Authorization": f"Bearer {token}",

            "Accept": "application/json;odata=nometadata"

        }
 
        # ---------------- LIST ATTACHMENTS ----------------

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

            name = f["FileName"]

            rel_url = f["ServerRelativeUrl"]
 
            download_url = (

                f"{self.site_url}/_api/web/"

                f"getfilebyserverrelativeurl('{rel_url}')/$value"

            )
 
            file_resp = requests.get(download_url, headers=headers, timeout=30)

            file_resp.raise_for_status()
 
            results.append({

                "name": name,

                "content_bytes": file_resp.content,

                "url": f"{self.site_url}{rel_url}"

            })
 
        return results


    def upload_attachments_for_item(
    self,
    item_id: str,
    files: list[tuple[str, bytes, str]],  # (filename, content_bytes, mime_type)
    ) -> list[dict]:
        """
        Upload in-memory files as SharePoint list item attachments.
        Uses the existing ACS token flow your AttachmentService already has.
        Returns list of {"file_name", "attachment_url"} per file.
        """
        results = []
        for file_name, content_bytes, mime_type in files:
            try:
                url = self.upload_attachment(
                    item_id=item_id,
                    file_name=file_name,
                    file_content=content_bytes,
                )
                results.append({"file_name": file_name, "attachment_url": url})
                print(f"[SP] Attached {file_name} to item {item_id}")
            except Exception as exc:
                print(f"[SP] Attachment failed for {file_name}: {exc}")
                results.append({"file_name": file_name, "attachment_url": None})
        return results
    