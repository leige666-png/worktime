// ============================================================
// 队列管理模块 — 全功能增强版 r108
// 审核队列链接：https://dpaudit.sankuai.com/menu
// 功能：健康度4维加权评分(积压消化/人效/时效匹配/预警响应)
//       KPI 6卡片概览(sparkline/环比/钻取)、排序/拖拽排序
//       7维筛选(团队/项目/要求/Owner/状态/积压/预警)+标签联动
//       批量操作(删除/改团队/改Owner/改要求/改预警/切换状态)+Undo
//       行内编辑+变更摘要toast+撤销倒计时进度条
//       表格数据可视化(积压量数据条/人效进度条)
//       详情抽屉(快捷编辑/4维健康分项/趋势/日志/上下切换)
//       搜索(防抖/高亮/模糊)、状态Toggle Switch、导入导出增强
//       队列模板/对比分析/积压预测、A11y 辅助可访问性
// ============================================================

// ---- 模块级状态 ----
let _qmSortField = null;           // 当前排序字段
let _qmSortAsc = true;             // 升序
let _qmSelectedIds = new Set();    // 批量选中的队列ID
let _qmSearchTimer = null;         // 搜索防抖
let _qmFocusRowIndex = -1;         // 键盘导航：当前聚焦行索引
let _qmDragMode = false;           // 拖拽排序模式
let _qmDragSrcId = null;           // 拖拽源队列ID
let _qmUndoStack = [];             // Undo 栈 [{action, data, label}]
let _qmDrawerQueueId = null;       // 当前抽屉打开的队列ID
let _qmDrawerTab = 'overview';     // 抽屉当前 tab
let _qmLastShiftIdx = null;        // Shift多选锚点索引
let _qmNewQueueId = null;          // 新增队列后高亮
let _qmVisibleCols = JSON.parse(localStorage.getItem('qm_visible_cols') || 'null') || ['team','name','priority','project','owner','requirement','dailyVolume','backlog','effTarget','effActual','realTarget','enableWarning','status','actions'];
let _qmFilterPresets = JSON.parse(localStorage.getItem('qm_filter_presets') || '[]');
let _qmCustomOrder = JSON.parse(localStorage.getItem('qm_custom_order') || 'null'); // 自定义排序ID数组
let _qmContextMenu = null;         // 右键菜单元素
let _qmInlineEditCell = null;      // 当前行内编辑单元格
let _qmFilterTags = [];            // 活跃筛选标签 [{type, value, label}]

// ---- 队列模板 ----
const _QM_TEMPLATES = [
  { name: '标准图文复审', team: '复审团队', effCoef: 1.0, effTarget: 300, realTarget: 12 },
  { name: '标准视频复审', team: '复审团队', effCoef: 0.85, effTarget: 250, realTarget: 10 },
  { name: '高曝图文初审', team: '高曝团队', effCoef: 1.0, effTarget: 350, realTarget: 14 },
  { name: '高曝视频初审', team: '高曝团队', effCoef: 0.85, effTarget: 280, realTarget: 11 },
  { name: 'POI审核', team: 'POI团队', effCoef: 0.8, effTarget: 200, realTarget: 8 },
  { name: '评估任务', team: '高曝团队', effCoef: 0.6, effTarget: 150, realTarget: 6 },
];

// ---- 健康度评分计算（4维加权） ----
// 返回 { total, dims: [{key, name, weight, score, detail}] }
function _calcHealthDetail(q) {
  const dims = [];
  // 1. 积压消化 30%：基于消化天数评分
  const dailyOut = q.outReview || 0;
  const digestDays = dailyOut > 0 ? q.backlog / dailyOut : (q.backlog > 0 ? 999 : 0);
  let dScore;
  if (digestDays <= 0.5) dScore = 100;
  else if (digestDays <= 1) dScore = 90;
  else if (digestDays <= 2) dScore = 75;
  else if (digestDays <= 3) dScore = 60;
  else if (digestDays <= 5) dScore = 40;
  else dScore = Math.max(0, 20 - (digestDays - 5) * 2);
  const dDetail = dailyOut > 0 ? `消化${digestDays.toFixed(1)}天` : (q.backlog > 0 ? '无出审量' : '零积压');
  dims.push({ key: 'digest', name: '积压消化', weight: 0.3, score: Math.round(dScore), detail: dDetail });

  // 2. 人效达成 30%：连续映射
  const effRate = q.effTarget > 0 ? (q.effActual || 0) / q.effTarget : 1;
  let eScore;
  if (effRate >= 1.2) eScore = 100;
  else if (effRate >= 1.0) eScore = 90 + (effRate - 1.0) / 0.2 * 10;
  else if (effRate >= 0.8) eScore = 70 + (effRate - 0.8) / 0.2 * 20;
  else if (effRate >= 0.6) eScore = 40 + (effRate - 0.6) / 0.2 * 30;
  else eScore = Math.max(0, effRate / 0.6 * 40);
  dims.push({ key: 'eff', name: '人效达成', weight: 0.3, score: Math.round(eScore), detail: `${(effRate * 100).toFixed(0)}%` });

  // 3. 时效匹配 20%：基于要求等级与实际积压天数是否匹配
  let tScore = 70; // 默认中性
  const req = (q.requirement || '').trim();
  const reqDayMap = { '时清': 0.1, '日清': 1, '周清': 7, '周三清空': 3 };
  if (req && reqDayMap[req] !== undefined) {
    const allowDays = reqDayMap[req];
    if (digestDays <= allowDays) tScore = 100;
    else if (digestDays <= allowDays * 1.5) tScore = 75;
    else if (digestDays <= allowDays * 3) tScore = 45;
    else tScore = 15;
  } else if (!req) {
    tScore = 50; // 未设置要求
  }
  dims.push({ key: 'timely', name: '时效匹配', weight: 0.2, score: Math.round(tScore), detail: req || '未设置' });

  // 4. 预警响应 20%：是否开启预警、积压量是否在合理范围
  let wScore;
  if (q.enableWarning === 'yes') {
    // 已开启预警，根据积压水平评分
    if (q.backlog <= 500) wScore = 100;
    else if (q.backlog <= 1500) wScore = 80;
    else if (q.backlog <= 3000) wScore = 60;
    else wScore = 35;
  } else {
    // 未开启预警
    if (q.backlog <= 500) wScore = 80; // 低积压不开也可接受
    else if (q.backlog <= 1500) wScore = 55;
    else wScore = 25; // 高积压未开预警扣分重
  }
  dims.push({ key: 'warning', name: '预警响应', weight: 0.2, score: Math.round(wScore), detail: q.enableWarning === 'yes' ? '已开启' : '未开启' });

  const total = Math.round(dims.reduce((s, d) => s + d.weight * d.score, 0));
  return { total: Math.max(0, Math.min(100, total)), dims };
}
// 兼容旧接口
function _calcHealthScore(q) { return _calcHealthDetail(q).total; }

function _getHealthLevel(score) {
  if (score >= 80) return 'good';
  if (score >= 60) return 'warning';
  return 'danger';
}

function _getHealthColor(score) {
  if (score >= 80) return 'var(--success)';
  if (score >= 60) return 'var(--warning)';
  return 'var(--danger)';
}

function _getHealthLabel(score) {
  if (score >= 80) return '健康';
  if (score >= 60) return '关注';
  return '异常';
}

// ---- 积压量预测 ----
function _predictBacklog(q) {
  const dailyIn = q.inReview || 0;
  const dailyOut = q.outReview || 0;
  const net = dailyOut - dailyIn; // 正数=消化, 负数=增长
  if (net > 0 && q.backlog > 0) {
    return { type: 'clear', days: Math.ceil(q.backlog / net) };
  } else if (net < 0) {
    const daysTo5k = q.backlog < 5000 ? Math.ceil((5000 - q.backlog) / Math.abs(net)) : 0;
    return { type: 'grow', days: daysTo5k, rate: Math.abs(net) };
  }
  return { type: 'stable', days: 0 };
}

// ---- 历史快照 ----
function _saveQueueSnapshot(q) {
  const key = `qm_history_${q.id}`;
  const history = JSON.parse(localStorage.getItem(key) || '[]');
  const today = new Date().toISOString().slice(0, 10);
  // 每天只保留一条
  const existing = history.findIndex(h => h.date === today);
  const snap = { date: today, backlog: q.backlog, effActual: q.effActual || 0, realTarget: q.realTarget || '', health: _calcHealthScore(q) };
  if (existing >= 0) history[existing] = snap;
  else history.push(snap);
  // 只保留最近30天
  while (history.length > 30) history.shift();
  localStorage.setItem(key, JSON.stringify(history));
}

function _getQueueHistory(queueId) {
  return JSON.parse(localStorage.getItem(`qm_history_${queueId}`) || '[]');
}

// ---- Undo 机制 ----
function _qmPushUndo(action, data, label) {
  _qmUndoStack.push({ action, data, label, ts: Date.now() });
  if (_qmUndoStack.length > 20) _qmUndoStack.shift();
}

function _qmShowUndoToast(label) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast toast-confirm';
  toast.innerHTML = `
    <span class="toast-icon">✅</span>
    <span class="toast-confirm-msg">${label}</span>
    <button class="toast-confirm-btn" onclick="this.closest('.toast-confirm')._onUndo()">撤销</button>
    <button class="toast-cancel-btn" onclick="this.closest('.toast-confirm')._onDismiss()">关闭</button>
    <div class="qm-toast-progress"><div class="qm-toast-progress-bar"></div></div>
  `;
  let timer = null;
  const remove = () => {
    clearTimeout(timer);
    toast.style.opacity = '0'; toast.style.transform = 'translateX(12px) scale(0.95)';
    toast.style.transition = 'opacity 0.22s ease, transform 0.22s ease';
    setTimeout(() => toast.remove(), 240);
  };
  toast._onUndo = () => { remove(); _qmExecuteUndo(); };
  toast._onDismiss = () => { remove(); };
  container.appendChild(toast);
  // 启动进度条动画
  const bar = toast.querySelector('.qm-toast-progress-bar');
  if (bar) { requestAnimationFrame(() => { bar.style.transition = 'width 5s linear'; bar.style.width = '0%'; }); }
  timer = setTimeout(remove, 5000);
}

function _qmExecuteUndo() {
  const entry = _qmUndoStack.pop();
  if (!entry) { showToast('没有可撤销的操作', 'info'); return; }
  if (entry.action === 'delete') {
    entry.data.forEach(q => QUEUES_DATA.push(q));
  } else if (entry.action === 'changeTeam') {
    entry.data.forEach(({ id, oldTeam }) => {
      const q = QUEUES_DATA.find(x => x.id === id);
      if (q) q.team = oldTeam;
    });
  } else if (entry.action === 'toggleStatus') {
    entry.data.forEach(({ id, oldStatus }) => {
      const q = QUEUES_DATA.find(x => x.id === id);
      if (q) q.status = oldStatus;
    });
  } else if (entry.action === 'singleDelete') {
    QUEUES_DATA.push(entry.data);
  } else if (entry.action === 'singleStatus') {
    const q = QUEUES_DATA.find(x => x.id === entry.data.id);
    if (q) q.status = entry.data.oldStatus;
  } else if (entry.action === 'inlineEdit') {
    const q = QUEUES_DATA.find(x => x.id === entry.data.id);
    if (q) q[entry.data.field] = entry.data.oldValue;
  } else if (entry.action === 'changeOwner') {
    entry.data.forEach(({ id, oldVal }) => {
      const q = QUEUES_DATA.find(x => x.id === id);
      if (q) q.owner = oldVal;
    });
  } else if (entry.action === 'changeReq') {
    entry.data.forEach(({ id, oldVal }) => {
      const q = QUEUES_DATA.find(x => x.id === id);
      if (q) q.requirement = oldVal;
    });
  } else if (entry.action === 'changeWarning') {
    entry.data.forEach(({ id, oldVal }) => {
      const q = QUEUES_DATA.find(x => x.id === id);
      if (q) q.enableWarning = oldVal;
    });
  }
  saveQueuesData();
  addWorkLog('队列管理', '撤销操作', `撤销: ${entry.label}`);
  showToast(`已撤销: ${entry.label}`, 'success');
  renderQueueManagePage(document.getElementById('contentArea'));
}

// ---- 获取当前筛选后的队列列表（供多处复用） ----
function _getFilteredQueues() {
  const team = document.getElementById('qmTeamFilter')?.value || 'all';
  const status = document.getElementById('qmStatusFilter')?.value || 'all';
  const keyword = (document.getElementById('qmSearchInput')?.value || '').trim().toLowerCase();
  const backlogLevel = document.getElementById('qmBacklogFilter')?.value || 'all';
  const project = document.getElementById('qmProjectFilter')?.value || 'all';
  const requirement = document.getElementById('qmRequirementFilter')?.value || 'all';
  const owner = document.getElementById('qmOwnerFilter')?.value || 'all';
  const warning = document.getElementById('qmWarningFilter')?.value || 'all';
  let filtered = QUEUES_DATA.slice();

  if (team !== 'all') filtered = filtered.filter(q => q.team === team);
  if (status !== 'all') filtered = filtered.filter(q => (q.status || 'active') === status);
  if (backlogLevel !== 'all') filtered = filtered.filter(q => getBacklogLevel(q.backlog) === backlogLevel);
  if (project !== 'all') filtered = filtered.filter(q => q.project === project);
  if (requirement !== 'all') filtered = filtered.filter(q => q.requirement === requirement);
  if (owner !== 'all') filtered = filtered.filter(q => (q.owner || '').split('/').map(s => s.trim()).includes(owner));
  if (warning !== 'all') filtered = filtered.filter(q => (q.enableWarning || 'no') === warning);

  if (keyword) filtered = filtered.filter(q =>
    q.name.toLowerCase().includes(keyword) ||
    String(q.id).includes(keyword) ||
    (q.team || '').toLowerCase().includes(keyword) ||
    (q.auditTags || '').toLowerCase().includes(keyword) ||
    (q.owner || '').toLowerCase().includes(keyword) ||
    (q.project || '').toLowerCase().includes(keyword)
  );

  // 应用自定义顺序（拖拽模式）
  if (_qmDragMode && _qmCustomOrder) {
    filtered.sort((a, b) => {
      const ia = _qmCustomOrder.indexOf(a.id), ib = _qmCustomOrder.indexOf(b.id);
      return (ia === -1 ? 9999 : ia) - (ib === -1 ? 9999 : ib);
    });
  } else if (_qmSortField) {
    filtered.sort((a, b) => {
      let va, vb;
      if (_qmSortField === 'health') {
        va = _calcHealthScore(a); vb = _calcHealthScore(b);
      } else {
        va = a[_qmSortField]; vb = b[_qmSortField];
      }
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return _qmSortAsc ? -1 : 1;
      if (va > vb) return _qmSortAsc ? 1 : -1;
      return 0;
    });
  }
  return filtered;
}

