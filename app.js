'use strict';

// Data stores
let groupsToUsers = {};         // "GIS_XYZ" -> ["Last, First", ...]
let groupsHrmed = {};           // "HRM\\GIS_XYZ" -> [users]
let usersToGroups = {};         // "Last, First" -> ["GIS_XYZ", ...]
let groupsToTables = {};        // "HRM\\GIS_XYZ" -> ["TABLE_A", ...]
let tablesToGroups = {};        // "TABLE_A" -> ["HRM\\GIS_XYZ", ...]
let tablesToUsers = {};         // "TABLE_A" -> [{name, groups:[...]}, ...]

// Timestamps of the last-loaded JSON files (Date | null)
let editorsLastModified = null;
let tablesLastModified = null;

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
  tableGroupsCount: document.getElementById('tableGroupsCount'),
  exportTableCsv: document.getElementById('exportTableCsv'),
  userSelect: document.getElementById('userSelect'),
  userGroups: document.getElementById('userGroups'),
  userTables: document.getElementById('userTables'),
  userSearch: document.getElementById('userSearch'),
  userNameLabel: document.getElementById('userNameLabel'),
  userGroupsCount: document.getElementById('userGroupsCount'),
  exportUserCsv: document.getElementById('exportUserCsv'),
  // New group view elements
  groupSelect: document.getElementById('groupSelect'),
  groupSearch: document.getElementById('groupSearch'),
  exportGroupCsv: document.getElementById('exportGroupCsv'),
  groupNameLabel: document.getElementById('groupNameLabel'),
  groupNameLabel2: document.getElementById('groupNameLabel2'),
  groupMembers: document.getElementById('groupMembers'),
  groupMembersCount: document.getElementById('groupMembersCount'),
  groupTables: document.getElementById('groupTables'),
  groupTablesCount: document.getElementById('groupTablesCount'),
  // Report tab
  overviewSearch: document.getElementById('overviewSearch'),
  overviewStats: document.getElementById('overviewStats'),
  overviewMeta: document.getElementById('overviewMeta'),
  overviewList: document.getElementById('overviewList'),
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

