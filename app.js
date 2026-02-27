'use strict';

// Data stores
let groupsToUsers = {};         // "GIS_XYZ" -> ["Last, First", ...]
let groupsHrmed = {};           // "HRM\\GIS_XYZ" -> [users]
let usersToGroups = {};         // "Last, First" -> ["GIS_XYZ", ...]
let groupsToTables = {};        // "HRM\\GIS_XYZ" -> ["TABLE_A", ...]
let tablesToGroups = {};        // "TABLE_A" -> ["HRM\\GIS_XYZ", ...]
let tablesToUsers = {};         // "TABLE_A" -> [{name, groups:[...]}, ...]

// Active group filter for By Table tab (null = show all)
let tableGroupFilter = null;
// Active group filter for By User tab (null = show all)
let userGroupFilter = null;

// DOM
const els = {
  status: document.getElementById('status'),
  btnLoadEditors: document.getElementById('btnLoadEditors'),
  btnLoadTables: document.getElementById('btnLoadTables'),
  fileEditors: document.getElementById('fileEditors'),
  fileTables: document.getElementById('fileTables'),
  tabBtns: document.querySelectorAll('.tab-btn'),
  tabPanels: document.querySelectorAll('.tab-panel'),
  tableSelect: document.getElementById('tableSelect'),
  tableGroups: document.getElementById('tableGroups'),
  tableUsers: document.getElementById('tableUsers'),
  tableSearch: document.getElementById('tableSearch'),
  tableNameLabel: document.getElementById('tableNameLabel'),
  exportTableCsv: document.getElementById('exportTableCsv'),
  userSelect: document.getElementById('userSelect'),
  userGroups: document.getElementById('userGroups'),
  userTables: document.getElementById('userTables'),
  userSearch: document.getElementById('userSearch'),
  userNameLabel: document.getElementById('userNameLabel'),
  exportUserCsv: document.getElementById('exportUserCsv'),
  // New group view elements
  groupSelect: document.getElementById('groupSelect'),
  groupSearch: document.getElementById('groupSearch'),
  exportGroupCsv: document.getElementById('exportGroupCsv'),
  groupNameLabel: document.getElementById('groupNameLabel'),
  groupNameLabel2: document.getElementById('groupNameLabel2'),
  groupMembers: document.getElementById('groupMembers'),
  groupTables: document.getElementById('groupTables'),
  // Report tab
  reportSearch: document.getElementById('reportSearch'),
  reportSelectVisible: document.getElementById('reportSelectVisible'),
  reportClearAll: document.getElementById('reportClearAll'),
  reportGenerate: document.getElementById('reportGenerate'),
  exportReportCsv: document.getElementById('exportReportCsv'),
  reportTableList: document.getElementById('reportTableList'),
  reportSelCount: document.getElementById('reportSelCount'),
  reportOutputLabel: document.getElementById('reportOutputLabel'),
  reportResults: document.getElementById('reportResults'),
};

function setStatus(msg) { els.status.textContent = msg; }
function selectedValues(sel) { return Array.from(sel.selectedOptions).map(o => o.value); }

// Helpers
async function loadDefaultEditors() {
  return fetch('groups_and_editors.json').then(r => r.json());
}
async function loadDefaultTables() {
  return fetch('groups_and_tables.json').then(r => r.json());
}
function readFileAsJson(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      try { resolve(JSON.parse(reader.result)); } catch (e) { reject(e); }
    };
    reader.readAsText(file);
  });
}

