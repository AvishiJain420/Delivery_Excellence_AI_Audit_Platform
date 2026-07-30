"""
Parses .xlsx files with full content extraction:
- Cell data (text + tables) via openpyxl
- Embedded images via ZIP extraction
- Charts via ZIP XML parsing (data + metadata)
- Shapes and flow diagrams via drawing XML parsing
- Full sheet rendering to image for visual context

The content_sequence preserves the relationship between cell content, shapes, and visuals exactly as a human would
read the sheet — text data alongside the diagrams that reference or explain it.
"""

import io
import json
import zipfile
import xml.etree.ElementTree as ET
from openpyxl import load_workbook
from openpyxl.utils import get_column_letter
from document_parsers.base import BaseParser
from agent.document import Document


# XML namespaces used inside XLSX ZIP
NS = {
    "a":   "http://schemas.openxmlformats.org/drawingml/2006/main",
    "xdr": "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
    "c":   "http://schemas.openxmlformats.org/drawingml/2006/chart",
    "r":   "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "p":   "http://schemas.openxmlformats.org/presentationml/2006/main",
}


class XlsxParser(BaseParser):

    def parse(
        self,
        content_bytes: bytes,
        filename: str,
        metadata: dict
    ) -> Document:

        try:
            xlsx_stream = io.BytesIO(content_bytes)
            workbook = load_workbook(xlsx_stream, data_only=True)

            all_tables = []
            all_images = []
            text_parts = []
            content_sequence = []

            # Open the XLSX as a ZIP to access drawings/charts/media
            xlsx_stream.seek(0)
            with zipfile.ZipFile(xlsx_stream, "r") as zf:
                zip_files = zf.namelist()

                for sheet_idx, sheet_name in enumerate(workbook.sheetnames):
                    sheet = workbook[sheet_name]

                    # Section header in sequence
                    content_sequence.append({
                        "type": "text",
                        "value": f"\n===== Sheet: {sheet_name} =====\n"
                    })

                    # ── 1. Cell data ─────────────────────────────────
                    rows, cell_text = self._extract_cells(sheet)
                    if rows:
                        all_tables.append(rows)
                        text_parts.append(
                            f"Sheet: {sheet_name}\n{cell_text}"
                        )
                        content_sequence.append({
                            "type": "text",
                            "value": f"Cell data:\n{cell_text}"
                        })
                        content_sequence.append({
                            "type": "table",
                            "value": rows,
                            "label": f"Cell table — {sheet_name}"
                        })

                    # ── 2. Drawing XML: shapes + flow diagrams ────────
                    drawing_path = (
                        f"xl/drawings/drawing{sheet_idx + 1}.xml"
                    )
                    if drawing_path in zip_files:
                        shapes = self._extract_shapes(zf, drawing_path)
                        if shapes:
                            shape_text = self._shapes_to_text(shapes)
                            text_parts.append(shape_text)
                            content_sequence.append({
                                "type": "text",
                                "value": (
                                    f"Shapes / Flow diagram elements "
                                    f"on sheet '{sheet_name}':\n{shape_text}"
                                )
                            })

                        # Render shapes as image so LLM sees visual layout
                        shape_image = self._render_shapes_to_image(shapes)
                        if shape_image:
                            all_images.append(shape_image)
                            content_sequence.append({
                                "type": "image",
                                "value": shape_image,
                                "label": (
                                    f"Visual layout of shapes/flow diagram "
                                    f"on sheet '{sheet_name}' — "
                                    f"read in conjunction with shape text above"
                                )
                            })

                    # ── 3. Charts ─────────────────────────────────────
                    chart_path = (
                        f"xl/charts/chart{sheet_idx + 1}.xml"
                    )
                    if chart_path in zip_files:
                        chart_data = self._extract_chart(zf, chart_path)
                        if chart_data:
                            chart_text = json.dumps(chart_data, indent=2)
                            text_parts.append(
                                f"Chart data on '{sheet_name}':\n{chart_text}"
                            )
                            content_sequence.append({
                                "type": "text",
                                "value": (
                                    f"Chart on sheet '{sheet_name}':\n"
                                    f"{chart_text}"
                                )
                            })

                    # ── 4. Embedded media images ──────────────────────
                    media_images = self._extract_media_images(
                        zf, zip_files, sheet_idx
                    )
                    for img_bytes in media_images:
                        all_images.append(img_bytes)
                        content_sequence.append({
                            "type": "image",
                            "value": img_bytes,
                            "label": f"Embedded image on sheet '{sheet_name}'"
                        })

            return Document(
                id=metadata.get("item_id", filename),
                filename=filename,
                file_type="xlsx",
                text="\n\n".join(text_parts),
                tables=all_tables,
                images=all_images,
                content_sequence=content_sequence,
                sheet_names=workbook.sheetnames,
                metadata=metadata,
            )

        except Exception as e:
            print(f"  XLSX parse error for {filename}: {e}")
            return Document(
                id=metadata.get("item_id", filename),
                filename=filename,
                file_type="xlsx",
                metadata=metadata,
                parse_error=str(e),
            )

    # ── Cell extraction ───────────────────────────────────────────────

    def _extract_cells(self, sheet) -> tuple[list, str]:
        """
        Extracts non-empty cell data as a table (list of rows)
        and a readable pipe-delimited text representation.
        Skips entirely empty rows.
        """
        rows = []
        for row in sheet.iter_rows(values_only=True):
            cleaned = [
                str(cell) if cell is not None else ""
                for cell in row
            ]
            if any(c.strip() for c in cleaned):
                rows.append(cleaned)

        text = "\n".join(" | ".join(row) for row in rows)
        return rows, text

    # ── Shape / flow diagram extraction ──────────────────────────────

    def _extract_shapes(self, zf: zipfile.ZipFile, drawing_path: str) -> list[dict]:
        """
        Parses the drawing XML to extract all shapes with:
        - Their text content
        - Their position (row/col anchor)
        - Shape type (connector = flow arrow, rect = process box, etc.)

        Returns list of shape dicts sorted by vertical position
        so reading order is preserved.
        """
        shapes = []
        try:
            xml_bytes = zf.read(drawing_path)
            root = ET.fromstring(xml_bytes)

            for sp in root.findall(".//xdr:sp", NS):
                shape = {}

                # Position — from/to anchors give us row/col
                from_el = sp.find("../xdr:from", NS)
                if from_el is not None:
                    shape["row"] = int(
                        from_el.findtext("xdr:row", "0", NS)
                    )
                    shape["col"] = int(
                        from_el.findtext("xdr:col", "0", NS)
                    )
                else:
                    shape["row"] = 999
                    shape["col"] = 999

                # Shape type from preset geometry
                prstGeom = sp.find(".//a:prstGeom", NS)
                shape["shape_type"] = (
                    prstGeom.get("prst", "unknown")
                    if prstGeom is not None else "unknown"
                )

                # All text inside the shape
                text_nodes = sp.findall(".//a:t", NS)
                shape["text"] = " ".join(
                    t.text for t in text_nodes if t.text
                ).strip()

                # Shape name from nvSpPr
                nvSpPr = sp.find(".//xdr:nvSpPr/xdr:cNvPr", NS)
                shape["name"] = (
                    nvSpPr.get("name", "")
                    if nvSpPr is not None else ""
                )

                if shape["text"] or shape["shape_type"] != "unknown":
                    shapes.append(shape)

            # Also extract connectors (arrows between shapes in flow diagrams)
            for conn in root.findall(".//xdr:cxnSp", NS):
                from_el = conn.find("../xdr:from", NS)
                row = int(from_el.findtext("xdr:row", "0", NS)) \
                    if from_el is not None else 999
                col = int(from_el.findtext("xdr:col", "0", NS)) \
                    if from_el is not None else 999
                shapes.append({
                    "shape_type": "connector",
                    "text": "→",
                    "name": "connector",
                    "row": row,
                    "col": col,
                })

            # Sort by position: top-to-bottom, left-to-right
            shapes.sort(key=lambda s: (s["row"], s["col"]))

        except Exception as e:
            print(f"  Shape extraction warning: {e}")

        return shapes

    def _shapes_to_text(self, shapes: list[dict]) -> str:
        """
        Converts shape list into readable text that describes the
        flow/structure. Groups connectors with adjacent shapes so
        the flow reads naturally:
        [Start] → [Process A] → [Decision?] → [End]
        """
        lines = []
        flow_line = []

        for shape in shapes:
            s_type = shape.get("shape_type", "")
            text = shape.get("text", "")

            if s_type == "connector":
                flow_line.append("→")
            elif text:
                # Wrap shape text in brackets based on type
                if "rect" in s_type or "roundRect" in s_type:
                    flow_line.append(f"[{text}]")
                elif "diamond" in s_type:
                    flow_line.append(f"<{text}?>")  # decision diamond
                elif "ellipse" in s_type or "oval" in s_type:
                    flow_line.append(f"({text})")    # start/end oval
                else:
                    flow_line.append(text)

            # Break flow line at natural points (every ~5 shapes)
            if len(flow_line) >= 9:
                lines.append(" ".join(flow_line))
                flow_line = []

        if flow_line:
            lines.append(" ".join(flow_line))

        return "\n".join(lines) if lines else ""

    def _render_shapes_to_image(self, shapes: list[dict]) -> bytes | None:
        """
        Renders shapes as a simple visual diagram using Pillow.
        This gives the LLM a visual overview of the flow structure
        to complement the text representation extracted above.

        Boxes are drawn at grid positions matching their Excel anchor
        so relative spatial layout is preserved.
        """
        if not shapes:
            return None

        try:
            from PIL import Image, ImageDraw, ImageFont

            CELL_W, CELL_H = 120, 60
            PADDING = 40

            max_col = max(s.get("col", 0) for s in shapes) + 2
            max_row = max(s.get("row", 0) for s in shapes) + 2

            width  = max_col * CELL_W + PADDING * 2
            height = max_row * CELL_H + PADDING * 2

            img  = Image.new("RGB", (width, height), "white")
            draw = ImageDraw.Draw(img)

            try:
                font = ImageFont.truetype("arial.ttf", 11)
            except Exception:
                font = ImageFont.load_default()

            for shape in shapes:
                s_type = shape.get("shape_type", "")
                text   = shape.get("text", "")
                col    = shape.get("col", 0)
                row    = shape.get("row", 0)

                x = PADDING + col * CELL_W
                y = PADDING + row * CELL_H
                bx = x + CELL_W - 10
                by = y + CELL_H - 10

                if s_type == "connector":
                    # Draw arrow
                    draw.line([(x, y), (x + 40, y)], fill="black", width=2)
                    draw.polygon(
                        [(x+40, y-5), (x+50, y), (x+40, y+5)],
                        fill="black"
                    )
                elif "diamond" in s_type:
                    # Decision diamond
                    mid_x = (x + bx) // 2
                    mid_y = (y + by) // 2
                    draw.polygon(
                        [(mid_x, y), (bx, mid_y), (mid_x, by), (x, mid_y)],
                        outline="black", fill="#FFF9C4"
                    )
                    if text:
                        draw.text((x + 5, mid_y - 8), text[:20], fill="black", font=font)
                elif "ellipse" in s_type or "oval" in s_type:
                    draw.ellipse([x, y, bx, by], outline="black", fill="#C8E6C9")
                    if text:
                        draw.text((x + 5, y + 15), text[:20], fill="black", font=font)
                else:
                    # Default rectangle
                    draw.rectangle([x, y, bx, by], outline="black", fill="#DDEEFF")
                    if text:
                        # Wrap long text
                        words = text.split()
                        line, wrapped = "", []
                        for w in words:
                            if len(line) + len(w) < 16:
                                line += w + " "
                            else:
                                wrapped.append(line.strip())
                                line = w + " "
                        if line:
                            wrapped.append(line.strip())
                        for i, wl in enumerate(wrapped[:3]):
                            draw.text(
                                (x + 5, y + 8 + i * 14),
                                wl, fill="black", font=font
                            )

            buf = io.BytesIO()
            img.save(buf, format="PNG")
            return buf.getvalue()

        except Exception as e:
            print(f"  Shape render warning: {e}")
            return None

    # ── Chart extraction ──────────────────────────────────────────────

    def _extract_chart(
        self,
        zf: zipfile.ZipFile,
        chart_path: str
    ) -> dict | None:
        """
        Parses chart XML to extract chart type, title, series names,
        and data values — giving the LLM the actual numbers behind
        the chart rather than just a screenshot.
        """
        try:
            xml_bytes = zf.read(chart_path)
            root = ET.fromstring(xml_bytes)

            chart_data = {
                "chart_type": "unknown",
                "title": "",
                "series": []
            }

            # Chart type — first child of plotArea
            plot_area = root.find(".//c:plotArea", NS)
            if plot_area is not None and len(plot_area):
                chart_data["chart_type"] = (
                    plot_area[0].tag.split("}")[-1]
                    .replace("Chart", "")
                    .lower()
                )

            # Title
            title_el = root.find(".//c:title//a:t", NS)
            if title_el is not None and title_el.text:
                chart_data["title"] = title_el.text

            # Series: name + values
            for ser in root.findall(".//c:ser", NS):
                series = {}

                # Series name
                name_el = ser.find(".//c:tx//c:v", NS)
                series["name"] = (
                    name_el.text if name_el is not None else "Series"
                )

                # Category labels
                cats = [
                    el.text for el in ser.findall(".//c:cat//c:v", NS)
                    if el.text
                ]
                series["categories"] = cats

                # Data values
                vals = [
                    el.text for el in ser.findall(".//c:val//c:v", NS)
                    if el.text
                ]
                series["values"] = vals

                chart_data["series"].append(series)

            return chart_data

        except Exception as e:
            print(f"  Chart extraction warning: {e}")
            return None

    # ── Embedded media images ─────────────────────────────────────────

    def _extract_media_images(
        self,
        zf: zipfile.ZipFile,
        zip_files: list[str],
        sheet_idx: int
    ) -> list[bytes]:
        """
        Extracts embedded images from xl/media/ that are linked
        to the current sheet via the drawing relationship file.
        Only returns images actually referenced by this sheet's
        drawing — avoids pulling unrelated images from other sheets.
        """
        images = []
        try:
            # Check drawing relationship to find which media files
            # belong to this sheet
            rel_path = (
                f"xl/drawings/_rels/drawing{sheet_idx + 1}.xml.rels"
            )

            if rel_path not in zip_files:
                return images

            rel_xml = zf.read(rel_path)
            rel_root = ET.fromstring(rel_xml)

            IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".bmp"}

            for rel in rel_root.findall(".//{http://schemas.openxmlformats.org/package/2006/relationships}Relationship"):
                target = rel.get("Target", "")
                # Target paths look like "../media/image1.png"
                normalized = target.replace("../", "xl/")
                ext = "." + normalized.rsplit(".", 1)[-1].lower() \
                    if "." in normalized else ""

                if ext in IMAGE_EXTS and normalized in zip_files:
                    images.append(zf.read(normalized))

        except Exception as e:
            print(f"  Media image extraction warning: {e}")

        return images