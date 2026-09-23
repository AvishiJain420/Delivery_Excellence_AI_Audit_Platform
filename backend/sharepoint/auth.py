# sharepoint_auth.py
# Responsible for Graph Token Generation

import requests
from config.settings import settings
import time
import uuid
import threading
import jwt as pyjwt


class Authenticator:

    # --- In-memory token cache (per-instance, thread-safe) ---
    _lock = threading.Lock()

    _graph_token: str | None = None
    _graph_token_expiry: float = 0.0

    _sp_token: str | None = None
    _sp_token_expiry: float = 0.0

    _TOKEN_BUFFER_SECONDS: int = 60   # refresh 60s before actual expiry

    # ---------------------------------------------------------

    def get_access_token(self, scope: str) -> str:
        now = time.time()

        with self._lock:
            # Return cached token if still fresh
            if (
                self._graph_token
                and now < self._graph_token_expiry - self._TOKEN_BUFFER_SECONDS
            ):
                print("Returning cached Graph token")
                return self._graph_token

            # Cache miss — fetch a new one
            token = self._fetch_graph_token(scope)

            # Decode expiry directly from the JWT (no extra network call)
            try:
                claims = pyjwt.decode(
                    token, options={"verify_signature": False}
                )
                self._graph_token_expiry = float(claims.get("exp", now + 3600))
            except Exception:
                self._graph_token_expiry = now + 3600   # fallback: 1-hour TTL

            self._graph_token = token
            return self._graph_token

    def _fetch_graph_token(self, scope: str) -> str:
        """Actual HTTP call — only runs on cache miss."""
        token_url = (
            f"https://login.microsoftonline.com/"
            f"{settings.TENANT_ID}/oauth2/v2.0/token"
        )
        payload = {
            "client_id":     settings.CLIENT_ID,
            "client_secret": settings.CLIENT_SECRET,
            "scope":         scope,
            "grant_type":    "client_credentials",
        }

        print("Requesting Graph token from Microsoft...")
        response = requests.post(token_url, data=payload, timeout=(10, 20))
        response.raise_for_status()
        print(f"Graph token received ({response.status_code})")

        return response.json()["access_token"]

    # ---------------------------------------------------------

    def get_sharepoint_token(self) -> str:
        now = time.time()

        with self._lock:
            # Return cached token if still fresh
            if (
                self._sp_token
                and now < self._sp_token_expiry - self._TOKEN_BUFFER_SECONDS
            ):
                print("Returning cached SharePoint token")
                return self._sp_token

            # Cache miss — fetch a new one
            token = self._fetch_sharepoint_token()

            try:
                claims = pyjwt.decode(
                    token, options={"verify_signature": False}
                )
                self._sp_token_expiry = float(claims.get("exp", now + 3600))
            except Exception:
                self._sp_token_expiry = now + 3600

            self._sp_token = token
            return self._sp_token

    def _fetch_sharepoint_token(self) -> str:
        """Actual HTTP call — only runs on cache miss."""
        tenant_id = settings.TENANT_ID
        client_id = settings.CLIENT_ID
        token_url = (
            f"https://login.microsoftonline.com/{tenant_id}/oauth2/token"
        )

        now = int(time.time())
        assertion_payload = {
            "iss": client_id,
            "sub": client_id,
            "aud": token_url,
            "iat": now,
            "exp": now + 300,
            "jti": str(uuid.uuid4()),
        }

        private_key = self._load_private_key()

        client_assertion = pyjwt.encode(
            assertion_payload,
            private_key,
            algorithm="RS256",
            headers={"x5t": settings.SP_CERT_THUMBPRINT_BASE64},
        )

        payload = {
            "client_id":             client_id,
            "resource":              "https://procdna.sharepoint.com",
            "grant_type":            "client_credentials",
            "client_assertion_type": (
                "urn:ietf:params:oauth:client-assertion-type:jwt-bearer"
            ),
            "client_assertion":      client_assertion,
        }

        r = requests.post(token_url, data=payload, timeout=(10, 20))
        if not r.ok:
            print("TOKEN ERROR:", r.status_code, r.text)
        r.raise_for_status()

        return r.json()["access_token"]

    @staticmethod
    def _load_private_key() -> bytes:
        """Normalise PEM key from settings (handles escaped newlines & quotes)."""
        key = settings.SP_CERT_PRIVATE_KEY.strip()
        if len(key) >= 2 and key[0] == '"' and key[-1] == '"':
            key = key[1:-1]
        return key.replace("\\n", "\n").strip().encode()