"""
Audit Pipeline Orchestrator.
 
This is the single entry point the FastAPI layer (built later)
and any test scripts will call. It coordinates:
 
  1. Fetching project/audit details from SharePoint
  2. Identifying the audit framework (STAR or DEX) - instant, from list field
  3. Fetching documents (attachments for STAR, linked file for DEX)
  4. Parsing each document into a structured Document object
  5. Classifying each document's category via LLM
 
Each stage is exposed as its own method so the frontend can
request/display progress incrementally rather than waiting for
the entire pipeline to finish before showing anything.
"""

from __future__ import annotations
 
import asyncio
import os
 
from sharepoint.sharepoint_service import SharePointService
from document_parsers.parser_pipeline import parse_document
from agent.document import Document
from audit_framework.framework_fetcher import Framework_Fetcher
from agent.llm.documents_identifier import identify_documents as llm_identify
from agent.llm.documents_auditor import audit_document
from agent.llm.summary_generator import generate_combined_summary
from agent.validation.validation_hook import (
    ValidationCallback,
    CliValidationCallback,
    apply_corrections,
)
from agent.llm.excel_exporter import export_audit_to_excel
 
 
class AuditPipeline:
 
    def __init__(
        self,
        validation_callback: ValidationCallback | None = None,
    ) -> None:
        self.sharepoint = SharePointService()
        self._validation_callback = (
            validation_callback or CliValidationCallback()
        )
 
        self._raw_context: dict = {}
        self._audit_type: str = ""
        self._project_overview: dict = {}
        self._project_document_list: list[dict] = []
        self._framework_documents_list: list[dict] = []
        self._identified_documents: list[dict] = []
        self._filtered_framework: dict = {}
        self._parsed_documents: list[Document] = []
        self._individual_audits: list[dict] = []
        self._combined_summary: dict = {}
        self._audit_report_path: str | None = None
        self._audit_report_url: str | None = None
        self._audit_report_name: str | None = None
        self._audit_report_metadata: dict = {}


    def get_project_details(self, item_id : str) -> dict :

        context = self.sharepoint.get_audit_context(item_id)
        self._raw_context =  context

        documents_list = context.get("documents_list")

        overview={
            "item_id" : item_id,
            "client_name" : context.get("client_name"),
            "project_name": context.get("project_name"),
            "project_code": context.get("project_code"),
            "audit_type": context.get("audit_type"),
            "documents" : documents_list
        }

        self._audit_type = context.get("audit_type")
        self._project_document_list = documents_list
        self._project_overview = overview

        print("\n-----------Project Details-----------")
        print(f"\nProject : {overview['project_name']}")
        print(f"\nClient  : {overview['client_name']}")
        print(f"\nCode    : {overview['project_code']}")
        print(f"\nType    : {overview['audit_type']}")

        print(f"\nFound {len(documents_list)} document(s)")
        print("\n-----------Documents Found in Sharepoint------------")
        for d in documents_list:
            print(f"   -{d['name']}")

        return overview
    

# -----------FRAMEWORK DOCUMENTS-------------------
    def framework_document_list(self):

        framework_service = Framework_Fetcher(self._audit_type)  
        framework_documents_list = framework_service.fetch_audit_framework_documents_list()
        self._framework_documents_list = framework_documents_list
        return


#-----------Identification of documents using fuzzy logic and LLM

    async def identify_documents(self) -> list[dict]:
        """LLM identification followed by optional user correction."""
        print(f"\n{'='*60}")
        print("Identifying documents")
        print(f"{'='*60}")
 
        identified = llm_identify(
            documents=self._project_document_list,
            framework_checklist=self._framework_documents_list,
        )
 
        print("\nLLM identification results:")
        for doc in identified:
            status = "✓" if doc["confidence"] != "low" else "?"
            print(f"  {status} {doc['filename']} → {doc['matched_category']} "
                  f"({doc.get('confidence','?')})")
 
        validation = await self._validation_callback.validate(identified)
 
        if not validation.approved:
            raise RuntimeError("User rejected document identification. Pipeline stopped.")
 
        if validation.corrections:
            print("\nApplying user corrections:")
            identified = apply_corrections(identified, validation.corrections)
 
        self._identified_documents = identified
        return identified

#-----------------Function to fetch the filtered framework for the documents identified to be given to the LLM
    def filter_framework_for_llm(self) -> None:

        framework_service = Framework_Fetcher(self._audit_type)
        filtered_framework = framework_service.filter_framework(self._identified_documents)
        self._filtered_framework = filtered_framework

        # print(filtered_framework)


