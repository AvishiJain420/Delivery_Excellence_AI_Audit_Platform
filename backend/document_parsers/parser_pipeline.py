"""
Here we will be identifying the file type of files received and will be routing the files to the correct parser

- docx  → DocxParser  (text + tables + inline images in sequence)
- pdf   → PdfParser   (text + tables + page images in sequence)
- pptx  → PptxParser  (text + tables + slide images in sequence)
- xlsx  → XlsxParser  (cells + shapes + charts + media in sequence)
- images → passed through as standalone image content_sequence entry
- unknown → Document with parse_error set, pipeline continues
"""

from agent.document import Document
from document_parsers.docx_parser import DocxParser
from document_parsers.pdf_parser import PdfParser
from document_parsers.pptx_parser import PptxParser
from document_parsers.xlsx_parser import XlsxParser

IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "bmp", "tiff", "webp"}

PARSER_MAP = {
    "docx" : DocxParser(),
    "pdf"  : PdfParser(),
    "pptx" : PptxParser(),
    "xlsx" : XlsxParser()
}

def get_file_extension(filename : str ) -> str:
    return filename.rsplit(".",1)[-1].lower() if "." in filename else ""

def parse_document(
        content_bytes : bytes,
        filename : str,
        metadata : dict
) -> Document :
    """
    Main function : given raw bytes + filename, detect type and parse.

    For supported document types (docx/pdf/pptx/xlsx):
        Routes to the correct parser which builds a full content_sequence
        with text, tables, and images interleaved in reading order.

    For standalone image files (png/jpg/etc):
        Creates a Document with a single image entry in content_sequence.
        No text extraction attempted — the full image is passed to the
        LLM as-is via to_llm_payload(), so the model sees the complete
        visual context rather than getting nothing or a failed parse.

    For unsupported types:
        Returns a Document with parse_error set and empty content —
        never raises, so the pipeline continues processing the rest
        of the document batch even if one file is unreadable.
    """
    extension = get_file_extension(filename)

    #-------------STANDALONE IMAGES----------------------
    if extension in IMAGE_EXTENSIONS:
        print(f"   {filename} : standalone image - adding to the content sequence")

        # Detect media type for base64 data URI in the function to_llm_payload inside Document


        media_type_map = {
            "jpg":  "image/jpeg",
            "jpeg": "image/jpeg",
            "png":  "image/png",
            "gif":  "image/gif",
            "bmp":  "image/bmp",
            "tiff": "image/tiff",
            "webp": "image/webp",
        }

        media_type = media_type_map.get(extension,"image/png") # provide our current file extension to check the mapping from all extensions available

        content_sequence = [
            {
                "type" : "image",
                "value" : content_bytes,
                "label" : filename,
                "media_type" : media_type           # passed through to_llm_payload
            }
        ]

        document = Document(
            id = metadata.get("item_id",filename),
            filename=filename,
            file_type="image",
            images= [content_bytes],
            content_sequence= content_sequence,
            metadata= { 
                **metadata,
                "media_type" : media_type
            }
        )

  # Supported document parser
    parser = PARSER_MAP.get(extension) #finding the parser based on extension of the file

    if not parser:
        print(f"   {filename} : unsupported file type  ',{extension}' - skipping")
        doc = Document(
                    id=metadata.get("item_id", filename),
                    filename=filename,
                    file_type="unknown",
                    metadata=metadata,
                    parse_error=f"Unsupported file type: .{extension}",
                     )
        return doc
    
    print(f"  Parsing {filename} as {extension.upper()}...")
    document = parser.parse(content_bytes, filename, metadata)

    # lets say if parser returned no content_sequence then we will send llm a fallback sequence which is the data we were able to parse from a document before the process failed in between
    # so to_llm_payload() always has something to work with.
    if not document.content_sequence:
        document.content_sequence = _build_fallback_sequence(document)

    return document

# --------- Function to build a fallback sequence in case the parser stops in between -----------
def _build_fallback_sequence(document: Document) -> list:
    """
    Fallback for cases where a parser produced text/tables/images
    in the flat fields but didn't build a content_sequence
    (e.g. a parser error partway through, or an empty file that
    still has some recoverable content).

    Order: text block → tables → images.
    Less ideal than proper interleaving but ensures nothing is lost.
    """
    sequence = []

    if document.text and document.text.strip():
        sequence.append({
            "type" : "text",
            "value" : document.text,
        })

    for i , table in enumerate(document.tables):
        sequence.append({
            "type" : "table",
            "value" : table,
            "label" : f"Table {i+1}"
        })

    for i,image_bytes in enumerate(document.images):
        sequence.append({
                "type" : "image",
                "value" : image_bytes,
                "label" : f"Image {i+1}" 
        })
       
    return sequence

    
