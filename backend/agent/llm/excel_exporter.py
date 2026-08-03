"""
excel_exporter.py

Exports AI Audit results into Excel workbook.

Workbook Structure
------------------

Sheet 1:
    Individual Audit

    One row per framework evaluation result.

Sheet 2:
    Combined Summary

    Executive summary,
    findings,
    strengths,
    risks,
    recommendations,
    cross-document observations.

Compatible with:
    audit_pipeline.py Stage 4 output
"""

from __future__ import annotations


import os
import re
from datetime import datetime
from typing import List, Dict, Any


from openpyxl import Workbook


from openpyxl.styles import (
    Font,
    PatternFill,
    Border,
    Side,
    Alignment,
)


from openpyxl.utils import get_column_letter



# ============================================================
# STYLES
# ============================================================


HEADER_FILL = PatternFill(
    fill_type="solid",
    fgColor="1F4E78",
)


HEADER_FONT = Font(
    bold=True,
    color="FFFFFF",
    size=11,
)


TITLE_FONT = Font(
    bold=True,
    size=15,
)


SECTION_FONT = Font(
    bold=True,
    size=12,
)



THIN_BORDER = Border(

    left=Side(style="thin"),

    right=Side(style="thin"),

    top=Side(style="thin"),

    bottom=Side(style="thin"),

)



CENTER = Alignment(

    horizontal="center",

    vertical="center",

    wrap_text=True,

)



LEFT = Alignment(

    horizontal="left",

    vertical="top",

    wrap_text=True,

)



# ============================================================
# SCORE COLORS
# ============================================================


SCORE_FILLS = {


    5: PatternFill(
        fill_type="solid",
        fgColor="92D050",
    ),


    4: PatternFill(
        fill_type="solid",
        fgColor="C6EFCE",
    ),


    3: PatternFill(
        fill_type="solid",
        fgColor="FFD966",
    ),


    2: PatternFill(
        fill_type="solid",
        fgColor="F4B183",
    ),


    1: PatternFill(
        fill_type="solid",
        fgColor="FF9999",
    ),


}



# ============================================================
# FILE NAME HELPERS
# ============================================================


def _safe_filename(
    text: str,
) -> str:

    """
    Removes illegal filename characters.
    """

    text = re.sub(

        r'[<>:"/\\\\|?*]',

        "",

        text,

    )


    text = text.strip()


    text = re.sub(

        r"\s+",

        "_",

        text,

    )


    return text





def _generate_output_path(

    project_overview: dict,

    output_directory: str,

) -> str:


    project = _safe_filename(

        project_overview.get(

            "project_name",

            "Project",

        )

    )



    audit_type = _safe_filename(

        project_overview.get(

            "audit_type",

            "Audit",

        )

    )



    timestamp = datetime.now().strftime(

        "%Y%m%d_%H%M%S"

    )



    filename = (

        f"{project}_"

        f"{audit_type}_"

        f"AI_Audit_Report_"

        f"{timestamp}.xlsx"

    )



    return os.path.join(

        output_directory,

        filename,

    )



# ============================================================
# EXCEL FORMATTING HELPERS
# ============================================================


def _autofit_columns(
    ws,
):


    for column_cells in ws.columns:


        max_length = 0


        column_letter = get_column_letter(

            column_cells[0].column

        )



        for cell in column_cells:


            if cell.value is None:

                continue



            length = len(

                str(cell.value)

            )


            if length > max_length:

                max_length = length



        ws.column_dimensions[
            column_letter
        ].width = min(

            max(max_length + 3, 18),

            60,

        )





def _write_header(

    ws,

    row: int,

    headers: List[str],

):


    for col, value in enumerate(

        headers,

        start=1,

    ):


        cell = ws.cell(

            row=row,

            column=col,

            value=value,

        )


        cell.font = HEADER_FONT

        cell.fill = HEADER_FILL

        cell.border = THIN_BORDER

        cell.alignment = CENTER





def _style_row(

    ws,

    row: int,

):


    for cell in ws[row]:


        cell.border = THIN_BORDER

        cell.alignment = LEFT





def _create_workbook():


    wb = Workbook()


    default = wb.active


    wb.remove(default)


    return wb


# ============================================================
# SHEET 1
# INDIVIDUAL AUDIT
# ============================================================

