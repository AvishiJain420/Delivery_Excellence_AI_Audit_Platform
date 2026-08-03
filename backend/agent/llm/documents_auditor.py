"""
document_auditor.py

Token optimisations in this version
-------------------------------------
1. Criteria sent as indexed list — LLM returns array by position,
   never echoes back category/metric/pointer text. Saves ~40 tok/criterion.
2. Output schema stripped to index + score + finding + evidence + recommendation.
3. Dynamic max_tokens based on criterion count — never over-allocates.
4. Image dimension downscaling applied before LLM call.
5. Token usage logged per document.
6. Results re-merged with framework by index in Python — guaranteed order.
"""
from __future__ import annotations

import base64
import io
import traceback
from typing import List

import truststore
truststore.inject_into_ssl()

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from agent.document import Document
from config.settings import settings


# ============================================================
# LLM FACTORY
# ============================================================

def _calculate_max_tokens(criterion_count: int) -> int:
    """
    Each criterion needs ~110 output tokens max
    (40 finding + 25 evidence + 35 recommendation + 10 score/index overhead).
    Add 25% buffer. Hard cap at 4096.
    """
    return min(int(criterion_count * 110 * 1.25), 4096)


def build_llm(criterion_count: int = 20) -> ChatOpenAI:
    return ChatOpenAI(
        base_url=settings.AZURE_OPENAI_ENDPOINT,
        api_key=settings.AZURE_OPENAI_API_KEY,
        model=settings.AZURE_OPENAI_MODEL,
        temperature=0,
        max_tokens=_calculate_max_tokens(criterion_count),
    )


# ============================================================
# OUTPUT SCHEMA
# ============================================================

# ============================================================
# OUTPUT SCHEMA
# ============================================================

class AuditCriterionResult(BaseModel):
    """
    Minimal LLM response for one framework criterion.

    The LLM returns only the criterion index and audit output.
    Framework metadata is restored in Python using criterion_index.
    """
    criterion_index: int = Field(
        ge=1,
        description=(
            "The 1-based criterion number from the framework list. "
            "Must match the criterion number exactly."
        )
    )
    score: int = Field(
        ge=1,
        le=5,
        description="Audit score from 1 to 5."
    )
    finding: str = Field(
        description="Direct finding, maximum 40 words."
    )
    evidence: str = Field(
        description=(
            'Direct supporting evidence, maximum 25 words, '
            'or exactly "No evidence found."'
        )
    )
    recommendation: str = Field(
        description="Actionable recommendation, maximum 35 words."
    )


class AuditDocumentResponse(BaseModel):
    """
    Parent response returned by the LLM.

    Keep the field name as audit_results because the rest of the
    application already uses audit_results.
    """
    audit_results: List[AuditCriterionResult] = Field(
        description=(
            "Exactly one audit result for every framework criterion, "
            "in criterion_index order."
        )
    )

# ============================================================
# FRAMEWORK FORMATTER
# ============================================================

def format_framework(framework: list[dict]) -> str:
    """
    Sends only the index and evaluation pointer to the LLM.
    Category and metric are NOT sent — they are re-attached from
    the framework list in Python after the call.

    Before: 4 fields × N criteria = ~80 tokens overhead per criterion
    After:  2 fields × N criteria = ~20 tokens overhead per criterion
    Saving: ~60 tokens per criterion
    """
    rows = []
    for i, item in enumerate(framework, 1):
        rows.append(
            f"{i}. {item.get('evaluation_pointer', '')}"
        )
    return "\n".join(rows)


# ============================================================
# IMAGE RESIZING
# ============================================================

MAX_IMAGE_DIMENSION = 512  # pixels — sufficient for diagram/chart reading
MAX_IMAGES_PER_DOC = 15


def _resize_image_bytes(img_bytes: bytes) -> bytes:
    """
    Resizes an image so its longest dimension is MAX_IMAGE_DIMENSION.
    Smaller images are returned unchanged.
    PNG output for consistency.

    Token saving: a 1024×1024 image costs ~765 tokens in GPT-4o.
    A 512×512 image costs ~255 tokens. Saving ~510 tokens per image.
    """
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(img_bytes))

        # Convert RGBA/P mode images to RGB for JPEG compat
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")

        max_dim = max(img.width, img.height)
        if max_dim <= MAX_IMAGE_DIMENSION:
            return img_bytes  # already small enough

        scale = MAX_IMAGE_DIMENSION / max_dim
        new_w = max(1, int(img.width * scale))
        new_h = max(1, int(img.height * scale))
        img = img.resize((new_w, new_h), Image.LANCZOS)

        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()

    except Exception as e:
        print(f"  Image resize warning: {e}")
        return img_bytes  # return original if resize fails


