from __future__ import annotations

import os
import re
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple


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
# FONT
# ============================================================

FONT_NAME = "Arial"


# ============================================================
# COLOR PALETTE  (matches Audit_Report_Structure.xlsx)
# ============================================================

NAVY   = "1B2A4A"   # title bars / section banners
TEAL   = "0F7173"   # subtitle bars / sub-table headers
ZEBRA_A = "F5F6FA"  # zebra stripe (light)
ZEBRA_B = "FFFFFF"  # zebra stripe (white)
TEXT_DARK = "1C1C1E"

# 1-5 score band -> (label, color). Used for the Score Legend, the
# per-document Overall Score badge, and the Status pill on the
# Document Scorecard.
BAND_COLORS: Dict[int, Tuple[str, str]] = {
    5: ("Strong",  "1E8449"),
    4: ("Good",    "27AE60"),
    3: ("Partial", "F39C12"),
    2: ("Weak",    "E67E22"),
    1: ("Missing", "C0392B"),
}

# Per-criterion score -> priority label + color. Used on Detailed
# Findings and (derived from a document's weakest criterion) on the
# Action Tracker.
PRIORITY_BY_SCORE: Dict[int, Tuple[str, str]] = {
    1: ("Critical", "C0392B"),
    2: ("High",     "E8A838"),
    3: ("Medium",   "0F7173"),
    4: ("Low",      "1E8449"),
    5: ("Low",      "1E8449"),
}

# Score-cell fill on Detailed Findings (unchanged from the original
# exporter — already matched the reference template).
SCORE_FILLS = {
    5: "92D050",
    4: "C6EFCE",
    3: "FFD966",
    2: "F4B183",
    1: "FF9999",
}

# Fixed-color snapshot metrics on the Executive Summary tab.
SNAPSHOT_GAPS_COLOR = "C0392B"
SNAPSHOT_STRENGTHS_COLOR = "27AE60"
SNAPSHOT_RECS_COLOR = "C0392B"
SNAPSHOT_FINDINGS_COLOR = "FFC000"

# Action Tracker "Status" pill colors.
STATUS_COLORS: Dict[str, Tuple[str, str]] = {
    "Open":            ("FFF9C4", "856404"),
    "In Progress":     ("D6EAF8", "21618C"),
    "Pending Review":  ("E8DAEF", "6C3483"),
    "Closed":          ("D5F5E3", "196F3D"),
    "Overdue":         ("FADBD8", "A93226"),
    "Deferred":        ("EAECEE", "5D6D7E"),
}

# Action Tracker "waiting to be filled in" columns (Progress/Notes,
# Completion Date, Verified By).
PENDING_FILL = "FFFDE7"
PENDING_FONT_COLOR = "5D4037"


# ============================================================
# SHEET NAMES  (must match the reference template exactly)
# ============================================================

SHEET_HOWTO    = "📖 How To Use"
SHEET_EXEC     = "📊 Executive Summary"
SHEET_FINDINGS = "🔍 Detailed Findings"
SHEET_TRACKER  = "⚡ Action Tracker"


# ============================================================
# FONT / FILL / BORDER PRIMITIVES
# ============================================================


def _font(size=10, bold=False, color="FFFFFF", italic=False) -> Font:
    return Font(name=FONT_NAME, size=size, bold=bold, color=color, italic=italic)


def _fill(hex_color: Optional[str]) -> PatternFill:
    if not hex_color:
        return PatternFill()
    return PatternFill(fill_type="solid", fgColor=f"FF{hex_color}" if len(hex_color) == 6 else hex_color)


THIN_BORDER = Border(
    left=Side(style="thin"),
    right=Side(style="thin"),
    top=Side(style="thin"),
    bottom=Side(style="thin"),
)

LEFT = Alignment(horizontal="left", vertical="center", wrap_text=True)
LEFT_TOP = Alignment(horizontal="left", vertical="top", wrap_text=True)
CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)


# ============================================================
# SCORE / PRIORITY HELPERS
# ============================================================


def _clamp_score(score: Any) -> int:
    try:
        rounded = int(round(float(score)))
    except (TypeError, ValueError):
        rounded = 3
    return min(5, max(1, rounded))


def _band_for(score: Any) -> Tuple[str, str]:
    """(label, color) for the 1-5 score band — e.g. (3 -> 'Partial', 'F39C12')."""
    return BAND_COLORS[_clamp_score(score)]


