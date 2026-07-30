"""
This python notebook will act as a link between LLM calls and the application to fetch the relevant information to and from the LLM via the application
"""

from collections import defaultdict
from typing import Dict, List

from audit_framework.framework_loader import (get_framework)

class Framework_Fetcher:

    #-----------Function to fetch the overall framework and documents list based on audit type we get from the audit pipeline
    def __init__(self,audit_type : str):
        self.framework, self.documents_list = get_framework(audit_type)


    def fetch_audit_framework_documents_list(self):
        print("\nSuccessfully fetched the documents list from framework")
        return self.documents_list


    #---------This function is to filter the framework to contain only the docs we have identified as per the user validation

    def filter_framework(
        self,
        identified_documents: List[dict],
    ) -> Dict[str, List[dict]]:
        """
        Filters the framework based on the document categories identified
        from SharePoint documents.

        Parameters
        ----------
        framework : List[dict]
            Complete audit framework.

        identified_documents : List[dict]
            Output of document identification.

        Returns Dict[str, List[dict]]
        """
        framework = self.framework

        # Unique categories detected in the project
        identified_categories = {
            doc["matched_category"]
            for doc in identified_documents
            if doc.get("matched_category")
            and doc.get("matched_category") != "Unclassified"
        }

        filtered_framework = defaultdict(list)

        for row in framework:

            document_category = row.get("document")

            if document_category not in identified_categories:
                continue

            filtered_framework[document_category].append(
                {
                    "evaluation_category": row.get("evaluation_category"),
                    "evaluation_metric": row.get("evaluation_metric"),
                    "evaluation_pointer": row.get("evaluation_pointer"),
                }
            )

        return dict(filtered_framework)





