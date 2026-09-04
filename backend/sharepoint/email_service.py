from sharepoint.graph_client import GraphClient
from config.settings import settings


class EmailService:

    def __init__(self, graph: GraphClient):
        self.graph = graph
        self.sender_email = settings.GRAPH_SENDER_EMAIL

    def send_email(
        self,
        recipient: str,
        subject: str,
        body: str,
    ) -> bool:

        endpoint = (
            "https://graph.microsoft.com/v1.0/"
            f"users/{self.sender_email}/sendMail"
        )

        payload = {
            "message": {
                "subject": subject,
                "body": {
                    "contentType": "HTML",
                    "content": body,
                },
                "toRecipients": [
                    {
                        "emailAddress": {
                            "address": recipient,
                        }
                    }
                ],
            }
        }

        self.graph.post(endpoint, payload)

        return True