def _priority_for(score: Any) -> Tuple[str, str]:
    """(label, color) priority derived from a criterion score."""
    return PRIORITY_BY_SCORE[_clamp_score(score)]


def _score_fill(score: Any) -> PatternFill:
    return _fill(SCORE_FILLS.get(_clamp_score(score)))


# ============================================================
# GENERIC LAYOUT HELPERS
# ============================================================


def _banner(ws, row: int, text: str, last_col: int, height: float = 25.5):
    """Full-width navy section banner, e.g. 'PROJECT OVERVIEW SNAPSHOT'."""
    for col in range(1, last_col + 1):
        cell = ws.cell(row=row, column=col)
        cell.fill = _fill(NAVY)
    ws.cell(row=row, column=1, value=text).font = _font(size=10, bold=True, color="FFFFFF")
    ws.cell(row=row, column=1).alignment = Alignment(horizontal="left", vertical="center")
    ws.row_dimensions[row].height = height


def _subtitle_bar(ws, row: int, text: str, last_col: int, height: float = 24.0):
    """Full-width teal metadata / instruction bar."""
    for col in range(1, last_col + 1):
        cell = ws.cell(row=row, column=col)
        cell.fill = _fill(TEAL)
    ws.cell(row=row, column=1, value=text).font = _font(size=9, bold=False, color="FFFFFF")
    ws.cell(row=row, column=1).alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws.row_dimensions[row].height = height


def _title_bar(ws, row: int, text: str, last_col: int, height: float = 55.5):
    for col in range(1, last_col + 1):
        ws.cell(row=row, column=col).fill = _fill(NAVY)
    cell = ws.cell(row=row, column=1, value=text)
    cell.font = _font(size=14, bold=True, color="FFFFFF")
    cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ws.row_dimensions[row].height = height


def _table_header(ws, row: int, headers: List[str], fill_hex: str = TEAL, start_col: int = 1):
    for i, text in enumerate(headers):
        cell = ws.cell(row=row, column=start_col + i, value=text)
        cell.font = _font(size=9.5, bold=True, color="FFFFFF")
        cell.fill = _fill(fill_hex)
        cell.border = THIN_BORDER
        cell.alignment = CENTER


def _zebra(row_index_in_table: int) -> str:
    return ZEBRA_A if row_index_in_table % 2 == 0 else ZEBRA_B


def _write_row(ws, row: int, values: List[Any], zebra_hex: str, aligns: Optional[List[Alignment]] = None):
    for i, value in enumerate(values, start=1):
        cell = ws.cell(row=row, column=i, value=value)
        cell.font = _font(size=9.5, bold=False, color=TEXT_DARK)
        cell.fill = _fill(zebra_hex)
        cell.border = THIN_BORDER
        cell.alignment = (aligns[i - 1] if aligns else LEFT)


# ============================================================
# FILE NAME HELPERS
# ============================================================


def _safe_filename(text: str) -> str:
    text = re.sub(r'[<>:"/\\\\|?*]', "", text)
    text = text.strip()
    text = re.sub(r"\s+", "_", text)
    return text or "Untitled"


def _generate_output_path(project_overview: dict, output_directory: str) -> str:
    project = _safe_filename(project_overview.get("project_name", "Project"))
    audit_type = _safe_filename(project_overview.get("audit_type", "Audit"))
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{project}_{audit_type}_AI_Audit_Report_{timestamp}.xlsx"
    return os.path.join(output_directory, filename)


def _create_workbook():
    wb = Workbook()
    wb.remove(wb.active)
    return wb


def _first_present(d: Dict[str, Any], *keys, default=None):
    for key in keys:
        if key in d and d[key]:
            return d[key]
    return default


# ============================================================
# SHEET 1 — HOW TO USE  (static boilerplate; same for every report)
# ============================================================


