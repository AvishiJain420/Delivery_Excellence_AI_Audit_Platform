# It centralizes the Graph communication - authorization is to take place here
# | Method        | Purpose                                |
# | ------------- | ---------------------------------------|
# | get()       | Read Graph resources                     |
# | get_bytes() | Download files                           |
# | post()      | Search, create resources                 |
# | put()       | Generic JSON PUT                         |
# | put_bytes() | Upload Excel reports                     |
# | patch()     | Update SharePoint List (`ReportURL`)     |
# | delete()    | Future cleanup                           |


import requests
from sharepoint.auth import Authenticator

class GraphClient:

    def __init__(self):
        
        #it triggers auth function to post a request to the URL we mentioned in auth.py
        # we will store the access token sent by Microsoft
        token = Authenticator().get_access_token(
             "https://graph.microsoft.com/.default"
        )

        # Store authorization header
        # Graph API requires:
        # Authorization: Bearer <token>
        self.headers = {
            "Authorization" : f"Bearer {token}",
            "Accept" : "application/json"
        }

    # Generic GET request method 
    def get(self , url) ->  dict:

    #Call Graph API 
        response = requests.get(
            url,
            headers=self.headers,
            timeout=30
        )

        if not response.ok:
            print(f"ERROR {response.status_code} : {response.text}")

       #Raise error if request failed
        response.raise_for_status()

        #Convert JSON response to Python Dictionary
        return response.json()
    

    def get_bytes(self, url: str) -> bytes:
        """
        Binary GET request to Microsoft Graph.
        Used for: downloading raw file content.
        """
        print(f"  GET (bytes) {url}")

        response = requests.get(
            url,
            headers=self.headers,
            timeout=30
        )

        if not response.ok:
            print(f"  ERROR {response.status_code}: {response.text}")

        response.raise_for_status()

        return response.content


    def post(self, url: str, payload: dict) -> dict:
        """
        JSON POST request to Microsoft Graph.
        Used for: Search API, writing back to list items.
        """
        print(f"  POST {url}")

        headers = {
            **self.headers,
            "Content-Type": "application/json"
        }

        response = requests.post(
            url,
            headers=headers,
            json=payload,
            timeout=30
        )

        if not response.ok:
            print(f"  ERROR {response.status_code}: {response.text}")

        response.raise_for_status()

        return response.json()
    
    #A PUT request is an HTTP method used to create a new resource or replace an existing resource at a specified URL

    def put(
        self,
        url: str,
        payload: dict
    ) -> dict:
        """
        Generic JSON PUT request.

        Used for:
            - Future Graph resources
            - Metadata updates
        """

        print(f"  PUT {url}")

        headers = {
            **self.headers,
            "Content-Type": "application/json"
        }

        response = requests.put(
            url,
            headers=headers,
            json=payload,
            timeout=60
        )

        if not response.ok:
            print(
                f"  ERROR {response.status_code}: "
                f"{response.text}"
            )

        response.raise_for_status()

        if response.text:
            return response.json()

        return {}
    

    def put_bytes(
            self,
            url: str,
            content: bytes,
            content_type: str = (
                "application/octet-stream"
        )
        ) -> dict:
        """
        Binary PUT request.

        Used for:

            Uploading AI report files to SharePoint Document Libraries.

        Example:

        PUT
        /drive/root:/folder/file.xlsx:/content
        """

        print(f"  PUT (bytes) {url}")

        headers = {
            **self.headers,
            "Content-Type": content_type
        }

        response = requests.put(
            url,
            headers=headers,
            data=content,
            timeout=300
        )

        if not response.ok:

            print(
                f"  ERROR {response.status_code}: "
                f"{response.text}"
            )

        response.raise_for_status()

        return response.json()
    
    # Function we'll use to update the SharePoint list item with the ReportURL.

    def patch(
        self,
        url: str,
        payload: dict
    ) -> dict:
        """
        Generic PATCH request.
        Used for:
            Updating SharePoint List Items.

        Example:
            AI Report Link"""

        print(f"  PATCH {url}")

        headers = {
            **self.headers,
            "Content-Type": "application/json"
        }

        response = requests.patch(
            url,
            headers=headers,
            json=payload,
            timeout=60
        )

        if not response.ok:

            print(
                f"  ERROR {response.status_code}: "
                f"{response.text}"
            )

        response.raise_for_status()

        if response.status_code == 204:
            return {}

        if response.text:

            return response.json()

        return {}    
    
# Function to later replace and clean the sharepoint list url for report

    def delete(
        self,
        url: str
    ):
        """
        Generic DELETE request.

        Future use:

            Delete report

            Delete folders

            Cleanup old reports
        """

        print(f"  DELETE {url}")

        response = requests.delete(
            url,
            headers=self.headers,
            timeout=60
        )

        if not response.ok:

            print(
                f"  ERROR {response.status_code}: "
                f"{response.text}"
            )

        response.raise_for_status()

        return True