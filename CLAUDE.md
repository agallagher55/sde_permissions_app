# CLAUDE.md — SDE Permissions App

This file gives Claude Code the context needed to assist with this project effectively.

---

## What This Project Does

The **SDE Permissions App** is an internal GIS audit tool for Halifax Regional Municipality (HRM). It answers three questions about the organization's Spatial Data Engine (SDE) database:

- Which **users** can edit a given GIS table?
- Which **tables** can a given user edit?
- Which **tables and members** does a given AD group control?

Permissions are derived from two sources:
1. **Active Directory group membership** — exported as a CSV from Adaxes
2. **SQL Server database-level permissions** — queried live via ArcPy

The output is a pair of JSON files that feed a static single-page web app served over IIS.

---

## Architecture

```
Adaxes (Active Directory)
  └─ CSV export of group membership
        │
        ▼
main.py  (Python, requires ArcPy + pandas)
  ├─ Reads CSV  → groups_and_editors.json   { GROUP: [users] }
  └─ Queries SQL Server → groups_and_tables.json  { HRM\GROUP: [tables] }
        │
        ▼
Web server (MSGISWEBD201 — IIS)
  └─ C:\inetpub\wwwroot\sde_editors\
        ├─ index.html
        ├─ app.js
        ├─ styles.css
        ├─ groups_and_editors.json
        └─ groups_and_tables.json
```

`app.js` loads both JSON files, builds in-memory reverse indexes, and renders the UI. No server-side logic runs at browse time.

---

## Key Files

| File | Purpose |
|------|---------|
| `main.py` | Data-collection script. Reads Adaxes CSV and queries the production SDE SQL Server via ArcPy. Outputs both JSON files. |
| `app.js` | All frontend logic: data loading, index building, rendering, filtering, CSV export. ~353 lines of vanilla JS. |
| `index.html` | Single-page shell with three tabs (By Table / By User / By Group) and a data-loader section. |
| `styles.css` | Dark-theme CSS; HRM brand palette; responsive grid breakpoint at 900 px. |
| `groups_and_editors.json` | `{ "GIS_XYZ": ["Last, First", ...] }` — AD group membership snapshot. |
| `groups_and_tables.json` | `{ "HRM\\GIS_XYZ": ["TABLE_NAME", ...] }` — database permission snapshot. |
| `config.ini` | Non-tracked local config. Contains `[SERVER]` section with `prod_rw` (and optionally `qa_rw`) SDE connection file paths. |

---

## Group Name Conventions

The two JSON files use **different key formats**:

| File | Key format | Example |
|------|-----------|---------|
| `groups_and_editors.json` | Short name (no domain prefix) | `GIS_BIKE_EDITOR` |
| `groups_and_tables.json` | Domain-prefixed | `HRM\GIS_BIKE_EDITOR` |

`app.js` reconciles this by building a `groupsHrmed` map (`HRM\GIS_XYZ → [users]`) at index time. When adding new data or modifying the indexing logic, preserve this convention.

---

## Data Filtering Rules

### Adaxes CSV (main.py — `get_group_membership_data`)

These groups are excluded from the editors JSON (infrastructure/service accounts, not human editors):

```python
filter_groups = (
    "GIS_ATTRIBUTE_RULES_SEQ_ROLE",
    "GIS_HW_ARCGIS_HRMBASIC",
    "GIS_HW_USERS",
    "GIS_REAL_VIEWER",
)
```

CSV columns used: `Group Name`, `Name`.

### SQL Server query (main.py — `get_ad_role_tables`)

Only rows matching all of the following are kept:

- `o.type = 'U'` — user tables only
- Name does **not** match Esri delta/archive patterns: `A[0-9]%`, `D[0-9]%`, `%_H[0-9]`, `%_H`, `N_[0-9]%`, `ND_%`
- Name does **not** match system prefixes: `SDE_`, `GDB_`, `T_[0-9]_`
- Principal name starts with `HRM` but is **not** in the exclude list:
  - `HRM\GIS_HW_ARCGIS_HRMBASIC`, `HRM_CITYWORKS_USER`, `HRM_TRFSDY_USER`, `HRM_REAL_ESTATE_USER`
- Principal name does **not** contain `READER` or `VIEWER` (read-only roles)

---

## Frontend Data Model (app.js)

Six in-memory maps are built by `normalizeAndIndex()`:

| Variable | Type | Description |
|----------|------|-------------|
| `groupsToUsers` | `{string: string[]}` | Short group name → user display names |
| `groupsHrmed` | `{string: string[]}` | `HRM\Group` → user display names |
| `usersToGroups` | `{string: string[]}` | User display name → short group names |
| `groupsToTables` | `{string: string[]}` | `HRM\Group` → table names |
| `tablesToGroups` | `{string: string[]}` | Table name → `HRM\Group` names |
| `tablesToUsers` | `{string: {name, groups}[]}` | Table → users + which groups grant access |

`tablesToUsers` is the most expensive structure; it is computed once and drives the "By Table" view.

---

## Running main.py

### Prerequisites

- Python 3.x with ArcPy (requires ArcGIS Pro or ArcGIS Enterprise environment)
- `pandas` (`pip install pandas`)
- `HRMutils` (internal HRM utility module — must be on PYTHONPATH)
- `config.ini` in the working directory (see below)

### config.ini format

```ini
[SERVER]
prod_rw = C:\path\to\production.sde
; qa_rw = C:\path\to\qa.sde
```

`prod_rw` should point to a read/write SDE connection file for the production SQL Server.

### Workflow

1. Generate the Adaxes group membership report at:
   `https://adportal.halifax.ca/Adaxes/App%20Admin#/Home`
   Save the CSV to the monthly work folder.

2. Update the `CSV` path in `main.py` (`__main__` block):
   ```python
   CSV = r"T:\work\giss\monthly\YYYYMM\<analyst>\user_permissions\<filename>.csv"
   ```

3. Run the script from a Python environment that has ArcPy:
   ```
   python main.py
   ```

4. Two JSON files are written to the current directory:
   - `groups_and_editors.json`
   - `groups_and_tables.json`

5. Copy the HTML/JS/CSS files **and** both JSON files to the web server:
   ```
   MSGISWEBD201 → C:\inetpub\wwwroot\sde_editors\
   ```

---

## Deployment

The app is a static bundle — no build step. Deployment is a manual file copy:

```
local repo/
  index.html
  app.js
  styles.css
  groups_and_editors.json   ← generated by main.py
  groups_and_tables.json    ← generated by main.py
```

All files go to `C:\inetpub\wwwroot\sde_editors\` on `MSGISWEBD201`.

The browser auto-fetches both JSON files via relative URLs (`fetch('groups_and_editors.json')`). They must sit in the **same directory** as `index.html`.

---

## Important Constraints

- **No backend at browse time** — all logic is client-side JS.
- **No authentication layer** — the web app is access-controlled at the network/IIS level.
- **ArcPy dependency** — `main.py` cannot run outside an Esri GIS environment.
- **Adaxes CSV format** — the CSV must contain `Group Name` and `Name` columns.
- **Members placeholder** — groups with no members contain the sentinel string `'<No members>'` in the editors JSON; `app.js` filters this out when rendering.
