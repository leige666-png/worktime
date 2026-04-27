// 工作日志 & 系统设置
// 当前日志视图模式：table' | 'timeline'
let _logViewMode = 'timeline';

function renderLogsPage(container) {
  // 收集所有操作人（去重）

  const operators = [...new Set(WORK_LOGS.map(l => l.operator).filter(Boolean))];
  // 收集所有操作类型（去重：
  const actions = [...new Set(WORK_LOGS.map(l => l.action).filter(Boolean))];

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">操作日志</div>
        <div class="page-subtitle">记录所有模块的关键操作，支持时间轴视图与撤销回滚</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <div class="log-view-toggle">
          <button class="log-view-btn ${_logViewMode === 'timeline' ? 'active' : ''}" onclick="switchLogView('timeline')">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="2" cy="4" r="1.5" fill="currentColor"/><line x1="4.5" y1="4" x2="13" y2="4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="2" cy="8" r="1.5" fill="currentColor"/><line x1="4.5" y1="8" x2="13" y2="8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="2" cy="12" r="1.5" fill="currentColor"/><line x1="4.5" y1="12" x2="10" y2="12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
            时间轴          </button>
          <button class="log-view-btn ${_logViewMode === 'table' ? 'active' : ''}" onclick="switchLogView('table')">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.3"/><line x1="1" y1="5" x2="13" y2="5" stroke="currentColor" stroke-width="1.3"/><line x1="5" y1="5" x2="5" y2="13" stroke="currentColor" stroke-width="1.3"/></svg>
            表格
          </button>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="clearAllLogs()" style="color:var(--text-tertiary);font-size:12px">
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style="margin-right:3px"><path d="M2 4h10M5 4V2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5V4M6 7v3M8 7v3M3 4l.7 7.3A1 1 0 0 0 4.7 12h4.6a1 1 0 0 0 1-.7L11 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          清空日志
        </button>
      </div>
    </div>

    <div class="filter-bar" style="flex-wrap:wrap;gap:8px">
      <div class="filter-item">
        <span class="filter-label">模块</span>
        <select class="filter-select" id="logModuleFilter" onchange="filterLogs()">
          <option value="all">全部</option>
          <option>考勤系统</option>
          <option>数据看板</option>
          <option>工时系统</option>
          <option>审批工作台</option>
          <option>人员管理</option>
          <option>系统通知</option>
          <option>系统管理</option>
        </select>
      </div>
      <div class="filter-item">
        <span class="filter-label">操作类型</span>
        <select class="filter-select" id="logActionFilter" onchange="filterLogs()">
          <option value="all">全部</option>
          ${actions.map(a => `<option>${a}</option>`).join('')}
        </select>
      </div>
      <div class="filter-item">
        <span class="filter-label">操作人</span>
        <select class="filter-select" id="logOperatorFilter" onchange="filterLogs()">
          <option value="all">全部</option>
          ${operators.map(o => `<option>${o}</option>`).join('')}
        </select>
      </div>
      <div class="filter-item">
        <span class="filter-label">日期</span>
        <input type="date" class="form-control" style="height:28px;width:130px" id="logDateFrom" onchange="filterLogs()">
        <span style="color:var(--text-tertiary);font-size:12px;margin:0 2px">—</span>
        <input type="date" class="form-control" style="height:28px;width:130px" id="logDateTo" onchange="filterLogs()">
      </div>
      <div class="filter-item" style="margin-left:auto">
        <input type="text" class="form-control" style="width:180px;height:28px" placeholder="搜索操作内容..." id="logSearch" oninput="filterLogs()">
      </div>
    </div>

    <div id="logStatsBar" class="log-stats-bar"></div>
    <div id="logContent"></div>
  `;

  _renderLogContent(WORK_LOGS);
}

// 切换视图模式
function switchLogView(mode) {
  _logViewMode = mode;
  // 更新按钮状态
  document.querySelectorAll('.log-view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.trim().includes(mode === 'timeline' ? '时间轴' : '表格'));
  });
  filterLogs();
}

// 渲染日志内容区（统计条+ 主体：
function _renderLogContent(logs) {
  const statsBar = document.getElementById('logStatsBar');
  const content  = document.getElementById('logContent');
  if (!statsBar || !content) return;

  // 统计

  const total    = logs.length;
  const today    = formatDate(new Date(), 'YYYY-MM-DD');
  const todayN   = logs.filter(l => l.time && l.time.startsWith(today)).length;
  const modules  = new Set(logs.map(l => l.module)).size;
  const undoable = logs.filter(l => _isUndoable(l)).length;

  statsBar.innerHTML = `
    <div class="log-stats-item">📋 共<span class="log-stats-num">${total}</span> 条记录</div>
    <div class="log-stats-item">📅 今日 <span class="log-stats-num">${todayN}</span> 条</div>
    <div class="log-stats-item">🗂️涉及 <span class="log-stats-num">${modules}</span> 个模块</div>
    ${undoable > 0 ? `<div class="log-stats-item" style="color:#FF7D00">↩<span class="log-stats-num" style="color:#FF7D00">${undoable}</span> 条可撤销</div>` : ''}
  `;

  if (total === 0) {
    content.innerHTML = '<div class="log-empty">📭 暂无操作日志</div>';
    return;
  }

  if (_logViewMode === 'timeline') {
    content.innerHTML = `<div class="card"><div class="card-body"><div class="log-timeline-wrap" id="logTimeline">${_renderTimelineHTML(logs)}</div></div></div>`;
  } else {
    content.innerHTML = `
      <div class="card">
        <div class="card-body" style="padding:0">
          <div class="table-wrap">
            <table class="table" id="logTable">
              <thead>
                <tr><th>时间</th><th>模块</th><th>操作类型</th><th>操作人</th><th>操作内容</th><th>备注/操作</th></tr>
              </thead>
              <tbody>${renderLogRows(logs)}</tbody>
            </table>
          </div>
        </div>
      </div>`;
  }
}

// 判断某条日志是否可撤销（排班修改类，且有快照）
function _isUndoable(log) {
  if (!log || !log.snapshot) return false;
  return log.module === '考勤系统' && log.action === '排班修改';
}

// 渲染时间轴HTML
function _renderTimelineHTML(logs) {
  if (!logs.length) return '<div class="log-empty">📭 暂无操作日志</div>';

  // 按日期分组
  const groups = {};
  logs.forEach(log => {
    const date = log.time ? log.time.split(' ')[0] : '未知日期';
    if (!groups[date]) groups[date] = [];
    groups[date].push(log);
  });

  const moduleColors = {
    '考勤系统':  '#3370FF',
    '数据看板':  '#00875A',
    '工时系统': '#FF7D00',
    '审批工作台':'#0FC6C2',
    '人员管理':  '#7B2FBE',
    '系统通知':  '#1664FF',
    '系统管理':  '#86909C',
  };
  const moduleTagClass = {
    '考勤系统':  'tag-blue',
    '数据看板':  'tag-green',
    '工时系统': 'tag-orange',
    '审批工作台':'tag-cyan',
    '人员管理':  'tag-purple',
    '系统通知':  'tag-blue',
    '系统管理':  'tag-gray',
  };

  const today = formatDate(new Date(), 'YYYY-MM-DD');
  const yesterday = formatDate(new Date(Date.now() - 86400000), 'YYYY-MM-DD');

  return Object.keys(groups).map(date => {
    const label = date === today ? `今天 ${date}` : date === yesterday ? `昨天 ${date}` : date;
    const items = groups[date].map(log => {
      const timeOnly = log.time ? log.time.split(' ')[1] || '' : '';
      const m = MEMBERS_DATA.find(x => x.name === log.operator || x.mis === log.operatorMis);
      const avatarUrl = m ? getAvatarUrl(m) : _uiAvatar(log.operator, 24);
      const fallback  = _uiAvatar(log.operator, 24);
      const tagCls    = moduleTagClass[log.module] || 'tag-gray';
      const canUndo   = _isUndoable(log);

      return `
        <div class="log-timeline-item">
          <span class="log-timeline-time">${timeOnly}</span>
          <img class="log-timeline-avatar" src="${avatarUrl}" onerror="this.onerror=null;this.src='${fallback}'" alt="${log.operator}">
          <div class="log-timeline-body">
            <div class="log-timeline-header">
              <span class="log-timeline-operator">${log.operator}</span>
              <span class="tag ${tagCls}" style="font-size:11px;padding:1px 7px">${log.module}</span>
              <span class="tag tag-gray" style="font-size:11px;padding:1px 7px">${log.action}</span>
            </div>
            <div class="log-timeline-target" title="${log.target}">${log.target}</div>
            ${log.remark ? `<div class="log-timeline-remark">💬 ${log.remark}</div>` : ''}
          </div>
          <div class="log-timeline-actions">
            ${canUndo ? `<button class="log-undo-btn" onclick="undoLogAction(${log.id})" title="撤销此操作">↩撤销</button>` : ''}
            <button class="btn btn-ghost btn-sm" style="font-size:11.5px;padding:2px 8px;height:22px" onclick="addLogRemark(${log.id})">
              ${log.remark ? '编辑备注' : '备注'}
            </button>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="log-timeline-date">${label}：${groups[date].length} 条）</div>
      <div class="log-timeline-list">${items}</div>`;
  }).join('');
}

function renderLogRows(logs) {
  const moduleColors = {
    '考勤系统': 'tag-blue',
    '数据看板': 'tag-green',
    '工时系统': 'tag-orange',
    '审批工作台': 'tag-cyan',
    '系统管理': 'tag-gray',
  };
  return logs.map(log => {
    // 构建导入明细展开面板（仅文档导入类型且有 detail 时）

    let detailRow = '';
    if (log.action === '文档导入' && log.detail) {
      const d = log.detail;
      const memberRows = (d.members || []).map(m =>
        `<tr><td>${m.name}</td><td style="text-align:center">${m.changedDays > 0 ? `<span style="color:#3370FF;font-weight:500">${m.changedDays} 天</span>` : '<span style="color:var(--text-tertiary)">无变更</span>'}</td></tr>`
      ).join('');
      const errorRows = (d.errors || []).map(e =>
        `<li style="color:#CF1322;font-size:12px">${e}</li>`
      ).join('');
      detailRow = `
        <tr id="log-detail-${log.id}" style="display:none">
          <td colspan="6" style="padding:0 16px 12px 40px;background:var(--bg-secondary)">
            <div class="log-detail-panel">
              <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:8px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                <span>${d.year}年${d.month}月排班导入· 成功 <strong>${d.successCount}</strong> 人${d.errorCount ? ` · <span style="color:#CF1322">${d.errorCount} 行有误</span>` : ''}</span>
                ${d.crossMonth ? `<span style="display:inline-flex;align-items:center;gap:3px;padding:1px 7px;border-radius:10px;background:#FFF7E6;color:#D46B08;font-size:11px;font-weight:500;border:1px solid #FFD591">↩跨月补录</span>` : ''}
                <button class="btn btn-ghost btn-sm" style="margin-left:auto;font-size:11.5px;padding:2px 8px;height:22px;line-height:1"
                  onclick="event.stopPropagation();_reopenImportWithDate(${d.year},${d.month})">
                  <svg width="11" height="11" viewBox="0 0 14 14" fill="none" style="margin-right:3px;vertical-align:-1px"><path d="M2 7a5 5 0 1 0 1.5-3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 3.5V7h3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  重新导入
                </button>
              </div>
              ${memberRows ? `
              <table style="width:100%;border-collapse:collapse;font-size:12.5px">
                <thead><tr style="color:var(--text-tertiary)"><th style="text-align:left;padding:3px 8px 3px 0;font-weight:500">姓名</th><th style="text-align:center;font-weight:500">变更天数</th></tr></thead>
                <tbody>${memberRows}</tbody>
              </table>` : ''}
              ${errorRows ? `<ul style="margin:8px 0 0;padding-left:16px">${errorRows}</ul>` : ''}
            </div>
          </td>
        </tr>`;
    }
    const hasDetail = log.action === '文档导入' && log.detail;
    return `
    <tr class="${hasDetail ? 'log-row-expandable' : ''}" ${hasDetail ? `onclick="toggleLogDetail(${log.id})" style="cursor:pointer"` : ''}>
      <td style="white-space:nowrap;color:var(--text-tertiary)">${log.time}</td>
      <td><span class="tag ${moduleColors[log.module] || 'tag-gray'}">${log.module}</span></td>
      <td>
        ${log.action}
        ${hasDetail ? `<span id="log-arrow-${log.id}" style="display:inline-block;margin-left:4px;font-size:10px;transition:transform 0.2s;color:var(--text-tertiary)">▶</span>` : ''}
      </td>
      <td>
        <div style="display:flex;align-items:center;gap:6px">
          ${(() => {
            const m = MEMBERS_DATA.find(x => x.name === log.operator || x.mis === log.operatorMis);
            const url = m ? getAvatarUrl(m) : _uiAvatar(log.operator, 20);
            const fallback = _uiAvatar(log.operator, 20);
            return `<img src="${url}" style="width:20px;height:20px;border-radius:50%;object-fit:cover;flex-shrink:0" onerror="this.onerror=null;this.src='${fallback}'">`;
          })()}
          ${log.operator}
        </div>
      </td>
      <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${log.target}">${log.target}</td>
      <td>
        ${log.remark ? log.remark : `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();addLogRemark(${log.id})">添加备注</button>`}
      </td>
    </tr>
    ${detailRow}`;
  }).join('');
}

function toggleLogDetail(id) {
  const row = document.getElementById(`log-detail-${id}`);
  const arrow = document.getElementById(`log-arrow-${id}`);
  if (!row) return;
  const isOpen = row.style.display !== 'none';
  row.style.display = isOpen ? 'none' : 'table-row';
  if (arrow) arrow.style.transform = isOpen ? '' : 'rotate(90deg)';
}

function filterLogs() {
  const module   = document.getElementById('logModuleFilter')?.value   || 'all';
  const action   = document.getElementById('logActionFilter')?.value   || 'all';
  const operator = document.getElementById('logOperatorFilter')?.value || 'all';
  const dateFrom = document.getElementById('logDateFrom')?.value       || '';
  const dateTo   = document.getElementById('logDateTo')?.value         || '';
  const search   = document.getElementById('logSearch')?.value         || '';

  let filtered = WORK_LOGS;
  if (module   !== 'all') filtered = filtered.filter(l => l.module   === module);
  if (action   !== 'all') filtered = filtered.filter(l => l.action   === action);
  if (operator !== 'all') filtered = filtered.filter(l => l.operator === operator);
  if (dateFrom) filtered = filtered.filter(l => l.time && l.time.split(' ')[0] >= dateFrom);
  if (dateTo)   filtered = filtered.filter(l => l.time && l.time.split(' ')[0] <= dateTo);
  if (search)   filtered = filtered.filter(l =>
    (l.target   || '').includes(search) ||
    (l.operator || '').includes(search) ||
    (l.action   || '').includes(search)
  );

  _renderLogContent(filtered);
}

function addLogRemark(id) {
  const content = `
    <div class="form-group">
      <label class="form-label">备注内容</label>
      <textarea class="form-control" id="logRemarkText" rows="3" placeholder="请输入备注内容（不可删除原日志）"></textarea>
    </div>
  `;
  openModal('添加备注', content, `
    <button class="btn btn-default" onclick="closeModal()">取消</button>
    <button class="btn btn-primary" onclick="saveLogRemark(${id})">保存</button>
  `);
}

function saveLogRemark(id) {
  const text = document.getElementById('logRemarkText')?.value;
  if (!text) { showToast('请输入备注内容', 'warning'); return; }
  const log = WORK_LOGS.find(l => l.id === id);
  if (log) log.remark = text;
  saveWorkLogs();
  closeModal();
  showToast('备注已保存', 'success');
  // 刷新内容区（保留筛选状态）
  filterLogs();
}

// 撤销排班修改操作（从快照恢复）
function undoLogAction(id) {
  const log = WORK_LOGS.find(l => l.id === id);
  if (!log || !log.snapshot) { showToast('该操作无法撤销（无快照数据）', 'warning'); return; }

  openModal('确认撤销', `
    <div style="padding:4px 0">
      <p style="margin:0 0 12px;color:var(--text-primary)">确定要撤销以下操作吗？</p>
      <div style="background:var(--bg-secondary);border-radius:6px;padding:10px 14px;font-size:13px;color:var(--text-secondary)">
        <div><strong>操作：</strong>${log.action}</div>
        <div style="margin-top:4px"><strong>内容：</strong>${log.target}</div>
        <div style="margin-top:4px"><strong>时间：</strong>${log.time}</div>
      </div>
      <p style="margin:12px 0 0;font-size:12px;color:#CF1322">⚠️ 撤销后将恢复到操作前的排班状态，此操作不可逆。</p>
    </div>
  `, `
    <button class="btn btn-default" onclick="closeModal()">取消</button>
    <button class="btn btn-primary" style="background:#FF7D00;border-color:#FF7D00" onclick="_doUndoLog(${id})">确认撤销</button>
  `);
}

function _doUndoLog(id) {
  const log = WORK_LOGS.find(l => l.id === id);
  if (!log || !log.snapshot) return;

  // 恢复快照数据到SCHEDULE_DATA
  const snap = log.snapshot;
  if (snap.year && snap.month && snap.data) {
    // 找到对应月份的排班数据并恢复

    const key = `glxt_schedule_${snap.year}_${snap.month}`;
    try {
      localStorage.setItem(key, JSON.stringify(snap.data));
      // 如果当前视图就是该月，同步更新内存中的SCHEDULE_DATA
      if (typeof scheduleYear !== 'undefined' && scheduleYear === snap.year &&
          typeof scheduleMonth !== 'undefined' && scheduleMonth === snap.month) {
        Object.keys(SCHEDULE_DATA).forEach(k => delete SCHEDULE_DATA[k]);
        Object.assign(SCHEDULE_DATA, snap.data);
      }
      if (typeof _clearAttCache === 'function') _clearAttCache();
    } catch(e) {
      showToast('撤销失败：数据写入错误', 'error');
      closeModal();
      return;
    }
  }

  // 标记该日志为已撤销
  log.undone = true;
  log.remark = (log.remark ? log.remark + ' | ' : '') + `[已撤销 ${formatDate(new Date(), 'YYYY-MM-DD HH:mm')}]`;
  delete log.snapshot; // 移除快照，防止重复撤销

  // 写入撤销日志
  addWorkLog('考勤系统', '撤销操作', `撤销：${log.target}`);

  saveWorkLogs();
  closeModal();
  showToast('已成功撤销操作，排班数据已恢复', 'success');

  // 如果当前在排班页，刷新排班视图
  if (typeof currentPage !== 'undefined' && currentPage === 'schedule') {
    if (typeof renderSchedulePage === 'function') {
      renderSchedulePage(document.getElementById('contentArea'));
    }
  } else {
    filterLogs();
  }
}

// 清空所有日志
function clearAllLogs() {
  openModal('清空日志', `
    <div style="padding:4px 0">
      <p style="margin:0 0 8px;color:var(--text-primary)">确定要清空所有操作日志吗？</p>
      <p style="margin:0;font-size:12px;color:#CF1322">⚠️ 此操作不可恢复，所有日志记录将被永久删除。</p>
    </div>
  `, `
    <button class="btn btn-default" onclick="closeModal()">取消</button>
    <button class="btn btn-primary" style="background:#CF1322;border-color:#CF1322" onclick="_doCleanLogs()">确认清空</button>
  `);
}

function _doCleanLogs() {
  WORK_LOGS.length = 0;
  saveWorkLogs();
  closeModal();
  showToast('日志已清空', 'success');
  renderLogsPage(document.getElementById('contentArea'));
}

// 系统设置页
function renderSettingsPage(container) {
  container.innerHTML = `
    <div class="page-header">
      <div class="page-title">系统设置</div>
      <div class="page-subtitle">配置系统参数、权限与通知规则</div>
    </div>

    <div style="display:grid;grid-template-columns:200px 1fr;gap:16px">
      <!-- 左侧菜单 -->
      <div class="card" style="height:fit-content">
        <div class="card-body" style="padding:8px 0">
          ${[
            { key: 'basic', label: '基础配置', icon: '⚙️' },
            { key: 'permission', label: '权限管理', icon: '🔑' },
            { key: 'notify', label: '通知配置', icon: '🔔' },
            { key: 'integration', label: '系统集成', icon: '🔗' },
            { key: 'versions', label: '版本管理', icon: '📋' },
          ].map((item, i) => `
            <div onclick="switchSettingsTab('${item.key}', this)" style="display:flex;align-items:center;gap:8px;padding:8px 16px;cursor:pointer;border-radius:4px;transition:background 0.2s;${i===0?'background:var(--primary-light);color:var(--primary);font-weight:500':''}">
              <span>${item.icon}</span>
              <span style="font-size:13px">${item.label}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- 右侧内容 -->
      <div id="settingsContent">
        ${renderSettingsBasic()}
      </div>
    </div>
  `;
}

function switchSettingsTab(key, el) {
  document.querySelectorAll('.card .card-body > div[onclick]').forEach(item => {
    item.style.background = '';
    item.style.color = '';
    item.style.fontWeight = '';
  });
  el.style.background = 'var(--primary-light)';
  el.style.color = 'var(--primary)';
  el.style.fontWeight = '500';

  const content = {
    basic: renderSettingsBasic,
    permission: renderSettingsPermission,
    notify: renderSettingsNotify,
    integration: renderSettingsIntegration,
    versions: renderSettingsVersions,
  };
  const fn = content[key];
  if (fn) document.getElementById('settingsContent').innerHTML = fn();
}

function renderSettingsBasic() {
  return `
    <div class="card">
      <div class="card-header"><span class="card-title">基础配置</span></div>
      <div class="card-body">
        <div class="form-group">
          <label class="form-label">系统名称</label>
          <input type="text" class="form-control" value="审核管理系统">
        </div>
        <div class="form-group">
          <label class="form-label">工作日设置</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${['周一','周二','周三','周四','周五','周六','周日'].map((d, i) => `
              <label class="checkbox-wrap">
                <input type="checkbox" ${i < 5 ? 'checked' : ''}>
                <span class="checkbox-label">${d}</span>
              </label>
            `).join('')}
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">归档周期（天）</label>
          <input type="number" class="form-control" value="30" style="width:120px">
        </div>
        <div style="display:flex;justify-content:flex-end">
          <button class="btn btn-primary" onclick="showToast('设置已保存','success')">保存</button>
        </div>
      </div>
    </div>
  `;
}

// r85: renderSettingsThreshold 已删除，阈值统一由排班日历规则验证管理

function renderSettingsPermission() {
  const isOwner = CURRENT_USER.role === 'admin';
  return `
    <div style="display:flex;flex-direction:column;gap:16px">

      <!-- 权限等级说明卡片 -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">权限等级说明</span>
        </div>
        <div class="card-body" style="padding:12px 16px">
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
            ${Object.entries(ROLE_PERMISSIONS).map(([key, rp]) => `
              <div style="border:1px solid var(--border);border-radius:8px;padding:12px;background:${rp.badgeBg}20;position:relative;overflow:hidden">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
                  <span style="display:inline-flex;align-items:center;padding:2px 10px;border-radius:10px;font-size:12px;font-weight:600;background:${rp.badgeBg};color:${rp.badgeColor}">${rp.label}</span>
                  ${rp.fixed ? '<span style="font-size:10px;color:#7B2FBE;background:#F3E8FF;padding:1px 6px;border-radius:8px">固定</span>' : ''}
                </div>
                <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:8px;line-height:1.5">${rp.desc}</div>
                <div style="display:flex;flex-wrap:wrap;gap:3px">
                  ${rp.permissions.map(p => `<span style="font-size:10px;padding:1px 5px;background:rgba(0,0,0,0.04);border-radius:4px;color:var(--text-secondary)">${p}</span>`).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- 人员权限列表 -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">人员权限列表</span>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:12px;color:var(--text-tertiary)">
              当前身份：<span style="color:#7B2FBE;font-weight:600">${ROLE_PERMISSIONS[CURRENT_USER.role]?.label || '审核员'}${CURRENT_USER.mis === AUTH_PERMANENT_OWNER ? '（永久）' : ''}</span>
            </span>
            <select class="filter-select" id="permRoleFilter" onchange="filterPermTable()" style="height:28px;font-size:12px">
              <option value="all">全部角色</option>
              ${Object.entries(ROLES).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="card-body" style="padding:0">
          <div class="table-wrap">
            <table class="table" id="permTable">
              <thead>
                <tr>
                  <th style="width:180px">人员</th>
                  <th style="width:140px">MIS号</th>
                  <th style="width:100px">团队</th>
                  <th style="width:120px">当前权限</th>
                  <th>可操作功能</th>
                  <th style="width:120px">操作</th>
                </tr>
              </thead>
              <tbody id="permTableBody">
                ${renderPermRows(MEMBERS_DATA)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderPermRows(members) {
  return members.map(m => {
    const rp = ROLE_PERMISSIONS[m.role] || ROLE_PERMISSIONS.reviewer;
    const isCurrentUser = m.mis === CURRENT_USER.mis;
    const canEdit = CURRENT_USER.role === 'admin' && !isCurrentUser && m.mis !== AUTH_PERMANENT_OWNER;
    return `<tr id="perm-row-${m.id}">
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          ${avatarImg(m, '28px')}
          <div>
            <div style="font-size:13px;font-weight:500">${m.name}${isCurrentUser ? ' <span style="font-size:10px;color:#7B2FBE;background:#F3E8FF;padding:1px 5px;border-radius:6px">我</span>' : ''}</div>
            <div style="font-size:11px;color:var(--text-tertiary)">${m.team}</div>
          </div>
        </div>
      </td>
      <td style="color:var(--text-tertiary);font-size:12px">${m.mis}</td>
      <td><span class="tag tag-gray" style="font-size:11px">${m.team}</span></td>
      <td>
        <span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:10px;font-size:12px;font-weight:600;background:${rp.badgeBg};color:${rp.badgeColor}">
          ${rp.label}
        </span>
      </td>
      <td>
        <div style="display:flex;flex-wrap:wrap;gap:3px">
          ${rp.permissions.map(p => `<span style="font-size:10px;padding:1px 5px;background:var(--bg);border-radius:4px;color:var(--text-secondary);border:1px solid var(--border-light)">${p}</span>`).join('')}
        </div>
      </td>
      <td>
        ${m.mis === AUTH_PERMANENT_OWNER
          ? `<span style="font-size:12px;color:#7B2FBE;font-weight:500">永久管理员<br><span style="font-size:10px;color:var(--text-tertiary);font-weight:400">不可变更</span></span>`
          : canEdit
            ? `<button class="btn btn-default btn-sm" onclick="showChangeRoleModal(${m.id})">变更权限</button>`
            : `<span style="font-size:12px;color:var(--text-tertiary)">—</span>`
        }
      </td>
    </tr>`;
  }).join('');
}

function filterPermTable() {
  const role = document.getElementById('permRoleFilter')?.value || 'all';
  const filtered = role === 'all' ? MEMBERS_DATA : MEMBERS_DATA.filter(m => m.role === role);
  const tbody = document.getElementById('permTableBody');
  if (tbody) tbody.innerHTML = renderPermRows(filtered);
}

function showChangeRoleModal(memberId) {
  const m = getMemberById(memberId);
  if (!m) return;
  const currentRp = ROLE_PERMISSIONS[m.role] || ROLE_PERMISSIONS.reviewer;

  // r134: 可分配角色（所有 3 级角色均可分配）
  const assignableRoles = Object.entries(ROLE_PERMISSIONS);

  const content = `
    <div style="margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:10px;padding:12px;background:var(--bg);border-radius:8px">
        ${avatarImg(m, '36px')}
        <div>
          <div style="font-size:14px;font-weight:600">${m.name}</div>
          <div style="font-size:12px;color:var(--text-tertiary)">${m.mis} · ${m.team}</div>
        </div>
        <div style="margin-left:auto">
          <span style="display:inline-flex;padding:3px 10px;border-radius:10px;font-size:12px;font-weight:600;background:${currentRp.badgeBg};color:${currentRp.badgeColor}">${currentRp.label}</span>
        </div>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label required">变更为</label>
      <div style="display:flex;flex-direction:column;gap:8px" id="roleOptions">
        ${assignableRoles.map(([k, rp]) => `
          <label style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:2px solid ${m.role===k?'var(--primary)':'var(--border)'};border-radius:8px;cursor:pointer;transition:all 0.2s" onclick="selectRoleOption(this,'${k}')">
            <input type="radio" name="newRole" value="${k}" ${m.role===k?'checked':''} style="margin-top:2px;flex-shrink:0">
            <div>
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
                <span style="display:inline-flex;padding:1px 8px;border-radius:8px;font-size:12px;font-weight:600;background:${rp.badgeBg};color:${rp.badgeColor}">${rp.label}</span>
              </div>
              <div style="font-size:11px;color:var(--text-tertiary)">${rp.desc}</div>
              <div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:5px">
                ${rp.permissions.map(p => `<span style="font-size:10px;padding:1px 5px;background:var(--bg);border-radius:4px;color:var(--text-secondary)">${p}</span>`).join('')}
              </div>
            </div>
          </label>
        `).join('')}
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">变更原因</label>
      <textarea class="form-control" id="roleChangeReason" rows="2" placeholder="请输入变更原因（可选）"></textarea>
    </div>
  `;

  openModal(`变更权限 —${m.name}`, content, `
    <button class="btn btn-default" onclick="closeModal()">取消</button>
    <button class="btn btn-primary" onclick="confirmChangeRole(${memberId})">确认变更</button>
  `);
}

function selectRoleOption(el, roleKey) {
  document.querySelectorAll('#roleOptions label').forEach(l => l.style.borderColor = 'var(--border)');
  el.style.borderColor = 'var(--primary)';
  el.querySelector('input').checked = true;
}

function confirmChangeRole(memberId) {
  const m = getMemberById(memberId);
  if (!m) return;
  const selected = document.querySelector('input[name="newRole"]:checked');
  if (!selected) { showToast('请选择目标权限', 'warning'); return; }
  const newRole = selected.value;
  if (newRole === m.role) { showToast('权限未发生变化', 'info'); closeModal(); return; }

  const oldLabel = ROLE_PERMISSIONS[m.role]?.label || m.role;
  const newLabel = ROLE_PERMISSIONS[newRole]?.label || newRole;
  m.role = newRole;
  // r134: 角色变更时同步 managedTeams
  if (newRole === 'leader' && !m.managedTeams) m.managedTeams = [m.team].filter(Boolean);
  if (newRole === 'reviewer') m.managedTeams = [];
  saveMembersData();

  // 记录日志
  WORK_LOGS.unshift({
    id: Date.now(), time: new Date().toLocaleString('zh-CN'),
    module: '系统管理', action: '权限变更',
    operator: CURRENT_USER.name,
    target: `将${m.name}（${m.mis}）的权限从「${oldLabel}」变更为「${newLabel}」`,
    remark: document.getElementById('roleChangeReason')?.value || '',
  });

  closeModal();
  showToast(`已将 ${m.name} 的权限变更为「${newLabel}」`, 'success');

  // 刷新权限表格
  const tbody = document.getElementById('permTableBody');
  if (tbody) tbody.innerHTML = renderPermRows(MEMBERS_DATA);
}

function renderSettingsNotify() {
  return `
    <div class="card">
      <div class="card-header"><span class="card-title">通知配置</span></div>
      <div class="card-body">
        <div class="form-group">
          <label class="form-label">大象群配置</label>
          <input type="text" class="form-control" placeholder="请输入大象群ID">
        </div>
        <div class="form-group">
          <label class="form-label">定时推送时间</label>
          <input type="time" class="form-control" value="09:00" style="width:120px">
        </div>
        <div class="form-group">
          <label class="form-label">通知开关</label>
          <div style="display:flex;flex-direction:column;gap:10px">
            ${[
              '审批结果通知', '异常预警通知', '定时推送', '阈值告警'
            ].map(item => `
              <div style="display:flex;align-items:center;justify-content:space-between">
                <span style="font-size:13px">${item}</span>
                <label class="switch"><input type="checkbox" checked><span class="switch-slider"></span></label>
              </div>
            `).join('')}
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end">
          <button class="btn btn-primary" onclick="showToast('通知配置已保存','success')">保存</button>
        </div>
      </div>
    </div>
  `;
}

function renderSettingsIntegration() {
  return `
    <div class="card">
      <div class="card-header"><span class="card-title">系统集成</span></div>
      <div class="card-body">
        <div style="display:flex;flex-direction:column;gap:12px">
          ${[
            { name: '大象消息', desc: '发送审批通知、预警消息至大象', status: true, icon: '🐘' },
            { name: 'BI看板', desc: '关联 bi.sankuai.com 数据看板', status: true, icon: '📊' },
            { name: '审核后台', desc: '关联 dpaudit.sankuai.com 审核系统', status: true, icon: '🔍' },
            { name: 'HR系统', desc: '工损证明同步至HR系统', status: false, icon: '👥' },
          ].map(item => `
            <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--bg);border-radius:8px">
              <span style="font-size:24px">${item.icon}</span>
              <div style="flex:1">
                <div style="font-size:13px;font-weight:600">${item.name}</div>
                <div style="font-size:12px;color:var(--text-tertiary)">${item.desc}</div>
              </div>
              <label class="switch"><input type="checkbox" ${item.status?'checked':''}><span class="switch-slider"></span></label>
              <span class="tag ${item.status?'tag-green':'tag-gray'}">${item.status?'已连接':'未连接'}</span>
            </div>
          `).join('')}
        </div>
        <div style="margin-top:16px;display:flex;justify-content:flex-end">
          <button class="btn btn-primary" onclick="showToast('集成配置已保存','success')">保存</button>
        </div>
      </div>
    </div>
  `;
}

// ===== 版本更新管理模块 =====
// 独立 localStorage key，不受其他模块影响
const GLXT_VER_LOG_KEY = 'GLXT_VERSION_LOG';

function _loadVersionLog() {
  try { return JSON.parse(localStorage.getItem(GLXT_VER_LOG_KEY)) || []; }
  catch(e) { return []; }
}
function _saveVersionLog(logs) {
  localStorage.setItem(GLXT_VER_LOG_KEY, JSON.stringify(logs));
}

// 所有历史版本记录（种子 + 后续每次更新都在此追加）
const _VERSION_SEED = [
  { id: 'r125', version: '20260423r125', date: '2026-04-23 14:00', type: 'optimize', content: '列对齐优化：人员姓名左对齐，MIS号/团队居中对齐', starred: false, backup: null },
  { id: 'r126', version: '20260423r126', date: '2026-04-23 15:30', type: 'optimize', content: '移除实际出勤列环比三角符号（▲/▼），清理 prevS1/prevWork/momArrow 相关代码和 CSS', starred: false, backup: null },
  { id: 'r127', version: '20260423r127', date: '2026-04-23 17:00', type: 'optimize', content: '考勤看板 UI 全面优化：表头深蓝渐变重新设计、第一列加深加粗、字体颜色统一调整（出勤率绿色、三薪金色、其余纯黑）', starred: true, backup: null },
  { id: 'r128', version: '20260423r128', date: '2026-04-23 17:10', type: 'fix', content: '修复表头"人员姓名"sticky 列背景色为白色的 bug，内联 style 改为渐变色', starred: false, backup: null },
  { id: 'r129', version: '20260423r129', date: '2026-04-23 17:30', type: 'feature', content: '新增版本更新管理模块：支持版本记录增删查、类型筛选、关键字搜索、星标标记、数据备份快照下载，独立 localStorage 存储永久保留', starred: true, backup: null },
  { id: 'r130', version: '20260423r130', date: '2026-04-23 18:30', type: 'optimize', content: '全部团队视图全面优化：表头"小组"白色背景改为深蓝渐变、数据列与人员看板完全对齐（补全当月天数/应出勤/出勤率/标准工时/出勤工时/考勤确认）、团队名称改用完整名称（如"高曝团队"）、删除团队名前彩色首字母方块', starred: false, backup: null },
  { id: 'r131', version: '20260423r131', date: '2026-04-23 19:00', type: 'optimize', content: '移除全系统迟到/早退相关功能：删除人员姓名后红点异常标记、移除个人中心迟到/早退统计卡片、移除排班页迟到次数统计卡和表格列、清理数据源中lateTimes/earlyTimes字段、移除通知设置中迟到/早退通知开关', starred: false, backup: null },
  { id: 'r132', version: '20260423r132', date: '2026-04-23 20:00', type: 'feature', content: '新增组别管理功能：管理员可自定义创建/编辑/删除组别（含颜色标记）；人员卡片组别改为管理员通过下拉框选择（不再硬编码自团队名）；新增人员和批量导入支持指定组别；修复管理层排班空卡片问题（system_owner "仅看自己"时显示全部团队）', starred: true, backup: null },
  { id: 'r133', version: '20260423r133', date: '2026-04-23 21:00', type: 'optimize', content: '团队与组别统一：移除冗余的 group 字段，"组别管理"改为"团队管理"（管理员可增删改团队，名称统一为完整团队名如"高曝团队"）；人员编辑/新增/批量导入中仅保留"所属团队"下拉框；自动迁移旧版 CUSTOM_GROUPS 数据；排班日历 TEAMS 数组与 CUSTOM_TEAMS 动态同步', starred: false, backup: null },
  { id: 'r134', version: '20260423r134', date: '2026-04-23 22:00', type: 'feature', content: '权限体系重构：4级角色（system_owner/leader/admin/reviewer）精简为3级（admin/leader/reviewer）；艾俊磊为永久管理员不可撤销；新增 excludeFromSchedule 字段解耦排班与角色；新增 managedTeams 字段支持小组长团队范围校验；权限管理面板动态显示每人权限范围；移除登录角色选择（角色由数据决定）；旧数据自动迁移', starred: true, backup: null },
  { id: 'r135', version: '20260423r135', date: '2026-04-23 23:00', type: 'feature', content: '考勤通知卡片全面重设计：月份选择器、一键发送+确认弹窗（系统+大象双通道勾选）、确认/异议机制、堆叠进度条、团队分组展示、详情弹窗（Tab筛选+团队分组+异议原因）', starred: true, backup: null },
  { id: 'r136', version: '20260423r136', date: '2026-04-23 23:30', type: 'feature', content: '考勤通知卡片双栏布局+截图功能：左侧确认率大数字+进度条+操作按钮，右侧2×2团队网格，Canvas截图生成高清PNG', starred: false, backup: null },
  { id: 'r137', version: '20260423r137', date: '2026-04-23 23:45', type: 'optimize', content: '考勤通知卡片瘦身：删除截图按钮精简为3按钮，团队网格限4个+超出下拉弹窗', starred: false, backup: null },
  { id: 'r138', version: '20260424r138', date: '2026-04-24 00:00', type: 'optimize', content: '考勤通知卡片右侧改纵向紧凑列表，彻底解决下拉弹窗被overflow:hidden裁剪问题', starred: false, backup: null },
  { id: 'r139', version: '20260424r139', date: '2026-04-24 00:30', type: 'fix', content: '恢复2×2网格+Portal模式修复弹窗：弹窗DOM挂载到body，position:fixed不受父容器裁剪', starred: false, backup: null },
  { id: 'r140', version: '20260424r140', date: '2026-04-24 01:00', type: 'optimize', content: '考勤通知卡片右侧复用排班数据sc5展现形式+卡片高度对齐134px', starred: false, backup: null },
  { id: 'r141', version: '20260424r141', date: '2026-04-24 02:00', type: 'feature', content: '大象消息桥接机制（已被r142替代）：通过send_daxiang.ps1+catdesk daxiang send发送，但消息未实际送达', starred: false, backup: null },
  { id: 'r142', version: '20260424r142', date: '2026-04-24 03:00', type: 'feature', content: '大象消息发送全面重构：废弃桥接脚本，复用NoCode的Supabase Edge Function nocode-pushmsg直接HTTP调用；关键发现misList必须传mis号而非数字daxiangId；Node.js+浏览器双重E2E验证通过', starred: true, backup: null },
  { id: 'r143', version: '20260424r143', date: '2026-04-24 11:30', type: 'feature', content: '考勤通知详情弹窗全面增强：每人行细分显示确认状态、首次发送时间、是否已读；新增3种重发按钮（大象/系统/系统+大象）；催改为加急（系统+大象双通道通知）；数据结构扩展firstSentAt/daxiangSentAt/lastUrgedAt字段', starred: true, backup: null },
{ id: 'r144', version: '20260424r144', date: '2026-04-24 14:00', type: 'optimize', content: '考勤通知详情弹窗UI优化：去掉头像圆圈改为左侧状态色条（绿=已确认/红=有异议/灰=待确认）；散落标签合并为单行状态文本（已确认·时间·已读）；纯emoji按钮改为胶囊式icon+标签（🐘大象/📢系统/📤双发/🚨加急）；底部全部加急按钮改为橙红渐变', starred: false, backup: null },
{ id: 'r145', version: '20260424r145', date: '2026-04-24 16:00', type: 'feature', content: '考勤通知模板系统：4种模板（大象确认/大象加急/系统确认/系统加急）支持管理员自定义编辑+占位符（{name}/{month}/{card}）；每条通知自动附带文字版考勤卡片（出勤/请假/班次/工时/出勤率）；系统公告内嵌确认无误/有异议交互按钮；所有发送/加急/重发函数统一接入模板引擎', starred: true, backup: null },
{ id: 'r146', version: '20260424r146', date: '2026-04-24 18:00', type: 'optimize', content: '考勤卡片推送优化：大象渠道新增 Markdown 格式考勤卡片（_attBuildCardMarkdown），使用 emoji 分区 + 粗体标题 + 结构化布局，视觉体验接近卡片消息；增加请假明细分类显示；出勤率颜色指示（🟢≥95% / 🟡≥80% / 🔴<80%）；优化默认模板文案，添加系统链接和明确的「确认无误/有异议」操作指引；模板渲染器支持按渠道自动选择卡片格式', starred: false, backup: null },
{ id: 'r147', version: '20260424r147', date: '2026-04-24 20:00', type: 'optimize', content: '考勤通知内容全面优化：大象与系统卡片内容覆盖看板全部数据列（当月天数、应出勤、实际出勤、出勤率、休息、请假明细、班次、标准工时、出勤工时、三薪、B班天数、B班补贴）；数据采用两两并列排版（｜分隔符）；班次仅展示该人员有出勤记录的（过滤0天班次）；工时计算使用管理员设定的应出勤(ondutyTotal)×8h', starred: false, backup: null },
{ id: 'r148', version: '20260424r148', date: '2026-04-24 21:00', type: 'optimize', content: '考勤卡片层级优化：大象与系统通知采用一二级序号排列（一/二/三/四 + 1./2./3.），子项内容缩进在标题下方而非并列，视觉层次更清晰；出勤情况5项、班次统计、工时数据2项、补贴与三薪3项分区展示', starred: false, backup: null },
{ id: 'r149', version: '20260424r149', date: '2026-04-24 22:00', type: 'optimize', content: '考勤卡片表格化：大象与系统通知改为文本表格布局，出勤情况/班次统计/工时数据/补贴三薪 四大分区作为左侧表头，数据行在右侧对应展示；底部出勤率独占整行；整体结构更接近数据看板的表格视觉效果', starred: false, backup: null },
{ id: 'r150', version: '20260424r150', date: '2026-04-24 23:00', type: 'optimize', content: '考勤卡片视觉重构：彻底移除 Unicode 制表符（┌├│└─），改用 emoji 分区标记+竖线分隔的自然排版，适配大象非等宽字体；系统公告修复换行渲染（_renderAnnText 增加 \\n→<br> 转换）并使用 **加粗** 语法高亮关键数据；大象卡片改为干净纯文本，任何字体下都整齐可读', starred: true, backup: null },
{ id: 'r151', version: '20260424r151', date: '2026-04-24 23:30', type: 'fix', content: '修复大象消息换行失效：大象文本消息吞掉单个 \\n，仅 \\n\\n 能产生可见换行；大象卡片改用 parts.join(\\n\\n) 拼接，每个分区压缩为单行（管道符分隔），确保各区块间有段落间距；系统卡片不受影响（_renderAnnText 已做 \\n→<br> 转换）', starred: true, backup: null },
{ id: 'r152', version: '20260424r152', date: '2026-04-24 23:45', type: 'optimize', content: '考勤卡片出勤情况精简：移除「当月天数」字段（冗余信息），出勤情况区4项数据改为两两对齐排列（应出勤|实际出勤、休息|请假），大象与系统卡片同步调整', starred: false, backup: null },
{ id: 'r153', version: '20260424r153', date: '2026-04-24 24:00', type: 'feature', content: '五项优化：①详情弹窗增加异议处理功能（标记已处理+驳回异议+处理备注）；②修复通知卡片右侧下拉看板不生效（_notifyTeamMap作用域提升至模块级）；③删除4张统计卡片的设定目标值功能（移除_attGetTargets/_attGoalBadge/_attShowTargetPrompt及上下文菜单项和localStorage）；④仅有当月数据时隐藏同比/环比/达标/诊断气泡（hasPrevData/hasYoyData守卫）；⑤缩小卡片区与看板之间留白（margin/间距优化）', starred: true, backup: null },
{ id: 'r154', version: '20260426r154', date: '2026-04-26 10:00', type: 'optimize', content: '排班日历顶部留白缩小：.schedule-page-wrap padding 从 16px 20px 改为 0 20px 16px，与考勤统计页顶部留白比例保持一致', starred: false, backup: null },
{ id: 'r155', version: '20260426r155', date: '2026-04-26 10:15', type: 'optimize', content: '考勤通知卡片左右比例调整：左侧从55%改为40%，右侧从45%改为60%，右侧团队数据展示空间更充裕', starred: false, backup: null },
{ id: 'r156', version: '20260426r156', date: '2026-04-26 10:30', type: 'optimize', content: '考勤通知右侧折线与颜色优化：折线统一为蓝色(#3370FF)；百分比颜色改为动态（100%=绿色、≥50%=橙色、<50%=红色）；团队名称补齐完整名称（如"交付"→"交付团队"）', starred: false, backup: null },
{ id: 'r157', version: '20260426r157', date: '2026-04-26 11:00', type: 'feature', content: '卡片右侧团队顺序可配置：排班数据和考勤通知详情弹窗均新增拖拽排序功能，拖拽调整团队顺序后前4个团队展示在卡片右侧；顺序通过 glxt_card_team_order 持久化到 localStorage，两张卡片共享同一配置；新增 _sortTeamsByOrder/_initTeamDragSort 通用工具函数', starred: true, backup: null },
{ id: 'r158', version: '20260426r158', date: '2026-04-26 11:30', type: 'optimize', content: '批量排班模式持久化：使用批量排班后不再自动退出，保持批量模式直到用户手动点击退出；applyBatchShift中移除 _exitBatchMode()，改为清空选中集合后重新进入批量模式', starred: false, backup: null },
{ id: 'r160', version: '20260426r160', date: '2026-04-26 12:00', type: 'optimize', content: '考勤通知详情弹窗UI全面美化（纯视觉优化，功能不变）：①弹窗头部改为浅蓝渐变背景+16px加粗标题；②统计条改为横向图标+数字卡片布局，每卡片顶部渐变色条，确认率新增SVG环形进度条（颜色随百分比动态变化）；③Tab筛选改为胶囊pill样式，激活态用对应颜色填充；④团队分组头加蓝色左边框+浅蓝渐变背景+👥图标；⑤成员行改为卡片式布局，新增圆形头像（取姓名末字）+状态徽章badge+meta时间信息（圆点分隔）；⑥列表区自定义细滚动条；⑦底部加急按钮圆角加大+微渐变背景', starred: true, backup: null },
{ id: 'r103', version: '20260427r103', date: '2026-04-27 10:00', type: 'feature', content: '队列管理模块全面优化（31项）：①表格交互：列排序/三态切换、Shift连续选/Ctrl+A全选、批量操作栏（启用/暂停/删除）、键盘快捷键(J/K/Enter/Esc/Del)、右键菜单、拖拽排序模式；②数据增强：健康度综合评分（SVG环形图）、人效/实效进度条+目标线、积压量分级预警（⚠动画）、质检分条件色+图标；③UI升级：Toggle开关替代文字状态、搜索框+实时过滤+高亮、团队/状态筛选标签、列显隐配置面板、行密度三档切换；④详情侧抽屉：滑入动画+Tab分栏（基本信息/KPI/操作日志）、字段双击行内编辑、KPI网格5列布局；⑤导入导出：JSON导入+拖拽放置区、JSON/CSV双格式导出', starred: true, backup: null },
{ id: 'r104', version: '20260427r104', date: '2026-04-27 11:00', type: 'fix', content: '修复队列管理表格列对齐问题：表格改用table-layout:fixed定宽布局，所有列（队列名称180px、审核团队90px、质检分88px、人效/时效各160px、积压量88px等）设置明确宽度，th/td增加overflow:hidden+text-overflow:ellipsis防止内容撑开列宽，人效进度条组件适配固定宽度', starred: false, backup: null },
{ id: 'r105', version: '20260427r105', date: '2026-04-27 16:00', type: 'optimize', content: '队列管理四项优化：①删除密度切换功能（移除按钮/函数/CSS/状态变量）；②删除队列简称字段，所有位置统一使用队列全名称（涉及表格、弹窗、抽屉、日志、导入导出等全链路改造）；③字段重命名："人效实际"→"人效实际达成"、"实效"全部改为"时效"（实效目标→时效目标、实效实际→时效实际达成）；④新增/编辑队列弹窗增加4个新字段：队列系数、进审时间、是否加入预警、预警时间', starred: true, backup: null },
{ id: 'r106', version: '20260427r106', date: '2026-04-27 18:00', type: 'optimize', content: '队列管理页面精简优化：①删除质检平均分KPI卡片（5列→4列）；②删除数据表格中质检分列；③重新排列表格列顺序为：团队→队列名称→队列ID→人均进审量→积压量→人效目标→人效实际达成→时效目标→时效实际达成→队列系数→是否预警→预警时间→状态→操作；④清理所有质检相关过滤器、钻取逻辑、对比分析字段、抽屉详情卡片、趋势图表、编辑弹窗字段、导出字段、健康度质检权重、历史快照质检字段；⑤列设置弹窗同步更新为新列结构', starred: true, backup: null },
{ id: 'r107', version: '20260427r107', date: '2026-04-27 20:00', type: 'feature', content: '队列管理数据补全与字段扩展：①基于草稿本数据补充24条真实队列（含项目、Owner、要求、时效、备注等完整信息）；②新增字段：项目(project)、Owner(owner)、要求(requirement)、备注(remark)；③realTarget改为字符串类型支持"24h/0.5h/周清"等文本；④effCoef支持null（账号/POI团队）；⑤enableWarning改用"yes/no"字符串；⑥表格新增20列完整展示（含要求色标、审核标签药丸）；⑦编辑/新建弹窗同步升级为3-4列布局，新增所有新字段；⑧抽屉概览新增"基础信息"板块展示项目/Owner/要求/时效/备注', starred: true, backup: null },
{ id: 'r108', version: '20260427r108', date: '2026-04-27 22:00', type: 'feature', content: '队列管理系统完善（8项）：①健康度算法升级为4维加权评估（积压消化30%+人效达成30%+时效匹配20%+预警响应20%），抽屉内展示分项得分条；②KPI面板稳定6卡片布局（队列总数/启停比/人效达成率/总积压量/预警队列数/时清达标率）；③7维筛选体系（团队/项目/要求/Owner/状态/积压/预警）+标签联动+清除全部；④批量操作补全（新增批量改Owner/改要求/改预警，均含Undo支持）；⑤表格列默认值合理化+列设置恢复默认按钮；⑥表格数据可视化（积压量数据条+人效达成迷你进度条）；⑦抽屉快捷编辑（基础信息区hover显示✎按钮）+效率指标改3列；⑧撤销toast增加倒计时进度条+行内编辑变更摘要提示', starred: true, backup: null },
{ id: 'r109', version: '20260427r109', date: '2026-04-27 23:00', type: 'fix', content: '队列管理表格列宽布局修正：①队列名称列从min-width:180px改为固定width:180px，解决该列在table-layout:fixed下独吞全部剩余空间、占比过半的问题；②移除无CSS定义的qm-col-sticky类；③重新平衡所有列宽分配（日均进审72→88、积压量72→76、人效要求64→72、实际达成72→80等），数据列更舒适；④表格增加min-width:960px下限，窄屏自动出现横向滚动条防止列压缩变形', starred: false, backup: null },
{ id: 'r110', version: '20260427r110', date: '2026-04-27 23:30', type: 'feature', content: '队列管理新增优先级列(P0-P3)：表格/新增/编辑/抽屉/列设置全链路支持，带彩色徽章（P0红/P1橙/P2蓝/P3灰）', starred: false, backup: null },
{ id: 'r111', version: '20260427r111', date: '2026-04-27 24:00', type: 'feature', content: '队列管理导入导出全面重写：①导出支持CSV/JSON双格式+BOM头+中文列名+字段勾选+范围选择+预览计数；②导入支持xlsx/xls/csv/json四格式+中文表头自动映射+两步预览确认+色码差异表(新增绿/更新蓝/跳过灰)+4种导入模式(智能合并/覆盖/跳过/追加)；③以队列ID为锚点精确匹配', starred: true, backup: null },
{ id: 'r112', version: '20260427r112', date: '2026-04-27 24:30', type: 'fix', content: '导入格式兼容：新增Excel(.xlsx/.xls)上传支持，复用SheetJS库解析ArrayBuffer，自动映射中文表头到字段key', starred: false, backup: null },
{ id: 'r113', version: '20260427r113', date: '2026-04-27 25:00', type: 'optimize', content: '队列管理UI修复合集：①删除加班类型和工损类型字段（含overtime.css样式清理）；②本月配额和填写说明改为管理员可编辑；③多项CSS样式优化', starred: false, backup: null },
{ id: 'r114', version: '20260427r114', date: '2026-04-27 25:30', type: 'fix', content: '考勤看板合计行补全：底部合计行原班次列(A/B/C等)、休列、各请假类型列均为空，现改为汇总全员数据显示合计值，有值加粗/无值显示"—"', starred: false, backup: null },
];

// 初始化：首次使用写入全部种子；后续版本更新自动追加缺失记录 + 自动备份
function _initVersionLogSeed() {
  let logs = _loadVersionLog();
  let changed = false;
  if (logs.length === 0) {
    // 首次使用，写入全部种子
    logs = _VERSION_SEED.map(s => Object.assign({}, s));
    changed = true;
  } else {
    // 已有数据：检查是否有新版本记录需要追加
    const existIds = new Set(logs.map(l => l.id));
    _VERSION_SEED.forEach(s => {
      if (!existIds.has(s.id)) {
        logs.push(Object.assign({}, s));
        changed = true;
      }
    });
  }
  // r130: 自动备份 — 找到当前版本的记录，如果还没有备份则自动创建快照
  const curVer = window.GLXT_VERSION;
  if (curVer) {
    const curLog = logs.find(l => l.version === curVer);
    if (curLog && !curLog.backup) {
      curLog.backup = _createBackupSnapshot();
      changed = true;
    }
  }
  if (changed) _saveVersionLog(logs);
}

function _genVersionId() {
  return 'v_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

function _getTypeLabel(type) {
  const map = { update: '更新', optimize: '优化', iterate: '迭代', fix: '修复', feature: '新功能' };
  return map[type] || type;
}
function _getTypeColor(type) {
  const map = { update: '#3370FF', optimize: '#00B365', iterate: '#722ED1', fix: '#FA541C', feature: '#3370FF' };
  return map[type] || '#666';
}

// 创建备份快照（关键配置文件的 JSON 快照）
function _createBackupSnapshot() {
  const snapshot = {
    timestamp: new Date().toISOString(),
    version: window.GLXT_VERSION,
    data: {}
  };
  // 备份所有 GLXT_ 开头的 localStorage 数据（排除版本日志自身避免循环）
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('GLXT_') && k !== GLXT_VER_LOG_KEY) {
      try { snapshot.data[k] = JSON.parse(localStorage.getItem(k)); }
      catch(e) { snapshot.data[k] = localStorage.getItem(k); }
    }
  }
  return snapshot;
}

// 下载备份文件
function _downloadBackup(versionId) {
  const logs = _loadVersionLog();
  const log = logs.find(l => l.id === versionId);
  if (!log || !log.backup) { showToast('该版本暂无备份数据', 'warning'); return; }
  const blob = new Blob([JSON.stringify(log.backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `GLXT_backup_${log.version}.json`; a.click();
  URL.revokeObjectURL(url);
  showToast('备份文件已下载', 'success');
}

// 切换星标
function _toggleVersionStar(versionId) {
  const logs = _loadVersionLog();
  const log = logs.find(l => l.id === versionId);
  if (log) { log.starred = !log.starred; _saveVersionLog(logs); }
  // 刷新页面
  document.getElementById('settingsContent').innerHTML = renderSettingsVersions();
}

// 删除版本记录
function _deleteVersionLog(versionId) {
  if (!confirm('确定删除该版本记录？此操作不可恢复。')) return;
  let logs = _loadVersionLog();
  logs = logs.filter(l => l.id !== versionId);
  _saveVersionLog(logs);
  document.getElementById('settingsContent').innerHTML = renderSettingsVersions();
  showToast('版本记录已删除', 'success');
}

// 新增版本记录
function _addVersionLog() {
  const version = document.getElementById('verInput_version').value.trim();
  const type = document.getElementById('verInput_type').value;
  const content = document.getElementById('verInput_content').value.trim();
  const doBackup = document.getElementById('verInput_backup').checked;
  if (!version) { showToast('请填写版本号', 'warning'); return; }
  if (!content) { showToast('请填写更新内容', 'warning'); return; }
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  const log = {
    id: _genVersionId(),
    version: version,
    date: dateStr,
    type: type,
    content: content,
    starred: false,
    backup: doBackup ? _createBackupSnapshot() : null,
  };
  const logs = _loadVersionLog();
  logs.unshift(log); // 最新的在最前面
  _saveVersionLog(logs);
  document.getElementById('settingsContent').innerHTML = renderSettingsVersions();
  showToast('版本记录已添加' + (doBackup ? '（含备份）' : ''), 'success');
}

// 搜索/筛选状态
let _verSearchTerm = '';
let _verFilterType = 'all';
let _verFilterStar = false;

function _verSearch() {
  _verSearchTerm = (document.getElementById('verSearchInput') || {}).value || '';
  document.getElementById('verListWrap').innerHTML = _renderVersionList();
}
function _verFilterByType(type) {
  _verFilterType = type;
  document.getElementById('verListWrap').innerHTML = _renderVersionList();
}
function _verFilterByStar() {
  _verFilterStar = !_verFilterStar;
  document.getElementById('verListWrap').innerHTML = _renderVersionList();
}

function _renderVersionList() {
  let logs = _loadVersionLog();
  // r130: 按时间倒序排列，最新版本在最上面
  logs.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.version || '').localeCompare(a.version || ''));
  // 筛选
  if (_verFilterType !== 'all') logs = logs.filter(l => l.type === _verFilterType);
  if (_verFilterStar) logs = logs.filter(l => l.starred);
  if (_verSearchTerm) {
    const kw = _verSearchTerm.toLowerCase();
    logs = logs.filter(l => l.version.toLowerCase().includes(kw) || l.content.toLowerCase().includes(kw));
  }
  if (!logs.length) {
    return `<div style="text-align:center;padding:40px 0;color:var(--text-quaternary)">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style="opacity:0.3"><rect x="6" y="8" width="36" height="34" rx="4" stroke="currentColor" stroke-width="2"/><path d="M16 20h16M16 28h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      <p style="margin-top:8px;font-size:13px">暂无版本记录</p>
    </div>`;
  }
  return logs.map((log, idx) => `
    <div style="display:flex;align-items:flex-start;gap:16px;padding:16px 20px;border-bottom:1px solid var(--border-light);transition:background 0.15s;position:relative${idx % 2 === 0 ? ';background:rgba(0,0,0,0.015)' : ''}" onmouseenter="this.style.background='rgba(51,112,255,0.04)'" onmouseleave="this.style.background='${idx % 2 === 0 ? 'rgba(0,0,0,0.015)' : ''}'">
      <!-- 左侧时间线圆点 -->
      <div style="flex-shrink:0;width:12px;height:12px;border-radius:50%;margin-top:4px;background:${_getTypeColor(log.type)};box-shadow:0 0 0 3px ${_getTypeColor(log.type)}22"></div>
      <!-- 内容区 -->
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:14px;font-weight:700;color:#1a1a1a;font-family:monospace;letter-spacing:0.5px">${log.version}</span>
          <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;color:#fff;background:${_getTypeColor(log.type)}">${_getTypeLabel(log.type)}</span>
          <span style="font-size:12px;color:var(--text-tertiary)">${log.date}</span>
          ${log.backup ? '<span style="display:inline-block;padding:1px 6px;border-radius:3px;font-size:10px;background:#E8F5E9;color:#2E7D32">已备份</span>' : ''}
        </div>
        <div style="margin-top:6px;font-size:13px;color:#333;line-height:1.6">${log.content}</div>
      </div>
      <!-- 右侧操作 -->
      <div style="flex-shrink:0;display:flex;align-items:center;gap:4px">
        <button onclick="_toggleVersionStar('${log.id}')" title="${log.starred ? '取消星标' : '设为星标'}" style="background:none;border:none;cursor:pointer;padding:4px 6px;border-radius:4px;font-size:18px;transition:background 0.15s;line-height:1" onmouseenter="this.style.background='rgba(0,0,0,0.06)'" onmouseleave="this.style.background='none'">${log.starred ? '⭐' : '☆'}</button>
        ${log.backup ? `<button onclick="_downloadBackup('${log.id}')" title="下载备份" style="background:none;border:none;cursor:pointer;padding:4px 6px;border-radius:4px;font-size:15px;transition:background 0.15s;line-height:1" onmouseenter="this.style.background='rgba(0,0,0,0.06)'" onmouseleave="this.style.background='none'">💾</button>` : ''}
        <button onclick="_deleteVersionLog('${log.id}')" title="删除记录" style="background:none;border:none;cursor:pointer;padding:4px 6px;border-radius:4px;font-size:15px;color:var(--text-quaternary);transition:all 0.15s;line-height:1" onmouseenter="this.style.background='rgba(255,0,0,0.06)';this.style.color='#CF1322'" onmouseleave="this.style.background='none';this.style.color='var(--text-quaternary)'">🗑</button>
      </div>
    </div>
  `).join('');
}

function renderSettingsVersions() {
  _initVersionLogSeed(); // 确保种子数据存在
  const logs = _loadVersionLog();
  const totalCount = logs.length;
  const starredCount = logs.filter(l => l.starred).length;
  const backupCount = logs.filter(l => l.backup).length;
  const currentVer = window.GLXT_VERSION || '—';

  return `
    <div class="card" style="margin-bottom:16px">
      <div class="card-header" style="display:flex;align-items:center;justify-content:space-between">
        <span class="card-title" style="display:flex;align-items:center;gap:8px">
          <span style="font-size:18px">📋</span> 版本更新管理
        </span>
        <span style="font-size:12px;color:var(--text-tertiary)">当前版本：<strong style="color:var(--primary);font-family:monospace">${currentVer}</strong></span>
      </div>
      <div class="card-body" style="padding:0">
        <!-- 统计栏 -->
        <div style="display:flex;gap:24px;padding:16px 20px;border-bottom:1px solid var(--border-light);background:linear-gradient(135deg,rgba(51,112,255,0.03) 0%,rgba(0,179,101,0.03) 100%)">
          <div style="text-align:center"><div style="font-size:22px;font-weight:700;color:var(--primary)">${totalCount}</div><div style="font-size:11px;color:var(--text-tertiary)">总版本数</div></div>
          <div style="text-align:center"><div style="font-size:22px;font-weight:700;color:#D4A017">${starredCount}</div><div style="font-size:11px;color:var(--text-tertiary)">星标版本</div></div>
          <div style="text-align:center"><div style="font-size:22px;font-weight:700;color:#2E7D32">${backupCount}</div><div style="font-size:11px;color:var(--text-tertiary)">含备份</div></div>
        </div>
        <!-- 筛选栏 -->
        <div style="display:flex;align-items:center;gap:8px;padding:12px 20px;border-bottom:1px solid var(--border-light);flex-wrap:wrap">
          <input id="verSearchInput" type="text" placeholder="搜索版本号或内容..." oninput="_verSearch()" value="${_verSearchTerm}" style="flex:1;min-width:160px;padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px;outline:none;transition:border 0.2s" onfocus="this.style.borderColor='var(--primary)'" onblur="this.style.borderColor='var(--border)'">
          <div style="display:flex;gap:4px">
            ${['all','update','optimize','iterate','fix','feature'].map(t => `
              <button onclick="_verFilterByType('${t}')" style="padding:4px 10px;border-radius:4px;font-size:11px;border:1px solid ${_verFilterType === t ? _getTypeColor(t === 'all' ? 'update' : t) : 'var(--border)'};background:${_verFilterType === t ? _getTypeColor(t === 'all' ? 'update' : t) + '12' : 'transparent'};color:${_verFilterType === t ? _getTypeColor(t === 'all' ? 'update' : t) : 'var(--text-secondary)'};cursor:pointer;transition:all 0.15s;font-weight:${_verFilterType === t ? '600' : '400'}">${t === 'all' ? '全部' : _getTypeLabel(t)}</button>
            `).join('')}
          </div>
          <button onclick="_verFilterByStar()" style="padding:4px 10px;border-radius:4px;font-size:11px;border:1px solid ${_verFilterStar ? '#D4A017' : 'var(--border)'};background:${_verFilterStar ? 'rgba(212,160,23,0.1)' : 'transparent'};color:${_verFilterStar ? '#D4A017' : 'var(--text-secondary)'};cursor:pointer;transition:all 0.15s">⭐ 星标</button>
        </div>
        <!-- 版本列表 -->
        <div id="verListWrap" style="max-height:420px;overflow-y:auto">
          ${_renderVersionList()}
        </div>
      </div>
    </div>

    <!-- 新增版本记录 -->
    <div class="card">
      <div class="card-header"><span class="card-title" style="display:flex;align-items:center;gap:8px"><span style="font-size:16px">➕</span> 新增版本记录</span></div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">版本号</label>
            <input id="verInput_version" type="text" class="form-control" placeholder="如 20260423r129" value="${currentVer}" style="font-family:monospace">
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">类型</label>
            <select id="verInput_type" class="form-control">
              <option value="update">更新</option>
              <option value="optimize" selected>优化</option>
              <option value="iterate">迭代</option>
              <option value="fix">修复</option>
              <option value="feature">新功能</option>
            </select>
          </div>
        </div>
        <div class="form-group" style="margin-top:12px">
          <label class="form-label">更新内容</label>
          <textarea id="verInput_content" class="form-control" rows="3" placeholder="描述本次更新/优化/迭代的内容..." style="resize:vertical;line-height:1.6"></textarea>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:var(--text-secondary)">
            <input id="verInput_backup" type="checkbox" checked> 同时创建数据备份快照
          </label>
          <button class="btn btn-primary" onclick="_addVersionLog()">添加记录</button>
        </div>
      </div>
    </div>
  `;
}

// ===== 考勤统计页面（V4 全面重写 —含全部0项优化）=====
// 视图模式：'personal'（个人）| 'team'（团队）—r109: overview 不再是Tab 视图
let attView = 'personal';
let attFilterTeam = 'all';
let attFilterMember = 'all';
let attSortKey = 'rate';   // 总览排序字段
let attSortAsc = false;    // 升序/降序
let attFilterAnomalyMode = 'all'; // 其他筛选模式：'all'|'leave'|'triple'
let attOverviewPage = 1;      // 总览分页当前页
const ATT_PAGE_SIZE = 30;     // 总览每页行数
let attTimeDim = 'month'; // 时间维度：'day'|'week'|'month'|'quarter'|'year'
// attOrgDim 已合并到 attFilterTeam（'allteams' = 按团队维度）
let attFilterMonth = (() => {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
})();
// 排班数据缓存（按月）
const _attScheduleCache = {};
// B班补贴单价（元/天）
const ATT_B_SHIFT_SUBSIDY = 50;
// 个人视图展开状态
let _attPersonExpandedIds = new Set();
// 考勤看板内联展开的人员ID（null = 全部折叠）
let _attDashExpandedId = null;
// r113: 考勤看板内联展开的小组名（null = 全部折叠）
let _attDashExpandedGroup = null;
// r120: 考勤通知 — 第5张卡片状态
let _attNotifyMonth = (() => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`; })();
let _attNotifyDropdownOpen = false;

// ===== r145: 通知模板系统 =====
const _ATT_NOTIFY_TPL_KEY = 'att_notify_templates';
const _ATT_NOTIFY_TPL_DEFAULTS = {
  dx_confirm: {
    label: '大象-考勤确认', channel: 'daxiang', type: 'confirm',
    text: '📋 **{month}月考勤数据确认通知**\n\n{name} 你好，你的 **{month}月** 考勤数据已生成：\n\n{card}\n\n✅ 数据无误 → 请登录系统点击「确认无误」\n❌ 数据有误 → 请于 **下月3日前** 点击「有异议」并填写原因\n\n⏰ 逾期未确认将按当前数据结算\n\n👉 打开审核管理系统：file:///M:/GLXT/index.html'
  },
  dx_urge: {
    label: '大象-加急提醒', channel: 'daxiang', type: 'urge',
    text: '🚨 **【加急】{month}月考勤确认提醒**\n\n{name}，你尚未完成 {month}月考勤确认！\n\n{card}\n\n⚠️ **截止时间：下月3日**\n逾期系统将自动锁定，届时无法修改。\n\n请立即登录系统核对并确认！\n\n👉 打开审核管理系统：file:///M:/GLXT/index.html'
  },
  sys_confirm: {
    label: '系统-考勤确认', channel: 'system', type: 'confirm',
    text: '{month}月考勤确认\n\n{name} 你好，{month}月考勤数据已生成，请核对以下信息：\n\n{card}\n\n核对后请点击下方按钮完成确认。'
  },
  sys_urge: {
    label: '系统-加急提醒', channel: 'system', type: 'urge',
    text: '🚨 {month}月考勤加急确认\n\n{name}，你的{month}月考勤仍未确认！\n\n{card}\n\n⚠️ 务必在下月3日前完成确认，逾期数据将自动锁定，届时无法申请修改。'
  }
};

/** 读取自定义模板（管理员修改后存 localStorage，否则用默认） */
function _attLoadTemplates() {
  try {
    const raw = localStorage.getItem(_ATT_NOTIFY_TPL_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      // 合并：已保存的覆盖默认，新增的 key 保留默认
      const merged = {};
      Object.keys(_ATT_NOTIFY_TPL_DEFAULTS).forEach(k => {
        merged[k] = Object.assign({}, _ATT_NOTIFY_TPL_DEFAULTS[k], saved[k] || {});
      });
      return merged;
    }
  } catch(e) {}
  return JSON.parse(JSON.stringify(_ATT_NOTIFY_TPL_DEFAULTS));
}

/** 保存自定义模板 */
function _attSaveTemplates(tpls) {
  localStorage.setItem(_ATT_NOTIFY_TPL_KEY, JSON.stringify(tpls));
}

/** 重置模板为默认 */
function _attResetTemplates() {
  localStorage.removeItem(_ATT_NOTIFY_TPL_KEY);
}

/** r145: 模板编辑弹窗 */
function _showAttTplEditor() {
  const tpls = _attLoadTemplates();
  const keys = Object.keys(tpls);
  let overlay = document.getElementById('attTplEditorOverlay');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'attTplEditorOverlay';
  overlay.className = 'att-modal-overlay';
  overlay.style.zIndex = '10001';

  let tabsHtml = keys.map((k, i) =>
    `<button class="att-tpl-tab${i === 0 ? ' att-tpl-tab-active' : ''}" data-key="${k}" onclick="_attTplSwitchTab('${k}')">${tpls[k].label}</button>`
  ).join('');

  let bodiesHtml = keys.map((k, i) =>
    `<div class="att-tpl-body" id="attTplBody_${k}" style="${i > 0 ? 'display:none' : ''}">
      <div class="att-tpl-hint">可用占位符：<code>{name}</code> 姓名、<code>{month}</code> 月份、<code>{card}</code> 考勤卡片（大象渠道自动使用Markdown格式，支持 **加粗** 语法）</div>
      <textarea class="att-tpl-textarea" id="attTplText_${k}" rows="10">${tpls[k].text.replace(/</g, '&lt;')}</textarea>
    </div>`
  ).join('');

  overlay.innerHTML = `
    <div class="att-modal att-tpl-editor-modal" onclick="event.stopPropagation()">
      <div class="att-modal-header">
        <span class="att-modal-title">编辑通知模板</span>
        <button class="att-modal-close" onclick="document.getElementById('attTplEditorOverlay').remove()">&times;</button>
      </div>
      <div class="att-tpl-tabs">${tabsHtml}</div>
      <div class="att-tpl-content">${bodiesHtml}</div>
      <div class="att-modal-footer" style="justify-content:space-between">
        <button class="att-modal-btn att-modal-btn-cancel" onclick="_attResetTemplates();document.getElementById('attTplEditorOverlay').remove();showToast('已恢复默认模板','success')" style="color:#FA541C">恢复默认</button>
        <div style="display:flex;gap:8px">
          <button class="att-modal-btn att-modal-btn-cancel" onclick="document.getElementById('attTplEditorOverlay').remove()">取消</button>
          <button class="att-modal-btn att-modal-btn-primary" onclick="_attTplSave()">保存模板</button>
        </div>
      </div>
    </div>`;
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('att-modal-overlay-show'));
}

function _attTplSwitchTab(key) {
  document.querySelectorAll('.att-tpl-tab').forEach(t => t.classList.toggle('att-tpl-tab-active', t.dataset.key === key));
  document.querySelectorAll('.att-tpl-body').forEach(b => b.style.display = 'none');
  const body = document.getElementById('attTplBody_' + key);
  if (body) body.style.display = '';
}

function _attTplSave() {
  const tpls = _attLoadTemplates();
  Object.keys(tpls).forEach(k => {
    const ta = document.getElementById('attTplText_' + k);
    if (ta) tpls[k].text = ta.value;
  });
  _attSaveTemplates(tpls);
  document.getElementById('attTplEditorOverlay')?.remove();
  showToast('通知模板已保存', 'success');
}

/**
 * r150: 生成系统公告考勤卡片
 * 系统公告最终通过 _renderAnnText 渲染为 HTML（支持 **加粗**、换行→<br>）
 * 因此这里用 **加粗** + \n 换行即可获得清晰排版
 */
function _attBuildCardText(memberId, yearStr, monthStr) {
  const s = _getAttStats(memberId, yearStr, monthStr);
  if (!s) return '（暂无考勤数据）';
  const rate = s.scheduledDays > 0 ? Math.round(s.workDays / s.scheduledDays * 100) : 100;
  const onduty = s.ondutyTotal !== null && s.ondutyTotal !== undefined ? s.ondutyTotal : s.scheduledDays;
  const stdH = onduty * 8;
  const actH = s.workDays * 8;

  // 只展示有出勤的班次
  const shiftParts = [];
  if (s.shiftCount?.A > 0) shiftParts.push('A班 ' + s.shiftCount.A + '天');
  if (s.shiftCount?.B > 0) shiftParts.push('B班 ' + s.shiftCount.B + '天');
  if (s.shiftCount?.C > 0) shiftParts.push('C班 ' + s.shiftCount.C + '天');

  // 请假明细
  let leaveExtra = '';
  if (s.leaveBreakdown && Object.keys(s.leaveBreakdown).length > 0) {
    leaveExtra = '（' + Object.entries(s.leaveBreakdown).map(([k, v]) => k + v + '天').join('、') + '）';
  }

  const lines = [
    '——————————————————',
    '',
    '📅 **【出勤情况】**',
    '应出勤 **' + onduty + '** 天 / 实际出勤 **' + s.workDays + '** 天',
    '休息天 **' + s.offDays + '** 天 / 请假天 **' + s.leaveDays + '** 天' + leaveExtra,
    '',
    '🔄 **【班次统计】**',
    shiftParts.length > 0 ? shiftParts.join(' / ') : '无排班',
    '',
    '⏱ **【工时数据】**',
    '标准工时 **' + stdH + 'h** / 出勤工时 **' + actH + 'h**',
    '',
    '💰 **【补贴三薪】**',
    '三薪 **' + (s.triplePayDays || 0) + '** 天 / B班 **' + (s.bShiftDays || 0) + '** 天 / 补贴 **¥' + (s.bShiftSubsidy || 0) + '**',
    '',
    '——————————————————',
    (rate >= 95 ? '🟢' : rate >= 80 ? '🟡' : '🔴') + ' 出勤率：**' + rate + '%**',
    '——————————————————',
  ];
  return lines.join('\n');
}

/**
 * r151: 生成大象考勤卡片
 * 关键发现：大象消息单个 \n 会被吞掉，只有 \n\n（空行）才能产生换行
 * 因此用 \n\n 作为行间分隔，每个分区内数据尽量合并为一行
 */
function _attBuildCardMarkdown(memberId, yearStr, monthStr) {
  const s = _getAttStats(memberId, yearStr, monthStr);
  if (!s) return '（暂无考勤数据）';
  const rate = s.scheduledDays > 0 ? Math.round(s.workDays / s.scheduledDays * 100) : 100;
  const rateEmoji = rate >= 95 ? '🟢' : rate >= 80 ? '🟡' : '🔴';
  const onduty = s.ondutyTotal !== null && s.ondutyTotal !== undefined ? s.ondutyTotal : s.scheduledDays;
  const stdH = onduty * 8;
  const actH = s.workDays * 8;

  // 只展示有出勤记录的班次
  const shiftParts = [];
  if (s.shiftCount?.A > 0) shiftParts.push('A班 ' + s.shiftCount.A + '天');
  if (s.shiftCount?.B > 0) shiftParts.push('B班 ' + s.shiftCount.B + '天');
  if (s.shiftCount?.C > 0) shiftParts.push('C班 ' + s.shiftCount.C + '天');

  // 请假明细
  let leaveStr = s.leaveDays + '天';
  if (s.leaveBreakdown && Object.keys(s.leaveBreakdown).length > 0) {
    leaveStr += '（' + Object.entries(s.leaveBreakdown).map(([k, v]) => k + v + '天').join('、') + '）';
  }

  // 大象 \n\n 才换行，所以用段落（\n\n）分隔每一行
  const parts = [
    '——————————————————',
    '📅 **【出勤情况】**',
    '应出勤 **' + onduty + '** 天 / 实际出勤 **' + s.workDays + '** 天',
    '休息天 **' + s.offDays + '** 天 / 请假天 **' + leaveStr + '**',
    '🔄 **【班次统计】**  ' + (shiftParts.length > 0 ? shiftParts.join(' / ') : '无排班'),
    '⏱ **【工时数据】**  标准 **' + stdH + 'h** / 出勤 **' + actH + 'h**',
    '💰 **【补贴三薪】**  三薪 **' + (s.triplePayDays || 0) + '** 天 / B班 **' + (s.bShiftDays || 0) + '** 天 / 补贴 **¥' + (s.bShiftSubsidy || 0) + '**',
    '——————————————————',
    rateEmoji + ' **出勤率：' + rate + '%**',
    '——————————————————',
  ];
  return parts.join('\n\n');
}

/**
 * r146: 渲染占位符替换（{name}, {month}, {card}）
 * @param {string} channel - 'daxiang' 使用 Markdown 卡片, 其他使用纯文本卡片
 */
function _attRenderTpl(tplText, name, month, memberId, channel) {
  const [y, m] = month.split('-');
  const monthNum = parseInt(m);
  const card = (channel === 'daxiang')
    ? _attBuildCardMarkdown(memberId, y, m)
    : _attBuildCardText(memberId, y, m);
  return tplText
    .replace(/\{name\}/g, name)
    .replace(/\{month\}/g, String(monthNum))
    .replace(/\{card\}/g, card);
}

// ===== 优化①工具函数 =====
function _rateColor(rate) { return rate >= 90 ? '#389E0D' : rate >= 70 ? '#FA8C16' : '#CF1322'; }
function _rateBarColor(rate) { return rate >= 90 ? '#52C41A' : rate >= 70 ? '#FAAD14' : '#FF4D4F'; }
function _workShiftKeys() { return Object.keys(SHIFTS).filter(k => k !== 'OFF'); }

// ===== 优化②统一排班数据读取（含缓存）====
const _schedDataCache = {};
function _getScheduleForMonth(yearStr, monthStr) {
  const key = `${yearStr}_${monthStr}`;
  if (_schedDataCache[key] !== undefined) return _schedDataCache[key];
  const now = new Date();
  if (parseInt(yearStr) === now.getFullYear() && parseInt(monthStr) === now.getMonth() + 1) {
    _schedDataCache[key] = SCHEDULE_DATA;
    return SCHEDULE_DATA;
  }
  const schedKey = `glxt_schedule_${yearStr}_${monthStr}`;
  let data = null;
  try {
    const raw = localStorage.getItem(schedKey);
    if (raw) data = JSON.parse(raw);
  } catch(e) {}
  _schedDataCache[key] = data;
  return data;
}
function _clearSchedDataCache() {
  Object.keys(_schedDataCache).forEach(k => delete _schedDataCache[k]);
}

// ---- 核心：从 localStorage 排班数据计算真实考勤 ----
function _getAttStats(memberId, yearStr, monthStr) {
  const year  = parseInt(yearStr);
  const month = parseInt(monthStr);
  const cacheKey = `${String(memberId)}_${year}_${month}`;
  if (_attScheduleCache[cacheKey]) return _attScheduleCache[cacheKey];

  // 优化②统一读取

  const schedData = _getScheduleForMonth(String(year), String(month).padStart(2, '0'));

  const daysInMonth = new Date(year, month, 0).getDate();
  let workDays = 0, leaveDays = 0, offDays = 0;
  let halfLeaveDayCount = 0; // r110: 统计半天假天数（用于工时计算）
  const shiftCount = { A: 0, B: 0, C: 0 };
  const leaveBreakdown = {};

  if (schedData && schedData[memberId]) {
    for (let d = 1; d <= daysInMonth; d++) {
      const val = schedData[memberId][d] || 'OFF';
      if (val === 'OFF') {
        offDays++;
      } else if (isLeaveShift(val)) {
        const parsed = parseShiftValue(val);
        const lt = parsed.leaveType;
        const dur = lt ? lt.duration : 1;
        leaveDays += dur;
        if (dur < 1) halfLeaveDayCount++; // 半天假
        const lname = lt ? lt.name : '请假';
        leaveBreakdown[lname] = (leaveBreakdown[lname] || 0) + dur;
      } else {
        workDays++;
        if (shiftCount[val] !== undefined) shiftCount[val]++;
      }
    }
  } else {
    // 无排班数据时回退到ATTENDANCE_STATS 静态数据
    const s = ATTENDANCE_STATS[memberId] || {};
    const result = {
      workDays: s.workDays || 0,
      leaveDays: s.leaveDays || 0,
      scheduledDays: (s.workDays || 0) + (s.leaveDays || 0), // Bug⑤fix: 应出勤
      triplePayDays: s.triplePayDays || 0,
      offDays: daysInMonth - (s.workDays || 0) - (s.leaveDays || 0),
      shiftCount: { A: 0, B: 0, C: 0 },
      leaveBreakdown: {},
      daysInMonth,
      hasRealData: false,
    };
    _attScheduleCache[cacheKey] = result;
    return result;
  }

  // r110: 简化工时计算—每班统一8h，半天假算4h工时，全天假算0h
  // actualHours = 工作天数×8 + 半天假天数×4
  const actualHours = workDays * 8 + halfLeaveDayCount * 4;

  // Bug⑤fix: 应出勤= 实际出勤 + 请假天数

  const scheduledDays = workDays + leaveDays;
  const standardHours = workDays * 8;

  // B班补贴
  const bShiftDays = shiftCount.B || 0;
  const bShiftSubsidy = bShiftDays * ATT_B_SHIFT_SUBSIDY;

  // 三薪天数 ——Bug⑦fix: 从排班数据三薪日期动态计算，而非使用静态种子
  let triplePayDays = 0;
  const _ondutyOvr = getOndutyOverride(year, month);
  const _tripleDates = _ondutyOvr.tripleDates || [];
  if (_tripleDates.length > 0 && schedData[memberId]) {
    _tripleDates.forEach(function(dateStr) {
      // dateStr 格式 "M/D"，提取日

      const dParts = dateStr.split('/');
      const dayNum = parseInt(dParts[dParts.length - 1]);
      if (dayNum >= 1 && dayNum <= daysInMonth) {
        const dayVal = schedData[memberId][dayNum] || 'OFF';
        // 在班（非OFF、非请假）才计入三薪

        if (dayVal !== 'OFF' && !isLeaveShift(dayVal)) {
          triplePayDays++;
        }
      }
    });
  }

  // r121: 从排班日历获取管理员设置的当月在班总天数
  const _ondutyTotal = _ondutyOvr.total; // null 表示管理员未设置

  const staticS = ATTENDANCE_STATS[memberId] || {};
  const result = {
    workDays,
    leaveDays,
    scheduledDays, // Bug⑤fix
    triplePayDays,
    offDays,
    shiftCount,
    leaveBreakdown,
    daysInMonth,
    hasRealData: true,
    actualHours,
    standardHours,
    bShiftDays,
    bShiftSubsidy,
    ondutyTotal: _ondutyTotal, // r121: 排班日历设定的在班总天数
  };
  _attScheduleCache[cacheKey] = result;
  return result;
}

// 清除缓存（切换月份时调用）
function _clearAttCache() {
  Object.keys(_attScheduleCache).forEach(k => delete _attScheduleCache[k]);
  _clearSchedDataCache();
}

// ===== 功能⑤同比（去年同月）辅助 =====
function _getYoYMonth(yearStr, monthStr) {
  return { y: String(parseInt(yearStr) - 1), m: monthStr };
}

// ---- r103-opt③卡片点击涟漪效果 ----
function _attCardRipple(e) {
  var card = e.currentTarget || e.target.closest('.sch-hcard');
  if (!card) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var rect = card.getBoundingClientRect();
  var x = e.clientX - rect.left;
  var y = e.clientY - rect.top;
  var size = Math.max(rect.width, rect.height) * 2;
  var span = document.createElement('span');
  span.className = 'att-ripple';
  span.style.width = span.style.height = size + 'px';
  span.style.left = (x - size / 2) + 'px';
  span.style.top = (y - size / 2) + 'px';
  card.appendChild(span);
  span.addEventListener('animationend', function() { span.remove(); });
}

// ---- r103-opt③卡片展开/折叠迷你详情面板（r104-opt④增强：图表维度切换：---
var _attDetailOpenKey = ''; // 当前展开的卡片key，空表示全部收起
var _attDetailChartType = localStorage.getItem('glxt_att_detail_chart') || 'bar'; // 'bar' | 'line'
var _attDetailRankDim = 'team'; // r133: group 已移除，统一按团队

function _attToggleCardDetail(cardKey) {
  var panel = document.getElementById('attCardDetailPanel');
  if (!panel) return;

  // 切换箭头状态
  document.querySelectorAll('.att-detail-toggle').forEach(function(el) {
    el.classList.remove('att-detail-toggle-open');
  });

  // 同一卡片再次点击 →收起

  if (_attDetailOpenKey === cardKey) {
    _attDetailOpenKey = '';
    panel.classList.remove('att-detail-open');
    return;
  }

  _attDetailOpenKey = cardKey;

  // 找到对应箭头并旋转
  var card = document.querySelector('.sch-hcard[data-att-card="' + cardKey + '"]');
  if (card) {
    var toggle = card.querySelector('.att-detail-toggle');
    if (toggle) toggle.classList.add('att-detail-toggle-open');
  }

  _attRenderDetailContent(cardKey);

  // 先移除再添加以触发过渡
  panel.classList.remove('att-detail-open');
  void panel.offsetHeight;
  panel.classList.add('att-detail-open');
}

// 内容渲染（独立函数，切换图表/维度时复用，不重新触发open/close 过渡：
function _attRenderDetailContent(cardKey) {
  var panel = document.getElementById('attCardDetailPanel');
  if (!panel) return;
  var conf = _attCardConf[cardKey];
  if (!conf) return;

  // 获取当前月份
  var parts = attFilterMonth.split('-');
  var yearStr = parts[0], monthStr = parts[1];

  // ── 左侧：近6月趋势数据──

  var barData = _attSparklineData(yearStr, monthStr, conf.metric);
  var maxVal = Math.max.apply(null, barData.map(function(d){return d.value;})) || 1;

  var chartHtml = '';
  if (_attDetailChartType === 'line') {
    // SVG 折线图
    var svgW = 220, svgH = 80, padL = 6, padR = 6, padT = 6, padB = 16;
    var minVal = Math.min.apply(null, barData.map(function(d){return d.value;}));
    var range = maxVal - minVal || 1;
    var pts = barData.map(function(d, i) {
      var x = padL + (i / (barData.length - 1)) * (svgW - padL - padR);
      var y = padT + (1 - (d.value - minVal) / range) * (svgH - padT - padB);
      return { x: x, y: y, val: d.value, label: d.label };
    });
    var polyPoints = pts.map(function(p) { return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ');
    // 渐变区域

    var areaPoints = polyPoints + ' ' + pts[pts.length-1].x.toFixed(1) + ',' + (svgH - padB) + ' ' + pts[0].x.toFixed(1) + ',' + (svgH - padB);
    chartHtml = '<svg width="' + svgW + '" height="' + svgH + '" viewBox="0 0 ' + svgW + ' ' + svgH + '" fill="none" style="width:100%;max-width:' + svgW + 'px">' +
      '<defs><linearGradient id="attLineGrad_' + cardKey + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="' + conf.color + '" stop-opacity="0.18"/><stop offset="100%" stop-color="' + conf.color + '" stop-opacity="0.02"/></linearGradient></defs>' +
      '<polygon points="' + areaPoints + '" fill="url(#attLineGrad_' + cardKey + ')"/>' +
      '<polyline points="' + polyPoints + '" stroke="' + conf.color + '" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
    pts.forEach(function(p) {
      chartHtml += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="3" fill="#fff" stroke="' + conf.color + '" stroke-width="1.5"/>';
      chartHtml += '<text x="' + p.x.toFixed(1) + '" y="' + (svgH - 3) + '" text-anchor="middle" font-size="9" fill="#86909C">' + p.label + '</text>';
    });
    chartHtml += '</svg>';
  } else {
    // 横向柱状图
    chartHtml = barData.map(function(d) {
      var pct = Math.round(d.value / maxVal * 100);
      return '<div class="att-detail-bar-row">' +
        '<span class="att-detail-bar-label">' + d.label + '</span>' +
        '<span class="att-detail-bar-track"><span class="att-detail-bar-fill" style="width:' + pct + '%;background:' + conf.color + '"></span></span>' +
        '<span class="att-detail-bar-val">' + (typeof d.value === 'number' && d.value % 1 ? d.value.toFixed(1) : d.value) + conf.unit + '</span>' +
        '</div>';
    }).join('');
  }

  // 图表类型切换按钮

  var chartToggle =
    '<div class="att-detail-chart-toggle">' +
      '<button class="att-detail-chart-btn' + (_attDetailChartType === 'bar' ? ' active' : '') + '" onclick="_attSwitchChartType(\'bar\')" title="柱状图">' +
        '<svg width="12" height="12" viewBox="0 0 14 14" fill="none"><rect x="1" y="6" width="3" height="7" rx="0.5" stroke="currentColor" stroke-width="1.1"/><rect x="5.5" y="3" width="3" height="10" rx="0.5" stroke="currentColor" stroke-width="1.1"/><rect x="10" y="1" width="3" height="12" rx="0.5" stroke="currentColor" stroke-width="1.1"/></svg>' +
      '</button>' +
      '<button class="att-detail-chart-btn' + (_attDetailChartType === 'line' ? ' active' : '') + '" onclick="_attSwitchChartType(\'line\')" title="折线图">' +
        '<svg width="12" height="12" viewBox="0 0 14 14" fill="none"><polyline points="1,11 4,6 7,8 10,3 13,5" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '</button>' +
    '</div>';

  // ── 右侧：排名（可切换维度）──

  var members = (typeof MEMBERS_DATA !== 'undefined' ? MEMBERS_DATA : []).filter(function(x) { return !x.excludeFromSchedule; });
  var groups = {};
  var dimKey = 'team';
  members.forEach(function(m) {
    var gk = m[dimKey] || m.team || '未分配';
    if (!groups[gk]) groups[gk] = [];
    groups[gk].push(m);
  });
  var daysInMonth = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();
  var rankRows = Object.keys(groups).map(function(name) {
    var gMembers = groups[name];
    var stats = gMembers.map(function(m) { return _getAttStats(m.id, yearStr, monthStr); });
    var val = conf.rankMetric(stats, gMembers.length, daysInMonth);
    return { name: name, value: val };
  });
  rankRows.sort(function(a, b) { return b.value - a.value; });
  var topRanks = rankRows.slice(0, 6);

  var rankHtml = topRanks.map(function(r, i) {
    var cls = i === 0 ? ' top1' : i === 1 ? ' top2' : i === 2 ? ' top3' : '';
    return '<div class="att-detail-rank-row">' +
      '<span class="att-detail-rank-num' + cls + '">' + (i + 1) + '</span>' +
      '<span class="att-detail-rank-name">' + r.name + '</span>' +
      '<span class="att-detail-rank-val">' + (typeof r.value === 'number' && r.value % 1 ? r.value.toFixed(1) : r.value) + conf.rankUnit + '</span>' +
      '</div>';
  }).join('');

  // 排名维度切换

  var dimLabel = _attDetailRankDim === 'team' ? '团队' : '小组';
  var rankToggle =
    '<div class="att-detail-rank-toggle">' +
'<span style="font-size:12px;color:var(--text-tertiary)">按团队</span>' +
    '</div>';

  // 渲染
  panel.innerHTML = '<div class="att-card-detail-inner">' +
    '<div class="att-detail-chart">' +
      '<div class="att-detail-chart-title">📊 近6月趋势 · ' + conf.label + chartToggle + '</div>' +
      chartHtml +
    '</div>' +
    '<div class="att-detail-ranking">' +
      '<div class="att-detail-ranking-title">🏆 ' + dimLabel + '排名 · ' + conf.label + rankToggle + '</div>' +
      rankHtml +
    '</div>' +
    '</div>' +
    '<button class="att-detail-close" onclick="_attToggleCardDetail(\'' + cardKey + '\')" title="收起">✕</button>';
}

// 切换图表类型（不收起面板）
function _attSwitchChartType(type) {
  _attDetailChartType = type;
  localStorage.setItem('glxt_att_detail_chart', type);
  if (_attDetailOpenKey) _attRenderDetailContent(_attDetailOpenKey);
}

// 切换排名维度（不收起面板）
function _attSwitchRankDim(dim) {
  _attDetailRankDim = dim;
  localStorage.setItem('glxt_att_detail_rank_dim', dim);
  if (_attDetailOpenKey) _attRenderDetailContent(_attDetailOpenKey);
}

// ---- r104-opt③卡片右键/长按上下文菜单----
var _attCtxMenuTimer = null;

// 卡片配置（复用于上下文菜单、详情面板等）
// r105-opt⑤新增 target（默认目标值）、higherBetter（越高越好）字段
var _attCardConf = {
  rate:   { label: '团队数据', color: '#3370FF', unit: '%', higherBetter: true,
            metric: function(ss, cnt, dim) { var scheduled = ss.reduce(function(a,x){return a+x.scheduledDays;},0); return cnt && scheduled ? Math.round(ss.reduce(function(a,x){return a+x.workDays;},0) / scheduled * 100) : 0; },
            rankMetric: function(stats, cnt, dim) { var scheduled = stats.reduce(function(a,x){return a+x.scheduledDays;},0); return cnt && scheduled ? Math.round(stats.reduce(function(a,x){return a+x.workDays;},0) / scheduled * 100) : 0; },
            rankUnit: '%', related: ['leave3'] },
  bdays:  { label: 'B班补贴', color: '#52C41A', unit: '元', higherBetter: true,
            metric: function(ss) { return ss.reduce(function(a,x){return a+x.bShiftSubsidy;},0); },
            rankMetric: function(stats) { return stats.reduce(function(a,x){return a+x.bShiftSubsidy;},0); },
            rankUnit: '元', related: ['triple'] },
  triple: { label: '三薪天数', color: '#FA8C16', unit: '天', higherBetter: true,
            metric: function(ss) { return ss.reduce(function(a,x){return a+x.triplePayDays;},0); },
            rankMetric: function(stats) { return stats.reduce(function(a,x){return a+x.triplePayDays;},0); },
            rankUnit: '天', related: ['bdays'] },
  leave3: { label: '请假合计', color: '#722ED1', unit: '天', higherBetter: false,
            metric: function(ss) { return ss.reduce(function(a,x){return a+x.leaveDays;},0); },
            rankMetric: function(stats) { return stats.reduce(function(a,x){return a+x.leaveDays;},0); },
            rankUnit: '天', related: ['rate'] }
};

// r105-opt⑤数据异常智能诊断——找出环比变动最大的团队及原因
function _attDiagnoseBubble(cardKey, curValue, prevValue, teams, allStats, prevAllStats) {
  if (!prevValue || Math.abs((curValue - prevValue) / prevValue) < 0.2) return '';
  var conf = _attCardConf[cardKey];
  if (!conf) return '';
  var metricKey = cardKey === 'rate' ? 'workDays' : cardKey === 'bdays' ? 'bShiftSubsidy' : cardKey === 'triple' ? 'triplePayDays' : 'leaveDays';
  // 按团队计算当月上月值
  var teamDeltas = [];
  teams.forEach(function(t) {
    var curTeam = allStats.filter(function(x) { return x.m.team === t; });
    var prevTeam = prevAllStats.filter(function(x) { return x.m.team === t; });
    var curSum = curTeam.reduce(function(a, x) { return a + x.s[metricKey]; }, 0);
    var prevSum = prevTeam.reduce(function(a, x) { return a + x.s[metricKey]; }, 0);
    var delta = curSum - prevSum;
    teamDeltas.push({ team: t, cur: curSum, prev: prevSum, delta: delta, absDelta: Math.abs(delta) });
  });
  teamDeltas.sort(function(a, b) { return b.absDelta - a.absDelta; });
  var top = teamDeltas[0];
  if (!top || top.absDelta === 0) return '';
  var direction = curValue > prevValue ? '增加' : '减少';
  var totalDiff = Math.abs(curValue - prevValue);
  var pct = prevValue ? Math.round(Math.abs((curValue - prevValue) / prevValue) * 100) : 100;
  var topDir = top.delta > 0 ? '增加' : '减少';
  var unit = conf.unit;
  var msg = conf.label + '环比' + direction + ' ' + (totalDiff % 1 ? totalDiff.toFixed(1) : totalDiff) + unit + '（' + pct + '%），主因：' + top.team + ' ' + topDir + ' ' + (top.absDelta % 1 ? top.absDelta.toFixed(1) : top.absDelta) + unit;
  // 如果第二名也很显著（贡献>30%），追加

  if (teamDeltas.length > 1 && teamDeltas[1].absDelta > totalDiff * 0.3) {
    var s2 = teamDeltas[1];
    msg += '，其次' + s2.team + ' ' + (s2.delta > 0 ? '增加' : '减少') + ' ' + (s2.absDelta % 1 ? s2.absDelta.toFixed(1) : s2.absDelta) + unit;
  }
  return msg;
}

function _attCardContextMenu(e, cardKey) {
  e.preventDefault();
  e.stopPropagation();
  _dismissAttCtxMenu();

  var conf = _attCardConf[cardKey];
  if (!conf) return;

  var card = e.currentTarget || e.target.closest('.sch-hcard');
  var valueEl = card ? card.querySelector('.sc-value') : null;
  var unitEl = card ? card.querySelector('.sc-unit') : null;
  var valText = (valueEl ? valueEl.textContent : '') + (unitEl ? unitEl.textContent : '');

  var menu = document.createElement('div');
  menu.className = 'att-ctx-menu';
  menu.innerHTML =
    '<div class="att-ctx-header">' + conf.label + '</div>' +
    '<button class="att-ctx-item" data-action="copy">' +
      '<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="4" y="4" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.2"/><path d="M10 4V2.5A1.5 1.5 0 008.5 1h-6A1.5 1.5 0 001 2.5v6A1.5 1.5 0 002.5 10H4" stroke="currentColor" stroke-width="1.2"/></svg>' +
      '复制数值<span class="att-ctx-shortcut">' + valText.trim() + '</span></button>' +
    '<button class="att-ctx-item" data-action="csv">' +
      '<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M7 1v8M4 6l3 3 3-3M2 10v1.5A1.5 1.5 0 003.5 13h7A1.5 1.5 0 0012 11.5V10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '导出近6月趋势CSV</button>' +
    '<div class="att-ctx-divider"></div>' +
    '<button class="att-ctx-item" data-action="detail">' +
      '<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.2"/><path d="M4 5h6M4 7h6M4 9h3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>' +
      '展开详情面板</button>';

  document.body.appendChild(menu);

  // 视口边界修正

  var mw = menu.offsetWidth, mh = menu.offsetHeight;
  var vw = window.innerWidth, vh = window.innerHeight;
  var left = e.clientX, top = e.clientY;
  if (left + mw > vw - 8) left = vw - mw - 8;
  if (top + mh > vh - 8) top = vh - mh - 8;
  if (left < 8) left = 8;
  if (top < 8) top = 8;
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';

  // 菜单项点击
  menu.addEventListener('click', function(ev) {
    var btn = ev.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.getAttribute('data-action');
    _dismissAttCtxMenu();

    if (action === 'copy') {
      // 复制数值到剪贴板
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(valText.trim());
      } else {
        var ta = document.createElement('textarea');
        ta.value = valText.trim();
        ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      if (typeof showToast === 'function') showToast('已复制 ' + valText.trim(), 'success');
    } else if (action === 'csv') {
      _attExportTrendCSV(cardKey);
    } else if (action === 'detail') {
      _attToggleCardDetail(cardKey);
    }
  });

  // 点击外部关闭
  setTimeout(function() {
    document.addEventListener('click', _dismissAttCtxMenu, { once: true });
    document.addEventListener('contextmenu', _dismissAttCtxMenu, { once: true });
  }, 10);
}

function _dismissAttCtxMenu() {
  var old = document.querySelector('.att-ctx-menu');
  if (old) old.remove();
}

// 导出某指标近6月趋势为 CSV
function _attExportTrendCSV(cardKey) {
  var conf = _attCardConf[cardKey];
  if (!conf) return;
  var parts = attFilterMonth.split('-');
  var data = _attSparklineData(parts[0], parts[1], conf.metric);
  var csv = '\uFEFF月份,' + conf.label + '(' + conf.unit + ')\n';
  data.forEach(function(d) {
    csv += d.label + ',' + (typeof d.value === 'number' && d.value % 1 ? d.value.toFixed(1) : d.value) + '\n';
  });
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = conf.label + '_近6月趋势_' + attFilterMonth + '.csv';
  a.click();
  setTimeout(function() { URL.revokeObjectURL(url); }, 3000);
  if (typeof showToast === 'function') showToast('趋势 CSV 已导出', 'success');
}

// 长按支持（移动端 500ms 触发：
function _attCardTouchStart(e, cardKey) {
  _attCtxMenuTimer = setTimeout(function() {
    _attCtxMenuTimer = null;
    // 构造fakeEvent 让菜单定位到触摸点
    var touch = e.touches && e.touches[0];
    var fakeE = {
      preventDefault: function() {},
      stopPropagation: function() {},
      clientX: touch ? touch.clientX : 0,
      clientY: touch ? touch.clientY : 0,
      currentTarget: e.currentTarget
    };
    _attCardContextMenu(fakeE, cardKey);
  }, 500);
}
function _attCardTouchEnd() {
  if (_attCtxMenuTimer) { clearTimeout(_attCtxMenuTimer); _attCtxMenuTimer = null; }
}

// ---- r104-opt③卡片间指标关联线索----
var _attCrossHintTimer = null;

function _attCardCrossHint(cardKey) {
  _attCardCrossHintClear();
  var conf = _attCardConf[cardKey];
  if (!conf || !conf.related) return;

  conf.related.forEach(function(relKey) {
    var relCard = document.querySelector('.sch-hcard[data-att-card="' + relKey + '"]');
    if (!relCard) return;
    var footer = relCard.querySelector('.sc-footer-row');
    var valueRow = relCard.querySelector('.sc-value-row');
    if (footer) footer.classList.add('att-cross-hint-flash');
    if (valueRow) valueRow.classList.add('att-cross-hint-flash');
  });

  // 自动清除（防止mouseleave 丢失）
  _attCrossHintTimer = setTimeout(_attCardCrossHintClear, 1200);
}

function _attCardCrossHintClear() {
  if (_attCrossHintTimer) { clearTimeout(_attCrossHintTimer); _attCrossHintTimer = null; }
  document.querySelectorAll('.att-cross-hint-flash').forEach(function(el) {
    el.classList.remove('att-cross-hint-flash');
  });
}

// ---- r99-opt①卡片点击高亮态同步----
function _syncAttCardActive(clickedEl) {
  document.querySelectorAll('#contentArea .sch-hcard[data-att-card]').forEach(function(c) {
    c.classList.remove('sch-hcard-active');
  });
  if (clickedEl) clickedEl.classList.add('sch-hcard-active');
}

// ===== r135: 考勤通知功能（重构：发送确认弹窗 + 渠道选择 + 异议原因 + 详情弹窗） =====

// r135: 显示发送确认弹窗（渠道选择：系统 + 大象）
function _attShowSendConfirm() {
  const ym = _attNotifyMonth;
  const [y, m] = ym.split('-');
  const members = MEMBERS_DATA.filter(x => !x.excludeFromSchedule);
  if (!members.length) { showToast('没有可通知的成员', 'warning'); return; }

  let overlay = document.getElementById('attSendConfirmOverlay');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'attSendConfirmOverlay';
  overlay.className = 'att-modal-overlay';
  overlay.innerHTML = `
    <div class="att-modal att-send-confirm-modal" onclick="event.stopPropagation()">
      <div class="att-modal-header">
        <span class="att-modal-title">发送 ${parseInt(m)} 月考勤通知</span>
        <button class="att-modal-close" onclick="document.getElementById('attSendConfirmOverlay').remove()">&times;</button>
      </div>
      <div class="att-modal-body">
        <div class="att-send-info">
          <div class="att-send-info-row"><span class="att-send-info-label">通知月份</span><span class="att-send-info-val">${y}年${parseInt(m)}月</span></div>
          <div class="att-send-info-row"><span class="att-send-info-label">通知人数</span><span class="att-send-info-val">${members.length} 人</span></div>
          <div class="att-send-info-row"><span class="att-send-info-label">发送人</span><span class="att-send-info-val">${CURRENT_USER.name || '系统管理员'}</span></div>
        </div>
        <div class="att-send-channels">
          <div class="att-send-channel-title">选择发送渠道</div>
          <label class="att-send-channel-option">
            <input type="checkbox" id="attSendChSystem" checked disabled>
            <span class="att-send-channel-icon" style="background:rgba(22,100,255,0.08);color:#1664FF">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="10" rx="2" stroke="currentColor" stroke-width="1.3"/><path d="M2 6l6 3.5L14 6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
            </span>
            <span>审核管理系统（系统公告 + 个人面板确认）</span>
            <span class="att-send-channel-tag att-send-channel-tag-default">默认</span>
          </label>
          <label class="att-send-channel-option">
            <input type="checkbox" id="attSendChDaxiang">
            <span class="att-send-channel-icon" style="background:rgba(0,179,101,0.08);color:#00B365">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 1C4.13 1 1 3.58 1 6.75c0 1.83 1.12 3.46 2.87 4.52L3 14.5l3.13-1.57c.6.1 1.23.16 1.87.16 3.87 0 7-2.58 7-5.75S11.87 1 8 1z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </span>
            <span>大象消息通知（截图 + 确认/异议链接）</span>
          </label>
        </div>
        <div class="att-send-note">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style="flex-shrink:0;margin-top:1px"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.2"/><path d="M7 4.5v3M7 9.5v.01" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
          <span>发送后，每位成员将在个人考勤面板看到确认按钮。选择大象渠道将同时发送考勤数据卡片。</span>
        </div>
        <div style="padding:4px 0 0;text-align:right">
          <button class="att-tpl-edit-link" onclick="event.stopPropagation();_showAttTplEditor()">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M11.5 1.5l3 3L5 14H2v-3l9.5-9.5z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            编辑通知模板
          </button>
        </div>
      </div>
      <div class="att-modal-footer">
        <button class="att-modal-btn att-modal-btn-cancel" onclick="document.getElementById('attSendConfirmOverlay').remove()">取消</button>
        <button class="att-modal-btn att-modal-btn-primary" onclick="_attDoSendNotify()">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M14 2L7 9M14 2l-4.5 12-2-5.5L2 6.5 14 2z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          确认发送
        </button>
      </div>
    </div>`;
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('att-modal-overlay-show'));
}

// r145: 执行发送通知（使用模板系统 + 考勤卡片）
function _attDoSendNotify() {
  const ym = _attNotifyMonth;
  const [y, m] = ym.split('-');
  const monthNum = parseInt(m);
  const members = MEMBERS_DATA.filter(x => !x.excludeFromSchedule);
  const useDaxiang = document.getElementById('attSendChDaxiang')?.checked || false;
  const tpls = _attLoadTemplates();

  // 关闭弹窗
  const overlay = document.getElementById('attSendConfirmOverlay');
  if (overlay) overlay.remove();

  // 初始化通知数据（扩展 channels + daxiangSent）
  const data = {
    sent: true, sentAt: Date.now(),
    sentBy: CURRENT_USER.name || '系统管理员',
    channels: useDaxiang ? ['system', 'daxiang'] : ['system'],
    daxiangSent: false,
    members: {}
  };
  members.forEach(x => {
    // r145: 使用系统确认模板渲染每人的通知正文
    const sysText = _attRenderTpl(tpls.sys_confirm.text, x.name, ym, x.id);
    data.members[x.id] = {
      read: false, readAt: null,
      confirmed: false, confirmedAt: null,
      disputed: false, disputedAt: null, disputeReason: '',
      firstSentAt: Date.now(), daxiangSentAt: null, lastUrgedAt: null,
      notifyText: sysText
    };
  });
  saveAttNotify(ym, data);

  // 写入系统公告（使用系统确认模板的纯文本摘要）
  ANNOUNCEMENTS_DATA.unshift({
    id: Date.now(), type: 'p1', status: 'unread',
    title: `${monthNum}月考勤通知`,
    text: `${monthNum}月考勤数据已生成，请查看个人考勤明细后点击"确认无误"或"有异议"。如有问题请联系主管。`,
    createdAt: new Date().toISOString().slice(0, 10),
    createdBy: data.sentBy,
    attNotifyMonth: ym,
  });
  saveAnnouncements();

  const channelStr = useDaxiang ? '本系统 + 大象' : '本系统';
  showToast(`已向 ${members.length} 人发送 ${monthNum} 月考勤通知（${channelStr}）`, 'success', 4000);

  // r145: 勾选大象渠道时，使用大象确认模板发送
  if (useDaxiang) {
    const tasks = [];
    const now = Date.now();
    members.forEach(x => {
      if (x.mis) {
        const dxText = _attRenderTpl(tpls.dx_confirm.text, x.name, ym, x.id, 'daxiang');
        tasks.push({ mis: x.mis, name: x.name, memberId: x.id, message: dxText });
        if (data.members[x.id]) data.members[x.id].daxiangSentAt = now;
      }
    });
    if (tasks.length) {
      _daxiangSendBatch(tasks, `发送${monthNum}月考勤通知`);
    }
    data.daxiangSent = true;
    saveAttNotify(ym, data);
  }

  renderAttendancePage(document.getElementById('contentArea'));
}

// 标记某人已阅读
function _attNotifyMarkRead(memberId) {
  const ym = _attNotifyMonth;
  const data = loadAttNotify(ym);
  if (!data || !data.members[memberId]) return;
  if (!data.members[memberId].read) {
    data.members[memberId].read = true;
    data.members[memberId].readAt = Date.now();
    saveAttNotify(ym, data);
  }
}

// 标记某人已确认（确认无误）
function _attNotifyConfirm(memberId) {
  const ym = _attNotifyMonth;
  const data = loadAttNotify(ym);
  if (!data || !data.members[memberId]) return;
  data.members[memberId].read = true;
  data.members[memberId].readAt = data.members[memberId].readAt || Date.now();
  data.members[memberId].confirmed = true;
  data.members[memberId].confirmedAt = Date.now();
  data.members[memberId].disputed = false;
  data.members[memberId].disputeReason = '';
  saveAttNotify(ym, data);
  showToast('已确认考勤无误', 'success');
  renderAttendancePage(document.getElementById('contentArea'));
}

// r135: 标记某人有异议（弹出原因输入框）
function _attNotifyDispute(memberId) {
  const ym = _attNotifyMonth;
  const data = loadAttNotify(ym);
  if (!data || !data.members[memberId]) return;

  let overlay = document.getElementById('attDisputeOverlay');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'attDisputeOverlay';
  overlay.className = 'att-modal-overlay';
  overlay.innerHTML = `
    <div class="att-modal att-dispute-modal" onclick="event.stopPropagation()">
      <div class="att-modal-header">
        <span class="att-modal-title">提交考勤异议</span>
        <button class="att-modal-close" onclick="document.getElementById('attDisputeOverlay').remove()">&times;</button>
      </div>
      <div class="att-modal-body">
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:10px">请简要说明您对 ${ym.split('-')[1]} 月考勤数据的异议原因：</div>
        <textarea id="attDisputeReasonInput" class="att-dispute-textarea" placeholder="例如：4月15日应为B班，实际被标为请假…" rows="3" maxlength="200"></textarea>
        <div class="att-dispute-char-count"><span id="attDisputeCharCount">0</span>/200</div>
      </div>
      <div class="att-modal-footer">
        <button class="att-modal-btn att-modal-btn-cancel" onclick="document.getElementById('attDisputeOverlay').remove()">取消</button>
        <button class="att-modal-btn att-modal-btn-danger" onclick="_attDoDispute('${memberId}')">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          提交异议
        </button>
      </div>
    </div>`;
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('att-modal-overlay-show'));

  setTimeout(() => {
    const ta = document.getElementById('attDisputeReasonInput');
    const counter = document.getElementById('attDisputeCharCount');
    if (ta && counter) {
      ta.addEventListener('input', () => { counter.textContent = ta.value.length; });
      ta.focus();
    }
  }, 100);
}

// r135: 执行异议提交
function _attDoDispute(memberId) {
  const ym = _attNotifyMonth;
  const data = loadAttNotify(ym);
  if (!data || !data.members[memberId]) return;
  const reason = (document.getElementById('attDisputeReasonInput')?.value || '').trim();
  if (!reason) { showToast('请填写异议原因', 'warning'); return; }

  data.members[memberId].read = true;
  data.members[memberId].readAt = data.members[memberId].readAt || Date.now();
  data.members[memberId].confirmed = false;
  data.members[memberId].disputed = true;
  data.members[memberId].disputedAt = Date.now();
  data.members[memberId].disputeReason = reason;
  saveAttNotify(ym, data);

  document.getElementById('attDisputeOverlay')?.remove();
  showToast('已提交异议，管理员会尽快处理', 'warning');
  renderAttendancePage(document.getElementById('contentArea'));
}

// r153: 管理员处理异议——标记已处理（弹窗输入处理备注）
function _attResolveDispute(memberId) {
  const ym = _attNotifyMonth;
  const data = loadAttNotify(ym);
  if (!data || !data.members[memberId]) return;
  const ms = data.members[memberId];
  if (!ms.disputed) { showToast('该人员无异议', 'info'); return; }

  let overlay = document.getElementById('attResolveOverlay');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'attResolveOverlay';
  overlay.className = 'att-modal-overlay';
  const member = MEMBERS_DATA.find(x => x.id == memberId);
  const memberName = member ? member.name : memberId;
  overlay.innerHTML = `
    <div class="att-modal att-dispute-modal" onclick="event.stopPropagation()">
      <div class="att-modal-header">
        <span class="att-modal-title">处理异议 — ${memberName}</span>
        <button class="att-modal-close" onclick="document.getElementById('attResolveOverlay').remove()">&times;</button>
      </div>
      <div class="att-modal-body">
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:6px">异议原因：</div>
        <div style="font-size:13px;color:#CF1322;background:rgba(207,19,34,0.06);padding:8px 10px;border-radius:8px;margin-bottom:12px">${ms.disputeReason || '未填写'}</div>
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:6px">处理备注（可选）：</div>
        <textarea id="attResolveNoteInput" class="att-dispute-textarea" placeholder="例如：已核实并修正排班数据…" rows="2" maxlength="200"></textarea>
      </div>
      <div class="att-modal-footer">
        <button class="att-modal-btn att-modal-btn-cancel" onclick="document.getElementById('attResolveOverlay').remove()">取消</button>
        <button class="att-modal-btn att-modal-btn-primary" onclick="_attDoResolveDispute('${memberId}')">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M4 8l3 3 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          确认已处理
        </button>
      </div>
    </div>`;
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('att-modal-overlay-show'));
  setTimeout(() => document.getElementById('attResolveNoteInput')?.focus(), 100);
}

function _attDoResolveDispute(memberId) {
  const ym = _attNotifyMonth;
  const data = loadAttNotify(ym);
  if (!data || !data.members[memberId]) return;
  const note = (document.getElementById('attResolveNoteInput')?.value || '').trim();
  // r153-fix: 异议处理后回归已确认状态，保留异议历史记录
  data.members[memberId].disputeResolved = true;
  data.members[memberId].disputeResolvedAt = Date.now();
  data.members[memberId].disputeResolvedBy = CURRENT_USER.name || CURRENT_USER.mis || '';
  data.members[memberId].disputeResolveNote = note;
  // 关键：清除异议标记，转为已确认
  data.members[memberId].disputed = false;
  data.members[memberId].confirmed = true;
  data.members[memberId].confirmedAt = Date.now();
  saveAttNotify(ym, data);
  document.getElementById('attResolveOverlay')?.remove();
  showToast('异议已处理，' + (MEMBERS_DATA.find(x => x.id == memberId)?.name || '') + ' 已转为已确认', 'success');
  _renderAttNotifyDetailContent();
}

// r153: 管理员驳回异议——恢复为待确认状态
function _attRejectDispute(memberId) {
  const ym = _attNotifyMonth;
  const data = loadAttNotify(ym);
  if (!data || !data.members[memberId]) return;
  const ms = data.members[memberId];
  if (!ms.disputed) { showToast('该人员无异议', 'info'); return; }
  const member = MEMBERS_DATA.find(x => x.id == memberId);
  const memberName = member ? member.name : memberId;
  if (!confirm('确定驳回 ' + memberName + ' 的异议吗？\n驳回后将恢复为"待确认"状态。')) return;
  // 清除异议状态，恢复为未确认
  data.members[memberId].disputed = false;
  data.members[memberId].disputedAt = null;
  data.members[memberId].disputeReason = '';
  data.members[memberId].confirmed = false;
  data.members[memberId].disputeResolved = false;
  data.members[memberId].disputeResolvedAt = null;
  data.members[memberId].disputeResolvedBy = '';
  data.members[memberId].disputeResolveNote = '';
  saveAttNotify(ym, data);
  showToast('已驳回异议，' + memberName + ' 恢复为待确认', 'warning');
  _renderAttNotifyDetailContent();
}

// r136: 截图生成——将当月考勤汇总渲染为 PNG 下载
function _attGenNotifyScreenshot() {
  const ym = _attNotifyMonth;
  const [y, m] = ym.split('-');
  const members = MEMBERS_DATA.filter(x => !x.excludeFromSchedule);
  if (!members.length) { showToast('无成员数据', 'warning'); return; }

  const dpr = window.devicePixelRatio || 1;
  const W = 720, pad = 24, rowH = 26, headerH = 44;
  const teams = [...new Set(members.map(x => x.team))];
  const allStats = members.map(x => ({ m: x, s: _getAttStats(x.id, y, m) }));

  // 计算画布高度：标题 + 各团队 header + 成员行 + 间距
  let totalRows = 0;
  teams.forEach(t => { totalRows += 1 + allStats.filter(x => x.m.team === t).length; });
  const H = pad * 2 + headerH + totalRows * rowH + teams.length * 10 + 40;

  const canvas = document.createElement('canvas');
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  // 背景
  ctx.fillStyle = '#F5F7FA'; ctx.fillRect(0, 0, W, H);

  // 标题栏
  ctx.fillStyle = '#1664FF'; ctx.fillRect(0, 0, W, headerH);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 16px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText(`${parseInt(m)}月 考勤数据汇总`, pad, 28);
  ctx.font = '11px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.globalAlpha = 0.7;
  ctx.fillText(`${y}年${parseInt(m)}月 · 共${members.length}人 · ${teams.length}个团队 · ${new Date().toLocaleDateString()}`, W - pad - ctx.measureText(`${y}年${parseInt(m)}月 · 共${members.length}人 · ${teams.length}个团队 · ${new Date().toLocaleDateString()}`).width, 28);
  ctx.globalAlpha = 1;

  let curY = headerH + pad;

  // 表头列宽定义
  const cols = [
    { label: '姓名', x: pad, w: 70 },
    { label: '出勤', x: pad + 80, w: 40 },
    { label: '请假', x: pad + 130, w: 40 },
    { label: '三薪', x: pad + 180, w: 40 },
    { label: 'B班', x: pad + 230, w: 40 },
    { label: '工时', x: pad + 280, w: 50 },
    { label: '出勤率', x: pad + 340, w: 50 },
  ];

  teams.forEach(team => {
    const teamMembers = allStats.filter(x => x.m.team === team);
    // 团队 header
    ctx.fillStyle = '#1664FF'; ctx.globalAlpha = 0.08;
    ctx.fillRect(pad - 4, curY - 2, W - pad * 2 + 8, rowH);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#1664FF'; ctx.font = 'bold 12px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText(team + ' (' + teamMembers.length + '人)', pad + 4, curY + 16);
    // 列标题
    ctx.fillStyle = '#8C8C8C'; ctx.font = '10px "PingFang SC","Microsoft YaHei",sans-serif';
    cols.forEach(c => ctx.fillText(c.label, c.x, curY + 16));
    curY += rowH;

    teamMembers.forEach(({ m: mem, s }, idx) => {
      const sched = s.scheduledDays || 1;
      const rate = Math.round(s.workDays / sched * 100);
      if (idx % 2 === 0) { ctx.fillStyle = '#fff'; ctx.fillRect(pad - 4, curY - 2, W - pad * 2 + 8, rowH); }
      ctx.fillStyle = '#1a1a1a'; ctx.font = '11px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillText(mem.name, cols[0].x, curY + 16);
      ctx.fillText(String(s.workDays), cols[1].x, curY + 16);
      ctx.fillText(String(s.leaveDays), cols[2].x, curY + 16);
      ctx.fillText(String(s.triplePayDays), cols[3].x, curY + 16);
      ctx.fillText(String(s.bShiftDays), cols[4].x, curY + 16);
      ctx.fillText(String(s.actualHours) + 'h', cols[5].x, curY + 16);
      // 出勤率颜色
      ctx.fillStyle = rate >= 90 ? '#52C41A' : rate >= 70 ? '#FA8C16' : '#CF1322';
      ctx.font = 'bold 11px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillText(rate + '%', cols[6].x, curY + 16);
      curY += rowH;
    });
    curY += 10;
  });

  // 底部水印
  ctx.fillStyle = '#C0C0C0'; ctx.font = '9px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText('由 GLXT 审核管理系统自动生成 · ' + new Date().toLocaleString(), pad, H - 10);

  canvas.toBlob(function(blob) {
    if (!blob) { showToast('截图生成失败', 'error'); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `考勤汇总_${y}年${parseInt(m)}月.png`;
    a.click(); URL.revokeObjectURL(url);
    showToast('截图已下载', 'success');
  }, 'image/png');
}

// r142: 大象消息 —— 通过 NoCode Supabase Edge Function (nocode-pushmsg) 直接 HTTP 发送
// 接口: POST {SUPABASE_URL}/functions/v1/nocode-pushmsg  Body: { misList: 'mis1,mis2', content: '...' }
const _DAXIANG_API = {
  url: 'https://dbdc3dyni0vleropcc.database.sankuai.com/functions/v1/nocode-pushmsg',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzQ2OTc5MjAwLCJleHAiOjE5MDQ3NDU2MDB9.54suYbGH_YVm7W9N6ynQnViZLakWf5bzEoT0hol9TOw'
};

/**
 * 通过 nocode-pushmsg API 发送大象消息（支持批量 mis）
 * @param {string} misList - 逗号分隔的 mis id，如 'wb_aijunlei,wb_zhangsan'
 * @param {string} content - 消息内容（支持换行 \n 和加粗 **...**）
 * @returns {Promise<{ok:boolean, data?:any, error?:string}>}
 */
async function _daxiangPush(misList, content) {
  try {
    const resp = await fetch(_DAXIANG_API.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + _DAXIANG_API.key,
      },
      body: JSON.stringify({ misList, content })
    });
    const text = await resp.text();
    if (!resp.ok) {
      console.error('[大象推送] HTTP', resp.status, text);
      return { ok: false, error: 'HTTP ' + resp.status + ': ' + text };
    }
    let data;
    try { data = JSON.parse(text); } catch(e) { data = { raw: text }; }
    // API 返回 200 但 body 可能含"失败"（如数字ID导致参数不合法）
    const bodyStr = typeof data.personalPush === 'string' ? data.personalPush : '';
    if (bodyStr.includes('失败') || bodyStr.includes('error') || bodyStr.includes('40001')) {
      console.error('[大象推送] API返回失败:', data);
      return { ok: false, error: bodyStr };
    }
    console.log('[大象推送] 成功:', data);
    return { ok: true, data };
  } catch (err) {
    console.error('[大象推送] 网络错误:', err);
    return { ok: false, error: err.message };
  }
}

/**
 * 批量发送大象消息（逐人发送 + 进度条）
 * @param {Array<{mis:string, name:string, message:string}>} tasks - mis 必填
 * @param {string} label - 进度条标题
 */
async function _daxiangSendBatch(tasks, label) {
  if (!tasks.length) return;
  _daxiangShowProgress(label, tasks.length);
  let successCount = 0, failCount = 0;
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    if (!t.mis) {
      console.error('[大象推送] 跳过: 缺少 mis 号', t.name);
      failCount++;
      _daxiangUpdateProgress(i + 1, tasks.length, t.name, false);
      continue;
    }
    const result = await _daxiangPush(t.mis, t.message);
    if (result.ok) { successCount++; } else { failCount++; }
    _daxiangUpdateProgress(i + 1, tasks.length, t.name, result.ok);
  }
  if (failCount === 0) {
    _daxiangHideProgress(`全部发送成功 (${successCount}人)`, false);
  } else {
    _daxiangHideProgress(`发送完成: ${successCount}成功 / ${failCount}失败`, failCount > 0);
  }
}

// r141: 显示大象发送进度浮窗
function _daxiangShowProgress(label, total) {
  let bar = document.getElementById('__daxiangProgressBar');
  if (bar) bar.remove();
  bar = document.createElement('div');
  bar.id = '__daxiangProgressBar';
  bar.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:99999;background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.15);padding:16px 20px;min-width:280px;font-size:13px;color:#333;border:1px solid #e8e8e8;transition:opacity 0.3s';
  bar.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <div class="dx-progress-spinner" style="width:16px;height:16px;border:2px solid #e8e8e8;border-top-color:#1664FF;border-radius:50%;animation:dxSpin 0.8s linear infinite"></div>
      <span style="font-weight:600;color:#1664FF">${label}</span>
    </div>
    <div id="__dxProgressText" style="color:#666">准备中... (0/${total})</div>
    <div style="background:#f0f0f0;border-radius:4px;height:4px;margin-top:8px;overflow:hidden">
      <div id="__dxProgressFill" style="width:0%;height:100%;background:linear-gradient(90deg,#1664FF,#4E8FFF);border-radius:4px;transition:width 0.3s"></div>
    </div>
    <style>@keyframes dxSpin{to{transform:rotate(360deg)}}</style>
  `;
  document.body.appendChild(bar);
}

function _daxiangUpdateProgress(current, total, name, success) {
  const pct = Math.round((current / total) * 100);
  const textEl = document.getElementById('__dxProgressText');
  const fillEl = document.getElementById('__dxProgressFill');
  if (textEl) textEl.textContent = success !== false
    ? `✓ 已发送: ${name} (${current}/${total})`
    : `✗ 发送失败: ${name} (${current}/${total})`;
  if (fillEl) fillEl.style.width = pct + '%';
}

function _daxiangHideProgress(msg, isError) {
  const bar = document.getElementById('__daxiangProgressBar');
  if (!bar) return;
  bar.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px">
      <span style="font-size:16px">${isError ? '⚠️' : '✅'}</span>
      <span style="font-weight:600;color:${isError ? '#F5222D' : '#00B365'}">${msg}</span>
    </div>
  `;
  setTimeout(() => { if (bar.parentNode) { bar.style.opacity = '0'; setTimeout(() => bar.remove(), 300); } }, 3000);
}

// r145: 加急提醒（单人）—— 使用加急模板 + 考勤卡片
function _attNotifyUrge(memberId) {
  const m = MEMBERS_DATA.find(x => x.id === memberId);
  if (!m) return;
  const ym = _attNotifyMonth;
  const data = loadAttNotify(ym);
  const tpls = _attLoadTemplates();

  // 1) 系统通知 —— 使用 sys_urge 模板
  const sysText = _attRenderTpl(tpls.sys_urge.text, m.name, ym, m.id);
  ANNOUNCEMENTS_DATA.unshift({
    id: Date.now(), type: 'p1', status: 'unread',
    title: `【加急】${parseInt(ym.split('-')[1])}月考勤确认提醒`,
    text: sysText,
    createdAt: new Date().toISOString().slice(0, 10),
    createdBy: CURRENT_USER.name || '系统管理员',
    targetMemberId: memberId,
    attNotifyMonth: ym,
    isUrge: true,
  });
  saveAnnouncements();

  // 2) 大象通知 —— 使用 dx_urge 模板
  if (m.mis) {
    const dxText = _attRenderTpl(tpls.dx_urge.text, m.name, ym, m.id, 'daxiang');
    _daxiangSendBatch([{ mis: m.mis, name: m.name, message: dxText }], `加急提醒 ${m.name}`);
  } else {
    showToast(`${m.name} 未配置MIS号，仅发送系统通知`, 'warning');
  }

  // 3) 记录加急时间 + 更新通知正文
  if (data && data.members[memberId]) {
    data.members[memberId].lastUrgedAt = Date.now();
    data.members[memberId].notifyText = sysText;
    saveAttNotify(ym, data);
  }
  showToast(`已向 ${m.name} 发送加急提醒（系统+大象）`, 'success', 3000);
  _renderAttNotifyDetailContent();
}

// r145: 重发大象通知（单人）—— 使用 dx_confirm 模板
function _attResendDaxiang(memberId) {
  const m = MEMBERS_DATA.find(x => x.id === memberId);
  if (!m) return;
  if (!m.mis) { showToast(`${m.name} 未配置MIS号，无法发送大象消息`, 'warning'); return; }
  const ym = _attNotifyMonth;
  const tpls = _attLoadTemplates();
  const dxText = _attRenderTpl(tpls.dx_confirm.text, m.name, ym, m.id, 'daxiang');
  _daxiangSendBatch([{ mis: m.mis, name: m.name, message: dxText }], `重发大象通知·${m.name}`);
  const data = loadAttNotify(ym);
  if (data && data.members[memberId]) {
    data.members[memberId].daxiangSentAt = Date.now();
    saveAttNotify(ym, data);
  }
}

// r145: 重发系统通知（单人）—— 使用 sys_confirm 模板
function _attResendSystem(memberId) {
  const m = MEMBERS_DATA.find(x => x.id === memberId);
  if (!m) return;
  const ym = _attNotifyMonth;
  const tpls = _attLoadTemplates();
  const sysText = _attRenderTpl(tpls.sys_confirm.text, m.name, ym, m.id);
  ANNOUNCEMENTS_DATA.unshift({
    id: Date.now(), type: 'info', status: 'unread',
    title: `${parseInt(ym.split('-')[1])}月考勤通知（重发）`,
    text: sysText,
    createdAt: new Date().toISOString().slice(0, 10),
    createdBy: CURRENT_USER.name || '系统管理员',
    targetMemberId: memberId,
    attNotifyMonth: ym,
  });
  saveAnnouncements();
  // 更新存储中的通知正文
  const data = loadAttNotify(ym);
  if (data && data.members[memberId]) {
    data.members[memberId].notifyText = sysText;
    saveAttNotify(ym, data);
  }
  showToast(`已向 ${m.name} 重发系统通知`, 'success');
}

// r145: 重发系统+大象通知（单人）
function _attResendBoth(memberId) {
  _attResendSystem(memberId);
  _attResendDaxiang(memberId);
  const m = MEMBERS_DATA.find(x => x.id === memberId);
  showToast(`已向 ${m?.name || '成员'} 重发系统+大象通知`, 'success');
}

// r145: 再次提醒全部未确认 —— 使用加急模板批量发送
function _attNotifyRemindAll() {
  const ym = _attNotifyMonth;
  const data = loadAttNotify(ym);
  if (!data) return;
  const monthNum = parseInt(ym.split('-')[1]);
  const tpls = _attLoadTemplates();
  const unconfirmedIds = Object.keys(data.members).filter(id => !data.members[id].confirmed && !data.members[id].disputed);
  if (!unconfirmedIds.length) { showToast('所有人已确认或已提交异议', 'success'); return; }

  // 系统通知（一条总公告）
  ANNOUNCEMENTS_DATA.unshift({
    id: Date.now(), type: 'p1', status: 'unread',
    title: `【加急】${monthNum}月考勤确认催促`,
    text: `${monthNum}月考勤数据仍有 ${unconfirmedIds.length} 人未确认，请尽快登录审核管理系统完成确认。逾期未确认将视为默认无异议。`,
    createdAt: new Date().toISOString().slice(0, 10),
    createdBy: CURRENT_USER.name || '系统管理员',
    attNotifyMonth: ym,
    isUrge: true,
  });
  saveAnnouncements();

  // 大象通知（逐人使用 dx_urge 模板）
  const tasks = [];
  const now = Date.now();
  unconfirmedIds.forEach(id => {
    const m = MEMBERS_DATA.find(x => x.id === parseInt(id));
    if (m && m.mis) {
      const dxText = _attRenderTpl(tpls.dx_urge.text, m.name, ym, m.id, 'daxiang');
      tasks.push({ mis: m.mis, name: m.name, message: dxText });
    }
    if (data.members[id]) {
      data.members[id].lastUrgedAt = now;
      data.members[id].daxiangSentAt = now;
      // 同时更新系统通知正文为加急版
      const sysUrgeText = _attRenderTpl(tpls.sys_urge.text,
        MEMBERS_DATA.find(x => x.id === parseInt(id))?.name || '', ym, parseInt(id));
      data.members[id].notifyText = sysUrgeText;
    }
  });
  saveAttNotify(ym, data);

  if (tasks.length) {
    _daxiangSendBatch(tasks, `批量加急提醒 ${tasks.length} 人`);
  }
  showToast(`已向 ${unconfirmedIds.length} 人发送加急提醒（系统+大象）`, 'success', 3000);
  _renderAttNotifyDetailContent();
}

// ===== 考勤通知 — 全部团队进展弹窗（右侧点击触发，参照排班数据 showOndutyStatDetail）=====
function _showAttNotifyTeamProgressModal() {
  const ym = _attNotifyMonth;
  const [y, m] = ym.split('-');
  const data = loadAttNotify(ym);
  const members = MEMBERS_DATA.filter(x => !x.excludeFromSchedule);
  const sent = data && data.sent;

  // 按团队分组
  const teamOrder = [];
  const teamMap = {};
  members.forEach(x => {
    if (!teamMap[x.team]) {
      teamMap[x.team] = { total: 0, confirmed: 0, disputed: 0, pending: 0, members: [] };
      teamOrder.push(x.team);
    }
    const tm = teamMap[x.team];
    tm.total++;
    const ms = sent && data.members[x.id] ? data.members[x.id] : {};
    const isConf = ms.confirmed || (ms.disputed && ms.disputeResolved);
    const isDisp = ms.disputed && !ms.disputeResolved;
    if (isConf) tm.confirmed++;
    else if (isDisp) tm.disputed++;
    else tm.pending++;
    tm.members.push({ name: x.name, status: isConf ? 'confirmed' : isDisp ? 'disputed' : 'pending', ms });
  });

  // 渲染单个团队卡片
  function renderTeamBlock(team) {
    const t = teamMap[team];
    const confPct = t.total ? Math.round(t.confirmed / t.total * 100) : 0;
    const pctColor = confPct >= 80 ? '#00B42A' : confPct >= 50 ? '#FF9500' : '#F53F3F';

    // 分组：已确认、有异议、待确认
    const groups = [
      { key: 'confirmed', label: '已确认', color: '#52C41A', bg: '#F6FFED', items: t.members.filter(m => m.status === 'confirmed') },
      { key: 'disputed',  label: '有异议', color: '#CF1322', bg: '#FFF1F0', items: t.members.filter(m => m.status === 'disputed') },
      { key: 'pending',   label: '待确认', color: '#8C8C8C', bg: '#FAFAFA', items: t.members.filter(m => m.status === 'pending') }
    ];

    let rows = '';
    groups.forEach(g => {
      if (!g.items.length) return;
      rows += '<div style="margin-bottom:10px">'
        + '<div style="font-size:12px;font-weight:700;color:' + g.color + ';margin-bottom:5px;display:flex;align-items:center;gap:5px;padding-bottom:4px;border-bottom:1px solid ' + g.color + '18">'
        + '<span style="width:8px;height:8px;border-radius:50%;background:' + g.color + ';flex-shrink:0"></span>'
        + '<span>' + g.label + '</span>'
        + '<span style="margin-left:auto;font-size:11px;font-weight:500">' + g.items.length + '人</span>'
        + '</div>'
        + '<div style="display:flex;flex-wrap:wrap;gap:4px">'
        + g.items.map(p => {
            let extra = '';
            if (p.ms.disputeResolved) extra = ' (异议已处理)';
            return '<span style="font-size:12.5px;padding:2px 8px;background:' + g.bg + ';border-radius:5px;color:' + g.color + ';font-weight:500">' + p.name + extra + '</span>';
          }).join('')
        + '</div></div>';
    });

    return '<div style="background:#fff;border:1px solid #E5E8EF;border-radius:10px;padding:14px 14px 10px;box-shadow:0 1px 4px rgba(0,0,0,0.04)">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding-bottom:10px;border-bottom:2px solid #F2F3F5">'
      + '<div style="display:flex;align-items:center;gap:7px">'
      + '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="6" cy="5" r="2.5" stroke="#1664FF" stroke-width="1.4"/><circle cx="11" cy="5" r="2" stroke="#1664FF" stroke-width="1.3" opacity="0.5"/><path d="M1.5 13c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" stroke="#1664FF" stroke-width="1.4" stroke-linecap="round"/><path d="M12 9c1.5.5 2.5 1.8 2.5 4" stroke="#1664FF" stroke-width="1.3" stroke-linecap="round" opacity="0.5"/></svg>'
      + '<span style="font-size:15px;font-weight:800;color:#1d2129">' + team + '</span>'
      + '</div>'
      + '<div style="display:flex;align-items:center;gap:6px">'
      + '<span style="font-size:20px;font-weight:800;color:' + pctColor + ';line-height:1">' + t.confirmed + '</span>'
      + '<span style="font-size:13px;color:#86909C">/ ' + t.total + ' 人</span>'
      + '<span style="font-size:11px;font-weight:700;color:' + pctColor + ';background:' + pctColor + '18;padding:1px 6px;border-radius:4px;margin-left:2px">' + confPct + '%</span>'
      + '</div>'
      + '</div>'
      + (sent ? (rows || '<div style="font-size:13px;color:#86909C;text-align:center;padding:16px 0">暂无数据</div>') : '<div style="font-size:13px;color:#86909C;text-align:center;padding:16px 0;display:flex;flex-direction:column;align-items:center;gap:6px"><svg width="28" height="28" viewBox="0 0 28 28" fill="none" style="opacity:0.3"><path d="M14 3.5a8 8 0 018 8v6l3 4H3l3-4v-6a8 8 0 018-8z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M10 25a4 4 0 008 0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>尚未发送通知</div>')
      + '</div>';
  }

  // 按自定义顺序排列团队
  var _orderedTeamOrder = _sortTeamsByOrder(teamOrder);

  // 动态列数
  const teamCount = _orderedTeamOrder.length;
  const gridCols = teamCount <= 2 ? teamCount : teamCount <= 4 ? Math.min(teamCount, 3) : Math.min(teamCount, 4);
  const modalWidth = gridCols <= 2 ? 560 : gridCols === 3 ? 780 : 960;

  // 拖拽排序栏
  var dragBar = '<div style="margin-bottom:14px;padding:10px 14px;background:#F7F8FA;border-radius:10px;border:1px solid #E5E8EF">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'
    + '<span style="font-size:12px;font-weight:700;color:#1d2129">拖拽调整团队顺序</span>'
    + '<span style="font-size:11px;color:#86909C">前 4 个团队将展示在卡片右侧</span>'
    + '</div>'
    + '<div id="attTeamDragWrap" style="display:flex;flex-wrap:wrap;gap:6px">'
    + _orderedTeamOrder.map(function(team, i) {
        var highlight = i < 4 ? 'background:#3370FF;color:#fff;border-color:#3370FF' : 'background:#fff;color:#1d2129;border-color:#C9CDD4';
        return '<div class="sc5-drag-tag" draggable="true" data-team="' + team + '" style="padding:4px 12px;border-radius:6px;font-size:12px;font-weight:600;cursor:grab;border:1.5px solid;user-select:none;transition:all 0.15s;' + highlight + '">'
          + (i < 4 ? '<span style="font-size:10px;opacity:0.7;margin-right:3px">' + (i + 1) + '</span>' : '')
          + (team.endsWith('团队') ? team : team + '团队') + '</div>';
      }).join('')
    + '</div></div>';

  const content = dragBar
    + '<div style="display:grid;grid-template-columns:repeat(' + gridCols + ',1fr);gap:14px;align-items:start">'
    + _orderedTeamOrder.map(renderTeamBlock).join('')
    + '</div>';

  openModal(
    y + '年' + parseInt(m) + '月 考勤通知 · 全部团队确认进展',
    content,
    '<button class="btn btn-default" onclick="closeModal()">关闭</button>',
    modalWidth
  );

  // 绑定拖拽事件
  _initTeamDragSort('attTeamDragWrap', function() {
    // 拖拽完成后刷新考勤统计页面卡片
    if (typeof renderAttendancePage === 'function') {
      var container = document.getElementById('contentArea');
      if (container) renderAttendancePage(container);
    }
  });
}

// r135: 详情弹窗（全屏 modal，团队分组 + Tab 筛选）
let _attNotifyDetailTab = 'all';
function _showAttNotifyDetailModal() {
  const ym = _attNotifyMonth;
  const data = loadAttNotify(ym);
  const members = MEMBERS_DATA.filter(x => !x.excludeFromSchedule);
  if (!data || !data.sent) { showToast('暂未发送通知', 'warning'); return; }

  let overlay = document.getElementById('attNotifyDetailOverlay');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'attNotifyDetailOverlay';
  overlay.className = 'att-modal-overlay';
  overlay.innerHTML = `
    <div class="att-modal att-detail-modal" onclick="event.stopPropagation()">
      <div class="att-modal-header">
        <span class="att-modal-title">${parseInt(ym.split('-')[1])}月考勤通知详情</span>
        <span class="att-modal-subtitle">发送于 ${new Date(data.sentAt).toLocaleDateString()} · ${data.sentBy}${data.channels?.includes('daxiang') ? ' · 含大象渠道' : ''}</span>
        <button class="att-modal-close" onclick="document.getElementById('attNotifyDetailOverlay').remove()">&times;</button>
      </div>
      <div id="attNotifyDetailContent"></div>
    </div>`;
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('att-modal-overlay-show'));
  _renderAttNotifyDetailContent();
}

// r144: 渲染详情弹窗内容（UI 优化：色条+单行状态+胶囊按钮+橙红加急）
function _renderAttNotifyDetailContent() {
  const container = document.getElementById('attNotifyDetailContent');
  if (!container) return;
  const ym = _attNotifyMonth;
  const data = loadAttNotify(ym);
  const members = MEMBERS_DATA.filter(x => !x.excludeFromSchedule);
  if (!data) return;

  const total = members.length;
  // r153-fix: 异议已处理的视为已确认（兼容存量数据 disputed=true + disputeResolved=true）
  const _isConfirmed = (ms) => ms?.confirmed || (ms?.disputed && ms?.disputeResolved);
  const _isDisputed  = (ms) => ms?.disputed && !ms?.disputeResolved;
  const confirmedCount = members.filter(x => _isConfirmed(data.members[x.id])).length;
  const disputedCount = members.filter(x => _isDisputed(data.members[x.id])).length;
  const pendingCount = total - confirmedCount - disputedCount;
  const readCount = members.filter(x => data.members[x.id]?.read).length;
  const tab = _attNotifyDetailTab;

  // 按 Tab 筛选
  let filtered = members;
  if (tab === 'pending') filtered = members.filter(x => !_isConfirmed(data.members[x.id]) && !_isDisputed(data.members[x.id]));
  else if (tab === 'confirmed') filtered = members.filter(x => _isConfirmed(data.members[x.id]));
  else if (tab === 'disputed') filtered = members.filter(x => _isDisputed(data.members[x.id]));

  // 按团队分组
  const teamGroups = {};
  filtered.forEach(x => {
    if (!teamGroups[x.team]) teamGroups[x.team] = [];
    teamGroups[x.team].push(x);
  });

  // 格式化时间为简洁形式
  function _fmtTime(ts) {
    if (!ts) return '--';
    const d = new Date(ts);
    return (d.getMonth()+1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
  }

  const tabBtn = (key, label, count, color) =>
    `<button class="att-detail-tab${tab === key ? ' att-detail-tab-active' : ''}" onclick="_attNotifyDetailTab='${key}';_renderAttNotifyDetailContent()" style="${tab === key ? 'background:' + color + ';color:#fff' : ''}">
      ${label} <span class="att-detail-tab-count" style="${tab === key ? 'background:rgba(255,255,255,0.3);color:#fff' : ''}">${count}</span>
    </button>`;

  // r160: 确认率环形进度 SVG
  const _ratePct = total ? Math.round(confirmedCount / total * 100) : 0;
  const _rateCirc = 2 * Math.PI * 15; // r=15
  const _rateOffset = _rateCirc * (1 - _ratePct / 100);
  const _rateColor = _ratePct >= 100 ? '#52C41A' : _ratePct >= 60 ? '#1664FF' : _ratePct >= 30 ? '#FA8C16' : '#CF1322';

  let html = `
    <div class="att-detail-stats-bar">
      <div class="att-detail-stat-chip" data-type="confirmed" style="border-color:rgba(82,196,26,0.15)">
        <div class="att-detail-stat-icon" style="background:rgba(82,196,26,0.1)">✅</div>
        <div class="att-detail-stat-info"><span class="att-detail-stat-num" style="color:#52C41A">${confirmedCount}</span><span class="att-detail-stat-label">已确认</span></div>
      </div>
      <div class="att-detail-stat-chip" data-type="disputed" style="border-color:rgba(207,19,34,0.15)">
        <div class="att-detail-stat-icon" style="background:rgba(207,19,34,0.08)">⚠️</div>
        <div class="att-detail-stat-info"><span class="att-detail-stat-num" style="color:#CF1322">${disputedCount}</span><span class="att-detail-stat-label">有异议</span></div>
      </div>
      <div class="att-detail-stat-chip" data-type="pending" style="border-color:rgba(0,0,0,0.06)">
        <div class="att-detail-stat-icon" style="background:rgba(0,0,0,0.04)">⏳</div>
        <div class="att-detail-stat-info"><span class="att-detail-stat-num" style="color:var(--text-tertiary)">${pendingCount}</span><span class="att-detail-stat-label">待确认</span></div>
      </div>
      <div class="att-detail-stat-chip" data-type="rate" style="border-color:rgba(22,100,255,0.12)">
        <svg class="att-detail-rate-ring" viewBox="0 0 38 38">
          <circle cx="19" cy="19" r="15" fill="none" stroke="rgba(0,0,0,0.06)" stroke-width="3"/>
          <circle cx="19" cy="19" r="15" fill="none" stroke="${_rateColor}" stroke-width="3"
            stroke-dasharray="${_rateCirc}" stroke-dashoffset="${_rateOffset}"
            stroke-linecap="round" transform="rotate(-90 19 19)"/>
          <text x="19" y="20" text-anchor="middle" dominant-baseline="central"
            font-size="10" font-weight="800" fill="${_rateColor}">${_ratePct}%</text>
        </svg>
        <div class="att-detail-stat-info"><span class="att-detail-stat-num" style="color:${_rateColor}">${_ratePct}%</span><span class="att-detail-stat-label">确认率</span></div>
      </div>
      <div class="att-detail-stat-chip" data-type="read" style="border-color:rgba(114,46,209,0.12)">
        <div class="att-detail-stat-icon" style="background:rgba(114,46,209,0.08)">👁️</div>
        <div class="att-detail-stat-info"><span class="att-detail-stat-num" style="color:#722ED1">${readCount}</span><span class="att-detail-stat-label">已读</span></div>
      </div>
    </div>
    <div class="att-detail-tabs">
      ${tabBtn('all', '全部', total, '#1664FF')}
      ${tabBtn('pending', '待确认', pendingCount, '#8C8C8C')}
      ${tabBtn('confirmed', '已确认', confirmedCount, '#52C41A')}
      ${tabBtn('disputed', '有异议', disputedCount, '#CF1322')}
    </div>
    <div class="att-detail-list">`;

  if (!filtered.length) {
    html += '<div class="att-detail-empty">当前筛选条件下无人员</div>';
  } else {
    Object.entries(teamGroups).forEach(([team, teamMembers]) => {
      const teamConf = teamMembers.filter(x => _isConfirmed(data.members[x.id])).length;
      const teamDisp = teamMembers.filter(x => _isDisputed(data.members[x.id])).length;
      html += `<div class="att-detail-team-group">
        <div class="att-detail-team-header">
          <span class="att-detail-team-name">${team}</span>
          <span class="att-detail-team-stat">${teamConf}/${teamMembers.length} 已确认${teamDisp ? '，' + teamDisp + ' 异议' : ''}</span>
        </div>`;
      teamMembers.forEach(x => {
        const ms = data.members[x.id] || {};
        const _mc = _isConfirmed(ms), _md = _isDisputed(ms);
        const stCls = _mc ? 'confirmed' : _md ? 'disputed' : 'pending';
        const stLabel = _mc ? (ms.disputeResolved ? '异议已处理' : '已确认') : _md ? '有异议' : '待确认';

        // r160: 时间信息拆分为 meta 区域
        const firstSent = _fmtTime(ms.firstSentAt || data.sentAt);
        const readLabel = ms.read ? '已读' : '未读';
        const confirmedTime = _mc && ms.confirmedAt ? _fmtTime(ms.confirmedAt) : _md && ms.disputedAt ? _fmtTime(ms.disputedAt) : ms.disputeResolved && ms.disputeResolvedAt ? _fmtTime(ms.disputeResolvedAt) : '';
        // meta 时间片段
        let metaParts = [];
        if (confirmedTime) metaParts.push(confirmedTime);
        metaParts.push(firstSent);
        metaParts.push(readLabel);
        if (ms.lastUrgedAt) metaParts.push('加急 ' + _fmtTime(ms.lastUrgedAt));
        const metaHtml = metaParts.map((p, i) => (i > 0 ? '<span class="att-dm-meta-dot"></span>' : '') + p).join('');

        // 头像取姓名最后一个字
        const avatarChar = x.name ? x.name.slice(-1) : '?';

        html += `<div class="att-detail-member-row att-detail-st-${stCls}">
          <div class="att-dm-bar att-dm-bar-${stCls}"></div>
          <div class="att-dm-body">
            <div class="att-dm-top">
              <div class="att-dm-avatar att-dm-avatar-${stCls}">${avatarChar}</div>
              <span class="att-dm-name">${x.name}</span>
              <span class="att-dm-badge att-dm-badge-${stCls}">${stLabel}</span>
              <span class="att-dm-meta">${metaHtml}</span>
            </div>
            ${_md && ms.disputeReason ? '<div class="att-detail-dispute-reason" style="margin-left:36px"><svg width="11" height="11" viewBox="0 0 14 14" fill="none" style="flex-shrink:0;margin-top:1px"><circle cx="7" cy="7" r="5.5" stroke="#CF1322" stroke-width="1.2"/><path d="M7 4.5v3M7 9.5v.01" stroke="#CF1322" stroke-width="1.3" stroke-linecap="round"/></svg>' + ms.disputeReason + '</div>' : ''}
            ${ms.disputeResolved ? '<div class="att-detail-dispute-resolved"><svg width="11" height="11" viewBox="0 0 14 14" fill="none" style="flex-shrink:0;margin-top:1px"><circle cx="7" cy="7" r="5.5" stroke="#52C41A" stroke-width="1.2"/><path d="M4.5 7l2 2 3-3" stroke="#52C41A" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg><span>异议已处理' + (ms.disputeResolvedBy ? '（' + ms.disputeResolvedBy + '）' : '') + (ms.disputeResolveNote ? '：' + ms.disputeResolveNote : '') + '</span></div>' : ''}
            <div class="att-dm-actions">
              ${_md ? `
              <button class="att-pill att-pill-resolve" onclick="event.stopPropagation();_attResolveDispute(${x.id})" title="确认已处理该异议">✅ 标记已处理</button>
              <button class="att-pill att-pill-reject" onclick="event.stopPropagation();_attRejectDispute(${x.id})" title="驳回异议，恢复为待确认">❌ 驳回异议</button>
              ` : ''}
              <button class="att-pill att-pill-dx" onclick="event.stopPropagation();_attResendDaxiang(${x.id})" title="重发大象通知">🐘 大象</button>
              <button class="att-pill att-pill-sys" onclick="event.stopPropagation();_attResendSystem(${x.id})" title="重发系统通知">📢 系统</button>
              <button class="att-pill att-pill-both" onclick="event.stopPropagation();_attResendBoth(${x.id})" title="重发系统+大象">📤 双发</button>
              <button class="att-pill att-pill-urge" onclick="event.stopPropagation();_attNotifyUrge(${x.id})" title="加急（系统+大象双通知）">🚨 加急</button>
            </div>
          </div>
        </div>`;
      });
      html += '</div>';
    });
  }

  html += '</div>';

  // 底部操作栏（r144: 橙红渐变按钮）
  const pendingMembers = members.filter(x => !_isConfirmed(data.members[x.id]) && !_isDisputed(data.members[x.id]));
  if (pendingMembers.length) {
    html += `<div class="att-detail-footer">
      <button class="att-pill-urge-all" onclick="_attNotifyRemindAll()">
        🚨 全部加急提醒 (${pendingMembers.length}人·系统+大象)
      </button>
    </div>`;
  }

  container.innerHTML = html;
}

// 考勤通知月份切换（同时切换全局 attFilterMonth）
function _attNotifyChangeMonth(val) {
  _attNotifyMonth = val;
  _attNotifyDropdownOpen = false;
  _attMonthSwitch(val);
}

// ---- 考勤月份选择弹窗（复用排班日历 mp- 风格） ----
let _attMpYear = null;
function _showAttMonthPicker() {
  const [yStr, mStr] = attFilterMonth.split('-');
  const curYear = parseInt(yStr);
  const curMonth = parseInt(mStr);
  _attMpYear = curYear;

  const content = `
    <div class="mp-wrap">
      <div class="mp-year-row">
        <button class="mp-year-btn" onclick="_attMpChangeYear(-1)">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 2.5L4.5 7L9 11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <span class="mp-year-label" id="attMpYearLabel" onclick="_attMpYearClick()" title="点击直接输入年份" style="cursor:pointer;user-select:none">${curYear}</span>
        <button class="mp-year-btn" onclick="_attMpChangeYear(1)">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 2.5L9.5 7L5 11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
      <div id="attMpMonthGrid" class="mp-grid">
        ${_attMpGridHtml(curYear, curMonth)}
      </div>
      <div class="mp-footer">
        <button class="btn btn-ghost btn-sm" onclick="_attMpGoToday()">回到本月</button>
      </div>
    </div>
  `;

  openModal('选择月份', content, '', '320px');
}

function _attMpChangeYear(delta) {
  const label = document.getElementById('attMpYearLabel');
  if (!label) return;
  _attMpYear = (_attMpYear || parseInt(attFilterMonth.split('-')[0])) + delta;
  label.textContent = _attMpYear;
  const grid = document.getElementById('attMpMonthGrid');
  if (grid) grid.innerHTML = _attMpGridHtml(_attMpYear, parseInt(attFilterMonth.split('-')[1]));
}

function _attMpGoToday() {
  const today = new Date();
  const val = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  closeModal();
  _attNotifyChangeMonth(val);
}

function _attMpGridHtml(year, selectedMonth) {
  const today = new Date();
  const todayY = today.getFullYear(), todayM = today.getMonth() + 1;
  const [selY, selM] = attFilterMonth.split('-').map(Number);
  return Array.from({length: 12}, (_, i) => i + 1).map(m => {
    const isSelected = (year === selY && m === selM);
    const isToday    = (year === todayY && m === todayM);
    const hasData    = !!loadScheduleData(year, m);
    return `<button class="mp-month-btn${isSelected ? ' mp-selected' : ''}${isToday ? ' mp-today' : ''}" onclick="_attMpPick(${m},${year})">
      <span class="mp-month-num">${m}</span>
      <span class="mp-month-unit">月</span>
      ${hasData ? '<span class="mp-has-data-dot"></span>' : ''}
      ${isToday ? '<span class="mp-today-dot"></span>' : ''}
    </button>`;
  }).join('');
}

function _attMpPick(month, year) {
  const y = year || _attMpYear || parseInt(attFilterMonth.split('-')[0]);
  _attMpYear = null;
  closeModal();
  const val = `${y}-${String(month).padStart(2, '0')}`;
  _attNotifyChangeMonth(val);
}

function _attMpYearClick() {
  const label = document.getElementById('attMpYearLabel');
  if (!label) return;
  const curVal = _attMpYear || parseInt(attFilterMonth.split('-')[0]);
  const today = new Date();
  const minY = today.getFullYear() - 3;
  const maxY = today.getFullYear() + 2;
  const input = document.createElement('input');
  input.type = 'number';
  input.value = curVal;
  input.min = minY;
  input.max = maxY;
  input.className = 'mp-year-input';
  input.style.cssText = 'width:60px;text-align:center;font-size:15px;font-weight:600;border:none;border-bottom:2px solid #3370FF;outline:none;background:transparent;color:inherit;padding:0 2px';
  label.replaceWith(input);
  input.focus();
  input.select();
  const commit = () => {
    let v = parseInt(input.value);
    if (isNaN(v)) v = curVal;
    v = Math.max(minY, Math.min(maxY, v));
    _attMpYear = v;
    const span = document.createElement('span');
    span.className = 'mp-year-label';
    span.id = 'attMpYearLabel';
    span.textContent = v;
    span.onclick = _attMpYearClick;
    span.title = '点击直接输入年份';
    span.style.cssText = 'cursor:pointer;user-select:none';
    input.replaceWith(span);
    const grid = document.getElementById('attMpMonthGrid');
    if (grid) grid.innerHTML = _attMpGridHtml(v, parseInt(attFilterMonth.split('-')[1]));
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
}


// ---- 考勤看板下拉弹窗（复用排班日历 sch-team-popup 交互风格） ----
const _attDpMap = {
  team:    { btnId: 'attDpTeamBtn',    popupId: 'attDpTeamPopup' },
  anomaly: { btnId: 'attDpAnomalyBtn', popupId: 'attDpAnomalyPopup' }
};

// 团队筛选的标签映射
function _attTeamLabel(v) {
  if (v === 'all') return '团队全员';
  if (v === 'self') return '仅看自己';
  if (v === 'allteams') return '全部团队';
  return v;
}

// 按 attFilterTeam 过滤成员列表
function _attFilterMembers(members) {
  if (attFilterTeam === 'self') {
    return members.filter(m => m.mis === CURRENT_USER.mis);
  }
  if (attFilterTeam !== 'all' && attFilterTeam !== 'allteams') {
    return members.filter(m => m.team === attFilterTeam);
  }
  return members; // 'all' 和 'allteams' 不过滤
}

function _attDpToggle(key, e) {
  e && e.stopPropagation();
  const cfg = _attDpMap[key];
  if (!cfg) return;
  const popup = document.getElementById(cfg.popupId);
  const btn   = document.getElementById(cfg.btnId);
  if (!popup) return;
  const isOpen = popup.classList.contains('open');
  // 先关闭所有已打开的考勤弹窗
  _attDpCloseAll();
  if (!isOpen) {
    // 定位弹窗到按钮下方
    if (btn) {
      const rect = btn.getBoundingClientRect();
      popup.style.top  = (rect.bottom + 6) + 'px';
      popup.style.left = rect.left + 'px';
    }
    popup.classList.add('open');
    // chevron 旋转
    const chev = btn && (btn.querySelector('.att-dp-chevron') || btn.querySelector('.att-chip-chevron'));
    if (chev) chev.style.transform = 'rotate(180deg)';
    // 点击外部关闭
    setTimeout(() => {
      document.addEventListener('click', _attDpCloseAll, { once: true });
    }, 0);
  }
}

function _attDpCloseAll() {
  Object.values(_attDpMap).forEach(cfg => {
    const popup = document.getElementById(cfg.popupId);
    if (popup) popup.classList.remove('open');
    const btn = document.getElementById(cfg.btnId);
    if (btn) {
      const chev = btn.querySelector('.att-dp-chevron') || btn.querySelector('.att-chip-chevron');
      if (chev) chev.style.transform = '';
    }
  });
}

function _attDpSelect(key, value) {
  _attDpCloseAll();
  if (key === 'team') {
    attFilterTeam = value;
    // 全部团队（按团队维度）不支持其他筛选，自动重置
    if (value === 'allteams') attFilterAnomalyMode = 'all';
  } else if (key === 'anomaly') {
    attFilterAnomalyMode = value;
    // 选了其他筛选时，如果当前是全部团队维度，自动切回团队全员
    if (value !== 'all' && attFilterTeam === 'allteams') attFilterTeam = 'all';
  }
  attOverviewPage = 1;
  _renderAttDashboard();
}

// r122-opt⑥: 刷新筛选 Chip 激活状态 + 提示条
function _refreshAttChipStates() {
  const teamBtn = document.getElementById('attDpTeamBtn');
  if (teamBtn) {
    const isActive = attFilterTeam !== 'all' && attFilterTeam !== 'allteams';
    teamBtn.classList.toggle('att-chip-active', isActive);
  }
  const anomalyBtn = document.getElementById('attDpAnomalyBtn');
  if (anomalyBtn) {
    anomalyBtn.classList.toggle('att-chip-active', attFilterAnomalyMode !== 'all');
  }
  // 筛选提示条
  const hint = document.getElementById('attFilterHint');
  if (hint) {
    const chips = [];
    if (attFilterTeam !== 'all' && attFilterTeam !== 'allteams') chips.push(_attTeamLabel(attFilterTeam));
    if (attFilterAnomalyMode !== 'all') chips.push(({leave:'请假人员',triple:'三薪人员'})[attFilterAnomalyMode] || attFilterAnomalyMode);
    const sv = (document.getElementById('attSearch')?.value || '').trim();
    if (sv) chips.push('搜索: ' + sv);
    if (chips.length) {
      hint.style.display = 'flex';
      hint.innerHTML = '<svg width="12" height="12" viewBox="0 0 14 14" fill="none" style="flex-shrink:0"><path d="M1.5 3.5h10M3.5 6.5h6M5.5 9.5h2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg><span>当前筛选：' + chips.join(' · ') + '</span><button class="att-filter-hint-clear" onclick="attFilterTeam=\'all\';attFilterAnomalyMode=\'all\';var si=document.getElementById(\'attSearch\');if(si)si.value=\'\';attOverviewPage=1;_renderAttDashboard()">清除</button>';
    } else {
      hint.style.display = 'none';
      hint.innerHTML = '';
    }
  }
}

// ---- r99-opt①数值弹入动画触发----
function _triggerAttValueAnim() {
  var rows = document.querySelectorAll('#contentArea .sch-hcard .sc-value-row');
  rows.forEach(function(r) {
    r.classList.remove('att-value-anim');
    // 强制 reflow 后再加回，确保动画重新触发
    void r.offsetWidth;
    r.classList.add('att-value-anim');
  });
  // r102-opt②countUp 数字滚动

  _attCountUpAll();
}

// ---- r102-opt②数值计数动画（countUp：---
function _attCountUpAll() {
  var vals = document.querySelectorAll('#contentArea .sch-hcard .sc-value');
  // 检查prefers-reduced-motion
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  vals.forEach(function(el) {
    var raw = el.textContent.replace(/[,，¥￥%]/g, '');
    var target = parseFloat(raw);
    if (isNaN(target) || target === 0) return;
    var hasYen = el.textContent.indexOf('¥') === 0 || el.innerHTML.indexOf('¥') >= 0;
    var isFloat = raw.indexOf('.') >= 0;
    var decimals = isFloat ? (raw.split('.')[1] || '').length : 0;
    var dur = 600; // ms
    var start = performance.now();
    var _raf = function(now) {
      var t = Math.min((now - start) / dur, 1);
      // easeOutExpo
      var ease = t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
      var cur = target * ease;
      if (isFloat) {
        el.textContent = (hasYen ? '¥' : '') + cur.toFixed(decimals);
      } else {
        var v = Math.round(cur);
        el.textContent = (hasYen ? '¥' : '') + (v >= 1000 ? v.toLocaleString() : v);
      }
      if (t < 1) requestAnimationFrame(_raf);
      else {
        // 确保最终值精确
        if (isFloat) el.textContent = (hasYen ? '¥' : '') + target.toFixed(decimals);
        else el.textContent = (hasYen ? '¥' : '') + (target >= 1000 ? target.toLocaleString() : target);
      }
    };
    requestAnimationFrame(_raf);
  });
}

// ---- r102-opt②迷你折线图Sparkline ----
// 计算近6个月某指标的月度数据数组，返回[{label, value}]
function _attSparklineData(yearStr, monthStr, metricFn) {
  var results = [];
  var y = parseInt(yearStr), m = parseInt(monthStr);
  for (var i = 5; i >= 0; i--) {
    var mm = m - i, yy = y;
    while (mm <= 0) { mm += 12; yy--; }
    var mStr = String(mm).padStart(2, '0'), yStr = String(yy);
    var members = MEMBERS_DATA.filter(function(x) { return !x.excludeFromSchedule; });
    var stats = members.map(function(x) { return _getAttStats(x.id, yStr, mStr); });
    var dim = new Date(yy, mm, 0).getDate();
    results.push({ label: mm + '月', value: metricFn(stats, members.length, dim) });
  }
  return results;
}

// 生成内联 SVG sparkline（宽60 高20），支持目标线targetVal
function _attSparklineSVG(data, color, targetVal) {
  if (!data || data.length < 2) return '';
  var vals = data.map(function(d) { return d.value; });
  var max = Math.max.apply(null, vals);
  var min = Math.min.apply(null, vals);
  // 若有目标值，扩展 min/max 使目标线可见

  if (targetVal != null) {
    if (targetVal > max) max = targetVal;
    if (targetVal < min) min = targetVal;
  }
  var range = max - min || 1;
  var w = 56, h = 18, pad = 2;
  var points = vals.map(function(v, i) {
    var x = pad + (i / (vals.length - 1)) * (w - pad * 2);
    var y = pad + (1 - (v - min) / range) * (h - pad * 2);
    return x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');
  var tipParts = data.map(function(d) { return d.label + ':' + (typeof d.value === 'number' && d.value % 1 ? d.value.toFixed(1) : d.value); });
  // 目标虚线

  var targetLine = '';
  if (targetVal != null) {
    var ty = pad + (1 - (targetVal - min) / range) * (h - pad * 2);
    targetLine = '<line x1="' + pad + '" y1="' + ty.toFixed(1) + '" x2="' + (w - pad) + '" y2="' + ty.toFixed(1) + '" stroke="#FF4D4F" stroke-width="0.8" stroke-dasharray="2,2" opacity="0.65"><title>目标: ' + targetVal + '</title></line>';
  }
  return '<svg class="att-sparkline" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" fill="none" style="flex-shrink:0">' +
    '<title>近月趋势 ' + tipParts.join(' →') + (targetVal != null ? ' | 目标: ' + targetVal : '') + '</title>' +
    targetLine +
    '<polyline points="' + points + '" stroke="' + (color || '#3370FF') + '" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<circle cx="' + points.split(' ').pop().split(',')[0] + '" cy="' + points.split(' ').pop().split(',')[1] + '" r="2" fill="' + (color || '#3370FF') + '"/>' +
    '</svg>';
}

// ---- r102-opt②卡片拖拽排序持久化----
var _attDragSrcEl = null;
function _initAttCardDrag() {
  var container = document.querySelector('#contentArea .schedule-header-cards');
  if (!container) return;
  var cards = Array.from(container.querySelectorAll('.sch-hcard[data-att-card]'));
  if (cards.length < 2) return;

  // 读取保存的顺序并重排 DOM
  try {
    var saved = localStorage.getItem('glxt_att_card_order');
    if (saved) {
      var order = JSON.parse(saved);
      // 将卡片按保存的顺序排列
      order.forEach(function(key) {
        var card = container.querySelector('.sch-hcard[data-att-card="' + key + '"]');
        if (card) container.appendChild(card);
      });
      // 把不在order 中的卡片追加到末尾（新增卡片兼容：      
      cards.forEach(function(c) {
        if (order.indexOf(c.getAttribute('data-att-card')) < 0) container.appendChild(c);
      });
    }
  } catch(e) {}

  // 绑定拖拽事件
  container.querySelectorAll('.sch-hcard[data-att-card]').forEach(function(card) {
    card.setAttribute('draggable', 'true');

    card.addEventListener('dragstart', function(e) {
      _attDragSrcEl = this;
      this.classList.add('att-card-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', this.getAttribute('data-att-card'));
    });

    card.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (_attDragSrcEl === this) return;
      // 视觉提示：在左侧还是右侧

      var rect = this.getBoundingClientRect();
      var midX = rect.left + rect.width / 2;
      if (e.clientX < midX) {
        this.classList.add('att-card-drop-left');
        this.classList.remove('att-card-drop-right');
      } else {
        this.classList.add('att-card-drop-right');
        this.classList.remove('att-card-drop-left');
      }
    });

    card.addEventListener('dragleave', function() {
      this.classList.remove('att-card-drop-left', 'att-card-drop-right');
    });

    card.addEventListener('drop', function(e) {
      e.preventDefault();
      this.classList.remove('att-card-drop-left', 'att-card-drop-right');
      if (!_attDragSrcEl || _attDragSrcEl === this) return;
      // 判断插入位置

      var rect = this.getBoundingClientRect();
      var midX = rect.left + rect.width / 2;
      if (e.clientX < midX) {
        container.insertBefore(_attDragSrcEl, this);
      } else {
        container.insertBefore(_attDragSrcEl, this.nextSibling);
      }
      // 保存新顺序
      var newOrder = Array.from(container.querySelectorAll('.sch-hcard[data-att-card]')).map(function(c) {
        return c.getAttribute('data-att-card');
      });
      localStorage.setItem('glxt_att_card_order', JSON.stringify(newOrder));
    });

    card.addEventListener('dragend', function() {
      this.classList.remove('att-card-dragging');
      container.querySelectorAll('.sch-hcard').forEach(function(c) {
        c.classList.remove('att-card-drop-left', 'att-card-drop-right');
      });
      _attDragSrcEl = null;
    });
  });
}

// ---- 月份切换 —骨架屏过渡----
function _attMonthSwitch(newVal) {
  // 先给当前页面的卡片加上骨架屏 shimmer 效果

  var cards = document.querySelectorAll('#contentArea .sch-hcard');
  cards.forEach(function(c) { c.classList.add('sch-hcard-skeleton'); });
  // r99-opt①月份切换时清除卡片高亮
  document.querySelectorAll('#contentArea .sch-hcard[data-att-card]').forEach(function(c) {
    c.classList.remove('sch-hcard-active');
  });
  // 更新月份后延迟一帧再重绘，让骨架屏可见
  _clearAttCache();
  _attDashExpandedId = null; // r111: 月份切换时收起展开的个人详情
  _attDashExpandedGroup = null; // r113: 月份切换时收起展开的小组详情
  attFilterMonth = newVal;
  requestAnimationFrame(function() {
    setTimeout(function() {
      renderAttendancePage(document.getElementById('contentArea'));
      // r99-opt①重绘后触发数值弹入动画
      requestAnimationFrame(function() { _triggerAttValueAnim(); });
    }, 180);
  });
}

// ---- 主入口----
function renderAttendancePage(container) {
  _clearAttCache();
  attFilterMember = 'all';
  _attPersonExpandedIds.clear();
  _attDetailOpenKey = ''; // r103-opt③重置详情面板

  _attDashExpandedId = null; // r111: 进入考勤页面时重置展开状态
  _attDashExpandedGroup = null; // r113: 进入考勤页面时重置小组展开状态
  const [yearStr, monthStr] = attFilterMonth.split('-');
  const members = MEMBERS_DATA.filter(m => !m.excludeFromSchedule);
  const teams   = [...new Set(members.map(m => m.team))];
  const totalMembers = members.length;

  // 计算汇总数据
  const allStats = members.map(m => ({ m, s: _getAttStats(m.id, yearStr, monthStr) }));
  const totalWork   = allStats.reduce((acc, x) => acc + x.s.workDays, 0);
  const totalLeave  = allStats.reduce((acc, x) => acc + x.s.leaveDays, 0);
  const totalScheduled = allStats.reduce((acc, x) => acc + x.s.scheduledDays, 0); // Bug⑤
  const totalTriple = allStats.reduce((acc, x) => acc + x.s.triplePayDays, 0);
  const totalBDays  = allStats.reduce((acc, x) => acc + x.s.bShiftDays, 0);
  const totalBSubsidy = allStats.reduce((acc, x) => acc + x.s.bShiftSubsidy, 0);
  const daysInMonth = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();
  const avgWork     = totalMembers ? (totalWork / totalMembers).toFixed(1) : 0;
  const avgRate     = totalScheduled ? Math.round((totalWork / totalScheduled) * 100) : 0;
  const triplePayPersons = allStats.filter(x => x.s.triplePayDays > 0).length;
  const bShiftPersons = allStats.filter(x => x.s.bShiftDays > 0).length;

  // 请假类型汇总
  const leaveTypeSummary = {};
  allStats.forEach(({s}) => {
    Object.entries(s.leaveBreakdown).forEach(([k,v]) => {
      leaveTypeSummary[k] = (leaveTypeSummary[k] || 0) + v;
    });
  });
  const leaveTypeStr = Object.entries(leaveTypeSummary).map(([k,v]) => `${k}${v}天`).join(' / ') || '无';

  // 上月数据（环比）

  const prevDate0 = new Date(parseInt(yearStr), parseInt(monthStr) - 2, 1);
  const prevY0 = String(prevDate0.getFullYear());
  const prevM0 = String(prevDate0.getMonth() + 1).padStart(2, '0');
  const prevAllStats = members.map(m => ({ m, s: _getAttStats(m.id, prevY0, prevM0) }));
  const hasPrevData = prevAllStats.some(x => x.s.hasRealData); // r153: 上月是否有真实数据
  const prevTotalWork   = prevAllStats.reduce((acc, x) => acc + x.s.workDays, 0);
  const prevTotalLeave  = prevAllStats.reduce((acc, x) => acc + x.s.leaveDays, 0);
  const prevTotalTriple = prevAllStats.reduce((acc, x) => acc + x.s.triplePayDays, 0);
  const prevTotalBDays  = prevAllStats.reduce((acc, x) => acc + x.s.bShiftDays, 0);
  const prevTotalBSubsidy = prevAllStats.reduce((acc, x) => acc + x.s.bShiftSubsidy, 0);

  // 功能⑤同比（去年同月）

  const { y: yoyY, m: yoyM } = _getYoYMonth(yearStr, monthStr);
  const yoyAllStats = members.map(m => ({ m, s: _getAttStats(m.id, yoyY, yoyM) }));
  const hasYoyData = yoyAllStats.some(x => x.s.hasRealData); // r153: 去年同月是否有真实数据
  const yoyTotalWork   = yoyAllStats.reduce((acc, x) => acc + x.s.workDays, 0);
  const yoyTotalLeave  = yoyAllStats.reduce((acc, x) => acc + x.s.leaveDays, 0);
  const yoyTotalTriple = yoyAllStats.reduce((acc, x) => acc + x.s.triplePayDays, 0);
  const yoyTotalBSubsidy = yoyAllStats.reduce((acc, x) => acc + x.s.bShiftSubsidy, 0);
  const yoyDaysInMonth = new Date(parseInt(yoyY), parseInt(yoyM), 0).getDate();
  const yoyTotalScheduled = yoyAllStats.reduce((acc, x) => acc + x.s.scheduledDays, 0);
  const yoyAvgRate = yoyTotalScheduled ? Math.round((yoyTotalWork / yoyTotalScheduled) * 100) : 0;

  // r101-opt①各团队分项汇总（用于卡片 tooltip）
  const _teamBreakdown = {};
  teams.forEach(t => {
    const tm = allStats.filter(x => x.m.team === t);
    const cnt = tm.length;
    _teamBreakdown[t] = {
      cnt,
      work: tm.reduce((a, x) => a + x.s.workDays, 0),
      leave: tm.reduce((a, x) => a + x.s.leaveDays, 0),
      triple: tm.reduce((a, x) => a + x.s.triplePayDays, 0),
      bDays: tm.reduce((a, x) => a + x.s.bShiftDays, 0),
      bSub: tm.reduce((a, x) => a + x.s.bShiftSubsidy, 0),
    };
  });
  const _tipLine = (t, val) => t + ': ' + val;
  const _tip1 = teams.map(t => { const d = _teamBreakdown[t]; const tSched = allStats.filter(x => x.m.team === t).reduce((a,x) => a + x.s.scheduledDays, 0); const r = tSched ? Math.round(d.work / tSched * 100) : 0; return _tipLine(t, d.cnt + '人· 人均' + (d.cnt ? (d.work / d.cnt).toFixed(1) : 0) + '天· 率' + r + '%'); }).join('\n');
  const _tip2 = teams.map(t => { const d = _teamBreakdown[t]; return _tipLine(t, '¥' + d.bSub.toLocaleString() + ' · ' + d.bDays + '人天'); }).join('\n');
  const _tip3 = teams.map(t => { const d = _teamBreakdown[t]; return _tipLine(t, d.triple + '天· ' + (d.cnt ? (d.triple / d.cnt).toFixed(1) : 0) + '天/人'); }).join('\n');
  const _tip4 = teams.map(t => { const d = _teamBreakdown[t]; return _tipLine(t, d.leave + '天· ' + d.cnt + '人'); }).join('\n');

  // r101-opt①月环比变化率（用于脉冲提醒）

  const _momPct = (cur, prev) => prev ? Math.abs((cur - prev) / prev) : (cur > 0 ? 1 : 0);
  // r153: 无上月数据时不触发脉冲提醒
  const _alertCls1 = hasPrevData && _momPct(totalWork, prevTotalWork) >= 0.2 ? ' sch-hcard-alert-pulse' : '';
  const _alertCls2 = hasPrevData && _momPct(totalBSubsidy, prevTotalBSubsidy) >= 0.2 ? ' sch-hcard-alert-pulse' : '';
  const _alertCls3 = hasPrevData && _momPct(totalTriple, prevTotalTriple) >= 0.2 ? ' sch-hcard-alert-pulse' : '';
  const _alertCls4 = hasPrevData && _momPct(totalLeave, prevTotalLeave) >= 0.2 ? ' sch-hcard-alert-pulse' : '';

  // r102-opt②各卡片Sparkline 数据（近6月趋势）
  const _spark1 = _attSparklineSVG(_attSparklineData(yearStr, monthStr, (ss, cnt, dim) => { var sched = ss.reduce((a,x) => a + x.scheduledDays, 0); return sched ? Math.round(ss.reduce((a,x) => a + x.workDays, 0) / sched * 100) : 0; }), '#3370FF');
  const _spark2 = _attSparklineSVG(_attSparklineData(yearStr, monthStr, (ss) => ss.reduce((a,x) => a + x.bShiftSubsidy, 0)), '#52C41A');
  const _spark3 = _attSparklineSVG(_attSparklineData(yearStr, monthStr, (ss) => ss.reduce((a,x) => a + x.triplePayDays, 0)), '#FA8C16');
  const _spark4 = _attSparklineSVG(_attSparklineData(yearStr, monthStr, (ss) => ss.reduce((a,x) => a + x.leaveDays, 0)), '#722ED1');

  // r105-opt⑤智能诊断气泡（r153: 无上月数据时不诊断）

  const prevTotalScheduled = prevAllStats.reduce((acc, x) => acc + x.s.scheduledDays, 0);
  const _diagMsg1 = hasPrevData ? _attDiagnoseBubble('rate', avgRate, prevTotalScheduled ? Math.round((prevTotalWork / prevTotalScheduled) * 100) : 0, teams, allStats, prevAllStats) : '';
  const _diagMsg2 = hasPrevData ? _attDiagnoseBubble('bdays', totalBSubsidy, prevTotalBSubsidy, teams, allStats, prevAllStats) : '';
  const _diagMsg3 = hasPrevData ? _attDiagnoseBubble('triple', totalTriple, prevTotalTriple, teams, allStats, prevAllStats) : '';
  const _diagMsg4 = hasPrevData ? _attDiagnoseBubble('leave3', totalLeave, prevTotalLeave, teams, allStats, prevAllStats) : '';

  // 环比/同比箭头辅助

  const _kpiTrend = (cur, prev, higherBetter = true, label = '环比') => {
    const diff = parseFloat(cur) - parseFloat(prev);
    if (Math.abs(diff) < 0.05) return `<span class="att-kpi-trend att-kpi-trend-flat">—持平</span>`;
    const up = diff > 0;
    const good = higherBetter ? up : !up;
    return `<span class="att-kpi-trend ${good ? 'att-kpi-trend-up' : 'att-kpi-trend-down'}">${up ? '▲' : '▼'} ${Math.abs(diff) < 1 ? Math.abs(diff).toFixed(1) : Math.round(Math.abs(diff))} ${label}</span>`;
  };

  // ===== r136: 第5张卡片—考勤通知（双栏布局 + 截图 + 完整功能） =====
  const _notifyYm = _attNotifyMonth;
  const _notifyData = loadAttNotify(_notifyYm);
  const _notifySent = _notifyData && _notifyData.sent;
  const _notifyTotal = totalMembers;
  const _notifyConfirmed = _notifySent ? members.filter(x => _notifyData.members[x.id]?.confirmed).length : 0;
  const _notifyDisputed = _notifySent ? members.filter(x => _notifyData.members[x.id]?.disputed).length : 0;
  const _notifyPending = _notifyTotal - _notifyConfirmed - _notifyDisputed;
  const _notifyConfPct = _notifyTotal ? Math.round(_notifyConfirmed / _notifyTotal * 100) : 0;
  // r136: 团队分组进度（按 team 分组统计）+ 团队数组（保持顺序）
  const _notifyTeamArr = [];
  const _notifyTeamMap = {};
  members.forEach(x => {
    if (!_notifyTeamMap[x.team]) {
      _notifyTeamMap[x.team] = { total: 0, confirmed: 0, disputed: 0 };
      _notifyTeamArr.push(x.team);
    }
    _notifyTeamMap[x.team].total++;
    if (_notifySent) {
      const ms = _notifyData.members[x.id];
      if (ms?.confirmed) _notifyTeamMap[x.team].confirmed++;
      else if (ms?.disputed) _notifyTeamMap[x.team].disputed++;
    }
  });

  // 优化⑤检测是否有排班数据

  const hasScheduleData = allStats.some(x => x.s.hasRealData);

  container.innerHTML = `
    ${!hasScheduleData ? `
    <!-- 优化⑤空状态引导-->
    <div style="background:var(--card);border:1px dashed var(--border);border-radius:14px;padding:40px 24px;text-align:center;margin-bottom:18px">
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none" style="margin-bottom:12px;opacity:0.4">
        <rect x="6" y="10" width="44" height="38" rx="5" stroke="currentColor" stroke-width="2"/>
        <path d="M18 4v10M38 4v10M6 22h44" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M22 32l4 4 8-8" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:6px">当月暂无排班数据</div>
      <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:14px">请先在排班日历中录入 ${parseInt(monthStr)} 月的排班，考勤统计将自动关联计算</div>
      <button class="btn btn-primary btn-sm" onclick="navigateTo('schedule')" style="padding:6px 20px">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style="margin-right:4px;vertical-align:-1px"><rect x="1" y="2" width="12" height="11" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M4 1v3M10 1v3M1 6h12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
        前往排班日历
      </button>
    </div>
    ` : ''}

    <!-- ===== KPI 卡片区—复用排班日历 sch-hcard 风格 =====  -->
    <div class="schedule-header-cards" style="margin-bottom:8px">
      <!-- ①团队数据 —浅蓝（点击→总览+按出勤率排序：-->
      <div class="sch-hcard sch-hcard-date${_alertCls1}" data-att-card="rate" style="cursor:pointer" tabindex="0" role="button" title="各团队出勤明细\n${_tip1}" onclick="_attCardRipple(event);attSortKey='rate';attOverviewPage=1;_renderAttDashboard();_syncAttCardActive(this);document.getElementById('attDashboardSection').scrollIntoView({behavior:'smooth',block:'start'})" onkeydown="if(event.key==='Enter')this.click()" oncontextmenu="_attCardContextMenu(event,'rate')" onmouseenter="_attCardCrossHint('rate')" onmouseleave="_attCardCrossHintClear()" ontouchstart="_attCardTouchStart(event,'rate')" ontouchend="_attCardTouchEnd()" ontouchmove="_attCardTouchEnd()">
        <div class="sch-hcard-deco"></div>
        <div class="sch-hcard-inner">
          <div class="sc-label-row">
            <span class="sc-label"><svg width="12" height="12" viewBox="0 0 20 20" fill="none"><circle cx="7" cy="7" r="3" stroke="currentColor" stroke-width="1.5"/><circle cx="13" cy="7" r="3" stroke="currentColor" stroke-width="1.5"/><path d="M1 17c0-3.31 2.69-6 6-6M13 11c3.31 0 6 2.69 6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> 团队数据</span>
            ${_spark1}
          </div>
          <div class="sc-value-row">
            <span class="sc-value">${totalMembers}</span><span class="sc-unit">人</span>
            ${hasYoyData ? _kpiTrend(avgRate, yoyAvgRate, true, '同比') : ''}
          </div>
          <div class="sc-footer-row">
            <span class="sc-footer-item">人均出勤率<b>${avgRate}%</b></span>
            <span class="sc-footer-sep">·</span>
            <span class="sc-footer-item">人均 <b>${avgWork}</b> 天</span>
            ${hasPrevData ? _kpiTrend(totalWork, prevTotalWork) : ''}
            <span class="att-detail-toggle" onclick="event.stopPropagation();_attToggleCardDetail('rate')" title="展开/收起详情">▾</span>
          </div>
        </div>
      </div>

      <!-- ②B班补贴—浅绿（点击→总览+按B班天数排序） -->
      <div class="sch-hcard sch-hcard-rule-ok${_alertCls2}" data-att-card="bdays" style="cursor:pointer" tabindex="0" role="button" title="各团队B班补贴明细\n${_tip2}" onclick="_attCardRipple(event);attSortKey='bdays';attOverviewPage=1;_renderAttDashboard();_syncAttCardActive(this);document.getElementById('attDashboardSection').scrollIntoView({behavior:'smooth',block:'start'})" onkeydown="if(event.key==='Enter')this.click()" oncontextmenu="_attCardContextMenu(event,'bdays')" onmouseenter="_attCardCrossHint('bdays')" onmouseleave="_attCardCrossHintClear()" ontouchstart="_attCardTouchStart(event,'bdays')" ontouchend="_attCardTouchEnd()" ontouchmove="_attCardTouchEnd()">
        <div class="sch-hcard-deco"></div>
        <div class="sch-hcard-inner">
          <div class="sc-label-row">
            <span class="sc-label"><svg width="12" height="12" viewBox="0 0 20 20" fill="none"><rect x="2" y="4" width="16" height="12" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M6 10h8M10 7v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> B班补贴</span>
            ${_spark2}
          </div>
          <div class="sc-value-row">
            <span class="sc-value">&yen;${totalBSubsidy.toLocaleString()}</span>
            ${hasYoyData ? _kpiTrend(totalBSubsidy, yoyTotalBSubsidy, true, '同比') : ''}
          </div>
          <div class="sc-footer-row">
            <span class="sc-footer-item">共<b>${totalBDays}</b> 人天</span>
            <span class="sc-footer-sep">·</span>
            <span class="sc-footer-item"><b>${bShiftPersons}</b> 人</span>
            <span class="sc-footer-sep">·</span>
            <span class="sc-footer-item">${ATT_B_SHIFT_SUBSIDY}元/天</span>
            ${hasPrevData ? _kpiTrend(totalBSubsidy, prevTotalBSubsidy) : ''}
            <span class="att-detail-toggle" onclick="event.stopPropagation();_attToggleCardDetail('bdays')" title="展开/收起详情">▾</span>
          </div>
        </div>
      </div>

      <!-- ③三薪天数 —浅橙（点击→总览+按三薪天数排序） -->
      <div class="sch-hcard sch-hcard-onduty${_alertCls3}" data-att-card="triple" style="cursor:pointer" tabindex="0" role="button" title="各团队三薪明细\n${_tip3}" onclick="_attCardRipple(event);attSortKey='triple';attOverviewPage=1;_renderAttDashboard();_syncAttCardActive(this);document.getElementById('attDashboardSection').scrollIntoView({behavior:'smooth',block:'start'})" onkeydown="if(event.key==='Enter')this.click()" oncontextmenu="_attCardContextMenu(event,'triple')" onmouseenter="_attCardCrossHint('triple')" onmouseleave="_attCardCrossHintClear()" ontouchstart="_attCardTouchStart(event,'triple')" ontouchend="_attCardTouchEnd()" ontouchmove="_attCardTouchEnd()">
        <div class="sch-hcard-deco"></div>
        <div class="sch-hcard-inner">
          <div class="sc-label-row">
            <span class="sc-label"><svg width="12" height="12" viewBox="0 0 20 20" fill="none"><path d="M10 2l2.09 4.26L17 7.27l-3.5 3.41.83 4.82L10 13.27l-4.33 2.23.83-4.82L3 7.27l4.91-.71L10 2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg> 三薪天数</span>
            ${_spark3}
          </div>
          <div class="sc-value-row">
            <span class="sc-value">${totalTriple}</span><span class="sc-unit">天</span>
            ${hasYoyData ? _kpiTrend(totalTriple, yoyTotalTriple, true, '同比') : ''}
          </div>
          <div class="sc-footer-row">
            <span class="sc-footer-item">涉及 <b>${triplePayPersons}</b> 人</span>
            <span class="sc-footer-sep">·</span>
            <span class="sc-footer-item">人均 <b>${totalMembers ? (totalTriple/totalMembers).toFixed(1) : 0}</b> 天</span>
            ${hasPrevData ? _kpiTrend(totalTriple, prevTotalTriple) : ''}
            <span class="att-detail-toggle" onclick="event.stopPropagation();_attToggleCardDetail('triple')" title="展开/收起详情">▾</span>
          </div>
        </div>
      </div>

      <!-- ④请假合计 —浅紫（点击→总览+筛选有请假的人员） -->
      <div class="sch-hcard sch-hcard-ann${_alertCls4}" data-att-card="leave3" style="cursor:pointer" tabindex="0" role="button" title="各团队请假明细\n${_tip4}" onclick="_attCardRipple(event);attFilterAnomalyMode='leave';attOverviewPage=1;_renderAttDashboard();_syncAttCardActive(this);document.getElementById('attDashboardSection').scrollIntoView({behavior:'smooth',block:'start'})" onkeydown="if(event.key==='Enter')this.click()" oncontextmenu="_attCardContextMenu(event,'leave3')" onmouseenter="_attCardCrossHint('leave3')" onmouseleave="_attCardCrossHintClear()" ontouchstart="_attCardTouchStart(event,'leave3')" ontouchend="_attCardTouchEnd()" ontouchmove="_attCardTouchEnd()">
        <div class="sch-hcard-deco"></div>
        <div class="sch-hcard-inner">
          <div class="sc-label-row">
            <span class="sc-label"><svg width="12" height="12" viewBox="0 0 20 20" fill="none"><rect x="2" y="3" width="16" height="15" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M6 1v4M14 1v4M2 8h16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M7 12l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> 请假合计</span>
            ${_spark4}
          </div>
          <div class="sc-value-row">
            <span class="sc-value">${totalLeave}</span><span class="sc-unit">天</span>
            ${hasYoyData ? _kpiTrend(totalLeave, yoyTotalLeave, false, '同比') : ''}
          </div>
          <div class="sc-footer-row">
            <span class="sc-footer-item" title="${leaveTypeStr}">${leaveTypeStr.length > 20 ? leaveTypeStr.slice(0, 20) + '…' : leaveTypeStr}</span>
            ${hasPrevData ? _kpiTrend(totalLeave, prevTotalLeave, false) : ''}
            <span class="att-detail-toggle" onclick="event.stopPropagation();_attToggleCardDetail('leave3')" title="展开/收起详情">▾</span>
          </div>
        </div>
      </div>

      <!-- ⑤r136 考勤通知（双栏布局：左总览 + 右团队网格，参照排班数据 sc5） -->
      <div class="sch-hcard sch-hcard-onduty-stat att-notify-card" data-att-card="notify" tabindex="0">
        <div class="sch-hcard-deco"></div>
        <div class="sch-hcard-inner att-n5-dual">
          <!-- ── 左侧：总览 + 操作 ── -->
          <div class="att-n5-left">
            <div class="sc-label-row">
              <span class="sc-label"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 1.5a4 4 0 014 4v3l1.5 2H2.5l1.5-2V5.5a4 4 0 014-4z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 12.5a2 2 0 004 0" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg> 考勤通知</span>
              <div class="att-month-picker-trigger" onclick="_showAttMonthPicker()" title="点击选择月份">
                <span class="att-month-picker-text">${parseInt(attFilterMonth.split('-')[1])}月</span>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 4l3 3 3-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </div>
            </div>
            ${_notifySent ? `
            <div class="att-n5-summary">
              <span class="att-n5-big-num">${_notifyConfPct}<span class="att-n5-big-pct">%</span></span>
              <span class="att-n5-big-label">确认率</span>
            </div>
            <div class="att-n5-progress-bar">
              <div class="att-n5-seg att-n5-seg-ok" style="width:${_notifyConfPct}%" title="已确认 ${_notifyConfirmed}"></div>
              <div class="att-n5-seg att-n5-seg-err" style="width:${_notifyTotal ? Math.round(_notifyDisputed / _notifyTotal * 100) : 0}%" title="有异议 ${_notifyDisputed}"></div>
            </div>
            <div class="att-n5-legend">
              <span class="att-n5-legend-i"><span class="att-n5-dot" style="background:#52C41A"></span>已确认 <b>${_notifyConfirmed}</b></span>
              <span class="att-n5-legend-i"><span class="att-n5-dot" style="background:#CF1322"></span>异议 <b>${_notifyDisputed}</b></span>
              <span class="att-n5-legend-i"><span class="att-n5-dot" style="background:#D9D9D9"></span>待确认 <b>${_notifyPending}</b></span>
            </div>
            <div class="att-n5-actions">
              <button class="att-n5-btn att-n5-btn-detail" onclick="event.stopPropagation();_showAttNotifyDetailModal()" title="查看详情"><svg width="11" height="11" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="1.5" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.2"/><path d="M4.5 5.5h5M4.5 8h3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>详情</button>
              <button class="att-n5-btn att-n5-btn-urge" onclick="event.stopPropagation();_attNotifyRemindAll()" title="催促未确认"><svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M8 1.5a4.5 4.5 0 00-4.5 4.5c0 2.5-1.5 3.5-1.5 3.5h12s-1.5-1-1.5-3.5A4.5 4.5 0 008 1.5z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M6 13a2 2 0 004 0" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>催(${_notifyPending})</button>
              <button class="att-n5-btn att-n5-btn-resend" onclick="event.stopPropagation();_attShowSendConfirm()" title="重新发送"><svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M14 2L7 9M14 2l-4.5 12-2-5.5L2 6.5 14 2z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>重发</button>
            </div>
            ` : `
            <div class="att-n5-unsent">
              <div class="att-n5-unsent-info">
                <div class="att-n5-unsent-num">${_notifyTotal}<span class="att-n5-unsent-unit">人</span></div>
                <div class="att-n5-unsent-hint">待发送 · ${_notifyTeamArr.length}个团队</div>
              </div>
              <button class="att-n5-send-btn" onclick="event.stopPropagation();_attShowSendConfirm()">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M14 2L7 9M14 2l-4.5 12-2-5.5L2 6.5 14 2z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
                一键发送
              </button>
            </div>
            `}
          </div>
          <!-- ── 右侧：2×2 四宫格折线图（点击弹出全部团队进展弹窗） ── -->
          <div class="att-n5-right" onclick="event.stopPropagation();_showAttNotifyTeamProgressModal()" style="cursor:pointer" title="点击查看全部团队确认进展">
            <div class="att-n5-spark-grid">
              ${_sortTeamsByOrder(_notifyTeamArr).slice(0, 4).map(team => {
                const t = _notifyTeamMap[team];
                const confPct = t.total ? Math.round(t.confirmed / t.total * 100) : 0;
                const dispPct = t.total ? Math.round(t.disputed / t.total * 100) : 0;
                const pendPct = 100 - confPct - dispPct;
                const teamName = team.endsWith('团队') ? team : team + '团队';
                const shortName = teamName.replace(/团队$/, '');
                // 折线数据点：已确认、异议、待确认（Y轴=人数，归一化到0~28高度）
                const maxV = Math.max(t.confirmed, t.disputed, t.total - t.confirmed - t.disputed, 1);
                const pts = [t.confirmed, t.disputed, t.total - t.confirmed - t.disputed];
                const h = 26, w = 70, pad = 2;
                const xStep = (w - pad * 2) / 2;
                const coords = pts.map((v, i) => [pad + i * xStep, h - pad - (v / maxV) * (h - pad * 2)]);
                const polyline = coords.map(c => c[0] + ',' + c[1]).join(' ');
                const areaPath = 'M' + coords[0][0] + ',' + (h - pad) + ' L' + coords.map(c => c[0] + ',' + c[1]).join(' L') + ' L' + coords[2][0] + ',' + (h - pad) + 'Z';
                // 折线统一蓝色，百分比按确认率变色：100%绿，≥50%橙，<50%红
                const lineColor = '#3370FF';
                const areaAlpha = 'rgba(51,112,255,0.12)';
                const pctColor = confPct >= 100 ? '#52C41A' : confPct >= 50 ? '#FA8C16' : '#CF1322';
                return `<div class="att-n5-spark-cell" title="${teamName} ${t.confirmed}/${t.total}已确认${t.disputed ? ' ' + t.disputed + '异议' : ''}">
                  <div class="att-n5-spark-head">
                    <span class="att-n5-spark-name">${teamName}</span>
                    <span class="att-n5-spark-pct" style="color:${pctColor}">${confPct}%</span>
                  </div>
                  <svg class="att-n5-spark-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
                    <path d="${areaPath}" fill="${areaAlpha}"/>
                    <polyline points="${polyline}" fill="none" stroke="${lineColor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    ${coords.map((c, i) => {
                      const colors = ['#3370FF', '#CF1322', '#8C8C8C'];
                      return `<circle cx="${c[0]}" cy="${c[1]}" r="2" fill="${colors[i]}"/>`;
                    }).join('')}
                  </svg>
                  <div class="att-n5-spark-labels">
                    <span style="color:#3370FF">✓${t.confirmed}</span>
                    <span style="color:#CF1322">✗${t.disputed}</span>
                    <span style="color:#8C8C8C">…${t.total - t.confirmed - t.disputed}</span>
                  </div>
                </div>`;
              }).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- r105-opt⑤诊断气泡行（卡片区域外，不受 overflow:hidden 限制：-->
    ${(_diagMsg1 || _diagMsg2 || _diagMsg3 || _diagMsg4) ? '<div class="att-diag-row">' +
      (_diagMsg1 ? '<div class="att-diag-bubble" onclick="this.classList.add(\'att-diag-dismiss\')">' + _diagMsg1 + '</div>' : '') +
      (_diagMsg2 ? '<div class="att-diag-bubble" onclick="this.classList.add(\'att-diag-dismiss\')">' + _diagMsg2 + '</div>' : '') +
      (_diagMsg3 ? '<div class="att-diag-bubble" onclick="this.classList.add(\'att-diag-dismiss\')">' + _diagMsg3 + '</div>' : '') +
      (_diagMsg4 ? '<div class="att-diag-bubble" onclick="this.classList.add(\'att-diag-dismiss\')">' + _diagMsg4 + '</div>' : '') +
    '</div>' : ''}

    <!-- r103-opt③卡片详情展开面板 -->
    <div class="att-card-detail-panel" id="attCardDetailPanel" style="position:relative"></div>

    <!-- r109-①考勤数据看板（常驻区域，不再是Tab之一：-->
    <div class="att-dashboard-section" id="attDashboardSection">
      <div class="att-dashboard-header">
        <div class="att-dashboard-title-row">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><rect x="1.5" y="1.5" width="17" height="17" rx="2.5" stroke="currentColor" stroke-width="1.5"/><line x1="1.5" y1="7" x2="18.5" y2="7" stroke="currentColor" stroke-width="1.5"/><line x1="7" y1="7" x2="7" y2="18.5" stroke="currentColor" stroke-width="1.5"/></svg>
          <span class="att-dashboard-title">考勤看板</span>
        </div>
        <div class="att-dashboard-controls">
          <!-- r122-opt⑥: Chip 风格筛选组 -->
          <div class="att-chip-group">
            <div class="att-dp-wrap" style="position:relative">
              <button class="att-chip${attFilterTeam !== 'all' && attFilterTeam !== 'allteams' ? ' att-chip-active' : ''}" id="attDpTeamBtn" onclick="_attDpToggle('team',event)" type="button">
                <svg width="11" height="11" viewBox="0 0 13 13" fill="none"><path d="M1.5 3.5h10M3.5 6.5h6M5.5 9.5h2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
                <span id="attDpTeamLabel">${_attTeamLabel(attFilterTeam)}</span>
                <svg class="att-chip-chevron" width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M2 3.5l3 3 3-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              <div class="att-dp-popup" id="attDpTeamPopup" onclick="event.stopPropagation()">
                <div class="att-dp-popup-header"><div class="att-dp-popup-title">人员 / 团队筛选</div></div>
                <div class="att-dp-popup-list">
                  ${[
                    {value:'all',    icon:'👥', label:'团队全员'},
                    {value:'self',   icon:'👤', label:'仅看自己'},
                    {value:'_sep'},
                    {value:'allteams', icon:'🏢', label:'全部团队'},
                    ...teams.map(t => ({value:t, icon:'🏷', label:t}))
                  ].map(item => {
                    if (item.value === '_sep') return '<div class="att-dp-sep"></div>';
                    return '<button class="att-dp-item' + (attFilterTeam===item.value?' active':'') + '" onclick="_attDpSelect(\'team\',\'' + item.value + '\')" type="button">' +
                      '<span class="att-dp-item-icon">' + item.icon + '</span>' +
                      '<span class="att-dp-item-label">' + item.label + '</span>' +
                      (attFilterTeam===item.value ? '<svg class="att-dp-check" width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2.5 6.5l3 3 5-5" stroke="#3370FF" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '') +
                    '</button>';
                  }).join('')}
                </div>
              </div>
            </div>
            <div class="att-dp-wrap" style="position:relative">
              <button class="att-chip${attFilterAnomalyMode!=='all'?' att-chip-active':''}" id="attDpAnomalyBtn" onclick="_attDpToggle('anomaly',event)" type="button">
                <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M7 1.5L1 12h12L7 1.5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M7 6v3M7 10.5v.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
                <span id="attDpAnomalyLabel">${({all:'全部',leave:'请假',triple:'三薪'})[attFilterAnomalyMode]||'全部'}</span>
                <svg class="att-chip-chevron" width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M2 3.5l3 3 3-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              <div class="att-dp-popup" id="attDpAnomalyPopup" onclick="event.stopPropagation()">
                <div class="att-dp-popup-header"><div class="att-dp-popup-title">其他筛选</div></div>
                <div class="att-dp-popup-list">
                  ${[
                    {value:'all',    icon:'📋', label:'全部'},
                    {value:'leave',  icon:'🏖', label:'请假'},
                    {value:'triple', icon:'💰', label:'三薪'}
                  ].map(item => {
                    return '<button class="att-dp-item' + (attFilterAnomalyMode===item.value?' active':'') + '" onclick="_attDpSelect(\'anomaly\',\'' + item.value + '\')" type="button">' +
                      '<span class="att-dp-item-icon">' + item.icon + '</span>' +
                      '<span class="att-dp-item-label">' + item.label + '</span>' +
                      (attFilterAnomalyMode===item.value ? '<svg class="att-dp-check" width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2.5 6.5l3 3 5-5" stroke="#3370FF" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '') +
                    '</button>';
                  }).join('')}
                </div>
              </div>
            </div>
          </div>
          <div class="att-dash-search">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4" stroke="currentColor" stroke-width="1.3"/><path d="M9.5 9.5l2.5 2.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
            <input type="text" id="attSearch" placeholder="搜索姓名 / MIS" oninput="attOverviewPage=1;_renderAttDashboard()">
          </div>
          <button class="att-dash-export-btn" onclick="exportAttendanceCSV()" title="导出 CSV" style="position:relative">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2v8M5.5 7.5L8 10l2.5-2.5M3 11v2a1 1 0 001 1h8a1 1 0 001-1v-2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
            导出
            <span id="exportCsvBadge" style="display:none;position:absolute;top:-5px;right:-5px;background:#FF4D4F;color:#fff;font-size:10px;font-weight:700;min-width:16px;height:16px;border-radius:8px;align-items:center;justify-content:center;padding:0 3px;line-height:1"></span>
          </button>
        </div>
      </div>
      <!-- r122-opt⑥: 筛选提示条 -->
      <div class="att-filter-hint" id="attFilterHint" style="display:none"></div>
      <div id="attDashboardArea"></div>
    </div>
  `;

  _renderAttDashboard();
// r102-opt②拖拽排序初始化+ r99-opt①数值动画
requestAnimationFrame(function() {
_initAttCardDrag();
_triggerAttValueAnim();
// r105-opt⑤诊断气泡自动消失：5秒后淡出：
var bubbles = document.querySelectorAll('.att-diag-bubble');
if (bubbles.length) {
  setTimeout(function() {
    bubbles.forEach(function(b) { b.classList.add('att-diag-dismiss'); });
  }, 5000);
}
});
}

// r109-①考勤数据看板渲染（常驻区域，独立于Tab：
function _renderAttDashboard() {
  const area = document.getElementById('attDashboardArea');
  if (!area) return;
  if (attFilterTeam === 'allteams') area.innerHTML = _renderAttOrgAgg();
  else area.innerHTML = _renderAttOverview();

  // 动态更新CSV 导出徽标

  var badge = document.getElementById('exportCsvBadge');
  if (badge) {
    var n = [
      attFilterTeam !== 'all' && attFilterTeam !== 'allteams',
      attFilterAnomalyMode !== 'all',
      (document.getElementById('attSearch')?.value || '').trim() !== '',
    ].filter(Boolean).length;
    if (n > 0) { badge.textContent = n; badge.style.display = 'flex'; }
    else { badge.style.display = 'none'; }
  }
  // r111: 看板内联详情展开时，触发环形图动画
  _animateDonutCharts();
  // r122-opt⑭: 初始化列拖拽
  _initAttColResize();
  // r122-opt⑥: 刷新筛选 Chip 状态
  _refreshAttChipStates();
}

// r122: _renderAttContent 已移除（个人详情/团队对比 Tab 已删除，仅保留看板）

// ===== 功能⑤组织维度聚合视图（按小组/团队）====
function _renderAttOrgAgg() {
  const [yearStr, monthStr] = attFilterMonth.split('-');
  const daysInMonth = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();
  const shiftKeys = _workShiftKeys();
  let members = MEMBERS_DATA.filter(m => !m.excludeFromSchedule);
  members = _attFilterMembers(members);

  // 按维度分组（r130: 改用 team 字段，显示完整团队名如"高曝团队"）
  const groupKey = 'team';
  const groups = {};
  members.forEach(m => {
    const gk = m[groupKey] || '未分组';
    if (!groups[gk]) groups[gk] = [];
    groups[gk].push(m);
  });

  // r109: 扫描当月所有成员实际使用的请假类型

  const _allMemberStats = members.map(m => _getAttStats(m.id, yearStr, monthStr));
  const _orgUsedLN = new Set();
  _allMemberStats.forEach(s => Object.keys(s.leaveBreakdown).forEach(k => _orgUsedLN.add(k)));
  const _orgSeenLN = new Set();
  const orgActiveLeaveNames = LEAVE_TYPES.map(lt => lt.name).filter(n => {
    if (_orgSeenLN.has(n) || !_orgUsedLN.has(n)) return false;
    _orgSeenLN.add(n); return true;
  });

  const aggRows = Object.entries(groups).map(([name, gMembers]) => {
    const stats = gMembers.map(m => _getAttStats(m.id, yearStr, monthStr));
    const totalWork  = stats.reduce((a, s) => a + s.workDays, 0);
    const totalLeave = stats.reduce((a, s) => a + s.leaveDays, 0);
    const totalScheduled = stats.reduce((a, s) => a + s.scheduledDays, 0);
    const totalTriple = stats.reduce((a, s) => a + s.triplePayDays, 0);
    const totalBDays = stats.reduce((a, s) => a + s.bShiftDays, 0);
    const totalBSub  = stats.reduce((a, s) => a + s.bShiftSubsidy, 0);
    const totalHours = stats.reduce((a, s) => a + (s.actualHours || 0), 0);
    const avgRate    = totalScheduled ? Math.round((totalWork / totalScheduled) * 100) : 0;
    const shiftTotals = {};
    shiftKeys.forEach(k => { shiftTotals[k] = stats.reduce((a, s) => a + (s.shiftCount[k] || 0), 0); });
    // r109: 各请假类型分项汇总
    const leaveTotals = {};
    orgActiveLeaveNames.forEach(n => { leaveTotals[n] = stats.reduce((a, s) => a + (s.leaveBreakdown[n] || 0), 0); });

    // r130: 补全应出勤、当月天数、标准工时、出勤工时
    const totalOnduty = stats.reduce((a, s) => a + (s.ondutyTotal !== null && s.ondutyTotal !== undefined ? s.ondutyTotal : 0), 0);
    const totalStdHours = stats.reduce((a, s) => { const h = s.ondutyTotal !== null && s.ondutyTotal !== undefined ? s.ondutyTotal * 8 : s.standardHours; return a + h; }, 0);
    const totalActHours = totalWork * 8;
    return { name, count: gMembers.length, totalWork, totalLeave, totalScheduled, totalTriple, totalBDays, totalBSub, totalHours, avgRate, shiftTotals, leaveTotals, totalOnduty, totalStdHours, totalActHours };
  });

  // 排序
  aggRows.sort((a, b) => attSortAsc ? a.avgRate - b.avgRate : b.avgRate - a.avgRate);

  const shiftThs = shiftKeys.map(k => {
    const si = SHIFTS[k];
    return `<th style="text-align:center;white-space:nowrap"><span class="shift-cell shift-${k.toLowerCase()}" style="font-size:10px;padding:1px 6px;border-radius:3px">${si.label}</span></th>`;
  }).join('');
  // r109: 动态请假类型列 TH
  const orgLeaveThs = orgActiveLeaveNames.map(n => {
    const lt = LEAVE_TYPES.find(t => t.name === n);
    const c = lt ? lt.color : '#FA8C16';
    return `<th style="text-align:center;font-size:11px;white-space:nowrap"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${c};margin-right:3px;vertical-align:1px"></span>${n}</th>`;
  }).join('');
  // r130: 总列数与人员看板对齐：团队名 + 班次列 + 休 + 请假列 + 当月天数+应出勤+实际出勤+出勤率+三薪+B班补贴+标准工时+出勤工时+考勤确认
  const totalCols = 1 + shiftKeys.length + 1 + orgActiveLeaveNames.length + 9;

  // r130: 休班天数汇总
  const _orgOffTh = '<th style="text-align:center;white-space:nowrap"><span style="font-size:11px;color:rgba(255,255,255,0.7)">休</span></th>';

  const tableRows = aggRows.map(r => {
    const rc = _rateColor(r.avgRate);
    const rbc = _rateBarColor(r.avgRate);
    const shiftTds = shiftKeys.map(k => `<td style="text-align:center;font-size:13px;font-weight:${r.shiftTotals[k]>0?'600':'400'};color:${r.shiftTotals[k]>0?'#1a1a1a':'var(--text-quaternary)'}">${r.shiftTotals[k] || '—'}</td>`).join('');
    // r109: 各请假类型列 TD
    const orgLeaveTds = orgActiveLeaveNames.map(n => {
      const v = r.leaveTotals[n] || 0;
      return `<td style="text-align:center;font-size:13px;font-weight:${v>0?'600':'400'};color:${v>0?'#1a1a1a':'var(--text-quaternary)'}">${v || '—'}</td>`;
    }).join('');

    // r113: 展开状态判断& 展开箭头

    const isExpanded = (_attDashExpandedGroup === r.name);
    const expandArrow = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="margin-left:4px;flex-shrink:0;transition:transform 0.2s;${isExpanded?'transform:rotate(180deg)':''}"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    // r130: 出勤率色块
    const _rateHtml = `<td style="text-align:center"><div class="att-rate-inline"><span class="att-rate-dot" style="background:${rbc}"></span><span class="att-rate-pct-val" style="color:${rc}">${r.avgRate}%</span></div></td>`;
    // r130: 工时不匹配飘红
    const _hoursMismatch = r.totalStdHours !== r.totalActHours && Math.abs(r.totalStdHours - r.totalActHours) !== r.totalTriple * 8;

    let html = `<tr class="att-overview-row${isExpanded?' att-dash-row-expanded':''}" style="cursor:pointer" onclick="_toggleDashGroupDetail('${r.name}')">
      <td class="att-sticky-name" style="position:sticky;left:0;z-index:1">
        <div class="att-member-cell">
          <span class="att-member-info">
            <span style="font-weight:600;font-size:13px;display:flex;align-items:center">${r.name}${expandArrow}</span>
            <span style="font-size:11px;color:var(--text-tertiary)">${r.count}人</span>
          </span>
        </div>
      </td>
      ${shiftTds}
      <td style="text-align:center;font-size:13px;color:var(--text-quaternary)">—</td>
      ${orgLeaveTds}
      <td style="text-align:center;font-size:13px;color:#1a1a1a">${daysInMonth}</td>
      <td style="text-align:center;font-size:13px;font-weight:600;color:#1a1a1a">${r.totalOnduty || '—'}</td>
      <td style="text-align:center"><span style="font-weight:700;font-size:14px;color:#1a1a1a">${r.totalWork}</span></td>
      ${_rateHtml}
      <td style="text-align:center">${r.totalTriple > 0 ? `<span style="color:#D4A017;font-weight:700">${r.totalTriple}</span>` : '<span style="color:var(--text-quaternary)">—</span>'}</td>
      <td style="text-align:center">${r.totalBDays > 0 ? `<span style="color:#1a1a1a;font-weight:600">${r.totalBDays}</span><div style="font-size:10px;color:#666">¥${r.totalBSub}</div>` : '<span style="color:var(--text-quaternary)">—</span>'}</td>
      <td style="text-align:center;font-size:13px;color:#1a1a1a">${r.totalStdHours}h</td>
      <td style="text-align:center;font-size:13px;font-weight:600;${_hoursMismatch ? 'color:#CF1322' : 'color:#1a1a1a'}">${r.totalActHours}h</td>
      <td style="text-align:center"><span style="color:var(--text-tertiary)">—</span></td>
    </tr>`;

    // r113: 如果该小组已展开，在数据行下方插入详情行

    if (isExpanded) {
      html += `<tr class="att-dash-detail-row"><td colspan="${totalCols}" style="padding:0;border-top:none">
${_renderDashGroupDetail(r.name, yearStr, monthStr)}
</td></tr>`;
    }

    return html;
  }).join('');

  // r130: 表头与人员看板完全对齐
  return `
    <div class="att-overview-table-wrap">
      <table class="att-overview-table" id="attTable">
        <thead>
          <tr>
            <th class="att-th-resizable" style="position:sticky;left:0;z-index:2;background:linear-gradient(135deg,#2B3A67 0%,#3D5A99 100%);text-align:left">团队名称<span class="att-th-resize-handle"></span></th>
            ${shiftThs}
            ${_orgOffTh}
            ${orgLeaveThs}
            <th style="text-align:center;white-space:nowrap">当月天数</th>
            <th style="text-align:center;white-space:nowrap">应出勤</th>
            <th style="text-align:center">实际出勤</th>
            <th style="text-align:center">出勤率</th>
            <th style="text-align:center">三薪</th>
            <th style="text-align:center">B班补贴</th>
            <th style="text-align:center;white-space:nowrap">标准工时</th>
            <th style="text-align:center;white-space:nowrap">出勤工时</th>
            <th style="text-align:center;white-space:nowrap">考勤确认</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`;
}

// ---- 考勤数据看板（V4 —Bug⑤应出勤 + Bug⑥sticky + r122全面优化）---
function _renderAttOverview() {
  const [yearStr, monthStr] = attFilterMonth.split('-');
  const search = (document.getElementById('attSearch')?.value || '').trim();
  let members = MEMBERS_DATA.filter(m => !m.excludeFromSchedule);
  members = _attFilterMembers(members);
  if (search) members = members.filter(m => m.name.includes(search) || m.mis.includes(search));

  const daysInMonth = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();

  // 动态班次列（排除OFF）
  const shiftKeys = _workShiftKeys();

  let rows = members.map(m => {
    const s = _getAttStats(m.id, yearStr, monthStr);
    const rate = s.scheduledDays > 0 ? Math.round((s.workDays / s.scheduledDays) * 100) : 0;
    return { m, s, rate };
  });

  // r109: 扫描当月实际使用的请假类型（按名称去重，保持 LEAVE_TYPES 顺序：
  const _usedLeaveNames = new Set();
  rows.forEach(r => Object.keys(r.s.leaveBreakdown).forEach(k => _usedLeaveNames.add(k)));
  const _seenLN = new Set();
  const activeLeaveNames = LEAVE_TYPES.map(lt => lt.name).filter(n => {
    if (_seenLN.has(n) || !_usedLeaveNames.has(n)) return false;
    _seenLN.add(n); return true;
  });

  // 排序
  rows.sort((a, b) => {
    let va, vb;
    if (attSortKey === 'rate')   { va = a.rate;   vb = b.rate; }
    else if (attSortKey === 'work')  { va = a.s.workDays;  vb = b.s.workDays; }
    else if (attSortKey === 'leave') { va = a.s.leaveDays; vb = b.s.leaveDays; }
    else if (attSortKey === 'bdays') { va = a.s.bShiftDays; vb = b.s.bShiftDays; }
    else if (attSortKey === 'triple') { va = a.s.triplePayDays; vb = b.s.triplePayDays; }
    else { va = a.rate; vb = b.rate; }
    return attSortAsc ? va - vb : vb - va;
  });

  // 其他筛选
  if (attFilterAnomalyMode === 'leave')  rows = rows.filter(r => r.s.leaveDays > 0);
  if (attFilterAnomalyMode === 'triple') rows = rows.filter(r => r.s.triplePayDays > 0);

  if (!rows.length) return `
    <div class="att-empty">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none"><rect x="6" y="8" width="36" height="34" rx="4" stroke="currentColor" stroke-width="2"/><path d="M16 4v8M32 4v8M6 20h36" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16 30h16M16 36h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      <p>暂无考勤数据</p>
    </div>`;

  // 分页

  const totalRows = rows.length;
  const totalPages = Math.ceil(totalRows / ATT_PAGE_SIZE);
  if (attOverviewPage > totalPages) attOverviewPage = totalPages;
  if (attOverviewPage < 1) attOverviewPage = 1;
  const pagedRows = totalRows > ATT_PAGE_SIZE
    ? rows.slice((attOverviewPage - 1) * ATT_PAGE_SIZE, attOverviewPage * ATT_PAGE_SIZE)
    : rows;

  // 排序图标

  const sortIcon = (key) => {
    if (attSortKey !== key) return '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" style="opacity:0.3;margin-left:3px;vertical-align:-1px"><path d="M5 2L2 5h6L5 2zM5 8L2 5h6L5 8z" fill="currentColor"/></svg>';
    return attSortAsc
      ? '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" style="margin-left:3px;vertical-align:-1px;color:var(--primary)"><path d="M5 2L2 7h6L5 2z" fill="currentColor"/></svg>'
      : '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" style="margin-left:3px;vertical-align:-1px;color:var(--primary)"><path d="M5 8L2 3h6L5 8z" fill="currentColor"/></svg>';
  };
  // r122-opt⑭: sortTh 加拖拽手柄
  const sortTh = (key, label, extra) =>
    `<th class="sortable att-th-resizable" ${extra||''} onclick="_attSort('${key}')">${label}${sortIcon(key)}<span class="att-th-resize-handle"></span></th>`;

  // 动态班次列 TH（含休）— r122-opt⑭: 加拖拽手柄
  const shiftThs = shiftKeys.map(k => {
    const si = SHIFTS[k];
    return `<th class="att-th-resizable" style="text-align:center;white-space:nowrap"><span class="shift-cell shift-${k.toLowerCase()}" style="font-size:10px;padding:1px 6px;border-radius:3px">${si.label}</span><span class="att-th-resize-handle"></span></th>`;
  }).join('') + '<th class="att-th-resizable" style="text-align:center;white-space:nowrap"><span style="font-size:11px;color:rgba(255,255,255,0.7)">休</span><span class="att-th-resize-handle"></span></th>';

  // r109: 动态请假类型列 TH（仅当月有人使用的类型）

  const leaveThs = activeLeaveNames.map(n => {
    const lt = LEAVE_TYPES.find(t => t.name === n);
    const c = lt ? lt.color : '#FA8C16';
    return `<th class="att-th-resizable" style="text-align:center;font-size:11px;white-space:nowrap"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${c};margin-right:3px;vertical-align:1px"></span>${n}<span class="att-th-resize-handle"></span></th>`;
  }).join('');

  // r121: 考勤通知数据（用于考勤确认列）
  const _ovNotifyData = loadAttNotify(attFilterMonth);
  const _ovNotifySent = _ovNotifyData && _ovNotifyData.sent;

  // 表格行
  // r122: 总列数：人员姓名+MIS+团队 + 班次+休 + 请假 + 当月天数+应出勤+实际出勤+出勤率+三薪+B班补贴+标准工时+出勤工时+考勤确认

  const totalCols = 3 + shiftKeys.length + 1 + activeLeaveNames.length + 9;

  let _globalRowIdx = 0; // r122-opt①: 全局行序号（斑马纹）
  const tableRows = pagedRows.map(({ m, s, rate }) => {
    const rateColor    = _rateColor(rate);
    const rateBarColor = _rateBarColor(rate);
    const isExpanded   = _attDashExpandedId === m.id;
    const isEven = _globalRowIdx % 2 === 0; // r122-opt①: 斑马纹
    _globalRowIdx++;

    // 动态班次列 TD（含休）
    const shiftTds = shiftKeys.map(k => {
      const cnt = s.shiftCount[k] || 0;
      return `<td style="text-align:center;font-size:13px;font-weight:${cnt>0?'600':'400'};color:${cnt>0?'#1a1a1a':'var(--text-quaternary)'}">${cnt || '—'}</td>`;
    }).join('') + `<td style="text-align:center;font-size:13px;font-weight:${s.offDays>0?'600':'400'};color:${s.offDays>0?'#1a1a1a':'var(--text-quaternary)'}">${s.offDays || '—'}</td>`;

    // r109: 各请假类型列 TD

    const leaveTds = activeLeaveNames.map(n => {
      const v = s.leaveBreakdown[n] || 0;
      return `<td style="text-align:center;font-size:13px;font-weight:${v>0?'600':'400'};color:${v>0?'#1a1a1a':'var(--text-quaternary)'}">${v || '—'}</td>`;
    }).join('');

    // r122-opt③: 展开箭头增大到 15px

    const expandArrow = `<svg width="15" height="15" viewBox="0 0 12 12" fill="none" style="margin-left:4px;flex-shrink:0;transition:transform 0.2s;${isExpanded?'transform:rotate(180deg)':''}"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    // r121: 标准工时 = 排班日历在班总天数 × 8h；出勤工时 = 实际出勤天数 × 8h
    const _stdHours = s.ondutyTotal !== null && s.ondutyTotal !== undefined ? s.ondutyTotal * 8 : s.standardHours;
    const _actHours = s.workDays * 8;
    // 工时不匹配飘红：标准工时 ≠ 出勤工时，但如果差异完全由三薪天数造成则不飘红
    const _hoursMismatch = _stdHours !== _actHours && Math.abs(_stdHours - _actHours) !== s.triplePayDays * 8;

    // r121: 考勤确认状态
    const _mNotify = _ovNotifySent && _ovNotifyData.members[m.id];
    const _confirmStatus = !_ovNotifySent ? 'pending' : (_mNotify && _mNotify.confirmed) ? 'confirmed' : (_mNotify && _mNotify.disputed) ? 'disputed' : 'pending';
    const _confirmLabel = _confirmStatus === 'confirmed' ? '是' : _confirmStatus === 'disputed' ? '否' : '待确认';
    const _confirmColor = _confirmStatus === 'confirmed' ? '#389E0D' : _confirmStatus === 'disputed' ? '#CF1322' : 'var(--text-tertiary)';


    // r122-opt⑦: 出勤率色块+百分比
    const _rateHtml = `<td style="text-align:center"><div class="att-rate-inline"><span class="att-rate-dot" style="background:${rateBarColor}"></span><span class="att-rate-pct-val" style="color:${rateColor}">${rate}%</span></div></td>`;

    // Bug⑥首列 sticky —r121: 人员姓名+MIS号拆分为两列 —r122: 斑马纹+hover左边框

    let html = `<tr class="att-overview-row${isExpanded?' att-dash-row-expanded':''}${isEven?' att-row-even':''}" style="cursor:pointer" onclick="_toggleDashPersonDetail(${m.id})">
      <td class="att-sticky-name" style="position:sticky;left:0;z-index:1">
        <div class="att-member-cell">
          ${avatarImg(m, '30px')}
          <span class="att-member-info">
            ${m.name}
            ${expandArrow}
          </span>
        </div>
      </td>
      <td style="font-size:12px;color:#1a1a1a;white-space:nowrap;min-width:120px;text-align:center">${m.mis}</td>
      <td style="text-align:center"><span class="tag tag-gray" style="font-size:12px;color:#1a1a1a">${m.team}</span></td>
      ${shiftTds}
      ${leaveTds}
      <td style="text-align:center;font-size:13px;color:#1a1a1a">${daysInMonth}</td>
      <td style="text-align:center;font-size:13px;font-weight:600;color:#1a1a1a">${s.ondutyTotal !== null && s.ondutyTotal !== undefined ? s.ondutyTotal : '—'}</td>
      <td style="text-align:center">
        <span style="font-weight:700;font-size:14px;color:#1a1a1a">${s.workDays}</span>
      </td>
      ${_rateHtml}
      <td style="text-align:center">
        ${s.triplePayDays > 0
          ? `<span style="color:#D4A017;font-weight:700">${s.triplePayDays}</span>`
          : '<span style="color:var(--text-quaternary)">—</span>'}
      </td>
      <td style="text-align:center">
        ${s.bShiftDays > 0
          ? `<span style="color:#1a1a1a;font-weight:600">${s.bShiftDays}</span><div style="font-size:10px;color:#666">¥${s.bShiftSubsidy}</div>`
          : '<span style="color:var(--text-quaternary)">—</span>'}
      </td>
      <td style="text-align:center;font-size:13px;color:#1a1a1a">${_stdHours}h</td>
      <td style="text-align:center;font-size:13px;font-weight:600;${_hoursMismatch ? 'color:#CF1322' : 'color:#1a1a1a'}">${_actHours}h</td>
      <td style="text-align:center"><span class="att-confirm-tag att-confirm-${_confirmStatus}" style="color:${_confirmColor}">${_confirmLabel}</span></td>
    </tr>`;

    // r111: 如果该人员已展开，在数据行下方插入详情行

    if (isExpanded) {
      html += `<tr class="att-dash-detail-row"><td colspan="${totalCols}" style="padding:0;border-top:none">
        ${_renderDashPersonDetail(m.id, yearStr, monthStr)}
      </td></tr>`;
    }

    return html;
  }).join('');

  // r122-opt⑩: 合计行（sticky bottom）
  const _sumWork = rows.reduce((a, r) => a + r.s.workDays, 0);
  const _sumSched = rows.reduce((a, r) => a + r.s.scheduledDays, 0);
  const _sumTriple = rows.reduce((a, r) => a + r.s.triplePayDays, 0);
  const _sumBDays = rows.reduce((a, r) => a + r.s.bShiftDays, 0);
  const _sumBSub = rows.reduce((a, r) => a + r.s.bShiftSubsidy, 0);
  const _sumOnduty = rows.reduce((a, r) => a + (r.s.ondutyTotal !== null && r.s.ondutyTotal !== undefined ? r.s.ondutyTotal : 0), 0);
  const _avgRate = _sumSched > 0 ? Math.round((_sumWork / _sumSched) * 100) : 0;
  const _sumStdH = rows.reduce((a, r) => { const h = r.s.ondutyTotal !== null && r.s.ondutyTotal !== undefined ? r.s.ondutyTotal * 8 : r.s.standardHours; return a + h; }, 0);
  const _sumActH = _sumWork * 8;

  // 合计行：班次列 + 休 + 请假列 — 汇总所有人（非分页）
  const _sumShiftTds = shiftKeys.map(k => {
    const cnt = rows.reduce((a, r) => a + (r.s.shiftCount[k] || 0), 0);
    return `<td style="text-align:center;font-size:13px;font-weight:700;color:${cnt > 0 ? '#1a1a1a' : 'var(--text-quaternary)'}">${cnt || '—'}</td>`;
  }).join('');
  const _sumOff = rows.reduce((a, r) => a + (r.s.offDays || 0), 0);
  const _sumShiftAndOff = _sumShiftTds + `<td style="text-align:center;font-size:13px;font-weight:700;color:${_sumOff > 0 ? '#1a1a1a' : 'var(--text-quaternary)'}">${_sumOff || '—'}</td>`;
  const _sumLeaveTds = activeLeaveNames.map(n => {
    const cnt = rows.reduce((a, r) => a + (r.s.leaveBreakdown[n] || 0), 0);
    return `<td style="text-align:center;font-size:13px;font-weight:700;color:${cnt > 0 ? '#1a1a1a' : 'var(--text-quaternary)'}">${cnt || '—'}</td>`;
  }).join('');

  const totalRowHtml = `<tr class="att-total-row">
    <td class="att-sticky-name" style="position:sticky;left:0;z-index:1"><strong>合计 (${totalRows}人)</strong></td>
    <td></td><td></td>
    ${_sumShiftAndOff}
    ${_sumLeaveTds}
    <td style="text-align:center;font-size:13px;color:#1a1a1a">${daysInMonth}</td>
    <td style="text-align:center;font-size:13px;font-weight:600;color:#1a1a1a">${_sumOnduty}</td>
    <td style="text-align:center;font-weight:700;font-size:14px;color:#1a1a1a">${_sumWork}</td>
    <td style="text-align:center"><div class="att-rate-inline"><span class="att-rate-dot" style="background:${_rateBarColor(_avgRate)}"></span><span class="att-rate-pct-val" style="color:${_rateColor(_avgRate)}">${_avgRate}%</span></div></td>
    <td style="text-align:center;font-weight:700;color:#D4A017">${_sumTriple || '—'}</td>
    <td style="text-align:center">${_sumBDays > 0 ? '<span style="color:#1a1a1a;font-weight:600">' + _sumBDays + '</span><div style="font-size:10px;color:#666">¥' + _sumBSub + '</div>' : '—'}</td>
    <td style="text-align:center;font-size:13px;color:#1a1a1a">${_sumStdH}h</td>
    <td style="text-align:center;font-size:13px;font-weight:600;color:#1a1a1a">${_sumActH}h</td>
    <td></td>
  </tr>`;


  // 分页

  const pagerHtml = totalPages > 1 ? `
    <div class="att-pager">
      <button class="att-pager-btn" ${attOverviewPage<=1?'disabled':''} onclick="attOverviewPage--;_renderAttDashboard()">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M7.5 2L4 6l3.5 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      ${Array.from({length: Math.min(totalPages, 10)}, (_, i) => i + 1).map(p =>
        `<button class="att-pager-btn${p===attOverviewPage?' active':''}" onclick="attOverviewPage=${p};_renderAttDashboard()">${p}</button>`
      ).join('')}
      <button class="att-pager-btn" ${attOverviewPage>=totalPages?'disabled':''} onclick="attOverviewPage++;_renderAttDashboard()">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4.5 2L8 6l-3.5 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <span class="att-pager-info">共${totalRows} 人，第${attOverviewPage}/${totalPages} 页</span>
    </div>` : '';

  return `
    <div class="att-overview-table-wrap">
      <table class="att-overview-table" id="attTable">
        <thead>
          <tr>
            <th class="att-th-resizable" style="position:sticky;left:0;z-index:2;background:linear-gradient(135deg,#2B3A67 0%,#3D5A99 100%);text-align:left">人员姓名<span class="att-th-resize-handle"></span></th>
            <th class="att-th-resizable" style="white-space:nowrap;text-align:center">MIS号<span class="att-th-resize-handle"></span></th>
            <th class="att-th-resizable" style="text-align:center">团队<span class="att-th-resize-handle"></span></th>
            ${shiftThs}
            ${leaveThs}
            <th class="att-th-resizable" style="text-align:center;white-space:nowrap">当月天数<span class="att-th-resize-handle"></span></th>
            <th class="att-th-resizable" style="text-align:center;white-space:nowrap">应出勤<span class="att-th-resize-handle"></span></th>
            ${sortTh('work', '实际出勤', 'style="text-align:center"')}
            ${sortTh('rate', '出勤率', 'style="text-align:center"')}
            ${sortTh('triple', '三薪', 'style="text-align:center"')}
            ${sortTh('bdays', 'B班补贴', 'style="text-align:center"')}
            <th class="att-th-resizable" style="text-align:center;white-space:nowrap">标准工时<span class="att-th-resize-handle"></span></th>
            <th class="att-th-resizable" style="text-align:center;white-space:nowrap">出勤工时<span class="att-th-resize-handle"></span></th>
            <th class="att-th-resizable" style="text-align:center;white-space:nowrap">考勤确认<span class="att-th-resize-handle"></span></th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
        <tfoot>${totalRowHtml}</tfoot>
      </table>
    </div>
    ${pagerHtml}`;
}

// r122-opt⑭: 表头列拖拽调整宽度
function _initAttColResize() {
  const table = document.getElementById('attTable');
  if (!table) return;
  const ths = table.querySelectorAll('.att-th-resizable');
  ths.forEach(function(th) {
    const handle = th.querySelector('.att-th-resize-handle');
    if (!handle) return;
    handle.addEventListener('mousedown', function(e) {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.pageX;
      const startW = th.offsetWidth;
      th.style.width = startW + 'px';
      function onMove(ev) {
        const w = Math.max(40, startW + ev.pageX - startX);
        th.style.width = w + 'px';
        th.style.minWidth = w + 'px';
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });
}

// 总览排序
function _attSort(key) {
  if (attSortKey === key) attSortAsc = !attSortAsc;
  else { attSortKey = key; attSortAsc = false; }
  attOverviewPage = 1;
  _renderAttDashboard();
}

// r111: 考勤看板人员行内联展开/折叠
function _toggleDashPersonDetail(memberId) {
  _attDashExpandedId = (_attDashExpandedId === memberId) ? null : memberId;
  _renderAttDashboard();
}

// r113: 考勤看板小组行内联展开/折叠
function _toggleDashGroupDetail(groupName) {
  _attDashExpandedGroup = (_attDashExpandedGroup === groupName) ? null : groupName;
  _renderAttDashboard();
}

// r116: 根据月份返回季节 CSS 类名
function _calSeasonClass(monthStr) {
  const m = parseInt(monthStr);
  if (m >= 3 && m <= 5) return 'att-cal-season-spring';
  if (m >= 6 && m <= 8) return 'att-cal-season-summer';
  if (m >= 9 && m <= 11) return 'att-cal-season-autumn';
  return 'att-cal-season-winter'; // 12, 1, 2
}

// r118: 毛玻璃风格——只区分OFF / 请假 / 正常班三种状态
function _calCellClass(colorCls) {
  if (!colorCls) return 'att-cal-off';
  if (colorCls.startsWith('leave-')) return 'att-cal-leave';
  return ''; // 正常班次不加额外类名，统一毛玻璃底
}

// r111: 渲染看板内联个人详情面板（复用个人详情的完整内容）
function _renderDashPersonDetail(memberId, yearStr, monthStr) {
  const m = MEMBERS_DATA.find(x => x.id === memberId);
  if (!m) return '';
  const s = _getAttStats(m.id, yearStr, monthStr);
  const rate = s.scheduledDays > 0 ? Math.round((s.workDays / s.scheduledDays) * 100) : 0;
  const rateColor    = _rateColor(rate);
  const rateBarColor = _rateBarColor(rate);
  const daysInMonth  = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();
  const shiftKeys    = _workShiftKeys();
  const schedData    = _getScheduleForMonth(yearStr, monthStr);

  // 日历格子

  const calCells = [];
  const firstDay = new Date(parseInt(yearStr), parseInt(monthStr) - 1, 1).getDay();
  for (let i = 0; i < firstDay; i++) calCells.push('<div class="att-cal-cell att-cal-empty"></div>');
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(parseInt(yearStr), parseInt(monthStr) - 1, d);
    const dow  = date.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const isToday   = date.toDateString() === new Date().toDateString();
    const val  = schedData && schedData[m.id] ? (schedData[m.id][d] || 'OFF') : 'OFF';
    const info = getShiftDisplayInfo(val);
    // r118: 毛玻璃风格，只区分OFF/请假/正常

    const cellCls = _calCellClass(info.color);
    const cls = ['att-cal-cell'];
    if (cellCls) cls.push(cellCls);
    if (isToday) cls.push('att-cal-today');
    if (isWeekend && val === 'OFF') cls.push('att-cal-weekend-cell');
    calCells.push(`
      <div class="${cls.join(' ')}">
        <div class="att-cal-day-num ${isWeekend?'att-cal-day-weekend':'att-cal-day-weekday'}">${d}</div>
        <span class="att-cal-shift">${info.label}</span>
      </div>`);
  }

  // KPI 指标

  const kpis = [
    { num: s.workDays,       color: 'var(--primary)',  label: '出勤天' },
    { num: s.leaveDays,      color: '#722ED1',         label: '请假天' },
    { num: s.bShiftDays,     color: '#00B42A',         label: 'B班天' },
    { num: s.triplePayDays,  color: '#FA541C',         label: '三薪天' },
    { num: rate+'%',         color: rateColor,         label: '出勤率', divider: true },
  ];

  return `
    <div class="att-dash-detail-panel">
      <div class="att-personal-header" style="border-bottom:1px solid var(--border-light);padding:14px 20px">
        ${avatarImg(m, '40px')}
        <div>
          <div class="att-personal-name" style="font-size:14px">${m.name}</div>
          <div class="att-personal-meta">${m.mis} · ${m.team}</div>
        </div>
        <div class="att-personal-kpis">
          ${kpis.map(k => `
            <div class="att-personal-kpi-item${k.divider?' att-person-metric-divider':''}">
              <div class="att-personal-kpi-num" style="color:${k.color};font-size:18px">${k.num}</div>
              <div class="att-personal-kpi-label">${k.label}</div>
            </div>`).join('')}
        </div>
      </div>
      <div class="att-personal-body">
        <!-- 左侧：排班日历-->
        <div class="att-personal-cal-area ${_calSeasonClass(monthStr)}">
          <div class="att-personal-cal-title"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" style="vertical-align:-2px;margin-right:5px"><rect x="1.5" y="2.5" width="13" height="12" rx="2" stroke="currentColor" stroke-width="1.3"/><path d="M5 1v3M11 1v3M1.5 6.5h13" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="5.5" cy="10" r="1" fill="var(--primary)"/><circle cx="8" cy="10" r="1" fill="var(--primary)"/><circle cx="10.5" cy="10" r="1" fill="var(--primary)"/></svg>${yearStr}年${parseInt(monthStr)}月排班日历</div>
          <div class="att-cal-grid-header">
            ${['日','一','二','三','四','五','六'].map((d,i) =>
              `<span class="${i===0||i===6?'att-cal-hdr-weekend':''}">${d}</span>`
            ).join('')}
          </div>
          <div class="att-cal-grid">${calCells.join('')}</div>
        </div>
        <!-- 右侧：面板-->
        <div class="att-personal-sidebar">
          <!-- 班次分布 -->
          <div class="att-sidebar-section">
            <div class="att-sidebar-title">班次分布</div>
            ${shiftKeys.filter(k => (s.shiftCount[k] || 0) > 0).map(k => `
              <div class="att-shift-bar-row">
                <span class="shift-cell shift-${k.toLowerCase()}" style="font-size:11px;padding:1px 6px;border-radius:3px;min-width:24px;text-align:center">${k}</span>
                <div class="att-shift-bar-track">
                  <div class="att-shift-bar-fill" style="width:${s.workDays?Math.round((s.shiftCount[k]||0)/s.workDays*100):0}%"></div>
                </div>
                <span class="att-shift-bar-label">${s.shiftCount[k]}天</span>
              </div>`).join('') || '<div style="font-size:12px;color:var(--text-tertiary)">暂无排班</div>'}
          </div>
          <!-- 补贴与工时 r121: 标准工时+出勤工时+飘红逻辑-->
          <div class="att-sidebar-section">
            <div class="att-sidebar-title">补贴与工时</div>
            <div class="att-leave-row"><span class="att-leave-name">B班天数</span><span style="font-weight:600;color:#00B42A">${s.bShiftDays}天</span></div>
            <div class="att-leave-row"><span class="att-leave-name">B班补贴</span><span style="font-weight:600;color:#00B42A">¥${s.bShiftSubsidy}</span></div>
            ${(() => {
              const _dStd = s.ondutyTotal !== null && s.ondutyTotal !== undefined ? s.ondutyTotal * 8 : s.standardHours;
              const _dAct = s.workDays * 8;
              const _dMismatch = _dStd !== _dAct && Math.abs(_dStd - _dAct) !== s.triplePayDays * 8;
              return '<div class="att-leave-row"><span class="att-leave-name">标准工时</span><span style="font-weight:500;color:var(--text-tertiary)">' + _dStd + 'h</span></div>' +
                '<div class="att-leave-row"><span class="att-leave-name">出勤工时</span><span style="font-weight:600;' + (_dMismatch ? 'color:#CF1322' : '') + '">' + _dAct + 'h</span></div>';
            })()}
          </div>
          ${Object.keys(s.leaveBreakdown).length ? `
          <!-- 请假明细 -->
          <div class="att-sidebar-section">
            <div class="att-sidebar-title">请假明细</div>
            ${Object.entries(s.leaveBreakdown).map(([k,v]) => `
              <div class="att-leave-row"><span class="att-leave-name">${k}</span><span class="att-leave-val">${v}天</span></div>`).join('')}
          </div>` : ''}
          <!-- 出勤率-->
          <div class="att-sidebar-section" style="text-align:center">
            <div class="att-sidebar-title" style="text-align:center">出勤率</div>
            ${(() => {
              const cx = 36, cy = 36, radius = 28, stroke = 6;
              const circ = 2 * Math.PI * radius;
              const uid = 'dashDonut_' + m.id;
              return '<svg width="72" height="72" viewBox="0 0 72 72" style="margin-top:4px">' +
                '<circle cx="' + cx + '" cy="' + cy + '" r="' + radius + '" fill="none" stroke="var(--border-light)" stroke-width="' + stroke + '"/>' +
                '<circle id="' + uid + '" cx="' + cx + '" cy="' + cy + '" r="' + radius + '" fill="none" stroke="' + rateBarColor + '" stroke-width="' + stroke + '"' +
                ' stroke-dasharray="0 ' + circ + '" stroke-dashoffset="' + (circ * 0.25) + '"' +
                ' stroke-linecap="round"' +
                ' data-target="' + ((rate / 100) * circ) + '" data-circ="' + circ + '"/>' +
                '<text x="' + cx + '" y="' + cy + '" text-anchor="middle" dominant-baseline="central" font-size="14" font-weight="700" fill="' + rateColor + '">' + rate + '%</text>' +
              '</svg>';
            })()}
          </div>
          <!-- r135: 考勤确认（确认无误 / 有异议 + 异议原因展示）-->
          ${(() => {
            const nd = loadAttNotify(yearStr + '-' + monthStr);
            if (!nd || !nd.sent) return '';
            const ms = nd.members && nd.members[memberId];
            if (ms && ms.confirmed) return '<div class="att-sidebar-section" style="text-align:center"><div class="att-notify-confirm-done"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5l3 3 6-6" stroke="#52C41A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> 已确认无误<span style="font-size:10px;color:var(--text-tertiary);display:block;margin-top:2px">' + (ms.confirmedAt ? new Date(ms.confirmedAt).toLocaleString() : '') + '</span></div></div>';
            if (ms && ms.disputed) return '<div class="att-sidebar-section" style="text-align:center"><div class="att-notify-confirm-done" style="color:#CF1322;background:rgba(207,19,34,0.06)"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="#CF1322" stroke-width="2" stroke-linecap="round"/></svg> 已提交异议<span style="font-size:10px;color:var(--text-tertiary);display:block;margin-top:2px">' + (ms.disputedAt ? new Date(ms.disputedAt).toLocaleString() : '') + '</span></div>' + (ms.disputeReason ? '<div class="att-detail-dispute-reason" style="margin-top:6px;text-align:left;font-size:11px"><svg width="11" height="11" viewBox="0 0 14 14" fill="none" style="flex-shrink:0;margin-top:1px"><circle cx="7" cy="7" r="5.5" stroke="#CF1322" stroke-width="1.2"/><path d="M7 4.5v3M7 9.5v.01" stroke="#CF1322" stroke-width="1.3" stroke-linecap="round"/></svg>' + ms.disputeReason + '</div>' : '') + '</div>';
            return '<div class="att-sidebar-section" style="text-align:center"><div style="display:flex;gap:8px;justify-content:center"><button class="att-notify-btn att-notify-btn-confirm" onclick="_attNotifyConfirm(\'' + memberId + '\');_renderAttDashboard()"><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5l3 3 6-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>确认无误</button><button class="att-notify-btn att-notify-btn-dispute" onclick="_attNotifyDispute(\'' + memberId + '\')"><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>有异议</button></div></div>';
          })()}
        </div>
      </div>
    </div>`;
}

// r113: 渲染看板内联小组详情面板（复用团队对比视图的完整内容）
// r130: groupName 现在实际上是 team 全名（如"高曝团队"），按 team 字段筛选
function _renderDashGroupDetail(groupName, yearStr, monthStr) {
  const shiftKeys = _workShiftKeys();
  // r130: 按 team 字段筛选成员（排除管理层）
  const members = MEMBERS_DATA.filter(m => !m.excludeFromSchedule && m.team === groupName);
  if (!members.length) return '';

  const allStats = members.map(m => ({ m, s: _getAttStats(m.id, yearStr, monthStr) }));
  const totalWork   = allStats.reduce((acc, x) => acc + x.s.workDays, 0);
  const totalLeave  = allStats.reduce((acc, x) => acc + x.s.leaveDays, 0);
  const totalTriple = allStats.reduce((acc, x) => acc + x.s.triplePayDays, 0);
  const totalBSub   = allStats.reduce((acc, x) => acc + x.s.bShiftSubsidy, 0);
  const totalScheduled = allStats.reduce((acc, x) => acc + x.s.scheduledDays, 0);
  const avgWork     = (totalWork / members.length).toFixed(1);
  const avgRate     = totalScheduled ? Math.round((totalWork / totalScheduled) * 100) : 0;
  const rateColor   = _rateColor(avgRate);

  // 班次汇总
  const teamShiftCounts = {};
  shiftKeys.forEach(k => {
    teamShiftCounts[k] = allStats.reduce((acc, x) => acc + (x.s.shiftCount[k] || 0), 0);
  });
  const shiftTotal = shiftKeys.reduce((a, k) => a + (teamShiftCounts[k] || 0), 0) || 1;

  // TOP3
  const sorted = [...allStats].sort((a, b) => (b.s.scheduledDays ? b.s.workDays / b.s.scheduledDays : 0) - (a.s.scheduledDays ? a.s.workDays / a.s.scheduledDays : 0));
  const medals = ['\uD83E\uDD47','\uD83E\uDD48','\uD83E\uDD49'];

  return `<div class="att-dash-detail-panel">
    <div class="att-team-card" style="margin:0;box-shadow:none">
      <div class="att-team-header">
        <span class="att-team-name">${groupName}</span>
        <span class="att-team-count">${members.length} 人</span>
        <div class="att-team-kpis">
          <span>人均出勤 <span class="att-team-kpi-val" style="color:var(--primary)">${avgWork}</span> 天</span>
          <span>请假 <span class="att-team-kpi-val" style="color:#722ED1">${totalLeave}</span> 天</span>
          <span>三薪 <span class="att-team-kpi-val" style="color:#FA541C">${totalTriple}</span> 天</span>
          <span>B班补贴<span class="att-team-kpi-val" style="color:#00B42A">¥${totalBSub}</span></span>
          <span>出勤率<span class="att-team-kpi-val" style="color:${rateColor}">${avgRate}%</span></span>
        </div>
      </div>

      <div class="att-team-body">
        <div class="att-team-members-area">
          <div class="att-team-members-grid">
            ${allStats.map(({m, s}) => {
              const rate = s.scheduledDays > 0 ? Math.round((s.workDays / s.scheduledDays) * 100) : 0;
              const rc   = _rateColor(rate);
              const rbc  = _rateBarColor(rate);
              return `
                <div class="att-team-member-card" onclick="event.stopPropagation();attView='personal';attFilterMember='${m.id}';_renderAttContent()">
                  ${avatarImg(m, '30px')}
                  <div class="att-team-member-info">
                    <div class="att-team-member-name">${m.name}</div>
                    <div class="att-team-member-bar-track">
                      <div class="att-team-member-bar-fill" style="width:${rate}%;background:${rbc}"></div>
                    </div>
                  </div>
                  <div class="att-team-member-rate">
                    <div class="att-team-member-rate-num" style="color:${rc}">${rate}%</div>
                    <div class="att-team-member-rate-days">${s.workDays}天</div>
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>

        <div class="att-team-side">
          <!-- 出勤率环形图 -->
          <div class="att-side-panel" style="text-align:center">
            <div class="att-side-panel-title" style="justify-content:center">小组出勤率</div>
            ${(() => {
              const r = avgRate, cx = 54, cy = 54, radius = 42, stroke = 9;
              const circ = 2 * Math.PI * radius;
              const rc = _rateBarColor(r);
              const uid = 'grpDonut_' + groupName.replace(/\\s/g,'');
              return '<svg width="108" height="108" viewBox="0 0 108 108">' +
                '<circle cx="' + cx + '" cy="' + cy + '" r="' + radius + '" fill="none" stroke="var(--border-light)" stroke-width="' + stroke + '"/>' +
                '<circle id="' + uid + '" cx="' + cx + '" cy="' + cy + '" r="' + radius + '" fill="none" stroke="' + rc + '" stroke-width="' + stroke + '"' +
                ' stroke-dasharray="0 ' + circ + '" stroke-dashoffset="' + (circ * 0.25) + '"' +
                ' stroke-linecap="round"' +
                ' data-target="' + ((r / 100) * circ) + '" data-circ="' + circ + '"/>' +
                '<text x="' + cx + '" y="' + (cy - 6) + '" text-anchor="middle" font-size="18" font-weight="700" fill="' + rc + '">' + r + '%</text>' +
                '<text x="' + cx + '" y="' + (cy + 12) + '" text-anchor="middle" font-size="10" fill="var(--text-tertiary)">出勤率</text>' +
              '</svg>';
            })()}
          </div>
          <!-- 班次汇总-->
          <div class="att-side-panel">
            <div class="att-side-panel-title">班次汇总</div>
            ${shiftKeys.filter(k => (teamShiftCounts[k]||0) > 0).map(k => `
              <div class="att-shift-bar-row">
                <span class="shift-cell shift-${k.toLowerCase()}" style="font-size:11px;padding:1px 6px;border-radius:3px;min-width:24px;text-align:center">${k}</span>
                <div class="att-shift-bar-track">
                  <div class="att-shift-bar-fill" style="width:${Math.round((teamShiftCounts[k]||0)/shiftTotal*100)}%"></div>
                </div>
                <span class="att-shift-bar-label" style="min-width:32px">${teamShiftCounts[k]}天</span>
              </div>`).join('') || '<div style="font-size:12px;color:var(--text-tertiary)">暂无排班数据</div>'}
          </div>
          <!-- TOP3 -->
          <div class="att-side-panel">
            <div class="att-side-panel-title">出勤率TOP3</div>
            ${sorted.slice(0, 3).map(({m, s}, i) => {
              const rate = s.scheduledDays > 0 ? Math.round((s.workDays / s.scheduledDays) * 100) : 0;
              const rc   = _rateColor(rate);
              const medalBg = ['rgba(255,215,0,0.12)','rgba(192,192,192,0.12)','rgba(205,127,50,0.12)'][i];
              const medalBorder = ['#FFD700','#C0C0C0','#CD7F32'][i];
              return `<div class="att-top3-item" style="background:${medalBg};border:1px solid ${medalBorder}33;border-radius:8px;padding:6px 8px;margin-bottom:5px">
                <span class="att-top3-medal" style="font-size:16px">${medals[i]}</span>
                ${avatarImg(m, '24px')}
                <div style="flex:1;min-width:0">
                  <div class="att-top3-name" style="font-weight:600">${m.name}</div>
                  <div style="font-size:10px;color:var(--text-tertiary)">${s.workDays}天· B班${s.bShiftDays}天</div>
                </div>
                <span class="att-top3-rate" style="color:${rc};font-size:14px;font-weight:700">${rate}%</span>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

// ---- 环形图rAF 动画 ----
function _animateDonutCharts() {
  const DURATION = 700;
  document.querySelectorAll('[data-target][data-circ]').forEach(el => {
    const target = parseFloat(el.dataset.target);
    const circ   = parseFloat(el.dataset.circ);
    const start  = performance.now();
    function step(now) {
      const t = Math.min((now - start) / DURATION, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      const cur  = target * ease;
      el.setAttribute('stroke-dasharray', `${cur} ${circ}`);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
}

// r122: _renderAttPersonal / _renderAttTeam 已移除（个人详情/团队对比 Tab 已删除）
function _PLACEHOLDER_PERSONAL_START() {
  const [yearStr, monthStr] = attFilterMonth.split('-');
  const search = (document.getElementById('attSearch')?.value || '').trim();
  let members = MEMBERS_DATA.filter(m => !m.excludeFromSchedule);
  members = _attFilterMembers(members);
  if (search) members = members.filter(m => m.name.includes(search) || m.mis.includes(search));
  const isAllMode = attFilterMember === 'all';
  if (!isAllMode) members = members.filter(m => m.id == attFilterMember);

  if (!members.length) return `
    <div class="att-empty">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none"><circle cx="24" cy="16" r="10" stroke="currentColor" stroke-width="2"/><path d="M6 42c0-9.94 8.06-18 18-18s18 8.06 18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      <p>暂无人员数据</p>
    </div>`;

  const daysInMonth = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();
  const shiftKeys = _workShiftKeys();

  // 优化②统一读取

  const schedData = _getScheduleForMonth(yearStr, monthStr);

  return members.map(m => {
    const s = _getAttStats(m.id, yearStr, monthStr);
    const rate = s.scheduledDays > 0 ? Math.round((s.workDays / s.scheduledDays) * 100) : 0;
    const rateColor    = _rateColor(rate);
    const rateBarColor = _rateBarColor(rate);
    const isExpanded   = !isAllMode || _attPersonExpandedIds.has(m.id);

    // KPI
    const kpis = [
      { num: s.workDays,       color: 'var(--primary)',  label: '出勤天' },
      { num: s.leaveDays,      color: '#722ED1',         label: '请假天' },
      { num: s.bShiftDays,     color: '#00B42A',         label: 'B班天' },
      { num: s.triplePayDays,  color: '#FA541C',         label: '三薪天' },
      { num: rate+'%',         color: rateColor,         label: '出勤率', divider: true },
    ];

    // 优化⑤all 模式下精简卡片 ——只有 header + 点击展开

    if (isAllMode && !isExpanded) {
      return `
        <div class="att-personal-card" style="cursor:pointer" onclick="_attPersonExpandedIds.add(${m.id});_renderAttContent()">
          <div class="att-personal-header" style="border-bottom:none">
            ${avatarImg(m, '36px')}
            <div>
              <div class="att-personal-name" style="font-size:14px">${m.name}</div>
              <div class="att-personal-meta">${m.mis} · ${m.team}</div>
            </div>
            <div class="att-personal-kpis">
              ${kpis.map(k => `
                <div class="att-personal-kpi-item${k.divider?' att-person-metric-divider':''}">
                  <div class="att-personal-kpi-num" style="color:${k.color};font-size:18px">${k.num}</div>
                  <div class="att-personal-kpi-label">${k.label}</div>
                </div>`).join('')}
            </div>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="margin-left:8px;color:var(--text-tertiary);flex-shrink:0;transition:transform 0.2s">
              <path d="M4 5.5L7 8.5L10 5.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
        </div>`;
    }

    // 日历格子

    const calCells = [];
    const firstDay = new Date(parseInt(yearStr), parseInt(monthStr) - 1, 1).getDay();
    for (let i = 0; i < firstDay; i++) calCells.push('<div class="att-cal-cell att-cal-empty"></div>');
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(parseInt(yearStr), parseInt(monthStr) - 1, d);
      const dow  = date.getDay();
      const isWeekend = dow === 0 || dow === 6;
      const isToday   = date.toDateString() === new Date().toDateString();
      const val  = schedData && schedData[m.id] ? (schedData[m.id][d] || 'OFF') : 'OFF';
      const info = getShiftDisplayInfo(val);
      // r118: 毛玻璃风格
      const cellCls = _calCellClass(info.color);
      const cls = ['att-cal-cell'];
      if (cellCls) cls.push(cellCls);
      if (isToday) cls.push('att-cal-today');
      if (isWeekend && val === 'OFF') cls.push('att-cal-weekend-cell');
      calCells.push(`
        <div class="${cls.join(' ')}">
          <div class="att-cal-day-num ${isWeekend?'att-cal-day-weekend':'att-cal-day-weekday'}">${d}</div>
          <span class="att-cal-shift">${info.label}</span>
        </div>`);
    }

    return `
      <div class="att-personal-card">
        <div class="att-personal-header">
          ${avatarImg(m, '36px')}
          <div>
            <div class="att-personal-name" style="font-size:14px">${m.name}</div>
            <div class="att-personal-meta">${m.mis} · ${m.team}</div>
          </div>
          <div class="att-personal-kpis">
            ${kpis.map(k => `
              <div class="att-personal-kpi-item${k.divider?' att-person-metric-divider':''}">
                <div class="att-personal-kpi-num" style="color:${k.color};font-size:18px">${k.num}</div>
                <div class="att-personal-kpi-label">${k.label}</div>
              </div>`).join('')}
          </div>
          ${isAllMode ? `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="margin-left:8px;color:var(--text-tertiary);flex-shrink:0;transform:rotate(180deg);transition:transform 0.2s;cursor:pointer" onclick="event.stopPropagation();_attPersonExpandedIds.delete(${m.id});_renderAttContent()">
            <path d="M4 5.5L7 8.5L10 5.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>` : ''}
        </div>
        <div class="att-personal-body">
          <div class="att-personal-cal-area ${_calSeasonClass(monthStr)}">
            <div class="att-personal-cal-title"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" style="vertical-align:-2px;margin-right:5px"><rect x="1.5" y="2.5" width="13" height="12" rx="2" stroke="currentColor" stroke-width="1.3"/><path d="M5 1v3M11 1v3M1.5 6.5h13" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="5.5" cy="10" r="1" fill="var(--primary)"/><circle cx="8" cy="10" r="1" fill="var(--primary)"/><circle cx="10.5" cy="10" r="1" fill="var(--primary)"/></svg>${yearStr}年${parseInt(monthStr)}月排班日历</div>
            <div class="att-cal-grid-header">
              ${['日','一','二','三','四','五','六'].map((d,i) =>
                `<span class="${i===0||i===6?'att-cal-hdr-weekend':''}">${d}</span>`
              ).join('')}
            </div>
            <div class="att-cal-grid">${calCells.join('')}</div>
          </div>
          <div class="att-personal-sidebar">
            <div class="att-sidebar-section">
              <div class="att-sidebar-title">班次分布</div>
              ${shiftKeys.filter(k => (s.shiftCount[k] || 0) > 0).map(k => `
                <div class="att-shift-bar-row">
                  <span class="shift-cell shift-${k.toLowerCase()}" style="font-size:11px;padding:1px 6px;border-radius:3px;min-width:24px;text-align:center">${k}</span>
                  <div class="att-shift-bar-track">
                    <div class="att-shift-bar-fill" style="width:${s.workDays?Math.round((s.shiftCount[k]||0)/s.workDays*100):0}%"></div>
                  </div>
                  <span class="att-shift-bar-label">${s.shiftCount[k]}天</span>
                </div>`).join('') || '<div style="font-size:12px;color:var(--text-tertiary)">暂无排班</div>'}
            </div>
            <!-- r121: 个人卡片 - 标准工时+出勤工时+飘红逻辑 -->
            <div class="att-sidebar-section">
              <div class="att-sidebar-title">补贴与工时</div>
              <div class="att-leave-row"><span class="att-leave-name">B班天数</span><span style="font-weight:600;color:#00B42A">${s.bShiftDays}天</span></div>
              <div class="att-leave-row"><span class="att-leave-name">B班补贴</span><span style="font-weight:600;color:#00B42A">¥${s.bShiftSubsidy}</span></div>
              ${(() => {
                const _pStd = s.ondutyTotal !== null && s.ondutyTotal !== undefined ? s.ondutyTotal * 8 : s.standardHours;
                const _pAct = s.workDays * 8;
                const _pMismatch = _pStd !== _pAct && Math.abs(_pStd - _pAct) !== s.triplePayDays * 8;
                return '<div class="att-leave-row"><span class="att-leave-name">标准工时</span><span style="font-weight:500;color:var(--text-tertiary)">' + _pStd + 'h</span></div>' +
                  '<div class="att-leave-row"><span class="att-leave-name">出勤工时</span><span style="font-weight:600;' + (_pMismatch ? 'color:#CF1322' : '') + '">' + _pAct + 'h</span></div>';
              })()}
            </div>
            ${Object.keys(s.leaveBreakdown).length ? `
            <div class="att-sidebar-section">
              <div class="att-sidebar-title">请假明细</div>
              ${Object.entries(s.leaveBreakdown).map(([k,v]) => `
                <div class="att-leave-row"><span class="att-leave-name">${k}</span><span class="att-leave-val">${v}天</span></div>`).join('')}
            </div>` : ''}
            <div class="att-sidebar-section" style="text-align:center">
              <div class="att-sidebar-title" style="text-align:center">出勤率</div>
              ${(() => {
                const cx = 36, cy = 36, radius = 28, stroke = 6;
                const circ = 2 * Math.PI * radius;
                const uid = 'persDonut_' + m.id;
                return '<svg width="72" height="72" viewBox="0 0 72 72" style="margin-top:4px">' +
                  '<circle cx="' + cx + '" cy="' + cy + '" r="' + radius + '" fill="none" stroke="var(--border-light)" stroke-width="' + stroke + '"/>' +
                  '<circle id="' + uid + '" cx="' + cx + '" cy="' + cy + '" r="' + radius + '" fill="none" stroke="' + rateBarColor + '" stroke-width="' + stroke + '"' +
                  ' stroke-dasharray="0 ' + circ + '" stroke-dashoffset="' + (circ * 0.25) + '"' +
                  ' stroke-linecap="round"' +
                  ' data-target="' + ((rate / 100) * circ) + '" data-circ="' + circ + '"/>' +
                  '<text x="' + cx + '" y="' + cy + '" text-anchor="middle" dominant-baseline="central" font-size="14" font-weight="700" fill="' + rateColor + '">' + rate + '%</text>' +
                '</svg>';
              })()}
            </div>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ---- 导出 CSV（Bug⑦+ 优化⑤工时精度：---
function exportAttendanceCSV() {
  const [yearStr, monthStr] = attFilterMonth.split('-');
  const daysInMonth = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();
  const search = (document.getElementById('attSearch')?.value || '').trim();
  const shiftKeys = _workShiftKeys();

  let members = MEMBERS_DATA.filter(m => !m.excludeFromSchedule);
  members = _attFilterMembers(members);
  if (search) members = members.filter(m => m.name.includes(search) || m.mis.includes(search));

  let rows = members.map(m => {
    const s = _getAttStats(m.id, yearStr, monthStr);
    const rate = s.scheduledDays > 0 ? Math.round((s.workDays / s.scheduledDays) * 100) : 0;
    return { m, s, rate };
  });

  if (attFilterAnomalyMode === 'leave')  rows = rows.filter(r => r.s.leaveDays > 0);
  if (attFilterAnomalyMode === 'triple') rows = rows.filter(r => r.s.triplePayDays > 0);

  // r109: 扫描当月活跃请假类型（同 _renderAttOverview 逻辑）
  const _csvUsedLN = new Set();
  rows.forEach(r => Object.keys(r.s.leaveBreakdown).forEach(k => _csvUsedLN.add(k)));
  const _csvSeenLN = new Set();
  const csvActiveLeaveNames = LEAVE_TYPES.map(lt => lt.name).filter(n => {
    if (_csvSeenLN.has(n) || !_csvUsedLN.has(n)) return false;
    _csvSeenLN.add(n); return true;
  });

  const _modeLabel = { leave:'请假人员', triple:'三薪人员' };
  const safeSearch = search.replace(/[\\/:*?"<>|]/g, '').slice(0, 20);
  const filterDesc = [
    (attFilterTeam !== 'all' && attFilterTeam !== 'allteams') ? _attTeamLabel(attFilterTeam) : '',
    attFilterAnomalyMode !== 'all' ? _modeLabel[attFilterAnomalyMode] : '',
    safeSearch ? `搜索_${safeSearch}` : '',
  ].filter(Boolean).join('_');
  const filename = `考勤统计_${attFilterMonth}${filterDesc ? '_' + filterDesc : ''}.csv`;

  // r121: 考勤通知数据（用于导出确认状态）
  const _csvNotifyData = loadAttNotify(attFilterMonth);
  const _csvNotifySent = _csvNotifyData && _csvNotifyData.sent;

  const header = [
    '姓名', 'MIS号', '团队',
    ...shiftKeys.map(k => k + '班'),
    '休',
    ...csvActiveLeaveNames.map(n => n + '(天)'),
    '当月天数', '应出勤天数', '实际出勤', '出勤率(%)', '三薪天数', 'B班天数', 'B班补贴(元)', '标准工时(h)', '出勤工时(h)', '考勤确认'
  ];
  const csvRows = rows.map(({ m, s, rate }) => {
    const _stdH = s.ondutyTotal !== null && s.ondutyTotal !== undefined ? s.ondutyTotal * 8 : s.standardHours;
    const _actH = s.workDays * 8;
    const _mn = _csvNotifySent && _csvNotifyData.members[m.id];
    const _cs = !_csvNotifySent ? '待确认' : (_mn && _mn.confirmed) ? '是' : (_mn && _mn.disputed) ? '否' : '待确认';
    return [
      m.name, m.mis, m.team,
      ...shiftKeys.map(k => s.shiftCount[k] || 0),
      s.offDays,
      ...csvActiveLeaveNames.map(n => s.leaveBreakdown[n] || 0),
      s.daysInMonth, s.ondutyTotal !== null && s.ondutyTotal !== undefined ? s.ondutyTotal : '', s.workDays, rate, s.triplePayDays, s.bShiftDays, s.bShiftSubsidy, _stdH, _actH, _cs
    ].join(',');
  });

  const csv = '\uFEFF' + [header.join(','), ...csvRows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  showToast(`CSV 已导出（${rows.length} 人）`, 'success');
}