function normalizeAndIndex(editorsJson, tablesJson) {
  // editorsJson: { GIS_GROUP: [users] }
  groupsToUsers = editorsJson || {};
  // Build HRM\\ variant
  groupsHrmed = {};
  for (const g of Object.keys(groupsToUsers)) {
    groupsHrmed[`HRM\\${g}`] = groupsToUsers[g].slice();
  }

  // users -> groups
  usersToGroups = {};
  for (const [g, users] of Object.entries(groupsToUsers)) {
    for (const u of users) {
      if (!usersToGroups[u]) usersToGroups[u] = [];
      usersToGroups[u].push(g);
    }
  }

  // groups -> tables from tablesJson
  groupsToTables = tablesJson || {};

  // tables -> groups
  tablesToGroups = {};
  for (const [gHrmed, tables] of Object.entries(groupsToTables)) {
    for (const t of tables) {
      if (!tablesToGroups[t]) tablesToGroups[t] = [];
      if (!tablesToGroups[t].includes(gHrmed)) tablesToGroups[t].push(gHrmed);
    }
  }

  // tables -> users with granting groups
  tablesToUsers = {};
  for (const [t, grantGroups] of Object.entries(tablesToGroups)) {
    const userMap = new Map(); // name -> Set(groups)
    for (const gHr of grantGroups) {
      const editors = groupsHrmed[gHr] || [];
      for (const name of editors) {
        if (name === '<No members>') continue;
        if (!userMap.has(name)) userMap.set(name, new Set());
        const short = gHr.replace(/^HRM\\/, '');
        userMap.get(name).add(short);
      }
    }
    tablesToUsers[t] = Array.from(userMap.entries()).map(([name, set]) => ({
      name,
      groups: Array.from(set).sort(),
    })).sort((a, b) => a.name.localeCompare(b.name));
  }
}

function allShortGroups() {
  // union of editor groups and table-mapped groups (strip HRM\\)
  const a = new Set(Object.keys(groupsToUsers));
  for (const gHr of Object.keys(groupsToTables)) {
    a.add(gHr.replace(/^HRM\\/, ''));
  }
  return Array.from(a).sort();
}

function populateSelectors() {
  // Tables
  const tables = Object.keys(tablesToGroups).sort();
  els.tableSelect.innerHTML = tables.map(t => `<option value="${t}">${t}</option>`).join('');
  // Users
  const users = Object.keys(usersToGroups).sort();
  els.userSelect.innerHTML = users.map(u => `<option value="${u}">${u}</option>`).join('');
  // Groups
  const groups = allShortGroups();
  els.groupSelect.innerHTML = groups.map(g => `<option value="${g}">${g}</option>`).join('');
  // Report checklist
  populateReportList(tables);
}

function populateReportList(tables) {
  els.reportTableList.innerHTML = tables.map(t =>
    `<label class="check-item"><input type="checkbox" value="${t}"><span class="code">${t}</span></label>`
  ).join('');
  els.reportTableList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', updateReportSelCount);
  });
  updateReportSelCount();
}

function updateReportSelCount() {
  const n = els.reportTableList.querySelectorAll('input:checked').length;
  els.reportSelCount.textContent = n ? `(${n} selected)` : '';
}

function renderReport() {
  const selected = Array.from(
    els.reportTableList.querySelectorAll('input:checked')
  ).map(cb => cb.value);

  if (!selected.length) {
    els.reportOutputLabel.textContent = '';
    els.reportResults.innerHTML = '<div class="muted">No tables selected.</div>';
    return;
  }

  els.reportOutputLabel.textContent = `(${selected.length} table${selected.length !== 1 ? 's' : ''})`;

  els.reportResults.innerHTML = selected.map(t => {
    const users = tablesToUsers[t] || [];
    const userHtml = users.length
      ? `<div class="user-list">${users.map(u => `
          <div class="user">
            <div class="name">${u.name}</div>
            <div class="grants">${u.groups.map(g => `<span class="chip small code">${g}</span>`).join('')}</div>
          </div>`).join('')}</div>`
      : '<div class="muted">No users with edit access.</div>';
    return `
      <div class="report-section">
        <div class="report-section-header">
          <span class="tname">${t}</span>
          <span class="muted">${users.length} user${users.length !== 1 ? 's' : ''}</span>
        </div>
        ${userHtml}
      </div>`;
  }).join('');
}

function exportCsvForReport() {
  const selected = Array.from(
    els.reportTableList.querySelectorAll('input:checked')
  ).map(cb => cb.value);
  if (!selected.length) return;

  const rows = [['Table', 'User', 'Granting Group']];
  for (const t of selected) {
    for (const u of (tablesToUsers[t] || [])) {
      if (!u.groups.length) {
        rows.push([t, u.name, '']);
      } else {
        for (const g of u.groups) rows.push([t, u.name, g]);
      }
    }
  }
  downloadCsv(rows, 'report_multi_table_editors.csv');
}

