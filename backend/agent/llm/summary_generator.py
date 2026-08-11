"""
summary_generator.py  —  Stage 5 LLM call

Token-optimisation changes vs previous version
------------------------------------------------
1. _slim_audit_payload: sends only metric+score+finding to summary LLM,
   not full evidence/recommendation. Saves 60-70% input tokens here.
2. Fixed bug: was calling _build_llm() (private) when fn was build_llm().
3. Removed duplicate chain construction inside generate_combined_summary.
4. Short-circuit for single-document: skips cross-doc LLM call entirely.
"""
from __future__ import annotations

import json

import truststore
truststore.inject_into_ssl()

from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from tenacity import retry, wait_exponential, stop_after_attempt
from config.settings import settings

#-------------Langfuse integration-------------
from typing import Any
from agent.langfuse.langfuse_client import (
     get_langfuse_handler
)
langfuse_handler = get_langfuse_handler()

def _slim_audit_payload(individual_audits: list[dict]) -> list[dict]:
    """Strip evidence/recommendation before sending to summary LLM."""
    slim = []
    for audit in individual_audits:
        slim.append({
            "filename": audit.get("filename"),
            "matched_category": audit.get("matched_category"),
            "overall_score": audit.get("overall_score", 0),
            "summary": audit.get("summary", ""),
            "error": audit.get("error"),
            "audit_results": [
                {
                    "evaluation_category": r.get("evaluation_category"),
                    "evaluation_metric": r.get("evaluation_metric"),
                    "score": r.get("score"),
                    "finding": r.get("finding"),
                }
                for r in audit.get("audit_results", [])
            ],
        })
    return slim


def _build_single_doc_summary(audit: dict) -> dict:
    """
    Build a combined summary directly from a single document audit
    without any LLM call. Maps individual audit fields into the
    same schema the multi-doc summary LLM returns.
    """
    category = audit.get("matched_category", "Unknown")
    score    = audit.get("overall_score", 0)

    # Pull findings, strengths, recommendations out of audit_results
    findings        = []
    strengths       = []
    recommendations = []

    for r in audit.get("audit_results", []):
        finding = r.get("finding", "")
        s       = r.get("score", 0)

        if s >= 4:
            strengths.append(
                f"[{r.get('evaluation_metric')}] {finding}"
            )
        elif s <= 2:
            findings.append(finding)
            recommendations.append({
                "recommendation": r.get("recommendation", finding),
                "priority":       "high" if s <= 1 else "medium",
                "related_documents": [audit.get("filename", category)],
            })
        else:
            findings.append(finding)

    summary = {
        "overall_project_score":  score,
        "executive_summary":      audit.get("summary", "No summary available."),
        "cross_document_findings": [],   # only one doc — nothing to correlate
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
        "document_scores": {category: score},
    }

    return summary


def _print_summary(summary: dict):
    """Shared pretty-printer for both single and multi-doc paths."""
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
        print("None (single document — no cross-document correlation needed)")

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
    strengths = summary.get("strengths", [])
    if strengths:
        for s in strengths:
            print(f"✓ {s}")
    else:
        print("None")

    print("\nRecommendations")
    print("-" * 110)
    recs = summary.get("recommendations", [])
    if recs:
        for i, r in enumerate(recs, 1):
            print(f"{i}. [{r.get('priority', 'Medium').upper()}] {r.get('recommendation')}")
            print(f"   Documents : {', '.join(r.get('related_documents', []))}")
    else:
        print("None")

    print("\nDocument Scores")
    print("-" * 110)
    for doc, score in summary.get("document_scores", {}).items():
        print(f"{doc:<40} {score}/5")

    print("=" * 110)


SUMMARY_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        """You are a senior delivery audit director reviewing cross-document results.
Your job: cross-document analysis only. Do not re-audit individual documents.
Identify contradictions, common gaps, recurring risks, strengths, recommendations.
Return ONLY valid JSON — no markdown, no code fences.
Schema:
{{
  "overall_project_score": 4.2,
  "executive_summary": "...",
  "cross_document_findings": [{{"finding":"...","documents_involved":[],"severity":"high"}}],
  "gaps_and_risks": [{{"gap":"...","impact":"...","source_documents":[]}}],
  "strengths": ["..."],
  "recommendations": [{{"recommendation":"...","priority":"high","related_documents":[]}}],
  "document_scores": {{"SOW": 4.5}}
}}"""
    ),
    (
        "human",
        "Framework: {audit_type}\n\nDocument audit results:\n{individual_audits_json}\n\nGenerate the combined cross-document summary."
    ),
])


