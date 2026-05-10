// ============================================================
// 持久化存储模块 V4.1 — 服务端 API 模式（多人共享数据 + 乐观锁）
// 加载顺序：data/members.js → data/queues.js → data/schedules.js
//           → data/overtime.js → data/storage.js（本文件）
//           → js/app.js → ...
//
// 【架构说明】
// 原始版本使用 localStorage，每个用户数据独立。
// 本版本改为通过 REST API 读写服务端 SQLite 数据库，所有用户共享同一份数据。
//
// 【V4.1 新增：乐观锁并发控制】
// 服务端每个 key 都带有 version 版本号，每次更新自增。
// 写入时发送 expectedVersion，若版本不匹配（被其他用户修改），
// 服务端返回 409 冲突，前端提示用户选择"覆盖"或"刷新"。
//
// 【设计原则】
// 1. 页面加载时，从服务器批量拉取所有 glxt_ 开头的数据到内存
// 2. 运行时操作全局变量（SHIFTS、SCHEDULE_DATA 等），体验与原来完全一致
// 3. 每次 save 操作同时更新内存 + 异步写入服务端（带 version 检查）
// 4. 保留 localStorage 作为离线降级方案
// ============================================================

// ===== API 基础设施 =====
const _API_BASE = '';  // 同域部署，无需前缀

// ===== 版本号缓存 =====
// 记录每个 key 从服务端获取到的 version，写入时用于乐观锁
let _versionCache = {};

// 异步写入服务端（带乐观锁）
function _apiSet(key, value, onConflict) {
  const body = typeof value === 'string' ? value : JSON.stringify(value);
  const payload = { value: body };

  // 如果有缓存的版本号，使用乐观锁
  if (_versionCache[key] !== undefined && _versionCache[key] > 0) {
    payload.expectedVersion = _versionCache[key];
  }

  fetch(`${_API_BASE}/api/kv/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(resp => {
    if (resp.status === 409) {
      // 版本冲突
      return resp.json().then(data => {
        console.warn(`[storage] 版本冲突: ${key}`, data);
        _handleConflict(key, value, data, onConflict);
      });
    }
    return resp.json().then(data => {
      if (data.ok && data.version) {
        _versionCache[key] = data.version;
      }
    });
  }).catch(err => console.warn('[storage] API 写入失败:', key, err));
}

// 同步写入服务端（用于关键操作，确保数据在页面刷新前持久化）
function _apiSetSync(key, value) {
  try {
    const body = typeof value === 'string' ? value : JSON.stringify(value);
    const payload = { value: body };
    if (_versionCache[key] !== undefined && _versionCache[key] > 0) {
      payload.expectedVersion = _versionCache[key];
    }
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `${_API_BASE}/api/kv/${encodeURIComponent(key)}`, false);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(JSON.stringify(payload));
    if (xhr.status === 200) {
      const resp = JSON.parse(xhr.responseText);
      if (resp.ok && resp.version) {
        _versionCache[key] = resp.version;
      }
      return true;
    } else if (xhr.status === 409) {
      // 版本冲突时强制写入
      const xhr2 = new XMLHttpRequest();
      xhr2.open('PUT', `${_API_BASE}/api/kv/${encodeURIComponent(key)}`, false);
      xhr2.setRequestHeader('Content-Type', 'application/json');
      xhr2.send(JSON.stringify({ value: body }));
      if (xhr2.status === 200) {
        const resp2 = JSON.parse(xhr2.responseText);
        if (resp2.ok && resp2.version) _versionCache[key] = resp2.version;
        return true;
      }
    }
  } catch (e) {
    console.warn('[storage] 同步写入失败:', key, e);
  }
  return false;
}

// 版本冲突处理
function _handleConflict(key, localValue, conflictData, onConflict) {
  if (typeof onConflict === 'function') {
    onConflict(key, localValue, conflictData);
    return;
  }
  // 默认冲突处理：提示用户
  const friendlyKey = _getFriendlyKeyName(key);
  const msg = `【数据冲突提示】\n\n"${friendlyKey}" 已被其他用户修改。\n\n点击"确定"用您的数据覆盖服务端，\n点击"取消"刷新页面获取最新数据。`;

  if (confirm(msg)) {
    // 用户选择覆盖：不带 expectedVersion 强制写入
    _apiSetForce(key, localValue);
  } else {
    // 用户选择刷新
    window.location.reload();
  }
}

// 强制写入（不带版本号）
function _apiSetForce(key, value) {
  const body = typeof value === 'string' ? value : JSON.stringify(value);
  fetch(`${_API_BASE}/api/kv/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: body })
  }).then(resp => resp.json()).then(data => {
    if (data.ok && data.version) {
      _versionCache[key] = data.version;
    }
  }).catch(err => console.warn('[storage] API 强制写入失败:', key, err));
}