function renderByTable(tableNames, filterText = '') {
  const label = tableNames.length === 1 ? `(${tableNames[0]})` : tableNames.length > 1 ? `(${tableNames.length} tables)` : '';
  els.tableNameLabel.textContent = label;
  // groups — union across all selected tables
  const groupSet = new Set();
  for (const t of tableNames) {
    for (const g of (tablesToGroups[t] || [])) groupSet.add(g.replace(/^HRM\\/, ''));
  }
  const groups = Array.from(groupSet).sort();
  if (tableGroupFilter && !groups.includes(tableGroupFilter)) tableGroupFilter = null;
  els.tableGroups.innerHTML = groups.map(g =>
    `<li class="chip clickable${tableGroupFilter === g ? ' active' : ''}" data-group="${g}"><span class="code">${g}</span></li>`
  ).join('');
  els.tableGroups.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      tableGroupFilter = tableGroupFilter === chip.dataset.group ? null : chip.dataset.group;
      renderByTable(tableNames, els.tableSearch.value);
    });
  });
  // users — union across all selected tables, merging granting groups per user
  const userMap = new Map();
  for (const t of tableNames) {
    for (const u of (tablesToUsers[t] || [])) {
      if (!userMap.has(u.name)) userMap.set(u.name, new Set());
      for (const g of u.groups) userMap.get(u.name).add(g);
    }
  }
  let list = Array.from(userMap.entries())
    .map(([name, gs]) => ({ name, groups: Array.from(gs).sort() }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const f = filterText.trim().toLowerCase();
  if (f) list = list.filter(x => x.name.toLowerCase().includes(f));
  if (tableGroupFilter) list = list.filter(u => u.groups.includes(tableGroupFilter));
  els.tableUsers.innerHTML = list.map(u => `
    <div class="user">
      <div class="name">${u.name}</div>
      <div class="grants">${u.groups.map(g => `<span class="chip small code">${g}</span>`).join('')}</div>
    </div>
  `).join('');
}

function renderByUser(userNames) {
  const label = userNames.length === 1 ? `(${userNames[0]})` : userNames.length > 1 ? `(${userNames.length} users)` : '';
  els.userNameLabel.textContent = label;
  // groups — union across all selected users
  const groupSet = new Set();
  for (const u of userNames) {
    for (const g of (usersToGroups[u] || [])) groupSet.add(g);
  }
  const userGroupsShort = Array.from(groupSet).sort();
  if (userGroupFilter && !userGroupsShort.includes(userGroupFilter)) userGroupFilter = null;
  els.userGroups.innerHTML = userGroupsShort.map(g =>
    `<li class="chip clickable${userGroupFilter === g ? ' active' : ''}" data-group="${g}"><span class="code">${g}</span></li>`
  ).join('');
  els.userGroups.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      userGroupFilter = userGroupFilter === chip.dataset.group ? null : chip.dataset.group;
      renderByUser(userNames);
    });
  });
  // tables — union across all selected users
  const grantTables = new Map(); // table -> Set(groups)
  for (const userName of userNames) {
    for (const g of (usersToGroups[userName] || [])) {
      const gHr = `HRM\\${g}`;
      for (const t of (groupsToTables[gHr] || [])) {
        if (!grantTables.has(t)) grantTables.set(t, new Set());
        grantTables.get(t).add(g);
      }
    }
  }
  let rows = Array.from(grantTables.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  if (userGroupFilter) rows = rows.filter(([, gs]) => gs.has(userGroupFilter));
  els.userTables.innerHTML = rows.map(([t, gs]) => `
    <div class="table-card">
      <div class="tname">${t}</div>
      <div class="grants">${Array.from(gs).sort().map(g => `<span class="chip small code">${g}</span>`).join('')}</div>
    </div>
  `).join('');
}