// ---- KPI 计算（增强版 v2 — 6卡片） ----
function _calcQueueKPI(queues) {
  const active = queues.filter(q => (q.status || 'active') === 'active').length;
  const paused = queues.length - active;
  const teamMap = {};
  queues.forEach(q => { teamMap[q.team] = (teamMap[q.team] || 0) + 1; });
  const teamBreakdown = Object.entries(teamMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  const highBacklog = queues.filter(q => q.backlog > 3000).length;
  // 人效达成率（加权平均）
  const withEff = queues.filter(q => q.effTarget > 0);
  const avgEffRate = withEff.length > 0 ? (withEff.reduce((s, q) => s + ((q.effActual || 0) / q.effTarget) * 100, 0) / withEff.length).toFixed(1) : '0.0';
  // 平均健康度
  const avgHealth = queues.length > 0 ? Math.round(queues.reduce((s, q) => s + _calcHealthScore(q), 0) / queues.length) : 0;
  // 总积压量
  const totalBacklog = queues.reduce((s, q) => s + (q.backlog || 0), 0);
  // 预警队列数
  const warningCount = queues.filter(q => q.enableWarning === 'yes').length;
  // 时清达标率：requirement 含「时清」且 backlog === 0 的比例
  const timelyQueues = queues.filter(q => q.requirement === '时清');
  const timelyClear = timelyQueues.filter(q => (q.backlog || 0) === 0).length;
  const timelyClearRate = timelyQueues.length > 0 ? Math.round(timelyClear / timelyQueues.length * 100) : 100;
  return { total: queues.length, active, paused, teamCount: teamBreakdown.length, teamBreakdown, highBacklog, avgEffRate, avgHealth, totalBacklog, warningCount, timelyClearRate, timelyClear, timelyTotal: timelyQueues.length };
}

function _hexToRgba(hex, alpha) {
  if (!hex || hex.startsWith('rgb')) return hex;
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ---- 迷你 Sparkline SVG ----
function _renderSparkline(data, w, h, color) {
  if (!data || data.length < 2) return '';
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;margin-top:4px"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// ---- 主渲染 ----
function renderQueueManagePage(container) {
  if (!checkPermission('manage_members')) {
    container.innerHTML = '<div class="empty-state"><p>仅管理员可管理队列</p></div>';
    return;
  }

  // 保存快照
  QUEUES_DATA.forEach(q => _saveQueueSnapshot(q));

  _qmSelectedIds.clear();
  _qmFocusRowIndex = -1;
  _qmLastShiftIdx = null;
  const queues = QUEUES_DATA;
  const teamOptions = getTeamNames().map(t => `<option value="${t}">${t}</option>`).join('');
  // 动态提取项目/Owner可选值
  const projectSet = [...new Set(queues.map(q => q.project).filter(Boolean).filter(p => p !== '/'))].sort();
  const projectOptions = projectSet.map(p => `<option value="${p}">${p}</option>`).join('');
  const ownerSet = [...new Set(queues.flatMap(q => (q.owner || '').split('/').map(s => s.trim())).filter(Boolean).filter(o => o !== '/'))].sort();
  const ownerOptions = ownerSet.map(o => `<option value="${o}">${o}</option>`).join('');
  const requirementOptions = ['时清','日清','周清','周三清空'].map(r => `<option value="${r}">${r}</option>`).join('');
  const kpi = _calcQueueKPI(queues);

  // sparkline 数据（从历史中取）
  const backlogHistory = _getAggregateHistory('backlog', 7);
  const effHistory = _getAggregateHistory('effActual', 7);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">队列管理</div>
        <div class="page-subtitle">管理审核队列配置，包括人效/时效目标、团队归属、状态等</div>
      </div>
      <div class="page-actions">
        <a href="https://dpaudit.sankuai.com/menu" target="_blank" class="btn btn-default btn-sm" style="text-decoration:none">🔗 审核队列后台</a>
        <button class="btn btn-default btn-sm" onclick="showQueueImportModal()">📥 导入配置</button>
        <button class="btn btn-default btn-sm" onclick="showExportConfigModal()">📤 导出配置</button>
        <button class="btn btn-primary btn-sm" onclick="showAddQueueModal()">+ 新增队列</button>
      </div>
    </div>

    <!-- KPI 概览卡片（6张） -->
    <div class="qm-kpi-grid">
      <div class="qm-kpi-card qm-kpi-clickable" onclick="_qmKpiDrill('total')" title="点击查看全部队列">
        <div class="qm-kpi-row-top">
          <div class="qm-kpi-icon" style="background:rgba(20,86,240,0.08);color:var(--primary)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          </div>
          <div class="qm-kpi-body">
            <div class="qm-kpi-value">${kpi.total}</div>
            <div class="qm-kpi-label">队列总数</div>
          </div>
        </div>
        <div class="qm-kpi-sub">
          <span class="qm-kpi-tag qm-kpi-tag-green">${kpi.active} 启用</span>
          <span class="qm-kpi-tag qm-kpi-tag-gray">${kpi.paused} 暂停</span>
        </div>
      </div>
      <div class="qm-kpi-card qm-kpi-clickable" onclick="_qmKpiDrill('total')" title="启停比例">
        <div class="qm-kpi-row-top">
          <div class="qm-kpi-mini-ring">
            <svg width="44" height="44" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(0,0,0,0.04)" stroke-width="3"/>
              <circle cx="18" cy="18" r="14" fill="none" stroke="#00B42A" stroke-width="3" stroke-dasharray="${kpi.total > 0 ? Math.round(kpi.active / kpi.total * 88) : 0} 88" stroke-linecap="round" transform="rotate(-90 18 18)"/>
            </svg>
            <span class="qm-kpi-ring-pct">${kpi.total > 0 ? Math.round(kpi.active / kpi.total * 100) : 0}%</span>
          </div>
          <div class="qm-kpi-body">
            <div class="qm-kpi-value">${kpi.active}<span style="font-size:13px;font-weight:400;color:var(--text-tertiary)">/${kpi.total}</span></div>
            <div class="qm-kpi-label">启停比</div>
          </div>
        </div>
        <div class="qm-kpi-sub">
          ${kpi.teamBreakdown.slice(0, 3).map(t => `<span class="qm-kpi-tag" style="background:${_hexToRgba(getTeamColor(t.name), 0.1)};color:${getTeamColor(t.name)}">${t.name.replace('团队','')} ${t.count}</span>`).join('')}
        </div>
      </div>
      <div class="qm-kpi-card qm-kpi-clickable" onclick="_qmKpiDrill('eff')" title="点击查看人效详情">
        <div class="qm-kpi-row-top">
          <div class="qm-kpi-icon" style="background:rgba(114,46,209,0.08);color:#722ED1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20V10"/><path d="M6 20V4"/><path d="M18 20v-6"/></svg>
          </div>
          <div class="qm-kpi-body">
            <div class="qm-kpi-value">${kpi.avgEffRate}<span style="font-size:12px;font-weight:400;color:var(--text-tertiary)">%</span></div>
            <div class="qm-kpi-label">人效达成率</div>
          </div>
        </div>
        <div class="qm-kpi-sub">
          <span class="qm-kpi-tag ${parseFloat(kpi.avgEffRate) >= 100 ? 'qm-kpi-tag-green' : parseFloat(kpi.avgEffRate) >= 80 ? 'qm-kpi-tag-orange' : 'qm-kpi-tag-red'}">${parseFloat(kpi.avgEffRate) >= 100 ? '达标' : parseFloat(kpi.avgEffRate) >= 80 ? '接近' : '不足'}</span>
        </div>
        ${_renderSparkline(effHistory, 60, 16, '#722ED1')}
      </div>
      <div class="qm-kpi-card qm-kpi-clickable" onclick="_qmKpiDrill('backlog')" title="点击筛选高积压">
        <div class="qm-kpi-row-top">
          <div class="qm-kpi-icon" style="background:rgba(245,63,63,0.08);color:var(--danger)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <div class="qm-kpi-body">
            <div class="qm-kpi-value">${kpi.totalBacklog.toLocaleString()}</div>
            <div class="qm-kpi-label">总积压量</div>
          </div>
        </div>
        <div class="qm-kpi-sub">
          <span class="qm-kpi-tag qm-kpi-tag-red">${kpi.highBacklog} 个高积压</span>
        </div>
        ${_renderSparkline(backlogHistory, 60, 16, '#F53F3F')}
      </div>
      <div class="qm-kpi-card qm-kpi-clickable" onclick="_qmKpiDrill('warning')" title="点击筛选预警队列">
        <div class="qm-kpi-row-top">
          <div class="qm-kpi-icon" style="background:rgba(255,125,0,0.08);color:var(--warning)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          </div>
          <div class="qm-kpi-body">
            <div class="qm-kpi-value">${kpi.warningCount}</div>
            <div class="qm-kpi-label">预警队列数</div>
          </div>
        </div>
        <div class="qm-kpi-sub">
          <span class="qm-kpi-tag qm-kpi-tag-orange">占比 ${kpi.total > 0 ? Math.round(kpi.warningCount / kpi.total * 100) : 0}%</span>
        </div>
      </div>
      <div class="qm-kpi-card qm-kpi-clickable" onclick="_qmKpiDrill('timely')" title="时清队列达标情况">
        <div class="qm-kpi-row-top">
          <div class="qm-kpi-mini-ring">
            <svg width="44" height="44" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(0,0,0,0.04)" stroke-width="3"/>
              <circle cx="18" cy="18" r="14" fill="none" stroke="${kpi.timelyClearRate >= 100 ? '#00B42A' : kpi.timelyClearRate >= 80 ? '#FF7D00' : '#F53F3F'}" stroke-width="3" stroke-dasharray="${Math.round(kpi.timelyClearRate * 0.88)} 88" stroke-linecap="round" transform="rotate(-90 18 18)"/>
            </svg>
            <span class="qm-kpi-ring-pct">${kpi.timelyClearRate}%</span>
          </div>
          <div class="qm-kpi-body">
            <div class="qm-kpi-value">${kpi.timelyClear}<span style="font-size:13px;font-weight:400;color:var(--text-tertiary)">/${kpi.timelyTotal}</span></div>
            <div class="qm-kpi-label">时清达标率</div>
          </div>
        </div>
        <div class="qm-kpi-sub">
          <span class="qm-kpi-tag ${kpi.timelyClearRate >= 100 ? 'qm-kpi-tag-green' : kpi.timelyClearRate >= 80 ? 'qm-kpi-tag-orange' : 'qm-kpi-tag-red'}">${kpi.timelyClearRate >= 100 ? '全部达标' : kpi.timelyClearRate >= 80 ? '基本达标' : '需关注'}</span>
        </div>
      </div>
    </div>

    <!-- 筛选栏 -->
    <div class="qm-filter-bar" id="qmFilterBar">
      <div class="qm-filter-left">
        <div class="filter-item">
          <span class="filter-label">团队</span>
          <select class="filter-select" id="qmTeamFilter" onchange="_qmApplyFilter()">
            <option value="all">全部团队</option>
            ${teamOptions}
          </select>
        </div>
        <div class="filter-item">
          <span class="filter-label">项目</span>
          <select class="filter-select" id="qmProjectFilter" onchange="_qmApplyFilter()">
            <option value="all">全部项目</option>
            ${projectOptions}
          </select>
        </div>
        <div class="filter-item">
          <span class="filter-label">要求</span>
          <select class="filter-select" id="qmRequirementFilter" onchange="_qmApplyFilter()">
            <option value="all">全部</option>
            ${requirementOptions}
          </select>
        </div>
        <div class="filter-item">
          <span class="filter-label">Owner</span>
          <select class="filter-select" id="qmOwnerFilter" onchange="_qmApplyFilter()">
            <option value="all">全部</option>
            ${ownerOptions}
          </select>
        </div>
        <div class="filter-item">
          <span class="filter-label">状态</span>
          <select class="filter-select" id="qmStatusFilter" onchange="_qmApplyFilter()">
            <option value="all">全部</option>
            <option value="active">启用中</option>
            <option value="paused">已暂停</option>
          </select>
        </div>
        <div class="filter-item">
          <span class="filter-label">积压</span>
          <select class="filter-select" id="qmBacklogFilter" onchange="_qmApplyFilter()">
            <option value="all">全部</option>
            <option value="high">高 >3000</option>
            <option value="mid">中 1000~3000</option>
            <option value="low">低 &lt;1000</option>
          </select>
        </div>
        <div class="filter-item">
          <span class="filter-label">预警</span>
          <select class="filter-select" id="qmWarningFilter" onchange="_qmApplyFilter()">
            <option value="all">全部</option>
            <option value="yes">已预警</option>
            <option value="no">未预警</option>
          </select>
        </div>
        <div class="filter-item qm-search-wrap">
          <input type="text" class="form-control qm-search-input" id="qmSearchInput" placeholder="搜索名称/ID/团队/标签..." oninput="_qmSearchDebounce()" style="width:200px;height:30px;font-size:12px" aria-label="搜索队列">
          <span class="qm-search-clear" id="qmSearchClear" onclick="_qmClearSearch()" title="清空搜索" style="display:none">✕</span>
          <span class="qm-search-hint">/ 快捷搜索</span>
        </div>
      </div>
      <div class="qm-filter-right">
        ${_qmFilterPresets.length > 0 ? `<select class="filter-select" id="qmPresetSelect" onchange="_qmApplyPreset(this.value)" style="font-size:11px"><option value="">筛选预设</option>${_qmFilterPresets.map((p, i) => `<option value="${i}">${p.name}</option>`).join('')}</select>` : ''}
        <button class="btn btn-default btn-sm qm-btn-icon" onclick="_qmSaveFilterPreset()" title="保存当前筛选为预设">💾</button>
        <div style="width:1px;height:16px;background:var(--border);margin:0 4px"></div>
        <button class="btn btn-default btn-sm qm-btn-icon ${_qmDragMode ? 'qm-btn-active' : ''}" onclick="_qmToggleDragMode()" title="${_qmDragMode ? '退出手动排序' : '手动排序模式'}">⠿</button>
        <button class="btn btn-default btn-sm qm-btn-icon" onclick="_qmShowColumnSettings()" title="列设置">⚙️</button>
        <button class="btn btn-default btn-sm qm-btn-icon" onclick="_qmShowCompare()" title="对比选中队列">📊</button>
      </div>
    </div>

    <!-- 活跃筛选标签 -->
    <div class="qm-filter-tags" id="qmFilterTags"></div>

    <!-- 批量操作工具栏 -->
    <div class="qm-batch-bar" id="qmBatchBar" style="display:none">
      <span class="qm-batch-count" id="qmSelectedCount">已选 0</span>
      <button class="btn btn-default btn-sm" onclick="batchDeleteQueues()">🗑️ 删除</button>
      <button class="btn btn-default btn-sm" onclick="batchChangeTeam()">👥 改团队</button>
      <button class="btn btn-default btn-sm" onclick="batchChangeOwner()">👤 改Owner</button>
      <button class="btn btn-default btn-sm" onclick="batchChangeRequirement()">📋 改要求</button>
      <button class="btn btn-default btn-sm" onclick="batchChangeWarning()">🔔 改预警</button>
      <button class="btn btn-default btn-sm" onclick="batchToggleStatus()">⏸️ 切换状态</button>
      <button class="btn btn-default btn-sm" onclick="_qmShowCompare()" title="对比分析">📊 对比</button>
      <span style="flex:1"></span>
      <span style="font-size:12px;color:var(--text-tertiary)">Shift+点击 连续选中 | Ctrl+A 全选</span>
    </div>

    <!-- 数据表格 -->
    <div class="card qm-table-card">
      <div class="card-body" style="padding:0">
        <div class="table-wrap qm-table-wrap">
          <table class="data-table qm-table" id="queueManageTable">
            <thead>
              <tr>
                ${_qmDragMode ? '<th style="width:32px" class="qm-col-drag"></th>' : ''}
                <th style="width:36px"><input type="checkbox" id="qmSelectAll" onchange="toggleQueueSelectAll(this.checked)" title="全选" aria-label="全选"></th>
                ${_qmColVisible('team') ? '<th style="width:72px">团队</th>' : ''}
${_qmColVisible('name') ? '<th style="width:180px" class="qm-sortable" onclick="sortQueueTable(\'name\')">队列名称 <span class="qm-sort-icon" data-field="name">↕</span></th>' : ''}
${_qmColVisible('priority') ? '<th style="width:56px" class="qm-sortable" onclick="sortQueueTable(\'priority\')">优先级 <span class="qm-sort-icon" data-field="priority">↕</span></th>' : ''}
${_qmColVisible('id') ? '<th style="width:56px" class="qm-sortable" onclick="sortQueueTable(\'id\')">队列ID <span class="qm-sort-icon" data-field="id">↕</span></th>' : ''}
                ${_qmColVisible('project') ? '<th style="width:60px">项目</th>' : ''}
                ${_qmColVisible('owner') ? '<th style="width:76px">Owner</th>' : ''}
                ${_qmColVisible('requirement') ? '<th style="width:56px">要求</th>' : ''}
                ${_qmColVisible('dailyVolume') ? '<th style="width:88px" class="qm-sortable" onclick="sortQueueTable(\'dailyVolume\')">日均进审量级 <span class="qm-sort-icon" data-field="dailyVolume">↕</span></th>' : ''}
                ${_qmColVisible('backlog') ? '<th style="width:76px" class="qm-sortable" onclick="sortQueueTable(\'backlog\')">积压量 <span class="qm-sort-icon" data-field="backlog">↕</span></th>' : ''}
                ${_qmColVisible('effTarget') ? '<th style="width:72px">人效要求</th>' : ''}
                ${_qmColVisible('effActual') ? '<th style="width:80px" class="qm-sortable" onclick="sortQueueTable(\'effActual\')">实际达成 <span class="qm-sort-icon" data-field="effActual">↕</span></th>' : ''}
                ${_qmColVisible('realTarget') ? '<th style="width:56px">时效</th>' : ''}
                ${_qmColVisible('effCoef') ? '<th style="width:64px">队列系数</th>' : ''}
                ${_qmColVisible('auditTags') ? '<th style="width:120px">标签</th>' : ''}
                ${_qmColVisible('inReviewTime') ? '<th style="width:96px">进审时间</th>' : ''}
                ${_qmColVisible('enableWarning') ? '<th style="width:64px">是否预警</th>' : ''}
                ${_qmColVisible('warningTime') ? '<th style="width:76px">预警时间</th>' : ''}
                ${_qmColVisible('remark') ? '<th style="width:120px">备注</th>' : ''}
                ${_qmColVisible('status') ? '<th style="width:56px">状态</th>' : ''}
                ${_qmColVisible('actions') ? '<th style="width:48px" class="qm-col-actions-th">操作</th>' : ''}
              </tr>
            </thead>
            <tbody id="queueManageBody">
              ${renderQueueManageRows(_getFilteredQueues())}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- 表格底部信息 -->
    <div class="qm-table-footer">
      <span style="font-size:12px;color:var(--text-tertiary)">共 <strong id="qmTotalCount">${queues.length}</strong> 个队列</span>
      <span style="flex:1"></span>
      <button class="qm-shortcut-hint" onclick="_qmShowShortcuts()" title="快捷键">⌨ 快捷键</button>
    </div>

    <!-- 详情抽屉 -->
    <div class="qm-drawer-overlay" id="qmDrawerOverlay" onclick="closeQueueDrawer()"></div>
    <div class="qm-drawer" id="qmDrawer"></div>

    <!-- 右键菜单 -->
    <div class="qm-context-menu" id="qmContextMenu" style="display:none"></div>
  `;

  // 更新筛选标签
  _qmRefreshFilterTags();

  // 绑定键盘事件
  _qmBindKeyboard();

  // 绑定右键事件
  _qmBindContextMenu();
}

// ---- 列可见性 ----
function _qmColVisible(col) {
  return _qmVisibleCols.includes(col);
}

// ---- 聚合历史数据（取所有队列某字段的平均值） ----
function _getAggregateHistory(field, days) {
  const allHistories = QUEUES_DATA.map(q => _getQueueHistory(q.id)).filter(h => h.length > 0);
  if (allHistories.length === 0) return [];
  // 取最近N天的日期
  const dates = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates.map(date => {
    const values = allHistories.map(h => { const e = h.find(x => x.date === date); return e ? e[field] : null; }).filter(v => v !== null);
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
  }).filter(v => v !== null);
}

// ---- 表格行渲染 ----
function renderQueueManageRows(queues) {
  if (queues.length === 0) {
    const colCount = (_qmDragMode ? 1 : 0) + 1 + _qmVisibleCols.length;
    return `<tr><td colspan="${colCount}" class="qm-empty-row">
      <div class="qm-empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-quaternary)" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <div style="margin-top:12px;font-size:13px;color:var(--text-tertiary)">暂无匹配的队列数据</div>
        <button class="btn btn-default btn-sm" onclick="_qmClearAllFilters()" style="margin-top:8px">清除所有筛选</button>
      </div>
    </td></tr>`;
  }
  const keyword = (document.getElementById('qmSearchInput')?.value || '').trim().toLowerCase();
  const maxBacklog = Math.max(...queues.map(q => q.backlog || 0), 1);
  return queues.map((q, idx) => {
    const status = q.status || 'active';
    const isActive = status === 'active';
    const teamColor = getTeamColor(q.team);
    const checked = _qmSelectedIds.has(q.id) ? 'checked' : '';
    const rowClass = [
      isActive ? '' : 'qm-row-paused',
      _qmNewQueueId === q.id ? 'qm-row-new' : '',
      _qmDrawerQueueId === q.id ? 'qm-row-active-drawer' : '',
      _qmFocusRowIndex === idx ? 'qm-row-focused' : ''
    ].filter(Boolean).join(' ');
    // 积压预警
    const blLevel = getBacklogLevel(q.backlog);
    const blColor = blLevel === 'high' ? 'var(--danger)' : blLevel === 'mid' ? 'var(--warning)' : 'var(--success)';
    // 搜索高亮
    const highlightName = keyword ? _qmHighlight(q.name, keyword) : q.name;

    // 人效达成率颜色
    const effPct = (q.effTarget && q.effActual) ? Math.round(q.effActual / q.effTarget * 100) : 0;
    const effColor = effPct >= 100 ? 'var(--success)' : effPct >= 80 ? 'var(--warning)' : effPct > 0 ? 'var(--danger)' : 'var(--text-tertiary)';

    // 要求标签颜色
    const reqColorMap = { '时清': '#165DFF', '日清': '#00B42A', '周清': '#722ED1', '周三清空': '#F77234' };
    const reqColor = reqColorMap[q.requirement] || 'var(--text-secondary)';

    // 标签渲染
    const tagsHtml = q.auditTags ? q.auditTags.split(',').map(t => `<span class="tag tag-gray" style="font-size:10px;margin:1px 2px;white-space:nowrap">${t.trim()}</span>`).join('') : '-';

    return `
      <tr class="${rowClass}" data-queue-id="${q.id}" data-row-idx="${idx}"
          onclick="_qmRowClick(event, ${q.id}, ${idx})"
          oncontextmenu="_qmRowContextMenu(event, ${q.id})">
        ${_qmDragMode ? `<td class="qm-drag-handle" draggable="true" ondragstart="_qmDragStart(event,${q.id})" ondragover="_qmDragOver(event)" ondrop="_qmDrop(event,${q.id})" ondragend="_qmDragEnd(event)" aria-label="拖拽排序"><span class="qm-drag-icon">⠿</span></td>` : ''}
        <td><input type="checkbox" ${checked} onchange="_qmToggleSelect(${q.id}, this.checked, ${idx}, event)" onclick="event.stopPropagation()" aria-label="选择 ${q.name}"></td>
        ${_qmColVisible('team') ? `<td><span class="qm-team-tag" style="background:${_hexToRgba(teamColor, 0.10)};color:${teamColor}">${q.team}</span></td>` : ''}
        ${_qmColVisible('name') ? `<td class="qm-col-sticky">
          <div class="qm-name-cell" title="点击查看详情">
            <div class="qm-name-main">${highlightName}</div>
          </div>
        </td>` : ''}
        ${_qmColVisible('priority') ? `<td style="text-align:center"><span class="qm-priority-badge qm-priority-${(q.priority || 'P3').toLowerCase()}">${q.priority || 'P3'}</span></td>` : ''}
        ${_qmColVisible('id') ? `<td><code class="qm-id-badge">${q.id}</code></td>` : ''}
        ${_qmColVisible('project') ? `<td style="text-align:center;font-size:12px">${q.project || '-'}</td>` : ''}
        ${_qmColVisible('owner') ? `<td style="text-align:center;font-size:12px">${q.owner || '-'}</td>` : ''}
        ${_qmColVisible('requirement') ? `<td style="text-align:center"><span style="font-size:11px;font-weight:500;color:${reqColor};background:${reqColor}10;padding:1px 6px;border-radius:3px">${q.requirement || '-'}</span></td>` : ''}
        ${_qmColVisible('dailyVolume') ? `<td style="text-align:center;font-size:13px;font-weight:500">${q.dailyVolume != null ? q.dailyVolume.toLocaleString() : '-'}</td>` : ''}
        ${_qmColVisible('backlog') ? `<td>
          <div class="qm-backlog-cell">
            <span class="qm-backlog-num" style="color:${blColor}">${q.backlog ? q.backlog.toLocaleString() : '-'}</span>
            ${q.backlog > 3000 ? '<span class="qm-backlog-warn" role="img" aria-label="积压量高于3000" title="积压量高于3000">⚠</span>' : ''}
            ${q.backlog ? `<div class="qm-data-bar"><div class="qm-data-bar-fill" style="width:${Math.round((q.backlog / maxBacklog) * 100)}%;background:${blColor}"></div></div>` : ''}
          </div>
        </td>` : ''}
        ${_qmColVisible('effTarget') ? `<td style="text-align:center;font-size:13px">${q.effTarget || '-'}</td>` : ''}
        ${_qmColVisible('effActual') ? `<td>
          <div class="qm-eff-cell">
            <div class="qm-eff-nums"><span class="qm-eff-val" style="color:${effColor}">${q.effActual || '-'}</span>${effPct ? `<span class="qm-eff-pct" style="color:${effColor}">${effPct}%</span>` : ''}</div>
            ${q.effTarget > 0 ? `<div class="qm-data-bar"><div class="qm-data-bar-fill" style="width:${Math.min(effPct, 100)}%;background:${effColor}"></div></div>` : ''}
          </div>
        </td>` : ''}
        ${_qmColVisible('realTarget') ? `<td style="text-align:center;font-size:12px">${q.realTarget || '-'}</td>` : ''}
        ${_qmColVisible('effCoef') ? `<td style="text-align:center;font-size:13px;font-weight:500">${q.effCoef != null ? q.effCoef : '-'}</td>` : ''}
        ${_qmColVisible('auditTags') ? `<td style="font-size:10px;max-width:140px;overflow:hidden;text-overflow:ellipsis" title="${q.auditTags || ''}">${tagsHtml}</td>` : ''}
        ${_qmColVisible('inReviewTime') ? `<td style="text-align:center;font-size:11px;color:var(--text-secondary)">${q.inReviewTime || '-'}</td>` : ''}
        ${_qmColVisible('enableWarning') ? `<td style="text-align:center;font-size:12px">${q.enableWarning === 'yes' ? '<span style="color:var(--success);font-weight:600">是</span>' : '<span style="color:var(--text-quaternary)">否</span>'}</td>` : ''}
        ${_qmColVisible('warningTime') ? `<td style="text-align:center;font-size:11px;color:var(--text-secondary)">${q.warningTime || '-'}</td>` : ''}
        ${_qmColVisible('remark') ? `<td style="font-size:11px;color:var(--text-tertiary);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(q.remark || '').replace(/"/g, '&quot;')}">${q.remark || '-'}</td>` : ''}
        ${_qmColVisible('status') ? `<td>
          <label class="qm-toggle-wrap" onclick="event.stopPropagation()">
            <input type="checkbox" class="qm-toggle-input" ${isActive ? 'checked' : ''} onchange="toggleQueueStatus(${q.id})" aria-label="切换 ${q.name} 状态">
            <span class="qm-toggle-track"><span class="qm-toggle-thumb"></span></span>
            <span class="qm-toggle-label">${isActive ? '启用' : '暂停'}</span>
          </label>
        </td>` : ''}
        ${_qmColVisible('actions') ? `<td class="qm-col-actions">
          <div class="qm-action-group">
            <button class="qm-action-btn" onclick="event.stopPropagation();showEditQueueModal(${q.id})" title="编辑" aria-label="编辑 ${q.name}">✏️</button>
            <button class="qm-action-btn" onclick="event.stopPropagation();duplicateQueue(${q.id})" title="复制">📋</button>
            <button class="qm-action-btn qm-action-danger" onclick="event.stopPropagation();confirmDeleteQueue(${q.id})" title="删除">🗑️</button>
          </div>
        </td>` : ''}
      </tr>
    `;
  }).join('');
}

// ---- 搜索高亮 ----
function _qmHighlight(text, keyword) {
  if (!keyword || !text) return text;
  const idx = text.toLowerCase().indexOf(keyword);
  if (idx === -1) return text;
  return text.slice(0, idx) + '<mark class="qm-highlight">' + text.slice(idx, idx + keyword.length) + '</mark>' + text.slice(idx + keyword.length);
}

// 人效/时效进度条（增加目标线）
function _renderEffBar(target, actual, color) {
  if (!target && !actual) return '<span style="color:var(--text-quaternary);font-size:12px">—</span>';
  const t = target || 0, a = actual || 0;
  const pct = t > 0 ? Math.min(Math.round((a / t) * 100), 150) : 0;
  const barPct = Math.min(pct, 100);
  const barColor = pct >= 100 ? 'var(--success)' : pct >= 80 ? 'var(--warning)' : 'var(--danger)';
  return `
    <div class="qm-eff-cell">
      <div class="qm-eff-nums"><span class="qm-eff-actual">${a}</span><span class="qm-eff-sep">/</span><span class="qm-eff-target">${t}</span></div>
      <div class="qm-eff-bar">
        <div class="qm-eff-bar-fill" style="width:${barPct}%;background:${barColor}"></div>
        <div class="qm-eff-bar-target" title="目标100%"></div>
      </div>
      <span class="qm-eff-pct" style="color:${barColor}">${pct}%</span>
    </div>
  `;
}

// ---- 搜索防抖 ----
function _qmSearchDebounce() {
  clearTimeout(_qmSearchTimer);
  const val = document.getElementById('qmSearchInput')?.value || '';
  document.getElementById('qmSearchClear').style.display = val ? 'flex' : 'none';
  _qmSearchTimer = setTimeout(() => filterQueueManageList(), 300);
}

function _qmClearSearch() {
  const input = document.getElementById('qmSearchInput');
  if (input) { input.value = ''; input.focus(); }
  document.getElementById('qmSearchClear').style.display = 'none';
  filterQueueManageList();
}

// ---- 筛选 ----
function _qmApplyFilter() {
  filterQueueManageList();
  _qmRefreshFilterTags();
}

function filterQueueManageList() {
  const filtered = _getFilteredQueues();
  const body = document.getElementById('queueManageBody');
  if (body) body.innerHTML = renderQueueManageRows(filtered);
  const countEl = document.getElementById('qmTotalCount');
  if (countEl) countEl.textContent = filtered.length;
  _qmRefreshFilterTags();
}

// ---- 筛选标签渲染 ----
const _qmFilterIds = ['qmTeamFilter', 'qmProjectFilter', 'qmRequirementFilter', 'qmOwnerFilter', 'qmStatusFilter', 'qmBacklogFilter', 'qmWarningFilter'];
function _qmRefreshFilterTags() {
  const container = document.getElementById('qmFilterTags');
  if (!container) return;
  const tags = [];
  const team = document.getElementById('qmTeamFilter')?.value;
  const project = document.getElementById('qmProjectFilter')?.value;
  const requirement = document.getElementById('qmRequirementFilter')?.value;
  const owner = document.getElementById('qmOwnerFilter')?.value;
  const status = document.getElementById('qmStatusFilter')?.value;
  const backlog = document.getElementById('qmBacklogFilter')?.value;
  const warning = document.getElementById('qmWarningFilter')?.value;
  const keyword = document.getElementById('qmSearchInput')?.value?.trim();

  if (team && team !== 'all') tags.push({ type: 'team', label: `团队: ${team}` });
  if (project && project !== 'all') tags.push({ type: 'project', label: `项目: ${project}` });
  if (requirement && requirement !== 'all') tags.push({ type: 'requirement', label: `要求: ${requirement}` });
  if (owner && owner !== 'all') tags.push({ type: 'owner', label: `Owner: ${owner}` });
  if (status && status !== 'all') tags.push({ type: 'status', label: `状态: ${status === 'active' ? '启用中' : '已暂停'}` });
  if (backlog && backlog !== 'all') {
    const labels = { high: '高积压', mid: '中积压', low: '低积压' };
    tags.push({ type: 'backlog', label: `积压: ${labels[backlog]}` });
  }
  if (warning && warning !== 'all') tags.push({ type: 'warning', label: `预警: ${warning === 'yes' ? '已开启' : '未开启'}` });
  if (keyword) tags.push({ type: 'search', label: `搜索: ${keyword}` });

  if (tags.length === 0) { container.innerHTML = ''; container.style.display = 'none'; return; }
  container.style.display = 'flex';
  container.innerHTML = tags.map(t => `<span class="qm-filter-tag">${t.label}<button class="qm-filter-tag-close" onclick="_qmRemoveFilterTag('${t.type}')">✕</button></span>`).join('') +
    `<button class="qm-filter-clear-all" onclick="_qmClearAllFilters()">清除全部</button>`;
}

const _qmFilterTypeToId = { team: 'qmTeamFilter', project: 'qmProjectFilter', requirement: 'qmRequirementFilter', owner: 'qmOwnerFilter', status: 'qmStatusFilter', backlog: 'qmBacklogFilter', warning: 'qmWarningFilter' };
function _qmRemoveFilterTag(type) {
  if (type === 'search') { _qmClearSearch(); return; }
  const elId = _qmFilterTypeToId[type];
  if (elId) { const el = document.getElementById(elId); if (el) el.value = 'all'; }
  _qmApplyFilter();
}

function _qmClearAllFilters() {
  _qmFilterIds.forEach(id => {
    const el = document.getElementById(id); if (el) el.value = 'all';
  });
  const searchInput = document.getElementById('qmSearchInput');
  if (searchInput) searchInput.value = '';
  const clearBtn = document.getElementById('qmSearchClear');
  if (clearBtn) clearBtn.style.display = 'none';
  _qmApplyFilter();
}

// ---- 筛选预设 ----
function _qmSaveFilterPreset() {
  const team = document.getElementById('qmTeamFilter')?.value || 'all';
  const status = document.getElementById('qmStatusFilter')?.value || 'all';
  const backlog = document.getElementById('qmBacklogFilter')?.value || 'all';
  if (team === 'all' && status === 'all' && backlog === 'all') {
    showToast('当前没有筛选条件，无需保存', 'info'); return;
  }
  const name = prompt('为筛选预设命名：');
  if (!name) return;
  _qmFilterPresets.push({ name, team, status, backlog });
  localStorage.setItem('qm_filter_presets', JSON.stringify(_qmFilterPresets));
  showToast(`筛选预设"${name}"已保存`, 'success');
  renderQueueManagePage(document.getElementById('contentArea'));
}

function _qmApplyPreset(idx) {
  const p = _qmFilterPresets[idx];
  if (!p) return;
  ['qmTeamFilter', 'qmStatusFilter', 'qmBacklogFilter'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = p[id.replace('qm', '').replace('Filter', '').toLowerCase()] || 'all';
  });
  document.getElementById('qmTeamFilter').value = p.team || 'all';
  document.getElementById('qmStatusFilter').value = p.status || 'all';
  document.getElementById('qmBacklogFilter').value = p.backlog || 'all';
  _qmApplyFilter();
}

// ---- KPI 钻取 ----
function _qmKpiDrill(type) {
  if (type === 'total') { _qmClearAllFilters(); }
  else if (type === 'backlog') { document.getElementById('qmBacklogFilter').value = 'high'; _qmApplyFilter(); }
  else if (type === 'eff') { /* 暂不筛选，可未来扩展 */ }
  else if (type === 'warning') {
    const el = document.getElementById('qmWarningFilter');
    if (el) { el.value = 'yes'; _qmApplyFilter(); }
  }
  else if (type === 'timely') {
    const el = document.getElementById('qmRequirementFilter');
    if (el) { el.value = '时清'; _qmApplyFilter(); }
  }
}

// ---- 排序 ----
function sortQueueTable(field) {
  if (_qmDragMode) { showToast('手动排序模式下不支持字段排序', 'info'); return; }
  if (_qmSortField === field) {
    _qmSortAsc = !_qmSortAsc;
  } else {
    _qmSortField = field;
    _qmSortAsc = true;
  }
  document.querySelectorAll('.qm-sort-icon').forEach(el => {
    if (el.dataset.field === field) {
      el.textContent = _qmSortAsc ? '↑' : '↓';
      el.classList.add('qm-sort-active');
    } else {
      el.textContent = '↕';
      el.classList.remove('qm-sort-active');
    }
  });
  filterQueueManageList();
}

// ---- 行点击 ----
function _qmRowClick(event, queueId, idx) {
  // 不响应checkbox/button/input上的点击
  if (event.target.closest('input, button, label, .qm-action-group, .qm-drag-handle')) return;
  _qmFocusRowIndex = idx;
  openQueueDrawer(queueId);
}

// ---- 全选 / 批量选择 ----
function toggleQueueSelectAll(checked) {
  _qmSelectedIds.clear();
  if (checked) {
    document.querySelectorAll('#queueManageBody tr[data-queue-id]').forEach(tr => {
      const cb = tr.querySelector('input[type="checkbox"]');
      if (cb) cb.checked = true;
      if (tr.dataset.queueId) _qmSelectedIds.add(Number(tr.dataset.queueId));
    });
  } else {
    document.querySelectorAll('#queueManageBody input[type="checkbox"]').forEach(cb => cb.checked = false);
  }
  _updateBatchBar();
}

function _qmToggleSelect(id, checked, idx, event) {
  // Shift多选
  if (event && event.shiftKey && _qmLastShiftIdx !== null) {
    const start = Math.min(_qmLastShiftIdx, idx);
    const end = Math.max(_qmLastShiftIdx, idx);
    const rows = document.querySelectorAll('#queueManageBody tr[data-queue-id]');
    rows.forEach((tr, i) => {
      if (i >= start && i <= end) {
        const cb = tr.querySelector('input[type="checkbox"]');
        if (cb) cb.checked = true;
        _qmSelectedIds.add(Number(tr.dataset.queueId));
      }
    });
  } else {
    if (checked) _qmSelectedIds.add(id); else _qmSelectedIds.delete(id);
  }
  _qmLastShiftIdx = idx;
  _updateBatchBar();
}

function _updateBatchBar() {
  const bar = document.getElementById('qmBatchBar');
  const countEl = document.getElementById('qmSelectedCount');
  if (_qmSelectedIds.size > 0) {
    if (bar) { bar.style.display = 'flex'; bar.classList.add('qm-batch-bar-show'); }
    if (countEl) countEl.textContent = `已选 ${_qmSelectedIds.size}`;
  } else {
    if (bar) { bar.style.display = 'none'; bar.classList.remove('qm-batch-bar-show'); }
  }
}

// ---- 批量删除（Undo模式） ----
function batchDeleteQueues() {
  if (_qmSelectedIds.size === 0) return;
  const names = [..._qmSelectedIds].map(id => { const q = QUEUES_DATA.find(x => x.id === id); return q ? q.name : id; }).join('、');

  if (_qmSelectedIds.size > 5) {
    // 高风险：确认弹窗 + 二次确认
    const content = `
      <div style="font-size:14px;color:var(--text-primary);margin-bottom:12px">确认批量删除以下 <strong style="color:var(--danger)">${_qmSelectedIds.size}</strong> 个队列？</div>
      <div style="background:var(--bg);border-radius:8px;padding:12px;font-size:12px;color:var(--text-secondary);line-height:1.8;max-height:120px;overflow:auto">${names}</div>
      <div class="alert-banner alert-warning" style="margin-top:10px">⚠️ 此操作将删除 ${_qmSelectedIds.size} 个队列，请输入 <strong>确认删除</strong> 后操作</div>
      <input type="text" class="form-control" id="qmDeleteConfirmInput" placeholder="请输入"确认删除"" style="margin-top:8px">
    `;
    openModal('批量删除队列', content, `
      <button class="btn btn-default" onclick="closeModal()">取消</button>
      <button class="btn btn-danger" id="qmBatchDeleteBtn" onclick="executeBatchDelete()" disabled>确认删除 ${_qmSelectedIds.size} 个</button>
    `);
    // 二次确认
    setTimeout(() => {
      const input = document.getElementById('qmDeleteConfirmInput');
      const btn = document.getElementById('qmBatchDeleteBtn');
      if (input && btn) {
        input.addEventListener('input', () => { btn.disabled = input.value !== '确认删除'; });
      }
    }, 100);
  } else {
    // ≤5个：直接执行 + Undo
    _executeBatchDeleteWithUndo();
  }
}

function _executeBatchDeleteWithUndo() {
  const ids = [..._qmSelectedIds];
  const removed = [];
  ids.forEach(id => {
    const idx = QUEUES_DATA.findIndex(q => q.id === id);
    if (idx !== -1) removed.push(...QUEUES_DATA.splice(idx, 1));
  });
  _qmPushUndo('delete', removed, `批量删除 ${removed.length} 个队列`);
  saveQueuesData();
  addWorkLog('队列管理', '批量删除', `批量删除 ${removed.length} 个队列：${removed.map(r => r.name).join('、')}`);
  _qmSelectedIds.clear();
  _qmShowUndoToast(`已删除 ${removed.length} 个队列`);
  renderQueueManagePage(document.getElementById('contentArea'));
}

function executeBatchDelete() {
  const input = document.getElementById('qmDeleteConfirmInput');
  if (input && input.value !== '确认删除') { showToast('请输入"确认删除"', 'warning'); return; }
  const ids = [..._qmSelectedIds];
  const removed = [];
  ids.forEach(id => {
    const idx = QUEUES_DATA.findIndex(q => q.id === id);
    if (idx !== -1) removed.push(...QUEUES_DATA.splice(idx, 1));
  });
  _qmPushUndo('delete', removed, `批量删除 ${removed.length} 个队列`);
  saveQueuesData();
  addWorkLog('队列管理', '批量删除', `批量删除 ${removed.length} 个队列：${removed.map(r => r.name).join('、')}`);
  _qmSelectedIds.clear();
  closeModal();
  _qmShowUndoToast(`已删除 ${removed.length} 个队列`);
  renderQueueManagePage(document.getElementById('contentArea'));
}

// ---- 批量改团队（Undo + 直选） ----
function batchChangeTeam() {
  if (_qmSelectedIds.size === 0) return;
  const teamOptions = getTeamNames().map(t => `<option value="${t}">${t}</option>`).join('');
  const content = `
    <div style="font-size:14px;margin-bottom:12px">将 <strong>${_qmSelectedIds.size}</strong> 个队列的审核团队统一修改为：</div>
    <select class="form-control" id="qmBatchTeam">${teamOptions}</select>
  `;
  openModal('批量修改团队', content, `
    <button class="btn btn-default" onclick="closeModal()">取消</button>
    <button class="btn btn-primary" onclick="executeBatchChangeTeam()">确认修改</button>
  `);
}

function executeBatchChangeTeam() {
  const newTeam = document.getElementById('qmBatchTeam')?.value;
  if (!newTeam) return;
  const undoData = [];
  _qmSelectedIds.forEach(id => {
    const q = QUEUES_DATA.find(x => x.id === id);
    if (q) { undoData.push({ id, oldTeam: q.team }); q.team = newTeam; }
  });
  _qmPushUndo('changeTeam', undoData, `${undoData.length} 个队列改为 ${newTeam}`);
  saveQueuesData();
  addWorkLog('队列管理', '批量改团队', `${undoData.length} 个队列团队改为 ${newTeam}`);
  _qmSelectedIds.clear();
  closeModal();
  _qmShowUndoToast(`${undoData.length} 个队列已改为 ${newTeam}`);
  renderQueueManagePage(document.getElementById('contentArea'));
}

// ---- 批量切换状态（Undo） ----
function batchToggleStatus() {
  if (_qmSelectedIds.size === 0) return;
  const content = `
    <div style="font-size:14px;margin-bottom:12px">将 <strong>${_qmSelectedIds.size}</strong> 个队列的状态切换为：</div>
    <select class="form-control" id="qmBatchStatus">
      <option value="active">启用</option>
      <option value="paused">暂停</option>
    </select>
  `;
  openModal('批量切换状态', content, `
    <button class="btn btn-default" onclick="closeModal()">取消</button>
    <button class="btn btn-primary" onclick="executeBatchToggleStatus()">确认</button>
  `);
}

function executeBatchToggleStatus() {
  const newStatus = document.getElementById('qmBatchStatus')?.value;
  if (!newStatus) return;
  const undoData = [];
  _qmSelectedIds.forEach(id => {
    const q = QUEUES_DATA.find(x => x.id === id);
    if (q) { undoData.push({ id, oldStatus: q.status || 'active' }); q.status = newStatus; }
  });
  _qmPushUndo('toggleStatus', undoData, `${undoData.length} 个队列${newStatus === 'active' ? '启用' : '暂停'}`);
  saveQueuesData();
  addWorkLog('队列管理', '批量切换状态', `${undoData.length} 个队列状态改为 ${newStatus === 'active' ? '启用' : '暂停'}`);
  _qmSelectedIds.clear();
  closeModal();
  _qmShowUndoToast(`${undoData.length} 个队列已${newStatus === 'active' ? '启用' : '暂停'}`);
  renderQueueManagePage(document.getElementById('contentArea'));
}

// ---- 批量改Owner ----
function batchChangeOwner() {
  if (_qmSelectedIds.size === 0) return;
  const ownerSet = [...new Set(QUEUES_DATA.map(q => q.owner).filter(Boolean))].sort();
  const opts = ownerSet.map(o => `<option value="${o}">${o}</option>`).join('');
  const content = `
<div style="font-size:14px;margin-bottom:12px">将 <strong>${_qmSelectedIds.size}</strong> 个队列的 Owner 修改为：</div>
<select class="form-control" id="qmBatchOwner"><option value="">-- 请选择 --</option>${opts}</select>
<div style="margin-top:8px;font-size:12px;color:var(--text-tertiary)">也可手动输入新的 Owner：</div>
<input class="form-control" id="qmBatchOwnerInput" placeholder="输入新Owner（优先于下拉选择）" style="margin-top:4px">
`;
  openModal('批量修改 Owner', content, `
<button class="btn btn-default" onclick="closeModal()">取消</button>
<button class="btn btn-primary" onclick="executeBatchChangeOwner()">确认修改</button>
`);
}
function executeBatchChangeOwner() {
  const input = document.getElementById('qmBatchOwnerInput')?.value?.trim();
  const select = document.getElementById('qmBatchOwner')?.value;
  const newOwner = input || select;
  if (!newOwner) { alert('请选择或输入 Owner'); return; }
  const undoData = [];
  _qmSelectedIds.forEach(id => {
    const q = QUEUES_DATA.find(x => x.id === id);
    if (q) { undoData.push({ id, oldVal: q.owner }); q.owner = newOwner; }
  });
  _qmPushUndo('changeOwner', undoData, `${undoData.length} 个队列Owner改为 ${newOwner}`);
  saveQueuesData();
  addWorkLog('队列管理', '批量改Owner', `${undoData.length} 个队列Owner改为 ${newOwner}`);
  _qmSelectedIds.clear();
  closeModal();
  _qmShowUndoToast(`${undoData.length} 个队列Owner已改为 ${newOwner}`);
  renderQueueManagePage(document.getElementById('contentArea'));
}

// ---- 批量改要求 ----
function batchChangeRequirement() {
  if (_qmSelectedIds.size === 0) return;
  const reqOptions = ['时清', '日清', '周三清空', '周清'].map(r => `<option value="${r}">${r}</option>`).join('');
  const content = `
<div style="font-size:14px;margin-bottom:12px">将 <strong>${_qmSelectedIds.size}</strong> 个队列的要求修改为：</div>
<select class="form-control" id="qmBatchRequirement"><option value="">-- 清除要求 --</option>${reqOptions}</select>
`;
  openModal('批量修改要求', content, `
<button class="btn btn-default" onclick="closeModal()">取消</button>
<button class="btn btn-primary" onclick="executeBatchChangeRequirement()">确认修改</button>
`);
}
function executeBatchChangeRequirement() {
  const newReq = document.getElementById('qmBatchRequirement')?.value || '';
  const undoData = [];
  _qmSelectedIds.forEach(id => {
    const q = QUEUES_DATA.find(x => x.id === id);
    if (q) { undoData.push({ id, oldVal: q.requirement }); q.requirement = newReq; }
  });
  _qmPushUndo('changeReq', undoData, `${undoData.length} 个队列要求改为 ${newReq || '(清除)'}`);
  saveQueuesData();
  addWorkLog('队列管理', '批量改要求', `${undoData.length} 个队列要求改为 ${newReq || '(清除)'}`);
  _qmSelectedIds.clear();
  closeModal();
  _qmShowUndoToast(`${undoData.length} 个队列要求已改为 ${newReq || '(已清除)'}`);
  renderQueueManagePage(document.getElementById('contentArea'));
}

// ---- 批量改预警 ----
function batchChangeWarning() {
  if (_qmSelectedIds.size === 0) return;
  const content = `
<div style="font-size:14px;margin-bottom:12px">将 <strong>${_qmSelectedIds.size}</strong> 个队列的预警状态修改为：</div>
<select class="form-control" id="qmBatchWarning">
<option value="yes">开启预警</option>
<option value="no">关闭预警</option>
</select>
`;
  openModal('批量修改预警', content, `
<button class="btn btn-default" onclick="closeModal()">取消</button>
<button class="btn btn-primary" onclick="executeBatchChangeWarning()">确认修改</button>
`);
}
function executeBatchChangeWarning() {
  const newVal = document.getElementById('qmBatchWarning')?.value || 'no';
  const undoData = [];
  _qmSelectedIds.forEach(id => {
    const q = QUEUES_DATA.find(x => x.id === id);
    if (q) { undoData.push({ id, oldVal: q.enableWarning }); q.enableWarning = newVal; }
  });
  _qmPushUndo('changeWarning', undoData, `${undoData.length} 个队列预警${newVal === 'yes' ? '开启' : '关闭'}`);
  saveQueuesData();
  addWorkLog('队列管理', '批量改预警', `${undoData.length} 个队列预警改为 ${newVal === 'yes' ? '开启' : '关闭'}`);
  _qmSelectedIds.clear();
  closeModal();
  _qmShowUndoToast(`${undoData.length} 个队列预警已${newVal === 'yes' ? '开启' : '关闭'}`);
  renderQueueManagePage(document.getElementById('contentArea'));
}

// ---- 单个状态切换（Toggle Switch + Undo） ----
function toggleQueueStatus(queueId) {
  const q = QUEUES_DATA.find(x => x.id === queueId);
  if (!q) return;
  const oldStatus = q.status || 'active';
  q.status = oldStatus === 'active' ? 'paused' : 'active';
  _qmPushUndo('singleStatus', { id: queueId, oldStatus }, `${q.name} ${q.status === 'active' ? '启用' : '暂停'}`);
  saveQueuesData();
  addWorkLog('队列管理', '状态切换', `${q.name}（ID:${q.id}）→ ${q.status === 'active' ? '启用' : '暂停'}`);
  _qmShowUndoToast(`${q.name} 已${q.status === 'active' ? '启用' : '暂停'}`);
  filterQueueManageList();
}

// ---- 复制队列 ----
function duplicateQueue(queueId) {
  const src = QUEUES_DATA.find(q => q.id === queueId);
  if (!src) return;
  const maxId = Math.max(...QUEUES_DATA.map(q => q.id), 0) + 1;
  const dup = { ...src, id: maxId, name: src.name + '（副本）', status: 'paused' };
  QUEUES_DATA.push(dup);
  saveQueuesData();
  _qmNewQueueId = dup.id;
  addWorkLog('队列管理', '复制队列', `复制 ${src.name} → ${dup.name}（ID:${dup.id}）`);
  showToast(`已复制队列 → ${dup.name}`, 'success');
  renderQueueManagePage(document.getElementById('contentArea'));
  // 2s后清除高亮
  setTimeout(() => { _qmNewQueueId = null; document.querySelector('.qm-row-new')?.classList.remove('qm-row-new'); }, 2000);
}

// ---- 行内快速编辑 ----
function _qmStartInlineEdit(queueId, field, cell) {
  const q = QUEUES_DATA.find(x => x.id === queueId);
  if (!q) return;
  const oldValue = q[field] || 0;
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'qm-inline-input';
  input.value = oldValue;
  input.step = '1';
  cell.innerHTML = '';
  cell.appendChild(input);
  input.focus();
  input.select();

  const save = () => {
    const newVal = parseFloat(input.value) || 0;
    if (newVal !== oldValue) {
      _qmPushUndo('inlineEdit', { id: queueId, field, oldValue }, `修改 ${q.name} ${field}`);
      q[field] = newVal;
      saveQueuesData();
      _saveQueueSnapshot(q);
      addWorkLog('队列管理', '行内编辑', `${q.name} ${field}: ${oldValue} → ${newVal}`);
      _qmShowUndoToast(`${q.name} ${field}: ${oldValue} → ${newVal}`);
    }
    filterQueueManageList();
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') { filterQueueManageList(); }
  });
  input.addEventListener('blur', save);
}

// ---- 拖拽排序 ----
function _qmToggleDragMode() {
  _qmDragMode = !_qmDragMode;
  if (_qmDragMode) {
    _qmSortField = null; _qmSortAsc = true;
    if (!_qmCustomOrder) {
      _qmCustomOrder = QUEUES_DATA.map(q => q.id);
    }
    showToast('已进入手动排序模式，拖拽行左侧⠿图标调整顺序', 'info');
  } else {
    showToast('已退出手动排序模式', 'info');
  }
  renderQueueManagePage(document.getElementById('contentArea'));
}

function _qmDragStart(e, id) {
  _qmDragSrcId = id;
  e.dataTransfer.effectAllowed = 'move';
  e.target.closest('tr')?.classList.add('qm-row-dragging');
}

function _qmDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const tr = e.target.closest('tr');
  if (tr) {
    document.querySelectorAll('.qm-drop-above,.qm-drop-below').forEach(el => el.classList.remove('qm-drop-above', 'qm-drop-below'));
    const rect = tr.getBoundingClientRect();
    if (e.clientY < rect.top + rect.height / 2) tr.classList.add('qm-drop-above');
    else tr.classList.add('qm-drop-below');
  }
}

function _qmDrop(e, targetId) {
  e.preventDefault();
  document.querySelectorAll('.qm-row-dragging,.qm-drop-above,.qm-drop-below').forEach(el => el.classList.remove('qm-row-dragging', 'qm-drop-above', 'qm-drop-below'));
  if (_qmDragSrcId === null || _qmDragSrcId === targetId) return;
  const order = _qmCustomOrder || QUEUES_DATA.map(q => q.id);
  const srcIdx = order.indexOf(_qmDragSrcId);
  const tgtIdx = order.indexOf(targetId);
  if (srcIdx === -1 || tgtIdx === -1) return;
  order.splice(srcIdx, 1);
  order.splice(tgtIdx, 0, _qmDragSrcId);
  _qmCustomOrder = order;
  localStorage.setItem('qm_custom_order', JSON.stringify(order));
  _qmDragSrcId = null;
  filterQueueManageList();
}

function _qmDragEnd(e) {
  _qmDragSrcId = null;
  document.querySelectorAll('.qm-row-dragging,.qm-drop-above,.qm-drop-below').forEach(el => el.classList.remove('qm-row-dragging', 'qm-drop-above', 'qm-drop-below'));
}

// ---- 右键菜单 ----
function _qmBindContextMenu() {
  document.addEventListener('click', _qmHideContextMenu);
}

function _qmRowContextMenu(event, queueId) {
  event.preventDefault();
  event.stopPropagation();
  const q = QUEUES_DATA.find(x => x.id === queueId);
  if (!q) return;
  const menu = document.getElementById('qmContextMenu');
  if (!menu) return;
  const isActive = (q.status || 'active') === 'active';
  const teamOptions = getTeamNames().map(t => `<div class="qm-ctx-sub-item" onclick="_qmCtxMoveTeam(${queueId},'${t}')">${t}</div>`).join('');

  menu.innerHTML = `
    <div class="qm-ctx-item" onclick="openQueueDrawer(${queueId})"><span>👁️</span> 查看详情</div>
    <div class="qm-ctx-item" onclick="showEditQueueModal(${queueId})"><span>✏️</span> 编辑队列</div>
    <div class="qm-ctx-item" onclick="duplicateQueue(${queueId})"><span>📋</span> 复制队列</div>
    <div class="qm-ctx-item" onclick="toggleQueueStatus(${queueId})"><span>${isActive ? '⏸️' : '▶️'}</span> ${isActive ? '暂停队列' : '启用队列'}</div>
    <div class="qm-ctx-divider"></div>
    <div class="qm-ctx-item qm-ctx-has-sub"><span>👥</span> 移动到团队 ▸
      <div class="qm-ctx-submenu">${teamOptions}</div>
    </div>
    <div class="qm-ctx-divider"></div>
    <div class="qm-ctx-item qm-ctx-danger" onclick="confirmDeleteQueue(${queueId})"><span>🗑️</span> 删除队列</div>
  `;
  menu.style.display = 'block';
  // 定位
  const x = Math.min(event.pageX, window.innerWidth - 220);
  const y = Math.min(event.pageY, window.innerHeight - 300);
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
}

function _qmHideContextMenu() {
  const menu = document.getElementById('qmContextMenu');
  if (menu) menu.style.display = 'none';
}

function _qmCtxMoveTeam(queueId, team) {
  const q = QUEUES_DATA.find(x => x.id === queueId);
  if (!q) return;
  const oldTeam = q.team;
  q.team = team;
  _qmPushUndo('changeTeam', [{ id: queueId, oldTeam }], `${q.name} 移至 ${team}`);
  saveQueuesData();
  addWorkLog('队列管理', '移动团队', `${q.name} ${oldTeam} → ${team}`);
  _qmHideContextMenu();
  _qmShowUndoToast(`${q.name} 已移至 ${team}`);
  filterQueueManageList();
}

// ---- 键盘快捷键 ----
function _qmBindKeyboard() {
  // 移除旧的监听器
  document.removeEventListener('keydown', _qmKeyHandler);
  document.addEventListener('keydown', _qmKeyHandler);
}

function _qmKeyHandler(e) {
  // 在input/textarea中不响应
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    if (e.key === 'Escape') { e.target.blur(); _qmHideContextMenu(); }
    return;
  }
  // 弹窗打开时只响应Esc
  if (document.getElementById('modalOverlay')?.classList.contains('show')) {
    if (e.key === 'Escape') closeModal();
    return;
  }
  // 抽屉打开时
  const drawerOpen = document.getElementById('qmDrawer')?.classList.contains('show');
  if (drawerOpen) {
    if (e.key === 'Escape') { closeQueueDrawer(); return; }
    if (e.key === 'j' || e.key === 'ArrowRight') { _qmDrawerNav(1); return; }
    if (e.key === 'k' || e.key === 'ArrowLeft') { _qmDrawerNav(-1); return; }
    return;
  }

  // 全局快捷键
  if (e.key === '/' || (e.ctrlKey && e.key === 'k')) {
    e.preventDefault();
    document.getElementById('qmSearchInput')?.focus();
    return;
  }
  if (e.key === 'n' || e.key === 'N') { showAddQueueModal(); return; }
  if (e.key === 'Escape') { _qmHideContextMenu(); closeQueueDrawer(); return; }
  if (e.ctrlKey && e.key === 'a') {
    e.preventDefault();
    toggleQueueSelectAll(true);
    const selectAll = document.getElementById('qmSelectAll');
    if (selectAll) selectAll.checked = true;
    return;
  }
  if ((e.ctrlKey && e.shiftKey && e.key === 'E') || (e.ctrlKey && e.shiftKey && e.key === 'e')) {
    e.preventDefault();
    showExportConfigModal();
    return;
  }
  // 行导航
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const rows = document.querySelectorAll('#queueManageBody tr[data-queue-id]');
    if (rows.length === 0) return;
    if (e.key === 'ArrowDown') _qmFocusRowIndex = Math.min(_qmFocusRowIndex + 1, rows.length - 1);
    else _qmFocusRowIndex = Math.max(_qmFocusRowIndex - 1, 0);
    rows.forEach((r, i) => r.classList.toggle('qm-row-focused', i === _qmFocusRowIndex));
    rows[_qmFocusRowIndex]?.scrollIntoView({ block: 'nearest' });
    return;
  }
  if (e.key === 'Enter' && _qmFocusRowIndex >= 0) {
    const rows = document.querySelectorAll('#queueManageBody tr[data-queue-id]');
    const row = rows[_qmFocusRowIndex];
    if (row) openQueueDrawer(Number(row.dataset.queueId));
    return;
  }
  if (e.key === 'e' || e.key === 'E') {
    if (_qmFocusRowIndex >= 0) {
      const rows = document.querySelectorAll('#queueManageBody tr[data-queue-id]');
      const row = rows[_qmFocusRowIndex];
      if (row) showEditQueueModal(Number(row.dataset.queueId));
    }
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (_qmSelectedIds.size > 0) { batchDeleteQueues(); return; }
    if (_qmFocusRowIndex >= 0) {
      const rows = document.querySelectorAll('#queueManageBody tr[data-queue-id]');
      const row = rows[_qmFocusRowIndex];
      if (row) confirmDeleteQueue(Number(row.dataset.queueId));
    }
    return;
  }
}

// ---- 详情抽屉（增强版：Tab/趋势/日志/上下切换） ----
function openQueueDrawer(queueId) {
  const q = QUEUES_DATA.find(x => x.id === queueId);
  if (!q) return;

  const overlay = document.getElementById('qmDrawerOverlay');
  const drawer = document.getElementById('qmDrawer');
  if (!overlay || !drawer) return;

  _qmDrawerQueueId = queueId;
  _qmDrawerTab = 'overview';

  // 高亮对应行
  document.querySelectorAll('.qm-row-active-drawer').forEach(el => el.classList.remove('qm-row-active-drawer'));
  document.querySelector(`tr[data-queue-id="${queueId}"]`)?.classList.add('qm-row-active-drawer');

  _renderDrawerContent(q);

  overlay.classList.add('show');
  drawer.classList.add('show');
}

function _renderDrawerContent(q) {
  const drawer = document.getElementById('qmDrawer');
  if (!drawer) return;
  const teamColor = getTeamColor(q.team);
  const status = q.status || 'active';
  const isActive = status === 'active';
  const blLevel = getBacklogLevel(q.backlog);
  const healthDetail = _calcHealthDetail(q);
  const health = healthDetail.total;
  const healthColor = _getHealthColor(health);
  const prediction = _predictBacklog(q);
  const history = _getQueueHistory(q.id);

  // 上下队列导航
  const filtered = _getFilteredQueues();
  const curIdx = filtered.findIndex(x => x.id === q.id);
  const hasPrev = curIdx > 0;
  const hasNext = curIdx < filtered.length - 1;

  drawer.innerHTML = `
    <div class="qm-drawer-header">
      <div class="qm-drawer-title-row">
        <div>
          <div class="qm-drawer-title">${q.name}</div>
        </div>
        <div class="qm-drawer-header-actions">
          <button class="qm-drawer-nav-btn ${hasPrev ? '' : 'disabled'}" onclick="_qmDrawerNav(-1)" title="上一个 (K/←)">‹</button>
          <button class="qm-drawer-nav-btn ${hasNext ? '' : 'disabled'}" onclick="_qmDrawerNav(1)" title="下一个 (J/→)">›</button>
          <button class="qm-drawer-close" onclick="closeQueueDrawer()">✕</button>
        </div>
      </div>
      <div class="qm-drawer-tags">
        <span class="qm-team-tag" style="background:${_hexToRgba(teamColor, 0.12)};color:${teamColor}">${q.team}</span>
        <span class="qm-status-badge qm-status-${status}"><span class="qm-status-dot"></span>${isActive ? '启用' : '暂停'}</span>
        <code class="qm-id-badge">ID: ${q.id}</code>
        <span class="qm-health-badge" style="background:${_hexToRgba(healthColor, 0.1)};color:${healthColor}">健康度 ${health}</span>
      </div>
      <!-- Tab 导航 -->
      <div class="qm-drawer-tabs">
        <button class="qm-drawer-tab ${_qmDrawerTab === 'overview' ? 'active' : ''}" onclick="_qmSwitchDrawerTab('overview',${q.id})">概览</button>
        <button class="qm-drawer-tab ${_qmDrawerTab === 'trend' ? 'active' : ''}" onclick="_qmSwitchDrawerTab('trend',${q.id})">趋势</button>
        <button class="qm-drawer-tab ${_qmDrawerTab === 'log' ? 'active' : ''}" onclick="_qmSwitchDrawerTab('log',${q.id})">操作日志</button>
      </div>
    </div>
    <div class="qm-drawer-body" id="qmDrawerBody">
      ${_qmDrawerTab === 'overview' ? _renderDrawerOverview(q, healthDetail, healthColor, prediction) : ''}
      ${_qmDrawerTab === 'trend' ? _renderDrawerTrend(q, history) : ''}
      ${_qmDrawerTab === 'log' ? _renderDrawerLog(q) : ''}
    </div>
    <div class="qm-drawer-footer">
      <button class="btn btn-primary btn-sm" onclick="closeQueueDrawer();showEditQueueModal(${q.id})">✏️ 编辑</button>
      <button class="btn btn-default btn-sm" onclick="closeQueueDrawer();duplicateQueue(${q.id})">📋 复制</button>
      <button class="btn btn-default btn-sm" onclick="closeQueueDrawer();toggleQueueStatus(${q.id})">${isActive ? '⏸️ 暂停' : '▶️ 启用'}</button>
      <span style="flex:1"></span>
      <div class="qm-drawer-more">
        <button class="btn btn-default btn-sm" onclick="this.nextElementSibling.classList.toggle('show')">更多 ▾</button>
        <div class="qm-drawer-more-menu">
          <button onclick="closeQueueDrawer();confirmDeleteQueue(${q.id})">🗑️ 删除队列</button>
        </div>
      </div>
    </div>
  `;

  // 级联进入动画
  setTimeout(() => {
    drawer.querySelectorAll('.qm-drawer-section').forEach((el, i) => {
      el.style.opacity = '0'; el.style.transform = 'translateY(8px)';
      setTimeout(() => { el.style.transition = 'opacity 0.3s ease, transform 0.3s ease'; el.style.opacity = '1'; el.style.transform = 'translateY(0)'; }, i * 60);
    });
  }, 50);
}

function _renderDrawerOverview(q, healthDetail, healthColor, prediction) {
const health = healthDetail.total;
const effRate = q.effTarget > 0 ? Math.round(((q.effActual || 0) / q.effTarget) * 100) : 0;
const predText = prediction.type === 'clear' ? `按当前速率，预计 <strong>${prediction.days}</strong> 天清零` : prediction.type === 'grow' ? `积压增长中，日增 ${prediction.rate}，${prediction.days > 0 ? `${prediction.days}天后达5000` : '已超5000'}` : '积压量稳定';
const predColor = prediction.type === 'clear' ? 'var(--success)' : prediction.type === 'grow' ? 'var(--danger)' : 'var(--text-tertiary)';

const reqColorMap = { '时清': '#F53F3F', '日清': '#FF7D00', '周清': '#3491FA', '周三清空': '#722ED1' };
const reqColor = reqColorMap[q.requirement] || 'var(--text-tertiary)';

// 4维分项得分条HTML
const dimBarHtml = healthDetail.dims.map(d => {
  const c = _getHealthColor(d.score);
  return `<div class="qm-health-dim-row">
<div class="qm-health-dim-head"><span class="qm-health-dim-name">${d.name}</span><span class="qm-health-dim-pct" style="color:${c}">${d.score}<small>/${Math.round(d.weight*100)}%</small></span></div>
<div class="qm-health-dim-bar"><div class="qm-health-dim-fill" style="width:${d.score}%;background:${c}"></div></div>
<div class="qm-health-dim-detail">${d.detail}</div>
</div>`;
}).join('');

return `
<!-- 基础信息（带快捷编辑） -->
<div class="qm-drawer-section">
<div class="qm-drawer-section-title">📌 基础信息 <button class="qm-drawer-edit-all" onclick="closeQueueDrawer();showEditQueueModal(${q.id})" title="编辑全部字段">✏️ 编辑</button></div>
<div class="qm-drawer-data-list">
<div class="qm-drawer-data-row"><span>项目</span><span class="qm-data-val">${q.project || '—'}<button class="qm-quick-edit-btn" onclick="_qmQuickEdit(${q.id},'project')" title="修改项目">✎</button></span></div>
<div class="qm-drawer-data-row"><span>Owner</span><span class="qm-data-val">${q.owner || '—'}<button class="qm-quick-edit-btn" onclick="_qmQuickEdit(${q.id},'owner')" title="修改Owner">✎</button></span></div>
<div class="qm-drawer-data-row"><span>优先级</span><span class="qm-data-val"><span class="qm-priority-badge qm-priority-${(q.priority||'P3').toLowerCase()}">${q.priority||'P3'}</span></span></div>
<div class="qm-drawer-data-row"><span>要求</span><span class="qm-data-val">${q.requirement ? `<span style="color:${reqColor};font-weight:600">${q.requirement}</span>` : '—'}<button class="qm-quick-edit-btn" onclick="_qmQuickEdit(${q.id},'requirement')" title="修改要求">✎</button></span></div>
<div class="qm-drawer-data-row"><span>时效</span><span class="qm-data-val">${q.realTarget || '—'}<button class="qm-quick-edit-btn" onclick="_qmQuickEdit(${q.id},'realTarget')" title="修改时效">✎</button></span></div>
<div class="qm-drawer-data-row"><span>进审时间</span><span class="qm-data-val">${q.inReviewTime || '—'}</span></div>
${q.remark ? `<div class="qm-drawer-data-row"><span>备注</span><span class="qm-data-val" style="font-size:11px;color:var(--text-tertiary)">${q.remark}<button class="qm-quick-edit-btn" onclick="_qmQuickEdit(${q.id},'remark')" title="修改备注">✎</button></span></div>` : ''}
</div>
</div>
<!-- 健康度总览 + 4维分项 -->
<div class="qm-drawer-section">
<div class="qm-drawer-section-title">🏥 健康度总览</div>
<div class="qm-drawer-health-overview">
<div class="qm-health-ring-lg">
<svg width="64" height="64" viewBox="0 0 36 36">
<circle cx="18" cy="18" r="14" fill="none" stroke="rgba(0,0,0,0.04)" stroke-width="3"/>
<circle cx="18" cy="18" r="14" fill="none" stroke="${healthColor}" stroke-width="3" stroke-dasharray="${health * 0.88} 88" stroke-linecap="round" transform="rotate(-90 18 18)"/>
</svg>
<span class="qm-health-ring-num" style="color:${healthColor}">${health}</span>
</div>
<div class="qm-health-detail">
<div class="qm-health-label">${_getHealthLabel(health)}</div>
<div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">4维加权评估（积压30% · 人效30% · 时效20% · 预警20%）</div>
</div>
</div>
<div class="qm-health-dims">${dimBarHtml}</div>
</div>
<!-- 效率指标（环形进度） -->
<div class="qm-drawer-section">
<div class="qm-drawer-section-title">📊 效率指标</div>
<div class="qm-drawer-metrics">
<div class="qm-metric-card">
<div class="qm-metric-label">人效达成</div>
<div class="qm-metric-ring-wrap">
<svg width="40" height="40" viewBox="0 0 36 36">
<circle cx="18" cy="18" r="14" fill="none" stroke="rgba(0,0,0,0.04)" stroke-width="2.5"/>
<circle cx="18" cy="18" r="14" fill="none" stroke="${effRate >= 100 ? 'var(--success)' : effRate >= 80 ? 'var(--warning)' : 'var(--danger)'}" stroke-width="2.5" stroke-dasharray="${Math.min(effRate, 100) * 0.88} 88" stroke-linecap="round" transform="rotate(-90 18 18)"/>
</svg>
<span class="qm-metric-ring-num">${effRate}%</span>
</div>
<div class="qm-metric-sub">${q.effActual || 0} / ${q.effTarget || 0}</div>
</div>
<div class="qm-metric-card">
<div class="qm-metric-label">队列系数</div>
<div class="qm-metric-value">${q.effCoef != null ? q.effCoef : '—'}</div>
</div>
<div class="qm-metric-card">
<div class="qm-metric-label">日均进审量</div>
<div class="qm-metric-value">${q.dailyVolume || '—'}</div>
</div>
</div>
</div>
<!-- 审核数据 + 积压预测 -->
<div class="qm-drawer-section">
<div class="qm-drawer-section-title">📋 审核数据</div>
<div class="qm-drawer-data-list">
<div class="qm-drawer-data-row"><span>积压量</span><span class="qm-data-val" style="color:${getBacklogLevel(q.backlog) === 'high' ? 'var(--danger)' : getBacklogLevel(q.backlog) === 'mid' ? 'var(--warning)' : 'var(--text-primary)'}">${q.backlog ? q.backlog.toLocaleString() : '0'}</span></div>
<div class="qm-drawer-data-row"><span>积压预测</span><span class="qm-data-val" style="color:${predColor};font-size:11px">${predText}</span></div>
<div class="qm-drawer-data-row"><span>日进审量</span><span class="qm-data-val">${q.inReview ? q.inReview.toLocaleString() : '-'}</span></div>
<div class="qm-drawer-data-row"><span>日出审量</span><span class="qm-data-val">${q.outReview ? q.outReview.toLocaleString() : '-'}</span></div>
</div>
</div>
<!-- 其他信息 -->
<div class="qm-drawer-section">
<div class="qm-drawer-section-title">🏷️ 其他信息</div>
<div class="qm-drawer-data-list">
<div class="qm-drawer-data-row"><span>预警</span><span class="qm-data-val">${q.enableWarning === 'yes' ? `<span style="color:var(--success)">是</span> — ${q.warningTime || '未设时间'}` : '否'}</span></div>
<div class="qm-drawer-data-row"><span>审核标签</span><span class="qm-data-val">${q.auditTags ? q.auditTags.split(',').map(t => `<span class="tag tag-gray" style="font-size:10px;margin:1px 2px">${t.trim()}</span>`).join('') : '—'}</span></div>
</div>
</div>
`;
}

function _renderDrawerTrend(q, history) {
  if (history.length < 2) {
    return `<div class="qm-drawer-section"><div class="qm-empty-state" style="padding:40px 0">
      <div style="font-size:13px;color:var(--text-tertiary)">暂无趋势数据，需要至少2天的历史快照</div>
    </div></div>`;
  }
  const labels = history.map(h => h.date.slice(5));
  const backlogData = history.map(h => h.backlog || 0);
  const healthData = history.map(h => h.health || 0);

  return `
    <div class="qm-drawer-section">
      <div class="qm-drawer-section-title">📈 积压量趋势</div>
      <div class="qm-trend-chart">${_renderMiniChart(labels, backlogData, '#F53F3F', 200, 80)}</div>
    </div>
    <div class="qm-drawer-section">
      <div class="qm-drawer-section-title">💚 健康度趋势</div>
      <div class="qm-trend-chart">${_renderMiniChart(labels, healthData, '#722ED1', 200, 80)}</div>
    </div>
  `;
}

function _renderMiniChart(labels, data, color, w, h) {
  if (data.length < 2) return '';
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const padding = 10;
  const chartW = w - padding * 2;
  const chartH = h - padding * 2;
  const points = data.map((v, i) => `${padding + (i / (data.length - 1)) * chartW},${padding + chartH - ((v - min) / range) * chartH}`).join(' ');
  const areaPoints = points + ` ${padding + chartW},${padding + chartH} ${padding},${padding + chartH}`;

  let svg = `<svg width="${w}" height="${h + 20}" viewBox="0 0 ${w} ${h + 20}">`;
  svg += `<polygon points="${areaPoints}" fill="${color}" opacity="0.06"/>`;
  svg += `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
  // 数据点
  data.forEach((v, i) => {
    const x = padding + (i / (data.length - 1)) * chartW;
    const y = padding + chartH - ((v - min) / range) * chartH;
    svg += `<circle cx="${x}" cy="${y}" r="3" fill="#fff" stroke="${color}" stroke-width="1.5"/>`;
  });
  // 标签
  labels.forEach((l, i) => {
    const x = padding + (i / (labels.length - 1)) * chartW;
    svg += `<text x="${x}" y="${h + 14}" font-size="9" fill="var(--text-quaternary)" text-anchor="middle">${l}</text>`;
  });
  // 最新值
  const lastVal = data[data.length - 1];
  svg += `<text x="${w - padding}" y="${padding - 2}" font-size="11" fill="${color}" text-anchor="end" font-weight="700">${typeof lastVal === 'number' ? (lastVal % 1 ? lastVal.toFixed(1) : lastVal) : lastVal}</text>`;
  svg += '</svg>';
  return svg;
}

function _renderDrawerLog(q) {
  // 从 workLog 中筛选该队列相关日志
  const allLogs = JSON.parse(localStorage.getItem('glxt_work_logs') || '[]');
  const qLogs = allLogs.filter(l => l.module === '队列管理' && (
    (l.target || '').includes(q.name) || (l.target || '').includes(`ID:${q.id}`)
  )).slice(-20).reverse();

  if (qLogs.length === 0) {
    return `<div class="qm-drawer-section"><div class="qm-empty-state" style="padding:40px 0">
      <div style="font-size:13px;color:var(--text-tertiary)">暂无操作日志</div>
    </div></div>`;
  }

  return `<div class="qm-drawer-section">
    <div class="qm-drawer-section-title">📝 操作日志</div>
    <div class="qm-drawer-log-list">
      ${qLogs.map(l => `
        <div class="qm-log-item">
          <div class="qm-log-time">${l.time || ''}</div>
          <div class="qm-log-action">${l.action || ''}</div>
          <div class="qm-log-detail">${l.target || ''}</div>
        </div>
      `).join('')}
    </div>
  </div>`;
}

function _qmSwitchDrawerTab(tab, queueId) {
  _qmDrawerTab = tab;
  const q = QUEUES_DATA.find(x => x.id === queueId);
  if (q) _renderDrawerContent(q);
}

function _qmDrawerNav(direction) {
  if (!_qmDrawerQueueId) return;
  const filtered = _getFilteredQueues();
  const curIdx = filtered.findIndex(x => x.id === _qmDrawerQueueId);
  const newIdx = curIdx + direction;
  if (newIdx < 0 || newIdx >= filtered.length) return;
  openQueueDrawer(filtered[newIdx].id);
}

function closeQueueDrawer() {
  document.getElementById('qmDrawerOverlay')?.classList.remove('show');
  document.getElementById('qmDrawer')?.classList.remove('show');
  document.querySelectorAll('.qm-row-active-drawer').forEach(el => el.classList.remove('qm-row-active-drawer'));
  _qmDrawerQueueId = null;
}

// ---- 新增队列弹窗（增强：模板 + 智能ID + 实时校验） ----
function showAddQueueModal() {
  const teamOptions = getTeamNames().map(t => `<option value="${t}">${t}</option>`).join('');
  const suggestedId = Math.max(...QUEUES_DATA.map(q => q.id), 0) + 1;
  const templateOptions = _QM_TEMPLATES.map((t, i) => `<option value="${i}">${t.name}</option>`).join('');

  const content = `
    <div class="qm-form-template-row">
      <span style="font-size:12px;color:var(--text-tertiary)">从模板创建：</span>
      <select class="form-control" id="qmTemplateSelect" onchange="_qmApplyTemplate()" style="width:auto;font-size:12px;height:28px">
        <option value="">不使用模板</option>
        ${templateOptions}
      </select>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
      <div class="form-group">
        <label class="form-label required">队列ID</label>
        <input type="number" class="form-control" id="qmId" placeholder="队列ID（数字）" oninput="_qmValidateId()">
        <div class="qm-form-hint" id="qmIdHint">建议ID: <a href="#" onclick="document.getElementById('qmId').value=${suggestedId};_qmValidateId();return false">${suggestedId}</a></div>
      </div>
      <div class="form-group" style="grid-column:span 2">
        <label class="form-label required">队列名称</label>
        <input type="text" class="form-control" id="qmName" placeholder="队列名称" oninput="_qmValidateRequired('qmName')">
      </div>
      <div class="form-group">
        <label class="form-label required">审核团队</label>
        <select class="form-control" id="qmTeam">${teamOptions}</select>
      </div>
      <div class="form-group">
        <label class="form-label">项目</label>
        <input type="text" class="form-control" id="qmProject" placeholder="如：笔记/客诉/评估">
      </div>
      <div class="form-group">
        <label class="form-label">Owner</label>
        <input type="text" class="form-control" id="qmOwner" placeholder="负责人">
      </div>
      <div class="form-group">
        <label class="form-label">优先级</label>
        <select class="form-control" id="qmPriority">
          <option value="P3">P3</option>
          <option value="P2">P2</option>
          <option value="P1">P1</option>
          <option value="P0">P0</option>
        </select>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-top:8px">
      <div class="form-group">
        <label class="form-label">要求</label>
        <select class="form-control" id="qmRequirement">
          <option value="">未设置</option>
          <option value="时清">时清</option>
          <option value="日清">日清</option>
          <option value="周清">周清</option>
          <option value="周三清空">周三清空</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">日均进审量级</label>
        <input type="number" class="form-control" id="qmDailyVolume" placeholder="系统自动监测（可手填）">
      </div>
      <div class="form-group">
        <label class="form-label">人效要求</label>
        <input type="number" class="form-control" id="qmEffTarget" placeholder="人效目标值">
      </div>
      <div class="form-group">
        <label class="form-label">实际达成</label>
        <input type="number" class="form-control" id="qmEffActual" placeholder="人效实际达成值">
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-top:8px">
      <div class="form-group">
        <label class="form-label">时效</label>
        <input type="text" class="form-control" id="qmRealTarget" placeholder="如：0.5h/24h/周清">
      </div>
      <div class="form-group">
        <label class="form-label">队列系数</label>
        <input type="number" step="0.01" class="form-control" id="qmEffCoef" placeholder="可为空">
      </div>
      <div class="form-group">
        <label class="form-label">进审时间</label>
        <input type="text" class="form-control" id="qmInReviewTime" placeholder="如：实时/每天上午8点">
      </div>
      <div class="form-group">
        <label class="form-label">是否加入预警</label>
        <select class="form-control" id="qmEnableWarning">
          <option value="no">否</option>
          <option value="yes">是</option>
        </select>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px">
      <div class="form-group">
        <label class="form-label">预警时间</label>
        <input type="text" class="form-control" id="qmWarningTime" placeholder="如：60min/1条">
      </div>
      <div class="form-group">
        <label class="form-label">审核标签</label>
        <input type="text" class="form-control" id="qmAuditTags" placeholder="多个标签用逗号分隔">
      </div>
    </div>
    <div class="form-group" style="margin-top:8px">
      <label class="form-label">备注</label>
      <textarea class="form-control" id="qmRemark" rows="2" placeholder="可选备注信息"></textarea>
    </div>
    <div class="alert-banner alert-info" style="margin-top:10px">ℹ️ 日进审量级与审核标签支持系统日维度自动获取更新 | <strong>Ctrl+Enter</strong> 快捷保存</div>
  `;
  openModal('新增队列', content, `
    <button class="btn btn-default" onclick="closeModal()">取消</button>
    <button class="btn btn-primary" onclick="saveNewQueue()">确认新增</button>
  `);
  // Ctrl+Enter 保存
  setTimeout(() => {
    const modal = document.querySelector('.modal');
    if (modal) modal.addEventListener('keydown', (e) => { if (e.ctrlKey && e.key === 'Enter') saveNewQueue(); });
  }, 100);
}

function _qmApplyTemplate() {
  const idx = document.getElementById('qmTemplateSelect')?.value;
  if (idx === '' || idx === undefined) return;
  const t = _QM_TEMPLATES[idx];
  if (!t) return;
  document.getElementById('qmTeam').value = t.team;
  document.getElementById('qmEffTarget').value = t.effTarget || '';
  document.getElementById('qmRealTarget').value = t.realTarget || '';
  document.getElementById('qmEffCoef').value = t.effCoef != null ? t.effCoef : '';
  if (t.project) document.getElementById('qmProject').value = t.project;
  if (t.owner) document.getElementById('qmOwner').value = t.owner;
  if (t.requirement) document.getElementById('qmRequirement').value = t.requirement;
}

function _qmValidateId() {
  const input = document.getElementById('qmId');
  const hint = document.getElementById('qmIdHint');
  if (!input || !hint) return;
  const id = parseInt(input.value);
  if (id && QUEUES_DATA.find(q => q.id === id)) {
    const existing = QUEUES_DATA.find(q => q.id === id);
    input.style.borderColor = 'var(--danger)';
hint.innerHTML = `<span style="color:var(--danger)">该ID已被“${existing.name}”使用</span>`;
  } else {
    input.style.borderColor = '';
    const suggestedId = Math.max(...QUEUES_DATA.map(q => q.id), 0) + 1;
    hint.innerHTML = `建议ID: <a href="#" onclick="document.getElementById('qmId').value=${suggestedId};_qmValidateId();return false">${suggestedId}</a>`;
  }
}

function _qmValidateRequired(fieldId) {
  const input = document.getElementById(fieldId);
  if (!input) return;
  if (!input.value.trim()) input.style.borderColor = 'var(--danger)';
  else input.style.borderColor = '';
}

function saveNewQueue() {
  const id = parseInt(document.getElementById('qmId')?.value);
  const name = document.getElementById('qmName')?.value?.trim();
  const team = document.getElementById('qmTeam')?.value;

  if (!id || isNaN(id)) { showToast('请输入有效的队列ID', 'warning'); return; }
  if (!name) { showToast('请输入队列名称', 'warning'); return; }
  if (QUEUES_DATA.find(q => q.id === id)) { showToast('队列ID已存在', 'warning'); return; }

  const effCoefVal = document.getElementById('qmEffCoef')?.value;
  const newQueue = {
    id, name, team,
    project: document.getElementById('qmProject')?.value?.trim() || '',
    owner: document.getElementById('qmOwner')?.value?.trim() || '',
    priority: document.getElementById('qmPriority')?.value || 'P3',
    requirement: document.getElementById('qmRequirement')?.value || '',
    effCoef: effCoefVal !== '' ? parseFloat(effCoefVal) : null,
    effTarget: parseFloat(document.getElementById('qmEffTarget')?.value) || 0,
    effActual: parseFloat(document.getElementById('qmEffActual')?.value) || 0,
    realTarget: document.getElementById('qmRealTarget')?.value?.trim() || '',
    dailyVolume: parseInt(document.getElementById('qmDailyVolume')?.value) || 0,
    auditTags: document.getElementById('qmAuditTags')?.value?.trim() || '',
    inReviewTime: document.getElementById('qmInReviewTime')?.value?.trim() || '',
    enableWarning: document.getElementById('qmEnableWarning')?.value || 'no',
    warningTime: document.getElementById('qmWarningTime')?.value?.trim() || '',
    remark: document.getElementById('qmRemark')?.value?.trim() || '',
    backlog: 0, inReview: 0, outReview: 0,
    status: 'active',
  };

  QUEUES_DATA.push(newQueue);
  saveQueuesData();
  _qmNewQueueId = newQueue.id;
  addWorkLog('队列管理', '新增队列', `新增队列 ${name}（ID:${id}），审核团队：${team}`);
  closeModal();
  showToast('队列新增成功', 'success');
  renderQueueManagePage(document.getElementById('contentArea'));
  setTimeout(() => { _qmNewQueueId = null; document.querySelector('.qm-row-new')?.classList.remove('qm-row-new'); }, 2000);
}

// ---- 编辑队列弹窗（增强：修改高亮 + Ctrl+Enter） ----
function showEditQueueModal(queueId) {
  const q = QUEUES_DATA.find(q => q.id === queueId);
  if (!q) { showToast('队列不存在', 'warning'); return; }
  // 保存原始值用于高亮对比
  const orig = JSON.parse(JSON.stringify(q));

  const teamOptions = getTeamNames().map(t => `<option value="${t}" ${t === q.team ? 'selected' : ''}>${t}</option>`).join('');
  const content = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
      <div class="form-group">
        <label class="form-label">队列ID</label>
        <input type="number" class="form-control" id="qmEditId" value="${q.id}" disabled style="background:var(--bg)">
      </div>
      <div class="form-group" style="grid-column:span 2">
        <label class="form-label required">队列名称</label>
        <input type="text" class="form-control qm-edit-track" id="qmEditName" value="${q.name}" data-orig="${q.name}" oninput="_qmTrackEdit(this)">
      </div>
      <div class="form-group">
        <label class="form-label required">审核团队</label>
        <select class="form-control qm-edit-track" id="qmEditTeam" data-orig="${q.team}" onchange="_qmTrackEdit(this)">${teamOptions}</select>
      </div>
      <div class="form-group">
        <label class="form-label">项目</label>
        <input type="text" class="form-control qm-edit-track" id="qmEditProject" value="${q.project || ''}" data-orig="${q.project || ''}" oninput="_qmTrackEdit(this)" placeholder="如：笔记/客诉/评估">
      </div>
      <div class="form-group">
        <label class="form-label">Owner</label>
        <input type="text" class="form-control qm-edit-track" id="qmEditOwner" value="${q.owner || ''}" data-orig="${q.owner || ''}" oninput="_qmTrackEdit(this)">
      </div>
      <div class="form-group">
        <label class="form-label">优先级</label>
        <select class="form-control qm-edit-track" id="qmEditPriority" data-orig="${q.priority || 'P3'}" onchange="_qmTrackEdit(this)">
          <option value="P3" ${(q.priority || 'P3') === 'P3' ? 'selected' : ''}>P3</option>
          <option value="P2" ${q.priority === 'P2' ? 'selected' : ''}>P2</option>
          <option value="P1" ${q.priority === 'P1' ? 'selected' : ''}>P1</option>
          <option value="P0" ${q.priority === 'P0' ? 'selected' : ''}>P0</option>
        </select>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-top:8px">
      <div class="form-group">
        <label class="form-label">要求</label>
        <select class="form-control qm-edit-track" id="qmEditRequirement" data-orig="${q.requirement || ''}" onchange="_qmTrackEdit(this)">
          <option value="">未设置</option>
          <option value="时清" ${q.requirement === '时清' ? 'selected' : ''}>时清</option>
          <option value="日清" ${q.requirement === '日清' ? 'selected' : ''}>日清</option>
          <option value="周清" ${q.requirement === '周清' ? 'selected' : ''}>周清</option>
          <option value="周三清空" ${q.requirement === '周三清空' ? 'selected' : ''}>周三清空</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">日均进审量级</label>
        <input type="number" class="form-control qm-edit-track" id="qmEditDailyVolume" value="${q.dailyVolume || ''}" data-orig="${q.dailyVolume || ''}" oninput="_qmTrackEdit(this)">
      </div>
      <div class="form-group">
        <label class="form-label">人效要求</label>
        <input type="number" class="form-control qm-edit-track" id="qmEditEffTarget" value="${q.effTarget || ''}" data-orig="${q.effTarget || ''}" oninput="_qmTrackEdit(this)">
      </div>
      <div class="form-group">
        <label class="form-label">实际达成</label>
        <input type="number" class="form-control qm-edit-track" id="qmEditEffActual" value="${q.effActual || ''}" data-orig="${q.effActual || ''}" oninput="_qmTrackEdit(this)">
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-top:8px">
      <div class="form-group">
        <label class="form-label">时效</label>
        <input type="text" class="form-control qm-edit-track" id="qmEditRealTarget" value="${q.realTarget || ''}" data-orig="${q.realTarget || ''}" oninput="_qmTrackEdit(this)" placeholder="如：0.5h/24h/周清">
      </div>
      <div class="form-group">
        <label class="form-label">队列系数</label>
        <input type="number" step="0.01" class="form-control qm-edit-track" id="qmEditEffCoef" value="${q.effCoef != null ? q.effCoef : ''}" data-orig="${q.effCoef != null ? q.effCoef : ''}" oninput="_qmTrackEdit(this)">
      </div>
      <div class="form-group">
        <label class="form-label">进审时间</label>
        <input type="text" class="form-control qm-edit-track" id="qmEditInReviewTime" value="${q.inReviewTime || ''}" data-orig="${q.inReviewTime || ''}" oninput="_qmTrackEdit(this)" placeholder="如：实时/每天上午8点">
      </div>
      <div class="form-group">
        <label class="form-label">是否加入预警</label>
        <select class="form-control qm-edit-track" id="qmEditEnableWarning" data-orig="${q.enableWarning || 'no'}" onchange="_qmTrackEdit(this)">
          <option value="no" ${(q.enableWarning || 'no') === 'no' ? 'selected' : ''}>否</option>
          <option value="yes" ${q.enableWarning === 'yes' ? 'selected' : ''}>是</option>
        </select>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px">
      <div class="form-group">
        <label class="form-label">预警时间</label>
        <input type="text" class="form-control qm-edit-track" id="qmEditWarningTime" value="${q.warningTime || ''}" data-orig="${q.warningTime || ''}" oninput="_qmTrackEdit(this)" placeholder="如：60min/1条">
      </div>
      <div class="form-group">
        <label class="form-label">审核标签</label>
        <input type="text" class="form-control qm-edit-track" id="qmEditAuditTags" value="${q.auditTags || ''}" data-orig="${q.auditTags || ''}" placeholder="多个标签用逗号分隔" oninput="_qmTrackEdit(this)">
      </div>
    </div>
    <div class="form-group" style="margin-top:8px">
      <label class="form-label">备注</label>
      <textarea class="form-control qm-edit-track" id="qmEditRemark" data-orig="${(q.remark || '').replace(/"/g, '&quot;')}" oninput="_qmTrackEdit(this)" rows="2" placeholder="可选备注信息">${q.remark || ''}</textarea>
    </div>
    <div class="alert-banner alert-info" style="margin-top:10px">💡 修改过的字段会高亮显示 | <strong>Ctrl+Enter</strong> 快捷保存</div>
  `;
  openModal('编辑队列 — ' + q.name, content, `
    <button class="btn btn-default" onclick="closeModal()">取消</button>
    <button class="btn btn-primary" onclick="saveEditQueue(${q.id})">保存修改</button>
  `);
  setTimeout(() => {
    const modal = document.querySelector('.modal');
    if (modal) modal.addEventListener('keydown', (e) => { if (e.ctrlKey && e.key === 'Enter') saveEditQueue(q.id); });
  }, 100);
}

function _qmTrackEdit(el) {
  if (el.value !== el.dataset.orig) {
    el.style.backgroundColor = 'rgba(20,86,240,0.04)';
    el.style.borderColor = 'var(--primary)';
  } else {
    el.style.backgroundColor = '';
    el.style.borderColor = '';
  }
}

function saveEditQueue(queueId) {
const q = QUEUES_DATA.find(q => q.id === queueId);
if (!q) return;

const name = document.getElementById('qmEditName')?.value?.trim();

if (!name) { showToast('请输入队列名称', 'warning'); return; }

const changes = [];
const update = (field, newVal) => {
if (String(q[field] ?? '') !== String(newVal ?? '')) {
changes.push(`${field}: ${q[field] ?? ''} → ${newVal}`);
q[field] = newVal;
}
};

update('name', name);
update('team', document.getElementById('qmEditTeam')?.value || q.team);
update('project', document.getElementById('qmEditProject')?.value?.trim() || '');
update('owner', document.getElementById('qmEditOwner')?.value?.trim() || '');
update('priority', document.getElementById('qmEditPriority')?.value || 'P3');
update('requirement', document.getElementById('qmEditRequirement')?.value || '');

const effTargetVal = document.getElementById('qmEditEffTarget')?.value;
update('effTarget', effTargetVal !== '' ? parseFloat(effTargetVal) || 0 : 0);
const effActualVal = document.getElementById('qmEditEffActual')?.value;
update('effActual', effActualVal !== '' ? parseFloat(effActualVal) || 0 : 0);

update('realTarget', document.getElementById('qmEditRealTarget')?.value?.trim() || '');
update('dailyVolume', parseInt(document.getElementById('qmEditDailyVolume')?.value) || 0);
update('auditTags', document.getElementById('qmEditAuditTags')?.value?.trim() || '');

const effCoefVal = document.getElementById('qmEditEffCoef')?.value;
update('effCoef', effCoefVal !== '' ? parseFloat(effCoefVal) : null);

update('inReviewTime', document.getElementById('qmEditInReviewTime')?.value?.trim() || '');
update('enableWarning', document.getElementById('qmEditEnableWarning')?.value || 'no');
update('warningTime', document.getElementById('qmEditWarningTime')?.value?.trim() || '');
update('remark', document.getElementById('qmEditRemark')?.value?.trim() || '');

if (changes.length === 0) { closeModal(); showToast('未修改任何内容', 'info'); return; }

saveQueuesData();
_saveQueueSnapshot(q);
addWorkLog('队列管理', '编辑队列', `编辑 ${name}（ID:${q.id}）：${changes.join('；')}`);
closeModal();
showToast(`${name} 编辑成功（${changes.length}项变更）`, 'success');
renderQueueManagePage(document.getElementById('contentArea'));
}

// ---- 删除队列（Undo模式） ----
function confirmDeleteQueue(queueId) {
  const q = QUEUES_DATA.find(x => x.id === queueId);
  if (!q) return;
  const content = `
    <div style="text-align:center;padding:8px 0">
      <div style="font-size:14px;color:var(--text-primary)">确认删除队列「<strong>${q.name}</strong>」？</div>
      <div style="font-size:12px;color:var(--text-tertiary);margin-top:8px">ID: ${q.id} | 团队: ${q.team}</div>
      <div style="font-size:12px;color:var(--text-tertiary);margin-top:4px">删除后可通过底部提示栏撤销操作</div>
    </div>
  `;
  openModal('删除确认', content, `
    <button class="btn btn-default" onclick="closeModal()">取消</button>
    <button class="btn btn-danger" onclick="executeDeleteQueue(${queueId})">确认删除</button>
  `);
}

function executeDeleteQueue(queueId) {
  const idx = QUEUES_DATA.findIndex(q => q.id === queueId);
  if (idx === -1) return;
  const removed = QUEUES_DATA.splice(idx, 1)[0];
  _qmPushUndo('singleDelete', removed, `删除 ${removed.name}`);
  saveQueuesData();
  addWorkLog('队列管理', '删除队列', `删除队列 ${removed.name}（ID:${removed.id}）`);
  closeModal();
  _qmShowUndoToast(`已删除 ${removed.name}`);
  renderQueueManagePage(document.getElementById('contentArea'));
}

// ---- 导出/导入字段映射表（ID为锚点） ----
const _QM_FIELD_MAP = [
  { key: 'id', label: '队列ID', required: true },
  { key: 'name', label: '队列名称', required: true },
  { key: 'team', label: '团队' },
  { key: 'priority', label: '优先级' },
  { key: 'project', label: '项目' },
  { key: 'owner', label: 'Owner' },
  { key: 'requirement', label: '要求' },
  { key: 'dailyVolume', label: '日均进审量级' },
  { key: 'backlog', label: '积压量' },
  { key: 'effTarget', label: '人效要求' },
  { key: 'effActual', label: '实际达成' },
  { key: 'realTarget', label: '时效' },
  { key: 'effCoef', label: '队列系数' },
  { key: 'auditTags', label: '标签' },
  { key: 'inReviewTime', label: '进审时间' },
  { key: 'enableWarning', label: '是否预警' },
  { key: 'warningTime', label: '预警时间' },
  { key: 'remark', label: '备注' },
  { key: 'status', label: '状态' },
  { key: 'inReview', label: '在审' },
  { key: 'outReview', label: '出审' },
];
const _QM_FIELD_LABEL = Object.fromEntries(_QM_FIELD_MAP.map(f => [f.key, f.label]));

// ============================================================
//  导出配置（ID锚点 + 中文映射 + 全选反选 + CSV BOM + 预览统计）
// ============================================================
function showExportConfigModal() {
  const filteredCount = _getFilteredQueues().length;
  const content = `
    <div class="qm-ie-section">
      <label class="form-label">导出范围</label>
      <select class="form-control" id="qmExportScope" onchange="_qmExportScopeChange()">
        <option value="all">全部队列 (${QUEUES_DATA.length})</option>
        <option value="filtered">当前筛选结果 (${filteredCount})</option>
        ${_qmSelectedIds.size > 0 ? `<option value="selected">已选中 (${_qmSelectedIds.size})</option>` : ''}
      </select>
    </div>
    <div class="qm-ie-section">
      <label class="form-label">导出格式</label>
      <div class="qm-ie-radio-group">
        <label class="qm-ie-radio"><input type="radio" name="qmExportFmt" value="json" checked> JSON</label>
        <label class="qm-ie-radio"><input type="radio" name="qmExportFmt" value="csv"> CSV</label>
        <label class="qm-ie-radio"><input type="radio" name="qmExportFmt" value="clipboard"> 📋 复制到剪贴板</label>
      </div>
    </div>
    <div class="qm-ie-section">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <label class="form-label" style="margin:0">导出字段</label>
        <div style="display:flex;gap:8px">
          <a href="javascript:void(0)" onclick="_qmExportToggleAll(true)" style="font-size:11px;color:var(--primary)">全选</a>
          <a href="javascript:void(0)" onclick="_qmExportToggleAll(false)" style="font-size:11px;color:var(--primary)">反选</a>
        </div>
      </div>
      <div class="qm-ie-field-grid" id="qmExportFields">
        ${_QM_FIELD_MAP.map(f => `<label class="qm-ie-field-tag"><input type="checkbox" value="${f.key}" ${f.required ? 'checked disabled' : 'checked'} onchange="_qmExportUpdateCount()"> ${f.label}</label>`).join('')}
      </div>
    </div>
    <div class="qm-ie-preview-bar" id="qmExportPreviewBar">
      将导出 <strong id="qmExportCount">${QUEUES_DATA.length}</strong> 条队列，包含 <strong id="qmExportFieldCount">${_QM_FIELD_MAP.length}</strong> 个字段，以 <span style="color:var(--primary)">队列ID</span> 为唯一标识
    </div>
  `;
  openModal('📤 导出队列配置', content, `
    <button class="btn btn-default" onclick="closeModal()">取消</button>
    <button class="btn btn-primary" onclick="_qmDoExport()">导出</button>
  `, '520px');
}

function _qmExportToggleAll(selectAll) {
  const checks = document.querySelectorAll('#qmExportFields input[type="checkbox"]:not(:disabled)');
  if (selectAll) checks.forEach(c => c.checked = true);
  else checks.forEach(c => c.checked = !c.checked);
  _qmExportUpdateCount();
}

function _qmExportScopeChange() {
  const scope = document.getElementById('qmExportScope')?.value || 'all';
  let count = QUEUES_DATA.length;
  if (scope === 'filtered') count = _getFilteredQueues().length;
  else if (scope === 'selected') count = _qmSelectedIds.size;
  const el = document.getElementById('qmExportCount');
  if (el) el.textContent = count;
}

function _qmExportUpdateCount() {
  const count = document.querySelectorAll('#qmExportFields input:checked').length;
  const el = document.getElementById('qmExportFieldCount');
  if (el) el.textContent = count;
}

function _qmDoExport() {
  const scope = document.getElementById('qmExportScope')?.value || 'all';
  const fmt = document.querySelector('input[name="qmExportFmt"]:checked')?.value || 'json';
  const fields = [...document.querySelectorAll('#qmExportFields input:checked')].map(c => c.value);
  if (fields.length === 0) { showToast('请至少选择一个导出字段', 'warning'); return; }

  let queues;
  if (scope === 'selected') queues = QUEUES_DATA.filter(q => _qmSelectedIds.has(q.id));
  else if (scope === 'filtered') queues = _getFilteredQueues();
  else queues = QUEUES_DATA.slice();

  queues.sort((a, b) => a.id - b.id);

  const data = queues.map(q => {
    const obj = {};
    fields.forEach(f => { obj[f] = q[f] !== undefined ? q[f] : ''; });
    return obj;
  });

  if (data.length === 0) { showToast('导出范围内没有队列数据', 'info'); return; }

  if (fmt === 'clipboard') {
    const text = JSON.stringify(data, null, 2);
    navigator.clipboard.writeText(text).then(() => {
      addWorkLog('队列管理', '导出配置', `复制 ${data.length} 条队列到剪贴板`);
      closeModal();
      showToast(`${data.length} 条队列数据已复制到剪贴板`, 'success');
    }).catch(() => showToast('复制失败', 'warning'));
    return;
  }

  let fileContent, filename, mime;
  const dateStr = new Date().toISOString().slice(0, 10);
  if (fmt === 'csv') {
    const headerLabels = fields.map(f => _QM_FIELD_LABEL[f] || f);
    const header = headerLabels.map(h => `"${h}"`).join(',');
    const rows = data.map(d => fields.map(f => `"${String(d[f] ?? '').replace(/"/g, '""')}"`).join(','));
    fileContent = '\uFEFF' + header + '\n' + rows.join('\n');
    filename = `queues_export_${dateStr}.csv`;
    mime = 'text/csv;charset=utf-8';
  } else {
    fileContent = JSON.stringify(data, null, 2);
    filename = `queues_export_${dateStr}.json`;
    mime = 'application/json';
  }

  const blob = new Blob([fileContent], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  addWorkLog('队列管理', '导出配置', `导出 ${data.length} 条队列配置（${fmt.toUpperCase()}）`);
  closeModal();
  showToast(`已导出 ${data.length} 条队列配置（${fmt.toUpperCase()}）`, 'success');
}

