#--------AUDIT PIPELINE RUNS-----------
import asyncio
from pipeline.audit_pipeline import AuditPipeline

pipeline = AuditPipeline()

item_id = "68" #DEX - 71 , STAR= 68

asyncio.run(pipeline.run_full_pipeline(item_id))












# from langchain_openai import ChatOpenAI
# from config.settings import settings 

# import truststore
# truststore.inject_into_ssl()

# llm = ChatOpenAI(
#     base_url="https://openrouter.ai/api/v1",
#     api_key=settings.OPENROUTER_API_KEY,
#     model="openai/gpt-5.2",
#     max_tokens=256
# )

# from sharepoint.graph_client import GraphClient
# from sharepoint.list_service import SharePointListService
# graph = GraphClient()
# service = SharePointListService(graph)
# service.test()

# Run this once in a throwaway script — paste output here

# app.py — temporary diagnostic
# from sharepoint.sharepoint_service import SharePointService
# from config.settings import settings
# import json

# sp = SharePointService()

# # Get list column definitions, not item fields
# endpoint = (
#     f"https://graph.microsoft.com/v1.0/"
#     f"sites/{settings.SHAREPOINT_SITE_ID}/"
#     f"lists/{settings.SHAREPOINT_LIST_ID}/"
#     f"columns"
# )



# from sharepoint.sharepoint_service import SharePointService

# ITEM_ID = "68"

# REPORT_URL = (
#     "https://procdna.sharepoint.com/sites/1001VL0019/"
#     "AI%20Audit%20Reports/2026/Arthur%20AI%20reporting/STAR/"
#     "Arthur_AI_reporting_STAR_AI_Audit_Report_20260717_140502.xlsx"
# )

# sp = SharePointService()

# print("=" * 70)
# print("Testing SharePoint List Update")
# print("=" * 70)

# sp.list_service.update_report_url(
#     item_id=ITEM_ID,
#     report_url=REPORT_URL,
# )
