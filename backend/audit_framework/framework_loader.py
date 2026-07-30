from pathlib import Path
from audit_framework.framework_converter import (
    process_framework_sheet , load_framework
)

from audit_framework.config import (
    FRAMEWORK_EXCEL_FILE
)

from audit_framework.config import (
    JSON_FOLDER
)


# Function to refresh the JSON files if new excel is uploaded

def framework_needs_refresh():
    star_json_file = (
        JSON_FOLDER/
        "star_framework.json"
    )

    dex_json_file = (
        JSON_FOLDER/
        "dex_framework.json"
    )

    #if star and dex json does not exist , we need to create one
    if not (star_json_file.exists() and dex_json_file.exists()):
        return True 
    
    excel_time = FRAMEWORK_EXCEL_FILE.stat().st_mtime
    json_time = star_json_file.stat().st_mtime

    return excel_time > json_time #if excel is uploaded recently and the json was present already then we need a refresh


# Function to generate the framework in JSON

def generate_framework_json():

    process_framework_sheet(
        excel_file=FRAMEWORK_EXCEL_FILE,
        sheet_name="STAR Evaluation Framework",
        framework_name="STAR",
        output_file="star_framework.json"
    )

    process_framework_sheet(
        excel_file=FRAMEWORK_EXCEL_FILE,
        sheet_name="DEx Evaluation Framework",
        framework_name="DEX",
        output_file="dex_framework.json"
    )

    print(
        "STAR and DEx JSON generated successfully."
    )
    
    return


# Function to check if refresh of json is required or not and then initialize the frameworks

def initialize_frameworks():

    if framework_needs_refresh():
        generate_framework_json() # in case json doesn't exist already, we will generate them from excel
        
        print("Framework ready")
        


# Fetching the documents list from json of framework existing
# def get_framework_documents():

#     initialize_frameworks()
    
#     star_framework_documents=load_framework_documents(
#         JSON_FOLDER / "star_framework.json"
#     )

#     dex_framework_documents = load_framework_documents(
#         JSON_FOLDER / "dex_framework.json"
#     )

#     print(f"STAR Framework documents : {star_framework_documents}")
#     print(f"DEx Framework documents : {dex_framework_documents}")

#     return star_framework_documents,dex_framework_documents

"""
Fetching the framework based on audit type and we'll create a list of documents within that framework , 
here we will return the audit framework for the document based on audit type given like STAR or DEX - again fetched for each document one by one 
"""
def get_framework(audit_type : str):

    initialize_frameworks()
    documents_list = []
    
    if(audit_type == "STAR"):
        framework = load_framework(
            JSON_FOLDER / "star_framework.json"
        )

    elif(audit_type == "DEX"):
        framework = load_framework(
        JSON_FOLDER / "dex_framework.json"
        )

    else : 
        raise ValueError(
            f"Unknown audit type : '{audit_type}'."
        )

    for record in framework:
        doc = record["document"]

        if doc not in documents_list:
            documents_list.append(doc)

    # print(f"Framework : '{framework}'\n")
    print(f"{audit_type} Framework documents list: {documents_list}")

    return framework,documents_list