// ============================================================
//  导入配置（JSON+CSV 双格式 · ID锚点匹配 · 解析预览 · 差异对比 · 校验）
// ============================================================
let _qmImportParsed = [];

function showQueueImportModal() {
  _qmImportParsed = [];
  const content = `
    <div class="qm-ie-section">
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:10px">
        支持 <strong>Excel</strong>、<strong>CSV</strong>、<strong>JSON</strong> 格式，以 <span style="color:var(--primary);font-weight:600">队列ID</span> 为锚点自动匹配现有队列。
      </div>
      <div class="qm-import-drop" id="qmImportDrop"
        ondragover="event.preventDefault();this.classList.add('dragover')"
        ondragleave="this.classList.remove('dragover')"
        ondrop="_qmImportDrop(event)">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-quaternary)" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <div style="font-size:13px;color:var(--text-tertiary);margin-top:8px">
          拖拽文件到此处 或 <label class="qm-upload-link" for="qmImportFile">选择文件</label>
        </div>
        <div style="font-size:11px;color:var(--text-quaternary);margin-top:4px">支持 .xlsx / .xls / .csv / .json 文件（≤2MB）</div>
        <input type="file" id="qmImportFile" accept=".xlsx,.xls,.csv,.json" style="display:none" onchange="_qmImportFile(this)">
      </div>
      <div id="qmImportFileInfo" class="qm-ie-file-info" style="display:none"></div>
    </div>
    <div class="qm-ie-section">
      <label class="form-label">或直接粘贴数据（Excel 请用上方文件上传）</label>
      <textarea class="form-control" id="qmImportText" rows="5" placeholder='JSON: [{"id": 182, "backlog": 100, ...}]&#10;CSV:  队列ID,队列名称,积压量&#10;      182,用户投诉-...,100' style="font-family:monospace;font-size:11.5px"></textarea>
    </div>
    <div class="qm-ie-section">
      <label class="form-label">ID冲突处理策略</label>
      <select class="form-control" id="qmImportMode">
        <option value="merge" selected>🔀 智能合并 — ID匹配后仅更新有值字段，保留其余字段不变</option>
        <option value="overwrite">♻️ 完全覆盖 — ID匹配后整条替换</option>
        <option value="skip">⏭️ 跳过冲突 — ID已存在则不导入</option>
        <option value="append">➕ 全部追加 — 忽略ID，自动分配新ID</option>
      </select>
    </div>
    <div id="qmImportPreview" style="display:none"></div>
  `;
  openModal('📥 导入队列配置', content, `
    <button class="btn btn-default" onclick="closeModal()">取消</button>
    <button class="btn btn-default" onclick="_qmImportParse()" id="qmImportParseBtn">🔍 解析预览</button>
    <button class="btn btn-primary" onclick="_qmDoImport()" id="qmImportConfirmBtn" disabled style="opacity:0.5">确认导入</button>
  `, '680px');
}