function renderByGroup(groupNames, filterText = '') {
  const label = groupNames.length === 1 ? `(${groupNames[0]})` : groupNames.length > 1 ? `(${groupNames.length} groups)` : '';
  els.groupNameLabel.textContent = label;
  els.groupNameLabel2.textContent = label;

  // Members — union across all selected groups
  const memberSet = new Set();
  for (const g of groupNames) {
    for (const m of (groupsToUsers[g] || [])) {
      if (m !== '<No members>') memberSet.add(m);
    }
  }
  const members = Array.from(memberSet).sort();
  els.groupMembers.innerHTML = members.map(n => `
    <div class="user"><div class="name">${n}</div></div>
  `).join('') || '<div class="muted">No known members</div>';

  // Tables — union across all selected groups
  const tableSet = new Set();
  for (const g of groupNames) {
    for (const t of (groupsToTables[`HRM\\${g}`] || [])) tableSet.add(t);
  }
  const f = filterText.trim().toLowerCase();
  let tables = Array.from(tableSet).sort();
  if (f) tables = tables.filter(t => t.toLowerCase().includes(f));
  els.groupTables.innerHTML = tables.map(t => `
    <div class="table-card"><div class="tname">${t}</div></div>
  `).join('') || '<div class="muted">No tables mapped for this group</div>';
}

function exportCsvForTable(tableNames) {
  const rows = [['Table', 'User', 'Granting Group']];
  for (const t of tableNames) {
    for (const u of (tablesToUsers[t] || [])) {
      if (!u.groups.length) rows.push([t, u.name, '']);
      for (const g of u.groups) rows.push([t, u.name, g]);
    }
  }
  const fname = tableNames.length === 1 ? `table_${tableNames[0]}_editors.csv` : 'table_multi_editors.csv';
  downloadCsv(rows, fname);
}

