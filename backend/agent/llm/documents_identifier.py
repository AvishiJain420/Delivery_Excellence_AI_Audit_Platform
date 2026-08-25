import re
import unicodedata
from rapidfuzz import fuzz, process
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from typing import List, Literal
from pydantic import BaseModel
from config.settings import settings
import truststore
truststore.inject_into_ssl()

# ✅ Langfuse import — same pattern as document_auditor.py
from agent.langfuse.langfuse_client import get_langfuse_handler
langfuse_handler = get_langfuse_handler()

# ✅ Cost rates — adjust to match your Azure model/tier
COST_PER_1K_INPUT  = 0.005   # USD per 1k input tokens
COST_PER_1K_OUTPUT = 0.015   # USD per 1k output tokens


class DocumentIdentification(BaseModel):
    filename: str
    matched_category: str
    confidence: Literal["high", "medium", "low"]
    reasoning: str


class DocumentIdentificationResponse(BaseModel):
    identifications: List[DocumentIdentification]


# ============================================================
# STOP WORDS / THRESHOLD
# ============================================================

STOP_WORDS = {
    "final", "draft", "review", "reviewed", "latest",
    "copy", "new", "v1", "v2", "v3", "v4", "signed", "updated",
}

FUZZY_THRESHOLD = 80


# ============================================================
# NORMALISATION
# ============================================================

