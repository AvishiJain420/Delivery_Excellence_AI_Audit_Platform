from langfuse.langchain import CallbackHandler
from langfuse import Langfuse
from config.settings import settings

langfuse = Langfuse(
    public_key=settings.LANGFUSE_PUBLIC_KEY,
    secret_key=settings.LANGFUSE_SECRET_KEY,
    host=settings.LANGFUSE_HOST,
)

langfuse_handler = CallbackHandler()


def get_langfuse_handler():
    """
    Returns Langfuse callback handler
    for LangChain executions
    """
    return langfuse_handler


def get_langfuse():
    return langfuse


def flush_langfuse():
    """
    Flush pending traces
    """
    langfuse.flush()