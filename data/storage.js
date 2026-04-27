// ============================================================
// 持久化存储模块 - localStorage 接管所有可变数据
// 加载顺序：data/members.js → data/queues.js → data/schedules.js
//           → data/overtime.js → data/storage.js（本文件）
//           → js/app.js → ...
// ============================================================

// 数据版本号：结构变更时递增，触发自动迁移
// v5: 清空所有模拟排班数据，改为全空（OFF）初始状态
// v6: 彻底清除历史脏排班 key 和白名单（保留当前月数据）
const STORAGE_VERSION = '6';
const STORAGE_VERSION_KEY = 'glxt_storage_version';

// 若版本不匹配，清除旧缓存，强制使用新的 JS 默认值
if (localStorage.getItem(STORAGE_VERSION_KEY) !== STORAGE_VERSION) {
  // v6 迁移：先保存当前月排班数据，再清除所有排班 key 和白名单
  const _now = new Date();
  const _curYear = _now.getFullYear(), _curMonth = _now.getMonth() + 1;
  const _curScheduleKey = `glxt_schedule_${_curYear}_${_curMonth}`;
  // 读出当前月数据（可能是旧格式 key 或新格式 key）
  let _savedCurMonth = null;
  try {
    const _raw = localStorage.getItem(_curScheduleKey) || localStorage.getItem('glxt_schedule_data');
    if (_raw) _savedCurMonth = JSON.parse(_raw);
  } catch (e) {}
  // 清除所有 glxt_schedule_ 开头的 key
  const _keysToRemove = [];
  for (let _i = 0; _i < localStorage.length; _i++) {
    const _k = localStorage.key(_i);
    if (_k && _k.startsWith('glxt_schedule_')) _keysToRemove.push(_k);
  }
  _keysToRemove.forEach(_k => localStorage.removeItem(_k));
  // 清除白名单
  localStorage.removeItem('glxt_imported_months');
  // 清除旧格式排班数据
  localStorage.removeItem('glxt_members_data');
  localStorage.removeItem('glxt_schedule_data');
  // 写回当前月数据（如果有）
  if (_savedCurMonth) {
    localStorage.setItem(_curScheduleKey, JSON.stringify(_savedCurMonth));
    localStorage.setItem('glxt_imported_months', `${_curYear}_${_curMonth}`);
  }
  localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION);
  console.log('[storage] v6 迁移完成：已清除历史脏排班数据，当前月数据已保留');
}

// 每次启动时扫描并清除非法排班 key
// 保护白名单：glxt_imported_months 记录所有通过正规导入写入的年月（格式："2026_5,2026_6"）
// 不在白名单中的非当前月排班 key，一律视为脏数据清除
(function _cleanIllegalMonthData() {
  const now = new Date();
  const curYear = now.getFullYear(), curMonth = now.getMonth() + 1;
  const curKey = `glxt_schedule_${curYear}_${curMonth}`;
  const prefix = 'glxt_schedule_';
  // 读取正规导入白名单
  let importedMonths = [];
  try {
    const raw = localStorage.getItem('glxt_imported_months');
    if (raw) importedMonths = raw.split(',').filter(Boolean);
  } catch (e) {}
  const whiteKeys = new Set(importedMonths.map(m => `${prefix}${m}`));
  whiteKeys.add(curKey);
  whiteKeys.add('glxt_schedule_data');
  whiteKeys.add('glxt_schedule_rules');  // r85: 规则数据不是排班月数据，不应被清理

  // ⚠️ 必须先把所有 key 收集到数组，再删除
  // 直接在 for 循环中删除会导致 localStorage.length 和索引实时变化，造成漏删
  const allKeys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k) allKeys.push(k);
  }
  const keysToRemove = allKeys.filter(k => k.startsWith(prefix) && !whiteKeys.has(k));
  keysToRemove.forEach(k => {
    localStorage.removeItem(k);
    console.warn(`[storage] 清除非法排班 key: ${k}`);
  });
  if (keysToRemove.length > 0) {
    console.log(`[storage] 共清除 ${keysToRemove.length} 个非法排班 key`);
  }
})();

