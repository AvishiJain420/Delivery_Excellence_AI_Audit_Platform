# Parse .docx files using python-docx library and will extract paragraph, text, tables and embedded images

import io
from docx import Document as DocxReader
from docx.oxml.ns import qn
from document_parsers.base import BaseParser
from agent.document import Document

class DocxParser(BaseParser):

    def parse(self, content_bytes : bytes , filename : str , metadata : dict) -> Document:
        try:
            # converting the binary files content to io stream and then reading them
            doc_stream = io.BytesIO(content_bytes)
            docx = DocxReader(doc_stream)

            text_parts = []
            tables = []
            images = []
            content_sequence = []  

            for element in docx.element.body:

                tag = element.tag.split("}")[-1]  # strip namespace

                # ── Paragraph (may contain inline images) ────────────
                if tag == "p":
                    # Check for inline images first
                    inline_images = element.findall(
                        ".//" + qn("a:blip")
                    )

                    if inline_images:
                        for blip in inline_images:
                            rId = blip.get(qn("r:embed"))
                            if rId and rId in docx.part.rels:
                                img_part = docx.part.rels[rId].target_part
                                img_bytes = img_part.blob
                                images.append(img_bytes)
                                content_sequence.append({
                                    "type": "image",
                                    "value": img_bytes,
                                    "label": "Inline document image"
                                })
                    else:
                        # Regular text paragraph
                        text = element.text_content() if hasattr(element, 'text_content') else ""
                        # Use python-docx paragraph text extraction
                        from docx.text.paragraph import Paragraph as DocxPara
                        try:
                            para = DocxPara(element, docx.element.body)
                            text = para.text
                        except Exception:
                            text = "".join(
                                node.text or ""
                                for node in element.iter()
                                if node.text
                            )

                        if text.strip():
                            text_parts.append(text)
                            content_sequence.append({
                                "type": "text",
                                "value": text
                            })

                # ── Table ─────────────────────────────────────────────
                elif tag == "tbl":
                    from docx.table import Table as DocxTable
                    try:
                        tbl = DocxTable(element, docx.element.body)
                        rows = [
                            [cell.text.strip() for cell in row.cells]
                            for row in tbl.rows
                        ]
                        tables.append(rows)
                        content_sequence.append({
                            "type": "table",
                            "value": rows,
                            "label": "Document table"
                        })
                    except Exception:
                        pass

            document = Document(
                id=metadata.get("item_id", filename),
                filename=filename,
                file_type="docx",
                text="\n".join(text_parts),
                tables=tables,
                images=images,
                content_sequence=content_sequence,
                metadata=metadata,
            )

            return document
        
        except Exception as e:
            print(f"  DOCX parse error for {filename}: {e}")

            document = Document(
                id=metadata.get("item_id", filename),
                filename=filename,
                file_type="docx",
                metadata=metadata,
                parse_error=str(e),
            )
            return document