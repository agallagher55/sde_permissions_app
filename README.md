![Uploading image.png…]()


# SDE Permissions App — Editor Access Explorer

A GIS permissions audit tool for Halifax Regional Municipality (HRM). It maps which Active Directory groups and users have edit access to which SDE (Spatial Data Engine) database tables, and presents the data through an interactive browser-based interface.

---

## Overview

Managing edit permissions across dozens of GIS editor groups and hundreds of SDE tables is complex. This tool answers three questions at a glance:

| Question | Tab to use |
|----------|-----------|
| Who can edit **this table**? | By Table |
| What can **this user** edit? | By User |
| What tables and members does **this group** control? | By Group |

Results can be exported as CSV files for compliance records or change-tracking audits.

---

## How It Works

Permissions data comes from two sources:

1. **Active Directory** — group membership exported as a CSV from Adaxes
2. **SQL Server SDE database** — database-level `GRANT` permissions queried via ArcPy

The `main.py` script merges these sources into two JSON files. Those JSON files are deployed alongside the static web app and loaded in the browser at runtime — no server-side logic runs when someone opens the page.

```
Adaxes CSV  ──┐
              ├── main.py ──► groups_and_editors.json
SDE database ─┘              groups_and_tables.json
                                      │
                                 index.html / app.js
                                 (served via IIS)
```

---

## Prerequisites

### For running main.py (data collection)

- Python 3.x in an **ArcGIS Pro** or **ArcGIS Enterprise** environment (ArcPy required)
- `pandas` — `pip install pandas`
- `HRMutils` — internal HRM module; must be on `PYTHONPATH`
- `config.ini` in the same directory as `main.py` (see below)
- Network access to the T: drive and the production SQL Server

### For the web interface

- Any modern browser (Chrome, Edge, Firefox)
- The two JSON files (`groups_and_editors.json`, `groups_and_tables.json`) co-located with `index.html`
- Or: a local/IIS web server if you want `Load default` to auto-fetch them

---

## Setup

### 1. Configure config.ini

Create a `config.ini` file in the project root with your SDE connection file paths:

```ini
[SERVER]
prod_rw = C:\path\to\your\production.sde

; Uncomment to enable QA server support in main.py
; qa_rw = C:\path\to\your\qa.sde
```

The `prod_rw` value must point to an `.sde` connection file that has read access to `sys.database_permissions`.

### 2. Generate the Adaxes CSV

1. Log in to the Adaxes admin portal:
   `https://adportal.halifax.ca/Adaxes/App%20Admin#/Home`
2. Run the group membership report for all `GIS_*` groups.
3. Save the CSV to the monthly work folder on the T: drive, e.g.:
   `T:\work\giss\monthly\YYYYMM<month>\<analyst>\user_permissions\`

The CSV must contain at minimum two columns: **`Group Name`** and **`Name`**.

---

## Running main.py

1. Open `main.py` and update the `CSV` variable in the `__main__` block to point to the current month's export:

   ```python
   # main.py — update this path each time
   CSV = r"T:\work\giss\monthly\202512dec\gallaga\user_permissions\Members of selected groups_december.csv"
   ```

2. Run the script from a Python environment that includes ArcPy:

   ```
   python main.py
   ```

3. The script will:
   - Parse the Adaxes CSV and filter out infrastructure/service-account groups
   - Connect to the production SDE via `ArcSDESQLExecute` and query database-level permissions
   - Write two files to the current directory:
     - `groups_and_editors.json` — `{ "GIS_GROUP": ["Last, First", ...] }`
     - `groups_and_tables.json` — `{ "HRM\\GIS_GROUP": ["TABLE_NAME", ...] }`

4. A timestamped log file (`YYYY-MM-DD_loggies.log`) is written alongside the JSON files.

---

## Deployment

Copy the following files to the web server:

| Destination | Files |
|-------------|-------|
| `MSGISWEBD201` → `C:\inetpub\wwwroot\sde_editors\` | `index.html`, `app.js`, `styles.css`, `groups_and_editors.json`, `groups_and_tables.json` |

> **Tip:** The JSON files must be in the **same directory** as `index.html`. The browser fetches them via relative URL.

Typical copy path: T: drive → local downloads → `C:\inetpub\wwwroot\sde_editors\`.

---

## Using the Web Interface

### Loading data

When the page loads, it automatically tries to fetch both JSON files from the same directory. If that succeeds, the selectors populate immediately.

If the files are not reachable (e.g., running `index.html` directly from disk), use the **Data sources** panel at the top:

- **Load default** — fetches the JSON files from the server
- **File picker** — upload a local copy of either JSON file

### By Table tab

Select a table from the dropdown to see:
- All AD groups that grant edit access to that table
- All users who can edit it, with the group(s) granting their access shown as chips
- Use the **Filter users by name** box to narrow the user list
- **Export CSV** downloads a `table_<TABLE>_editors.csv` audit report

### By User tab

Select a user to see:
- All GIS editor groups they belong to
- All tables they can edit, with the granting group shown
- Use the **Quick search users** box to jump to a name
- **Export CSV** downloads a `user_<NAME>_tables.csv` report

### By Group tab

Select a group to see:
- All members of that group
- All tables the group grants edit access to
- Use the search box to filter the table list
- **Export CSV** downloads a `group_<GROUP>_tables.csv` report

---

## File Reference

```
sde_permissions_app/
├── index.html                # Single-page web app shell
├── app.js                    # All frontend logic (data loading, indexing, rendering, export)
├── styles.css                # Dark-theme styles; responsive at 900 px
├── main.py                   # Data-collection script (requires ArcPy)
├── config.ini                # Local config — SDE connection paths (not committed)
├── groups_and_editors.json   # Output: AD group → member list
├── groups_and_tables.json    # Output: AD group → SDE table list
└── images/
    └── interface_preview.png
```

---

## Excluded Groups

The following groups are intentionally excluded from the output (infrastructure roles, not human editors):

**From Adaxes CSV:**
- `GIS_ATTRIBUTE_RULES_SEQ_ROLE`
- `GIS_HW_ARCGIS_HRMBASIC`
- `GIS_HW_USERS`
- `GIS_REAL_VIEWER`

**From SQL Server query (database principals):**
- `HRM\GIS_HW_ARCGIS_HRMBASIC`
- `HRM_CITYWORKS_USER`
- `HRM_TRFSDY_USER`
- `HRM_REAL_ESTATE_USER`
- Any principal containing `READER` or `VIEWER`

Esri internal tables (`SDE_*`, `GDB_*`, delta/archive tables) are also excluded from the SQL query results.
