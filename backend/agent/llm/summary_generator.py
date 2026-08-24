"""
summary_generator.py  —  Stage 5 LLM call
"""
from __future__ import annotations

import json
import re

import truststore
truststore.inject_into_ssl()

from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from tenacity import retry, wait_exponential, stop_after_attempt
from config.settings import settings

from typing import Any
from agent.langfuse.langfuse_client import get_langfuse_handler

langfuse_handler = get_langfuse_handler()


# ============================================================
# PAYLOAD HELPERS
# ============================================================

def _slim_audit_payload(individual_audits: list[dict]) -> list[dict]:
    """Strip evidence from criteria — saves 60-70% input tokens."""
    slim = []
    for audit in individual_audits:
        slim.append({
            "filename": audit.get("filename"),
            "matched_category": audit.get("matched_category"),
            "overall_score": audit.get("overall_score", 0),
            "audit_results": [
                {
                    "criterion_number":    r.get("criterion_number"),
                    "evaluation_category": r.get("evaluation_category"),
                    "evaluation_metric":   r.get("evaluation_metric"),
                    "score":               r.get("score"),
                    "finding":             r.get("finding"),
                    "recommendation":      r.get("recommendation"),
                }
                for r in audit.get("audit_results", [])
            ],
        })
    return slim


def _calculate_project_score(individual_audits: list[dict]) -> float:
    """
    Deterministic weighted score — Must Have = weight 2, others = weight 1.
    Mirrors calculate_weighted_score() in document_auditor.py exactly.
    """
    total = 0.0
    total_weight = 0.0
    for audit in individual_audits:
        for row in audit.get("audit_results", []):
            try:
                score = float(row.get("score", 0))
            except (TypeError, ValueError):
                continue
            if not (1 <= score <= 5):
                continue
            category = (row.get("evaluation_category", "") or "").strip().lower()
            weight = 2 if category == "must have" else 1
            total        += score * weight
            total_weight += weight
    return round(total / total_weight, 2) if total_weight else 0.0


def _calculate_max_summary_tokens(criteria_count: int) -> int:
    """
    Summary output needs ~50 tokens per criterion for narrative.
    Add generous buffer. Floor at 3000, cap at 8000.
    """
    return max(3000, min(int(criteria_count * 60 * 1.5), 8000))


# ============================================================
# SINGLE-DOCUMENT SHORT-CIRCUIT
# ============================================================

def _build_single_doc_summary(audit: dict) -> dict:
    category = audit.get("matched_category", "Unknown")
    score    = audit.get("overall_score", 0)

    findings        = []
    strengths       = []
    recommendations = []

    for r in audit.get("audit_results", []):
        finding = r.get("finding", "")
        s       = r.get("score", 0)
        if s >= 4:
            strengths.append(f"[{r.get('evaluation_metric')}] {finding}")
        elif s <= 2:
            findings.append(finding)
            recommendations.append({
                "recommendation":  r.get("recommendation", finding),
                "priority":        "high" if s <= 1 else "medium",
                "related_documents": [audit.get("filename", category)],
            })
        else:
            findings.append(finding)

    return {
        "overall_project_score":   score,
        "executive_summary":       audit.get("summary", "No summary available."),
        "cross_document_findings": [],
        "gaps_and_risks": [
            {
                "gap":              f,
                "impact":           "See individual audit for details.",
                "source_documents": [audit.get("filename", category)],
            }
            for f in findings
        ],
        "strengths":       strengths,
        "recommendations": recommendations,
        "document_scores": {audit.get("filename", category): score},
    }


# ============================================================
# PRINT HELPER
# ============================================================

def _print_summary(summary: dict):
    print("\n" + "=" * 110)
    print("PROJECT AUDIT SUMMARY")
    print("=" * 110)
    print(f"Overall Project Score : {summary.get('overall_project_score', 0)}/5")

    print("\nExecutive Summary")
    print("-" * 110)
    print(summary.get("executive_summary", "No summary generated."))

    print("\nCross Document Findings")
    print("-" * 110)
    findings = summary.get("cross_document_findings", [])
    if findings:
        for i, f in enumerate(findings, 1):
            print(f"{i}. [{f.get('severity', 'N/A').upper()}] {f.get('finding')}")
            print(f"   Documents : {', '.join(f.get('documents_involved', []))}")
    else:
        print("None")

    print("\nMajor Gaps & Risks")
    print("-" * 110)
    gaps = summary.get("gaps_and_risks", [])
    if gaps:
        for i, g in enumerate(gaps, 1):
            print(f"{i}. Gap      : {g.get('gap')}")
            print(f"   Impact   : {g.get('impact')}")
            print(f"   Documents: {', '.join(g.get('source_documents', []))}")
    else:
        print("None")

    print("\nProject Strengths")
    print("-" * 110)
    for s in summary.get("strengths", []):
        print(f"✓ {s}")

    print("\nRecommendations")
    print("-" * 110)
    for i, r in enumerate(summary.get("recommendations", []), 1):
        print(f"{i}. [{r.get('priority', 'Medium').upper()}] {r.get('recommendation')}")
        print(f"   Documents : {', '.join(r.get('related_documents', []))}")

    print("\nDocument Scores")
    print("-" * 110)
    for doc, score in summary.get("document_scores", {}).items():
        print(f"{doc:<40} {score}/5")
    print("=" * 110)