function formatDate(d) {
  if (!d) return 'unknown';
  return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Helpers
async function loadDefaultEditors() {
  const r = await fetch('groups_and_editors.json');
  const lm = r.headers.get('Last-Modified');
  if (lm) editorsLastModified = new Date(lm);
  return r.json();
}
async function loadDefaultTables() {
  const r = await fetch('groups_and_tables.json');
  const lm = r.headers.get('Last-Modified');
  if (lm) tablesLastModified = new Date(lm);
  return r.json();
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

// ── Overview ─────────────────────────────────────────────────────────────────

let overviewRanked = []; // cached on data load, re-used by search filter

function renderOverview() {
  const totalUsers = Object.keys(usersToGroups).length;
  const totalGroups = allShortGroups().length;
  const totalTables = Object.keys(tablesToGroups).length;

  els.overviewStats.innerHTML = `
    <div class="stat-card"><div class="stat-value">${totalUsers}</div><div class="stat-label">Users</div></div>
    <div class="stat-card"><div class="stat-value">${totalGroups}</div><div class="stat-label">Groups</div></div>
    <div class="stat-card"><div class="stat-value">${totalTables}</div><div class="stat-label">Tables</div></div>
  `;
  els.overviewMeta.textContent =
    `Data snapshot — editors: ${formatDate(editorsLastModified)}  ·  tables: ${formatDate(tablesLastModified)}`;

  overviewRanked = Object.entries(usersToGroups)
    .map(([name, groups]) => {
      const sorted = groups.slice().sort();
      const tableSet = new Set();
      for (const g of sorted) {
        for (const t of (groupsToTables[`HRM\\${g}`] || [])) tableSet.add(t);
      }
      return { name, groups: sorted, tableCount: tableSet.size };
    })
    .sort((a, b) => b.groups.length - a.groups.length || a.name.localeCompare(b.name));

  renderOverviewList(overviewRanked, els.overviewSearch.value);
}

function renderOverviewList(ranked, filterText) {
  const f = filterText.trim().toLowerCase();
  const filtered = f ? ranked.filter(u => u.name.toLowerCase().includes(f)) : ranked;

  const MAX_CHIPS = 5;
  els.overviewList.innerHTML = filtered.map(u => {
    const shown = u.groups.slice(0, MAX_CHIPS);
    const extra = u.groups.length - shown.length;
    const chips = shown.map(g => `<span class="chip small code">${g}</span>`).join('');
    const more = extra > 0 ? `<span class="chip small muted">+${extra} more</span>` : '';
    return `
      <div class="overview-user" data-user="${u.name}">
        <div class="overview-user-main">
          <span class="overview-user-name">${u.name}</span>
          <span class="badge-groups">${u.groups.length} group${u.groups.length !== 1 ? 's' : ''}</span>
          <span class="badge-tables">${u.tableCount} table${u.tableCount !== 1 ? 's' : ''}</span>
        </div>
        <div class="overview-user-groups">${chips}${more}</div>
      </div>`;
  }).join('') || '<div class="muted">No users found.</div>';

  els.overviewList.querySelectorAll('.overview-user').forEach(row => {
    row.addEventListener('click', () => {
      const name = row.dataset.user;
      els.tabBtns.forEach(b => b.classList.remove('active'));
      els.tabPanels.forEach(p => p.classList.remove('active'));
      document.querySelector('[data-tab="byUser"]').classList.add('active');
      document.getElementById('byUser').classList.add('active');
      els.userSelect.value = name;
      userGroupFilter = null;
      renderByUser(name);
    });
  });
}

function renderByTable(tableName, filterText = '') {
  // groups
  const groups = (tablesToGroups[tableName] || []).map(g => g.replace(/^HRM\\/, '')).sort();
  els.tableGroupsCount.textContent = groups.length ? `(${groups.length})` : '';
  els.tableGroups.innerHTML = groups.map(g =>
    `<li class="chip clickable${tableGroupFilter === g ? ' active' : ''}" data-group="${g}"><span class="code">${g}</span></li>`
  ).join('');
  els.tableGroups.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      tableGroupFilter = tableGroupFilter === chip.dataset.group ? null : chip.dataset.group;
      renderByTable(tableName, els.tableSearch.value);
    });
  });

  // users — filter by name search and active group chip
  let list = tablesToUsers[tableName] || [];
  const f = filterText.trim().toLowerCase();
  if (f) list = list.filter(x => x.name.toLowerCase().includes(f));
  if (tableGroupFilter) list = list.filter(u => u.groups.includes(tableGroupFilter));

  // Update header label with table name and user count
  const userCount = list.length;
  els.tableNameLabel.textContent = tableName
    ? `(${tableName}${userCount ? ` · ${userCount} user${userCount !== 1 ? 's' : ''}` : ''})`
    : '';

  // Group users by their granting group; if only one group exists skip headers
  const activeGroups = tableGroupFilter ? [tableGroupFilter] : groups;
  if (activeGroups.length <= 1) {
    // Flat list — no group headers needed
    els.tableUsers.innerHTML = list.map(u => `
      <div class="user"><div class="name">${u.name}</div></div>
    `).join('');
  } else {
    // Grouped by granting group
    els.tableUsers.innerHTML = activeGroups.map(g => {
      const inGroup = list.filter(u => u.groups.includes(g));
      if (!inGroup.length) return '';
      return `
        <div class="group-section">
          <div class="group-section-header">
            <span class="chip small clickable code">${g}</span>
            <span class="muted count">${inGroup.length} user${inGroup.length !== 1 ? 's' : ''}</span>
          </div>
          ${inGroup.map(u => `<div class="user"><div class="name">${u.name}</div></div>`).join('')}
        </div>`;
    }).join('');
  }
}