function _qmImportDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('dragover');
  const file = e.dataTransfer?.files?.[0];
  if (file) _qmReadImportFile(file);
}

function _qmImportFile(input) {
  const file = input.files?.[0];
  if (file) _qmReadImportFile(file);
}

function _qmReadImportFile(file) {
  if (file.size > 2 * 1024 * 1024) { showToast('文件超过 2MB 限制', 'warning'); return; }
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['json', 'csv', 'xlsx', 'xls'].includes(ext)) { showToast('仅支持 .xlsx / .xls / .csv / .json 格式', 'warning'); return; }

  const infoEl = document.getElementById('qmImportFileInfo');
  if (infoEl) {
    infoEl.style.display = 'flex';
    infoEl.innerHTML = `<span>📄 <strong>${file.name}</strong></span><span style="color:var(--text-quaternary)">${(file.size / 1024).toFixed(1)} KB</span><a href="javascript:void(0)" onclick="_qmImportRemoveFile()" style="color:var(--danger);font-size:11px">移除</a>`;
  }

  if (ext === 'xlsx' || ext === 'xls') {
    // Excel 文件：用 SheetJS 解析为 JSON 文本
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        // 读取为二维数组
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (rows.length < 2) { showToast('Excel 文件为空或仅有表头', 'warning'); return; }
        // 表头映射
        const labelToKey = Object.fromEntries(_QM_FIELD_MAP.map(f => [f.label, f.key]));
        const headers = rows[0].map(h => {
          const s = String(h).trim();
          return labelToKey[s] || s;
        });
        const numericFields = ['id','dailyVolume','backlog','effTarget','effActual','inReview','outReview'];
        const data = [];
        for (let i = 1; i < rows.length; i++) {
          const cells = rows[i];
          if (!cells || cells.every(c => c === '' || c === null || c === undefined)) continue;
          const obj = {};
          headers.forEach((h, idx) => {
            let v = cells[idx] !== undefined && cells[idx] !== null ? cells[idx] : '';
            if (typeof v === 'string') v = v.trim();
            if (numericFields.includes(h) && v !== '') { const n = parseFloat(v); if (!isNaN(n)) v = n; }
            if (h === 'effCoef' && v !== '') { const n = parseFloat(v); v = isNaN(n) ? null : n; }
            obj[h] = v;
          });
          if (obj.id || obj.name) data.push(obj);
        }
        // 将解析结果放入 textarea 供预览
        const textarea = document.getElementById('qmImportText');
        if (textarea) textarea.value = JSON.stringify(data, null, 2);
        showToast(`Excel 解析成功：${data.length} 行数据`, 'success');
      } catch (err) {
        showToast('Excel 解析失败：' + err.message, 'warning');
      }
    };
    reader.readAsArrayBuffer(file);
  } else {
    // JSON / CSV：文本读取
    const reader = new FileReader();
    reader.onload = (e) => {
      const textarea = document.getElementById('qmImportText');
      if (textarea) textarea.value = e.target.result;
    };
    reader.readAsText(file);
  }
}

