# Responsible for Graph Token Generation

import requests
import msal
from config.settings import settings
import time
import uuid
import jwt as pyjwt  # PyJWT, same package you already use


# Get an access token from Microsoft so that our application is allowed to call Graph API
#without a token, Microsoft Graph will reject every request
class Authenticator:

    _msal_app = msal.ConfidentialClientApplication(
        client_id=settings.CLIENT_ID,
        authority=f"https://login.microsoftonline.com/{settings.TENANT_ID}",
        client_credential=settings.CLIENT_SECRET,
    )

    def get_access_token(
        self,
        scope="https://graph.microsoft.com/.default"
    ):
        result = self._msal_app.acquire_token_for_client(
            scopes=[scope]
        )

        if "access_token" not in result:
            raise RuntimeError(
                f"Could not acquire Graph token: "
                f"{result.get('error')} - "
                f"{result.get('error_description')}"
            )
        print("Test Push")
        return result["access_token"]
    

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

        SP_CERT_PRIVATE_KEY = settings.SP_CERT_PRIVATE_KEY.strip()

        # Remove surrounding quotes if they were included by the environment.
        if (
            len(SP_CERT_PRIVATE_KEY) >= 2
            and SP_CERT_PRIVATE_KEY[0] == '"'
            and SP_CERT_PRIVATE_KEY[-1] == '"'
        ):
            SP_CERT_PRIVATE_KEY = SP_CERT_PRIVATE_KEY[1:-1]

        SP_CERT_PRIVATE_KEY = SP_CERT_PRIVATE_KEY.replace("\\n", "\n").strip()
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
   
        r = requests.post(token_url, data=payload, timeout=(10,20))
        if not r.ok:
            print("TOKEN ERROR:", r.status_code, r.text)   # <-- add this
        r.raise_for_status()

        return r.json()["access_token"]