def _create_how_to_use_sheet(
    wb: Workbook,
    project_overview: Dict[str, Any],
    documents_audited: int,
):
    ws = wb.create_sheet(SHEET_HOWTO)
    LAST_COL = 11  # A:K

    col_widths = {"A": 30, "B": 24, "C": 52, "D": 28, "E": 19.18, "F": 10}
    for col, width in col_widths.items():
        ws.column_dimensions[col].width = width
    for col_letter in ["G", "H", "I", "J", "K"]:
        ws.column_dimensions[col_letter].width = 12

    _title_bar(ws, 1, "AI Delivery Audit Report — User Guide", LAST_COL)
    ws.row_dimensions[2].height = 6

    project_name = project_overview.get("project_name", "")
    audit_type = project_overview.get("audit_type", "Audit")
    generated = datetime.now().strftime("%Y-%m-%d")
    meta = (
        f"  Project:  {project_name} |  Audit Type: {audit_type}  |  "
        f"Generated: {generated}  |  Documents Audited: {documents_audited}"
    )
    _subtitle_bar(ws, 3, meta, LAST_COL, height=35)
    ws.row_dimensions[4].height = 9.75
    # ws.row_dimensions[4].height = 14.75

    # ── About this document ──────────────────────────────────────────
    _banner(ws, 5, "  ABOUT THIS DOCUMENT", LAST_COL)
    about_text = (
        f"This report is the output of a structured {audit_type} AI Audit conducted as part of the "
        "Delivery Excellence initiative. It evaluates the quality and completeness of multiple project "
        "documents against a predefined KPI framework. Findings are intended for mid-to-senior delivery "
        "and practice leadership to prioritise remediation actions, track accountability, and improve "
        "document governance standards across engagements."
    )
    ws.merge_cells(start_row=6, start_column=1, end_row=6, end_column=LAST_COL)
    cell = ws.cell(row=6, column=1, value=about_text)
    cell.font = _font(size=10, color=TEXT_DARK)
    cell.alignment = LEFT_TOP
    cell.fill = _fill("FFFFFF")
    ws.row_dimensions[6].height = 49.5
    ws.row_dimensions[7].height = 9.75

    # ── Workbook navigation ──────────────────────────────────────────
    _banner(ws, 8, "  WORKBOOK NAVIGATION — WHAT'S IN EACH TAB", 5)
    nav_headers = ["Tab", "Name", "Purpose", "Primary Users", "Key Actions"]
    _table_header(ws, 9, nav_headers)
    nav_rows = [
        (SHEET_HOWTO, "This tab", "Orientation — start here before using any other tab",
         "All users", "Read the navigation guide and score legend"),
        (SHEET_EXEC, "Multi-doc scorecard", "One row per document: overall score, gap count, top strength & recommendation",
         "Directors, VPs, Partners", "Scan scores; identify outlier documents; review top actions"),
        (SHEET_FINDINGS, "Full KPI audit — all docs", "Every KPI row for every document; filter by doc, priority, or category",
         "Delivery Leads, PMOs, QA", "Filter by Document or Priority; assign owners; read evidence"),
        (SHEET_TRACKER, "Remediation log — all docs", "One open recommendation per document; status, due date",
         "Delivery Leads, PMOs", "Update Status weekly; escalate Overdue items"),
    ]
    row = 10
    for i, values in enumerate(nav_rows):
        _write_row(ws, row, list(values), _zebra(i))
        ws.row_dimensions[row].height = 33.75 if i == 0 else 39.75
        row += 1

    ws.row_dimensions[row].height = 9.75
    row += 1

    # ── Step by step ─────────────────────────────────────────────────
    _banner(ws, row, "  HOW TO USE THIS REPORT — STEP BY STEP", 3)
    row += 1
    _table_header(ws, row, ["Step", "Action", "Guidance"])
    row += 1
    steps = [
        ("1", "Start in Executive Summary",
         "Scan the per-document scorecard. Flag any document with an Overall Score below 3.0 or a "
         "'Weak'/'Missing' status for immediate attention. Use this view for steering committee updates."),
        ("2", "Drill into Detailed Findings",
         "Filter by Document Name to focus on one document at a time. Within a document, sort by Score "
         "ascending to see the weakest areas first. Read Finding, Evidence, and Recommendation before "
         "assigning an owner."),
        ("3", "Assign Actions in the Action Tracker",
         "Each document's highest-priority open recommendation appears in the Action Tracker. Set the "
         "Target Date and Status. Use the Status legend at the bottom of this tab. Escalate any Overdue "
         "item to the Delivery Manager."),
        ("4", "Review Detailed Findings for patterns",
         "Sort or filter Detailed Findings by Evaluation Metric across documents to spot systemic "
         "weaknesses — e.g., if a KPI scores low across most documents, that is a template or process "
         "issue, not a single-document issue."),
        ("5", "Re-audit after remediation",
         "Once remediation actions are closed, the Delivery Lead should confirm the underlying document "
         "has been updated. Re-run the audit to refresh scores in Detailed Findings and the Executive "
         "Summary view."),
    ]
    for i, values in enumerate(steps):
        _write_row(ws, row, list(values), _zebra(i), aligns=[CENTER, LEFT, LEFT])
        ws.row_dimensions[row].height = 51.75
        row += 1

    ws.row_dimensions[row].height = 9.75
    row += 1

    # ── Score legend ─────────────────────────────────────────────────
    _banner(ws, row, "  SCORE LEGEND", 4)
    row += 1
    _table_header(ws, row, ["Score", "Label", "What It Means", "Typical Action"])
    row += 1
    legend_rows = [
        (5, "Strong", "Criterion fully met — well-documented and comprehensive.",
         "No action needed. Note as a strength."),
        (4, "Good", "Largely met with minor gaps — mostly complete.",
         "Minor enhancement recommended."),
        (3, "Partial", "Partially addressed — key elements present but incomplete.",
         "Prioritise gap closure in next revision."),
        (2, "Weak", "Minimally addressed — significant gaps present.",
         "High-priority remediation required."),
        (1, "Missing", "Criterion not addressed at all in the document.",
         "Critical — immediate action required."),
    ]
    for score, label, meaning, action in legend_rows:
        band_label, band_color = BAND_COLORS[score]
        score_cell = ws.cell(row=row, column=1, value=score)
        score_cell.font = _font(size=9.5, bold=True, color="FFFFFF")
        score_cell.fill = _fill(band_color)
        score_cell.border = THIN_BORDER
        score_cell.alignment = CENTER

        zebra_hex = _zebra(score_and_index := (5 - score))
        for col, value in [(2, label), (3, meaning), (4, action)]:
            cell = ws.cell(row=row, column=col, value=value)
            cell.font = _font(size=9.5, color=TEXT_DARK)
            cell.fill = _fill(zebra_hex)
            cell.border = THIN_BORDER
            cell.alignment = LEFT
        ws.row_dimensions[row].height = 30
        row += 1

    row += 2

    # ── Status guide ─────────────────────────────────────────────────
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=3)
    banner_cell = ws.cell(row=row, column=1, value="  STATUS GUIDE — Use These Values in the Status Column")
    for col in range(1, 4):
        ws.cell(row=row, column=col).fill = _fill(NAVY)
    banner_cell.font = _font(size=10, bold=True, color="FFFFFF")
    banner_cell.alignment = Alignment(horizontal="left", vertical="center")
    ws.row_dimensions[row].height = 25.5
    row += 1

    status_rows = [
        ("Open", "Action not yet started"),
        ("In Progress", "Work underway"),
        ("Pending Review", "Draft ready; awaiting sign-off"),
        ("Closed", "Remediation complete and verified"),
        ("Overdue", "Past target date; needs escalation"),
        ("Deferred", "Intentionally pushed; agreed deferral"),
    ]
    for label, desc in status_rows:
        badge_fill, badge_font = STATUS_COLORS[label]
        ws.merge_cells(start_row=row, start_column=2, end_row=row, end_column=3)
        badge_cell = ws.cell(row=row, column=1, value=label)
        badge_cell.font = _font(size=9.5, bold=True, color=badge_font)
        badge_cell.fill = _fill(badge_fill)
        badge_cell.border = THIN_BORDER
        badge_cell.alignment = CENTER

        desc_cell = ws.cell(row=row, column=2, value=desc)
        desc_cell.font = _font(size=9.5, color=TEXT_DARK)
        desc_cell.fill = _fill(ZEBRA_A)
        # desc_cell.border = THIN_BORDER
        desc_cell.alignment = LEFT
        ws.row_dimensions[row].height = 14.5
        row += 1

    return ws