function _qmImportRemoveFile() {
  const infoEl = document.getElementById('qmImportFileInfo');
  if (infoEl) infoEl.style.display = 'none';
  const textarea = document.getElementById('qmImportText');
  if (textarea) textarea.value = '';
  const preview = document.getElementById('qmImportPreview');
  if (preview) preview.style.display = 'none';
  _qmImportParsed = [];
  _qmImportSetConfirmEnabled(false);
}

// CSV 解析器（处理引号/逗号/换行 + 中英文表头自动映射）
function _qmParseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const rawHeaders = _qmCSVSplitRow(lines[0]);
  const labelToKey = Object.fromEntries(_QM_FIELD_MAP.map(f => [f.label, f.key]));
  const headers = rawHeaders.map(h => {
    const cleaned = h.trim().replace(/^["']+|["']+$/g, '');
    return labelToKey[cleaned] || cleaned;
  });
  const numericFields = ['id','dailyVolume','backlog','effTarget','effActual','inReview','outReview'];
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = _qmCSVSplitRow(lines[i]);
    if (vals.length === 0 || vals.every(v => !v.trim())) continue;
    const obj = {};
    headers.forEach((h, idx) => {
      let v = (vals[idx] || '').trim().replace(/^["']+|["']+$/g, '');
      if (numericFields.includes(h)) { const n = parseFloat(v); if (!isNaN(n)) v = n; }
      if (h === 'effCoef') { const n = parseFloat(v); v = isNaN(n) ? null : n; }
      obj[h] = v;
    });
    if (obj.id || obj.name) rows.push(obj);
  }
  return rows;
}

function _qmCSVSplitRow(line) {
  const result = [];
  let current = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && !inQuotes) { inQuotes = true; continue; }
    if (c === '"' && inQuotes) {
      if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; continue; }
      inQuotes = false; continue;
    }
    if (c === ',' && !inQuotes) { result.push(current); current = ''; continue; }
    current += c;
  }
  result.push(current);
  return result;
}

