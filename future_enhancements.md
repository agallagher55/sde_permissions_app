# Future Enhancements

Quality-of-life improvements scoped to keep the project simple and maintainable.

---

## Enable light-mode

## Data Collection (main.py)

### Auto-detect monthly CSV path
The `CSV` path in `main.py` has to be manually updated each run. A small helper could construct the path from the current date:
```python
import datetime
year_month = datetime.date.today().strftime("%Y%m%b").lower()   # e.g. "202512dec"
CSV = rf"T:\work\giss\monthly\{year_month}\gallaga\user_permissions\Members of selected groups_{month_name}.csv"
```
This would eliminate the most common source of human error when running the script.

### JSON schema validation on output
After writing the JSON files, validate that they match the expected shape (dict of string → array of strings) before the script exits. A malformed export caught early is better than a broken UI.

### Log file cleanup
Log files (`*_loggies.log`) accumulate in the working directory. A simple purge of logs older than N days at the start of each run would keep the folder tidy.

---

## Web Interface (app.js / index.html)

### Deep-link / URL hash navigation
Persist the active tab and selected item in the URL hash (e.g. `#table=ADM_TAX_DESIGNATION`). This allows bookmarking a specific table, user, or group and sharing the link directly.

### Member and table count badges
Show a count chip next to each item in the dropdowns:
- Group selector: number of members
- User selector: number of editable tables
- Table selector: number of users with access

This helps quickly identify large/small groups without selecting each one.

### Highlight empty groups
Groups with no members (sentinel value `<No members>`) could be visually flagged in the group selector (e.g. greyed out or marked with an icon) so they are easy to identify and report on.

### Batch CSV export
Add an "Export all" button that generates a single CSV containing every table/user/group mapping in one download, for use in spreadsheet-based audits without clicking through each record.

### Keyboard navigation
Ensure the tab panels and dropdowns are fully keyboard-navigable (arrow keys to move through select options, Enter to confirm) for accessibility and faster keyboard-only workflows.

### Print / print-to-PDF styling
Add a `@media print` stylesheet so that the current view (whichever tab is active) renders cleanly when printed or saved as PDF — useful for attaching permission snapshots to tickets or audit records.

### JSON schema mismatch warning
If a loaded JSON file has unexpected structure (e.g. values are not arrays, or keys have wrong prefix convention), show a clear warning in the status bar rather than silently producing an empty UI.

### Data freshness indicator
Display the file modification date of the JSON files (or embed it as a metadata field written by `main.py`) so users can see at a glance how current the loaded data is.