# ============================================================
# SHEET 2 — EXECUTIVE SUMMARY
# ============================================================


def _create_executive_summary_sheet(
    wb: Workbook,
    project_overview: Dict[str, Any],
    individual_audits: List[Dict[str, Any]],
    combined_summary: Dict[str, Any],
):
    ws = wb.create_sheet(SHEET_EXEC)
    LAST_COL = 10  # A:J

    widths = {"A": 44.27, "B": 75.82, "C": 51.45, "D": 9, "E": 17,
              "F": 9, "G": 15.27, "H": 28, "I": 16.73, "J": 15.18}
    for col, w in widths.items():
        ws.column_dimensions[col].width = w

    project_name = project_overview.get("project_name", "")
    client_name = project_overview.get("client_name", "")
    audit_type = project_overview.get("audit_type", "")
    total_kpis = sum(len(a.get("audit_results", [])) for a in individual_audits)

    _title_bar(ws, 1, "AI Delivery Audit — Executive Summary", LAST_COL, height=18)
    meta = (
        f"  Project: {project_name} | Client:  {client_name} |  Audit Type: {audit_type}  |  "
        f"Report Date: {datetime.now().strftime('%Y-%m-%d')} |  "
        f"Documents Audited: {len(individual_audits)}  |  Total KPIs Evaluated: {total_kpis}"
    )
    _subtitle_bar(ws, 2, meta, LAST_COL, height=35)

    row = 5
    _banner(ws, row, "  PROJECT OVERVIEW SNAPSHOT", LAST_COL, height=24)
    row += 1

    overall_score = combined_summary.get("overall_project_score")
    gaps_and_risks = _first_present(combined_summary, "gaps_and_risks", "risks",
                                     "major_gaps_and_risks", default=[])
    strengths = _first_present(combined_summary, "strengths", "project_strengths", default=[])
    recommendations = _first_present(combined_summary, "recommendations", "recommendation", default=[])
    cross_doc_findings = _first_present(combined_summary, "cross_document_findings", "findings", default=[])

    labels = ["Overall Project Score", "Total Gaps and Risks", "Total Strengths",
              "Total Recommendations", "Cross Document Findings"]
    for i, label in enumerate(labels):
        cell = ws.cell(row=row, column=1 + 2 * i, value=label)
        cell.font = _font(size=9, bold=True, color=NAVY)
        cell.fill = _fill(ZEBRA_A)
        cell.alignment = CENTER
    ws.row_dimensions[row].height = 25
    row += 1

    score_label, score_color = _band_for(overall_score) if overall_score is not None else ("N/A", "808080")
    metric_values = [
        (f"{round(overall_score, 2)} / 5" if overall_score is not None else "N/A", score_color),
        (len(gaps_and_risks), SNAPSHOT_GAPS_COLOR),
        (len(strengths), SNAPSHOT_STRENGTHS_COLOR),
        (len(recommendations), SNAPSHOT_RECS_COLOR),
        (len(cross_doc_findings), SNAPSHOT_FINDINGS_COLOR),
    ]
    for i, (value, color) in enumerate(metric_values):
        cell = ws.cell(row=row, column=1 + 2 * i, value=value)
        cell.font = _font(size=20, bold=True, color="FFFFFF")
        cell.fill = _fill(color)
        cell.alignment = CENTER
    ws.row_dimensions[row].height = 36
    row += 1

    # ── Executive summary narrative ──────────────────────────────────
    _banner(ws, row, "  EXECUTIVE SUMMARY", LAST_COL, height=24)
    row += 1
    exec_summary = combined_summary.get("executive_summary", "")
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=LAST_COL)
    cell = ws.cell(row=row, column=1, value=exec_summary)
    cell.font = _font(size=10, color=TEXT_DARK)
    cell.fill = _fill("FFFFFF")
    cell.alignment = LEFT_TOP
    ws.row_dimensions[row].height = 90
    row += 2

    # ── Document scorecard ───────────────────────────────────────────
    _banner(ws, row, "  DOCUMENT SCORECARD — One Row Per Document", 6, height=24)
    row += 1
    _table_header(ws, row, ["Document Name", "Document Type", "", "Status", "KPIs Evaluated", "Issues"],
                  fill_hex=NAVY)
    row += 1
    for i, audit in enumerate(individual_audits):

        results = audit.get("audit_results", [])

        doc_score = audit.get("overall_score", 0)
        scores = [
            r.get("score")
            for r in results
            if r.get("score") is not None
        ]
                
        issues = sum(
            1
            for r in results
            if _clamp_score(r.get("score", 0)) <= 3
        )

        band_label, band_color = _band_for(doc_score)
        zebra_hex = _zebra(i)

        name_cell = ws.cell(row=row, column=1, value=audit.get("filename", ""))
        type_cell = ws.cell(row=row, column=2, value=audit.get("matched_category", ""))
        for c in (name_cell, type_cell):
            c.font = _font(size=9.5, color=TEXT_DARK)
            c.fill = _fill(zebra_hex)
            c.border = THIN_BORDER
            c.alignment = LEFT

        score_cell = ws.cell(row=row, column=3, value=f"{round(doc_score, 2)} / 5")
        score_cell.font = _font(size=13, bold=True, color="FFFFFF")
        score_cell.fill = _fill(band_color)
        score_cell.border = THIN_BORDER
        score_cell.alignment = CENTER

        status_cell = ws.cell(row=row, column=4, value=band_label)
        status_cell.font = _font(size=9, color="FFFFFF")
        status_cell.fill = _fill(band_color)
        status_cell.border = THIN_BORDER
        status_cell.alignment = CENTER

        kpi_cell = ws.cell(row=row, column=5, value=len(results))
        kpi_cell.font = _font(size=9.5, color=TEXT_DARK)
        kpi_cell.fill = _fill(zebra_hex)
        kpi_cell.border = THIN_BORDER
        kpi_cell.alignment = CENTER

        issues_cell = ws.cell(row=row, column=6, value=issues)
        issues_cell.font = _font(size=9.5, color=TEXT_DARK)
        issues_cell.fill = _fill(zebra_hex)
        issues_cell.border = THIN_BORDER
        issues_cell.alignment = CENTER

        ws.row_dimensions[row].height = 24
        row += 1

    row += 1

    # ── Cross Document Findings: Documents | Finding | Severity ──────
    row = _exec_subtable(
        ws, row, "Cross Document Findings", 3,  #LAST_COL
        headers=["Documents", "Finding", "Severity"],
        items=cross_doc_findings,
        doc_key="documents_involved", text_key="finding", tag_key="severity",
    )

    # ── Gaps & Risks: Documents | Gap | Impact ────────────────────────
    row = _exec_subtable(
        ws, row, "Gaps and Risks", 3,
        headers=["Documents", "Gap", "Impact"],
        items=gaps_and_risks,
        doc_key="source_documents", text_key="gap", tag_key="impact",
        tag_is_severity=False,
    )

    # ── Strengths: single column, nothing else ────────────────────────
    _banner(ws, row, "Strengths", 2, height=24)
    row += 1
    for i, item in enumerate(strengths):
        text = item if isinstance(item, str) else str(item.get("strength", item))
        cell = ws.cell(row=row, column=1, value=text)
        ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=2)
        cell.font = _font(size=9.5, color=TEXT_DARK)
        cell.fill = _fill(ZEBRA_A)
        cell.alignment = LEFT_TOP
        cell.border = THIN_BORDER
        ws.row_dimensions[row].height = 30
        row += 1

    ws.freeze_panes = "A3"
    return ws


