import arcpy
import os
import datetime
import logging
import json

import pandas as pd

from configparser import ConfigParser

from HRMutils import setupLog

arcpy.SetLogHistory(False)

config = ConfigParser()
config.read('config.ini')

logFile = os.path.join(os.getcwd(), f"{datetime.date.today()}_loggies.log")
logger = setupLog(logFile)

console_handler = logging.StreamHandler()
log_formatter = logging.Formatter(
    '%(asctime)s | %(levelname)s | FUNCTION: %(funcName)s | Msgs: %(message)s', datefmt='%d-%b-%y %H:%M:%S'
)
console_handler.setFormatter(log_formatter)
logger.addHandler(console_handler)  # print logs to console
logger.setLevel(logging.DEBUG)

def get_group_membership_data(csv: str) -> dict:

    filter_groups = ("GIS_ATTRIBUTE_RULES_SEQ_ROLE", 'GIS_HW_ARCGIS_HRMBASIC', 'GIS_HW_USERS', 'GIS_REAL_VIEWER')
    df = pd.read_csv(csv)

    df = df[~df['Group Name'].isin(filter_groups)]

    print(df)
    records = df.to_dict(orient='records')

    result = {x.get('Group Name'): [] for x in records}

    for record in records:
        group = record['Group Name']
        user = record['Name']

        result[group].append(user)

    return result


def get_ad_role_tables(sde_conn):

    sql = '''
        SELECT 
            dp.name AS DatabaseRole,
            o.name AS TableName
        FROM sys.database_permissions p
        JOIN sys.objects o
            ON p.major_id = o.object_id
        JOIN sys.database_principals dp
            ON p.grantee_principal_id = dp.principal_id
        WHERE --dp.name LIKE @RoleName AND 
            o.type = 'U'
        
          -- exclude Esri delta/archive tables
          AND o.name NOT LIKE 'A[0-9]%'
          AND o.name NOT LIKE 'D[0-9]%'
          AND o.name NOT LIKE '%_H[0-9]'
          AND o.name NOT LIKE '%_H'
          AND o.name NOT LIKE 'N_[0-9]%'
          AND o.name NOT LIKE 'ND_%'
        
          -- exclude system/internal tables
          AND o.name NOT LIKE 'SDE[_]%'
          AND o.name NOT LIKE 'GDB[_]%'
        
          -- exclude Esri auxiliary tables like T_#_xxx
          AND o.name NOT LIKE 'T_[0-9]_%'
        
          --AND p.permission_name LIKE '%,%'
          AND dp.name LIKE 'HRM%' AND dp.name NOT IN (
              'HRM\GIS_HW_ARCGIS_HRMBASIC', 'HRM_CITYWORKS_USER', 'HRM_TRFSDY_USER', 'HRM_REAL_ESTATE_USER'
          ) 
          AND dp.name NOT LIKE '%READER%' AND dp.name NOT LIKE '%VIEWER%'
        
        GROUP BY dp.name, SCHEMA_NAME(o.schema_id), o.name
        ORDER BY DatabaseRole, TableName
        ;
    '''

    conn = arcpy.ArcSDESQLExecute(sde_conn)

    sql_return = conn.execute(sql)

    # Aggregate by AD group
    groups = sorted({x[0] for x in sql_return})

    group_tables = {g: [] for g in groups}

    for row in sql_return:
        group, table = row
        group_tables[group].append(table)

    # TODO: Order tables in groups
    group_tables = {k: sorted(v) for k, v in group_tables.items()}

    return group_tables


if __name__ == "__main__":

    # TODO: Update me
    CSV = r"T:\work\giss\monthly\202512dec\gallaga\user_permissions\Members of selected groups_december.csv"

    groups_and_editors = get_group_membership_data(CSV)

    editors_json_filename = "groups_and_editors.json"
    tables_json_filename = "groups_and_tables.json"

    with open(editors_json_filename, "w") as f:
        json.dump(groups_and_editors, f, indent=4)

    for dbs in [

        # [
        #     config.get("SERVER", "qa_rw"),
        # ],

        [
            config.get("SERVER", "prod_rw"),
        ],

    ]:

        for count, db in enumerate(dbs, start=1):
            logger.info(f"{count}/{len(dbs)}) Database: {db}")

            groups_and_tables = get_ad_role_tables(db)
            with open(tables_json_filename, "w") as f:
                json.dump(groups_and_tables, f, indent=4)

            # Who can edit what tables?

            tables = []
            for group in groups_and_tables:
                tables.extend(groups_and_tables[group])

            tables = sorted({x for x in tables})

            # Get editors

            table_editors = {k: list() for k in tables}

            for table in tables:

                # Get groups table is in
                table_groups = [group for group in groups_and_tables if table in groups_and_tables[group]]

                # Get editors in these groups

                editors = list()

                for group in groups_and_editors:

                    if f"HRM\\{group}" in table_groups:
                        group_editors = groups_and_editors[group]

                        if '<No members>' not in group_editors:
                            editors.extend(groups_and_editors[group])

                table_editors[table] = editors

                print(f"Table: {table}\nEditors: {editors}")
                print()

        print()