// key 名称友好化
function _getFriendlyKeyName(key) {
  const map = {
    'glxt_shifts': '班次配置',
    'glxt_leave_types': '请假类型',
    'glxt_members_data': '人员数据',
    'glxt_approval_records': '审批记录',
    'glxt_overtime_records': '工时记录',
    'glxt_work_logs': '工作日志',
    'glxt_announcements': '排班公告',
    'glxt_schedule_rules': '排班规则',
    'glxt_custom_calendars': '自定义日历',
    'glxt_custom_teams': '团队配置',
    'glxt_queues_data': '队列数据',
    'glxt_worktime_types': '工时类型',
  };
  if (map[key]) return map[key];
  if (key.startsWith('glxt_schedule_')) {
    const parts = key.replace('glxt_schedule_', '').split('_');
    return `排班数据 (${parts[0]}年${parts[1]}月)`;
  }
  return key;
}

// 异步批量写入（不带乐观锁，用于初始化等批量场景）
function _apiBatchSet(items) {
  const data = {};
  Object.entries(items).forEach(([k, v]) => {
    data[k] = typeof v === 'string' ? v : JSON.stringify(v);
  });
  fetch(`${_API_BASE}/api/kv/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: data })
  }).then(resp => resp.json()).then(result => {
    // 批量写入后无法获取每个 key 的 version，需要重新拉取
    if (result.ok) {
      _refreshVersions(Object.keys(items));
    }
  }).catch(err => console.warn('[storage] API 批量写入失败:', err));
}

// 刷新指定 keys 的版本号
function _refreshVersions(keys) {
  if (!keys || keys.length === 0) return;
  fetch(`${_API_BASE}/api/kv/batch-read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keys })
  }).then(resp => resp.json()).then(data => {
    if (data.ok && data.versions) {
      Object.assign(_versionCache, data.versions);
    }
  }).catch(() => {});
}

// 异步删除
function _apiDel(key) {
  delete _versionCache[key];
  fetch(`${_API_BASE}/api/kv/${encodeURIComponent(key)}`, {
    method: 'DELETE'
  }).catch(err => console.warn('[storage] API 删除失败:', key, err));
}

// ===== 服务端缓存 — 页面加载时批量拉取 =====
let _serverCache = {};
let _serverLoaded = false;

// 同步加载服务端数据（使用同步 XMLHttpRequest）
(function _loadServerData() {
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', `${_API_BASE}/api/kv?prefix=glxt_`, false);  // 同步请求
    xhr.send();
    if (xhr.status === 200) {
      const resp = JSON.parse(xhr.responseText);
      if (resp.ok && resp.data) {
        _serverCache = resp.data;
        _serverLoaded = true;
        // V4.1: 同时缓存版本号
        if (resp.versions) {
          _versionCache = resp.versions;
        }
        console.log(`[storage] 从服务器加载了 ${Object.keys(_serverCache).length} 条数据（含版本号）`);
      }
    }
  } catch (e) {
    console.warn('[storage] 服务器连接失败，使用本地 localStorage 降级:', e);
    _serverLoaded = false;
  }
})();

