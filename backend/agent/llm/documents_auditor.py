"""
document_auditor.py

Audits a single parsed Document against its framework criteria.

Token-optimisation changes vs previous version
------------------------------------------------
1. AuditCriterion drops `filename` + `matched_category` — they are
   on the parent AuditDocumentResponse, not every row.  Saves
   ~(20+30) × n_criteria tokens on every LLM call.

2. format_framework uses a compact numbered-table style instead of
   multi-line blocks. Saves ~4 lines (≈25 tokens) per criterion.

3. System prompt tightened: removed repetition, collapsed scoring
   rubric to one line, moved context-only notes to comments.

4. Summary field removed from AuditDocumentResponse — the summary
   generator never uses it per-document; we compute it ourselves.
"""
from __future__ import annotations
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import HumanMessage
from agent.document import Document
from config.settings import settings
from typing import List, Dict, Any
from pydantic import BaseModel, Field
import traceback
import truststore
truststore.inject_into_ssl()

# ============================================================
# LLM
# ============================================================

def build_llm() -> ChatOpenAI:
    # return ChatOpenAI(
    #     base_url="https://openrouter.ai/api/v1",
    #     api_key=settings.OPENROUTER_API_KEY,
    #     model="openai/gpt-5.2",
    #     temperature=0,
    #     max_tokens=1600,
    # )

    return  ChatOpenAI(
        base_url=settings.AZURE_OPENAI_ENDPOINT,
        api_key=settings.AZURE_OPENAI_API_KEY,
        model = settings.AZURE_OPENAI_MODEL,
        temperature=0,
        max_tokens=4000
    )


# ============================================================
# OUTPUT SCHEMA
# ============================================================

class AuditCriterion(BaseModel):
    """One evaluated criterion.

    filename / matched_category are intentionally omitted here — they
    live on the parent AuditDocumentResponse and are re-attached by
    audit_document() after the LLM call. This saves ~50 tokens × N
    criteria per document.
    """
    evaluation_category: str   # "Must Have" | "Good to Have"
    evaluation_metric: str
    evaluation_pointer: str
    score: int = Field(ge=1, le=5)
    finding: str
    evidence: str
    recommendation: str


class AuditDocumentResponse(BaseModel):
    audit_results: List[AuditCriterion]


# ============================================================
# FRAMEWORK FORMATTER  (compact table — saves ~25 tok/criterion)
# ============================================================

def format_framework(framework: list[dict]) -> str:
    """Compact numbered-table representation.

    Before (multi-line block):
        Criterion 1
        Priority: Must Have
        Metric: Executive Summary
        Evaluation Pointer: ...

    After (single block):
        1| Must Have | Executive Summary | Does the doc open with ...

    Saves roughly 4 lines (≈25 tokens) per criterion.
    """
    rows = []
    for i, item in enumerate(framework, 1):
        rows.append(
            f"{i}| {item.get('evaluation_category','')} "
            f"| {item.get('evaluation_metric','')} "
            f"| {item.get('evaluation_pointer','')}"
        )
    return "\n".join(rows)


# ============================================================
# SYSTEM PROMPT
# ============================================================

AUDIT_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        """You are a Delivery Excellence Auditor evaluating ONE project document.

Document category: {document_category}

Rules:
- Evaluate every criterion independently. Never skip or merge criteria.
- Quote evidence verbatim. If absent, state "No evidence found."
- Score: 5=Excellent 4=Good 3=Average 2=Weak 1=Missing

Framework (format: index| priority | metric | pointer):
{framework}

Return one AuditDocumentResponse. Every criterion → one AuditCriterion.
"""
    )
])


# ============================================================
# WEIGHTED SCORE
# ============================================================

def calculate_weighted_score(audit_results: list[dict]) -> float:
    """Must Have weight=2, Good to Have weight=1."""
    if not audit_results:
        return 0.0
    total = total_weight = 0
    for row in audit_results:
        w = 2 if row.get("evaluation_category", "").lower() == "must have" else 1
        total += row["score"] * w
        total_weight += w
    return round(total / total_weight, 2) if total_weight else 0.0


# ============================================================
# MAIN ENTRY POINT
# ============================================================

def audit_document(document: Document) -> dict:
    """Audit one parsed Document. Returns a plain dict for JSON serialisation."""
    framework: list[dict] = document.metadata.get("framework", [])
    category: str = document.metadata.get("matched_category", "General")

    if not framework:
        return {
            "filename": document.filename,
            "matched_category": category,
            "audit_results": [],
            "overall_score": 0,
            "summary": "No framework available.",
        }

    llm = build_llm()
    structured_llm = llm.with_structured_output(AuditDocumentResponse)

    messages = [
        *AUDIT_PROMPT.format_messages(
            document_category=category,
            framework=format_framework(framework),
        ),
        HumanMessage(content=document.to_llm_payload()),
    ]

    print(f"\nAuditing : {document.filename}")
    print(f"Criteria : {len(framework)}  Images: {len(document.images)}  "
          f"Blocks: {len(document.content_sequence)}")

    try:
        response: AuditDocumentResponse = structured_llm.invoke(messages)
        results = response.model_dump()["audit_results"]

        # Re-attach document-level context the LLM didn't need to repeat
        for item in results:
            item.setdefault("filename", document.filename)
            item.setdefault("matched_category", category)

        overall = calculate_weighted_score(results)

#---------------printing the overall sumamry of individual audit--------------------------
        gaps = [r for r in results if r["score"] <= 3]

        print("\nAudit Summary")
        print("-" * 60)

        print(f"Overall Score : {overall}/5")
        print(f"Total Criteria: {len(results)}")
        print(f"Gaps Found    : {len(gaps)}")

        if gaps:
            print("\nTop Issues")
            for g in gaps:
                print(f"- {g['evaluation_metric']} ({g['score']}/5)")

#-----------------------------------------------------------------------------------------

        return {
            "filename": document.filename,
            "matched_category": category,
            "audit_results": results,
            "overall_score": overall,
            }

    except Exception as exc:
        traceback.print_exc()
        return {
            "filename": document.filename,
            "matched_category": category,
            "audit_results": [],
            "overall_score": 0,
            "summary": f"Audit failed: {exc}",
            "error": str(exc),
        }


# ============================================================
# BATCH CONVENIENCE
# ============================================================

def audit_documents(documents: list[Document]) -> list[dict]:
    return [audit_document(doc) for doc in documents]