def _create_individual_audit_sheet(
    wb: Workbook,
    project_overview: Dict[str, Any],
    individual_audits: List[Dict[str, Any]],
):
    ws = wb.create_sheet("Individual Audit")
    ws["A1"] = "AI DELIVERY AUDIT REPORT"
    ws["A1"].font = TITLE_FONT

    headers = [
        "#",                    # criterion_number
        "Project",
        "Audit Type",
        "Document",
        "Document Category",
        "Evaluation Category",
        "Evaluation Metric",
        "Evaluation Pointer",
        "Score",
        "Finding",
        "Evidence",
        "Recommendation",
    ]

    _write_header(ws, 3, headers)
    current_row = 4

    project_name = project_overview.get("project_name", "")
    audit_type   = project_overview.get("audit_type", "")

    for audit in individual_audits:
        filename      = audit.get("filename", "")
        category      = audit.get("matched_category", "")
        audit_results = audit.get("audit_results", [])

        if not audit_results:
            values = [
                "-", project_name, audit_type, filename, category,
                "-", "Audit Failed", "-", 0,
                audit.get("summary", ""), "", "",
            ]
            for col, value in enumerate(values, start=1):
                ws.cell(row=current_row, column=col, value=value)
            ws.cell(row=current_row, column=9).fill = SCORE_FILLS[1]
            _style_row(ws, current_row)
            current_row += 1
            continue

        for result in audit_results:
            values = [
                result.get("criterion_number", ""),   # # column
                project_name,
                audit_type,
                filename,
                category,
                result.get("evaluation_category", ""),
                result.get("evaluation_metric", ""),
                result.get("evaluation_pointer", ""),
                result.get("score", 0),
                result.get("finding", ""),
                result.get("evidence", ""),
                result.get("recommendation", ""),
            ]
            for col, value in enumerate(values, start=1):
                ws.cell(row=current_row, column=col, value=value)

            score_cell = ws.cell(row=current_row, column=9)
            score_cell.fill = SCORE_FILLS.get(score_cell.value, PatternFill())
            _style_row(ws, current_row)
            current_row += 1

    ws.freeze_panes = "A4"
    ws.auto_filter.ref = ws.dimensions

    # Narrow the # column, wider columns for text fields
    ws.column_dimensions["A"].width = 5
    ws.column_dimensions["I"].width = 8
    _autofit_columns(ws)
    return ws


# ============================================================
# SHEET 2
# COMBINED SUMMARY
# ============================================================