def _prepare_images(images: list[bytes]) -> list[bytes]:
    """
    Caps at MAX_IMAGES_PER_DOC and resizes each to MAX_IMAGE_DIMENSION.
    """
    capped = images[:MAX_IMAGES_PER_DOC]
    if len(images) > MAX_IMAGES_PER_DOC:
        print(f"  Images capped: {len(images)} → {MAX_IMAGES_PER_DOC}")

    resized = []
    for i, img in enumerate(capped):
        original_size = len(img)
        resized_img = _resize_image_bytes(img)
        resized_size = len(resized_img)
        if original_size != resized_size:
            print(f"  Image {i+1}: {original_size//1024}KB → {resized_size//1024}KB")
        resized.append(resized_img)

    return resized


# ============================================================
# BUILD LLM MESSAGE PAYLOAD
# ============================================================

SYSTEM_PROMPT = """You are a Delivery Excellence Auditor evaluating ONE project document.

Document category: {document_category}

Evaluate every criterion in the numbered framework list.

Rules:
- Return exactly one result for every criterion.
- Never skip, merge, or duplicate criteria.
- Use criterion_index equal to the 1-based number shown in the framework.
- Return criterion indexes in ascending order.
- Do not return evaluation_category, evaluation_metric, or evaluation_pointer.
- Do not repeat the criterion text.
- Finding: maximum 40 words. Start directly with the finding.
- Evidence: maximum 25 words. Quote the most relevant evidence directly.
- If evidence is absent, write exactly "No evidence found."
- Recommendation: maximum 35 words. Provide actionable steps only.
- Score: 5=Excellent, 4=Good, 3=Average, 2=Weak, 1=Missing.

Framework:
{framework}

Return a JSON object with this exact structure:

{{
  "audit_results": [
    {{
      "criterion_index": 1,
      "score": 1,
      "finding": "...",
      "evidence": "...",
      "recommendation": "..."
    }}
  ]
}}

Return exactly one item for every criterion.
Do not return markdown or any text outside the JSON object.
"""
def _build_messages(
    document: Document,
    framework: list[dict],
    category: str,
    prepared_images: list[bytes],
) -> list:
    """
    Builds the message list for the LLM call.
    Ensures the text content is always a single string.
    Images are appended as separate vision blocks.
    """
    system_msg = SystemMessage(
        content=SYSTEM_PROMPT.format(
            document_category=category,
            framework=format_framework(framework),
        )
    )

    # document.to_llm_payload() is returning a list.
    # OpenAI requires the "text" value to be a single string.
    document_payload = document.to_llm_payload()

    if isinstance(document_payload, (list, tuple)):
        document_payload = "\n\n".join(
            str(part) for part in document_payload
            if part is not None
        )
    else:
        document_payload = str(document_payload or "")

    human_content = [
        {
            "type": "text",
            "text": document_payload,
        }
    ]

    # Vision blocks
    for img_bytes in prepared_images:
        b64 = base64.b64encode(img_bytes).decode("utf-8")

        human_content.append({
            "type": "image_url",
            "image_url": {
                "url": f"data:image/png;base64,{b64}",
                "detail": "low",
            },
        })

    human_msg = HumanMessage(content=human_content)

    return [system_msg, human_msg]

# ============================================================
# MERGE RESULTS WITH FRAMEWORK BY INDEX
# ============================================================