const STORAGE_KEYS = {
  SHIFTS:              'glxt_shifts',
  LEAVE_TYPES:         'glxt_leave_types',
  SCHEDULE_DATA:       'glxt_schedule_data',
  APPROVAL_RECORDS:    'glxt_approval_records',
  OVERTIME_RECORDS:    'glxt_overtime_records',
  WORK_LOGS:           'glxt_work_logs',
  MEMBERS_DATA:        'glxt_members_data',
  ONDUTY_OVERRIDE:     'glxt_onduty_override',   // 在班天数自定义覆盖值（按年月存储）
  ANNOUNCEMENTS:       'glxt_announcements',      // 排班公告列表
  SCHEDULE_RULES:      'glxt_schedule_rules',     // 排班规则（按团队配置）
  CUSTOM_CALENDARS:    'glxt_custom_calendars',   // 自定义排班日历卡片
  ATT_NOTIFY:          'glxt_att_notify',          // r120: 考勤通知状态（按年月存储）
  CUSTOM_TEAMS:        'glxt_custom_teams',        // r133: 自定义团队列表
  QUEUES_DATA:         'glxt_queues_data',          // 队列管理数据
  WORKTIME_TYPES:      'glxt_worktime_types',       // 统一工时类型（管理员可自定义）
};

// ---------- 排班数据按年月分 key 存储 ----------
// key 格式：glxt_schedule_2026_4
function _scheduleKey(year, month) {
  return `glxt_schedule_${year}_${month}`;
}

// 读取指定年月的排班数据（返回 null 表示无数据）
function loadScheduleData(year, month) {
  return _storageGet(_scheduleKey(year, month), null);
}

// 将指定年月标记为"正规写入"，加入白名单，防止被脏数据清理误删
function markMonthAsImported(year, month) {
  try {
    const key = 'glxt_imported_months';
    const list = (localStorage.getItem(key) || '').split(',').filter(Boolean);
    const entry = `${year}_${month}`;
    if (!list.includes(entry)) {
      list.push(entry);
      localStorage.setItem(key, list.join(','));
    }
  } catch (e) {}
}

// ---------- 通用读写 ----------

// #10: lz-string 压缩 — 仅对排班数据（glxt_schedule_ 开头）启用，其余 key 保持原样
function _shouldCompress(key) {
  return key && key.startsWith('glxt_schedule_') && typeof LZString !== 'undefined';
}

function _storageGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    // 兼容旧数据：以 '{' 或 '[' 开头的是未压缩 JSON，否则尝试解压
    if (_shouldCompress(key) && raw.length > 0 && raw[0] !== '{' && raw[0] !== '[' && raw[0] !== 'n') {
      const decompressed = LZString.decompressFromUTF16(raw);
      if (decompressed) return JSON.parse(decompressed);
    }
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[storage] 读取失败:', key, e);
    return fallback;
  }
}