// ===== STORAGE_KEYS =====
const STORAGE_KEYS = {
  SHIFTS:              'glxt_shifts',
  LEAVE_TYPES:         'glxt_leave_types',
  SCHEDULE_DATA:       'glxt_schedule_data',
  APPROVAL_RECORDS:    'glxt_approval_records',
  OVERTIME_RECORDS:    'glxt_overtime_records',
  WORK_LOGS:           'glxt_work_logs',
  MEMBERS_DATA:        'glxt_members_data',
  ONDUTY_OVERRIDE:     'glxt_onduty_override',
  ANNOUNCEMENTS:       'glxt_announcements',
  SCHEDULE_RULES:      'glxt_schedule_rules',
  CUSTOM_CALENDARS:    'glxt_custom_calendars',
  ATT_NOTIFY:          'glxt_att_notify',
  CUSTOM_TEAMS:        'glxt_custom_teams',
  QUEUES_DATA:         'glxt_queues_data',
  WORKTIME_TYPES:      'glxt_worktime_types',
};

// ---------- 排班数据按年月分 key 存储 ----------
function _scheduleKey(year, month) {
  return `glxt_schedule_${year}_${month}`;
}

function loadScheduleData(year, month) {
  return _storageGet(_scheduleKey(year, month), null);
}

function markMonthAsImported(year, month) {
  try {
    const key = 'glxt_imported_months';
    const raw = _storageGetRaw(key) || '';
    const list = raw.split(',').filter(Boolean);
    const entry = `${year}_${month}`;
    if (!list.includes(entry)) {
      list.push(entry);
      const newVal = list.join(',');
      _storageSetRaw(key, newVal);
    }
  } catch (e) {}
}

// ---------- 通用读写（服务端优先，localStorage 降级）----------

function _storageGetRaw(key) {
  if (_serverLoaded && _serverCache[key] !== undefined) {
    return _serverCache[key];
  }
  return localStorage.getItem(key);
}

function _storageSetRaw(key, rawValue) {
  // 写入内存缓存
  _serverCache[key] = rawValue;
  // 写入 localStorage（离线降级）
  try { localStorage.setItem(key, rawValue); } catch (e) {}
  // 异步写入服务端（带乐观锁）
  _apiSet(key, rawValue);
}

function _storageGet(key, fallback) {
  try {
    const raw = _storageGetRaw(key);
    if (raw === null || raw === undefined) return fallback;
    if (typeof LZString !== 'undefined' && key.startsWith('glxt_schedule_') && raw.length > 0 && raw[0] !== '{' && raw[0] !== '[' && raw[0] !== 'n' && raw[0] !== '"') {
      const decompressed = LZString.decompressFromUTF16(raw);
      if (decompressed) return JSON.parse(decompressed);
    }
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[storage] 读取失败:', key, e);
    return fallback;
  }
}

function _storageSet(key, value, sync) {
  try {
    const json = JSON.stringify(value);
    // 写入内存缓存
    _serverCache[key] = json;
    // 写入 localStorage（离线降级）
    try { localStorage.setItem(key, json); } catch (e) {}
    // 写入服务端（sync=true 时同步写入，确保关键数据不丢失）
    if (sync) {
      _apiSetSync(key, json);
    } else {
      _apiSet(key, json);
    }
  } catch (e) {
    console.warn('[storage] 写入失败:', key, e);
  }
}

function _storageDel(key) {
  delete _serverCache[key];
  delete _versionCache[key];
  try { localStorage.removeItem(key); } catch (e) {}
  _apiDel(key);
}

// ---------- 各数据源的 save 函数（供业务层调用）----------

