import json
import logging
from pathlib import Path
import pandas as pd

from audit_framework.config import(
    JSON_FOLDER,
    MANDATORY_COLUMNS
)

# Logger
logger = logging.getLogger(__name__)

#Function for Validating the columns in excel files

def validate_columns(df):
    missing_columns = [
        column for column in MANDATORY_COLUMNS if column not in df.columns
    ]

    #if we find any column missing in the framework
    if missing_columns:
        raise ValueError(
            f"Missing columns : {missing_columns}"
        )

# Function for converting dataframe to JSON
def dataframe_to_json(
        df,
        framework_name
):
    
    #creating a list to store the extracted content
    framework_records = []

    for _,row in df.iterrows():

        #extract each record from excel
        record = {
            "framework": framework_name,

            "document":
                str(row["Document"]).strip(),

            "project_phase":
                str(row["Project Phase"]).strip(),

            "evaluation_category":
                str(
                    row["Evaluation Category"]
                ).strip(),

            "evaluation_metric":
                str(
                    row["Evaluation Metrics"]
                ).strip(),

            "evaluation_pointer":
                str(
                    row["Evaluation Pointers"]
                ).strip()
        }        
       
        #append each record to a final record
        framework_records.append(record)

    return framework_records



#Function to save the excel extracted framework to JSON
def save_json(
        framework_records,
        output_file
):
    #output folder to store the final json file
    output_path = (
        JSON_FOLDER / output_file
    )

    with open(
        output_path,
        "w",
        encoding="utf-8"
    ) as file :
        json.dump(
            framework_records,
            file,
            indent=4,
            ensure_ascii=False
        )

    logger.info(
        f"JSON saved to {output_path}"
    )
    
    
# Function to process the framework in excel and convert it to json by calling the helper functions
def process_framework_sheet(
        excel_file,
        sheet_name,
        framework_name,
        output_file
):
    logger.info(
        f"Processing {framework_name}"
    )

    #creating a dataframe after reading the excel file
    df = pd.read_excel(
        excel_file,
        sheet_name=sheet_name
        )
    
    validate_columns(df)


    framework_json= dataframe_to_json(
        df,
        framework_name
    )   #it returned a list called framework_records

    save_json(
        framework_json,
        output_file
    )

    return


# def load_framework_documents(json_file):

#     with open(json_file, "r", encoding="utf-8") as file:
#         framework = json.load(file)

#     documents_list = []

#     for record in framework:

#         doc = record["document"]

#         if doc not in documents_list:
#             documents_list.append(doc)

#     return documents_list
    
def load_framework(json_file):

    with open(json_file, "r", encoding="utf-8") as file:
        framework = json.load(file)

    return framework