import io
import pdfplumber
from document_parsers.base import BaseParser
from agent.document import Document


class PdfParser(BaseParser):

    def parse(self, content_bytes: bytes, filename: str, metadata: dict) -> Document:
        try:
            text_parts = []
            tables = []
            images = []
            content_sequence = []

            with pdfplumber.open(io.BytesIO(content_bytes)) as pdf:
                page_count = len(pdf.pages)

                for page_num, page in enumerate(pdf.pages, start=1):

                    content_sequence.append({
                        "type": "text",
                        "value": f"\n--- Page {page_num} ---"
                    })

                    # ── Text ─────────────────────────────────────────
                    page_text = page.extract_text()
                    if page_text and page_text.strip():
                        text_parts.append(page_text)
                        content_sequence.append({
                            "type": "text",
                            "value": page_text
                        })

                    # ── Tables ───────────────────────────────────────
                    for table in page.extract_tables():
                        tables.append(table)
                        content_sequence.append({
                            "type": "table",
                            "value": table,
                            "label": f"Table on page {page_num}"
                        })

                    # ── Images ───────────────────────────────────────
                    for img in page.images:
                        try:
                            bbox = (
                                img["x0"], img["top"],
                                img["x1"], img["bottom"]
                            )
                            cropped = page.within_bbox(bbox).to_image(resolution=150)
                            buf = io.BytesIO()
                            cropped.save(buf, format="PNG")
                            img_bytes = buf.getvalue()
                            images.append(img_bytes)
                            content_sequence.append({
                                "type": "image",
                                "value": img_bytes,
                                "label": f"Page {page_num} image"
                            })
                        except Exception:
                            pass

            return Document(
                id=metadata.get("item_id", filename),
                filename=filename,
                file_type="pdf",
                text="\n\n".join(text_parts),
                tables=tables,
                images=images,
                content_sequence=content_sequence,
                page_count=page_count,
                metadata=metadata,
            )

        except Exception as e:
            print(f"  PDF parse error for {filename}: {e}")
            return Document(
                id=metadata.get("item_id", filename),
                filename=filename,
                file_type="pdf",
                metadata=metadata,
                parse_error=str(e),
            )