function saveShifts()          { _storageSet(STORAGE_KEYS.SHIFTS,           SHIFTS); }
function saveLeaveTypes()      { _storageSet(STORAGE_KEYS.LEAVE_TYPES,      LEAVE_TYPES); }
function saveCustomCalendars(sync) { _storageSet(STORAGE_KEYS.CUSTOM_CALENDARS, CUSTOM_CALENDARS, sync); }
function saveScheduleData()    {
  const year  = (typeof scheduleYear  !== 'undefined') ? scheduleYear  : new Date().getFullYear();
  const month = (typeof scheduleMonth !== 'undefined') ? scheduleMonth : new Date().getMonth() + 1;
  _storageSet(_scheduleKey(year, month), SCHEDULE_DATA);
  if (typeof _clearAttCache === 'function') _clearAttCache();
}
function saveApprovalRecords() { _storageSet(STORAGE_KEYS.APPROVAL_RECORDS, APPROVAL_RECORDS); }
function saveOvertimeRecords() { _storageSet(STORAGE_KEYS.OVERTIME_RECORDS, OVERTIME_RECORDS); }
function saveWorkLogs()        { _storageSet(STORAGE_KEYS.WORK_LOGS,        WORK_LOGS); }
function saveMembersData()     { _storageSet(STORAGE_KEYS.MEMBERS_DATA,     MEMBERS_DATA); }
function saveScheduleRules()   { _storageSet(STORAGE_KEYS.SCHEDULE_RULES,   SCHEDULE_RULES); }
function saveCustomTeams()     { _storageSet(STORAGE_KEYS.CUSTOM_TEAMS,     CUSTOM_TEAMS); }
function saveQueuesData()      { _storageSet(STORAGE_KEYS.QUEUES_DATA,      QUEUES_DATA); }
function saveWorktimeTypes()   { _storageSet(STORAGE_KEYS.WORKTIME_TYPES,   WORKTIME_TYPES); }

// ---------- 初始化：从服务端恢复数据 ----------