# ============================================================
# PROMPT — LLM does NOT generate scores, Python calculates them
# ============================================================

SUMMARY_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        """You are a senior delivery audit director reviewing cross-document results.

Your job is cross-document analysis only. Do not re-audit individual documents.
Do not calculate or include overall_project_score or document_scores — Python calculates those.
Do not include any numerical scores in your output fields.

Identify:
- contradictions between documents
- common gaps appearing across multiple documents
- recurring risks
- strengths
- actionable recommendations

Return ONLY valid JSON — no markdown, no code fences, no trailing text after the closing brace.

Return this exact structure with no extra fields:
{{
  "executive_summary": "string, 3-5 sentences",
  "cross_document_findings": [
    {{
      "finding": "string",
      "documents_involved": ["filename1", "filename2"],
      "severity": "high|medium|low"
    }}
  ],
  "gaps_and_risks": [
    {{
      "gap": "string",
      "impact": "string",
      "source_documents": ["filename1"]
    }}
  ],
  "strengths": ["string"],
  "recommendations": [
    {{
      "recommendation": "string",
      "priority": "high|medium|low",
      "related_documents": ["filename1"]
    }}
  ]
}}

Keep responses concise. Maximum 5 items per list. Complete the JSON fully before stopping."""
    ),
    (
        "human",
        "Framework: {audit_type}\n\nDocument audit results:\n{individual_audits_json}\n\nGenerate the combined cross-document summary JSON."
    ),
])


# ============================================================
# JSON EXTRACTION — handles truncated or wrapped responses
# ============================================================

def _extract_json(content: str) -> dict:
    """
    Robustly extract JSON from LLM response.
    Handles: clean JSON, markdown fences, partial truncation.
    """
    content = content.strip()

    # Strip markdown fences if present
    if content.startswith("```"):
        content = re.sub(r"^```(?:json)?\s*", "", content)
        content = re.sub(r"\s*```$", "", content)
        content = content.strip()

    # Try clean parse first
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        pass

    # Try to find the outermost JSON object — handles trailing text
    brace_count = 0
    start = content.find("{")
    if start == -1:
        raise ValueError("No JSON object found in response")

    for i, char in enumerate(content[start:], start):
        if char == "{":
            brace_count += 1
        elif char == "}":
            brace_count -= 1
            if brace_count == 0:
                # Found complete object
                try:
                    return json.loads(content[start:i+1])
                except json.JSONDecodeError:
                    break

    # Last resort: try to repair truncated JSON by closing open structures
    # This handles the max_tokens truncation case
    truncated = content[start:]
    # Count unclosed braces and brackets
    open_braces   = truncated.count("{") - truncated.count("}")
    open_brackets = truncated.count("[") - truncated.count("]")

    # Close any open string (find last unclosed quote)
    repaired = truncated.rstrip().rstrip(",")
    if repaired.count('"') % 2 == 1:
        repaired += '"'

    # Close structures from innermost out
    repaired += "]" * max(0, open_brackets)
    repaired += "}" * max(0, open_braces)

    try:
        return json.loads(repaired)
    except json.JSONDecodeError as e:
        raise ValueError(f"Could not parse JSON even after repair: {e}\nContent preview: {content[:200]}")


# ============================================================
# LLM INVOCATION WITH RETRY
# ============================================================

def build_llm(max_tokens: int = 4000) -> ChatOpenAI:
    return ChatOpenAI(
        base_url=settings.AZURE_OPENAI_ENDPOINT,
        api_key=settings.AZURE_OPENAI_API_KEY,
        model=settings.AZURE_OPENAI_MODEL,
        temperature=0,
        max_tokens=max_tokens,
    )


@retry(
    wait=wait_exponential(multiplier=2, min=5, max=30),
    stop=stop_after_attempt(3),  # 3 retries is enough — 5 wastes time and money
)
def invoke_summary(
    llm: ChatOpenAI,
    payload: dict,
    summary_observation=None,
) -> tuple[dict, dict]:

    config = {
        "callbacks": [langfuse_handler],
        "run_name": "Combined Project Summary",
    }
    if summary_observation:
        config["metadata"] = {
            "langfuse_parent_observation_id": summary_observation.id
        }

    messages = SUMMARY_PROMPT.format_messages(**payload)
    response = llm.with_config(config).invoke(messages)

    token_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}

    if hasattr(response, "usage_metadata") and response.usage_metadata:
        usage = response.usage_metadata
        token_usage = {
            "prompt_tokens":     usage.get("input_tokens", 0),
            "completion_tokens": usage.get("output_tokens", 0),
            "total_tokens":      usage.get("total_tokens", 0),
        }
        print(f"  Summary tokens — input: {token_usage['prompt_tokens']}  "
              f"output: {token_usage['completion_tokens']}  "
              f"total: {token_usage['total_tokens']}")

        # Detect truncation — if output == max_tokens the response was cut off
        if token_usage["completion_tokens"] >= llm.max_tokens - 10:
            print(f"  WARNING: output hit max_tokens limit ({llm.max_tokens}). "
                  f"Response may be truncated.")

    content = response.content
    summary = _extract_json(content)

    return summary, token_usage