def normalize_text(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = text.lower()
    text = re.sub(r"\.[a-z0-9]+$", "", text)       # remove extension
    text = re.sub(r"[_\-]", " ", text)              # replace separators
    text = re.sub(r"[^a-z0-9\s]", " ", text)        # remove special chars
    words = [w for w in text.split() if w not in STOP_WORDS]
    return " ".join(words)


# ============================================================
# KEYWORD EXTRACTION
# ============================================================

def extract_category_keywords(category: str) -> list[str]:
    keywords = []

    normalized = normalize_text(category)
    if normalized:
        keywords.append(normalized)

    bracket_match = re.search(r"\((.*?)\)", category)
    if bracket_match:
        inside_raw = bracket_match.group(1)

        inside = normalize_text(inside_raw)
        if inside:
            keywords.append(inside)

        # Split by "/" → emit "frd", "fsd", "frs" individually
        for part in inside_raw.split("/"):
            part_norm = normalize_text(part.strip())
            if part_norm:
                keywords.append(part_norm)

    abbreviation = normalize_text(category.split("(")[0].strip())
    if abbreviation:
        keywords.append(abbreviation)

    return list(set(keywords))


# ============================================================
# FUZZY MATCH
# ============================================================

def fuzzy_match(filename: str, categories: list[str]):
    normalized_filename = normalize_text(filename)
    filename_tokens = set(normalized_filename.split())

    best_category = None
    best_score = 0

    for category in categories:
        keywords = extract_category_keywords(category)

        for keyword in keywords:
            # Fast path: exact token match — handles short abbreviations
            if keyword in filename_tokens:
                return (category, 100)

            score = fuzz.partial_ratio(normalized_filename, keyword)
            if score > best_score:
                best_score = score
                best_category = category

    if best_score >= FUZZY_THRESHOLD:
        return (best_category, best_score)

    return None


# ============================================================
# PROMPT
# ============================================================

prompt = ChatPromptTemplate.from_messages([
    (
        "system",
        """
        You are a document identification expert.
        Classify filenames against the supplied document checklist.

        Rules:
        - Choose exactly one category from checklist.
        - If no category fits, return Unclassified.
        - Do not create new categories.
        - Keep reasoning under 20 words.
        """,
    ),
    (
        "human",
        """
        Expected document categories:
        {checklist_text}

        Filenames:
        {filenames_text}
        """,
    ),
])


# ============================================================
# LLM CHAIN
# ✅ include_raw=True so we can read usage_metadata for token counts
# ============================================================

def llm_chain():
    llm = ChatOpenAI(
        base_url=settings.AZURE_OPENAI_ENDPOINT,
        api_key=settings.AZURE_OPENAI_API_KEY,
        model=settings.AZURE_OPENAI_MODEL,
        temperature=0,
        max_tokens=256,
    )

    # include_raw=True returns {"raw": AIMessage, "parsed": ..., "parsing_error": ...}
    structured_llm = llm.with_structured_output(
        DocumentIdentificationResponse,
        include_raw=True,           # ✅ needed for token usage
    )

    chain = prompt | structured_llm
    return chain


# ============================================================
# COST HELPER
# ============================================================

def _calculate_cost(prompt_tokens: int, completion_tokens: int) -> float:
    return round(
        (prompt_tokens     / 1000 * COST_PER_1K_INPUT)
        + (completion_tokens / 1000 * COST_PER_1K_OUTPUT),
        6,
    )


# ============================================================
# FINAL SORT
# ============================================================

def build_final_results(identified: list[dict]) -> list[dict]:
    return sorted(identified, key=lambda x: x["filename"].lower())


# ============================================================
# MAIN IDENTIFICATION FUNCTION
# ============================================================

def identify_documents(
    documents: list[dict],
    framework_checklist: list[str],
) -> list[dict]:

    if not documents:
        return []

    categories = framework_checklist
    identified = []
    needs_llm  = []

    for document in documents:
        print("\nProcessing:", document["name"])

        match = fuzzy_match(document["name"], categories)

        if match:
            category, score = match
            print("Fuzzy Match:", category, score)
            identified.append({
                "filename":         document["name"],
                "matched_category": category,
                "confidence":       "high",
                "reasoning":        f"Fuzzy keyword match score {score}",
            })
        else:
            print("No fuzzy match. Sending to LLM")
            needs_llm.append(document)

    # ========================================================
    # LLM FALLBACK
    # ========================================================

    if needs_llm:
        checklist_text = "\n".join(f"- {c}" for c in categories)
        filenames_text = "\n".join(f"- {d['name']}" for d in needs_llm)

        # ✅ Open a Langfuse span for the whole LLM identification call
        llm_observation = None
        try:
            from langfuse import Langfuse
            lf = Langfuse()
            llm_observation = lf.trace(name="document-identification").span(
                name="LLM Identification",
                metadata={
                    "files_sent_to_llm": [d["name"] for d in needs_llm],
                    "file_count": len(needs_llm),
                },
            )
            llm_observation.update(
                input={"filenames": [d["name"] for d in needs_llm]}
            )
        except Exception:
            pass   # Langfuse is non-critical; never block the main flow

        token_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
        estimated_cost_usd = 0.0

        try:
            chain = llm_chain()

            # ✅ Pass langfuse_handler as callback so the generation is
            #    also auto-linked in Langfuse (gives you the full trace view)
            raw_response = chain.invoke(
                {
                    "checklist_text": checklist_text,
                    "filenames_text": filenames_text,
                },
                config={
                    "callbacks": [langfuse_handler],
                    "run_name":  "Identify Documents",
                },
            )

            # ✅ Extract parsed output
            response: DocumentIdentificationResponse = raw_response["parsed"]

            # ✅ Extract token usage from raw AIMessage
            raw_msg = raw_response.get("raw")
            if raw_msg and hasattr(raw_msg, "usage_metadata"):
                usage = raw_msg.usage_metadata
                token_usage = {
                    "prompt_tokens":     usage.get("input_tokens",  0),
                    "completion_tokens": usage.get("output_tokens", 0),
                    "total_tokens":      usage.get("total_tokens",  0),
                }

            # ✅ Calculate cost
            estimated_cost_usd = _calculate_cost(
                token_usage["prompt_tokens"],
                token_usage["completion_tokens"],
            )

            print(
                f"\n[Identifier] Tokens — "
                f"input: {token_usage['prompt_tokens']}  "
                f"output: {token_usage['completion_tokens']}  "
                f"total: {token_usage['total_tokens']}  "
                f"cost: ${estimated_cost_usd:.6f}"
            )

            # ✅ Log cost + tokens to Langfuse span
            if llm_observation:
                llm_observation.update(
                    output={"identifications": [i.model_dump() for i in response.identifications]},
                    metadata={
                        "prompt_tokens":       token_usage["prompt_tokens"],
                        "completion_tokens":   token_usage["completion_tokens"],
                        "total_tokens":        token_usage["total_tokens"],
                        "estimated_cost_usd":  estimated_cost_usd,
                        "files_identified":    len(response.identifications),
                    },
                )

            for item in response.identifications:
                identified.append(item.model_dump())

        except Exception as ex:
            import traceback
            traceback.print_exc()

            if llm_observation:
                llm_observation.update(output={"status": "failed"})

            for document in needs_llm:
                identified.append({
                    "filename":         document["name"],
                    "matched_category": "Unclassified",
                    "confidence":       "low",
                    "reasoning":        f"LLM failed: {ex}",
                })

        finally:
            # ✅ Always close the span — even on failure
            if llm_observation:
                try:
                    llm_observation.end()
                except Exception:
                    pass

    return build_final_results(identified)