(function initStorage() {

  // 1. SHIFTS（班次配置）
  const savedShifts = _storageGet(STORAGE_KEYS.SHIFTS, null);
  if (savedShifts) {
    Object.keys(SHIFTS).forEach(k => delete SHIFTS[k]);
    Object.assign(SHIFTS, savedShifts);
    let _shiftPatched = false;
    Object.keys(SHIFTS).forEach(k => {
      if (k === 'OFF') return;
      if (SHIFTS[k].start && SHIFTS[k].end && SHIFTS[k].breakMinutes === undefined) {
        SHIFTS[k].breakMinutes = 60;
        _shiftPatched = true;
      }
    });
    if (_shiftPatched) saveShifts();
  } else {
    saveShifts();
  }

  // 2. LEAVE_TYPES（请假类型）
  const savedLeaveTypes = _storageGet(STORAGE_KEYS.LEAVE_TYPES, null);
  if (savedLeaveTypes) {
    const _colorMigration = {
      'leave-annual':    'leave-b3',
      'leave-sick':      'leave-o3',
      'leave-personal':  'leave-p3',
      'leave-marriage':  'leave-k3',
      'leave-maternity': 'leave-g3',
      'leave-custom1':   'leave-c3',
      'leave-custom2':   'leave-r3',
    };
    LEAVE_TYPES.length = 0;
    savedLeaveTypes.forEach(lt => {
      if (lt.id === 'sick') return;
      if (_colorMigration[lt.color]) lt.color = _colorMigration[lt.color];
      LEAVE_TYPES.push(lt);
    });
    if (LEAVE_TYPES.length === 0) {
      [{ id: 'annual', name: '年假', color: 'leave-b3', duration: 1, desc: '带薪年假' },
       { id: 'personal', name: '事假', color: 'leave-p3', duration: 0.5, desc: '个人事务' },
       { id: 'marriage', name: '婚假', color: 'leave-k3', duration: 1, desc: '结婚假期' },
       { id: 'maternity', name: '产假', color: 'leave-g3', duration: 1, desc: '生育假期' }
      ].forEach(lt => LEAVE_TYPES.push(lt));
    }
    saveLeaveTypes();
  } else {
    saveLeaveTypes();
  }

  // 3. SCHEDULE_DATA（排班数据，按年月分 key 存储）
  const now = new Date();
  const curYear = now.getFullYear(), curMonth = now.getMonth() + 1;
  const savedSchedule = _storageGet(_scheduleKey(curYear, curMonth), null)
    || _storageGet(STORAGE_KEYS.SCHEDULE_DATA, null);
  if (savedSchedule) {
    Object.keys(SCHEDULE_DATA).forEach(k => delete SCHEDULE_DATA[k]);
    Object.assign(SCHEDULE_DATA, savedSchedule);
    _storageSet(_scheduleKey(curYear, curMonth), savedSchedule);
  } else {
    _storageSet(_scheduleKey(curYear, curMonth), SCHEDULE_DATA);
  }

  // 4. APPROVAL_RECORDS（审批记录）
  const savedApprovals = _storageGet(STORAGE_KEYS.APPROVAL_RECORDS, null);
  if (savedApprovals) {
    APPROVAL_RECORDS.length = 0;
    savedApprovals.forEach(r => APPROVAL_RECORDS.push(r));
  } else {
    saveApprovalRecords();
  }

  // 5. OVERTIME_RECORDS（工时系统记录）
  const savedOT = _storageGet(STORAGE_KEYS.OVERTIME_RECORDS, null);
  if (savedOT) {
    OVERTIME_RECORDS.length = 0;
    savedOT.forEach(r => OVERTIME_RECORDS.push(r));
  } else {
    saveOvertimeRecords();
  }

  // 6. WORK_LOGS（工作日志）
  const savedLogs = _storageGet(STORAGE_KEYS.WORK_LOGS, null);
  if (savedLogs) {
    WORK_LOGS.length = 0;
    savedLogs.forEach(l => WORK_LOGS.push(l));
  } else {
    saveWorkLogs();
  }

  // 7. MEMBERS_DATA（人员数据）
  const savedMembers = _storageGet(STORAGE_KEYS.MEMBERS_DATA, null);
  if (savedMembers) {
    MEMBERS_DATA.length = 0;
    savedMembers.forEach(m => MEMBERS_DATA.push(m));
  } else {
    saveMembersData();
  }

  // 8. SCHEDULE_RULES（排班规则）
  const savedRules = _storageGet(STORAGE_KEYS.SCHEDULE_RULES, null);
  if (savedRules) {
    Object.keys(SCHEDULE_RULES).forEach(k => delete SCHEDULE_RULES[k]);
    Object.assign(SCHEDULE_RULES, savedRules);
  } else {
    saveScheduleRules();
  }

  // 9. CUSTOM_CALENDARS（自定义排班日历卡片）
  const savedCalendars = _storageGet(STORAGE_KEYS.CUSTOM_CALENDARS, null);
  if (savedCalendars && Array.isArray(savedCalendars)) {
    CUSTOM_CALENDARS.length = 0;
    savedCalendars.forEach(c => CUSTOM_CALENDARS.push(c));
  } else {
    saveCustomCalendars();
  }

  // 10. CUSTOM_TEAMS（自定义团队）
  const savedTeams = _storageGet(STORAGE_KEYS.CUSTOM_TEAMS, null);
  if (savedTeams && Array.isArray(savedTeams)) {
    CUSTOM_TEAMS.length = 0;
    savedTeams.forEach(t => CUSTOM_TEAMS.push(t));
    TEAMS.length = 0;
    CUSTOM_TEAMS.forEach(t => TEAMS.push(t.name));
  } else {
    const oldGroups = _storageGet('glxt_custom_groups', null);
    if (oldGroups && Array.isArray(oldGroups)) {
      CUSTOM_TEAMS.length = 0;
      oldGroups.forEach(g => {
        let fullName = g.name;
        if (!fullName.includes('团队') && !fullName.includes('管理层')) fullName += '团队';
        CUSTOM_TEAMS.push({ id: g.id, name: fullName, color: g.color });
      });
      TEAMS.length = 0;
      CUSTOM_TEAMS.forEach(t => TEAMS.push(t.name));
      _storageDel('glxt_custom_groups');
    }
    saveCustomTeams();
  }

  // 成员数据迁移
  let _memberMigrated = false;
  MEMBERS_DATA.forEach(m => {
    if ('group' in m) { delete m.group; _memberMigrated = true; }
    if (m.role === 'system_owner') { m.role = 'admin'; _memberMigrated = true; }
    if (m.excludeFromSchedule === undefined) { m.excludeFromSchedule = false; _memberMigrated = true; }
    if (m.mis === 'wb_aijunlei' && m.excludeFromSchedule === true) { m.excludeFromSchedule = false; _memberMigrated = true; }
    if (!Array.isArray(m.managedTeams)) { m.managedTeams = []; _memberMigrated = true; }
  });
  if (_memberMigrated) saveMembersData();

  // 11. QUEUES_DATA（队列管理数据）
  const savedQueues = _storageGet(STORAGE_KEYS.QUEUES_DATA, null);
  if (savedQueues && Array.isArray(savedQueues)) {
    QUEUES_DATA.length = 0;
    savedQueues.forEach(q => QUEUES_DATA.push(q));
  } else {
    saveQueuesData();
  }
  let _queuePatched = false;
  QUEUES_DATA.forEach(q => {
    if (!q.status) { q.status = 'active'; _queuePatched = true; }
  });
  if (_queuePatched) saveQueuesData();

  // 12. WORKTIME_TYPES（统一工时类型）
  const savedWtTypes = _storageGet(STORAGE_KEYS.WORKTIME_TYPES, null);
  if (savedWtTypes && Array.isArray(savedWtTypes)) {
    WORKTIME_TYPES.length = 0;
    savedWtTypes.forEach(t => {
      delete t.builtIn;
      WORKTIME_TYPES.push(t);
    });
    saveWorktimeTypes();
  } else {
    saveWorktimeTypes();
  }

  console.log('[storage] 数据恢复完成' + (_serverLoaded ? '（服务端模式 + 乐观锁）' : '（本地模式）'));
})();