def _merge_results_with_framework(
    audit_results: list[AuditCriterionResult],
    framework: list[dict],
    filename: str,
    category: str,
) -> list[dict]:
    """
    Zips LLM output back to framework metadata by criterion_index.
    Guarantees correct order and fills missing criteria with score=1.
    """
    # Build a lookup by index
    result_map: dict[int, AuditCriterionResult] = {
        r.criterion_index: r for r in audit_results
    }

    merged = []
    for i, criterion in enumerate(framework, 1):
        r = result_map.get(i)
        if r:
            merged.append({
                "criterion_number":    i,
                "filename":            filename,
                "matched_category":    category,
                "evaluation_category": criterion.get("evaluation_category", ""),
                "evaluation_metric":   criterion.get("evaluation_metric", ""),
                "evaluation_pointer":  criterion.get("evaluation_pointer", ""),
                "score":               r.score,
                "finding":             r.finding,
                "evidence":            r.evidence,
                "recommendation":      r.recommendation,
            })
        else:
            # LLM skipped this criterion — fill with missing
            print(f"  WARNING: criterion {i} missing from LLM response — filling as score 1")
            merged.append({
                "criterion_number":    i,
                "filename":            filename,
                "matched_category":    category,
                "evaluation_category": criterion.get("evaluation_category", ""),
                "evaluation_metric":   criterion.get("evaluation_metric", ""),
                "evaluation_pointer":  criterion.get("evaluation_pointer", ""),
                "score":               1,
                "finding":             "Not evaluated by model.",
                "evidence":            "No evidence found.",
                "recommendation":      "Ensure this criterion is addressed in the document.",
            })

    return merged


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
        total_weight += w * 5  # normalise against max possible (5 per criterion)
    return round((total / total_weight) * 5, 2) if total_weight else 0.0


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

    # Prepare images — cap + resize before sending to LLM
    prepared_images = _prepare_images(document.images)

    llm = build_llm(criterion_count=len(framework))

    messages = _build_messages(document, framework, category, prepared_images)

    print(f"\nAuditing : {document.filename}")
    print(f"Criteria : {len(framework)}  "
          f"Images: {len(document.images)} → {len(prepared_images)} (after cap)  "
          f"Max tokens: {_calculate_max_tokens(len(framework))}")

    try:
        # Invoke with token usage tracking
        raw_response = llm.with_structured_output(
            AuditDocumentResponse,
            include_raw=True,
        ).invoke(messages)

        response: AuditDocumentResponse = raw_response["parsed"]

        token_usage = {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
        }

        # Log token usage
        raw = raw_response.get("raw")
        if raw and hasattr(raw, "usage_metadata"):
            usage = raw.usage_metadata
            token_usage ={
                "prompt_tokens": usage.get("input_tokens", 0),
                "completion_tokens": usage.get("output_tokens", 0),
                "total_tokens": usage.get("total_tokens", 0),
            }
            print(f"  Tokens — input: {usage.get('input_tokens', '?')}  "
                  f"output: {usage.get('output_tokens', '?')}  "
                  f"total: {usage.get('total_tokens', '?')}")

        # Merge results back with framework metadata by index
        merged = _merge_results_with_framework(
            response.audit_results, framework, document.filename, category
        )

        overall = calculate_weighted_score(merged)

        # Print audit summary
        gaps = [r for r in merged if r["score"] <= 3]
        print(f"\nAudit Summary")
        print("-" * 60)
        print(f"Overall Score : {overall}/5")
        print(f"Total Criteria: {len(merged)}")
        print(f"Gaps Found    : {len(gaps)}")
        if gaps:
            print("\nTop Issues")
            for g in gaps[:5]:
                print(f"  - [{g['criterion_number']}] {g['evaluation_metric']} ({g['score']}/5)")

        return {
            "filename":        document.filename,
            "matched_category": category,
            "audit_results":   merged,
            "overall_score":   overall,
            "token_usage":      token_usage,
        }

    except Exception as exc:
        print("\nAUDIT FAILED")
        print("Document:", document.filename)
        print("Error:", repr(exc))

        if 'raw_response' in locals():
            print("Raw response:")
            print(raw_response)

        traceback.print_exc()
        return {
            "filename":        document.filename,
            "matched_category": category,
            "audit_results":   [],
            "overall_score":   0,
            "summary":         f"Audit failed: {exc}",
            "error":           str(exc),
            "token_usage": {
                "prompt_tokens": 0, 
                "completion_tokens": 0,
                "total_tokens": 0,
            },
        }


# ============================================================
# BATCH CONVENIENCE
# ============================================================

def audit_documents(documents: list[Document]) -> list[dict]:
    return [audit_document(doc) for doc in documents]