function exportCsvForUser(userNames) {
  const rows = [['User', 'Table', 'Granting Group']];
  const seen = new Set();
  for (const u of userNames) {
    for (const g of (usersToGroups[u] || [])) {
      const gHr = `HRM\\${g}`;
      for (const t of (groupsToTables[gHr] || [])) {
        const key = `${u}|${t}|${g}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push([u, t, g]);
      }
    }
  }
  const fname = userNames.length === 1 ? `user_${userNames[0].replace(/[^a-z0-9]+/gi, '_')}_tables.csv` : 'user_multi_tables.csv';
  downloadCsv(rows, fname);
}

function exportCsvForGroup(groupNames) {
  const rows = [['Group', 'Table']];
  for (const g of groupNames) {
    for (const t of (groupsToTables[`HRM\\${g}`] || [])) rows.push([g, t]);
  }
  const fname = groupNames.length === 1 ? `group_${groupNames[0].replace(/[^a-z0-9]+/gi, '_')}_tables.csv` : 'group_multi_tables.csv';
  downloadCsv(rows, fname);
}

function downloadCsv(rows, filename) {
  const csv = rows.map(r => r.map(v => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Wire up tab switching
els.tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    els.tabBtns.forEach(b => b.classList.remove('active'));
    els.tabPanels.forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

// File inputs and default loaders
els.btnLoadEditors.addEventListener('click', async () => {
  try {
    setStatus('Loading default editors...');
    const data = await loadDefaultEditors();
    groupsToUsers = data;
    setStatus('Loaded editors.');
  } catch (e) { setStatus('Failed to load editors.'); console.error(e); }
});

els.btnLoadTables.addEventListener('click', async () => {
  try {
    setStatus('Loading default tables...');
    const data = await loadDefaultTables();
    groupsToTables = data;
    setStatus('Loaded tables.');
    // After both sides are present, normalize and render
    normalizeAndIndex(groupsToUsers, groupsToTables);
    populateSelectors();
    // initial renders
    const tv = selectedValues(els.tableSelect); if (tv.length) renderByTable(tv);
    const uv = selectedValues(els.userSelect); if (uv.length) renderByUser(uv);
    const gv = selectedValues(els.groupSelect); if (gv.length) renderByGroup(gv);
  } catch (e) { setStatus('Failed to load tables.'); console.error(e); }
});

els.fileEditors.addEventListener('change', async (ev) => {
  const f = ev.target.files[0]; if (!f) return;
  try {
    const data = await readFileAsJson(f);
    groupsToUsers = data;
    setStatus(`Loaded editors from file: ${f.name}`);
  } catch (e) { setStatus('Failed to parse editors JSON.'); console.error(e); }
});

els.fileTables.addEventListener('change', async (ev) => {
  const f = ev.target.files[0]; if (!f) return;
  try {
    const data = await readFileAsJson(f);
    groupsToTables = data;
    setStatus(`Loaded tables from file: ${f.name}`);
    normalizeAndIndex(groupsToUsers, groupsToTables);
    populateSelectors();
    const tv = selectedValues(els.tableSelect); if (tv.length) renderByTable(tv);
    const uv = selectedValues(els.userSelect); if (uv.length) renderByUser(uv);
    const gv = selectedValues(els.groupSelect); if (gv.length) renderByGroup(gv);
  } catch (e) { setStatus('Failed to parse tables JSON.'); console.error(e); }
});

// Selectors and search
els.tableSelect.addEventListener('change', () => {
  tableGroupFilter = null;
  renderByTable(selectedValues(els.tableSelect), els.tableSearch.value);
});
els.tableSearch.addEventListener('input', () => renderByTable(selectedValues(els.tableSelect), els.tableSearch.value));

els.userSelect.addEventListener('change', () => {
  userGroupFilter = null;
  renderByUser(selectedValues(els.userSelect));
});
els.userSearch.addEventListener('input', () => {
  const q = els.userSearch.value.trim().toLowerCase();
  const all = Object.keys(usersToGroups).sort();
  const filt = q ? all.filter(u => u.toLowerCase().includes(q)) : all;
  const prev = new Set(selectedValues(els.userSelect));
  els.userSelect.innerHTML = filt.map(u => `<option value="${u}"${prev.has(u) ? ' selected' : ''}>${u}</option>`).join('');
  const cur = selectedValues(els.userSelect);
  if (cur.length) renderByUser(cur);
});

els.groupSelect.addEventListener('change', () => renderByGroup(selectedValues(els.groupSelect), els.groupSearch.value));
els.groupSearch.addEventListener('input', () => renderByGroup(selectedValues(els.groupSelect), els.groupSearch.value));

// Exports
els.exportTableCsv.addEventListener('click', () => {
  const ts = selectedValues(els.tableSelect); if (!ts.length) return;
  exportCsvForTable(ts);
});
els.exportUserCsv.addEventListener('click', () => {
  const us = selectedValues(els.userSelect); if (!us.length) return;
  exportCsvForUser(us);
});
els.exportGroupCsv.addEventListener('click', () => {
  const gs = selectedValues(els.groupSelect); if (!gs.length) return;
  exportCsvForGroup(gs);
});

// Report tab
els.reportSearch.addEventListener('input', () => {
  const q = els.reportSearch.value.trim().toLowerCase();
  els.reportTableList.querySelectorAll('.check-item').forEach(item => {
    item.style.display = (!q || item.querySelector('span').textContent.toLowerCase().includes(q)) ? '' : 'none';
  });
});

els.reportSelectVisible.addEventListener('click', () => {
  els.reportTableList.querySelectorAll('.check-item').forEach(item => {
    if (item.style.display !== 'none') item.querySelector('input').checked = true;
  });
  updateReportSelCount();
});

els.reportClearAll.addEventListener('click', () => {
  els.reportTableList.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
  updateReportSelCount();
});

els.reportGenerate.addEventListener('click', renderReport);
els.exportReportCsv.addEventListener('click', exportCsvForReport);

// Auto-attempt to load both defaults on first paint
(async function bootstrap() {
  try {
    const [editors, tables] = await Promise.allSettled([
      loadDefaultEditors(),
      loadDefaultTables(),
    ]);
    if (editors.status === 'fulfilled') groupsToUsers = editors.value;
    if (tables.status === 'fulfilled') groupsToTables = tables.value;
    if (editors.status === 'fulfilled' && tables.status === 'fulfilled') {
      setStatus('Loaded default data.');
      normalizeAndIndex(groupsToUsers, groupsToTables);
      populateSelectors();
      if (els.tableSelect.value) renderByTable(els.tableSelect.value);
      if (els.userSelect.value) renderByUser(els.userSelect.value);
      if (els.groupSelect.value) renderByGroup(els.groupSelect.value);
    } else {
      setStatus('Load your JSON files or click the Load buttons above.');
    }
  } catch (e) {
    console.error(e);
    setStatus('Ready. Load your JSON files to begin.');
  }
})();