def _exec_subtable(ws, row, title, last_col, headers, items, doc_key, text_key, tag_key,
                    tag_is_severity: bool = True):
    """
    Renders a 3-column Documents | <text> | <tag> table (Cross Document
    Findings, Gaps and Risks) with plain zebra-striped rows — matching
    the reference template, which does NOT color-code severity/impact
    text in these tables.
    """
    _banner(ws, row, title, last_col, height=24)
    row += 1
    _table_header(ws, row, headers)
    row += 1

    if not items:
        cell = ws.cell(row=row, column=1, value="None identified")
        cell.font = _font(size=9.5, color=TEXT_DARK)
        cell.fill = _fill(ZEBRA_A)
        cell.border = THIN_BORDER
        cell.alignment = LEFT
        row += 2
        return row

    for i, item in enumerate(items):
        zebra_hex = _zebra(i)
        if isinstance(item, dict):
            docs = item.get(doc_key) or item.get("documents") or []
            docs_text = ", ".join(docs) if isinstance(docs, list) else str(docs)
            text_val = item.get(text_key, "")
            tag_val = item.get(tag_key, "")
        else:
            docs_text, text_val, tag_val = "", str(item), ""

        _write_row(ws, row, [docs_text, text_val, tag_val], zebra_hex,
                   aligns=[LEFT_TOP, LEFT_TOP, LEFT_TOP if not tag_is_severity else CENTER])
        ws.row_dimensions[row].height = 36
        row += 1

    row += 1
    return row


