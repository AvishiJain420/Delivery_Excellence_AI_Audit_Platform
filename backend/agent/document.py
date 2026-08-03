"""
Document model - a very clean , structured representation of any parsed file (docx/pdf/pptx/xlsx) that gets passed to the LLM audit agent . 
This is the final step for Sharepoint and document parsing logic
"""

from dataclasses import dataclass , field
from typing import Optional

@dataclass
class Document:

    """ Strcutured representation of a single parsed document - basically we are creating an object for it
    """

    id : str                    # will get a item_id
    filename : str              # name of the file parsed
    file_type : str             # it can be "docx", "pptx" , "xlsx" , "image" or unknown
    text : str = ""             # extract plain text 
    tables: list = field(default_factory=list)     # list of tables, each table = list of rows
    images: list = field(default_factory=list)     # list of raw image bytes (only if needed downstream)

    # positional sequence for preserving the reading order of doc info
    # Each entry: {"type": "text"|"image"|"table", "value": ..., "label": "optional context"}
    content_sequence : list = field (default_factory= list)


    # for pdf and pptx 
    page_count : Optional[int] = None

    #for xlsx
    sheet_names : Optional[list] = None

    metadata : dict = field(default_factory=dict) # source, url , item_id , size ,etc ,etc

    parse_error : Optional[str] = None    # set if parsing failed ; text/tables will be empty


    def to_dict(self) -> dict :
        """ 
        We will convert our extracted information to a serializable format for API responses / frontend displays 
        We are excluding raw image bytes by default since they are not JSON-serializable and not needed for typical frontend displays 
        """

        result = {
            "id": self.id,
            "filename": self.filename,
            "file_type": self.file_type,
            "text_preview": self.text[:500] if self.text else "",
            "text_length": len(self.text) if self.text else 0,
            "table_count": len(self.tables),
            "image_count": len(self.images),
            "page_count": self.page_count,
            "sheet_names": self.sheet_names,
            "metadata": self.metadata,
            "parse_error": self.parse_error
        }

        return result
    
    def to_llm_payload(self) -> list :

        """
        1. Full content for sharing to the LLM 
        2. Preserving the reading order : text , images and tables appear in the same sequence as document
        3. Tables are serialized to readable text since they are not visual - they are read better as structured text than images
        4. This list will be used as 'content' field during LLM call    
        """

        import base64

        content = []

        # Adding the filename as context header
        content.append({
            "type": "text",
            "text" : f"-------Document : {self.filename}-------\n"
        })

        for item in self.content_sequence:

            # if content is a text

            if item["type"] == "text":
               if item["value"].strip():
                   content.append({
                       "type" : "text",
                       "text" : item["value"]
                   }) 

            # if content is a table
            elif item["type"] == "table":
                #Serialize the table to a readable markdown-style text
                rows = item["value"]
                if rows:
                    table_text = "\n[TABLE]\n"
                    for row in rows:
                        table_text += " | ".join(str(c) for c in row) + "\n"
                    table_text += "[/TABLE]\n"
                    label = item.get("label","")
                    if label:
                        table_text = f"\n{label}\n" + table_text
                    content.append({
                        "type": "text",
                        "text": table_text
                    })

            # if content is an image
            elif item["type"] == "image":
               pass

        return content    