function renderByUser(userName) {
  const userGroupsShort = (usersToGroups[userName] || []).slice().sort();
  els.userGroupsCount.textContent = userGroupsShort.length ? `(${userGroupsShort.length})` : '';
  els.userGroups.innerHTML = userGroupsShort.map(g =>
    `<li class="chip clickable${userGroupFilter === g ? ' active' : ''}" data-group="${g}"><span class="code">${g}</span></li>`
  ).join('');
  els.userGroups.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      userGroupFilter = userGroupFilter === chip.dataset.group ? null : chip.dataset.group;
      renderByUser(userName);
    });
  });

  // Build group -> sorted tables map for the active groups
  const activeGroups = userGroupFilter ? [userGroupFilter] : userGroupsShort;
  let totalTables = 0;
  const groupTableMap = activeGroups.map(g => {
    const tables = (groupsToTables[`HRM\\${g}`] || []).slice().sort();
    totalTables += tables.length;
    return { g, tables };
  }).filter(({ tables }) => tables.length > 0);

  // Update header label with user name and total table count
  els.userNameLabel.textContent = userName
    ? `(${userName}${totalTables ? ` · ${totalTables} table${totalTables !== 1 ? 's' : ''}` : ''})`
    : '';

  // Grouped by granting group; flat list when only one group
  if (activeGroups.length <= 1) {
    const tables = groupTableMap[0]?.tables || [];
    els.userTables.innerHTML = tables.map(t => `
      <div class="table-card"><div class="tname">${t}</div></div>
    `).join('');
  } else {
    els.userTables.innerHTML = groupTableMap.map(({ g, tables }) => `
      <div class="group-section">
        <div class="group-section-header">
          <span class="chip small clickable code">${g}</span>
          <span class="muted count">${tables.length} table${tables.length !== 1 ? 's' : ''}</span>
        </div>
        ${tables.map(t => `<div class="table-card"><div class="tname">${t}</div></div>`).join('')}
      </div>`).join('');
  }
}

function renderByGroup(groupName, filterText = '') {
  els.groupNameLabel.textContent = groupName ? `(${groupName})` : '';
  els.groupNameLabel2.textContent = groupName ? `(${groupName})` : '';

  // Members
  const members = (groupsToUsers[groupName] || []).filter(n => n !== '<No members>');
  els.groupMembersCount.textContent = members.length ? `(${members.length})` : '';
  els.groupMembers.innerHTML = members.map(n => `
    <div class="user"><div class="name">${n}</div></div>
  `).join('') || '<div class="muted">No known members</div>';

  // Tables
  const gHr = `HRM\\${groupName}`;
  const tables = (groupsToTables[gHr] || []).slice().sort();
  const f = filterText.trim().toLowerCase();
  const filtered = f ? tables.filter(t => t.toLowerCase().includes(f)) : tables;
  els.groupTablesCount.textContent = filtered.length ? `(${filtered.length})` : '';
  els.groupTables.innerHTML = filtered.map(t => `
    <div class="table-card"><div class="tname">${t}</div></div>
  `).join('') || '<div class="muted">No tables mapped for this group</div>';
}

function exportCsvForTable(tableName) {
  const rows = [['Table', 'User', 'Granting Group']];
  const list = tablesToUsers[tableName] || [];
  for (const u of list) {
    if (!u.groups.length) rows.push([tableName, u.name, '']);
    for (const g of u.groups) rows.push([tableName, u.name, g]);
  }
  downloadCsv(rows, `table_${tableName}_editors.csv`);
}