# ============================================================
# SHEET 3 — DETAILED FINDINGS
# ============================================================


def _create_detailed_findings_sheet(
    wb: Workbook,
    project_overview: Dict[str, Any],
    individual_audits: List[Dict[str, Any]],
):
    ws = wb.create_sheet(SHEET_FINDINGS)
    LAST_COL = 10  # A:J

    widths = {"A": 8.82, "B": 17.73, "C": 13.27, "D": 12.45, "E": 29.82,
              "F": 9.54, "G": 8.18, "H": 53.54, "I": 34, "J": 40.45}
    for col, w in widths.items():
        ws.column_dimensions[col].width = w

    _title_bar(ws, 1, "AI Delivery Audit — Detailed Findings (All Documents)", LAST_COL, height=55.5)
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=2)
    _subtitle_bar(
        ws, 2,
        "  Filter by 'Document' or 'Priority' to focus on a specific doc or risk tier. "
        "Sort 'Score' ascending to see weakest areas first.",
        LAST_COL, height=24,
    )
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=5)
    ws.row_dimensions[3].height = 33.75

    headers = ["Doc ID", "Document Name", "Doc Type", "Evaluation Category", "Evaluation Metric",
               "Priority", "Score", "Finding", "Evidence (from Document)", "Recommendation"]
    _table_header(ws, 4, headers, fill_hex=NAVY)

    row = 5
    for doc_index, audit in enumerate(individual_audits, start=1):
        doc_id = f"DOC-{doc_index:02d}"
        filename = audit.get("filename", "")
        doc_type = audit.get("matched_category", "")
        results = audit.get("audit_results", [])

        if not results:
            values = [doc_id, filename, doc_type, "", "", "Critical", 0,
                      audit.get("summary", "Audit failed — re-run required."), "", ""]
            _write_row(ws, row, values, "FFFFFF",
                       aligns=[CENTER, LEFT, LEFT, CENTER, LEFT, CENTER, CENTER, LEFT_TOP, LEFT_TOP, LEFT_TOP])
            ws.cell(row=row, column=1).font = _font(size=9.5, bold=True, color="FFFFFF")
            ws.cell(row=row, column=1).fill = _fill(NAVY)
            ws.cell(row=row, column=6).font = _font(size=9.5, bold=True, color="FFFFFF")
            ws.cell(row=row, column=6).fill = _fill(PRIORITY_BY_SCORE[1][1])
            ws.cell(row=row, column=7).fill = _score_fill(0)
            ws.row_dimensions[row].height = 40
            row += 1
            continue

        for result in results:
            score = result.get("score", 0)
            priority_label, priority_color = _priority_for(score)

            values = [
                doc_id, filename, doc_type,
                result.get("evaluation_category", ""),
                result.get("evaluation_metric", ""),
                priority_label,
                score,
                result.get("finding", ""),
                result.get("evidence", ""),
                result.get("recommendation", ""),
            ]
            _write_row(ws, row, values, "FFFFFF",
                       aligns=[CENTER, LEFT, LEFT, CENTER, LEFT, CENTER, CENTER, LEFT_TOP, LEFT_TOP, LEFT_TOP])

            id_cell = ws.cell(row=row, column=1)
            id_cell.font = _font(size=9.5, bold=True, color="FFFFFF")
            id_cell.fill = _fill(NAVY)

            priority_cell = ws.cell(row=row, column=6)
            priority_cell.font = _font(size=9.5, bold=True, color="FFFFFF")
            priority_cell.fill = _fill(priority_color)

            score_cell = ws.cell(row=row, column=7)
            score_cell.fill = _score_fill(score)
            score_cell.font = _font(size=9.5, bold=False, color=TEXT_DARK)

            ws.row_dimensions[row].height = 66
            row += 1

    ws.freeze_panes = "A5"
    ws.auto_filter.ref = f"A4:J{row - 1}" if row > 5 else "A4:J4"
    return ws