function _qmImportSetConfirmEnabled(enabled) {
  const btn = document.getElementById('qmImportConfirmBtn');
  if (btn) { btn.disabled = !enabled; btn.style.opacity = enabled ? '1' : '0.5'; }
}

// 解析 + 预览（差异对比表格）
function _qmImportParse() {
  const text = (document.getElementById('qmImportText')?.value || '').trim();
  if (!text) { showToast('请先上传文件或粘贴数据', 'warning'); return; }

  const cleanText = text.replace(/^\uFEFF/, '');
  let data;
  const trimmed = cleanText.trimStart();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try { data = JSON.parse(cleanText); } catch (e) { showToast('JSON 格式错误：' + e.message, 'warning'); return; }
    if (!Array.isArray(data)) data = [data];
  } else {
    data = _qmParseCSV(cleanText);
    if (data.length === 0) { showToast('CSV 解析为空，请检查表头是否包含"队列ID"或"id"列', 'warning'); return; }
  }

  // 数据校验
  const errors = [];
  data.forEach((item, i) => {
    if (!item.id && !item.name) errors.push(`第 ${i + 1} 行缺少 ID 和名称`);
    if (item.id !== undefined && item.id !== '') {
      const n = parseInt(item.id);
      if (isNaN(n)) errors.push(`第 ${i + 1} 行 ID "${item.id}" 不是有效数字`);
      else item.id = n;
    }
    if (item.priority && !['P0','P1','P2','P3'].includes(String(item.priority).toUpperCase())) {
      errors.push(`第 ${i + 1} 行优先级 "${item.priority}" 不合法（应为 P0-P3）`);
    }
  });
  if (errors.length > 0) {
    showToast(`数据校验发现 ${errors.length} 个问题：${errors.slice(0, 3).join('；')}${errors.length > 3 ? '...' : ''}`, 'warning');
    return;
  }

  _qmImportParsed = data;
  const mode = document.getElementById('qmImportMode')?.value || 'merge';

  // 分类统计 + 预览行
  let newCount = 0, updateCount = 0, skipCount = 0;
  const previewRows = data.map(item => {
    const existing = item.id ? QUEUES_DATA.find(q => q.id === item.id) : null;
    let action, actionClass, actionIcon;

    if (mode === 'append') {
      action = '追加'; actionClass = 'qm-imp-new'; actionIcon = '➕'; newCount++;
    } else if (!existing) {
      action = '新增'; actionClass = 'qm-imp-new'; actionIcon = '🆕'; newCount++;
    } else if (mode === 'skip') {
      action = '跳过'; actionClass = 'qm-imp-skip'; actionIcon = '⏭️'; skipCount++;
    } else {
      action = mode === 'merge' ? '合并' : '覆盖';
      actionClass = 'qm-imp-update'; actionIcon = '🔄'; updateCount++;
    }

    // 差异字段标签
    let diffHtml = '';
    if (existing && (mode === 'merge' || mode === 'overwrite')) {
      const diffs = [];
      Object.keys(item).forEach(k => {
        if (k === 'id') return;
        const oldVal = existing[k] ?? '';
        const newVal = item[k] ?? '';
        if (String(oldVal) !== String(newVal) && String(newVal) !== '') {
          diffs.push(`<span class="qm-imp-diff-field">${_QM_FIELD_LABEL[k] || k}</span>`);
        }
      });
      if (diffs.length > 0) diffHtml = `<div class="qm-imp-diff-tags">${diffs.slice(0, 5).join('')}${diffs.length > 5 ? `<span class="qm-imp-diff-more">+${diffs.length - 5}</span>` : ''}</div>`;
    }

    return `<tr class="${actionClass}">
      <td style="text-align:center;font-family:monospace;font-weight:600">${item.id || '—'}</td>
      <td>${item.name || '<em style="color:var(--text-quaternary)">无名称</em>'}</td>
      <td>${item.team || '—'}</td>
      <td style="text-align:center"><span class="qm-imp-action ${actionClass}">${actionIcon} ${action}</span></td>
      <td>${diffHtml || '—'}</td>
    </tr>`;
  });

  const previewHtml = `
    <div class="qm-ie-section" style="margin-top:12px">
      <div class="qm-imp-stats">
        <span class="qm-imp-stat qm-imp-stat-total">共 ${data.length} 条</span>
        ${newCount > 0 ? `<span class="qm-imp-stat qm-imp-stat-new">新增 ${newCount}</span>` : ''}
        ${updateCount > 0 ? `<span class="qm-imp-stat qm-imp-stat-update">更新 ${updateCount}</span>` : ''}
        ${skipCount > 0 ? `<span class="qm-imp-stat qm-imp-stat-skip">跳过 ${skipCount}</span>` : ''}
      </div>
      <div class="qm-imp-table-wrap">
        <table class="qm-imp-table">
          <thead><tr>
            <th style="width:60px;text-align:center">ID</th>
            <th>队列名称</th>
            <th style="width:80px">团队</th>
            <th style="width:80px;text-align:center">操作</th>
            <th style="width:160px">变更字段</th>
          </tr></thead>
          <tbody>${previewRows.join('')}</tbody>
        </table>
      </div>
      <div style="font-size:11px;color:var(--text-quaternary);margin-top:8px;text-align:center">
        ⚠️ 以上为预览结果，点击「确认导入」后生效
      </div>
    </div>
  `;

  const previewEl = document.getElementById('qmImportPreview');
  if (previewEl) { previewEl.innerHTML = previewHtml; previewEl.style.display = 'block'; }
  _qmImportSetConfirmEnabled(true);
  showToast(`解析成功：${data.length} 条数据已就绪`, 'success');
}