// ---------- 清除所有持久化数据（用于重置系统）----------
function clearAllStorage() {
  Object.values(STORAGE_KEYS).forEach(k => {
    _storageDel(k);
  });
  _versionCache = {};
  console.log('[storage] 所有持久化数据已清除，刷新页面后将重新初始化');
}

// ============================================================
// 在班天数自定义覆盖（按 "YYYY-M" 分月存储）
// ============================================================

function _ondutyKey(year, month) {
  return `${STORAGE_KEYS.ONDUTY_OVERRIDE}_${year}_${month}`;
}

function getOndutyOverride(year, month) {
  return _storageGet(_ondutyKey(year, month), { total: null, normal: null, triple: null });
}

function saveOndutyOverride(year, month, data) {
  _storageSet(_ondutyKey(year, month), data);
}

function clearOndutyOverride(year, month) {
  _storageDel(_ondutyKey(year, month));
}

// ============================================================
// 排班公告
// ============================================================

const DEFAULT_ANNOUNCEMENTS = [
  { id: 1, text: '本月三星期间（4/4-4/6）已完成排班覆盖', type: 'success', status: 'unread', createdAt: '2026-04-09', createdBy: '艾俊磊' },
  { id: 2, text: '请各团队负责人于每月25日前完成下月排班', type: 'info',    status: 'unread', createdAt: '2026-04-09', createdBy: '艾俊磊' },
];

let ANNOUNCEMENTS_DATA = [];

(function initAnnouncements() {
  const saved = _storageGet(STORAGE_KEYS.ANNOUNCEMENTS, null);
  if (saved && Array.isArray(saved)) {
    ANNOUNCEMENTS_DATA = saved.map(a => ({ status: 'unread', ...a }));
  } else {
    ANNOUNCEMENTS_DATA = DEFAULT_ANNOUNCEMENTS.map(a => ({ ...a }));
    _storageSet(STORAGE_KEYS.ANNOUNCEMENTS, ANNOUNCEMENTS_DATA);
  }
})();

function saveAnnouncements() {
  _storageSet(STORAGE_KEYS.ANNOUNCEMENTS, ANNOUNCEMENTS_DATA);
}

function setAnnouncementStatus(id, status) {
  const a = ANNOUNCEMENTS_DATA.find(x => x.id === id);
  if (!a) return;
  a.status = status;
  saveAnnouncements();
}

// ===== 考勤通知数据层 =====
function _attNotifyKey(ym) { return STORAGE_KEYS.ATT_NOTIFY + '_' + ym; }
function loadAttNotify(ym) { return _storageGet(_attNotifyKey(ym), null); }
function saveAttNotify(ym, data) { _storageSet(_attNotifyKey(ym), data); }
