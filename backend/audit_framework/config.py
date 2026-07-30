from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent #backend folder

#path for folder where Excel frameworks would be stored
EXCEL_FOLDER=(
    BASE_DIR / "data" / "frameworks" / "excel"
)

#path for folder where JSON frameworks would be stored
JSON_FOLDER=(
    BASE_DIR / "data" / "frameworks" / "json"
)

FRAMEWORK_EXCEL_FILE = (
    EXCEL_FOLDER /
    "AI Audit Agent - Evaluation Framework.xlsx"
)

MANDATORY_COLUMNS= [
    "Document",
    "Project Phase",
    "Evaluation Category",
    "Evaluation Metrics",
    "Evaluation Pointers"
]