# ============================================================
# MAIN ENTRY POINT
# ============================================================

def generate_combined_summary(
    individual_audits: list[dict],
    project_overview: dict,
    audit_type: str,
    audit_trace: Any = None,
) -> dict:

    # Single document — skip LLM entirely
    if len(individual_audits) == 1:
        print("\nSingle document detected — skipping cross-document LLM call.")
        summary = _build_single_doc_summary(individual_audits[0])
        _print_summary(summary)
        return summary

    slim_payload = _slim_audit_payload(individual_audits)
    criteria_count = sum(len(a.get("audit_results", [])) for a in slim_payload)

    print(f"Correlating {len(slim_payload)} document audit(s) — {criteria_count} criteria rows")

    if criteria_count == 0:
        print("No audit criteria available. Skipping combined summary LLM call.")
        summary = {
            "overall_project_score": 0,
            "executive_summary":     "No audit results available for combined analysis.",
            "cross_document_findings": [],
            "gaps_and_risks":          [],
            "strengths":               [],
            "recommendations":         [],
            "document_scores": {
                a.get("filename", "Unknown"): a.get("overall_score", 0)
                for a in individual_audits
            },
        }
        _print_summary(summary)
        return summary

    # Dynamic max_tokens based on how much content we're summarising
    max_tokens = _calculate_max_summary_tokens(criteria_count)
    print(f"  Summary max_tokens set to: {max_tokens}")
    llm = build_llm(max_tokens=max_tokens)

    summary_observation = None
    if audit_trace:
        summary_observation = audit_trace.span(
            name="Combined Project Summary",
            metadata={
                "audit_type":    audit_type,
                "documents":     len(individual_audits),
                "criteria_rows": criteria_count,
            },
        )

    try:
        payload = {
            "audit_type":             audit_type,
            "individual_audits_json": json.dumps(slim_payload, indent=2),
        }

        summary, token_usage = invoke_summary(llm, payload, summary_observation)

        # Always overwrite scores with Python-calculated values
        # LLM is not asked to generate scores but just in case it does, override
        summary["overall_project_score"] = _calculate_project_score(individual_audits)
        summary["document_scores"] = {
            a.get("filename", "Unknown"): a.get("overall_score", 0)
            for a in individual_audits
        }
        summary["token_usage"] = token_usage

        # Ensure required keys exist even if LLM omitted them
        summary.setdefault("cross_document_findings", [])
        summary.setdefault("gaps_and_risks", [])
        summary.setdefault("strengths", [])
        summary.setdefault("recommendations", [])
        summary.setdefault("executive_summary", "Summary generated successfully.")

        if summary_observation:
            summary_observation.update(output={
                "overall_project_score":   summary["overall_project_score"],
                "cross_document_findings": len(summary["cross_document_findings"]),
                "gaps":                    len(summary["gaps_and_risks"]),
                "strengths":               len(summary["strengths"]),
                "recommendations":         len(summary["recommendations"]),
            })
            summary_observation.end()

        _print_summary(summary)
        return summary

    except Exception as exc:
        print(f"Combined summary LLM error: {exc}")

        if summary_observation:
            summary_observation.update(output={"status": "failed"})
            summary_observation.end(level="ERROR", status_message=str(exc))

        # Fallback — build a deterministic summary from individual audits
        # so the pipeline doesn't fail completely
        print("Building fallback summary from individual audit results...")

        all_findings     = []
        all_strengths    = []
        all_recs         = []

        for audit in individual_audits:
            filename = audit.get("filename", "Unknown")
            for r in audit.get("audit_results", []):
                s = r.get("score", 0)
                metric = r.get("evaluation_metric", "")
                finding = r.get("finding", "")
                if s >= 4:
                    all_strengths.append(f"[{filename}] {metric}: {finding}")
                elif s <= 2:
                    all_findings.append({
                        "gap":              finding,
                        "impact":           r.get("recommendation", ""),
                        "source_documents": [filename],
                    })
                    all_recs.append({
                        "recommendation":  r.get("recommendation", ""),
                        "priority":        "high" if s == 1 else "medium",
                        "related_documents": [filename],
                    })

        fallback_summary = {
            "overall_project_score":   _calculate_project_score(individual_audits),
            "executive_summary":       (
                f"Automated cross-document summary failed ({exc}). "
                f"Individual document scores are accurate. "
                f"Please review the Detailed Findings sheet for full criterion-level analysis."
            ),
            "cross_document_findings": [],
            "gaps_and_risks":          all_findings[:10],
            "strengths":               all_strengths[:10],
            "recommendations":         all_recs[:10],
            "document_scores": {
                a.get("filename", "Unknown"): a.get("overall_score", 0)
                for a in individual_audits
            },
            "token_usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
        }

        _print_summary(fallback_summary)
        return fallback_summary