def _create_combined_summary_sheet(
    wb: Workbook,
    project_overview: Dict[str, Any],
    combined_summary: Dict[str, Any],
):
    ws = wb.create_sheet("Combined Summary")
    ws["A1"] = "AI AUDIT EXECUTIVE SUMMARY"
    ws["A1"].font = TITLE_FONT

    row = 3

    # ── Project metadata ─────────────────────────────────────────────
    ws.cell(row=row, column=1, value="Project Details").font = SECTION_FONT
    row += 1

    overall_score = combined_summary.get("overall_project_score")
    score_display = (
        f"{round(overall_score * 20)}%  ({round(overall_score, 2)}/5)"
        if overall_score is not None else "N/A"
    )

    metadata = [
        ("Project Name",        project_overview.get("project_name", "")),
        ("Client",              project_overview.get("client_name", "")),
        ("Audit Type",          project_overview.get("audit_type", "")),
        ("Overall Project Score", score_display),
        ("Documents Audited",   combined_summary.get("documents_audited", "")),
        ("Generated",           datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
    ]

    for key, value in metadata:
        label_cell = ws.cell(row=row, column=1, value=key)
        label_cell.font = Font(bold=True)
        value_cell = ws.cell(row=row, column=2, value=value)

        # Highlight the score row
        if key == "Overall Project Score" and overall_score is not None:
            score_int = min(5, max(1, round(overall_score)))
            label_cell.fill = SCORE_FILLS.get(score_int, PatternFill())
            value_cell.fill = SCORE_FILLS.get(score_int, PatternFill())
            value_cell.font = Font(bold=True, size=12)

        _style_row(ws, row)
        row += 1

    row += 1

    # ── Executive summary (text block) ───────────────────────────────
    exec_summary = combined_summary.get("executive_summary", "")
    if exec_summary:
        ws.cell(row=row, column=1, value="Executive Summary").font = SECTION_FONT
        row += 1
        ws.merge_cells(
            start_row=row, start_column=1,
            end_row=row,   end_column=4,
        )
        cell = ws.cell(row=row, column=1, value=exec_summary)
        cell.alignment = LEFT
        cell.border = THIN_BORDER
        _style_row(ws, row)
        row += 2

    # ── Sections ─────────────────────────────────────────────────────
    def add_section(title, content):
        nonlocal row
        ws.cell(row=row, column=1, value=title).font = SECTION_FONT
        row += 1

        if isinstance(content, list):
            if not content:
                ws.cell(row=row, column=2, value="None")
                row += 1
            else:
                for item in content:
                    ws.cell(row=row, column=1, value="•")

                    if isinstance(item, str):
                        text = item
                    elif isinstance(item, dict) and "recommendation" in item:
                        text = (
                            f"Recommendation : {item.get('recommendation','')}\n"
                            f"Priority        : {item.get('priority','')}\n"
                            f"Documents       : {', '.join(item.get('related_documents', []))}"
                        )
                    elif isinstance(item, dict) and "finding" in item:
                        text = (
                            f"Finding   : {item.get('finding','')}\n"
                            f"Severity  : {item.get('severity','')}\n"
                            f"Documents : {', '.join(item.get('documents_involved', []))}"
                        )
                    elif isinstance(item, dict) and "gap" in item:
                        text = (
                            f"Gap       : {item.get('gap','')}\n"
                            f"Impact    : {item.get('impact','')}\n"
                            f"Documents : {', '.join(item.get('source_documents', []))}"
                        )
                    else:
                        text = str(item)

                    cell = ws.cell(row=row, column=2, value=text)
                    _style_row(ws, row)
                    row += 1
        else:
            ws.merge_cells(
                start_row=row, start_column=1,
                end_row=row,   end_column=4,
            )
            cell = ws.cell(row=row, column=1, value=content)
            cell.alignment = LEFT
            cell.border = THIN_BORDER
            row += 1

        row += 1

    add_section("Cross Document Findings", combined_summary.get("cross_document_findings", []))
    add_section("Gaps & Risks",            combined_summary.get("gaps_and_risks", []))
    add_section("Strengths",               combined_summary.get("strengths", []))
    add_section("Recommendations",         combined_summary.get("recommendations") or combined_summary.get("recommendation", []))

    ws.freeze_panes = "A3"
    ws.column_dimensions["A"].width = 35
    ws.column_dimensions["B"].width = 90
    return ws


# ============================================================
# PUBLIC EXPORT FUNCTION
# ============================================================


def export_audit_to_excel(

    project_overview: Dict[str, Any],

    individual_audits: List[Dict[str, Any]],

    combined_summary: Dict[str, Any],

    output_directory: str,

) -> str:

    """
    Main Excel export entry point.

    Parameters
    ----------
    project_overview:
        Project metadata.

        Example:
        {
            "project_name": "Arthur_AI_reporting",
            "audit_type": "STAR"
        }


    individual_audits:
        Output from document_auditor.py

        Example:
        [
            {
                "filename": "BRD.docx",
                "matched_category": "BRD",
                "audit_results": [
                    {
                        "project_phase": "Planning",
                        "evaluation_category": "Documentation",
                        "evaluation_metric": "Completeness",
                        "evaluation_pointer": "...",
                        "score": 5,
                        "finding": "...",
                        "evidence": "...",
                        "recommendation": "..."
                    }
                ]
            }
        ]


    combined_summary:
        Cross document AI summary.


    output_directory:
        Local folder before SharePoint upload.


    Returns
    -------
    str
        Generated Excel file path.

    """

    os.makedirs(

        output_directory,

        exist_ok=True,

    )

    wb = _create_workbook()

    # --------------------------------------------------------
    # Create sheets
    # --------------------------------------------------------

    _create_individual_audit_sheet(

        wb,

        project_overview,

        individual_audits,

    )

    _create_combined_summary_sheet(

        wb,

        project_overview,

        combined_summary,

    )

    # --------------------------------------------------------
    # Generate timestamped filename
    # --------------------------------------------------------

    output_path = _generate_output_path(

        project_overview,

        output_directory,

    )

    # --------------------------------------------------------
    # Save workbook
    # --------------------------------------------------------

    wb.save(

        output_path,

    )

    return output_path