#---------------------------Parse each validated document into Document objects------------------------------------------
 
    def parse_documents(self) -> list[Document]:
        print(f"\n{'='*60}")
        print("Parsing documents")
        print(f"{'='*60}")

        audit_type = self._project_overview.get("audit_type", "")

        # ---------- STAR lookup ----------
        attachment_map: dict[str, dict] = {}
        if audit_type == "STAR":
            attachment_map = {
                a["name"]: a
                for a in self._raw_context.get("documents", [])
            }

        # ---------- DEX lookup ----------
        dex_document_map: dict[str, dict] = {}
        if audit_type == "DEX":
            dex_document_map = {
                d["name"]: d
                for d in self._raw_context.get("documents", [])
            }

        parsed: list[Document] = []

        for i, identified_doc in enumerate(self._identified_documents, 1):

            filename = identified_doc["filename"]
            category = identified_doc.get("matched_category", "Unclassified")

            print(f"\n[{i}/{len(self._identified_documents)}] {filename}  ({category})")

            try:

                # ---------------- STAR ----------------
                if audit_type == "STAR":

                    content_bytes = attachment_map.get(
                        filename, {}
                    ).get("content_bytes", b"")

                # ---------------- DEX ----------------
                elif audit_type == "DEX":

                    file_info = dex_document_map.get(filename)

                    if file_info:
                        print(f"  Downloading: {filename}")

                        content_bytes = self.sharepoint.dex_service.download_file(
                            file_info["download_url"]
                        )
                    else:
                        print(f"  WARNING: File not found in SharePoint folder")
                        content_bytes = b""

                else:
                    content_bytes = b""

                if not content_bytes:
                    print(f"  WARNING: no content for {filename}")
                    continue

                document_framework = self._filtered_framework.get(category, [])

                print(f"  Framework criteria: {len(document_framework)}")

                metadata = {
                    "item_id": self._project_overview.get("item_id"),
                    "source": identified_doc.get("source", "SharePoint"),
                    "url": identified_doc.get("url", ""),
                    "matched_category": category,
                    "audit_type": audit_type,
                    "framework": document_framework,
                }

                doc = parse_document(
                    content_bytes,
                    filename,
                    metadata,
                )

                print(
                    f"  ✓ Text: {len(doc.text)} chars | "
                    f"Tables: {len(doc.tables)} | "
                    f"Images: {len(doc.images)} | "
                    f"Sequence: {len(doc.content_sequence)}"
                )

                parsed.append(doc)

            except Exception as exc:

                print(f"  ERROR parsing {filename}: {exc}")

                parsed.append(
                    Document(
                        id=filename,
                        filename=filename,
                        file_type="unknown",
                        metadata={
                            "item_id": self._project_overview.get("item_id"),
                            "matched_category": category,
                            "framework": self._filtered_framework.get(category, []),
                        },
                        parse_error=str(exc),
                    )
                )

        self._parsed_documents = parsed

        print(f"\nTotal parsed: {len(parsed)}")

        return parsed