def build_llm():
    return ChatOpenAI(
        base_url=settings.AZURE_OPENAI_ENDPOINT,
        api_key=settings.AZURE_OPENAI_API_KEY,
        model=settings.AZURE_OPENAI_MODEL,
        temperature=0,
        max_tokens=2000,
    )

@retry(
    wait=wait_exponential(
        multiplier=2,
        min=5,
        max=60,
    ),
    stop=stop_after_attempt(5),
)

def invoke_summary(
    llm,
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

    token_usage = {
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "total_tokens": 0,
    }

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

    # Parse JSON manually since we bypassed JsonOutputParser
    content = response.content.strip()
    if content.startswith("```"):
        content = content.strip("`")
        if content.lower().startswith("json"):
            content = content[4:]
        content = content.strip()

    summary = json.loads(content)

    return summary, token_usage


def generate_combined_summary(
    individual_audits: list[dict],
    project_overview: dict,
    audit_type: str,
    audit_trace : Any = None,
) -> dict:

    # ── SHORT-CIRCUIT: single document ────────────────────────────────────────
    if len(individual_audits) == 1:
        print("\nSingle document detected — skipping cross-document LLM call.")
        summary = _build_single_doc_summary(individual_audits[0])
        _print_summary(summary)
        return summary
    # ──────────────────────────────────────────────────────────────────────────

    slim_payload = _slim_audit_payload(individual_audits)

    criteria_count = sum(
        len(a.get("audit_results", []))
        for a in slim_payload
    )

    print(
        f"Correlating {len(slim_payload)} document audit(s) — "
        f"{criteria_count} criteria rows"
    )

    # Do not call the summary LLM when every individual audit failed
    # or returned no criterion results.
    if criteria_count == 0:
        print(
            "No audit criteria available. "
            "Skipping combined summary LLM call."
        )

        summary = {
            "overall_project_score": 0,
            "executive_summary": (
                "No audit results were available for combined analysis. "
                "Check the individual document audit errors."
            ),
            "cross_document_findings": [],
            "gaps_and_risks": [],
            "strengths": [],
            "recommendations": [],
            "document_scores": {
                a.get("matched_category", "Unknown"): (
                    a.get("overall_score", 0)
                )
                for a in individual_audits
            },
        }

        _print_summary(summary)
        return summary

    llm = build_llm()

    try:
        payload = {
            "audit_type": audit_type,
            "individual_audits_json": json.dumps(
                slim_payload,
                indent=2,
            ),
        }

        summary_observation = None

        if audit_trace:
            summary_observation = audit_trace.span(
                name="Combined Project Summary",
                metadata={
                    "audit_type": audit_type,
                    "documents": len(individual_audits),
                    "criteria_rows": criteria_count,
                    "payload_size": len(json.dumps(slim_payload)),
                },
            )

        summary, token_usage = invoke_summary(
            llm,
            payload,
            summary_observation=summary_observation
        )

        if summary_observation:
            summary_observation.update(
                output={
                    "overall_project_score": summary.get("overall_project_score"),
                    "cross_document_findings": len(
                        summary.get("cross_document_findings", [])
                    ),
                    "gaps": len(summary.get("gaps_and_risks", [])),
                    "strengths": len(summary.get("strengths", [])),
                    "recommendations": len(
                        summary.get("recommendations", [])
                    ),
                }
            )

        summary["token_usage"] = token_usage
        _print_summary(summary)

        if summary_observation:
            summary_observation.end()

        return summary

    except Exception as exc:
        print(f"Combined summary LLM error: {exc}")

        if summary_observation:
            summary_observation.update(
                    output={
                        "status": "failed"
                    }
                )

            summary_observation.end(
                    level="ERROR",
                    status_message=str(exc),
                )

        return {
            "overall_project_score": 0,
            "executive_summary":     f"Summary generation failed: {exc}",
            "cross_document_findings": [],
            "gaps_and_risks":          [],
            "strengths":               [],
            "recommendations":         [],
            "document_scores": {
                a.get("matched_category", "Unknown"): a.get("overall_score", 0)
                for a in individual_audits
            },
        }