// 执行导入
function _qmDoImport() {
  if (_qmImportParsed.length === 0) { showToast('请先点击「解析预览」', 'warning'); return; }

  const mode = document.getElementById('qmImportMode')?.value || 'merge';
  const data = _qmImportParsed;
  let added = 0, updated = 0, skipped = 0;
  const maxId = () => Math.max(...QUEUES_DATA.map(q => q.id), 0) + 1;

  data.forEach(item => {
    if (mode === 'append') {
      item.id = maxId();
      if (!item.status) item.status = 'active';
      if (!item.priority) item.priority = 'P3';
      QUEUES_DATA.push({ ...item });
      added++;
      return;
    }

    const existingIdx = item.id ? QUEUES_DATA.findIndex(q => q.id === item.id) : -1;

    if (existingIdx === -1) {
      if (!item.id) item.id = maxId();
      if (!item.status) item.status = 'active';
      if (!item.priority) item.priority = 'P3';
      QUEUES_DATA.push({ ...item });
      added++;
    } else if (mode === 'skip') {
      skipped++;
    } else if (mode === 'overwrite') {
      const oldId = QUEUES_DATA[existingIdx].id;
      QUEUES_DATA[existingIdx] = { ...item, id: oldId };
      if (!QUEUES_DATA[existingIdx].status) QUEUES_DATA[existingIdx].status = 'active';
      if (!QUEUES_DATA[existingIdx].priority) QUEUES_DATA[existingIdx].priority = 'P3';
      updated++;
    } else {
      // merge：只更新导入数据中有值的字段，其余保留
      const target = QUEUES_DATA[existingIdx];
      Object.keys(item).forEach(k => {
        if (k === 'id') return;
        const v = item[k];
        if (v !== undefined && v !== null && v !== '') target[k] = v;
      });
      updated++;
    }
  });

  saveQueuesData();
  _qmImportParsed = [];
  const summary = `新增 ${added}，更新 ${updated}，跳过 ${skipped}`;
  addWorkLog('队列管理', '导入配置', `导入完成：${summary}（${mode}模式）`);
  closeModal();
  showToast(`导入完成：${summary}`, 'success');
  renderQueueManagePage(document.getElementById('contentArea'));
}

