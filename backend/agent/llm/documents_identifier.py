import re
import unicodedata
from rapidfuzz import fuzz,process                            # for fuzzy logic to see random matching of documents
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from typing import List , Literal
from pydantic import BaseModel
from config.settings import settings
#------for openrouter
from langchain_openai import ChatOpenAI
import truststore
truststore.inject_into_ssl()

class DocumentIdentification(BaseModel):
    filename : str
    matched_category : str
    confidence : Literal["high","medium","low"]
    reasoning : str

class DocumentIdentificationResponse(BaseModel):
    identifications : List[DocumentIdentification]  #giving the object we get from the first class 
 
# -----------------------------
# Filename normalization -> removing the unnecessary keywords from the filenames
# -----------------------------
STOP_WORDS = {
    "final",
    "draft",
    "review",
    "reviewed",
    "latest",
    "copy",
    "new",
    "v1",
    "v2",
    "v3",
    "v4",
    "signed",
    "updated",
}

FUZZY_THRESHOLD = 80

def normalize_text(text: str) ->str : 
    """Here we will be normalizing the filename to improve fuzzy logic matching """

    text = unicodedata.normalize(
        "NFKD",
        text
    )

    text = text.lower()

    # remove extension
    text = re.sub(
        r"\.[a-z0-9]+$",
        "",
        text
    )

    # replace separators
    text = re.sub(
        r"[_\-]",
        " ",
        text
    )

    # remove special characters
    text = re.sub(
        r"[^a-z0-9\s]",
        " ",
        text
    )


    words = [
        word
        for word in text.split()
        if word not in STOP_WORDS
    ]

    return " ".join(words)


#------------Category word extraction-------------
def extract_category_keywords(category: str) -> list[str]:
    """
    Extract searchable terms from framework category.

    Example:

    SOW (Statement of Work)

    returns:

    [
        sow statement of work,
        statement of work,
        sow
    ]
    """

    keywords = []


    normalized = normalize_text(category)

    if normalized:
        keywords.append(normalized)



    # Extract text inside brackets
    bracket_match = re.search(
        r"\((.*?)\)",
        category
    )


    if bracket_match:

        inside = normalize_text(
            bracket_match.group(1)
        )

        if inside:
            keywords.append(
                inside
            )

    # Extract abbreviation before bracket

    abbreviation = category.split("(")[0].strip()

    abbreviation = normalize_text(
        abbreviation
    )

    if abbreviation:
        keywords.append(
            abbreviation
        )

    return list(
        set(keywords)
    )


#------------RAPID FUZZ LOGIC --------------------

def fuzzy_match(
    filename: str, 
    categories: list[str]
    ):

    normalized_filename = normalize_text(
        filename
    )

    best_category = None
    best_score = 0

    for category in categories:
        keywords = extract_category_keywords(
            category
        )

        for keyword in keywords:
            score = fuzz.partial_ratio(
                normalized_filename,
                keyword
            )

            if score > best_score:

                best_score = score
                best_category = category

    if best_score >= FUZZY_THRESHOLD:

        return (
            best_category,
            best_score
        )

    return None


#------------------- PROMPT FOR TEMPLATE ---------------------------

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

            """
        ),
        (
            "human",

            """
            Expected document categories:
            {checklist_text}

            Filenames:
            {filenames_text}
            """
        )
        ])

#-----------Building LLM chain -------------------------

def llm_chain():
    
    # llm = ChatOpenAI(
        # base_url=settings.AZURE_OPENAI_ENDPOINT,
        # api_key=settings.AZURE_OPENAI_API_KEY,
        # model = settings.AZURE_OPENAI_MODEL,
        # temperature=0,
        # max_tokens=256,
        # )

    llm = ChatOpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key = settings.OPENROUTER_API_KEY,
        model = "openai/gpt-5.2",
        max_tokens = 256
    )

    llm = llm.with_structured_output(
        DocumentIdentificationResponse
    )

    chain = prompt | llm
    return chain

#------------------------Final result--------------------------------
def build_final_results(
    identified: list[dict]
    ):

    return sorted(
        identified, 
        key=lambda x: x["filename"].lower()
        )

#-------------identifying the documents using fuzzy match else calling llm for this

# ============================================================
# MAIN IDENTIFICATION FUNCTION
# ============================================================


def identify_documents(
    documents: list[dict],
    framework_checklist: list[str]
):

    if not documents:
        return []

    categories = framework_checklist
    identified = []
    needs_llm = []

    for document in documents:
        print(
            "\nProcessing:",
            document["name"]
        )

        match = fuzzy_match(
            document["name"],
            categories
        )

        if match:
            category, score = match

            print(
                "Fuzzy Match:",
                category,
                score
            )

            identified.append(
                {
                    "filename" : document["name"],

                    "matched_category" : category,

                    "confidence" : "high",

                    "reasoning" : f"Fuzzy keyword match score {score}"
                }
            )

        else:
            print(
                "No fuzzy match. Sending to LLM"
            )

            needs_llm.append(
                document
            )

    # ========================================================
    # LLM FALLBACK
    # ========================================================

    if needs_llm:
        checklist_text = "\n".join(
            f"- {c}"
            for c in categories
        )

        filenames_text = "\n".join(
            f"- {d['name']}"
            for d in needs_llm
        )

        try:
            chain = llm_chain()
            response = chain.invoke(
                {

                    "checklist_text" : checklist_text,

                    "filenames_text" : filenames_text
                }
            )

            for item in response.identifications:
                identified.append(
                    item.model_dump()
                )

        except Exception as ex:

            import traceback
            traceback.print_exc()

            for document in needs_llm:
                identified.append(
                {

                    "filename":
                    document["name"],

                    "matched_category":
                    "Unclassified",

                    "confidence":
                    "low",

                    "reasoning":
                    f"LLM failed: {ex}"

                    }
                )

    return build_final_results(
        identified
    )