function exportCsvForUser(userName) {
  const rows = [['User', 'Table', 'Granting Group']];
  const groups = usersToGroups[userName] || [];
  const seen = new Set();
  for (const g of groups) {
    const gHr = `HRM\\${g}`;
    for (const t of (groupsToTables[gHr] || [])) {
      const key = `${userName}|${t}|${g}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push([userName, t, g]);
    }
  }
  downloadCsv(rows, `user_${userName.replace(/[^a-z0-9]+/gi, '_')}_tables.csv`);
}

function exportCsvForGroup(groupName) {
  const gHr = `HRM\\${groupName}`;
  const tables = groupsToTables[gHr] || [];
  const rows = [['Group', 'Table']];
  for (const t of tables) rows.push([groupName, t]);
  downloadCsv(rows, `group_${groupName.replace(/[^a-z0-9]+/gi, '_')}_tables.csv`);
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
    normalizeAndIndex(groupsToUsers, groupsToTables);
    populateSelectors();
    renderOverview();
    if (els.tableSelect.value) renderByTable(els.tableSelect.value);
    if (els.userSelect.value) renderByUser(els.userSelect.value);
    if (els.groupSelect.value) renderByGroup(els.groupSelect.value);
  } catch (e) { setStatus('Failed to load tables.'); console.error(e); }
});

els.fileEditors.addEventListener('change', async (ev) => {
  const f = ev.target.files[0]; if (!f) return;
  try {
    const data = await readFileAsJson(f);
    groupsToUsers = data;
    editorsLastModified = new Date(f.lastModified);
    setStatus(`Loaded editors from file: ${f.name}`);
  } catch (e) { setStatus('Failed to parse editors JSON.'); console.error(e); }
});

els.fileTables.addEventListener('change', async (ev) => {
  const f = ev.target.files[0]; if (!f) return;
  try {
    const data = await readFileAsJson(f);
    groupsToTables = data;
    tablesLastModified = new Date(f.lastModified);
    setStatus(`Loaded tables from file: ${f.name}`);
    normalizeAndIndex(groupsToUsers, groupsToTables);
    populateSelectors();
    renderOverview();
    if (els.tableSelect.value) renderByTable(els.tableSelect.value);
    if (els.userSelect.value) renderByUser(els.userSelect.value);
    if (els.groupSelect.value) renderByGroup(els.groupSelect.value);
  } catch (e) { setStatus('Failed to parse tables JSON.'); console.error(e); }
});

// Selectors and search
els.overviewSearch.addEventListener('input', () => renderOverviewList(overviewRanked, els.overviewSearch.value));

els.tableSelect.addEventListener('change', () => {
  tableGroupFilter = null;
  renderByTable(els.tableSelect.value, els.tableSearch.value);
});
els.tableSearch.addEventListener('input', () => renderByTable(els.tableSelect.value, els.tableSearch.value));

els.userSelect.addEventListener('change', () => {
  userGroupFilter = null;
  renderByUser(els.userSelect.value);
});
els.userSearch.addEventListener('input', () => {
  const q = els.userSearch.value.trim().toLowerCase();
  const all = Object.keys(usersToGroups).sort();
  const filt = q ? all.filter(u => u.toLowerCase().includes(q)) : all;
  els.userSelect.innerHTML = filt.map(u => `<option value="${u}">${u}</option>`).join('');
  if (els.userSelect.value) renderByUser(els.userSelect.value);
});

els.groupSelect.addEventListener('change', () => renderByGroup(els.groupSelect.value, els.groupSearch.value));
els.groupSearch.addEventListener('input', () => renderByGroup(els.groupSelect.value, els.groupSearch.value));

// Exports
els.exportTableCsv.addEventListener('click', () => {
  const t = els.tableSelect.value; if (!t) return;
  exportCsvForTable(t);
});
els.exportUserCsv.addEventListener('click', () => {
  const u = els.userSelect.value; if (!u) return;
  exportCsvForUser(u);
});
els.exportGroupCsv.addEventListener('click', () => {
  const g = els.groupSelect.value; if (!g) return;
  exportCsvForGroup(g);
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