# ============================================================
# SHEET 4 — ACTION TRACKER
# ============================================================


def _top_recommendation_for_doc(audit: Dict[str, Any]) -> Tuple[str, str, str]:
    """
    Picks the single highest-priority open recommendation for a
    document: the criterion with the lowest score (i.e. the most
    critical gap). Returns (recommendation_text, priority_label,
    priority_color).
    """
    results = audit.get("audit_results", [])
    if not results:
        return (
            audit.get("summary", "Re-run the audit for this document — no criteria were evaluated."),
            *PRIORITY_BY_SCORE[1],
        )

    weakest = min(
        results,
        key=lambda r: (
            _clamp_score(r.get("score", 5)),
            0 if (
                r.get("evaluation_category", "") or ""
            ).strip().lower() == "must have" else 1,
            r.get("criterion_number", 999),
        ),
    )

    recommendation = weakest.get("recommendation", "")
    label, color = _priority_for(weakest.get("score", 3))
    return recommendation, label, color


def _create_action_tracker_sheet(
    wb: Workbook,
    project_overview: Dict[str, Any],
    individual_audits: List[Dict[str, Any]],
):
    ws = wb.create_sheet(SHEET_TRACKER)
    LAST_COL = 8  # A:H

    widths = {"A": 25.73, "B": 70, "C": 9, "D": 12.27, "E": 8.54,
              "F": 11.73, "G": 17.18, "H": 12.18}
    for col, w in widths.items():
        ws.column_dimensions[col].width = w

    _title_bar(ws, 1, "AI Delivery Audit — Remediation Action Tracker (All Documents)", LAST_COL, height=18)
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=2)
    _subtitle_bar(
        ws, 3,
        "  Update 'Status' and 'Progress / Notes' weekly. Filter by Document or Priority to manage "
        "workload. Escalate any Overdue item to the Delivery Manager.",
        LAST_COL, height=24,
    )
    ws.merge_cells(start_row=3, start_column=1, end_row=3, end_column=2)
    ws.row_dimensions[2].height = 6

    headers = ["Document Name", "Recommendation", "Priority", "Target Date", "Status",
               "Progress / Notes", "Completion Date", "Verified By"]
    _table_header(ws, 5, headers, fill_hex=NAVY)

    row = 6
    for i, audit in enumerate(individual_audits):
        recommendation, priority_label, priority_color = _top_recommendation_for_doc(audit)
        zebra_hex = _zebra(i)

        name_cell = ws.cell(row=row, column=1, value=audit.get("filename", ""))
        name_cell.font = _font(size=9.5, color=TEXT_DARK)
        name_cell.fill = _fill(zebra_hex)
        name_cell.border = THIN_BORDER
        name_cell.alignment = LEFT

        rec_cell = ws.cell(row=row, column=2, value=recommendation)
        rec_cell.font = _font(size=9.5, color=TEXT_DARK)
        rec_cell.fill = _fill("FFFFFF")
        rec_cell.border = THIN_BORDER
        rec_cell.alignment = LEFT_TOP

        pr_cell = ws.cell(row=row, column=3, value=priority_label)
        pr_cell.font = _font(size=9.5, bold=True, color="FFFFFF")
        pr_cell.fill = _fill(priority_color)
        pr_cell.border = THIN_BORDER
        pr_cell.alignment = CENTER

        target_cell = ws.cell(row=row, column=4, value=None)
        target_cell.fill = _fill(zebra_hex)
        target_cell.border = THIN_BORDER
        target_cell.alignment = LEFT

        status_fill, status_font = STATUS_COLORS["Open"]
        status_cell = ws.cell(row=row, column=5, value="Open")
        status_cell.font = _font(size=9.5, bold=True, color=status_font)
        status_cell.fill = _fill(status_fill)
        status_cell.border = THIN_BORDER
        status_cell.alignment = CENTER

        for col in (6, 7, 8):
            cell = ws.cell(row=row, column=col, value=None)
            cell.font = _font(size=9, color=PENDING_FONT_COLOR)
            cell.fill = _fill(PENDING_FILL)
            cell.border = THIN_BORDER
            cell.alignment = LEFT

        ws.row_dimensions[row].height = 36
        row += 1

    ws.freeze_panes = "A6"
    ws.auto_filter.ref = f"A5:H{row - 1}" if row > 6 else "A5:H5"
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
    Main Excel export entry point. Builds the 4-sheet workbook:
    How To Use, Executive Summary, Detailed Findings, Action Tracker.

    Parameters
    ----------
    project_overview:
        Project metadata, e.g.
        {"project_name": "Arthur_AI_reporting", "audit_type": "STAR",
         "client_name": "Arthur AI"}

    individual_audits:
        Output from document_auditor.py — see module docstring for the
        expected per-criterion shape (an optional "tier" key is read
        for the Detailed Findings "Evaluation Category" column).

    combined_summary:
        Cross-document AI summary (executive_summary, cross_document_
        findings, gaps_and_risks, strengths, recommendations,
        overall_project_score, documents_audited).

    output_directory:
        Local folder before SharePoint upload.

    Returns
    -------
    str
        Generated Excel file path.
    """

    os.makedirs(output_directory, exist_ok=True)

    wb = _create_workbook()

    _create_how_to_use_sheet(wb, project_overview, len(individual_audits))
    _create_executive_summary_sheet(wb, project_overview, individual_audits, combined_summary)
    _create_detailed_findings_sheet(wb, project_overview, individual_audits)
    _create_action_tracker_sheet(wb, project_overview, individual_audits)

    output_path = _generate_output_path(project_overview, output_directory)

    try:
        wb.save(output_path)
    except PermissionError as exc:
        raise PermissionError(
            f"Could not save '{output_path}'. "
            f"Close the file if it is already open in Excel, then retry."
        ) from exc

    return output_path