// ---- 对比分析弹窗 ----
function _qmShowCompare() {
  if (_qmSelectedIds.size < 2) { showToast('请至少选中2个队列进行对比', 'info'); return; }
  if (_qmSelectedIds.size > 6) { showToast('最多同时对比6个队列', 'info'); return; }
  const queues = [..._qmSelectedIds].map(id => QUEUES_DATA.find(q => q.id === id)).filter(Boolean);
  const fields = [
    { key: 'team', label: '团队' },
    { key: 'project', label: '项目' },
    { key: 'owner', label: 'Owner' },
    { key: 'requirement', label: '要求' },
    { key: 'dailyVolume', label: '日均进审量级', highlight: true },
    { key: 'effTarget', label: '人效要求' },
    { key: 'effActual', label: '实际达成', highlight: true },
    { key: 'realTarget', label: '时效' },
    { key: 'effCoef', label: '队列系数' },
    { key: 'backlog', label: '积压量', highlight: true, fmt: v => v ? v.toLocaleString() : '0' },
    { key: 'enableWarning', label: '是否预警', fmt: v => v === 'yes' ? '是' : '否' },
    { key: 'status', label: '状态', fmt: v => v === 'active' ? '启用' : '暂停' },
  ];

  const headerRow = `<th style="width:90px"></th>${queues.map(q => `<th style="text-align:center"><div style="font-weight:600">${q.name}</div><code style="font-size:10px;color:var(--text-quaternary)">ID:${q.id}</code></th>`).join('')}`;
  const bodyRows = fields.map(f => {
    const values = queues.map(q => f.calc ? f.calc(q) : (q[f.key] ?? '-'));
    const numValues = values.filter(v => typeof v === 'number');
    const maxVal = numValues.length > 0 ? Math.max(...numValues) : null;
    const minVal = numValues.length > 0 ? Math.min(...numValues) : null;
    const cells = values.map(v => {
      let display = f.fmt ? f.fmt(v) : v;
      let style = '';
      if (f.highlight && typeof v === 'number' && maxVal !== minVal) {
        if (v === maxVal) style = 'color:var(--success);font-weight:600';
        else if (v === minVal) style = 'color:var(--danger);font-weight:600';
      }
      return `<td style="text-align:center;${style}">${display}</td>`;
    }).join('');
    return `<tr><td style="font-weight:500;color:var(--text-secondary);font-size:12px">${f.label}</td>${cells}</tr>`;
  }).join('');

  const content = `
    <div style="overflow-x:auto">
      <table class="data-table" style="font-size:12px;margin:0">
        <thead><tr>${headerRow}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
    <div style="margin-top:12px;font-size:11px;color:var(--text-quaternary)">
      <span style="color:var(--success)">■</span> 最优值 &nbsp; <span style="color:var(--danger)">■</span> 最低值
    </div>
  `;
  openModal(`队列对比分析（${queues.length} 个队列）`, content, `<button class="btn btn-default" onclick="closeModal()">关闭</button>`);
}

// ---- 列设置弹窗 ----
function _qmShowColumnSettings() {
  const allCols = [
    { key: 'team', label: '团队' },
    { key: 'name', label: '队列名称' },
    { key: 'priority', label: '优先级' },
    { key: 'id', label: '队列ID' },
    { key: 'project', label: '项目' },
    { key: 'owner', label: 'Owner' },
    { key: 'requirement', label: '要求' },
    { key: 'dailyVolume', label: '日均进审量级' },
    { key: 'backlog', label: '积压量' },
    { key: 'effTarget', label: '人效要求' },
    { key: 'effActual', label: '实际达成' },
    { key: 'realTarget', label: '时效' },
    { key: 'effCoef', label: '队列系数' },
    { key: 'auditTags', label: '标签' },
    { key: 'inReviewTime', label: '进审时间' },
    { key: 'enableWarning', label: '是否预警' },
    { key: 'warningTime', label: '预警时间' },
    { key: 'remark', label: '备注' },
    { key: 'status', label: '状态' },
    { key: 'actions', label: '操作' },
  ];
  const content = `
    <div style="font-size:13px;margin-bottom:12px">选择要显示的列：</div>
    <div style="display:flex;flex-wrap:wrap;gap:10px">
      ${allCols.map(c => `<label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer"><input type="checkbox" value="${c.key}" ${_qmVisibleCols.includes(c.key) ? 'checked' : ''} class="qm-col-check"> ${c.label}</label>`).join('')}
    </div>
    <div style="margin-top:12px;font-size:11px;color:var(--text-quaternary)">注：队列名称和操作列建议保持勾选</div>
  `;
  openModal('列设置', content, `
    <button class="btn btn-default" onclick="_qmResetColumnDefaults()">恢复默认</button>
    <button class="btn btn-default" onclick="closeModal()">取消</button>
    <button class="btn btn-primary" onclick="_qmSaveColumnSettings()">保存</button>
  `);
}

const _qmDefaultCols = ['team','name','project','owner','requirement','dailyVolume','backlog','effTarget','effActual','realTarget','enableWarning','status','actions'];

function _qmSaveColumnSettings() {
  const checks = document.querySelectorAll('.qm-col-check');
  _qmVisibleCols = [...checks].filter(c => c.checked).map(c => c.value);
  localStorage.setItem('qm_visible_cols', JSON.stringify(_qmVisibleCols));
  closeModal();
  renderQueueManagePage(document.getElementById('contentArea'));
}

function _qmResetColumnDefaults() {
  _qmVisibleCols = [..._qmDefaultCols];
  localStorage.setItem('qm_visible_cols', JSON.stringify(_qmVisibleCols));
  closeModal();
  renderQueueManagePage(document.getElementById('contentArea'));
}

// ---- 抽屉快捷编辑 ----
function _qmQuickEdit(queueId, field) {
  const q = QUEUES_DATA.find(x => x.id === queueId);
  if (!q) return;
  const fieldLabels = { project: '项目', owner: 'Owner', requirement: '要求', realTarget: '时效', remark: '备注' };
  const label = fieldLabels[field] || field;
  let inputHtml;
  if (field === 'requirement') {
    const reqOpts = ['', '时清', '日清', '周三清空', '周清'].map(r => `<option value="${r}" ${q.requirement === r ? 'selected' : ''}>${r || '(清除)'}</option>`).join('');
    inputHtml = `<select class="form-control" id="qmQuickEditVal">${reqOpts}</select>`;
  } else {
    inputHtml = `<input class="form-control" id="qmQuickEditVal" value="${(q[field] || '').replace(/"/g, '&quot;')}" placeholder="输入${label}" autofocus>`;
  }
  const content = `<div style="font-size:14px;margin-bottom:12px">修改 <strong>${q.name}</strong> 的${label}：</div>${inputHtml}`;
  openModal(`快捷编辑 - ${label}`, content, `
<button class="btn btn-default" onclick="closeModal()">取消</button>
<button class="btn btn-primary" onclick="_qmExecQuickEdit(${queueId},'${field}')">保存</button>
`);
  setTimeout(() => { const el = document.getElementById('qmQuickEditVal'); if (el) el.focus(); }, 100);
}

function _qmExecQuickEdit(queueId, field) {
  const q = QUEUES_DATA.find(x => x.id === queueId);
  if (!q) return;
  const el = document.getElementById('qmQuickEditVal');
  if (!el) return;
  const oldValue = q[field];
  const newVal = el.value.trim();
  if (newVal === (oldValue || '')) { closeModal(); return; }
  q[field] = newVal;
  _qmPushUndo('inlineEdit', { id: queueId, field, oldValue }, `${q.name} ${field}: ${oldValue || '(空)'} → ${newVal || '(空)'}`);
  saveQueuesData();
  _saveQueueSnapshot(q);
  addWorkLog('队列管理', '快捷编辑', `${q.name} ${field}: ${oldValue || '(空)'} → ${newVal || '(空)'}`);
  closeModal();
  showToast(`${q.name} ${field} 已更新`, 'success');
  // 刷新抽屉
  _renderDrawerContent(q);
  filterQueueManageList();
}

// ---- 快捷键帮助 ----
function _qmShowShortcuts() {
  const content = `
    <div style="display:grid;grid-template-columns:100px 1fr;gap:6px 16px;font-size:13px;line-height:2">
      <kbd>/</kbd><span>聚焦搜索框</span>
      <kbd>N</kbd><span>新增队列</span>
      <kbd>↑ ↓</kbd><span>上下导航行</span>
      <kbd>Enter</kbd><span>打开详情</span>
      <kbd>E</kbd><span>编辑当前行</span>
      <kbd>Delete</kbd><span>删除选中</span>
      <kbd>Ctrl+A</kbd><span>全选</span>
      <kbd>Ctrl+Shift+E</kbd><span>导出配置</span>
      <kbd>Escape</kbd><span>关闭弹窗/抽屉</span>
      <kbd>J / →</kbd><span>抽屉内→下一个</span>
      <kbd>K / ←</kbd><span>抽屉内→上一个</span>
      <kbd>Shift+Click</kbd><span>连续多选</span>
    </div>
  `;
  openModal('快捷键一览', content, `<button class="btn btn-default" onclick="closeModal()">关闭</button>`);
}

// ---- 清理键盘事件（页面离开时） ----
function _qmCleanup() {
  document.removeEventListener('keydown', _qmKeyHandler);
  document.removeEventListener('click', _qmHideContextMenu);
}

// ---- 兼容旧接口 ----
function exportQueueConfig() { showExportConfigModal(); }
