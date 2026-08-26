# Here we will be reading all the env variables which are essential for our sharepoint code , and all the other python modules will be receiving the env variables from here only

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parent.parent

class Settings(BaseSettings):
    #------App Registration-----------
    TENANT_ID: str
    CLIENT_ID: str
    CLIENT_SECRET: str
    
    AZURE_AD_REDIRECT_URI : str
    AZURE_AD_SCOPE : str


    #------SharePoint Details---------
    SHAREPOINT_SITE_ID:str
    SHAREPOINT_LIST_ID : str
    SHAREPOINT_SITE_URL : str
    SHAREPOINT_LIST_TITLE : str
    SHAREPOINT_TENANT_URL : str
    SHAREPOINT_REPORT_LIBRARY_NAME : str
    #--------Sharepoint REST API----------------
    SP_CERT_PRIVATE_KEY : str
    SP_CERT_THUMBPRINT_BASE64 : str

    #-------Azure Open AI---------------
    AZURE_OPENAI_API_KEY : str
    AZURE_OPENAI_ENDPOINT : str
    AZURE_OPENAI_MODEL : str
    OPENROUTER_API_KEY : str

    #-------Database--------------------
    DATABASE_URL : str    
    SUPABASE_SERVICE_ROLE_KEY : str
    SUPABASE_URL : str

    #-------Langfuse--------------------
    LANGFUSE_PUBLIC_KEY : str
    LANGFUSE_SECRET_KEY : str
    LANGFUSE_HOST : str

    #--------JWT - our application tokens------
    JWT_SECRET_KEY : str

    FRONTEND_ORIGIN : str

    model_config = SettingsConfigDict(
        env_file=ROOT_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()