function _storageSet(key, value) {
  try {
    if (_shouldCompress(key)) {
      const compressed = LZString.compressToUTF16(JSON.stringify(value));
      localStorage.setItem(key, compressed);
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch (e) {
    console.warn('[storage] 写入失败:', key, e);
  }
}

// ---------- 各数据源的 save 函数（供业务层调用）----------

function saveShifts()          { _storageSet(STORAGE_KEYS.SHIFTS,           SHIFTS); }
function saveLeaveTypes()      { _storageSet(STORAGE_KEYS.LEAVE_TYPES,      LEAVE_TYPES); }
function saveCustomCalendars() { _storageSet(STORAGE_KEYS.CUSTOM_CALENDARS, CUSTOM_CALENDARS); }
function saveScheduleData()    {
  // 按当前视图年月分 key 存储，支持多月数据共存
  const year  = (typeof scheduleYear  !== 'undefined') ? scheduleYear  : new Date().getFullYear();
  const month = (typeof scheduleMonth !== 'undefined') ? scheduleMonth : new Date().getMonth() + 1;
  _storageSet(_scheduleKey(year, month), SCHEDULE_DATA);
  // 排班数据变更后清除考勤统计缓存，确保下次查看考勤时数据是最新的
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

// ---------- 初始化：从 localStorage 恢复数据 ----------
// 若 localStorage 中没有数据（首次访问），则保留 JS 文件中的默认值并写入存储

(function initStorage() {

  // 1. SHIFTS（班次配置）
  const savedShifts = _storageGet(STORAGE_KEYS.SHIFTS, null);
  if (savedShifts) {
    Object.keys(SHIFTS).forEach(k => delete SHIFTS[k]);
    Object.assign(SHIFTS, savedShifts);
    // r110-fix: 补全旧版 localStorage 中丢失的 breakMinutes 字段
    // 默认值参考 schedules.js 原始定义：工作班次默认60分钟午休，OFF为0
    let _shiftPatched = false;
    Object.keys(SHIFTS).forEach(k => {
      if (k === 'OFF') return;
      if (SHIFTS[k].start && SHIFTS[k].end && SHIFTS[k].breakMinutes === undefined) {
        SHIFTS[k].breakMinutes = 60; // 工作班次默认60分钟午休
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
    // 迁移旧颜色 class（leave-annual → leave-b3 等）
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
      if (lt.id === 'sick') return; // 病假已删除，跳过
      if (_colorMigration[lt.color]) lt.color = _colorMigration[lt.color];
      LEAVE_TYPES.push(lt);
    });
    // 若过滤后为空，使用默认值
    if (LEAVE_TYPES.length === 0) {
      [{ id: 'annual', name: '年假', color: 'leave-b3', duration: 1, desc: '带薪年假' },
       { id: 'personal', name: '事假', color: 'leave-p3', duration: 0.5, desc: '个人事务' },
       { id: 'marriage', name: '婚假', color: 'leave-k3', duration: 1, desc: '结婚假期' },
       { id: 'maternity', name: '产假', color: 'leave-g3', duration: 1, desc: '生育假期' }
      ].forEach(lt => LEAVE_TYPES.push(lt));
    }
    saveLeaveTypes(); // 写回迁移后的数据
  } else {
    saveLeaveTypes();
  }

  // 3. SCHEDULE_DATA（排班数据，按年月分 key 存储）
  const now = new Date();
  const curYear = now.getFullYear(), curMonth = now.getMonth() + 1;
  const savedSchedule = _storageGet(_scheduleKey(curYear, curMonth), null)
    || _storageGet(STORAGE_KEYS.SCHEDULE_DATA, null); // 兼容旧格式
  if (savedSchedule) {
    Object.keys(SCHEDULE_DATA).forEach(k => delete SCHEDULE_DATA[k]);
    Object.assign(SCHEDULE_DATA, savedSchedule);
    // 迁移旧格式：写入新 key
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

  // 7. MEMBERS_DATA（人员数据，含角色/效率等可编辑字段）
  const savedMembers = _storageGet(STORAGE_KEYS.MEMBERS_DATA, null);
  if (savedMembers) {
    MEMBERS_DATA.length = 0;
    savedMembers.forEach(m => MEMBERS_DATA.push(m));
  } else {
    saveMembersData();
  }

  // 8. SCHEDULE_RULES（排班规则，按团队配置）
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

  // 10. CUSTOM_TEAMS（r133: 自定义团队）
  const savedTeams = _storageGet(STORAGE_KEYS.CUSTOM_TEAMS, null);
  if (savedTeams && Array.isArray(savedTeams)) {
    CUSTOM_TEAMS.length = 0;
    savedTeams.forEach(t => CUSTOM_TEAMS.push(t));
    // 同步 TEAMS 数组，保持排班等模块兼容
    TEAMS.length = 0;
    CUSTOM_TEAMS.forEach(t => TEAMS.push(t.name));
  } else {
    // 兼容 r132 旧数据：尝试从 glxt_custom_groups 迁移
    const oldGroups = _storageGet('glxt_custom_groups', null);
    if (oldGroups && Array.isArray(oldGroups)) {
      CUSTOM_TEAMS.length = 0;
      // 旧组别是短名（高曝），需转为全称（高曝团队）
      oldGroups.forEach(g => {
        let fullName = g.name;
        if (!fullName.includes('团队') && !fullName.includes('管理层')) fullName += '团队';
        CUSTOM_TEAMS.push({ id: g.id, name: fullName, color: g.color });
      });
      TEAMS.length = 0;
      CUSTOM_TEAMS.forEach(t => TEAMS.push(t.name));
      localStorage.removeItem('glxt_custom_groups');
    }
    saveCustomTeams();
  }

  // r133: 迁移成员数据中的 group 字段（移除）
  // r134: 权限体系迁移 — system_owner→admin, 补充 excludeFromSchedule/managedTeams
  let _memberMigrated = false;
  MEMBERS_DATA.forEach(m => {
    if ('group' in m) { delete m.group; _memberMigrated = true; }
    // r134: system_owner 角色已废弃，统一迁移为 admin
    if (m.role === 'system_owner') { m.role = 'admin'; _memberMigrated = true; }
    // r134: 补充 excludeFromSchedule 字段（默认 false = 参与排班）
    if (m.excludeFromSchedule === undefined) {
      m.excludeFromSchedule = false;
      _memberMigrated = true;
    }
    // r134-fix: 永久管理员参与排班（修正先前误设的 excludeFromSchedule:true）
    if (m.mis === 'wb_aijunlei' && m.excludeFromSchedule === true) {
      m.excludeFromSchedule = false;
      _memberMigrated = true;
    }
    // r134: 补充 managedTeams 字段（默认空数组）
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
  // r162: 补全 status 字段（兼容旧数据）
  let _queuePatched = false;
  QUEUES_DATA.forEach(q => {
    if (!q.status) { q.status = 'active'; _queuePatched = true; }
  });
  if (_queuePatched) saveQueuesData();

  // 12. WORKTIME_TYPES（统一工时类型，全部可自定义管理）
  const savedWtTypes = _storageGet(STORAGE_KEYS.WORKTIME_TYPES, null);
  if (savedWtTypes && Array.isArray(savedWtTypes)) {
    WORKTIME_TYPES.length = 0;
    savedWtTypes.forEach(t => {
      // 兼容旧数据：移除已废弃的 builtIn 字段
      delete t.builtIn;
      WORKTIME_TYPES.push(t);
    });
    // 不再强制补全内置类型——用户删掉就是删掉了
    saveWorktimeTypes();
  } else {
    // 首次访问：写入默认类型
    saveWorktimeTypes();
  }

  console.log('[storage] 数据恢复完成');
})();

// ---------- 清除所有持久化数据（用于重置系统）----------
function clearAllStorage() {
  Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
  console.log('[storage] 所有持久化数据已清除，刷新页面后将重新初始化');
}

// ============================================================
// 在班天数自定义覆盖（按 "YYYY-M" 分月存储）
// 结构：{ total: number|null, normal: number|null, triple: number|null }
// null 表示使用系统自动计算值
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
  localStorage.removeItem(_ondutyKey(year, month));
}

// ============================================================
// 排班公告（全局，不分月）
// 结构：[{ id, text, type, status, createdAt, createdBy }]
// type:   'success' | 'info' | 'warning'
// status: 'unread'  | 'read' | 'starred' | 'deleted'
// ============================================================

// 默认公告（首次加载时写入）
const DEFAULT_ANNOUNCEMENTS = [
  { id: 1, text: '本月三星期间（4/4-4/6）已完成排班覆盖', type: 'success', status: 'unread', createdAt: '2026-04-09', createdBy: '艾俊磊' },
  { id: 2, text: '请各团队负责人于每月25日前完成下月排班', type: 'info',    status: 'unread', createdAt: '2026-04-09', createdBy: '艾俊磊' },
];

// 运行时公告数组（由 initStorage 初始化）
let ANNOUNCEMENTS_DATA = [];

(function initAnnouncements() {
  const saved = _storageGet(STORAGE_KEYS.ANNOUNCEMENTS, null);
  if (saved && Array.isArray(saved)) {
    // 迁移旧数据：补充缺失的 status 字段
    ANNOUNCEMENTS_DATA = saved.map(a => ({ status: 'unread', ...a }));
  } else {
    ANNOUNCEMENTS_DATA = DEFAULT_ANNOUNCEMENTS.map(a => ({ ...a }));
    _storageSet(STORAGE_KEYS.ANNOUNCEMENTS, ANNOUNCEMENTS_DATA);
  }
})();

function saveAnnouncements() {
  _storageSet(STORAGE_KEYS.ANNOUNCEMENTS, ANNOUNCEMENTS_DATA);
}

// 设置公告状态（unread / read / starred / deleted）
function setAnnouncementStatus(id, status) {
  const a = ANNOUNCEMENTS_DATA.find(x => x.id === id);
  if (!a) return;
  a.status = status;
  saveAnnouncements();
}

// ===== r120: 考勤通知数据层 =====
// 结构: { "2026-04": { sent: true, sentAt: timestamp, sentBy: "name",
//          members: { "1": { read: true, readAt: ts, confirmed: true, confirmedAt: ts }, ... } } }
function _attNotifyKey(ym) { return STORAGE_KEYS.ATT_NOTIFY + '_' + ym; }
function loadAttNotify(ym) { return _storageGet(_attNotifyKey(ym), null); }
function saveAttNotify(ym, data) { _storageSet(_attNotifyKey(ym), data); }