#------------------Function to audit documents--------------------        

    def audit_documents(self) -> list[dict]:
        print(f"\n{'='*60}")
        print("Auditing documents")
        print(f"{'='*60}")
 
        results: list[dict] = []
        for i, doc in enumerate(self._parsed_documents, 1):
            print(f"\n[{i}/{len(self._parsed_documents)}] {doc.filename}")
            if doc.parse_error:
                print(f"  SKIPPED — parse error: {doc.parse_error}")
                results.append({
                    "filename": doc.filename,
                    "matched_category": doc.metadata.get("matched_category", "Unknown"),
                    "audit_results": [], "overall_score": 0,
                    "summary": f"Document could not be parsed: {doc.parse_error}",
                    "error": doc.parse_error,
                })
                continue
 
            framework = doc.metadata.get("framework", [])
            print(f"  Category : {doc.metadata.get('matched_category')}")
            print(f"  Criteria : {len(framework)}")
            result = audit_document(document=doc)
            results.append(result)
            print(f"  ✓ Score: {result.get('overall_score', 'N/A')}/5")
 
        self._individual_audits = results
        print(f"\nAudited {len(results)} document(s)")
        return results
 


    def combined_summary(self) -> dict:
        print(f"\n{'='*60}")
        print("Generating combined cross-document summary")
        print(f"{'='*60}")
        summary = generate_combined_summary(
            individual_audits=self._individual_audits,
            project_overview=self._project_overview,
            audit_type=self._project_overview.get("audit_type", ""),
        )
        self._combined_summary = summary
        print(f"Overall project score: {summary.get('overall_project_score', 'N/A')}/5")
        return summary
 


    def export_audit_report(self) -> str:
        print(f"\n{'='*60}")
        print("Exporting Audit Report to Excel")
        print(f"{'='*60}")
        if not self._project_overview:
            raise RuntimeError("Project overview is missing.")
        if not self._individual_audits:
            raise RuntimeError("Individual audit results are empty.")
        if not self._combined_summary:
            self._combined_summary = {
                "executive_summary": "No combined summary generated.",
                "overall_findings": [], "strengths": [], "risks": [],
                "recommendations": [], "cross_document_findings": [],
            }
        output_directory = os.path.join(os.getcwd(), "audit_reports")
        report_path = export_audit_to_excel(
            project_overview=self._project_overview,
            individual_audits=self._individual_audits,
            combined_summary=self._combined_summary,
            output_directory=output_directory,
        )
        print(f"  ✓ Report: {report_path}")
        self._audit_report_path = report_path
        return report_path
 

    # def upload_audit_report(self) -> dict:

    #     print(f"\n{'='*60}")
    #     print("Uploading Audit Report to SharePoint")
    #     print(f"{'='*60}")
    #     if not self._audit_report_path:
    #         raise RuntimeError("Excel report not generated yet.")
        
    #     upload_result = self.sharepoint.upload_audit_report(
    #         item_id=self._project_overview["item_id"],
    #         local_report_path=self._audit_report_path,
    #         project_name=self._project_overview["project_name"],
    #         audit_type=self._project_overview["audit_type"],
    #     )
    #     self._audit_report_metadata = upload_result
    #     self._audit_report_url = upload_result["report_url"]
    #     self._audit_report_name = upload_result["report_name"]
    #     print(f"✓ Uploaded: {self._audit_report_url}")
    #     return upload_result

    def upload_audit_report(self) -> dict:

        import os

        print(f"\n{'='*60}")
        print("Uploading Audit Report to SharePoint")
        print(f"{'='*60}")

        if not self._audit_report_path:
            raise RuntimeError(
                "Excel report not generated yet."
            )

        # Keep the path in a local variable because
        # the temporary file will be deleted after upload.
        local_report_path = self._audit_report_path

        # Upload the Excel file to SharePoint.
        # If this fails, an exception is raised and the
        # local file is NOT deleted.
        upload_result = self.sharepoint.upload_audit_report(
            item_id=self._project_overview["item_id"],
            local_report_path=local_report_path,
            project_name=self._project_overview["project_name"],
            audit_type=self._project_overview["audit_type"],
        )

        # The upload succeeded, so the temporary local
        # Excel file is no longer needed.
        if os.path.isfile(local_report_path):
            os.remove(local_report_path)

            print(
                "✓ Temporary local audit report deleted: "
                f"{local_report_path}"
            )

        # Save the SharePoint report metadata in memory.
        self._audit_report_metadata = upload_result
        self._audit_report_url = upload_result["report_url"]
        self._audit_report_name = upload_result["report_name"]

        print(
            f"✓ Uploaded: "
            f"{self._audit_report_url}"
        )
        return upload_result
 
#--------------Final function to run all above functions
    async def run_full_pipeline(self, item_id: str) -> dict:
        """
        Run all stages in sequence.
 
        identify_documents() contains an async validation step,
        so the whole pipeline is async.
 
            asyncio.run(pipeline.run_full_pipeline("42"))   # script
            await pipeline.run_full_pipeline("42")           # FastAPI
        """
        overview = self.get_project_details(item_id)
        self.framework_document_list()
        identified = await self.identify_documents()
        self.filter_framework_for_llm()
        parsed = self.parse_documents()
        audits = self.audit_documents()
        summary = self.combined_summary()
        report_path = self.export_audit_report()
        upload = self.upload_audit_report()
 
        return {
            "project_overview": overview,
            "identified_documents": identified,
            "parsed_documents": parsed,
            "individual_audits": audits,
            "combined_summary": summary,
            "excel_report": {
                "local_path": report_path,
                "report_name": upload["report_name"],
                "report_url": upload["report_url"],
                "drive_item_id": upload["drive_item_id"],
            },
        }
    
