# Responsible for Graph Token Generation

import requests
from config.settings import settings
import time
import uuid
import jwt as pyjwt  # PyJWT, same package you already use


# Get an access token from Microsoft so that our application is allowed to call Graph API
#without a token, Microsoft Graph will reject every request
class Authenticator:

    def get_access_token(
            self,
            scope
            ):

        #Microsoft OAuth endpoint - every Azure tenant has its own endpoint
        token_url=(
            f"https://login.microsoftonline.com/"
            f"{settings.TENANT_ID}/oauth2/v2.0/token"
        )

        payload = {
            #Application id
            "client_id" : settings.CLIENT_ID,
            #Secret generated during App registration
            "client_secret" : settings.CLIENT_SECRET,

            #Request permissions assigned to Graph API
            # "scope": "https://graph.microsoft.com/.default",
            "scope" : scope,

            #Client credentials flow - no user login required -App authenticates itself
            "grant_type" : "client_credentials"
        }

        print("Requesting Graph token from Microsoft ...")

        response = requests.post(
            token_url,
            data=payload,
            timeout=60
        ) #sending a post request to microsoft

        response.raise_for_status() #if request fails ,we raise an exception

        print("Graph Token received")
 # Microsoft returns JSON like:
        #
        # {
        #   "token_type": "Bearer",
        #   "expires_in": 3599,
        #   "access_token": "eyJ..."
        # }
        #
        # Extract only access_token
        print(response.status_code)
        return response.json()["access_token"]
    

    def get_sharepoint_token(self):
        tenant_id = settings.TENANT_ID
        client_id = settings.CLIENT_ID
        token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/token"

        # Build and sign the client assertion JWT using the certificate
        now = int(time.time())
        assertion_payload = {
            "iss": client_id,
            "sub": client_id,
            "aud": f"https://login.microsoftonline.com/{tenant_id}/oauth2/token",
            "iat": now,
            "exp": now + 300,
            "jti": str(uuid.uuid4())
        }

        SP_CERT_PRIVATE_KEY = settings.SP_CERT_PRIVATE_KEY.replace("\\n", "\n")
        private_key = SP_CERT_PRIVATE_KEY.encode()

        client_assertion = pyjwt.encode(
            assertion_payload,
            private_key,
            algorithm="RS256",
            headers={"x5t": settings.SP_CERT_THUMBPRINT_BASE64}  # base64 (not hex) thumbprint
        )

        # f"{settings.SHAREPOINT_TENANT_URL}/.default"
        payload = {
            "client_id": client_id,
            "resource": "https://procdna.sharepoint.com",   # v1.0 uses "resource", not "scope"
            "grant_type": "client_credentials",
            "client_assertion_type": "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
            "client_assertion": client_assertion
        }

        # print("PAYLOAD SCOPE:", payload.get("scope"))
        # print("PAYLOAD KEYS:", list(payload.keys()))
   
        r = requests.post(token_url, data=payload, timeout=30)
        if not r.ok:
            print("TOKEN ERROR:", r.status_code, r.text)   # <-- add this
        r.raise_for_status()

        return r.json()["access_token"]