// ===== 排班日历模块 — 核心渲染引擎 =====
// opt4: 已拆分 schedule-state.js (状态/颜色) 和 schedule-cards.js (卡片/弹窗)
// 本文件包含：renderSchedulePage + 表格渲染 + 导航 + 管理 + 工具

// ===== r81: 常量提取 — 消除魔法字符串 =====
const _SEL_SHIFT_CELL = '.shift-cell[data-member-id]';
const _SHIFT_OFF = 'OFF';

// ===== r81: 月历预计算缓存 — 消除热循环中的 new Date() =====
// 每月只算一次，存下每天的 dayOfWeek / isWeekend / dateStr 等信息
let _monthCalCache = null;       // { year, month, days[] }
let _monthCalCacheKey = '';      // 'YYYY_M' 格式的缓存键

function _ensureMonthCalendar(year, month) {
  const key = year + '_' + month;
  if (_monthCalCache && _monthCalCacheKey === key) return _monthCalCache;
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = new Array(daysInMonth);
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    const dow = date.getDay();
    days[d - 1] = {
      day: d,
      dow: dow,
      isWeekend: dow === 0 || dow === 6,
      dateStr: date.toDateString()
    };
  }
  _monthCalCache = { year: year, month: month, daysInMonth: daysInMonth, days: days };
  _monthCalCacheKey = key;
  return _monthCalCache;
}

// ===== r81: 按团队名获取成员（内置团队 + 自定义日历卡片覆盖）=====
function _getTeamMembers(team) {
  const customCal = CUSTOM_CALENDARS.find(function(c) {
    return c.builtinTeam === team || c.name === team;
  });
  if (customCal && customCal.memberIds) {
    return MEMBERS_DATA.filter(function(m) { return customCal.memberIds.includes(m.id) && !m.excludeFromSchedule; });
  }
  return MEMBERS_DATA.filter(function(m) { return m.team === team && !m.excludeFromSchedule; });
}

// ===== r78/r108: 模块级缓存 — statHeaders / uniqueLeaveTypes =====
let _cachedStatHeaders = null;
let _cachedUniqueLeaveTypes = null;
let _statHeadersCacheKey = ''; // 用于检测 SHIFTS/LEAVE_TYPES/活跃请假类型 变化
// r108: 当月活跃请假类型 — 只有有人实际使用的请假类型才生成统计列
let _activeLeaveIds = new Set(); // 由 _scanActiveLeaveTypes() 在 renderSchedulePage 入口更新
function _scanActiveLeaveTypes() {
  const daysInMonth = new Date(scheduleYear, scheduleMonth, 0).getDate();
  const used = new Set();
  const allMembers = MEMBERS_DATA.filter(m => !m.excludeFromSchedule);
  for (let d = 1; d <= daysInMonth; d++) {
    for (const m of allMembers) {
      const sv = getMemberShift(m.id, d);
      if (sv && sv.startsWith('LEAVE:')) {
        used.add(sv.replace('LEAVE:', ''));
      }
    }
  }
  _activeLeaveIds = used;
}
function _buildStatHeaders() {
  const activeSuffix = [..._activeLeaveIds].sort().join(',');
  const cacheKey = Object.keys(SHIFTS).join(',') + '|' + LEAVE_TYPES.map(lt => lt.id + ':' + lt.name).join(',') + '|' + activeSuffix;
  if (_cachedStatHeaders && _statHeadersCacheKey === cacheKey) return { statHeaders: _cachedStatHeaders, uniqueLeaveTypes: _cachedUniqueLeaveTypes };
  const shiftKeys = Object.keys(SHIFTS).filter(k => k !== _SHIFT_OFF);
  const _ltSeen = new Set();
  const uniqueLeaveTypes = LEAVE_TYPES.filter(lt => {
    if (_ltSeen.has(lt.name)) return false;
    _ltSeen.add(lt.name);
    return true;
  });
  // r108: 只保留当月有人实际使用的请假类型
  const activeUniqueLeaveTypes = uniqueLeaveTypes.filter(lt => {
    const allIds = LEAVE_TYPES.filter(x => x.name === lt.name).map(x => x.id);
    return allIds.some(id => _activeLeaveIds.has(id));
  });
  const statHeaders = [
    ...shiftKeys.map(k => ({ key: k, label: SHIFTS[k]?.label || k, color: SHIFTS[k]?.color || '', isShift: true })),
    { key: 'total_work', label: '合计', color: '', isTotal: true },
    ...activeUniqueLeaveTypes.map(lt => ({
      key: 'leave_' + lt.id,
      label: lt.name,
      color: lt.color || '',
      isLeave: true,
      mergedIds: LEAVE_TYPES.filter(x => x.name === lt.name).map(x => x.id)
    })),
    { key: 'off', label: '休', color: 'shift-off', isOff: true },
    { key: '_workHours', label: '工时', color: '', isHours: true },
  ];
  _cachedStatHeaders = statHeaders;
  _cachedUniqueLeaveTypes = activeUniqueLeaveTypes;
  _statHeadersCacheKey = cacheKey;
  return { statHeaders, uniqueLeaveTypes: activeUniqueLeaveTypes };
}

// r78: 合并计算 — 一次遍历同时生成 dayCounts + 每个成员的 stats
function _calcTeamStats(members, daysInMonth) {
  const shiftKeys = Object.keys(SHIFTS).filter(k => k !== _SHIFT_OFF);
  const leaveTypeIds = LEAVE_TYPES.map(lt => lt.id);
  const dayCounts = [];
  const teamUsedShifts = new Set();
  // 初始化每个成员的统计
  const memberStatsMap = {};
  members.forEach(m => {
    const stats = {};
    shiftKeys.forEach(k => { stats[k] = 0; });
    leaveTypeIds.forEach(id => { stats['leave_' + id] = 0; });
    stats.off = 0;
    stats._workDays = 0;
    stats._halfLeaveDays = 0; // r110: 半天假天数
    memberStatsMap[m.id] = stats;
  });
  // 单次遍历：天 × 成员
  for (let d = 1; d <= daysInMonth; d++) {
    const counts = {}; shiftKeys.forEach(k => { counts[k] = 0; });
    let total = 0;
    members.forEach(m => {
      const sv = getMemberShift(m.id, d);
      const mst = memberStatsMap[m.id];
      if (!sv || sv === _SHIFT_OFF) { mst.off++; return; }
      if (sv.startsWith('LEAVE:')) {
        const ltId = sv.replace('LEAVE:', '');
        const key = 'leave_' + ltId;
        const lt = LEAVE_TYPES.find(t => t.id === ltId);
        const dur = lt ? (lt.duration || 1) : 1;
        if (mst[key] !== undefined) mst[key] += dur;
        else mst['leave_other'] = (mst['leave_other'] || 0) + dur;
        if (dur < 1) mst._halfLeaveDays++; // r110: 半天假计数
      } else if (SHIFTS[sv]) {
        mst[sv] = (mst[sv] || 0) + 1;
        mst._workDays++;
        counts[sv] = (counts[sv] || 0) + 1;
        total++;
        teamUsedShifts.add(sv);
      }
    });
    dayCounts.push({ counts, total });
  }
  // r110: 计算工时 — 每班统一8h，半天假算4h
  members.forEach(m => {
    const mst = memberStatsMap[m.id];
    mst._workHours = mst._workDays * 8 + (mst._halfLeaveDays || 0) * 4;
  });
  return { dayCounts, teamUsedShifts, memberStatsMap };
}

// r78/r81: 生成 tbody 统计行 HTML（合计行 + 各班次行）— 使用月历缓存消除 new Date()
function _renderStatRows(team, daysInMonth, dayCounts, teamUsedShifts, statHeaders, tripleDates, isFolded) {
  const shiftKeys = Object.keys(SHIFTS).filter(k => k !== _SHIFT_OFF);
  const foldClass = isFolded ? ' sch-shift-row-collapsed' : '';
  const foldBtnText = isFolded ? '&#9654;' : '&#9660;';
  const foldBtnTitle = isFolded ? '展开班次行' : '折叠班次行';
  const parts = [];
  const cal = _ensureMonthCalendar(scheduleYear, scheduleMonth);

  // 预构建三薪 Set 加速查找（替代 tripleDates.includes）
  const tripleSet = new Set(tripleDates);

  // r96: 读取规则配置，用于关联班次统计的红色告警
  let _savedRules = null;
  try { _savedRules = typeof _storageGetRaw === 'function' ? JSON.parse(_storageGetRaw('glxt_schedule_rules') || 'null') : SCHEDULE_RULES; } catch(e) { /* ignore */ }
  const _teamRule = (_savedRules && _savedRules.teamRules && _savedRules.teamRules[team]) || {};
  const _globalWeekendExempt = _savedRules && _savedRules.weekendExempt !== undefined ? _savedRules.weekendExempt : true;
  const _teamWeekendExempt = _teamRule.weekendExempt !== undefined ? _teamRule.weekendExempt : _globalWeekendExempt;
  // 合计行：每日最少在班人数
  const _minOnduty = _teamRule.minOndutyPerDay !== undefined ? _teamRule.minOndutyPerDay : (_savedRules && _savedRules.minOndutyPerDay != null ? _savedRules.minOndutyPerDay : 5);
  // 各班次最少人数
  const _teamShiftMin = _teamRule.shiftMin || {};
  const _globalShiftMin = (_savedRules && _savedRules.shiftMin) || {};
  function _getShiftMin(shiftKey) {
    if (_teamShiftMin[shiftKey] !== undefined) return _teamShiftMin[shiftKey];
    if (_globalShiftMin[shiftKey] !== undefined) return _globalShiftMin[shiftKey];
    return 0;
  }
  // 判断某天是否周末豁免
  function _isDayExempt(dayIndex) {
    if (!_teamWeekendExempt) return false;
    return cal.days[dayIndex].isWeekend;
  }

  // 合计行（含折叠按钮 + hover tooltip）
  parts.push(`<tr class="schedule-stat-summary-row schedule-stat-total-row" data-team-id="${team}">
    <td class="schedule-name-col schedule-stat-label-cell">
      <div class="sch-total-label-wrap">
        <span class="schedule-stat-label schedule-stat-label-total">合计</span>
        <button class="sch-fold-btn" title="${foldBtnTitle}" onclick="toggleScheduleShiftRow(this, '${team}')">${foldBtnText}</button>
      </div>
    </td>
    ${cal.days.map((dayInfo, i) => {
      const d = dayInfo.day;
      const isTriple = tripleSet.has(scheduleMonth + '/' + d);
      const bgStyle = '';
      const dc = dayCounts[i];
      const ttParts = shiftKeys.filter(k => dc.counts[k] > 0).map(k => (SHIFTS[k]?.label || k) + '班 ' + dc.counts[k] + '人');
      const ttText = ttParts.length > 0 ? ttParts.join('&#10;') : '无在班人员';
      const numText = dc.total === 0 ? '-' : dc.total;
      // r96: 合计低于每日最少在班人数 → 红色告警（周末豁免时跳过）
      const _totalBelowMin = _minOnduty > 0 && dc.total < _minOnduty && !_isDayExempt(i);
      const _totalAlertCls = _totalBelowMin ? ' sch-stat-rule-alert' : '';
      const _totalAlertTip = _totalBelowMin ? '&#10;⚠ 低于最少在班 ' + _minOnduty + ' 人' : '';
      return '<td class="schedule-stat-day-cell schedule-stat-total-day' + (isTriple ? ' schedule-header-triple' : '') + _totalAlertCls + '" style="' + bgStyle + '" title="' + ttText + _totalAlertTip + '">'
        + '<span class="schedule-stat-day-num schedule-stat-total-num' + (dc.total === 0 ? ' schedule-stat-zero' : '') + (_totalBelowMin ? ' sch-stat-rule-alert-num' : '') + '">' + numText + '</span></td>';
    }).join('')}
    ${statHeaders.map(() => '<td class="sch-stat-td schedule-stat-placeholder"></td>').join('')}
  </tr>`);

  // 各班次行（可折叠 + 可点击查看人名）
  shiftKeys.forEach(k => {
    if (!teamUsedShifts.has(k)) return;
    const shift = SHIFTS[k];
    const _shiftMinVal = _getShiftMin(k);
    parts.push(`<tr class="schedule-stat-summary-row schedule-stat-shift-row${foldClass}" data-team-id="${team}" data-shift-key="${k}">
      <td class="schedule-name-col schedule-stat-label-cell">
        <span class="schedule-stat-label"><span class="shift-cell ${shift.color} schedule-stat-shift-icon">${shift.label}</span></span>
      </td>
      ${cal.days.map((dayInfo, i) => {
        const d = dayInfo.day;
        const isTriple = tripleSet.has(scheduleMonth + '/' + d);
        const bgStyle = '';
        const cnt = dayCounts[i].counts[k] || 0;
        const numText = cnt === 0 ? '-' : cnt;
        // r96: 班次计数低于规则最少人数 → 红色告警（周末豁免时跳过）
        const _belowMin = _shiftMinVal > 0 && cnt < _shiftMinVal && !_isDayExempt(i);
        const _alertCls = _belowMin ? ' sch-stat-rule-alert' : '';
        const _alertTip = _belowMin ? ' title="⚠ ' + (shift.name || shift.label) + '班低于最少 ' + _shiftMinVal + ' 人"' : '';
        return '<td class="schedule-stat-day-cell schedule-stat-shift-day' + (isTriple ? ' schedule-header-triple' : '') + _alertCls + '" style="' + bgStyle + '"' + _alertTip + '>'
          + '<span class="schedule-stat-day-num sch-stat-clickable' + (cnt === 0 ? ' schedule-stat-zero' : '') + (_belowMin ? ' sch-stat-rule-alert-num' : '') + '" onclick="showShiftDayMembers(event,\'' + team + '\',' + d + ',\'' + k + '\')">' + numText + '</span></td>';
      }).join('')}
      ${statHeaders.map(() => '<td class="sch-stat-td schedule-stat-placeholder"></td>').join('')}
    </tr>`);
  });

  return parts.join('');
}

// r78: 班次行数字点击 → 显示该天该班次的具体人名 popover
function showShiftDayMembers(event, team, day, shiftKey) {
  event.stopPropagation();
  // 关闭已有的 popover
  document.querySelectorAll('.sch-member-popover').forEach(el => el.remove());
  // r81: 复用模块级 _getTeamMembers
  const members = _getTeamMembers(team);
  // 筛选当天排了该班次的成员
  const matched = members.filter(m => getMemberShift(m.id, day) === shiftKey);
  if (matched.length === 0) return;
  const shiftInfo = SHIFTS[shiftKey];
  const pop = document.createElement('div');
  pop.className = 'sch-member-popover';
  pop.innerHTML = `
    <div class="sch-mp-header">
      <span class="shift-cell ${shiftInfo.color}" style="width:16px;height:16px;border-radius:4px;font-size:9px;font-weight:800;display:inline-flex;align-items:center;justify-content:center">${shiftInfo.label}</span>
      <span>${scheduleMonth}/${day} · ${matched.length}人</span>
    </div>
    <div class="sch-mp-list">${matched.map(m => `<div class="sch-mp-item">${m.name}</div>`).join('')}</div>
  `;
  document.body.appendChild(pop);
  // 定位
  const rect = event.target.getBoundingClientRect();
  pop.style.left = Math.min(rect.left, window.innerWidth - 180) + 'px';
  pop.style.top = (rect.bottom + 4) + 'px';
  // 点击外部关闭
  setTimeout(() => {
    const _close = (e) => { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('mousedown', _close); } };
    document.addEventListener('mousedown', _close);
  }, 50);
}

function renderSchedulePage(container) {
  const today = new Date();
  const daysInMonth = new Date(scheduleYear, scheduleMonth, 0).getDate();

  // r108: 预扫描当月活跃请假类型，使统计列按需显示（无人请的假不占列）
  _scanActiveLeaveTypes();

  const anomalies = detectScheduleAnomalies();

  // 决定展示哪些团队
  // 'all'=全部, 'self'=仅看自己, 其他=指定团队或自定义日历
  let teamsToShow;
  let customCalendarsToShow = [];
  const _hiddenTeams = _getHiddenBuiltinTeams();
  const _isCustomCalFilter = CUSTOM_CALENDARS.some(c => c.id === scheduleFilter.team && !c.builtinTeam);
  if (scheduleFilter.team === 'all') {
    teamsToShow = TEAMS.filter(t => !_hiddenTeams.includes(t));
    customCalendarsToShow = CUSTOM_CALENDARS.filter(c => !c.builtinTeam);
  } else if (scheduleFilter.team === 'self') {
// 找当前用户所在团队（excludeFromSchedule 的人员显示全部团队）
const selfMember = MEMBERS_DATA.find(m => m.mis === CURRENT_USER.mis);
if (selfMember && !selfMember.excludeFromSchedule && TEAMS.includes(selfMember.team)) {
      teamsToShow = [selfMember.team];
    } else {
      teamsToShow = TEAMS.filter(t => !_hiddenTeams.includes(t));
      customCalendarsToShow = CUSTOM_CALENDARS.filter(c => !c.builtinTeam);
    }
  } else if (_isCustomCalFilter) {
    // 筛选到自定义日历卡片 → 不显示内置团队
    teamsToShow = [];
    customCalendarsToShow = CUSTOM_CALENDARS.filter(c => c.id === scheduleFilter.team && !c.builtinTeam);
  } else {
    teamsToShow = [scheduleFilter.team];
  }

  // ===== #14/#16: 卡片数据统一由 _buildCardData 构建 =====
  const _cd = _buildCardData(today, daysInMonth, anomalies);
  const isCurrentMonth = _cd.isCurrentMonth;
  const canEditCards = _cd.canEditCards;
  const ondutyOverride = _cd.ondutyOverride;
  const tripleDates = ondutyOverride.tripleDates || [];

  container.innerHTML = `
    <div class="schedule-page-wrap">

      <!-- ===== 五卡片 ===== -->
      <div class="schedule-header-cards">
        ${_renderCardDate(_cd)}
        ${_renderCardOnduty(_cd)}
        ${_renderCardRule(_cd)}
        ${_renderCardAnnouncement(_cd)}
        ${_renderCardOndutyStats(_cd)}
      </div>

      <!-- ===== 工具栏（上行图例 + 下行操作 + 公告入口）===== -->
      <div class="schedule-toolbar-wrap">
        <!-- 上行：班次图例（管理员可自定义编辑）-->
        <div class="sch-toolbar-top">
          <div class="shift-legend">
            ${(function() {
              const cfg = getLegendConfig();
              const shiftItems = cfg.showShifts.map(k => {
                const v = SHIFTS[k];
                if (!v) return '';
                return `<span class="shift-legend-item"><span class="shift-legend-dot ${v.color}"></span><span>${v.name}</span>${v.start && v.end ? `<span style="font-size:10.5px;color:var(--text-tertiary,#999);margin-left:2px">${v.start}\u2013${v.end}</span>` : ''}</span>`;
              }).join('');
              const leaveItems = cfg.showLeaves.map(id => {
                const lt = LEAVE_TYPES.find(l => l.id === id);
                if (!lt) return '';
                return `<span class="shift-legend-item"><span class="shift-legend-dot ${lt.color}"></span>${lt.name}</span>`;
              }).join('');
              return shiftItems + leaveItems;
            })()}
            ${canEditCards ? `<button class="sch-legend-edit-btn" onclick="showLegendEditModal()" title="自定义图例栏显示内容">
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M9.5 2.5l2 2-7 7H2.5v-2l7-7z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
              自定义
            </button>` : ''}
          </div>
        </div>
        <!-- 下行：团队筛选 + 操作按钮 + 公告入口 -->
        <div class="sch-toolbar-bottom">
          <!-- 团队筛选（自定义弹窗） -->
          <div class="sch-team-filter-wrap" style="position:relative">
            <button class="sch-team-filter-btn" id="schTeamFilterBtn" onclick="toggleSchTeamPopup(event)" type="button">
              <svg width="12" height="12" viewBox="0 0 13 13" fill="none" style="color:rgba(0,0,0,0.4);flex-shrink:0;transition:color 0.15s">
                <path d="M1.5 3.5h10M3.5 6.5h6M5.5 9.5h2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
              </svg>
              <span class="sch-team-filter-label" id="schTeamFilterLabel">${
                scheduleFilter.team === 'all' ? '全部团队' :
                scheduleFilter.team === 'self' ? '仅看自己' :
                scheduleFilter.team
              }</span>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style="color:rgba(0,0,0,0.3);flex-shrink:0;transition:transform 0.18s" id="schTeamFilterChevron">
                <path d="M2 3.5l3 3 3-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <!-- 弹窗 -->
            <div class="sch-team-popup" id="schTeamPopup" onclick="event.stopPropagation()">
              <div class="sch-team-popup-header">
                <div class="sch-team-popup-title">筛选视图</div>
              </div>
              <div class="sch-team-popup-list">
                ${[
                  { value: 'all', icon: '👥', label: '全部团队' },
                  { value: 'self', icon: '👤', label: '仅看自己' },
                  ...TEAMS.filter(t => !_hiddenTeams.includes(t)).map(t => ({ value: t, icon: '🏷', label: t })),
                  ...CUSTOM_CALENDARS.filter(c => !c.builtinTeam).map(c => ({ value: c.id, icon: '📅', label: c.name }))
                ].map(item => `
                  <button class="sch-team-popup-item ${scheduleFilter.team === item.value ? 'active' : ''}"
                    onclick="selectSchTeam('${item.value}')" type="button">
                    <span class="sch-team-popup-item-icon">${item.icon}</span>
                    <span class="sch-team-popup-item-label">${item.label}</span>
                    ${scheduleFilter.team === item.value ? `<svg class="sch-team-popup-check" width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2.5 6.5l3 3 5-5" stroke="#3370FF" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ''}
                  </button>
                `).join('')}
              </div>
            </div>
          </div>
          <!-- 人员搜索框 -->
          <div class="sch-member-search-wrap">
            <svg class="sch-member-search-icon" width="12" height="12" viewBox="0 0 14 14" fill="none">
              <circle cx="6" cy="6" r="4" stroke="currentColor" stroke-width="1.3"/>
              <path d="M9.5 9.5L12 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            </svg>
            <input type="text" id="memberSearchInput" class="sch-member-search-input"
              placeholder="搜索人员..." oninput="filterScheduleMembers(this.value)"
              autocomplete="off" spellcheck="false">
            <button class="sch-member-search-clear" id="memberSearchClear" onclick="clearMemberSearch()" style="display:none" title="清除">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
            </button>
          </div>
          <!-- r101: 工具栏 — 独立卡片按钮 -->
          ${canEditCards ? `
          <button class="sch-action-btn sch-action-batch" onclick="_enterBatchMode()" title="进入批量模式后点击格子多选，再选择班次批量应用">
            <span class="sch-btn-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="7" height="7" rx="2" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="1.5"/>
                <rect x="14" y="3" width="7" height="7" rx="2" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="1.5"/>
                <rect x="3" y="14" width="7" height="7" rx="2" fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="1.5"/>
                <rect x="14" y="14" width="7" height="7" rx="2" fill="currentColor" opacity="0.1" stroke="currentColor" stroke-width="1.5"/>
              </svg>
            </span>
            <span class="sch-btn-text">批量排班</span>
          </button>` : ''}
          <button class="sch-action-btn sch-action-calendar" onclick="showCalendarManage()">
            <span class="sch-btn-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="4" width="18" height="17" rx="3" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="1.5"/>
                <path d="M8 2v3M16 2v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                <path d="M3 9.5h18" stroke="currentColor" stroke-width="1.5"/>
                <circle cx="8" cy="14" r="1.2" fill="currentColor"/><circle cx="12" cy="14" r="1.2" fill="currentColor"/><circle cx="16" cy="14" r="1.2" fill="currentColor" opacity="0.4"/>
              </svg>
            </span>
            <span class="sch-btn-text">日历管理</span>
          </button>
          <button class="sch-action-btn sch-action-shift" onclick="showShiftManage()">
            <span class="sch-btn-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.1" stroke="currentColor" stroke-width="1.5"/>
                <path d="M12 7v5l3.5 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            <span class="sch-btn-text">班次管理</span>
          </button>
          <button class="sch-action-btn sch-action-leave" onclick="showLeaveManage()">
            <span class="sch-btn-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M9 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M9 3v4a2 2 0 002 2h4" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M15 3l6 6v-1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M8 13h3M8 16.5h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </span>
            <span class="sch-btn-text">请假管理</span>
          </button>
          <!-- 导入/导出 -->
          <div class="sch-io-wrap" style="position:relative">
            <button class="sch-action-btn sch-action-io" onclick="toggleSchIOMenu(event)" title="导入/导出排班数据">
              <span class="sch-btn-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M12 3v9m0 0l-3.5-3.5M12 12l3.5-3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M3 15v3a3 3 0 003 3h12a3 3 0 003-3v-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                  <path d="M3 15h18" stroke="currentColor" stroke-width="1" opacity="0.15"/>
                </svg>
              </span>
              <span class="sch-btn-text">导入/导出</span>
              <svg width="9" height="9" viewBox="0 0 10 10" fill="none" style="margin-left:2px;opacity:0.4"><path d="M2.5 3.8l2.5 2.5 2.5-2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <div class="sch-io-menu" id="schIOMenu">
              <div class="sch-io-menu-header">数据操作</div>
              <div class="sch-io-cards">
                <div class="sch-io-card" onclick="showOfflineImport();closeSchIOMenu()">
                  <div class="sch-io-card-icon import-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 15V3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
                  </div>
                  <div class="sch-io-card-title">导入排班</div>
                  <div class="sch-io-card-desc">从 Excel / CSV 文件导入，支持差异预览与冲突检测</div>
                </div>
                <div class="sch-io-card" onclick="exportScheduleCSV();closeSchIOMenu()">
                  <div class="sch-io-card-icon export-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M17 8l-5-5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 3v12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
                  </div>
                  <div class="sch-io-card-title">导出排班</div>
                  <div class="sch-io-card-desc">导出 Excel / CSV 格式，可选月份范围和自定义列</div>
                </div>
              </div>
              <div class="sch-io-divider"></div>
              <button class="sch-io-history-btn" onclick="showImportHistory();closeSchIOMenu()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/><path d="M12 7v5l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                导入历史记录
              </button>
            </div>
          </div>

        </div>
      </div>

      <!-- ===== 排班日历主体 ===== -->
      <div class="schedule-calendar">
        ${teamsToShow.map(team => renderTeamScheduleBlock(team, daysInMonth, today, tripleDates)).join('')}
        ${customCalendarsToShow.map(cal => renderTeamScheduleBlock(cal.name, daysInMonth, today, tripleDates, cal.memberIds)).join('')}
      </div>

    </div>
  `;

  // ── 在班天数下拉面板：追加到 body，脱离卡片 overflow:hidden ──
  (function buildOndutyDetailPanel() {
    const existing = document.getElementById('ondutyDetailPanel');
    if (existing) existing.remove();
    const daysInM = new Date(scheduleYear, scheduleMonth, 0).getDate();
    const normalVal = ondutyOverride.normal;
    const tripleVal = ondutyOverride.triple;
    const ratePct = normalVal !== null ? Math.round(normalVal / daysInM * 100) : 0;
    // 在班率颜色：≥80% 绿色，≥60% 橙色，<60% 红色
    const rateColor = ratePct >= 80 ? 'linear-gradient(90deg,#00B42A,#52C41A)'
                    : ratePct >= 60 ? 'linear-gradient(90deg,#FF7D00,#FFA940)'
                    : 'linear-gradient(90deg,#F53F3F,#FF6B6B)';
    const rateLabel = ratePct >= 80 ? '高' : ratePct >= 60 ? '中' : '低';
    const rateLabelColor = ratePct >= 80 ? '#00B42A' : ratePct >= 60 ? '#FF7D00' : '#F53F3F';
    const canEdit = canEditCards;
    const panel = document.createElement('div');
    panel.id = 'ondutyDetailPanel';
    panel.className = 'sch-onduty-detail';
    panel.style.cssText = 'display:none;position:fixed;z-index:9999';
    panel.innerHTML = `
      <div class="sch-onduty-detail-title">
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.3"/><path d="M7 4v3.2l2 1.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
        ${scheduleYear}年${scheduleMonth}月排班天数详情
        <span class="sch-onduty-detail-hint">点击数值可编辑</span>
      </div>
      <div class="sch-onduty-detail-row">
        <div class="sch-onduty-detail-icon" style="background:linear-gradient(135deg,#722ED1,#531DAB)">月</div>
        <div class="sch-onduty-detail-info">
          <div class="sch-onduty-detail-label">当月天数</div>
          <div class="sch-onduty-detail-sub">本月日历总天数</div>
        </div>
        <div class="sch-onduty-detail-val">${daysInM} <span>天</span></div>
      </div>
      <div class="sch-onduty-detail-row" ${canEdit ? 'onclick="showOndutyEditModal()" style="cursor:pointer"' : ''}>
        <div class="sch-onduty-detail-icon" style="background:linear-gradient(135deg,#00B42A,#009A29)">班</div>
        <div class="sch-onduty-detail-info">
          <div class="sch-onduty-detail-label">当月在班天数</div>
          <div class="sch-onduty-detail-sub">至少1人上班的天数</div>
        </div>
        <div class="sch-onduty-detail-val" style="color:#00B42A">${normalVal !== null ? normalVal : '—'} <span>天</span></div>
      </div>
      <div class="sch-onduty-detail-row sch-onduty-detail-row-triple" ${canEdit ? 'onclick="showOndutyEditModal()" style="cursor:pointer"' : ''}>
        <div class="sch-onduty-detail-icon" style="background:linear-gradient(135deg,#FA8C16,#D46B08)">薪</div>
        <div class="sch-onduty-detail-info">
          <div class="sch-onduty-detail-label">当月三薪天数</div>
          <div class="sch-onduty-detail-sub">点击日期自定义三薪日</div>
        </div>
        <div class="sch-onduty-detail-val" style="color:#FA8C16">${tripleVal !== null ? tripleVal : '—'} <span>天</span></div>
      </div>
      ${tripleDates.length > 0 ? `<div class="sch-onduty-detail-dates">${tripleDates.map(d=>`<span class="sch-onduty-triple-date-tag">${d}</span>`).join('')}</div>` : ''}
      <div class="sch-onduty-detail-rate">
        <div class="sch-onduty-detail-rate-header">
          <span class="sch-onduty-detail-rate-label">在班率</span>
          <span class="sch-onduty-detail-rate-badge" style="color:${rateLabelColor};background:${ratePct >= 80 ? 'rgba(0,180,42,0.1)' : ratePct >= 60 ? 'rgba(255,125,0,0.1)' : 'rgba(245,63,63,0.1)'}">${rateLabel}</span>
        </div>
        <div class="sch-onduty-detail-rate-bar">
          <div class="sch-onduty-detail-rate-fill" style="width:${ratePct}%;background:${rateColor}"></div>
        </div>
        <div class="sch-onduty-detail-rate-text">
          <span style="color:${rateLabelColor};font-weight:700">${ratePct}%</span>
          <span>（${normalVal !== null ? normalVal : 0} / ${daysInM} 天在班）</span>
        </div>
      </div>
    `;
    document.body.appendChild(panel);
  })();

  // opt8: 滚动阴影指示器
  _initScrollShadow();

  // #8: 虚拟滚动 — 大团队行懒渲染
  _initVirtualRows();

  // 渲染完成后延迟刷新冲突角标
  setTimeout(_refreshConflictBadges, 50);

}

// ===== r71: 纯 div 手绘水平滚动条 + 滚动阴影 =====
// 方案：.schedule-table-wrap 隐藏原生滚动条，
//       用 .sch-hscroll-track + .sch-hscroll-thumb 纯 div 手绘，
//       JS 控制 thumb 宽度/位置/拖拽/点击/滚轮，完全不依赖浏览器滚动条渲染。
function _initScrollShadow() {
  document.querySelectorAll('.schedule-table-wrap').forEach(wrap => {
    const block = wrap.closest('.team-schedule-block');
    if (!block) return;

    const sw = wrap.scrollWidth, cw = wrap.clientWidth;
    // 不需要滚动时不显示滚动条
    const needScroll = sw > cw + 2;

    // ── 1. 创建或复用 track + thumb ──
    let track = block.querySelector('.sch-hscroll-track');
    if (!track) {
      track = document.createElement('div');
      track.className = 'sch-hscroll-track';
      const thumb = document.createElement('div');
      thumb.className = 'sch-hscroll-thumb';
      track.appendChild(thumb);
      wrap.insertAdjacentElement('afterend', track);
    }
    const thumb = track.querySelector('.sch-hscroll-thumb');

    // 不需要滚动时隐藏 track
    track.style.display = needScroll ? '' : 'none';
    if (!needScroll) return;

    // ── 2. 计算 thumb 宽度和位置 ──
    function syncThumb() {
      const sw2 = wrap.scrollWidth, cw2 = wrap.clientWidth;
      if (sw2 <= cw2) { track.style.display = 'none'; return; }
      track.style.display = '';
      const trackW = track.clientWidth;
      const ratio = cw2 / sw2;
      const thumbW = Math.max(40, Math.round(trackW * ratio));
      const maxThumbLeft = trackW - thumbW;
      const scrollRatio = wrap.scrollLeft / (sw2 - cw2);
      const thumbLeft = Math.round(maxThumbLeft * scrollRatio);
      thumb.style.width = thumbW + 'px';
      thumb.style.left = thumbLeft + 'px';
    }
    syncThumb();

    // ── 3. wrap 滚动 → 同步 thumb 位置 ──
    function onWrapScroll() {
      syncThumb();
      updateShadow();
    }
    if (wrap._schScrollHandler) wrap.removeEventListener('scroll', wrap._schScrollHandler);
    wrap._schScrollHandler = onWrapScroll;
    wrap.addEventListener('scroll', onWrapScroll, { passive: true });

    // ── 4. thumb 拖拽 ──
    let dragStartX = 0, dragStartLeft = 0;
    function onThumbDown(e) {
      e.preventDefault();
      e.stopPropagation();
      dragStartX = e.clientX;
      dragStartLeft = parseInt(thumb.style.left) || 0;
      thumb.classList.add('sch-thumb-dragging');
      document.addEventListener('mousemove', onThumbMove);
      document.addEventListener('mouseup', onThumbUp);
    }
    function onThumbMove(e) {
      const dx = e.clientX - dragStartX;
      const trackW = track.clientWidth;
      const thumbW = thumb.offsetWidth;
      const maxLeft = trackW - thumbW;
      const newLeft = Math.max(0, Math.min(maxLeft, dragStartLeft + dx));
      thumb.style.left = newLeft + 'px';
      // 同步 wrap.scrollLeft
      const scrollRatio = newLeft / maxLeft;
      wrap.scrollLeft = scrollRatio * (wrap.scrollWidth - wrap.clientWidth);
    }
    function onThumbUp() {
      thumb.classList.remove('sch-thumb-dragging');
      document.removeEventListener('mousemove', onThumbMove);
      document.removeEventListener('mouseup', onThumbUp);
    }
    // 移除旧监听
    if (thumb._schDown) thumb.removeEventListener('mousedown', thumb._schDown);
    thumb._schDown = onThumbDown;
    thumb.addEventListener('mousedown', onThumbDown);

    // ── 5. 点击 track 空白区域 → 跳转 ──
    function onTrackClick(e) {
      if (e.target === thumb) return; // 点的是 thumb，不处理
      const rect = track.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const trackW = track.clientWidth;
      const scrollRatio = clickX / trackW;
      wrap.scrollLeft = scrollRatio * (wrap.scrollWidth - wrap.clientWidth);
    }
    if (track._schClick) track.removeEventListener('click', track._schClick);
    track._schClick = onTrackClick;
    track.addEventListener('click', onTrackClick);

    // ── 6. 滚动阴影 ──
    function updateShadow() {
      const sl = wrap.scrollLeft, sw2 = wrap.scrollWidth, cw2 = wrap.clientWidth;
      wrap.classList.toggle('sch-scroll-left', sl > 2);
      wrap.classList.toggle('sch-scroll-right', sl + cw2 < sw2 - 2);
    }
    updateShadow();

    // ── 7. ResizeObserver：表格宽度变化时同步 thumb ──
    if (wrap._schResizeObserver) wrap._schResizeObserver.disconnect();
    const ro = new ResizeObserver(() => { syncThumb(); updateShadow(); });
    ro.observe(wrap);
    wrap._schResizeObserver = ro;
  });
}

// ===== #8: 虚拟行懒渲染 — 成员超过 VROW_THRESHOLD 时隐藏不可见行 =====
const _VROW_THRESHOLD = 12; // 超过此人数才启用
let _vrowObserver = null;

function _initVirtualRows() {
  // 断开旧 observer
  if (_vrowObserver) { _vrowObserver.disconnect(); _vrowObserver = null; }

  // 找所有团队表格
  document.querySelectorAll('.team-schedule-block').forEach(block => {
    const tbody = block.querySelector('tbody');
    if (!tbody) return;
    // 只统计成员行（排除统计摘要行）
    const memberRows = Array.from(tbody.querySelectorAll('tr:not(.schedule-stat-summary-row):not(.schedule-stat-total-row):not(.schedule-stat-shift-row)'));
    if (memberRows.length <= _VROW_THRESHOLD) return; // 人数少，不启用

    // 初始：只显示前 _VROW_THRESHOLD 行，其余隐藏
    memberRows.forEach((row, i) => {
      if (i >= _VROW_THRESHOLD) row.style.contentVisibility = 'auto';
    });

    // 用 IntersectionObserver 监听 block 进入视口
    if (!_vrowObserver) {
      _vrowObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          // 进入视口：显示所有行
          const b = entry.target;
          b.querySelectorAll('tbody tr').forEach(r => r.style.contentVisibility = '');
          _vrowObserver.unobserve(b);
        });
      }, { rootMargin: '200px 0px' });
    }
    _vrowObserver.observe(block);
  });
}

// 动态计算排班日历列宽：让表格恰好填满容器，最小32px最大52px
function calcScheduleColWidth(daysInMonth) {
  const nameColW = 90;
  const contentArea = document.getElementById('contentArea');
  let available = contentArea ? contentArea.clientWidth - 48 : 0;
  // fallback：CSS 未加载完或 flex 布局未计算时，用窗口宽度估算（侧边栏约220px）
  if (available <= 0) available = window.innerWidth - 220 - 48;
  const colW = Math.floor((available - nameColW) / daysInMonth);
  return Math.min(Math.max(colW, 32), 52); // 限制在32~52px之间
}

// 渲染单个团队的排班块（含团队标题 + 人力统计行 + 人员行）
// 统计行：每天1列，格子内竖排显示 A / B / C 三行，行线隔开
// memberIdsOverride: 可选，自定义日历卡片传入指定成员 ID 列表
function renderTeamScheduleBlock(team, daysInMonth, today, tripleDates, memberIdsOverride) {
  // 内置团队检查管理员覆盖设置
  const _builtinOverride = !memberIdsOverride ? CUSTOM_CALENDARS.find(c => c.builtinTeam === team) : null;
  const _effectiveIds = memberIdsOverride || (_builtinOverride ? _builtinOverride.memberIds : null);
  const members = _effectiveIds
    ? MEMBERS_DATA.filter(m => _effectiveIds.includes(m.id) && !m.excludeFromSchedule)
    : MEMBERS_DATA.filter(m => m.team === team && !m.excludeFromSchedule);
  if (members.length === 0) return '';
  const colW = calcScheduleColWidth(daysInMonth);

  // r81: 月历缓存 + 三薪 Set
  const cal = _ensureMonthCalendar(scheduleYear, scheduleMonth);
  const tripleSet = new Set(tripleDates);
  const todayStr = today.toDateString();
  const _isAdminUser = isAdmin();

  // ===== ⑥ 统计列：各班次/请假/工时（r78: 使用模块级缓存 + 合并遍历）=====
  const shiftKeys = Object.keys(SHIFTS).filter(k => k !== _SHIFT_OFF);
  const { statHeaders } = _buildStatHeaders();
  const { dayCounts, teamUsedShifts, memberStatsMap } = _calcTeamStats(members, daysInMonth);

  // 判断折叠状态（opt6）
  const isFolded = scheduleState.foldState[team] === true;

  // r78: 统计列表头 rowspan=2
  const statHeaderHtml = statHeaders.map((h, hi) => {
    const isFirst = hi === 0;
    const borderLeft = isFirst ? 'border-left:2px solid rgba(0,0,0,0.10);' : '';
    if (h.isShift) return `<th class="sch-stat-th" rowspan="2" style="${borderLeft}" title="${SHIFTS[h.key]?.name || h.label}"><span class="shift-cell ${h.color}" style="width:24px;height:24px;border-radius:0;font-size:20px;font-weight:800;display:inline-flex;align-items:center;justify-content:center">${h.label}</span></th>`;
    if (h.isTotal) return `<th class="sch-stat-th sch-stat-th-total sch-stat-sortable" rowspan="2" style="${borderLeft}cursor:pointer" title="合计在班天数（点击排序）" onclick="_sortTeamBy(this,'${team}','total_work')" data-sort-key="total_work">合计<span class="sch-sort-icon">⇅</span></th>`;
    if (h.isLeave) return `<th class="sch-stat-th sch-stat-sortable" rowspan="2" style="${borderLeft}max-width:40px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer" title="${LEAVE_TYPES.find(lt=>'leave_'+lt.id===h.key)?.name||h.label}（点击排序）" onclick="_sortTeamBy(this,'${team}','${h.key}')" data-sort-key="${h.key}">${h.label.length>2?h.label.slice(0,2):h.label}<span class="sch-sort-icon">⇅</span></th>`;
    if (h.isOff) return `<th class="sch-stat-th sch-stat-sortable" rowspan="2" style="${borderLeft}cursor:pointer" title="休息天数（点击排序）" onclick="_sortTeamBy(this,'${team}','off')" data-sort-key="off">休<span class="sch-sort-icon">⇅</span></th>`;
    if (h.isHours) return `<th class="sch-stat-th sch-stat-th-hours sch-stat-sortable" rowspan="2" style="${borderLeft}cursor:pointer" title="工时（点击排序）" onclick="_sortTeamBy(this,'${team}','_workHours')" data-sort-key="_workHours">工时<span class="sch-sort-icon">⇅</span></th>`;
    return `<th class="sch-stat-th sch-stat-sortable" rowspan="2" style="${borderLeft}cursor:pointer" onclick="_sortTeamBy(this,'${team}','${h.key}')" data-sort-key="${h.key}">${h.label}<span class="sch-sort-icon">⇅</span></th>`;
  }).join('');

  // r78: 使用抽取的 _renderStatRows 生成统计行 HTML
  const _statRowsHtml = _renderStatRows(team, daysInMonth, dayCounts, teamUsedShifts, statHeaders, tripleDates, isFolded);

  let html = `
    <div class="team-schedule-block">
      <div class="team-schedule-header">
        <div class="team-schedule-title">
          <span class="team-badge">${team}</span>
          <span class="team-member-count">${members.length}人</span>
        </div>
        ${_isAdminUser ? `<button class="sch-clear-team-btn" title="清空${team}本月所有排班" onclick="_clearTeamSchedule('${team}')">🗑 清空排班</button>` : ''}
      </div>
      <div class="schedule-table-wrap">
        <table class="schedule-table" style="width:100%;table-layout:auto">
          <colgroup>
            <col style="width:90px;min-width:90px;max-width:90px">
            ${Array.from({length: daysInMonth}, () => `<col style="width:${colW}px;min-width:${colW}px">`).join('')}
            ${statHeaders.map(() => `<col style="width:auto;min-width:60px">`).join('')}
          </colgroup>
          <thead>
            <!-- r60: 第一行：日期 + 统计列表头 -->
            <tr class="schedule-date-row">
<th class="schedule-name-col" style="vertical-align:middle;font-size:16px;font-weight:700;color:#000;text-align:center">
日期
</th>
              ${cal.days.map(dayInfo => {
                const d = dayInfo.day;
                const isToday = dayInfo.dateStr === todayStr;
                const isTriple = tripleSet.has(scheduleMonth + '/' + d);
                // #2: 管理员可点击日期表头快速填充该列
                const fillAttr = _isAdminUser ? ` onclick="showQuickFillMenu(event,'${team}',${d})" title="${scheduleMonth}/${d} 点击快速填充整列班次" style="cursor:pointer;${dayInfo.isWeekend && !isTriple ? 'background:#FFF8F0' : ''}"` : ` style="${dayInfo.isWeekend && !isTriple ? 'background:#FFF8F0' : ''}"`;
                return '<th class="schedule-date-th sch-date-th-fillable' + (isTriple ? ' schedule-header-triple' : '') + (isToday ? ' schedule-th-today' : '') + '"' + fillAttr + '>'
                  + '<div class="schedule-header-date' + (isToday ? ' schedule-header-date-today' : '') + '">' + scheduleMonth + '/' + d + '</div>'
                  + (isTriple ? '<div class="schedule-triple-dot" title="三薪日"></div>' : '')
                  + '</th>';
              }).join('')}
              ${statHeaderHtml}
            </tr>
            <!-- r60: 第二行：星期X -->
            <tr class="schedule-weekday-row">
              <th class="schedule-name-col" style="vertical-align:middle;font-size:16px;font-weight:700;color:#000;text-align:center">星期</th>
              ${cal.days.map(dayInfo => {
                const d = dayInfo.day;
                const isToday = dayInfo.dateStr === todayStr;
                const isTriple = tripleSet.has(scheduleMonth + '/' + d);
                const weekDayNames = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
                return '<td class="schedule-weekday-td' + (isTriple ? ' schedule-header-triple' : '') + (isToday ? ' schedule-th-today' : '') + '" style="' + (dayInfo.isWeekend && !isTriple ? 'background:#FFF8F0' : '') + '">'
                  + '<span class="schedule-header-week">' + weekDayNames[dayInfo.dow] + '</span>'
                  + '</td>';
              }).join('')}
            </tr>
          </thead>
          <tbody>
            ${_statRowsHtml}
            ${members.map(member => {
              const avatarUrl = getAvatarUrl(member);
              const avatarFallback = _uiAvatar(member.name);
              const chatUrl = member.daxiangId ? `https://x.sankuai.com/chat/${member.daxiangId}?type=chat` : null;
              const mStats = memberStatsMap[member.id];
              // 合计在班天数
              const totalWorkDays = shiftKeys.reduce((s, k) => s + (mStats[k] || 0), 0);

              let row = `<tr>
                <td class="schedule-name-col">
                  <div style="display:flex;align-items:center;gap:5px">
                    <div style="position:relative;flex-shrink:0">
                      <img src="${avatarUrl}" style="width:22px;height:22px;border-radius:50%;cursor:pointer;display:block"
                           onclick="showPersonDetail(${member.id})"
                           onerror="this.onerror=null;this.src='${avatarFallback}'"
                           title="查看详情">
                      ${chatUrl ? `<a href="${chatUrl}" target="_blank" class="avatar-chat-btn" title="发大象消息">
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 2C1.5 1.45 1.95 1 2.5 1H7.5C8.05 1 8.5 1.45 8.5 2V6C8.5 6.55 8.05 7 7.5 7H5.5L3.5 9V7H2.5C1.95 7 1.5 6.55 1.5 6V2Z" fill="currentColor"/></svg>
                      </a>` : ''}
                    </div>
                    <div style="min-width:0">
                      <div class="schedule-member-name-text" style="font-size:11.5px;font-weight:500;white-space:nowrap;cursor:pointer" onclick="showPersonDetail(${member.id})" title="${member.name}&#10;MIS: ${member.mis || '—'}&#10;团队: ${member.team}&#10;本月在班: ${totalWorkDays}天">${member.name}</div>
                    </div>
                  </div>
                </td>`;
              for (let d = 1; d <= daysInMonth; d++) {
                const shift = getMemberShift(member.id, d);
                const shiftInfo = getShiftDisplayInfo(shift);
                const dayInfo = cal.days[d - 1];
                const isToday = dayInfo.dateStr === todayStr;
                const titleText = shiftInfo.isLeave
                  ? `${shiftInfo.name}（${shiftInfo.durationLabel || '全天'}）`
                  : `${shiftInfo.name}${shiftInfo.start ? ' ' + shiftInfo.start + '-' + (shiftInfo.end <= shiftInfo.start ? '次日' : '') + shiftInfo.end : ''}`;
                const isTripleCell = tripleSet.has(scheduleMonth + '/' + d);
                const isTripleEnd = isTripleCell && !tripleSet.has(scheduleMonth + '/' + (d + 1));
                const tdClass = isTripleCell
                  ? (isTripleEnd ? 'schedule-cell-triple schedule-cell-triple-end' : 'schedule-cell-triple')
                  : '';
                row += `<td class="${tdClass}" style="${isTripleCell ? 'background:rgba(250,140,22,0.08);' : (dayInfo.isWeekend ? 'background:#FFFAF5;' : '')}">
                  <div class="shift-cell ${shiftInfo.color}${isTripleCell && !shiftInfo.isLeave && shift !== _SHIFT_OFF ? ' shift-cell-triple' : ''}" onclick="_onShiftCellClick(${member.id}, ${d})" oncontextmenu="_onShiftCellContext(event, ${member.id}, ${d})" onmousedown="_onShiftCellMouseDown(event, ${member.id}, ${d})" title="${titleText}" data-member-id="${member.id}" data-day="${d}" data-shift="${shift}">
                    ${shiftInfo.label}
                  </div>
                </td>`;
              }
              // ===== 统计列数据（r95: 条件着色 + tooltip 详情 + 智能工时）=====
              // r95: 构建 tooltip 详情
              const _totalParts = shiftKeys.filter(k => (mStats[k] || 0) > 0).map(k => `${SHIFTS[k]?.label || k}班 ${mStats[k]}天`);
              const _totalTip = _totalParts.length > 0 ? `在班明细：\n${_totalParts.join('\n')}` : '无在班记录';
              const _leaveParts = LEAVE_TYPES.filter(lt => (mStats['leave_' + lt.id] || 0) > 0).map(lt => `${lt.name} ${mStats['leave_' + lt.id]}天`);
              const _leaveTip = _leaveParts.length > 0 ? `\n请假明细：\n${_leaveParts.join('\n')}` : '';
              // r110: 简化工时 — 每班统一8h + 半天假4h
              const _smartHours = mStats._workHours || (mStats._workDays * 8 + (mStats._halfLeaveDays || 0) * 4);
              statHeaders.forEach((h, hi) => {
                const borderStyle = hi === 0 ? ' style="border-left:2px solid rgba(0,0,0,0.10)"' : '';
                if (h.isTotal) {
                  row += `<td class="sch-stat-td sch-stat-td-total"${borderStyle} title="${_totalTip}${_leaveTip}"><span class="sch-stat-val sch-stat-total">${totalWorkDays}</span></td>`;
                } else if (h.isHours) {
                  // r110: 不足标黄（<标准工时60%）
                  const _stdHours = daysInMonth * 8 * 0.6;
                  const _hcls = _smartHours < _stdHours && _smartHours > 0 ? ' sch-stat-warn' : '';
                  row += `<td class="sch-stat-td sch-stat-td-hours${_hcls}"${borderStyle} title="实际工时 ${_smartHours}h（${mStats._workDays}天）"><span class="sch-stat-val sch-stat-hours">${_smartHours}</span></td>`;
                } else if (h.isOff) {
                  const offVal = mStats.off || 0;
                  row += `<td class="sch-stat-td"${borderStyle} title="本月休息 ${offVal} 天"><span class="sch-stat-val sch-stat-off">${offVal}</span></td>`;
                } else if (h.isLeave && h.mergedIds) {
                  const val = h.mergedIds.reduce((s, id) => s + (mStats['leave_' + id] || 0), 0);
                  row += `<td class="sch-stat-td"${borderStyle} title="${h.label} ${val}天"><span class="sch-stat-val ${val === 0 ? 'sch-stat-zero' : ''}">${val}</span></td>`;
                } else {
                  const val = mStats[h.key] || 0;
                  row += `<td class="sch-stat-td"${borderStyle} title="${SHIFTS[h.key]?.name || h.label} ${val}天"><span class="sch-stat-val ${val === 0 ? 'sch-stat-zero' : ''}">${val}</span></td>`;
                }
              });
              row += '</tr>';
              return row;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
  return html;
}

// ===== r95: 团队汇总行 — 底部显示平均/最高/最低 =====
function _renderTeamSummaryRow(members, daysInMonth, memberStatsMap, shiftKeys, statHeaders) {
  if (members.length === 0) return '';
  const n = members.length;
  // 收集每个成员的统计值
  const allStats = members.map(m => {
    const mst = memberStatsMap[m.id];
    const totalWork = shiftKeys.reduce((s, k) => s + (mst[k] || 0), 0);
    // r110: 简化工时 — 每班统一8h + 半天假4h
    const smartH = mst._workHours || (mst._workDays * 8 + (mst._halfLeaveDays || 0) * 4);
    return { totalWork, off: mst.off || 0, hours: smartH, mst };
  });
  const avgWork = (allStats.reduce((s, x) => s + x.totalWork, 0) / n).toFixed(1);
  const maxWork = Math.max(...allStats.map(x => x.totalWork));
  const minWork = Math.min(...allStats.map(x => x.totalWork));
  const avgHours = (allStats.reduce((s, x) => s + x.hours, 0) / n).toFixed(0);

  let cells = '';
  statHeaders.forEach((h, hi) => {
    const border = hi === 0 ? ' style="border-left:2px solid rgba(0,0,0,0.10)"' : '';
    if (h.isTotal) {
      cells += `<td class="sch-stat-td sch-stat-td-total sch-summary-td"${border} title="平均${avgWork} / 最高${maxWork} / 最低${minWork}"><span class="sch-stat-val sch-stat-total">${avgWork}</span></td>`;
    } else if (h.isHours) {
      cells += `<td class="sch-stat-td sch-stat-td-hours sch-summary-td"${border} title="团队平均工时"><span class="sch-stat-val sch-stat-hours">${avgHours}h</span></td>`;
    } else if (h.isOff) {
      const avgOff = (allStats.reduce((s, x) => s + x.off, 0) / n).toFixed(1);
      cells += `<td class="sch-stat-td sch-summary-td"${border}><span class="sch-stat-val">${avgOff}</span></td>`;
    } else if (h.isLeave && h.mergedIds) {
      const avgLeave = (allStats.reduce((s, x) => s + h.mergedIds.reduce((ls, id) => ls + (x.mst['leave_' + id] || 0), 0), 0) / n).toFixed(1);
      cells += `<td class="sch-stat-td sch-summary-td"${border}><span class="sch-stat-val">${avgLeave}</span></td>`;
    } else {
      const avg = (allStats.reduce((s, x) => s + (x.mst[h.key] || 0), 0) / n).toFixed(1);
      cells += `<td class="sch-stat-td sch-summary-td"${border}><span class="sch-stat-val">${avg}</span></td>`;
    }
  });

  return `<tr class="sch-team-summary-row">
    <td class="schedule-name-col sch-summary-label">
      <span style="font-size:11px;font-weight:700;color:var(--primary,#3370FF)">📊 均值</span>
    </td>
    ${Array.from({length: daysInMonth}, () => '<td class="sch-summary-td"></td>').join('')}
    ${cells}
  </tr>`;
}

// ===== r95: 统计列排序功能 =====
const _sortState = {}; // { teamId: { key, dir } }
function _sortTeamBy(thEl, teamId, sortKey) {
  const table = thEl.closest('table');
  if (!table) return;
  const state = _sortState[teamId] || {};
  // 切换排序方向
  if (state.key === sortKey) {
    state.dir = state.dir === 'desc' ? 'asc' : state.dir === 'asc' ? 'none' : 'desc';
  } else {
    state.key = sortKey; state.dir = 'desc';
  }
  _sortState[teamId] = state;

  // 清除所有排序图标状态
  table.querySelectorAll('.sch-sort-icon').forEach(ic => { ic.textContent = '⇅'; ic.className = 'sch-sort-icon'; });
  if (state.dir !== 'none') {
    const activeIcon = thEl.querySelector('.sch-sort-icon');
    if (activeIcon) {
      activeIcon.textContent = state.dir === 'desc' ? '↓' : '↑';
      activeIcon.className = 'sch-sort-icon sch-sort-active';
    }
  }

  // 获取数据行（排除统计行和汇总行）
  const tbody = table.querySelector('tbody');
  const allRows = Array.from(tbody.querySelectorAll('tr'));
  const dataRows = allRows.filter(r => r.querySelector('.shift-cell[data-member-id]'));
  const otherRows = allRows.filter(r => !r.querySelector('.shift-cell[data-member-id]'));

  if (state.dir === 'none') {
    // 恢复原始顺序（按 member-id）
    dataRows.sort((a, b) => {
      const aId = parseInt(a.querySelector('.shift-cell[data-member-id]')?.dataset.memberId || 0);
      const bId = parseInt(b.querySelector('.shift-cell[data-member-id]')?.dataset.memberId || 0);
      return aId - bId;
    });
  } else {
    const { statHeaders } = _buildStatHeaders();
    const colIdx = statHeaders.findIndex(h => (h.isTotal && sortKey === 'total_work') || (h.isHours && sortKey === '_workHours') || (h.isOff && sortKey === 'off') || h.key === sortKey);
    if (colIdx === -1) return;
    dataRows.sort((a, b) => {
      const aTds = a.querySelectorAll('.sch-stat-td');
      const bTds = b.querySelectorAll('.sch-stat-td');
      const aVal = parseFloat(aTds[colIdx]?.querySelector('.sch-stat-val')?.textContent) || 0;
      const bVal = parseFloat(bTds[colIdx]?.querySelector('.sch-stat-val')?.textContent) || 0;
      return state.dir === 'desc' ? bVal - aVal : aVal - bVal;
    });
  }

  // 重新排列 DOM：先统计行，再数据行，最后汇总行
  const statRows = otherRows.filter(r => r.classList.contains('schedule-stat-summary-row'));
  const summaryRows = otherRows.filter(r => r.classList.contains('sch-team-summary-row'));
  const restRows = otherRows.filter(r => !r.classList.contains('schedule-stat-summary-row') && !r.classList.contains('sch-team-summary-row'));
  statRows.forEach(r => tbody.appendChild(r));
  dataRows.forEach(r => tbody.appendChild(r));
  summaryRows.forEach(r => tbody.appendChild(r));
  restRows.forEach(r => tbody.appendChild(r));
}


// ===== 班次行折叠/展开（r78: 按钮移到合计行标签旁）=====
function toggleScheduleShiftRow(btn, teamId) {
  // r78: 按钮现在在 tbody 的合计行里，通过 closest('table') 找表格
  const table = btn.closest('table');
  if (!table) return;
  const shiftRows = table.querySelectorAll('.schedule-stat-shift-row');
  if (shiftRows.length === 0) return;
  const isCollapsed = shiftRows[0].classList.toggle('sch-shift-row-collapsed');
  shiftRows.forEach(row => row.classList.toggle('sch-shift-row-collapsed', isCollapsed));
  btn.innerHTML = isCollapsed ? '&#9654;' : '&#9660;';
  btn.title = isCollapsed ? '展开班次行' : '折叠班次行';
  scheduleState.foldState[teamId] = isCollapsed;
  _saveFoldState();
}

function changeScheduleMonth(delta) {
  _showCardSkeleton(); // #5 骨架屏过渡
  scheduleMonth += delta;
  if (scheduleMonth > 12) { scheduleMonth = 1; scheduleYear++; }
  if (scheduleMonth < 1) { scheduleMonth = 12; scheduleYear--; }
  const _saved = loadScheduleData(scheduleYear, scheduleMonth);
  SCHEDULE_DATA = _saved ? JSON.parse(JSON.stringify(_saved)) : generateScheduleData(scheduleYear, scheduleMonth);
  setTimeout(function() { renderSchedulePage(document.getElementById('contentArea')); }, 120);
}

function goToToday() {
  _showCardSkeleton(); // #5 骨架屏过渡
  scheduleYear = new Date().getFullYear();
  scheduleMonth = new Date().getMonth() + 1;
  const _saved = loadScheduleData(scheduleYear, scheduleMonth);
  SCHEDULE_DATA = _saved ? JSON.parse(JSON.stringify(_saved)) : generateScheduleData(scheduleYear, scheduleMonth);
  setTimeout(function() { renderSchedulePage(document.getElementById('contentArea')); }, 120);
}

function jumpToMonth(month) {
  if (month >= 1 && month <= 12) {
    scheduleMonth = month;
    const _saved = loadScheduleData(scheduleYear, scheduleMonth);
    SCHEDULE_DATA = _saved ? JSON.parse(JSON.stringify(_saved)) : generateScheduleData(scheduleYear, scheduleMonth);
    renderSchedulePage(document.getElementById('contentArea'));
  }
}

function jumpToYear(year) {
  const y = parseInt(year);
  if (!y || y === scheduleYear) return;
  scheduleYear = y;
  const saved = loadScheduleData(scheduleYear, scheduleMonth);
  SCHEDULE_DATA = saved ? JSON.parse(JSON.stringify(saved)) : generateScheduleData(scheduleYear, scheduleMonth);
  renderSchedulePage(document.getElementById('contentArea'));
}


function changeScheduleYear(delta) {
  scheduleYear += delta;
  const _saved = loadScheduleData(scheduleYear, scheduleMonth);
  SCHEDULE_DATA = _saved ? JSON.parse(JSON.stringify(_saved)) : generateScheduleData(scheduleYear, scheduleMonth);
  renderSchedulePage(document.getElementById('contentArea'));
}

// ===== 人员搜索过滤 =====
function filterScheduleMembers(keyword) {
  const kw = keyword.trim().toLowerCase();
  const clearBtn = document.getElementById('memberSearchClear');
  if (clearBtn) clearBtn.style.display = kw ? 'flex' : 'none';

  // 遍历所有人员行（tbody tr，排除统计行）
  const rows = document.querySelectorAll('.schedule-page-wrap .schedule-table tbody tr');
  rows.forEach(row => {
    const nameCell = row.querySelector('.schedule-name-col');
    if (!nameCell) return;
    const nameText = nameCell.querySelector('.schedule-member-name-text')
      ? nameCell.querySelector('.schedule-member-name-text').textContent.trim()
      : nameCell.textContent.trim();
    const match = !kw || nameText.toLowerCase().includes(kw);
    row.style.display = match ? '' : 'none';

    // 姓名高亮
    const span = nameCell.querySelector('.schedule-member-name-text');
    if (span) {
      if (kw && match) {
        const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        span.innerHTML = nameText.replace(new RegExp(escaped, 'gi'),
          m => `<mark class="sch-name-highlight">${m}</mark>`);
      } else {
        span.textContent = nameText;
      }
    }
  });

  // r60: 更新统计行可见性（有搜索时隐藏合计/班次统计行，但保留日期和星期表头行）
  document.querySelectorAll('.schedule-stat-summary-row').forEach(row => {
    row.style.display = kw ? 'none' : '';
  });

  // ★ 关键修复：无匹配成员的团队块整体隐藏
  document.querySelectorAll('.team-schedule-block').forEach(block => {
    if (!kw) {
      block.style.display = '';
      return;
    }
    const visibleRows = block.querySelectorAll('tbody tr:not(.schedule-stat-summary-row):not([style*="display: none"]):not([style*="display:none"])');
    block.style.display = visibleRows.length === 0 ? 'none' : '';
  });
}

function clearMemberSearch() {
  const input = document.getElementById('memberSearchInput');
  if (input) { input.value = ''; filterScheduleMembers(''); input.focus(); }
}

// ===== 团队筛选弹窗 =====
function toggleSchTeamPopup(e) {
  e && e.stopPropagation();
  const popup = document.getElementById('schTeamPopup');
  const chevron = document.getElementById('schTeamFilterChevron');
  if (!popup) return;
  const isOpen = popup.classList.contains('open');
  // 关闭所有其他弹窗
  document.querySelectorAll('.sch-team-popup.open').forEach(p => {
    p.classList.remove('open');
  });
  if (!isOpen) {
    // 定位弹窗
    const btn = document.getElementById('schTeamFilterBtn');
    if (btn) {
      const rect = btn.getBoundingClientRect();
      popup.style.top = (rect.bottom + 6) + 'px';
      popup.style.left = rect.left + 'px';
    }
    popup.classList.add('open');
    if (chevron) chevron.style.transform = 'rotate(180deg)';
    // 点击外部关闭
    setTimeout(() => {
      document.addEventListener('click', _closeSchTeamPopup, { once: true });
    }, 0);
  } else {
    if (chevron) chevron.style.transform = '';
  }
}
function _closeSchTeamPopup() {
  const popup = document.getElementById('schTeamPopup');
  const chevron = document.getElementById('schTeamFilterChevron');
  if (popup) popup.classList.remove('open');
  if (chevron) chevron.style.transform = '';
}
function selectSchTeam(value) {
  scheduleFilter.team = value;
  _closeSchTeamPopup();
  renderSchedulePage(document.getElementById('contentArea'));
}

// ===== 撤销/重做栈 =====
const _undoStack = [];
const _redoStack = [];
const _UNDO_MAX = 30;
function _undoPush(snapshot) {
  _undoStack.push(snapshot);
  if (_undoStack.length > _UNDO_MAX) _undoStack.shift();
  _redoStack.length = 0; // 新操作清空重做栈
}
function _undoApply(fromStack, toStack) {
  if (fromStack.length === 0) { showToast('没有可撤销的操作', 'info'); return; }
  // 先保存当前状态到对面栈
  toStack.push({ year: scheduleYear, month: scheduleMonth, data: JSON.parse(JSON.stringify(SCHEDULE_DATA)), desc: '撤销前快照' });
  if (toStack.length > _UNDO_MAX) toStack.shift();
  const snap = fromStack.pop();
  // 恢复数据
  Object.keys(SCHEDULE_DATA).forEach(k => delete SCHEDULE_DATA[k]);
  Object.assign(SCHEDULE_DATA, snap.data);
  saveScheduleData();
  showToast(fromStack === _undoStack ? `已撤销：${snap.desc}` : `已重做：${snap.desc}`, 'info');
  renderSchedulePage(document.getElementById('contentArea'));
}

// ===== r96: 清空团队排班 =====
function _clearTeamSchedule(team) {
  if (!isAdmin()) { showToast('仅管理员可操作', 'warning'); return; }
  const members = _getTeamMembers(team);
  if (members.length === 0) { showToast('该团队没有成员', 'info'); return; }
  const daysInMonth = new Date(scheduleYear, scheduleMonth, 0).getDate();
  // 统计当前有多少非空排班
  let filledCount = 0;
  members.forEach(m => {
    for (let d = 1; d <= daysInMonth; d++) {
      const sv = getMemberShift(m.id, d);
      if (sv && sv !== _SHIFT_OFF) filledCount++;
    }
  });
  if (filledCount === 0) { showToast('该团队本月没有排班数据', 'info'); return; }
  if (!confirm(`确定要清空「${team}」${scheduleMonth}月的所有排班吗？\n共 ${members.length} 人、${filledCount} 个已排班次将被清除。\n\n此操作可通过 Ctrl+Z 撤销。`)) return;
  // 保存撤销快照
  _undoStack.push({ year: scheduleYear, month: scheduleMonth, data: JSON.parse(JSON.stringify(SCHEDULE_DATA)), desc: `清空${team}排班` });
  if (_undoStack.length > _UNDO_MAX) _undoStack.shift();
  _redoStack.length = 0;
  // 清空该团队所有成员的排班数据
  members.forEach(m => {
    if (SCHEDULE_DATA[m.id]) {
      for (let d = 1; d <= daysInMonth; d++) {
        delete SCHEDULE_DATA[m.id][d];
      }
    }
  });
  // 使用同步写入确保数据持久化（防止刷新后恢复旧数据）
  const _key = _scheduleKey(scheduleYear, scheduleMonth);
  _storageSet(_key, SCHEDULE_DATA, true);
  if (typeof _clearAttCache === 'function') _clearAttCache();
  showToast(`已清空「${team}」${scheduleMonth}月排班（${filledCount}个班次）`, 'success');
  renderSchedulePage(document.getElementById('contentArea'));
}

// ===== 批量排班操作 =====
let _batchSelected = new Set(); // 格式: "memberId_day"
let _batchMode = false;

function _enterBatchMode() {
  _batchMode = true;
  _batchSelected.clear();
  _renderBatchBar();
}
function _exitBatchMode() {
  _batchMode = false;
  _batchSelected.clear();
  document.querySelectorAll('.shift-cell.batch-selected').forEach(el => el.classList.remove('batch-selected'));
  const bar = document.getElementById('schBatchBar');
  if (bar) bar.remove();
}
function _toggleBatchCell(memberId, day) {
  const key = memberId + '_' + day;
  const cell = document.querySelector(`.shift-cell[data-member-id="${memberId}"][data-day="${day}"]`);
  if (_batchSelected.has(key)) {
    _batchSelected.delete(key);
    if (cell) cell.classList.remove('batch-selected');
  } else {
    _batchSelected.add(key);
    if (cell) cell.classList.add('batch-selected');
  }
  _renderBatchBar();
}
function _renderBatchBar() {
  let bar = document.getElementById('schBatchBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'schBatchBar';
    bar.className = 'sch-batch-bar';
    document.body.appendChild(bar);
  }
  const count = _batchSelected.size;
  const shiftBtns = Object.entries(SHIFTS).map(([k, v]) => {
    const timeStr = v.start ? v.start + '-' + v.end : '休息';
    return `<button class="sch-batch-shift-btn ${v.color}" onclick="applyBatchShift('${k}')" title="${v.name}（${timeStr}）">${v.label}</button>`;
  }).join('');
  bar.innerHTML = `
    <div class="sch-batch-count">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="vertical-align:-2px;margin-right:4px"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      已选 <b>${count}</b> 格
    </div>
    <div class="sch-batch-divider" style="width:1px;height:20px;background:rgba(255,255,255,0.1)"></div>
    <div class="sch-batch-shifts">${shiftBtns}</div>
    <div class="sch-batch-divider" style="width:1px;height:20px;background:rgba(255,255,255,0.1)"></div>
    <button class="sch-batch-cancel" onclick="_exitBatchMode()">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="vertical-align:-1px;margin-right:3px"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
      退出
    </button>
  `;
}
function applyBatchShift(shiftKey) {
  if (_batchSelected.size === 0) return;
  if (!isAdmin()) { showToast('仅管理员可批量修改排班', 'warning'); return; }
  // #11: 推入撤销栈（批量修改前快照）
  const newInfo = getShiftDisplayInfo(shiftKey);
  _undoPush({ year: scheduleYear, month: scheduleMonth, data: JSON.parse(JSON.stringify(SCHEDULE_DATA)), desc: `批量修改 ${_batchSelected.size} 格为 ${newInfo.name}` });
  _batchSelected.forEach(key => {
    const [mId, d] = key.split('_').map(Number);
    if (!SCHEDULE_DATA[mId]) SCHEDULE_DATA[mId] = {};
    SCHEDULE_DATA[mId][d] = shiftKey;
  });
  saveScheduleData();
  showToast(`已批量修改 ${_batchSelected.size} 个格子为 ${newInfo.name}`, 'success');
  addWorkLog('考勤系统', '排班修改', `批量修改 ${_batchSelected.size} 格为 ${newInfo.name}`);
  // 不退出批量模式，只清空选区并刷新页面，用户手动点退出才退出
  _batchSelected.clear();
  renderSchedulePage(document.getElementById('contentArea'));
  // 页面重建后重新进入批量模式（恢复批量工具栏）
  _batchMode = true;
  _renderBatchBar();
}

// ===== r90: 排班调整弹窗 + 复制粘贴系统 统一交互路由 =====
let _shiftPopover = null;
let _shiftPopoverOverlay = null;
// 复制粘贴全局状态
let _cpSelected = new Set();       // 已选格子 'memberId_day'
let _cpCopied = [];                // 已复制数据
let _cpCopyAnchor = null;
let _cpCopyRect = null;            // {minMIdx,maxMIdx,minD,maxD,rows,cols}
let _cpDragging = false;
let _cpDragStart = null;
let _cpMarchingEl = null;
let _cpContextMenu = null;

function _cpGetVisibleMemberIds() {
  return Array.from(document.querySelectorAll('.shift-cell[data-member-id][data-day="1"]')).map(c => parseInt(c.dataset.memberId));
}

// 左键点击格子路由
function _onShiftCellClick(memberId, day) {
  if (_batchMode) { _toggleBatchCell(memberId, day); return; }
  if (isAdmin()) { _cpSelectSingle(memberId, day); return; }
  showShiftDetailPopover(memberId, day, null);
}
// 右键格子路由
function _onShiftCellContext(e, memberId, day) {
  e.preventDefault(); e.stopPropagation();
  if (isAdmin()) {
    const key = memberId + '_' + day;
    if (_cpSelected.size === 0 || !_cpSelected.has(key)) _cpSelectSingle(memberId, day);
    _showCpContextMenu(e, memberId, day);
    return;
  }
  showShiftDetailPopover(memberId, day, e);
}
// 鼠标按下（管理员拖选）
function _onShiftCellMouseDown(e, memberId, day) {
  if (e.button !== 0 || !isAdmin() || _batchMode) return;
  if (e.shiftKey && _cpSelected.size > 0) { e.preventDefault(); _cpRangeSelect(memberId, day); return; }
  if (e.ctrlKey || e.metaKey) { e.preventDefault(); _cpToggleSelect(memberId, day); return; }
  _cpDragging = true; _cpDragStart = { memberId, day };
  _cpClearSelection(); _cpAddToSelection(memberId, day);
}

// ===== 排班调整弹窗（三列布局 Popover） =====
function showShiftDetailPopover(memberId, day, event) {
  closeShiftDetailPopover();
  const member = getMemberById(memberId);
  if (!member) return;
  const currentShift = getMemberShift(memberId, day);
  const currentInfo = getShiftDisplayInfo(currentShift);
  const daysInMonth = new Date(scheduleYear, scheduleMonth, 0).getDate();
  const dayOfWeek = new Date(scheduleYear, scheduleMonth - 1, day).getDay();
  const wdn = ['日','一','二','三','四','五','六'];
  const weekStart = day - dayOfWeek;
  const weekDays = [];
  for (let i = 0; i < 7; i++) {
    const wd = weekStart + i;
    if (wd >= 1 && wd <= daysInMonth) {
      const si = getShiftDisplayInfo(getMemberShift(memberId, wd));
      weekDays.push({ day: wd, label: wdn[i], shift: si.label, isToday: wd === day });
    } else {
      weekDays.push({ day: wd, label: wdn[i], shift: '-', isToday: false, outOfRange: true });
    }
  }
  const admin = isAdmin();
  const isSelf = member.id === CURRENT_USER.id;
  const canRequest = !admin && isSelf;
  // 第一列
  const col1 = `<div class="sp-col-info">
    <div class="sp-current-shift">
      <div class="sp-shift-badge shift-cell ${currentInfo.color}" style="width:36px;height:36px;border-radius:8px;font-size:16px;font-weight:800;display:flex;align-items:center;justify-content:center">${currentInfo.label}</div>
      <div class="sp-shift-name">${currentInfo.name}</div>
      ${currentInfo.start ? `<div class="sp-shift-time">${currentInfo.start} - ${currentInfo.end}</div>` : ''}
    </div>
    <div class="sp-week-strip">${weekDays.map(w => `<div class="sp-week-day${w.isToday ? ' sp-week-today' : ''}${w.outOfRange ? ' sp-week-out' : ''}"><span class="sp-wd-label">${w.label}</span><span class="sp-wd-shift">${w.shift}</span></div>`).join('')}</div>
  </div>`;
  // 第二列
  const shiftCards = Object.entries(SHIFTS).map(([k, v]) => {
    const ic = currentShift === k;
    return `<div class="sp-option-card${ic ? ' sp-current' : ''}" data-sp-value="${k}" onclick="_spSelectOption(this,'${k}')"><div class="sp-opt-badge shift-cell ${v.color}">${v.label}</div><span class="sp-opt-name">${v.name}</span>${v.start ? `<span class="sp-opt-time">${v.start}-${v.end}</span>` : ''}</div>`;
  }).join('');
  const leaveCards = LEAVE_TYPES.map(lt => {
    const lk = 'LEAVE:' + lt.id;
    const ic = currentShift === lk;
    return `<div class="sp-option-card sp-leave-card${ic ? ' sp-current' : ''}" data-sp-value="${lk}" onclick="_spSelectOption(this,'${lk}')"><div class="sp-opt-badge shift-legend-dot ${lt.color}"></div><span class="sp-opt-name">${lt.name}</span><span class="sp-opt-time">${lt.duration === 0.5 ? '半天' : '全天'}</span></div>`;
  }).join('');
  const col2 = `<div class="sp-col-options"><div class="sp-section-title">班次</div><div class="sp-option-grid">${shiftCards}</div><div class="sp-section-title" style="margin-top:6px">请假</div><div class="sp-option-grid">${leaveCards}</div></div>`;
  // 第三列
  let col3;
  if (admin) {
    col3 = `<div class="sp-col-confirm" id="spConfirmPanel"><div class="sp-confirm-empty"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="opacity:0.3"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>选择左侧班次</span></div></div>`;
  } else if (canRequest) {
    col3 = `<div class="sp-col-confirm" id="spConfirmPanel"><div class="sp-confirm-empty"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="opacity:0.3"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>选择左侧班次后<br>提交调整申请</span></div></div>`;
  } else {
    col3 = `<div class="sp-col-confirm"><div class="sp-readonly-msg"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" style="opacity:0.25"><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-11v6h2v-6h-2zm0-4v2h2V7h-2z" fill="currentColor"/></svg><span>仅可查看排班信息</span><span style="font-size:11px;color:var(--text-quaternary)">如需调整请联系管理员<br>或在自己的排班上提交申请</span></div></div>`;
  }
  const dateStr = `${scheduleYear}年${scheduleMonth}月${day}日 周${wdn[dayOfWeek]}`;
  const overlay = document.createElement('div');
  overlay.className = 'shift-popover-overlay';
  overlay.onclick = closeShiftDetailPopover;
  const popover = document.createElement('div');
  popover.className = 'shift-popover';
  popover.onclick = function(ev) { ev.stopPropagation(); };
  popover.innerHTML = `<div class="shift-popover-header"><div class="shift-popover-header-left">${avatarImg(member, '28px')}<div><div class="sp-member-name">${member.name}</div><div class="sp-date-label">${dateStr}</div></div></div><button class="shift-popover-close" onclick="closeShiftDetailPopover()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg></button></div><div class="shift-popover-body">${col1}${col2}${col3}</div>`;
  popover._spCtx = { memberId, day, currentShift, admin, canRequest, selectedValue: null };
  document.body.appendChild(overlay);
  document.body.appendChild(popover);
  _shiftPopover = popover;
  _shiftPopoverOverlay = overlay;
  _positionPopover(popover, memberId, day, event);
}

function _positionPopover(popover, memberId, day, event) {
  const cell = document.querySelector(`.shift-cell[data-member-id="${memberId}"][data-day="${day}"]`);
  let x, y;
  if (event && event.clientX) { x = event.clientX; y = event.clientY; }
  else if (cell) { const r = cell.getBoundingClientRect(); x = r.left; y = r.bottom + 4; }
  else { x = window.innerWidth / 2 - 260; y = window.innerHeight / 2 - 140; }
  const pw = popover.offsetWidth || 540;
  const ph = popover.offsetHeight || 300;
  if (x + pw > window.innerWidth - 12) x = window.innerWidth - pw - 12;
  if (x < 8) x = 8;
  if (y + ph > window.innerHeight - 12) y = y - ph - 8;
  if (y < 8) y = 8;
  popover.style.left = x + 'px';
  popover.style.top = y + 'px';
}

function closeShiftDetailPopover() {
  if (_shiftPopover) { _shiftPopover.remove(); _shiftPopover = null; }
  if (_shiftPopoverOverlay) { _shiftPopoverOverlay.remove(); _shiftPopoverOverlay = null; }
}

function _spSelectOption(el, value) {
  if (!_shiftPopover) return;
  const ctx = _shiftPopover._spCtx;
  if (value === ctx.currentShift) return;
  _shiftPopover.querySelectorAll('.sp-option-card.sp-selected').forEach(c => c.classList.remove('sp-selected'));
  el.classList.add('sp-selected');
  ctx.selectedValue = value;
  _spUpdateConfirmPanel(ctx, value);
}

function _spUpdateConfirmPanel(ctx, newValue) {
  const panel = document.getElementById('spConfirmPanel');
  if (!panel) return;
  const oldInfo = getShiftDisplayInfo(ctx.currentShift);
  const newInfo = getShiftDisplayInfo(newValue);
  const preview = `<div class="sp-confirm-preview"><div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px">班次变更</div><div class="sp-arrow-row"><div class="shift-cell ${oldInfo.color}" style="width:28px;height:28px;border-radius:6px;font-size:13px;font-weight:800;display:inline-flex;align-items:center;justify-content:center">${oldInfo.label}</div><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><div class="shift-cell ${newInfo.color}" style="width:28px;height:28px;border-radius:6px;font-size:13px;font-weight:800;display:inline-flex;align-items:center;justify-content:center">${newInfo.label}</div></div><div style="font-size:11px;color:var(--text-secondary)">${oldInfo.name} → ${newInfo.name}</div></div>`;
  if (ctx.admin) {
    panel.innerHTML = `${preview}<button class="sp-confirm-btn sp-confirm-btn-admin" onclick="_spApplyAdmin()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>确认修改</button>`;
  } else if (ctx.canRequest) {
    panel.innerHTML = `${preview}<textarea class="sp-confirm-reason" id="spReasonInput" rows="2" placeholder="请输入调整原因（选填）"></textarea><button class="sp-confirm-btn sp-confirm-btn-request" onclick="_spSubmitRequest()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>提交调整申请</button>`;
  }
}

// 管理员直接修改
function _spApplyAdmin() {
  if (!_shiftPopover) return;
  const ctx = _shiftPopover._spCtx;
  if (!ctx.selectedValue) return;
  const newInfo = getShiftDisplayInfo(ctx.selectedValue);
  _undoPush({ year: scheduleYear, month: scheduleMonth, data: JSON.parse(JSON.stringify(SCHEDULE_DATA)), desc: `修改 ${getMemberById(ctx.memberId)?.name} ${ctx.day}日为 ${newInfo.name}` });
  if (!SCHEDULE_DATA[ctx.memberId]) SCHEDULE_DATA[ctx.memberId] = {};
  SCHEDULE_DATA[ctx.memberId][ctx.day] = ctx.selectedValue;
  saveScheduleData();
  markMonthAsImported(scheduleYear, scheduleMonth);
  addWorkLog('考勤系统', '排班调整', `${getMemberById(ctx.memberId)?.name} ${scheduleMonth}月${ctx.day}日 → ${newInfo.name}`);
  showToast(`已修改为 ${newInfo.name}`, 'success');
  closeShiftDetailPopover();
  _updateCellLocal(ctx.memberId, ctx.day);
}

// 普通用户提交调整申请
function _spSubmitRequest() {
  if (!_shiftPopover) return;
  const ctx = _shiftPopover._spCtx;
  if (!ctx.selectedValue) return;
  const member = getMemberById(ctx.memberId);
  const oldInfo = getShiftDisplayInfo(ctx.currentShift);
  const newInfo = getShiftDisplayInfo(ctx.selectedValue);
  const reason = document.getElementById('spReasonInput')?.value?.trim() || '';
  APPROVAL_RECORDS.unshift({
    id: 'sc_' + Date.now(), type: 'shift_change',
    applicant: member.name, applicantId: ctx.memberId, team: member.team,
    content: `排班调整：${scheduleMonth}月${ctx.day}日 ${oldInfo.name} → ${newInfo.name}${reason ? '，原因：' + reason : ''}`,
    submittedAt: formatDate(new Date(), 'YYYY-MM-DD HH:mm'),
    status: 'pending',
    shiftChangeData: { year: scheduleYear, month: scheduleMonth, day: ctx.day, memberId: ctx.memberId, oldShift: ctx.currentShift, newShift: ctx.selectedValue },
    context: { reason }
  });
  saveApprovalRecords();
  updateBadges();
  addWorkLog('考勤系统', '排班调整申请', `${member.name} 申请 ${scheduleMonth}月${ctx.day}日 ${oldInfo.name} → ${newInfo.name}`);
  showToast('调整申请已提交，等待管理员审批', 'success');
  closeShiftDetailPopover();
}

// ===== r90: 复制粘贴系统（管理员专属） =====
function _cpClearSelection() {
  document.querySelectorAll('.shift-cell.cp-selected').forEach(el => el.classList.remove('cp-selected'));
  _cpSelected.clear();
}
function _cpAddToSelection(memberId, day) {
  _cpSelected.add(memberId + '_' + day);
  const cell = document.querySelector(`.shift-cell[data-member-id="${memberId}"][data-day="${day}"]`);
  if (cell) cell.classList.add('cp-selected');
}
function _cpRemoveFromSelection(memberId, day) {
  _cpSelected.delete(memberId + '_' + day);
  const cell = document.querySelector(`.shift-cell[data-member-id="${memberId}"][data-day="${day}"]`);
  if (cell) cell.classList.remove('cp-selected');
}
function _cpSelectSingle(memberId, day) {
  _cpClearSelection();
  // 不清除已复制数据（_cpCopied），否则用户复制后点击目标格子时剪贴板被清空，粘贴永远失效
  _cpAddToSelection(memberId, day);
  _setKbFocus(memberId, day);
}
function _cpToggleSelect(memberId, day) {
  if (_cpSelected.has(memberId + '_' + day)) _cpRemoveFromSelection(memberId, day);
  else _cpAddToSelection(memberId, day);
}
function _cpRangeSelect(memberId, day) {
  if (_cpSelected.size === 0) { _cpSelectSingle(memberId, day); return; }
  const [aM, aD] = Array.from(_cpSelected)[0].split('_').map(Number);
  _cpSelectRect(aM, aD, memberId, day);
}
function _cpSelectRect(m1, d1, m2, d2) {
  const ids = _cpGetVisibleMemberIds();
  const i1 = ids.indexOf(m1), i2 = ids.indexOf(m2);
  if (i1 < 0 || i2 < 0) return;
  const minI = Math.min(i1, i2), maxI = Math.max(i1, i2);
  const minD = Math.min(d1, d2), maxD = Math.max(d1, d2);
  _cpClearSelection();
  for (let i = minI; i <= maxI; i++) for (let d = minD; d <= maxD; d++) _cpAddToSelection(ids[i], d);
}
// 拖选全局事件
document.addEventListener('mousemove', function(e) {
  if (!_cpDragging || !_cpDragStart) return;
  const cell = document.elementFromPoint(e.clientX, e.clientY)?.closest('.shift-cell[data-member-id]');
  if (!cell) return;
  _cpSelectRect(_cpDragStart.memberId, _cpDragStart.day, parseInt(cell.dataset.memberId), parseInt(cell.dataset.day));
}, false);
document.addEventListener('mouseup', function() {
  if (_cpDragging) { _cpDragging = false; _cpDragStart = null; }
}, false);

function _cpClearCopied() {
  document.querySelectorAll('.shift-cell.cp-copied').forEach(el => el.classList.remove('cp-copied'));
  _cpCopied = []; _cpCopyAnchor = null; _cpCopyRect = null;
  _removeMarchingAnts();
}
function _cpCopy() {
  if (_cpSelected.size === 0) return;
  _cpClearCopied();
  const ids = _cpGetVisibleMemberIds();
  const cells = [];
  _cpSelected.forEach(key => { const [m, d] = key.split('_').map(Number); cells.push({ memberId: m, day: d, shift: getMemberShift(m, d) || '' }); });
  _cpCopied = cells;
  const mIdxs = cells.map(c => ids.indexOf(c.memberId)).filter(i => i >= 0);
  const days = cells.map(c => c.day);
  const minMI = Math.min(...mIdxs), maxMI = Math.max(...mIdxs), minD = Math.min(...days), maxD = Math.max(...days);
  _cpCopyAnchor = { memberId: ids[minMI], day: minD };
  _cpCopyRect = { minMIdx: minMI, maxMIdx: maxMI, minD, maxD, rows: maxMI - minMI + 1, cols: maxD - minD + 1 };
  cells.forEach(c => { const el = document.querySelector(`.shift-cell[data-member-id="${c.memberId}"][data-day="${c.day}"]`); if (el) el.classList.add('cp-copied'); });
  _showMarchingAnts();
  showToast(`已复制 ${cells.length} 个格子`, 'info');
}
function _cpPaste() {
  if (_cpCopied.length === 0 || _cpSelected.size === 0 || !isAdmin()) return;
  const ids = _cpGetVisibleMemberIds();
  const selCells = Array.from(_cpSelected).map(k => { const [m, d] = k.split('_').map(Number); return { memberId: m, day: d, mIdx: ids.indexOf(m) }; });
  const pasteAnchorMIdx = Math.min(...selCells.map(c => c.mIdx));
  const pasteAnchorD = Math.min(...selCells.map(c => c.day));
  const daysInMonth = new Date(scheduleYear, scheduleMonth, 0).getDate();
  _undoPush({ year: scheduleYear, month: scheduleMonth, data: JSON.parse(JSON.stringify(SCHEDULE_DATA)), desc: `粘贴 ${_cpCopied.length} 格排班` });
  let cnt = 0;
  if (_cpCopyRect) {
    _cpCopied.forEach(c => {
      const srcMI = ids.indexOf(c.memberId);
      const rOff = srcMI - _cpCopyRect.minMIdx, cOff = c.day - _cpCopyRect.minD;
      const tMI = pasteAnchorMIdx + rOff, tD = pasteAnchorD + cOff;
      if (tMI >= 0 && tMI < ids.length && tD >= 1 && tD <= daysInMonth) {
        if (!SCHEDULE_DATA[ids[tMI]]) SCHEDULE_DATA[ids[tMI]] = {};
        SCHEDULE_DATA[ids[tMI]][tD] = c.shift;
        cnt++;
      }
    });
  }
  if (cnt > 0) {
    saveScheduleData(); markMonthAsImported(scheduleYear, scheduleMonth);
    addWorkLog('考勤系统', '排班粘贴', `粘贴 ${cnt} 格排班数据`);
    showToast(`已粘贴 ${cnt} 格`, 'success');
    renderSchedulePage(document.getElementById('contentArea'));
  }
}
function _cpDeleteSelected() {
  if (_cpSelected.size === 0 || !isAdmin()) return;
  _undoPush({ year: scheduleYear, month: scheduleMonth, data: JSON.parse(JSON.stringify(SCHEDULE_DATA)), desc: `删除 ${_cpSelected.size} 格排班` });
  _cpSelected.forEach(key => {
    const [m, d] = key.split('_').map(Number);
    if (SCHEDULE_DATA[m]) delete SCHEDULE_DATA[m][d];
  });
  saveScheduleData();
  addWorkLog('考勤系统', '排班删除', `删除 ${_cpSelected.size} 格排班`);
  showToast(`已清空 ${_cpSelected.size} 格`, 'success');
  _cpClearSelection();
  renderSchedulePage(document.getElementById('contentArea'));
}

// 蚂蚁线
function _showMarchingAnts() {
  _removeMarchingAnts();
  if (_cpCopied.length === 0) return;
  const cells = _cpCopied.map(c => document.querySelector(`.shift-cell[data-member-id="${c.memberId}"][data-day="${c.day}"]`)).filter(Boolean);
  if (cells.length === 0) return;
  const rects = cells.map(c => c.getBoundingClientRect());
  const minX = Math.min(...rects.map(r => r.left));
  const minY = Math.min(...rects.map(r => r.top));
  const maxX = Math.max(...rects.map(r => r.right));
  const maxY = Math.max(...rects.map(r => r.bottom));
  const el = document.createElement('div');
  el.className = 'cp-marching-ants';
  el.style.cssText = `left:${minX - 1}px;top:${minY - 1}px;width:${maxX - minX + 2}px;height:${maxY - minY + 2}px`;
  document.body.appendChild(el);
  _cpMarchingEl = el;
}
function _removeMarchingAnts() {
  if (_cpMarchingEl) { _cpMarchingEl.remove(); _cpMarchingEl = null; }
}

// 右键上下文菜单
function _showCpContextMenu(e, memberId, day) {
  _closeCpContextMenu();
  const hasCopied = _cpCopied.length > 0;
  const hasSelection = _cpSelected.size > 0;
  const menu = document.createElement('div');
  menu.className = 'cp-context-menu';
  menu.innerHTML = `
    <div class="cp-ctx-item${!hasSelection ? ' cp-ctx-disabled' : ''}" onclick="_cpCopy();_closeCpContextMenu()">
      <span class="cp-ctx-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/></svg></span>
      <span>复制</span><span class="cp-ctx-shortcut">Ctrl+C</span>
    </div>
    <div class="cp-ctx-item${!hasCopied ? ' cp-ctx-disabled' : ''}" onclick="_cpPaste();_closeCpContextMenu()">
      <span class="cp-ctx-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" stroke="currentColor" stroke-width="2"/><rect x="8" y="2" width="8" height="4" rx="1" stroke="currentColor" stroke-width="2"/></svg></span>
      <span>粘贴</span><span class="cp-ctx-shortcut">Ctrl+V</span>
    </div>
    <div class="cp-ctx-sep"></div>
    <div class="cp-ctx-item${!hasSelection ? ' cp-ctx-disabled' : ''}" onclick="_cpDeleteSelected();_closeCpContextMenu()">
      <span class="cp-ctx-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><polyline points="3,6 5,6 21,6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>
      <span>删除</span><span class="cp-ctx-shortcut">Delete</span>
    </div>
    <div class="cp-ctx-sep"></div>
    <div class="cp-ctx-item" onclick="showShiftDetailPopover(${memberId},${day},null);_closeCpContextMenu()">
      <span class="cp-ctx-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      <span>排班详情/调整</span>
    </div>
  `;
  document.body.appendChild(menu);
  _cpContextMenu = menu;
  // 定位
  let x = e.clientX, y = e.clientY;
  const mw = menu.offsetWidth || 160, mh = menu.offsetHeight || 200;
  if (x + mw > window.innerWidth - 8) x = window.innerWidth - mw - 8;
  if (y + mh > window.innerHeight - 8) y = window.innerHeight - mh - 8;
  menu.style.left = x + 'px'; menu.style.top = y + 'px';
  setTimeout(function() {
    document.addEventListener('click', _closeCpContextMenu, { once: true });
    document.addEventListener('contextmenu', _closeCpContextMenuOnCtx, { once: true });
  }, 0);
}
function _closeCpContextMenu() {
  if (_cpContextMenu) { _cpContextMenu.remove(); _cpContextMenu = null; }
}
function _closeCpContextMenuOnCtx(e) {
  _closeCpContextMenu();
}

// ===== opt1: 局部渲染引擎 =====
// 修改单格后，仅更新: (1)该shift-cell的样式/文本 (2)该列的班次人数统计 (3)该列的合计人数 (4)该成员的右侧统计列
function _updateCellLocal(memberId, day) {
  // r108: 检测活跃请假类型是否变化（新增/移除请假类型需全量重建以增减统计列）
  const _oldActive = new Set(_activeLeaveIds);
  _scanActiveLeaveTypes();
  if (_oldActive.size !== _activeLeaveIds.size || [..._activeLeaveIds].some(id => !_oldActive.has(id))) {
    renderSchedulePage(document.getElementById('contentArea')); return;
  }
  // (1) 更新该格子的 shift-cell
  const cell = document.querySelector(`.shift-cell[data-member-id="${memberId}"][data-day="${day}"]`);
  if (!cell) { renderSchedulePage(document.getElementById('contentArea')); return; } // fallback: 找不到格子则全量重建
  const newShift = getMemberShift(memberId, day);
  const info = getShiftDisplayInfo(newShift);
  const titleText = info.isLeave
    ? `${info.name}（${info.durationLabel || '全天'}）`
    : `${info.name}${info.start ? ' ' + info.start + '-' + (info.end <= info.start ? '次日' : '') + info.end : ''}`;
  // 移除旧的颜色 class（shift-xxx 和 leave-xxx 开头，覆盖班次↔请假互切场景）
  cell.className = cell.className.replace(/\b(shift-|leave-)\S+/g, '').trim();
  const tripleDates = (getOndutyOverride(scheduleYear, scheduleMonth).tripleDates || []);
  const isTriple = tripleDates.includes(scheduleMonth + '/' + day);
  cell.className = `shift-cell ${info.color}${isTriple && !info.isLeave && newShift !== _SHIFT_OFF ? ' shift-cell-triple' : ''}`;
  cell.title = titleText;
  cell.dataset.shift = newShift || '';
  cell.textContent = info.label;

  // (2) r60: 更新 tbody 中统计行（合计行 + 各班次行）
  const table = cell.closest('table');
  if (!table) return;
  const teamBlock = table.closest('.team-schedule-block');
  const teamName = teamBlock ? teamBlock.querySelector('.team-badge')?.textContent : null;
  // r81: 复用模块级 _getTeamMembers
  const members = teamName ? _getTeamMembers(teamName) : [];
  const shiftKeys = Object.keys(SHIFTS).filter(k => k !== _SHIFT_OFF);

  // 计算该天各班次人数
  const counts = {};
  shiftKeys.forEach(k => { counts[k] = 0; });
  let totalOnduty = 0;
  members.forEach(m => {
    const sv = getMemberShift(m.id, day);
    if (sv && SHIFTS[sv] && sv !== _SHIFT_OFF) { counts[sv] = (counts[sv] || 0) + 1; totalOnduty++; }
  });

  // 更新合计行（.schedule-stat-total-row）— r78: 零值显示 '-'
  const totalRow = table.querySelector('.schedule-stat-total-row');
  if (totalRow) {
    const totalTd = totalRow.children[day]; // children[0]=标签列, children[day]=第day天
    if (totalTd) {
      const numSpan = totalTd.querySelector('.schedule-stat-day-num');
      if (numSpan) {
        numSpan.textContent = totalOnduty === 0 ? '-' : totalOnduty;
        numSpan.classList.toggle('schedule-stat-zero', totalOnduty === 0);
        // r78: 更新 tooltip
        const ttParts = shiftKeys.filter(k => counts[k] > 0).map(k => (SHIFTS[k]?.label || k) + '班 ' + counts[k] + '人');
        totalTd.title = ttParts.length > 0 ? ttParts.join('\n') : '无在班人员';
      }
    }
  }

  // 更新各班次行（.schedule-stat-shift-row）— r78: 零值显示 '-'
  shiftKeys.forEach(k => {
    const shiftRow = table.querySelector(`.schedule-stat-shift-row[data-shift-key="${k}"]`);
    if (shiftRow) {
      const shiftTd = shiftRow.children[day];
      if (shiftTd) {
        const numSpan = shiftTd.querySelector('.schedule-stat-day-num');
        if (numSpan) {
          const cnt = counts[k] || 0;
          numSpan.textContent = cnt === 0 ? '-' : cnt;
          numSpan.classList.toggle('schedule-stat-zero', cnt === 0);
        }
      }
    }
  });

  // (4) 更新该成员的右侧统计列
  _updateMemberStatCells(memberId, table);

  // #13 实时刷新顶部卡片统计
  _refreshCardStats();
}

// 局部更新某成员的统计列数据（r78: 复用 _buildStatHeaders + _calcTeamStats 的单成员版）
function _updateMemberStatCells(memberId, table) {
  const daysInMonth = new Date(scheduleYear, scheduleMonth, 0).getDate();
  const shiftKeys = Object.keys(SHIFTS).filter(k => k !== _SHIFT_OFF);
  const leaveTypeIds = LEAVE_TYPES.map(lt => lt.id);
  // 单成员统计（局部刷新仍需独立计算，不值得全量重算）
  const stats = {};
  shiftKeys.forEach(k => { stats[k] = 0; });
  leaveTypeIds.forEach(id => { stats['leave_' + id] = 0; });
  stats.off = 0;
  let workDays = 0;
  let halfLeaveDays = 0; // r110: 半天假天数
  for (let d = 1; d <= daysInMonth; d++) {
    const sv = getMemberShift(memberId, d);
    if (!sv || sv === _SHIFT_OFF) { stats.off++; continue; }
    if (sv.startsWith('LEAVE:')) {
      const ltId = sv.replace('LEAVE:', '');
      const key = 'leave_' + ltId;
      const lt = LEAVE_TYPES.find(t => t.id === ltId);
      const dur = lt ? (lt.duration || 1) : 1;
      if (stats[key] !== undefined) stats[key] += dur;
      else stats['leave_other'] = (stats['leave_other'] || 0) + dur;
      if (dur < 1) halfLeaveDays++; // r110
    } else if (SHIFTS[sv]) {
      stats[sv] = (stats[sv] || 0) + 1;
      workDays++;
    }
  }
  // r110: 简化工时 — 每班统一8h + 半天假4h
  const _smartHours = workDays * 8 + halfLeaveDays * 4;
  stats._workHours = _smartHours;
  const totalWorkDays = shiftKeys.reduce((s, k) => s + (stats[k] || 0), 0);

  const memberRow = table.querySelector(`tr:has(.shift-cell[data-member-id="${memberId}"])`);
  if (!memberRow) return;
  const statTds = memberRow.querySelectorAll('.sch-stat-td');
  // r78: 使用模块级缓存的 statHeaders
  const { statHeaders } = _buildStatHeaders();
  // r95: tooltip 详情
  const _totalParts = shiftKeys.filter(k => (stats[k] || 0) > 0).map(k => `${SHIFTS[k]?.label || k}班 ${stats[k]}天`);
  const _totalTip = _totalParts.length > 0 ? `在班明细：\n${_totalParts.join('\n')}` : '无在班记录';
  const _leaveParts = LEAVE_TYPES.filter(lt => (stats['leave_' + lt.id] || 0) > 0).map(lt => `${lt.name} ${stats['leave_' + lt.id]}天`);
  const _leaveTip = _leaveParts.length > 0 ? `\n请假明细：\n${_leaveParts.join('\n')}` : '';

  statTds.forEach((td, i) => {
    if (i >= statHeaders.length) return;
    const h = statHeaders[i];
    const valSpan = td.querySelector('.sch-stat-val');
    if (!valSpan) return;
    // 清除旧条件着色
    td.classList.remove('sch-stat-warn');
    if (h.isTotal) {
      valSpan.textContent = totalWorkDays;
      td.title = `${_totalTip}${_leaveTip}`;
    } else if (h.isHours) {
      valSpan.textContent = _smartHours;
      const _stdHours = daysInMonth * 8 * 0.6;
      if (_smartHours < _stdHours && _smartHours > 0) td.classList.add('sch-stat-warn');
      td.title = `实际工时 ${_smartHours}h（${workDays}天）`;
    } else if (h.isOff) {
      valSpan.textContent = stats.off || 0;
      td.title = `本月休息 ${stats.off || 0} 天`;
    } else if (h.isLeave && h.mergedIds) {
      const val = h.mergedIds.reduce((s, id) => s + (stats['leave_' + id] || 0), 0);
      valSpan.textContent = val;
      valSpan.className = `sch-stat-val ${val === 0 ? 'sch-stat-zero' : ''}`;
      td.title = `${h.label} ${val}天`;
    } else {
      const val = stats[h.key] || 0;
      valSpan.textContent = val;
      valSpan.className = `sch-stat-val ${val === 0 ? 'sch-stat-zero' : ''}`;
      td.title = `${SHIFTS[h.key]?.name || h.label} ${val}天`;
    }
  });
}

// ===== opt2: 合并冲突检测——复用 detectScheduleAnomalies 的详细结果 =====
// detectScheduleAnomalies 返回的 anomaly 新增 _cells 字段（可选），方便此函数直接标记 DOM
// #9: 防抖 200ms，避免快速连续编辑时重复全量计算
let _conflictDebounceTimer = null;
function _refreshConflictBadges() {
  clearTimeout(_conflictDebounceTimer);
  _conflictDebounceTimer = setTimeout(_doRefreshConflictBadges, 200);
}
function _doRefreshConflictBadges() {
  // 先清除所有角标
  document.querySelectorAll('.sch-conflict-badge').forEach(el => el.remove());
  document.querySelectorAll('.sch-conflict-cell').forEach(el => el.classList.remove('sch-conflict-cell', 'sch-conflict-cell-warn', 'sch-conflict-cell-danger'));

  // 复用统一的异常检测（含 _cells 元数据）
  const anomalies = detectScheduleAnomalies();
  anomalies.forEach(a => {
    if (!a._cells || a._cells.length === 0) return;
    const cssLevel = a.level === 'danger' ? 'sch-conflict-cell-danger' : 'sch-conflict-cell-warn';
    a._cells.forEach(c => {
      const cell = document.querySelector(`.shift-cell[data-member-id="${c.memberId}"][data-day="${c.day}"]`);
      if (!cell) return;
      cell.classList.add('sch-conflict-cell', cssLevel);
      if (cssLevel === 'sch-conflict-cell-warn' && !cell.querySelector('.sch-conflict-badge')) {
        const badge = document.createElement('span');
        badge.className = 'sch-conflict-badge';
        badge.title = a.text;
        badge.textContent = '!';
        cell.appendChild(badge);
      }
    });
  });

  // #1: 更新各团队表头冲突计数徽章
  _updateConflictSummaryBadges(anomalies);
}

// #1: 各团队表头冲突计数徽章
function _updateConflictSummaryBadges(anomalies) {
  document.querySelectorAll('.team-schedule-block').forEach(block => {
    const teamEl = block.querySelector('.team-badge');
    if (!teamEl) return;
    const team = teamEl.textContent.trim();
    // 统计该团队的冲突数（按天去重）
    const conflictDays = new Set();
    // 支持自定义日历卡片：按 memberIds 匹配
    const _calCust = CUSTOM_CALENDARS.find(c => c.name === team);
    const _calMemberIds = _calCust ? _calCust.memberIds : null;
    anomalies.forEach(a => {
      if (!a._cells) return;
      a._cells.forEach(c => {
        const member = MEMBERS_DATA.find(m => m.id === c.memberId);
        if (!member) return;
        const matched = _calMemberIds ? _calMemberIds.includes(member.id) : (member.team === team);
        if (matched) conflictDays.add(c.day);
      });
    });
    // 移除旧徽章
    const old = block.querySelector('.sch-conflict-summary-badge');
    if (old) old.remove();
    if (conflictDays.size === 0) return;
    // 插入新徽章（紧跟团队名后）
    const badge = document.createElement('span');
    badge.className = 'sch-conflict-summary-badge';
    badge.title = `点击查看 ${conflictDays.size} 处排班冲突详情`;
    badge.textContent = `⚠ ${conflictDays.size}`;
    badge.onclick = (e) => { e.stopPropagation(); _showConflictDetail(team, anomalies); };
    const header = block.querySelector('.team-schedule-title');
    if (header) header.appendChild(badge);
  });
}

// #1: 冲突详情弹窗
function _showConflictDetail(team, anomalies) {
  // 支持自定义日历卡片
  const _calCust2 = CUSTOM_CALENDARS.find(c => c.name === team);
  const _calMemberIds2 = _calCust2 ? _calCust2.memberIds : null;
  const teamAnomalies = anomalies.filter(a => {
    if (!a._cells || a._cells.length === 0) return false;
    return a._cells.some(c => {
      const m = MEMBERS_DATA.find(x => x.id === c.memberId);
      if (!m) return false;
      return _calMemberIds2 ? _calMemberIds2.includes(m.id) : (m.team === team);
    });
  });
  if (teamAnomalies.length === 0) return;
  const listHtml = teamAnomalies.map(a => `
    <div class="sch-conflict-detail-item sch-conflict-detail-${a.level}">
      <span class="sch-conflict-detail-icon">${a.level === 'danger' ? '🔴' : '🟡'}</span>
      <span class="sch-conflict-detail-text">${a.text}</span>
    </div>
  `).join('');
  openModal(`${team} — 排班冲突详情`,
    `<div class="sch-conflict-detail-list">${listHtml}</div>`,
    `<button class="btn btn-default" onclick="closeModal()">关闭</button>`,
    480
  );
}

function detectScheduleAnomalies() {
  const anomalies = [];
  // r81: 使用月历缓存
  const cal = _ensureMonthCalendar(scheduleYear, scheduleMonth);
  const daysInMonth = cal.daysInMonth;

  // 读取自定义规则（通过统一存储层）
  const savedRules = (function() {
    try { return typeof _storageGetRaw === 'function' ? JSON.parse(_storageGetRaw('glxt_schedule_rules') || 'null') : SCHEDULE_RULES; } catch(e) { return null; }
  })();
  const globalMinOnduty     = (savedRules && savedRules.minOndutyPerDay != null)    ? savedRules.minOndutyPerDay    : 5;
  const maxConsecutiveLimit = (savedRules && savedRules.maxConsecutiveDays != null) ? savedRules.maxConsecutiveDays : 6;
  const globalWeekendExempt = savedRules && savedRules.weekendExempt !== undefined ? savedRules.weekendExempt : true;

  // r81: 使用缓存判断周末，不再创建 Date 对象
  function isWeekend(day) {
    return cal.days[day - 1].isWeekend;
  }

  // 获取某团队的规则配置
  function getTeamRule(team) {
    return (savedRules && savedRules.teamRules && savedRules.teamRules[team]) || {};
  }

  // 某团队某天是否豁免（双休豁免开启 且 当天是周末）
  function isTeamWeekendExempt(team, day) {
    if (!isWeekend(day)) return false;
    const tr = getTeamRule(team);
    return tr.weekendExempt !== undefined ? tr.weekendExempt : globalWeekendExempt;
  }

  // ① 连续排班检测（不受双休豁免影响，连续排班本身就是问题）
  // opt2: 额外收集 _cells 元数据供 _refreshConflictBadges 使用
  MEMBERS_DATA.forEach(function(m) {
    if (m.role === 'leader') return;
    let consecutive = 0, maxConsec = 0, runStart = -1;
    const conflictDays = new Set();
    for (let d = 1; d <= daysInMonth; d++) {
      const shift = getMemberShift(m.id, d);
      if (shift !== _SHIFT_OFF && !isLeaveShift(shift)) {
        if (consecutive === 0) runStart = d;
        consecutive++;
        maxConsec = Math.max(maxConsec, consecutive);
        if (consecutive > maxConsecutiveLimit) {
          for (let x = runStart; x <= d; x++) conflictDays.add(x);
        }
      } else {
        consecutive = 0; runStart = -1;
      }
    }
    if (maxConsec > maxConsecutiveLimit) {
      const cells = [];
      conflictDays.forEach(function(d) { cells.push({ memberId: m.id, day: d }); });
      anomalies.push({ level: 'warning', text: `${m.name} 连续排班最长 ${maxConsec} 天，超过上限 ${maxConsecutiveLimit} 天`, _cells: cells });
    }
  });

  // r81: _getTeamMembers 已提升至模块级

  // 所有需要做规则检测的团队名列表（内置 + 自定义日历卡片，排除 builtinTeam 覆盖项和已隐藏团队）
  const _hiddenDetect = CUSTOM_CALENDARS.filter(function(c) { return c.builtinTeam && c.hidden; }).map(function(c) { return c.builtinTeam; });
  const _allDetectTeams = [...TEAMS.filter(function(t) { return !_hiddenDetect.includes(t); }), ...CUSTOM_CALENDARS.filter(function(c) { return !c.builtinTeam; }).map(function(c) { return c.name; })];

  // ② 各团队每日在班人数检测（支持双休豁免）
  _allDetectTeams.forEach(function(team) {
    const teamRule = getTeamRule(team);
    const minOnduty = teamRule.minOndutyPerDay !== undefined ? teamRule.minOndutyPerDay : globalMinOnduty;
    if (minOnduty <= 0) return; // 0 表示不限制
    const members = _getTeamMembers(team);
    for (let d = 1; d <= daysInMonth; d++) {
      // 双休豁免：跳过检测
      if (isTeamWeekendExempt(team, d)) continue;
      const onduty = members.filter(function(m) {
        const s = getMemberShift(m.id, d);
        return s && s !== _SHIFT_OFF && !isLeaveShift(s) && SHIFTS[s];
      }).length;
      if (onduty < minOnduty) {
        const teamShort = team.replace(/团队$/, '');
        // r96: 不再给班次格子加红框（已由统计行红色数字替代），去掉 _cells
        anomalies.push({ level: 'danger', text: `${scheduleMonth}月${d}日 ${teamShort}团队在班 ${onduty} 人，低于要求 ${minOnduty} 人` });
      }
    }
  });

  // ③ 各班次最少人数检测（支持团队级别配置 + 双休豁免）
  const shiftKeys = Object.keys(SHIFTS).filter(function(k) { return k !== _SHIFT_OFF; });
  for (let d = 1; d <= daysInMonth; d++) {
    _allDetectTeams.forEach(function(team) {
      // 双休豁免：跳过检测
      if (isTeamWeekendExempt(team, d)) return;
      const teamRule = getTeamRule(team);
      const teamShiftMin = teamRule.shiftMin || {};
      const members = _getTeamMembers(team);
      shiftKeys.forEach(function(k) {
        const minVal = teamShiftMin[k] !== undefined ? teamShiftMin[k]
          : (savedRules && savedRules.shiftMin && savedRules.shiftMin[k] !== undefined ? savedRules.shiftMin[k] : 0);
        if (minVal <= 0) return;
        const cnt = members.filter(function(m) { return getMemberShift(m.id, d) === k; }).length;
        if (cnt < minVal) {
          const shiftName = SHIFTS[k] ? SHIFTS[k].name : k;
          const teamShort = team.replace(/团队$/, '');
          anomalies.push({ level: 'warning', text: `${scheduleMonth}月${d}日 ${teamShort}团队 ${shiftName} 仅 ${cnt} 人，低于要求 ${minVal} 人` });
        }
      });
    });
  }

  // ④ 月总在班天数检测（读取 minTotalPerMonth）
  _allDetectTeams.forEach(function(team) {
    const teamRule = getTeamRule(team);
    if (!teamRule.minTotalPerMonth) return;
    const minTotal = teamRule.minTotalPerMonth;
    const members = _getTeamMembers(team);
    members.forEach(function(m) {
      let totalDays = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const s = getMemberShift(m.id, d);
        if (s && s !== _SHIFT_OFF && !isLeaveShift(s) && SHIFTS[s]) totalDays++;
      }
      if (totalDays < minTotal) {
        anomalies.push({ level: 'warning', text: `${m.name} 本月在班 ${totalDays} 天，低于团队要求 ${minTotal} 天` });
      }
    });
  });

  // 按优先级排序：danger 排前，warning 排后，同级保持原顺序
  anomalies.sort(function(a, b) {
    const order = { danger: 0, warning: 1 };
    return (order[a.level] || 1) - (order[b.level] || 1);
  });

  return anomalies;
}

// ============================================================
// 日历管理（自定义排班日历卡片）
// ============================================================

// 获取所有日历卡片（内置团队 + 自定义），排除已隐藏的内置团队
function _getAllCalendarCards() {
  const hiddenTeams = CUSTOM_CALENDARS.filter(c => c.builtinTeam && c.hidden).map(c => c.builtinTeam);
  const builtinCards = TEAMS.filter(team => !hiddenTeams.includes(team)).map(team => {
    // 检查是否有管理员覆盖设置
    const override = CUSTOM_CALENDARS.find(c => c.builtinTeam === team && !c.hidden);
    return {
      id: '__team__' + team,
      name: team,
      memberIds: override ? override.memberIds : MEMBERS_DATA.filter(m => m.team === team && !m.excludeFromSchedule).map(m => m.id),
      shiftKeys: override ? override.shiftKeys : Object.keys(SHIFTS),
      leaveTypeIds: override ? override.leaveTypeIds : LEAVE_TYPES.map(lt => lt.id),
      isBuiltin: true,
    };
  });
  // 排除内置覆盖项（builtinTeam 字段），只保留纯自定义卡片
  const customCards = CUSTOM_CALENDARS.filter(c => !c.builtinTeam).map(c => ({ ...c, isBuiltin: false }));
  return builtinCards.concat(customCards);
}

// 获取已隐藏的内置团队名列表
function _getHiddenBuiltinTeams() {
  return CUSTOM_CALENDARS.filter(c => c.builtinTeam && c.hidden).map(c => c.builtinTeam);
}

function showCalendarManage() {
  const allCards = _getAllCalendarCards();
  const hiddenTeams = _getHiddenBuiltinTeams();
  const totalCount = allCards.length;

  // 已隐藏团队恢复区
  const hiddenHtml = hiddenTeams.length > 0 ? `
    <div style="margin-top:12px;padding:10px 14px;background:#FFF7E6;border:1px solid #FFE0B2;border-radius:8px">
      <div style="font-size:12px;color:#FA8C16;font-weight:600;margin-bottom:6px">已删除的团队（${hiddenTeams.length}个）</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${hiddenTeams.map(t => `<button onclick="restoreBuiltinCalendar('${t}')" style="font-size:11px;color:#FA8C16;background:#fff;border:1px solid #FFD591;border-radius:6px;padding:3px 10px;cursor:pointer;line-height:1.5">↩ 恢复「${t}」</button>`).join('')}
      </div>
    </div>` : '';

  const content = `
    <div class="cal-mgmt-wrap">
      <div class="cal-mgmt-header">
        <div class="cal-mgmt-summary">
          <span class="cal-mgmt-summary-num">${totalCount}</span>
          <span class="cal-mgmt-summary-label">个排班日历</span>
        </div>
        <button class="btn btn-primary btn-sm" onclick="showCreateCalendarForm()" style="border-radius:10px;padding:6px 16px;font-size:12.5px">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="vertical-align:-2px;margin-right:4px"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
          新建日历
        </button>
      </div>
      <div class="cal-mgmt-grid" id="calMgmtGrid">
        ${allCards.map(card => _renderCalendarCard(card)).join('')}
      </div>
      ${hiddenHtml}
    </div>
  `;
  openModal('日历管理', content, `<button class="btn btn-default" onclick="closeModal()">关闭</button>`, 680);
  // 注册关闭钩子：弹窗关闭时刷新排班日历，使新建/编辑/删除的日历卡片立即显示
  // 避免重复注册（showCalendarManage 可能在弹窗内多次调用）
  if (!_modalCloseHooks.some(fn => fn._calMgmtRefresh)) {
    const _refreshFn = () => {
      const area = document.getElementById('contentArea');
      if (area) renderSchedulePage(area);
    };
    _refreshFn._calMgmtRefresh = true;
    _modalCloseHooks.push(_refreshFn);
  }
}

function _renderCalendarCard(card) {
  const memberCount = card.memberIds ? card.memberIds.length : 0;
  const shiftCount = card.shiftKeys ? card.shiftKeys.filter(k => k !== _SHIFT_OFF).length : 0;
  const leaveCount = card.leaveTypeIds ? card.leaveTypeIds.length : 0;
  const iconBg = card.isBuiltin ? 'rgba(51,112,255,0.08)' : 'rgba(0,180,42,0.08)';
  const iconColor = card.isBuiltin ? '#3370FF' : '#00B42A';
  const editFn = card.isBuiltin ? `showEditBuiltinCalendarForm('${card.id}')` : `showEditCalendarForm('${card.id}')`;
  const delFn = card.isBuiltin ? `deleteBuiltinCalendar('${card.id}')` : `deleteCalendarCard('${card.id}')`;

  return `
    <div class="cal-card" data-cal-id="${card.id}">
      <div class="cal-card-top">
        <div class="cal-card-icon" style="background:${iconBg};color:${iconColor}">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2"/><path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </div>
        <div class="cal-card-info">
          <div class="cal-card-name">${card.name}</div>
          <div class="cal-card-meta">
            <span title="成员数">${memberCount} 人</span>
            <span class="cal-card-meta-dot">·</span>
            <span title="班次数">${shiftCount} 个班次</span>
            <span class="cal-card-meta-dot">·</span>
            <span title="请假类型">${leaveCount} 种假</span>
          </div>
        </div>
      </div>
      <div class="cal-card-bottom">
        <button class="cal-card-edit-btn" onclick="${editFn}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style="vertical-align:-1.5px;margin-right:3px"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          编辑
        </button>
        <button class="cal-card-del-btn" onclick="${delFn}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style="vertical-align:-1.5px;margin-right:3px"><polyline points="3,6 5,6 21,6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          删除
        </button>
      </div>
    </div>`;
}

// ===== 按权限分层获取可选成员（admin 全部，leader 管辖团队，reviewer 本团队）=====
function _getSelectableMembers() {
  const all = MEMBERS_DATA.filter(m => !m.excludeFromSchedule);
  const role = CURRENT_USER.role || 'reviewer';
  if (role === 'admin') return all;
  if (role === 'leader') {
    const managed = CURRENT_USER.managedTeams || [];
    if (managed.length === 0) return all; // 未配置管辖范围则显示全部
    return all.filter(m => managed.includes(m.team));
  }
  // reviewer: 只能看到自己所在团队
  const myTeam = CURRENT_USER.team || '';
  return all.filter(m => m.team === myTeam);
}

// ===== 按 team 字段动态分组渲染成员选择区（不再硬编码 TEAMS）=====
function _renderMemberSelectGrid(selectableMembers, checkedIds) {
  const checkedSet = new Set(checkedIds || []);
  // 按 team 字段动态分组，保持出现顺序
  const teamOrder = [];
  const teamMap = {};
  selectableMembers.forEach(m => {
    const t = m.team || '未分组';
    if (!teamMap[t]) { teamMap[t] = []; teamOrder.push(t); }
    teamMap[t].push(m);
  });
  return teamOrder.map(team => {
    const members = teamMap[team];
    const allChecked = members.every(m => checkedSet.has(m.id));
    return `
      <div class="cal-form-team-block">
        <div class="cal-form-team-title">
          <label style="cursor:pointer;display:flex;align-items:center;gap:4px">
            <input type="checkbox" class="cal-form-team-all" data-team="${team}" onchange="_toggleCalTeam(this,'${team}')" ${allChecked ? 'checked' : ''}>
            ${team} <span style="font-size:11px;color:var(--text-tertiary)">(${members.length})</span>
          </label>
        </div>
        <div class="cal-form-team-members">
          ${members.map(m => `
            <label class="cal-form-member-item" data-name="${m.name}" data-team="${team}">
              <input type="checkbox" name="calMembers" value="${m.id}" class="cal-member-chk" data-team="${team}" ${checkedSet.has(m.id) ? 'checked' : ''}>
              <span>${m.name}</span>
            </label>
          `).join('')}
        </div>
      </div>`;
  }).join('');
}

// ===== 通用日历表单渲染（新建/编辑共用）=====
function _renderCalendarForm(opts) {
  // opts: { name, checkedMemberIds, checkedShiftKeys, checkedLeaveIds, isEdit, disableName }
  const selectableMembers = _getSelectableMembers();
  const shiftEntries = Object.entries(SHIFTS).filter(([k]) => k !== _SHIFT_OFF);
  const shiftSet = new Set(opts.checkedShiftKeys || shiftEntries.map(([k]) => k));
  const leaveSet = new Set(opts.checkedLeaveIds || LEAVE_TYPES.map(lt => lt.id));
  const memberCount = (opts.checkedMemberIds || []).length;

  return `
    <div class="cal-form-wrap">
      <div class="form-group">
        <label class="form-label required">日历名称</label>
        <input type="text" class="form-control" id="calFormName" value="${opts.name || ''}" placeholder="如：周末加班组、临时项目组" maxlength="20" ${opts.disableName ? 'disabled style="background:#F5F7FA;color:#86909C;cursor:not-allowed"' : ''}>
        ${opts.disableName ? '<div style="font-size:11px;color:#86909C;margin-top:4px">内置团队名称不可修改</div>' : ''}
      </div>

      <div class="form-group">
        <label class="form-label required">选择成员 <span style="font-size:11px;color:var(--text-tertiary);font-weight:400">（${CURRENT_USER.role === 'admin' ? '全部成员' : CURRENT_USER.role === 'leader' ? '管辖团队成员' : '本团队成员'}）</span></label>
        <div class="cal-form-member-search">
          <input type="text" class="form-control" id="calMemberSearch" placeholder="搜索人员姓名..." oninput="_filterCalMembers(this.value)" autocomplete="off" style="margin-bottom:8px">
        </div>
        <div class="cal-form-member-grid" id="calMemberGrid">
          ${_renderMemberSelectGrid(selectableMembers, opts.checkedMemberIds)}
        </div>
        <div class="cal-form-selected-count" id="calSelectedCount">已选 ${memberCount} 人</div>
      </div>

      <div class="form-group">
        <label class="form-label required">班次类型 <span style="font-size:11px;color:var(--text-tertiary);font-weight:400">（选择可用班次）</span></label>
        <div class="cal-form-shift-grid">
          ${shiftEntries.map(([k, v]) => `
            <label class="cal-form-shift-item">
              <input type="checkbox" name="calShifts" value="${k}" ${shiftSet.has(k) ? 'checked' : ''}>
              <span class="shift-cell ${v.color}" style="width:28px;height:28px;border-radius:8px;font-size:12px;font-weight:800">${v.label}</span>
              <span class="cal-form-shift-name">${v.name}</span>
            </label>
          `).join('')}
        </div>
      </div>

      <div class="form-group">
        <label class="form-label required">请假类型 <span style="font-size:11px;color:var(--text-tertiary);font-weight:400">（选择可用假期）</span></label>
        <div class="cal-form-leave-grid">
          ${LEAVE_TYPES.map(lt => `
            <label class="cal-form-leave-item">
              <input type="checkbox" name="calLeaves" value="${lt.id}" ${leaveSet.has(lt.id) ? 'checked' : ''}>
              <span>${lt.name}</span>
              <span style="font-size:10px;color:var(--text-tertiary)">${lt.duration === 0.5 ? '半天' : '全天'}</span>
            </label>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

function showCreateCalendarForm() {
  const content = _renderCalendarForm({
    name: '',
    checkedMemberIds: [],
    checkedShiftKeys: null, // null = 全选
    checkedLeaveIds: null,  // null = 全选
    isEdit: false,
    disableName: false
  });

  openModal('新建排班日历', content, `
    <button class="btn btn-default" onclick="showCalendarManage()">返回</button>
    <button class="btn btn-primary" onclick="saveNewCalendar()">确认创建</button>
  `, 640);

  // 绑定成员勾选计数
  setTimeout(() => {
    document.querySelectorAll('.cal-member-chk').forEach(chk => {
      chk.addEventListener('change', _updateCalMemberCount);
    });
  }, 50);
}

function showEditCalendarForm(calId) {
  const cal = CUSTOM_CALENDARS.find(c => c.id === calId);
  if (!cal) { showToast('日历不存在', 'warning'); return; }

  const content = _renderCalendarForm({
    name: cal.name || '',
    checkedMemberIds: cal.memberIds || [],
    checkedShiftKeys: cal.shiftKeys || [],
    checkedLeaveIds: cal.leaveTypeIds || [],
    isEdit: true,
    disableName: false
  });

  openModal('编辑排班日历 - ' + cal.name, content, `
    <button class="btn btn-default" onclick="showCalendarManage()">返回</button>
    <button class="btn btn-primary" onclick="saveEditCalendar('${calId}')">保存修改</button>
  `, 640);

  setTimeout(() => {
    document.querySelectorAll('.cal-member-chk').forEach(chk => {
      chk.addEventListener('change', _updateCalMemberCount);
    });
  }, 50);
}

// ===== 内置日历卡片编辑（管理员可调整成员/班次/请假类型）=====
function showEditBuiltinCalendarForm(builtinId) {
  // builtinId 格式: '__team__高曝团队'
  const teamName = builtinId.replace('__team__', '');
  if (!TEAMS.includes(teamName)) { showToast('团队不存在', 'warning'); return; }

  // 读取已存储的覆盖设置（如果有）
  const override = CUSTOM_CALENDARS.find(c => c.builtinTeam === teamName);
  const allMembers = MEMBERS_DATA.filter(m => !m.excludeFromSchedule);
  // 默认成员：该团队所有人
  const defaultMemberIds = allMembers.filter(m => m.team === teamName).map(m => m.id);
  const memberIds = override ? override.memberIds : defaultMemberIds;
  const shiftKeys = override ? override.shiftKeys : Object.keys(SHIFTS);
  const leaveIds = override ? override.leaveTypeIds : LEAVE_TYPES.map(lt => lt.id);

  const content = _renderCalendarForm({
    name: teamName,
    checkedMemberIds: memberIds,
    checkedShiftKeys: shiftKeys,
    checkedLeaveIds: leaveIds,
    isEdit: true,
    disableName: true
  });

  openModal('编辑内置日历 — ' + teamName, content, `
    <button class="btn btn-default" onclick="showCalendarManage()">返回</button>
    ${override ? '<button class="btn btn-default" style="color:#F53F3F;border-color:#FFCCC7" onclick="resetBuiltinCalendar(\'' + teamName + '\')">恢复默认</button>' : ''}
    <button class="btn btn-primary" onclick="saveEditBuiltinCalendar('${teamName}')">保存修改</button>
  `, 640);

  setTimeout(() => {
    document.querySelectorAll('.cal-member-chk').forEach(chk => {
      chk.addEventListener('change', _updateCalMemberCount);
    });
  }, 50);
}

function saveEditBuiltinCalendar(teamName) {
  const memberIds = Array.from(document.querySelectorAll('.cal-member-chk:checked')).map(chk => Number(chk.value));
  if (memberIds.length === 0) { showToast('请至少选择一名成员', 'warning'); return; }

  const shiftKeys = Array.from(document.querySelectorAll('input[name="calShifts"]:checked')).map(chk => chk.value);
  if (shiftKeys.length === 0) { showToast('请至少选择一个班次', 'warning'); return; }
  if (!shiftKeys.includes(_SHIFT_OFF)) shiftKeys.push(_SHIFT_OFF);

  const leaveTypeIds = Array.from(document.querySelectorAll('input[name="calLeaves"]:checked')).map(chk => chk.value);

  // 查找已有覆盖
  const existIdx = CUSTOM_CALENDARS.findIndex(c => c.builtinTeam === teamName);
  const calObj = {
    id: existIdx >= 0 ? CUSTOM_CALENDARS[existIdx].id : ('builtin_' + teamName),
    name: teamName,
    builtinTeam: teamName,
    memberIds: memberIds,
    shiftKeys: shiftKeys,
    leaveTypeIds: leaveTypeIds,
    updatedAt: new Date().toISOString(),
  };
  if (existIdx >= 0) {
    CUSTOM_CALENDARS[existIdx] = calObj;
  } else {
    CUSTOM_CALENDARS.push(calObj);
  }
  saveCustomCalendars(true);
  addWorkLog('考勤系统', '内置日历修改', `编辑内置日历「${teamName}」，${memberIds.length} 人`);
  closeModal();
  showToast(`内置日历「${teamName}」已更新`, 'success');
  const area = document.getElementById('contentArea');
  if (area) renderSchedulePage(area);
}

function resetBuiltinCalendar(teamName) {
  const idx = CUSTOM_CALENDARS.findIndex(c => c.builtinTeam === teamName);
  if (idx >= 0) {
    CUSTOM_CALENDARS.splice(idx, 1);
    saveCustomCalendars(true);
    addWorkLog('考勤系统', '内置日历重置', `恢复内置日历「${teamName}」为默认设置`);
    showToast(`「${teamName}」已恢复默认`, 'success');
  }
  showCalendarManage();
}

// 删除内置日历（标记为隐藏，可恢复）
function deleteBuiltinCalendar(builtinId) {
  const teamName = builtinId.replace('__team__', '');
  if (!TEAMS.includes(teamName)) { showToast('团队不存在', 'warning'); return; }

  const confirmContent = `
    <div style="text-align:center;padding:12px 0">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style="margin-bottom:12px">
        <circle cx="12" cy="12" r="10" stroke="#F53F3F" stroke-width="2"/>
        <path d="M12 8v4M12 16h.01" stroke="#F53F3F" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <div style="font-size:14px;color:var(--text-primary);margin-bottom:6px">确定删除排班日历「<strong>${teamName}</strong>」？</div>
      <div style="font-size:12px;color:var(--text-tertiary)">删除后日历将从排班页面中隐藏，可在日历管理中恢复</div>
    </div>
  `;
  openModal('删除确认', confirmContent, `
    <button class="btn btn-default" onclick="showCalendarManage()">取消</button>
    <button class="btn btn-danger" onclick="_doDeleteBuiltinCalendar('${teamName}')">确认删除</button>
  `);
}

function _doDeleteBuiltinCalendar(teamName) {
  const existIdx = CUSTOM_CALENDARS.findIndex(c => c.builtinTeam === teamName);
  if (existIdx >= 0) {
    CUSTOM_CALENDARS[existIdx].hidden = true;
  } else {
    CUSTOM_CALENDARS.push({
      id: 'builtin_' + teamName,
      name: teamName,
      builtinTeam: teamName,
      hidden: true,
      updatedAt: new Date().toISOString(),
    });
  }
  saveCustomCalendars(true);
  addWorkLog('考勤系统', '日历删除', `隐藏内置日历「${teamName}」`);
  closeModal();
  showToast(`排班日历「${teamName}」已删除`, 'success');
  const area = document.getElementById('contentArea');
  if (area) renderSchedulePage(area);
}

// 恢复已隐藏的内置日历
function restoreBuiltinCalendar(teamName) {
  const idx = CUSTOM_CALENDARS.findIndex(c => c.builtinTeam === teamName && c.hidden);
  if (idx >= 0) {
    CUSTOM_CALENDARS.splice(idx, 1);
    saveCustomCalendars(true);
    addWorkLog('考勤系统', '日历恢复', `恢复内置日历「${teamName}」`);
    showToast(`「${teamName}」已恢复`, 'success');
  }
  showCalendarManage();
}

function _filterCalMembers(keyword) {
  const kw = keyword.trim().toLowerCase();
  document.querySelectorAll('.cal-form-member-item').forEach(el => {
    const name = (el.dataset.name || '').toLowerCase();
    el.style.display = !kw || name.includes(kw) ? '' : 'none';
  });
}

function _toggleCalTeam(allChk, team) {
  const checked = allChk.checked;
  document.querySelectorAll(`.cal-member-chk[data-team="${team}"]`).forEach(chk => {
    chk.checked = checked;
  });
  _updateCalMemberCount();
}

function _updateCalMemberCount() {
  const count = document.querySelectorAll('.cal-member-chk:checked').length;
  const el = document.getElementById('calSelectedCount');
  if (el) el.textContent = `已选 ${count} 人`;
}

function saveNewCalendar() {
  const name = document.getElementById('calFormName')?.value?.trim();
  if (!name) { showToast('请填写日历名称', 'warning'); return; }

  // 检查名称是否与内置团队或已有自定义日历重复
  if (TEAMS.includes(name) || CUSTOM_CALENDARS.some(c => c.name === name)) {
    showToast('该名称已被使用，请换一个', 'warning');
    return;
  }

  const memberIds = Array.from(document.querySelectorAll('.cal-member-chk:checked')).map(chk => Number(chk.value));
  if (memberIds.length === 0) { showToast('请至少选择一名成员', 'warning'); return; }

  const shiftKeys = Array.from(document.querySelectorAll('input[name="calShifts"]:checked')).map(chk => chk.value);
  if (shiftKeys.length === 0) { showToast('请至少选择一个班次', 'warning'); return; }
  // 始终包含 OFF
  if (!shiftKeys.includes(_SHIFT_OFF)) shiftKeys.push(_SHIFT_OFF);

  const leaveTypeIds = Array.from(document.querySelectorAll('input[name="calLeaves"]:checked')).map(chk => chk.value);

  const calId = 'cal_' + Date.now();
  CUSTOM_CALENDARS.push({
    id: calId,
    name: name,
    memberIds: memberIds,
    shiftKeys: shiftKeys,
    leaveTypeIds: leaveTypeIds,
    createdAt: new Date().toISOString(),
  });
  // 使用同步写入确保数据持久化，防止刷新后丢失
  saveCustomCalendars(true);
  addWorkLog('考勤系统', '日历新建', `新建排班日历「${name}」，${memberIds.length} 人`);
  // 关闭弹窗并显示成功提示，让用户清楚看到反馈
  closeModal();
  showToast(`排班日历「${name}」创建成功！`, 'success');
  // 刷新排班页面以显示新日历卡片
  const area = document.getElementById('contentArea');
  if (area) renderSchedulePage(area);
}

function saveEditCalendar(calId) {
  const cal = CUSTOM_CALENDARS.find(c => c.id === calId);
  if (!cal) { showToast('日历不存在', 'warning'); return; }

  const name = document.getElementById('calFormName')?.value?.trim();
  if (!name) { showToast('请填写日历名称', 'warning'); return; }

  // 检查名称是否与其他日历重复（排除自身）
  if (TEAMS.includes(name) || CUSTOM_CALENDARS.some(c => c.id !== calId && c.name === name)) {
    showToast('该名称已被使用，请换一个', 'warning');
    return;
  }

  const memberIds = Array.from(document.querySelectorAll('.cal-member-chk:checked')).map(chk => Number(chk.value));
  if (memberIds.length === 0) { showToast('请至少选择一名成员', 'warning'); return; }

  const shiftKeys = Array.from(document.querySelectorAll('input[name="calShifts"]:checked')).map(chk => chk.value);
  if (shiftKeys.length === 0) { showToast('请至少选择一个班次', 'warning'); return; }
  if (!shiftKeys.includes(_SHIFT_OFF)) shiftKeys.push(_SHIFT_OFF);

  const leaveTypeIds = Array.from(document.querySelectorAll('input[name="calLeaves"]:checked')).map(chk => chk.value);

  cal.name = name;
  cal.memberIds = memberIds;
  cal.shiftKeys = shiftKeys;
  cal.leaveTypeIds = leaveTypeIds;
  cal.updatedAt = new Date().toISOString();
  saveCustomCalendars(true);
  addWorkLog('考勤系统', '日历修改', `修改排班日历「${name}」，${memberIds.length} 人`);
  closeModal();
  showToast(`排班日历「${name}」已更新`, 'success');
  const area = document.getElementById('contentArea');
  if (area) renderSchedulePage(area);
}

function deleteCalendarCard(calId) {
  const cal = CUSTOM_CALENDARS.find(c => c.id === calId);
  if (!cal) { showToast('日历不存在', 'warning'); return; }

  const confirmContent = `
    <div style="text-align:center;padding:12px 0">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style="margin-bottom:12px">
        <circle cx="12" cy="12" r="10" stroke="#F53F3F" stroke-width="2"/>
        <path d="M12 8v4M12 16h.01" stroke="#F53F3F" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <div style="font-size:14px;color:var(--text-primary);margin-bottom:6px">确定删除排班日历「<strong>${cal.name}</strong>」？</div>
      <div style="font-size:12px;color:var(--text-tertiary)">删除后日历将从列表中移除，但已有排班数据不会丢失</div>
    </div>
  `;

  openModal('删除确认', confirmContent, `
    <button class="btn btn-default" onclick="showCalendarManage()">取消</button>
    <button class="btn btn-danger" onclick="_doDeleteCalendar('${calId}')">确认删除</button>
  `);
}

function _doDeleteCalendar(calId) {
  const idx = CUSTOM_CALENDARS.findIndex(c => c.id === calId);
  if (idx === -1) return;
  const name = CUSTOM_CALENDARS[idx].name;
  CUSTOM_CALENDARS.splice(idx, 1);
  saveCustomCalendars(true);
  addWorkLog('考勤系统', '日历删除', `删除排班日历「${name}」`);
  closeModal();
  showToast(`排班日历「${name}」已删除`, 'success');
  const area = document.getElementById('contentArea');
  if (area) renderSchedulePage(area);
}

// 获取自定义日历对应的虚拟团队名（用于 renderTeamScheduleBlock）
function _getCustomCalendarTeamName(calId) {
  const cal = CUSTOM_CALENDARS.find(c => c.id === calId);
  return cal ? cal.name : null;
}

function showShiftManage() {
  const total = Object.keys(SHIFTS).length;
  const content = `
    <div class="shift-mgmt-wrap">
      <div class="shift-mgmt-header">
        <div class="shift-mgmt-summary">
          <span class="shift-mgmt-summary-num">${total}</span>
          <span class="shift-mgmt-summary-label">个班次</span>
        </div>
        <button class="btn btn-primary btn-sm" onclick="showAddShiftForm()" style="border-radius:10px;padding:6px 16px;font-size:12.5px">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="vertical-align:-2px;margin-right:4px"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
          新增班次
        </button>
      </div>
      <div class="shift-manage-grid" id="shiftManageGrid">
        ${renderShiftManageCards()}
      </div>
    </div>
  `;
  openModal('班次管理', content, `<button class="btn btn-default" onclick="closeModal()">关闭</button>`, 720);
  // 注册关闭钩子——新增/编辑班次后刷新排班日历，使班次变更即时生效
  if (!_modalCloseHooks.some(fn => fn._shiftMgmtRefresh)) {
    const _refreshFn = () => {
      const area = document.getElementById('contentArea');
      if (area) renderSchedulePage(area);
    };
    _refreshFn._shiftMgmtRefresh = true;
    _modalCloseHooks.push(_refreshFn);
  }
}

function renderShiftManageCards() {
  return Object.entries(SHIFTS).map(([k, v]) => {
    const timeStr = v.start ? v.start + ' - ' + (v.end <= v.start ? '次日' : '') + v.end : '全天休息';
    const isCrossDay = v.start && v.end && v.end <= v.start;
    return `
    <div class="shift-manage-card" id="shift-card-${k}">
      <div class="shift-manage-card-top">
        <div class="shift-cell ${v.color}" style="width:44px;height:44px;border-radius:12px;font-size:18px;font-weight:800;letter-spacing:-0.5px;flex-shrink:0">${v.label}</div>
        <div class="shift-manage-card-info">
          <div class="shift-manage-name">${v.name}</div>
          <div class="shift-manage-time">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="vertical-align:-1px;margin-right:3px;opacity:0.5"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            ${timeStr}${isCrossDay ? ' <span style="color:var(--warning);font-size:10px;margin-left:2px">跨日</span>' : ''}
          </div>
        </div>
      </div>
      <div class="shift-manage-card-bottom">
        <span class="shift-manage-code">KEY: ${k}</span>
        ${k !== _SHIFT_OFF ? `<button class="shift-manage-edit-btn" onclick="showEditShiftForm('${k}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style="vertical-align:-1.5px;margin-right:3px"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          编辑
        </button>` : `<span class="shift-manage-builtin">内置</span>`}
      </div>
    </div>`;
  }).join('');
}

function showEditShiftForm(shiftKey) {
  const shift = SHIFTS[shiftKey];
  const content = `
    <div style="margin-bottom:12px">
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">编辑班次 <strong>${shift.name}</strong> 的基本信息</div>
      <div class="form-group">
        <label class="form-label required">班次名称</label>
        <input type="text" class="form-control" id="editShiftName" value="${shift.name}" placeholder="如：A班、早班">
      </div>
      <div class="form-group">
        <label class="form-label required">标识字母</label>
        <input type="text" class="form-control" id="editShiftLabel" value="${shift.label}" maxlength="2" placeholder="1-2个字符" style="width:80px">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label required">上班时间</label>
          <input type="time" class="form-control" id="editShiftStart" value="${shift.start}">
        </div>
        <div class="form-group">
          <label class="form-label required">下班时间</label>
          <input type="time" class="form-control" id="editShiftEnd" value="${shift.end}">
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">跨日班次（如到次日零点）请填 <strong>00:00</strong></div>
        </div>
        <div class="form-group">
          <label class="form-label">午休时间（分钟）</label>
          <input type="number" class="form-control" id="editShiftBreak" value="${shift.breakMinutes || 0}" min="0" max="180" step="5" style="width:100px" placeholder="如：60">
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">用于计算实际工时，填0表示无午休</div>
        </div>
      </div>
      <div id="editShiftCrossDay" style="display:${shift.end <= shift.start && shift.start && shift.end ? 'block' : 'none'}">
        <div class="alert-banner alert-info" style="margin-bottom:0;font-size:12px">🌙 当前为跨日班次：${shift.start} → 次日 ${shift.end || '00:00'}</div>
      </div>
      <div class="form-group">
        <label class="form-label">底色主题 <span style="font-size:11px;color:var(--text-tertiary);font-weight:400">（22种舒适色）</span></label>
        ${renderColorPicker(SHIFT_COLOR_OPTIONS, 'editShiftColor', shift.color)}
      </div>
    </div>
  `;
  openModal(`编辑班次 - ${shift.name}`, content, `
    <button class="btn btn-default" onclick="showShiftManage()">返回</button>
    <button class="btn btn-primary" onclick="saveEditShift('${shiftKey}')">保存修改</button>
  `);
}

// r84: 班次修改/新增后，后台刷新排班表（颜色、标签同步）
function _refreshScheduleAfterShiftChange() {
  const container = document.getElementById('contentArea');
  if (!container) return;
  // 仅当排班页面已渲染时才刷新
  if (!container.querySelector('.team-schedule-block')) return;
  renderSchedulePage(container);
}

function saveEditShift(shiftKey) {
  const name = document.getElementById('editShiftName')?.value?.trim();
  const label = document.getElementById('editShiftLabel')?.value?.trim();
  const start = document.getElementById('editShiftStart')?.value;
  const end = document.getElementById('editShiftEnd')?.value;
  const colorEl = document.querySelector('input[name="editShiftColor"]:checked');
  const color = colorEl ? colorEl.value : SHIFTS[shiftKey].color;

  if (!name) { showToast('请填写班次名称', 'warning'); return; }
  if (!label) { showToast('请填写标识字母', 'warning'); return; }
  if (!start || !end) { showToast('请填写上下班时间', 'warning'); return; }

  const breakMinutes = parseInt(document.getElementById('editShiftBreak')?.value) || 0;
  SHIFTS[shiftKey] = { name, label, start, end, color, breakMinutes };
  saveShifts();
  addWorkLog('考勤系统', '班次修改', `修改班次 ${shiftKey}：${name} ${start}-${end} 午休${breakMinutes}分钟`);
  showToast(`班次 ${name} 已更新`, 'success');
  showShiftManage();
  // r84: 班次颜色/名称修改后即时刷新排班表
  _refreshScheduleAfterShiftChange();
}

function showAddShiftForm() {
  const content = `
    <div style="margin-bottom:12px">
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">新增一个自定义班次，将出现在排班日历中</div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label required">班次代码</label>
          <input type="text" class="form-control" id="newShiftKey" maxlength="4" placeholder="如：D、E、NIGHT" style="text-transform:uppercase">
        </div>
        <div class="form-group">
          <label class="form-label required">标识字母</label>
          <input type="text" class="form-control" id="newShiftLabel" maxlength="2" placeholder="1-2字符" style="width:80px">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label required">班次名称</label>
        <input type="text" class="form-control" id="newShiftName" placeholder="如：夜班、D班">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label required">上班时间</label>
          <input type="time" class="form-control" id="newShiftStart" value="09:00">
        </div>
        <div class="form-group">
          <label class="form-label required">下班时间</label>
          <input type="time" class="form-control" id="newShiftEnd" value="18:00">
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">跨日班次（如到次日零点）请填 <strong>00:00</strong></div>
        </div>
        <div class="form-group">
          <label class="form-label">午休时间（分钟）</label>
          <input type="number" class="form-control" id="newShiftBreak" value="60" min="0" max="180" step="5" style="width:100px" placeholder="如：60">
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">用于计算实际工时，填0表示无午休</div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">底色主题 <span style="font-size:11px;color:var(--text-tertiary);font-weight:400">（22种舒适色）</span></label>
        ${renderColorPicker(SHIFT_COLOR_OPTIONS, 'newShiftColor', 'shift-a')}
      </div>
    </div>
  `;
  openModal('新增班次', content, `
    <button class="btn btn-default" onclick="showShiftManage()">返回</button>
    <button class="btn btn-primary" onclick="saveNewShift()">确认新增</button>
  `);
}

function saveNewShift() {
  const key = document.getElementById('newShiftKey')?.value?.trim().toUpperCase();
  const label = document.getElementById('newShiftLabel')?.value?.trim();
  const name = document.getElementById('newShiftName')?.value?.trim();
  const start = document.getElementById('newShiftStart')?.value;
  const end = document.getElementById('newShiftEnd')?.value;
  const colorEl = document.querySelector('input[name="newShiftColor"]:checked');
  const color = colorEl ? colorEl.value : 'shift-a';

  if (!key) { showToast('请填写班次代码', 'warning'); return; }
  if (SHIFTS[key]) { showToast(`班次代码 ${key} 已存在，请换一个`, 'warning'); return; }
  if (!label) { showToast('请填写标识字母', 'warning'); return; }
  if (!name) { showToast('请填写班次名称', 'warning'); return; }
  if (!start || !end) { showToast('请填写上下班时间', 'warning'); return; }

  const breakMinutes = parseInt(document.getElementById('newShiftBreak')?.value) || 0;
  SHIFTS[key] = { name, label, start, end, color, breakMinutes };
  saveShifts();
  addWorkLog('考勤系统', '班次新增', `新增班次 ${key}：${name} ${start}-${end} 午休${breakMinutes}分钟`);
  showToast(`班次 ${name} 已新增`, 'success');
  showShiftManage();
  // r84: 新增班次后即时刷新排班表
  _refreshScheduleAfterShiftChange();
}

function showLeaveManage() {
  const leaveRecords = APPROVAL_RECORDS.filter(r => r.type === 'leave');
  const content = `
    <div class="leave-mgmt-wrap">
      <div class="leave-mgmt-tabs" id="leaveMgmtTabs">
        <button class="leave-mgmt-tab active" onclick="switchLeaveMgmtTab(this,'types')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style="vertical-align:-2px;margin-right:5px"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="9" y="3" width="6" height="4" rx="1" stroke="currentColor" stroke-width="2"/></svg>
          请假类型
        </button>
        <button class="leave-mgmt-tab" onclick="switchLeaveMgmtTab(this,'records')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style="vertical-align:-2px;margin-right:5px"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><polyline points="14,2 14,8 20,8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          请假记录${leaveRecords.length > 0 ? ` <span class="leave-mgmt-tab-badge">${leaveRecords.length}</span>` : ''}
        </button>
      </div>
      <div id="leaveMgmtContent">
        ${renderLeaveTypesPanel()}
      </div>
    </div>
  `;
  openModal('请假管理', content, `<button class="btn btn-default" onclick="closeModal()">关闭</button>`, 720);
  // Bug⑨fix: 注册关闭钩子——新增/编辑请假类型后刷新排班日历，使统计列即时更新
  if (!_modalCloseHooks.some(fn => fn._leaveMgmtRefresh)) {
    const _refreshFn = () => {
      const area = document.getElementById('contentArea');
      if (area) renderSchedulePage(area);
    };
    _refreshFn._leaveMgmtRefresh = true;
    _modalCloseHooks.push(_refreshFn);
  }
}

function switchLeaveMgmtTab(el, tab) {
  document.querySelectorAll('#leaveMgmtTabs .leave-mgmt-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('leaveMgmtContent').innerHTML =
    tab === 'types' ? renderLeaveTypesPanel() : renderLeaveRecordsPanel();
}

function renderLeaveTypesPanel() {
  const cards = LEAVE_TYPES.map((lt, idx) => {
    const durLabel = lt.duration === 0.5 ? '半天' : '全天';
    const durIcon = lt.duration === 0.5 ? '◑' : '●';
    return `
      <div class="leave-type-card">
        <div class="leave-type-card-header">
          <span class="leave-type-tag ${lt.color}" style="font-size:13px;padding:3px 12px;border-radius:8px;font-weight:600">${lt.name}</span>
          <button class="shift-manage-edit-btn" onclick="showEditLeaveType(${idx})" style="font-size:11.5px;padding:4px 10px">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style="vertical-align:-1px;margin-right:2px"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            编辑
          </button>
        </div>
        <div class="leave-type-card-meta">
          <span class="leave-type-card-dur">${durIcon} ${durLabel}（${lt.duration}天）</span>
          <span class="leave-type-card-desc">${lt.desc || '标准' + lt.name + '类型'}</span>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="leave-type-grid">${cards}</div>
    <div style="margin-top:14px">
      <button class="btn btn-primary btn-sm" onclick="showAddLeaveTypeForm()" style="border-radius:10px;padding:6px 16px;font-size:12.5px">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="vertical-align:-2px;margin-right:4px"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
        新增类型
      </button>
    </div>
  `;
}

function renderLeaveRecordsPanel() {
  const leaveRecords = APPROVAL_RECORDS.filter(r => r.type === 'leave');
  if (leaveRecords.length === 0) {
    return `<div style="text-align:center;padding:40px 20px">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style="margin-bottom:12px;opacity:0.2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" stroke-width="1.5"/><polyline points="14,2 14,8 20,8" stroke="currentColor" stroke-width="1.5"/></svg>
      <div style="font-size:13px;color:var(--text-quaternary)">暂无请假记录</div>
    </div>`;
  }
  const statusCfg = {
    pending:  { label: '待审批', bg: 'rgba(255,125,0,0.08)', color: '#FF7D00', icon: '◦' },
    approved: { label: '已通过', bg: 'rgba(0,180,42,0.08)', color: '#00B42A', icon: '✓' },
    rejected: { label: '已驳回', bg: 'rgba(245,63,63,0.08)', color: '#F53F3F', icon: '✕' }
  };
  const rows = leaveRecords.map(r => {
    const s = statusCfg[r.status] || statusCfg.pending;
    const member = getMemberById(r.applicantId);
    return `
    <div class="leave-record-row">
      <div class="leave-record-user">
        ${member ? avatarImg(member, '28px') : ''}
        <div>
          <div style="font-weight:600;font-size:13px">${r.applicant}</div>
          <div style="font-size:11px;color:var(--text-tertiary)">${r.team || ''}</div>
        </div>
      </div>
      <div class="leave-record-detail">${r.content}</div>
      <div class="leave-record-time">${r.submittedAt}</div>
      <div class="leave-record-status" style="background:${s.bg};color:${s.color}">${s.icon} ${s.label}</div>
      <div class="leave-record-action">
        ${r.status === 'pending' ? `
          <button class="leave-action-approve" onclick="approveLeaveFromManage(${r.id})">通过</button>
          <button class="leave-action-reject" onclick="rejectLeaveFromManage(${r.id})">驳回</button>
        ` : `<span style="font-size:11px;color:var(--text-quaternary)">${r.approver || '-'}</span>`}
      </div>
    </div>`;
  }).join('');
  return `<div class="leave-records-list">${rows}</div>`;
}

function approveLeaveFromManage(id) {
  const record = APPROVAL_RECORDS.find(r => r.id === id);
  if (!record) return;
  record.status = 'approved';
  record.approvedAt = formatDate(new Date(), 'YYYY-MM-DD HH:mm');
  record.approver = CURRENT_USER.name;
  saveApprovalRecords();
  addWorkLog('考勤系统', '审批通过', `${record.applicant} 的请假申请已通过`);
  updateBadges();
  showToast(`${record.applicant} 的请假申请已通过`, 'success');
  // 刷新请假记录面板
  const content = document.getElementById('leaveMgmtContent');
  if (content) content.innerHTML = renderLeaveRecordsPanel();
}

function rejectLeaveFromManage(id) {
  const record = APPROVAL_RECORDS.find(r => r.id === id);
  if (!record) return;
  record.status = 'rejected';
  record.approver = CURRENT_USER.name;
  saveApprovalRecords();
  addWorkLog('考勤系统', '审批驳回', `${record.applicant} 的请假申请已驳回`);
  updateBadges();
  showToast(`${record.applicant} 的请假申请已驳回`, 'warning');
  const content = document.getElementById('leaveMgmtContent');
  if (content) content.innerHTML = renderLeaveRecordsPanel();
}

function showEditLeaveType(idx) {
  const lt = LEAVE_TYPES[idx];
  const content = `
    <div class="form-group">
      <label class="form-label required">类型名称</label>
      <input type="text" class="form-control" id="editLtName" value="${lt.name}" placeholder="如：年假、病假">
    </div>
    <div class="form-group">
      <label class="form-label required">请假时长</label>
      <div style="display:flex;gap:16px;margin-top:4px">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
          <input type="radio" name="editLtDuration" value="1" ${(lt.duration || 1) === 1 ? 'checked' : ''}>
          <span>全天（1天）</span>
        </label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
          <input type="radio" name="editLtDuration" value="0.5" ${lt.duration === 0.5 ? 'checked' : ''}>
          <span>半天（0.5天）</span>
        </label>
      </div>
      <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">设置此类型请假默认占用的时长</div>
    </div>
    <div class="form-group">
      <label class="form-label">说明</label>
      <input type="text" class="form-control" id="editLtDesc" value="${lt.desc || ''}" placeholder="请假类型说明">
    </div>
    <div class="form-group">
      <label class="form-label">底色标识 <span style="font-size:11px;color:var(--text-tertiary);font-weight:400">（22种舒适色）</span></label>
      ${renderColorPicker(LEAVE_COLOR_OPTIONS, 'editLtColor', lt.color)}
    </div>
  `;
  openModal(`编辑请假类型 - ${lt.name}`, content, `
    <button class="btn btn-default" onclick="showLeaveManage()">返回</button>
    <button class="btn btn-primary" onclick="saveEditLeaveType(${idx})">保存</button>
  `);
}

function saveEditLeaveType(idx) {
  const name = document.getElementById('editLtName')?.value?.trim();
  const desc = document.getElementById('editLtDesc')?.value?.trim();
  const colorEl = document.querySelector('input[name="editLtColor"]:checked');
  const color = colorEl ? colorEl.value : LEAVE_TYPES[idx].color;
  const durationEl = document.querySelector('input[name="editLtDuration"]:checked');
  const duration = durationEl ? parseFloat(durationEl.value) : 1;

  if (!name) { showToast('请填写类型名称', 'warning'); return; }
  LEAVE_TYPES[idx].name = name;
  LEAVE_TYPES[idx].desc = desc;
  LEAVE_TYPES[idx].color = color;
  LEAVE_TYPES[idx].duration = duration;
  saveLeaveTypes();
  addWorkLog('考勤系统', '请假类型修改', `修改请假类型：${name}（${duration === 0.5 ? '半天' : '全天'}）`);
  showToast(`请假类型 ${name} 已更新`, 'success');
  showLeaveManage();
}

function showAddLeaveTypeForm() {
  const content = `
    <div class="form-group">
      <label class="form-label required">类型名称</label>
      <input type="text" class="form-control" id="newLtName" placeholder="如：调休假、陪产假">
    </div>
    <div class="form-group">
      <label class="form-label required">请假时长</label>
      <div style="display:flex;gap:16px;margin-top:4px">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
          <input type="radio" name="newLtDuration" value="1" checked>
          <span>全天（1天）</span>
        </label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
          <input type="radio" name="newLtDuration" value="0.5">
          <span>半天（0.5天）</span>
        </label>
      </div>
      <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">设置此类型请假默认占用的时长</div>
    </div>
    <div class="form-group">
      <label class="form-label">说明</label>
      <input type="text" class="form-control" id="newLtDesc" placeholder="请假类型说明（可选）">
    </div>
    <div class="form-group">
      <label class="form-label">底色标识 <span style="font-size:11px;color:var(--text-tertiary);font-weight:400">（22种舒适色）</span></label>
      ${renderColorPicker(LEAVE_COLOR_OPTIONS, 'newLtColor', 'leave-annual')}
    </div>
  `;
  openModal('新增请假类型', content, `
    <button class="btn btn-default" onclick="showLeaveManage()">返回</button>
    <button class="btn btn-primary" onclick="saveNewLeaveType()">确认新增</button>
  `);
}

function saveNewLeaveType() {
  const name = document.getElementById('newLtName')?.value?.trim();
  const desc = document.getElementById('newLtDesc')?.value?.trim();
  const colorEl = document.querySelector('input[name="newLtColor"]:checked');
  const color = colorEl ? colorEl.value : 'leave-annual';
  const durationEl = document.querySelector('input[name="newLtDuration"]:checked');
  const duration = durationEl ? parseFloat(durationEl.value) : 1;

  if (!name) { showToast('请填写类型名称', 'warning'); return; }
  // 自动生成唯一 id（基于时间戳 + 随机后缀）
  const id = 'lt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

  LEAVE_TYPES.push({ id, name, color, duration, desc: desc || `标准${name}类型` });
  saveLeaveTypes();
  addWorkLog('考勤系统', '请假类型新增', `新增请假类型：${name}（${duration === 0.5 ? '半天' : '全天'}）`);
  showToast(`请假类型 ${name} 已新增`, 'success');
  showLeaveManage();
}

// ===== r95: 导入排班 — 三步向导全面升级 =====
let _importFileRef = null;
let _importParsedData = null;
let _importCurrentStep = 1;
let _importConflictStrategy = 'all'; // 'all' | 'skip' | 'force'
let _importChecked = {}; // { rowIndex: true/false }
let _importViewMode = 'card'; // 'card' | 'table'
let _importValidation = null; // { dangers:[], warnings:[] }
const _IMPORT_HISTORY_KEY = 'glxt_import_history';
const _IMPORT_HISTORY_MAX = 10;

function showOfflineImport() {
  _importFileRef = null;
  _importParsedData = null;
  _importCurrentStep = 1;
  _importConflictStrategy = 'all';
  _importChecked = {};
  _importViewMode = 'card';
  _importValidation = null;
  const content = `
    <div class="import-modal-wrap">
      <div class="import-steps-bar" id="importStepsBar">
        <div class="import-step-dot active" id="importDot1">1</div>
        <span class="import-step-label active" id="importLabel1">选择文件</span>
        <div class="import-step-line" id="importLine1"></div>
        <div class="import-step-dot" id="importDot2">2</div>
        <span class="import-step-label" id="importLabel2">校验预检</span>
        <div class="import-step-line" id="importLine2"></div>
        <div class="import-step-dot" id="importDot3">3</div>
        <span class="import-step-label" id="importLabel3">确认导入</span>
      </div>
      <div class="import-step step-enter" id="importStep1">
        <div class="import-row">
          <div class="import-field">
            <label class="import-label">导入月份</label>
            <input type="month" id="importMonthInput" class="form-control" value="${scheduleYear}-${String(scheduleMonth).padStart(2,'0')}" style="border-radius:10px;padding:8px 12px">
          </div>
          <div class="import-tpl-dropdown">
            <button class="import-tpl-btn" onclick="_toggleTplMenu(event)" title="下载模板">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 15V3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
              下载模板
              <svg width="8" height="8" viewBox="0 0 10 10" fill="none" style="margin-left:2px;opacity:0.5"><path d="M2 3.5l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            </button>
            <div class="import-tpl-menu" id="importTplMenu">
              <button class="import-tpl-menu-item" onclick="downloadImportTemplate('current');_closeTplMenu()">
                <div><div>当月模板</div><div class="import-tpl-menu-item-desc">预填当前排班数据</div></div>
              </button>
              <button class="import-tpl-menu-item" onclick="downloadImportTemplate('blank');_closeTplMenu()">
                <div><div>空白模板</div><div class="import-tpl-menu-item-desc">仅含表头和人员姓名</div></div>
              </button>
              <button class="import-tpl-menu-item" onclick="downloadImportTemplate('prev');_closeTplMenu()">
                <div><div>上月模板</div><div class="import-tpl-menu-item-desc">复制上月排班作为起点</div></div>
              </button>
            </div>
          </div>
        </div>
        <div class="import-dropzone" id="importDropzone"
             onclick="document.getElementById('importFileInput').click()"
             ondragover="event.preventDefault();this.classList.add('dragover')"
             ondragleave="this.classList.remove('dragover')"
             ondrop="event.preventDefault();this.classList.remove('dragover');_handleImportDrop(event)">
          <div class="import-dropzone-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M17 8l-5-5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 3v12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          </div>
          <div class="import-dropzone-text">点击选择或拖拽文件到此区域</div>
          <div class="import-dropzone-hint">支持 .xlsx / .xls / .csv 格式，最大 5MB</div>
        </div>
        <input type="file" id="importFileInput" accept=".xlsx,.xls,.csv" style="display:none" onchange="_handleImportFileChange(this)">
        <div class="import-info-bar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="flex-shrink:0;margin-top:1px"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M12 16v-4M12 8h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          <span>第一列为人员姓名，后续列为各日期班次（A/B/C/休/假等）</span>
        </div>
      </div>
      <div class="import-step" id="importStep2" style="display:none">
        <div class="import-validate-wrap" id="importValidateWrap"></div>
      </div>
      <div class="import-step" id="importStep3" style="display:none">
        <div class="import-preview-header" id="importPreviewHeader"></div>
        <div class="import-preview-wrap" id="importPreviewWrap"></div>
      </div>
    </div>
  `;
  openModal('导入排班', content, `
    <button class="btn btn-default" onclick="closeModal()">取消</button>
    <button class="btn btn-default" id="importBackBtn" style="display:none" onclick="_importGoBack()">上一步</button>
    <button class="btn btn-primary" id="importNextBtn" style="display:none" onclick="_importGoNext()">下一步</button>
    <button class="btn btn-primary" id="importConfirmBtn" style="display:none" onclick="_importConfirm()">确认导入</button>
  `, 720);
}

// 模板下拉菜单
function _toggleTplMenu(e) {
  e.stopPropagation();
  const m = document.getElementById('importTplMenu');
  if (m) m.classList.toggle('show');
}
function _closeTplMenu() {
  const m = document.getElementById('importTplMenu');
  if (m) m.classList.remove('show');
}

// 更新进度条
function _updateImportSteps(step) {
  _importCurrentStep = step;
  for (let i = 1; i <= 3; i++) {
    const dot = document.getElementById('importDot' + i);
    const label = document.getElementById('importLabel' + i);
    const line = i < 3 ? document.getElementById('importLine' + i) : null;
    if (dot) { dot.className = 'import-step-dot' + (i === step ? ' active' : i < step ? ' done' : ''); if (i < step) dot.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'; else dot.textContent = i; }
    if (label) { label.className = 'import-step-label' + (i === step ? ' active' : i < step ? ' done' : ''); }
    if (line) { line.className = 'import-step-line' + (i < step ? ' done' : ''); }
  }
}

// 文件拖拽
function _handleImportDrop(event) {
  const files = event.dataTransfer?.files;
  if (files && files[0]) { _importFileRef = files[0]; _onImportFileReady(files[0]); }
}
function _handleImportFileChange(input) {
  if (input.files && input.files[0]) { _importFileRef = input.files[0]; _onImportFileReady(input.files[0]); }
}

// 文件就绪
function _onImportFileReady(file) {
  if (file.size > 5 * 1024 * 1024) { showToast('文件大小超过 5MB 限制', 'warning'); return; }
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['csv', 'xlsx', 'xls'].includes(ext)) { showToast('不支持的文件格式', 'warning'); return; }
  // 切换 dropzone 为 loading 状态
  const zone = document.getElementById('importDropzone');
  if (zone) {
    zone.className = 'import-dropzone loading';
    zone.onclick = null;
    zone.innerHTML = `<div class="import-dropzone-spinner"></div>
      <div class="import-dropzone-text">正在解析文件...</div>
      <div class="import-dropzone-hint">${file.name}</div>`;
  }
  setTimeout(() => _parseImportFile(file), 100);
}

// 显示 dropzone 失败状态
function _showDropzoneError(msg) {
  const zone = document.getElementById('importDropzone');
  if (!zone) return;
  zone.className = 'import-dropzone error';
  zone.onclick = null;
  zone.innerHTML = `
    <div class="import-dropzone-error-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></div>
    <div class="import-dropzone-error-msg">${msg}</div>
    <button class="import-dropzone-retry" onclick="_resetDropzone()">重新选择</button>`;
}
function _resetDropzone() {
  _importFileRef = null;
  const zone = document.getElementById('importDropzone');
  if (zone) {
    zone.className = 'import-dropzone';
    zone.onclick = function() { document.getElementById('importFileInput').click(); };
    zone.innerHTML = `<div class="import-dropzone-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M17 8l-5-5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 3v12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></div>
      <div class="import-dropzone-text">点击选择或拖拽文件到此区域</div>
      <div class="import-dropzone-hint">支持 .xlsx / .xls / .csv 格式，最大 5MB</div>`;
  }
  // 隐藏下一步按钮
  const nextBtn = document.getElementById('importNextBtn');
  if (nextBtn) nextBtn.style.display = 'none';
}

// 显示 dropzone 成功状态 + 显示下一步按钮
function _showDropzoneSuccess(file) {
  const zone = document.getElementById('importDropzone');
  if (!zone) return;
  const sizeStr = file.size < 1024 ? file.size + 'B' : (file.size / 1024).toFixed(1) + 'KB';
  zone.className = 'import-dropzone';
  zone.onclick = function() { document.getElementById('importFileInput').click(); };
  zone.innerHTML = `
    <div class="import-dropzone-done"><svg width="32" height="32" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/></svg></div>
    <div class="import-dropzone-filename">${file.name}</div>
    <div class="import-dropzone-hint">${sizeStr} · 点击可重新选择</div>`;
  const nextBtn = document.getElementById('importNextBtn');
  if (nextBtn) nextBtn.style.display = '';
}

// 解析文件
function _parseImportFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'csv') {
    const reader = new FileReader();
    reader.onload = function(e) { try { _parseImportCSVText(e.target.result); _showDropzoneSuccess(file); } catch(err) { _showDropzoneError('CSV 解析失败: ' + err.message); } };
    reader.onerror = function() { _showDropzoneError('文件读取失败'); };
    reader.readAsText(file, 'UTF-8');
  } else {
    if (typeof XLSX === 'undefined') { _showDropzoneError('Excel 解析库未加载，请刷新页面'); return; }
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const csv = XLSX.utils.sheet_to_csv(ws);
        _parseImportCSVText(csv);
        _showDropzoneSuccess(file);
      } catch (err) { _showDropzoneError('Excel 解析失败: ' + err.message); }
    };
    reader.onerror = function() { _showDropzoneError('文件读取失败'); };
    reader.readAsArrayBuffer(file);
  }
}

// 解析 CSV 文本
function _parseImportCSVText(csvText) {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('文件为空或缺少数据行');
  const monthInput = document.getElementById('importMonthInput');
  if (!monthInput || !monthInput.value) throw new Error('请先选择导入月份');
  const [tyStr, tmStr] = monthInput.value.split('-');
  const ty = parseInt(tyStr), tm = parseInt(tmStr);
  if (!ty || !tm || tm < 1 || tm > 12) throw new Error('月份格式无效');
  const daysInMonth = new Date(ty, tm, 0).getDate();
  const headerCells = _parseCSVLine(lines[0]);
  const dayMap = [];
  for (let i = 1; i < headerCells.length; i++) {
    const h = headerCells[i].trim();
    let dn = null;
    if (/^\d{1,2}$/.test(h)) dn = parseInt(h);
    else if (/\d+月(\d+)日/.test(h)) dn = parseInt(h.match(/\d+月(\d+)日/)[1]);
    else if (/^\d{1,2}\/(\d{1,2})$/.test(h)) dn = parseInt(h.match(/^\d{1,2}\/(\d{1,2})$/)[1]);
    else if (/^\d{4}-\d{2}-(\d{2})$/.test(h)) dn = parseInt(h.match(/^\d{4}-\d{2}-(\d{2})$/)[1]);
    else dn = i;
    dayMap.push((dn >= 1 && dn <= daysInMonth) ? dn : null);
  }
  const aliasMap = { '休': 'OFF', '休息': 'OFF', 'OFF': 'OFF', 'off': 'OFF' };
  Object.keys(SHIFTS).forEach(k => {
    aliasMap[k] = k; aliasMap[k.toLowerCase()] = k;
    if (SHIFTS[k].name) { aliasMap[SHIFTS[k].name] = k; aliasMap[SHIFTS[k].name.replace(/班$/, '')] = k; }
    if (SHIFTS[k].label) aliasMap[SHIFTS[k].label] = k;
  });
  LEAVE_TYPES.forEach(lt => { aliasMap[lt.name] = 'LEAVE:' + lt.id; aliasMap[lt.id] = 'LEAVE:' + lt.id; });
  aliasMap['假'] = LEAVE_TYPES.length > 0 ? 'LEAVE:' + LEAVE_TYPES[0].id : 'OFF';
  const nameMap = {};
  MEMBERS_DATA.forEach(m => { if (!m.excludeFromSchedule) nameMap[m.name.trim()] = m; });
  const existKey = `glxt_schedule_${ty}_${tm}`;
  const existData = _storageGet(existKey) || {};
  const rows = [];
  let errCount = 0, changeCount = 0, skipCount = 0;
  for (let i = 1; i < lines.length; i++) {
    const cells = _parseCSVLine(lines[i]);
    const rawName = (cells[0] || '').trim();
    if (!rawName) continue;
    const member = nameMap[rawName];
    if (!member) { errCount++; rows.push({ name: rawName, status: 'unknown', changes: [] }); continue; }
    const changes = [];
    for (let ci = 1; ci < cells.length; ci++) {
      const day = dayMap[ci - 1];
      if (!day) continue;
      const raw = (cells[ci] || '').trim();
      if (!raw) continue;
      const code = aliasMap[raw] || aliasMap[raw.toUpperCase()] || null;
      if (!code) continue;
      const curShift = (existData[member.id] && existData[member.id][String(day)]) || 'OFF';
      if (code !== curShift) {
        changes.push({ day, oldVal: curShift, newVal: code, rawText: raw });
        changeCount++;
      }
    }
    if (changes.length === 0) { skipCount++; rows.push({ name: rawName, memberId: member.id, status: 'skip', changes: [] }); }
    else { rows.push({ name: rawName, memberId: member.id, status: 'change', changes }); }
  }
  _importParsedData = { rows, ty, tm, daysInMonth, changeCount, skipCount, errCount, dayMap };
  // 默认全部勾选
  _importChecked = {};
  rows.forEach((r, i) => { if (r.status === 'change') _importChecked[i] = true; });
}

// 下一步
function _importGoNext() {
  if (_importCurrentStep === 1) {
    if (!_importParsedData) { showToast('请先选择并解析文件', 'warning'); return; }
    _updateImportSteps(2);
    _showStep(2);
    _renderImportValidation();
  } else if (_importCurrentStep === 2) {
    _updateImportSteps(3);
    _showStep(3);
    _renderImportPreview();
  }
}

// 上一步
function _importGoBack() {
  if (_importCurrentStep === 2) {
    _updateImportSteps(1);
    _showStep(1);
  } else if (_importCurrentStep === 3) {
    _updateImportSteps(2);
    _showStep(2);
  }
}

function _showStep(n) {
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById('importStep' + i);
    if (el) { el.style.display = i === n ? '' : 'none'; if (i === n) { el.classList.remove('step-enter'); void el.offsetWidth; el.classList.add('step-enter'); } }
  }
  const backBtn = document.getElementById('importBackBtn');
  const nextBtn = document.getElementById('importNextBtn');
  const confirmBtn = document.getElementById('importConfirmBtn');
  if (backBtn) backBtn.style.display = n > 1 ? '' : 'none';
  if (nextBtn) nextBtn.style.display = (n < 3 && _importParsedData) ? '' : 'none';
  if (confirmBtn) confirmBtn.style.display = n === 3 ? '' : 'none';
}

// === Step 2: 校验预检 ===
function _renderImportValidation() {
  const d = _importParsedData;
  if (!d) return;
  const wrap = document.getElementById('importValidateWrap');
  if (!wrap) return;

  const dangers = [], warnings = [];

  // 检测规则冲突：模拟导入后数据，检测每天在班人数
  const existKey = `glxt_schedule_${d.ty}_${d.tm}`;
  const existSchedule = _storageGet(existKey) || {};
  const simData = JSON.parse(JSON.stringify(existSchedule));
  d.rows.forEach((r, idx) => {
    if (r.status !== 'change' || !r.memberId) return;
    r.changes.forEach(c => {
      if (!simData[r.memberId]) simData[r.memberId] = {};
      simData[r.memberId][String(c.day)] = c.newVal;
    });
  });

  const globalMin = (SCHEDULE_RULES && SCHEDULE_RULES.globalMin) || 0;
  const maxConsecutive = (SCHEDULE_RULES && SCHEDULE_RULES.maxConsecutive) || 99;
  const members = MEMBERS_DATA.filter(m => !m.excludeFromSchedule);

  // 人数不足
  if (globalMin > 0) {
    for (let day = 1; day <= d.daysInMonth; day++) {
      let count = 0;
      members.forEach(m => {
        const s = simData[m.id] && simData[m.id][String(day)];
        if (s && s !== 'OFF' && s !== _SHIFT_OFF && !s?.startsWith('LEAVE:')) count++;
      });
      if (count < globalMin) {
        dangers.push(`${d.tm}月${day}日在班人数 ${count} 人，低于最低要求 ${globalMin} 人`);
      }
    }
  }
  // 连续上班
  members.forEach(m => {
    let consecutive = 0;
    for (let day = 1; day <= d.daysInMonth; day++) {
      const s = simData[m.id] && simData[m.id][String(day)];
      if (s && s !== 'OFF' && s !== _SHIFT_OFF && !s?.startsWith('LEAVE:')) { consecutive++; }
      else { consecutive = 0; }
      if (consecutive > maxConsecutive) {
        warnings.push(`${m.name} 第${day - consecutive + 1}-${day}日连续上班 ${consecutive} 天，超过 ${maxConsecutive} 天上限`);
        break;
      }
    }
  });

  _importValidation = { dangers, warnings };

  let html = '';
  if (dangers.length === 0 && warnings.length === 0) {
    html += `<div class="import-validate-card validate-pass">
      <div class="import-validate-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/></svg></div>
      <div class="import-validate-body"><div class="import-validate-title">校验通过</div><div class="import-validate-desc">导入数据不违反任何排班规则，可以安全导入</div></div>
    </div>`;
  }
  if (dangers.length > 0) {
    html += `<div class="import-validate-card validate-danger">
      <div class="import-validate-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M12 8v4M12 16h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></div>
      <div class="import-validate-body"><div class="import-validate-title">严重冲突 (${dangers.length})</div><div class="import-validate-desc">${dangers.slice(0, 3).join('；')}${dangers.length > 3 ? '...' : ''}</div></div>
    </div>`;
  }
  if (warnings.length > 0) {
    html += `<div class="import-validate-card validate-warn">
      <div class="import-validate-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 9v4M12 17h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" stroke-width="2"/></svg></div>
      <div class="import-validate-body"><div class="import-validate-title">警告 (${warnings.length})</div><div class="import-validate-desc">${warnings.slice(0, 3).join('；')}${warnings.length > 3 ? '...' : ''}</div></div>
    </div>`;
  }
  if (dangers.length > 0 || warnings.length > 0) {
    html += `<div style="margin-top:6px;font-size:12px;color:var(--text-secondary);font-weight:500">冲突处理策略：</div>
      <div class="import-conflict-strategy">
        <button class="import-conflict-btn${_importConflictStrategy==='all'?' active':''}" onclick="_setConflictStrategy('all')">全部导入</button>
        <button class="import-conflict-btn${_importConflictStrategy==='skip'?' active':''}" onclick="_setConflictStrategy('skip')">跳过冲突项</button>
        <button class="import-conflict-btn${_importConflictStrategy==='force'?' active':''}" onclick="_setConflictStrategy('force')">强制覆盖</button>
      </div>`;
  }
  // 摘要信息
  html += `<div style="margin-top:16px;padding:10px 14px;background:rgba(51,112,255,0.04);border-radius:10px;font-size:12.5px;color:var(--text-secondary)">
    <b>${d.ty}年${d.tm}月</b> — 共解析 ${d.rows.length} 人，其中 <span style="color:#00B42A;font-weight:600">${d.changeCount} 处变更</span>，${d.skipCount} 人无变化${d.errCount > 0 ? `，<span style="color:#CF1322">${d.errCount} 人未匹配</span>` : ''}
  </div>`;
  wrap.innerHTML = html;
}

function _setConflictStrategy(s) {
  _importConflictStrategy = s;
  document.querySelectorAll('.import-conflict-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
}

// === Step 3: 差异预览（卡片 + 表格 双视图，checkbox 选择性导入） ===
function _renderImportPreview() {
  const d = _importParsedData;
  if (!d) return;
  const confirmBtn = document.getElementById('importConfirmBtn');
  const checkedCount = Object.values(_importChecked).filter(Boolean).length;
  const checkedChanges = d.rows.reduce((sum, r, i) => sum + (_importChecked[i] ? r.changes.length : 0), 0);
  if (confirmBtn) {
    confirmBtn.textContent = checkedChanges > 0 ? `确认导入 (${checkedChanges} 处)` : '无变更';
    confirmBtn.disabled = checkedChanges === 0;
  }

  const header = document.getElementById('importPreviewHeader');
  if (header) {
    const changedRows = d.rows.filter(r => r.status === 'change');
    header.innerHTML = `
      <div class="import-preview-summary">
        <span class="import-preview-tag tag-blue">${d.ty}年${d.tm}月</span>
        <span class="import-preview-tag tag-green">${checkedChanges} 处变更</span>
        <span class="import-preview-tag tag-gray">${d.skipCount} 人无变化</span>
        ${d.errCount > 0 ? `<span class="import-preview-tag tag-red">${d.errCount} 人未匹配</span>` : ''}
        ${_importValidation && _importValidation.dangers.length > 0 ? `<span class="import-preview-tag tag-orange">${_importValidation.dangers.length} 冲突</span>` : ''}
      </div>
      <div class="import-preview-toolbar">
        <label class="import-selectall"><input type="checkbox" ${checkedCount === changedRows.length ? 'checked' : ''} onchange="_importToggleAll(this.checked)"> 全选 (${checkedCount}/${changedRows.length})</label>
        <div class="import-preview-actions">
          <button class="import-preview-toggle${_importViewMode==='card'?' active':''}" onclick="_importSwitchView('card')"><svg width="12" height="12" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.2"/></svg> 卡片</button>
          <button class="import-preview-toggle${_importViewMode==='table'?' active':''}" onclick="_importSwitchView('table')"><svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M1 1h12v12H1z" stroke="currentColor" stroke-width="1.2"/><path d="M1 5h12M1 9h12M5 1v12" stroke="currentColor" stroke-width="1"/></svg> 表格</button>
        </div>
      </div>
    `;
  }

  const wrap = document.getElementById('importPreviewWrap');
  if (!wrap) return;
  if (_importViewMode === 'table') { _renderImportTableView(wrap); }
  else { _renderImportCardView(wrap); }
}

function _renderImportCardView(wrap) {
  const d = _importParsedData;
  const changedRows = d.rows.map((r, i) => ({...r, _idx: i})).filter(r => r.status === 'change');
  const unknownRows = d.rows.filter(r => r.status === 'unknown');
  const skipRows = d.rows.filter(r => r.status === 'skip');
  let html = '';
  if (changedRows.length > 0) {
    html += `<div class="import-preview-section"><div class="import-preview-section-title">变更明细 (${changedRows.length} 人)</div>`;
    changedRows.forEach(r => {
      const checked = _importChecked[r._idx];
      const maxShow = 8;
      const shown = r.changes.slice(0, maxShow);
      const more = r.changes.length - maxShow;
      html += `<div class="import-diff-row${checked ? '' : ' unchecked'}" style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:#F7F8FA;border-radius:8px;border:1px solid #E8EAED;margin-bottom:6px">
        <input type="checkbox" class="import-diff-check" data-ridx="${r._idx}" ${checked ? 'checked' : ''} onchange="_importToggleRow(${r._idx},this.checked)">
        <div class="import-diff-name" style="font-size:13px;font-weight:600;min-width:52px;flex-shrink:0;padding-top:2px">${r.name}</div>
        <div class="import-diff-changes" style="flex:1;display:flex;flex-wrap:wrap;gap:5px">
          ${shown.map(c => `<span class="import-diff-cell" style="display:inline-flex;align-items:center;gap:3px;padding:2px 7px;background:#fff;border:1px solid #E8EAED;border-radius:6px;font-size:11px">
            <span class="import-diff-day" style="color:#86909C">${c.day}日</span>
            <span class="import-diff-old" style="color:#CF1322;text-decoration:line-through;font-weight:500">${_shiftDisplayLabel(c.oldVal)}</span>
            <span class="import-diff-arrow" style="color:#86909C;font-size:11px">→</span>
            <span class="import-diff-new" style="color:#00B42A;font-weight:600">${_shiftDisplayLabel(c.newVal)}</span>
          </span>`).join('')}
          ${more > 0 ? `<span class="import-diff-more" style="display:inline-flex;align-items:center;padding:2px 7px;background:#F0F7FF;color:#1677FF;border-radius:6px;font-size:11px;font-weight:600">+${more} 处</span>` : ''}
        </div>
        <div style="font-size:11px;color:#86909C;flex-shrink:0;white-space:nowrap">${r.changes.length} 处</div>
      </div>`;
    });
    html += `</div>`;
  }
  if (unknownRows.length > 0) {
    html += `<div class="import-preview-section"><div class="import-preview-section-title import-preview-err">未匹配人员 (${unknownRows.length})</div>`;
    unknownRows.forEach(r => {
      html += `<div class="import-diff-row" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:#F7F8FA;border-radius:8px;border:1px solid #E8EAED;margin-bottom:6px"><div style="font-size:13px;font-weight:600;color:#CF1322">${r.name}</div><div style="font-size:12px;color:#86909C">系统中未找到此人员，将被跳过</div></div>`;
    });
    html += `</div>`;
  }
  if (skipRows.length > 0) {
    html += `<div class="import-preview-section"><div class="import-preview-section-title import-preview-muted">无变化人员 (${skipRows.length})</div><div style="font-size:12px;color:#86909C;padding:6px 0">${skipRows.map(r => r.name).join('、')}</div></div>`;
  }
  wrap.innerHTML = html;
}

function _renderImportTableView(wrap) {
  const d = _importParsedData;
  const changedRows = d.rows.map((r, i) => ({...r, _idx: i})).filter(r => r.status === 'change');
  if (changedRows.length === 0) { wrap.innerHTML = '<div style="text-align:center;padding:24px;color:#86909C">无变更数据</div>'; return; }
  // 收集所有涉及的天数
  const daySet = new Set();
  changedRows.forEach(r => r.changes.forEach(c => daySet.add(c.day)));
  const days = [...daySet].sort((a, b) => a - b);
  // 构建变更映射
  const changeMap = {};
  changedRows.forEach(r => {
    changeMap[r._idx] = {};
    r.changes.forEach(c => { changeMap[r._idx][c.day] = c; });
  });
  let html = `<div class="import-table-view"><table class="import-table"><thead><tr><th style="text-align:left;position:sticky;left:0;z-index:3;background:#F7F8FA"><input type="checkbox" style="width:13px;height:13px;accent-color:var(--primary)" ${Object.values(_importChecked).filter(Boolean).length === changedRows.length ? 'checked' : ''} onchange="_importToggleAll(this.checked)"></th><th style="text-align:left;position:sticky;left:30px;z-index:3;background:#F7F8FA">姓名</th>`;
  days.forEach(day => { html += `<th>${day}日</th>`; });
  html += `</tr></thead><tbody>`;
  changedRows.forEach(r => {
    const checked = _importChecked[r._idx];
    html += `<tr style="${checked ? '' : 'opacity:0.4'}"><td style="position:sticky;left:0;background:var(--card,#fff);z-index:1"><input type="checkbox" style="width:13px;height:13px;accent-color:var(--primary)" data-ridx="${r._idx}" ${checked ? 'checked' : ''} onchange="_importToggleRow(${r._idx},this.checked)"></td><td class="name-col" style="position:sticky;left:30px;z-index:1;background:var(--card,#fff)">${r.name}</td>`;
    days.forEach(day => {
      const c = changeMap[r._idx][day];
      if (c) {
        html += `<td class="changed"><span class="old-val">${_shiftDisplayLabel(c.oldVal)}</span><span class="new-val">${_shiftDisplayLabel(c.newVal)}</span></td>`;
      } else { html += `<td>-</td>`; }
    });
    html += `</tr>`;
  });
  html += `</tbody></table></div>`;
  wrap.innerHTML = html;
}

function _importToggleRow(idx, checked) {
  _importChecked[idx] = checked;
  _renderImportPreview();
}
function _importToggleAll(checked) {
  const d = _importParsedData;
  if (!d) return;
  d.rows.forEach((r, i) => { if (r.status === 'change') _importChecked[i] = checked; });
  _renderImportPreview();
}
function _importSwitchView(mode) {
  _importViewMode = mode;
  _renderImportPreview();
}

// 班次显示标签
function _shiftDisplayLabel(code) {
  if (!code) return '空';
  if (code === 'OFF' || code === _SHIFT_OFF) return '休';
  if (code.startsWith('LEAVE:')) {
    const lt = LEAVE_TYPES.find(t => t.id === code.replace('LEAVE:', ''));
    return lt ? lt.name : '假';
  }
  return SHIFTS[code]?.label || SHIFTS[code]?.name || code;
}

// === 确认导入 ===
function _importConfirm() {
  const d = _importParsedData;
  if (!d) { showToast('没有需要导入的数据', 'info'); return; }
  const checkedChanges = d.rows.reduce((sum, r, i) => sum + (_importChecked[i] ? r.changes.length : 0), 0);
  if (checkedChanges === 0) { showToast('没有勾选任何变更', 'info'); return; }

  const key = `glxt_schedule_${d.ty}_${d.tm}`;
  const data = _storageGet(key) || {};
  const snapshotBefore = JSON.parse(JSON.stringify(data));

  let applied = 0;
  d.rows.forEach((r, i) => {
    if (r.status !== 'change' || !r.memberId || !_importChecked[i]) return;
    r.changes.forEach(c => {
      if (!data[r.memberId]) data[r.memberId] = {};
      data[r.memberId][String(c.day)] = c.newVal;
      applied++;
    });
  });

  _storageSet(key, data);
  markMonthAsImported(d.ty, d.tm);

  // 保存导入历史
  _saveImportHistory({
    timestamp: Date.now(),
    fileName: _importFileRef ? _importFileRef.name : 'unknown',
    year: d.ty, month: d.tm,
    changeCount: applied,
    snapshot: snapshotBefore
  });

  if (d.ty === scheduleYear && d.tm === scheduleMonth) {
    const freshData = _storageGet(key) || {};
    Object.keys(freshData).forEach(mid => {
      SCHEDULE_DATA[mid] = SCHEDULE_DATA[mid] || {};
      Object.assign(SCHEDULE_DATA[mid], freshData[mid]);
    });
    renderSchedulePage(document.getElementById('contentArea'));
  }

  closeModal();
  showToast(`成功导入 ${applied} 处变更（${d.ty}年${d.tm}月）`, 'success');
  if (typeof _pushNotify === 'function') {
    _pushNotify({ type: 'system', title: '排班导入完成', body: '已成功导入 ' + applied + ' 处变更（' + d.ty + '年' + d.tm + '月）', icon: 'check', color: '#e8f9e8' });
  }
  _importFileRef = null;
  _importParsedData = null;
}

// === 导入历史 ===
function _saveImportHistory(entry) {
  try {
    const raw = typeof _storageGetRaw === 'function' ? _storageGetRaw(_IMPORT_HISTORY_KEY) : localStorage.getItem(_IMPORT_HISTORY_KEY);
    const history = JSON.parse(raw || '[]');
    history.unshift(entry);
    if (history.length > _IMPORT_HISTORY_MAX) history.length = _IMPORT_HISTORY_MAX;
    if (typeof _storageSetRaw === 'function') _storageSetRaw(_IMPORT_HISTORY_KEY, JSON.stringify(history));
    else localStorage.setItem(_IMPORT_HISTORY_KEY, JSON.stringify(history));
  } catch(e) { console.warn('[import history] save error:', e); }
}
function showImportHistory() {
  let history = [];
  try { const raw = typeof _storageGetRaw === 'function' ? _storageGetRaw(_IMPORT_HISTORY_KEY) : localStorage.getItem(_IMPORT_HISTORY_KEY); history = JSON.parse(raw || '[]'); } catch(e) {}
  let content = '';
  if (history.length === 0) {
    content = '<div class="import-history-empty">暂无导入记录</div>';
  } else {
    content = '<div class="import-history-list">';
    history.forEach((h, i) => {
      const t = new Date(h.timestamp);
      const ts = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')} ${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
      content += `<div class="import-history-item">
        <div class="import-history-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" stroke-width="1.5"/><path d="M14 2v6h6" stroke="currentColor" stroke-width="1.5"/></svg></div>
        <div class="import-history-body">
          <div class="import-history-title">${h.year}年${h.month}月 — ${h.changeCount} 处变更</div>
          <div class="import-history-meta">${h.fileName} · ${ts}</div>
        </div>
        <button class="import-history-rollback" onclick="_rollbackImport(${i})">回滚</button>
      </div>`;
    });
    content += '</div>';
  }
  openModal('导入历史记录', content, `<button class="btn btn-default" onclick="closeModal()">关闭</button>`, 520);
}
function _rollbackImport(index) {
  let history = [];
  try { const raw = typeof _storageGetRaw === 'function' ? _storageGetRaw(_IMPORT_HISTORY_KEY) : localStorage.getItem(_IMPORT_HISTORY_KEY); history = JSON.parse(raw || '[]'); } catch(e) {}
  const entry = history[index];
  if (!entry) { showToast('找不到该记录', 'warning'); return; }
  if (!confirm(`确定要回滚 ${entry.year}年${entry.month}月 的导入操作吗？\n这将恢复到导入前的排班数据。`)) return;
  const key = `glxt_schedule_${entry.year}_${entry.month}`;
  _storageSet(key, entry.snapshot, true);
  if (entry.year === scheduleYear && entry.month === scheduleMonth) {
    Object.keys(entry.snapshot).forEach(mid => {
      SCHEDULE_DATA[mid] = SCHEDULE_DATA[mid] || {};
      Object.assign(SCHEDULE_DATA[mid], entry.snapshot[mid]);
    });
    renderSchedulePage(document.getElementById('contentArea'));
  }
  if (typeof _clearAttCache === 'function') _clearAttCache();
  // 移除这条历史
  history.splice(index, 1);
  if (typeof _storageSetRaw === 'function') _storageSetRaw(_IMPORT_HISTORY_KEY, JSON.stringify(history));
  else localStorage.setItem(_IMPORT_HISTORY_KEY, JSON.stringify(history));
  closeModal();
  showToast(`已回滚 ${entry.year}年${entry.month}月排班数据`, 'success');
}

// 下载导入模板
function downloadImportTemplate(type) {
  type = type || 'current';
  const monthInput = document.getElementById('importMonthInput');
  if (!monthInput || !monthInput.value) { showToast('请先选择月份', 'warning'); return; }
  const [tyStr, tmStr] = monthInput.value.split('-');
  const ty = parseInt(tyStr), tm = parseInt(tmStr);
  const daysInMonth = new Date(ty, tm, 0).getDate();
  const members = MEMBERS_DATA.filter(m => !m.excludeFromSchedule);

  // 根据类型读取数据源
  let srcData = {};
  if (type === 'current') {
    srcData = _storageGet(`glxt_schedule_${ty}_${tm}`) || {};
  } else if (type === 'prev') {
    const pm = tm === 1 ? 12 : tm - 1;
    const py = tm === 1 ? ty - 1 : ty;
    srcData = _storageGet(`glxt_schedule_${py}_${pm}`) || {};
  }
  // 'blank' → srcData stays {}

  if (typeof XLSX !== 'undefined') {
    const wb = XLSX.utils.book_new();
    const header = ['姓名', ...Array.from({length: daysInMonth}, (_, i) => String(i + 1))];
    const wsData = [header];
    members.forEach(m => {
      const row = [m.name];
      for (let d = 1; d <= daysInMonth; d++) {
        if (type === 'blank') { row.push(''); }
        else { const s = (srcData[m.id] && srcData[m.id][String(d)]) || 'OFF'; row.push(_shiftDisplayLabel(s)); }
      }
      wsData.push(row);
    });
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 10 }, ...Array.from({length: daysInMonth}, () => ({ wch: 5 }))];
    XLSX.utils.book_append_sheet(wb, ws, '排班表');
    const refData = [['代号', '名称', '说明']];
    Object.keys(SHIFTS).forEach(k => {
      if (k === _SHIFT_OFF) refData.push(['休', '休息', '休息日']);
      else refData.push([SHIFTS[k].label || k, SHIFTS[k].name || k, `${SHIFTS[k].startTime || ''}-${SHIFTS[k].endTime || ''}`]);
    });
    LEAVE_TYPES.forEach(lt => { refData.push([lt.name, lt.name, `请假(${lt.duration || 1}天)`]); });
    const ws2 = XLSX.utils.aoa_to_sheet(refData);
    ws2['!cols'] = [{ wch: 8 }, { wch: 12 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws2, '班次说明');
    const suffix = type === 'blank' ? '空白' : type === 'prev' ? '上月' : '当月';
    XLSX.writeFile(wb, `排班模板_${ty}年${tm}月_${suffix}.xlsx`);
    showToast(`已下载 ${suffix} Excel 模板`, 'success');
  } else {
    const BOM = '\uFEFF';
    const header = `姓名,${Array.from({length: daysInMonth}, (_, i) => i + 1).join(',')}\n`;
    const rows = members.map(m => {
      const cells = [m.name];
      for (let d = 1; d <= daysInMonth; d++) {
        if (type === 'blank') { cells.push(''); }
        else { const s = (srcData[m.id] && srcData[m.id][String(d)]) || 'OFF'; cells.push(_shiftDisplayLabel(s)); }
      }
      return cells.join(',');
    }).join('\n');
    const csv = BOM + header + rows;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const suffix = type === 'blank' ? '空白' : type === 'prev' ? '上月' : '当月';
    a.href = url; a.download = `排班模板_${ty}年${tm}月_${suffix}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`已下载 ${suffix} CSV 模板`, 'success');
  }
}

// CSV 行解析
function _parseCSVLine(line) {
  const result = [];
  let current = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') { if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; } else { inQuotes = false; } }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { result.push(current); current = ''; }
      else { current += ch; }
    }
  }
  result.push(current);
  return result;
}


// 考勤统计页
function renderAttendancePage(container) {
  const members = MEMBERS_DATA.filter(m => !m.excludeFromSchedule);
  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">考勤统计</div>
        <div class="page-subtitle">查看团队出勤数据、打卡记录与异常统计</div>
      </div>
      <div class="page-actions">
        <select class="filter-select" id="attTeamFilter" onchange="renderAttendancePage(document.getElementById('contentArea'))">
          <option value="all">全部团队</option>
          ${TEAMS.map(t => `<option>${t}</option>`).join('')}
        </select>
        <select class="filter-select">
          <option>本月</option><option>上月</option><option>本周</option>
        </select>
        <button class="btn btn-default btn-sm" onclick="exportAttendanceReport()">导出报表</button>
      </div>
    </div>

    <div class="attendance-stat-grid">
      <div class="attendance-stat-card">
        <div class="attendance-stat-num" style="color:var(--primary)">${members.length}</div>
        <div class="attendance-stat-label">在职人员</div>
      </div>
      <div class="attendance-stat-card">
        <div class="attendance-stat-num" style="color:var(--success)">${members.filter(m => { const s = getMemberShift(m.id, new Date().getDate()); return s !== _SHIFT_OFF && !isLeaveShift(s); }).length}</div>
        <div class="attendance-stat-label">今日在岗</div>
      </div>
      <div class="attendance-stat-card">
        <div class="attendance-stat-num" style="color:var(--warning)">${members.filter(m => isLeaveShift(getMemberShift(m.id, new Date().getDate()))).length}</div>
        <div class="attendance-stat-label">今日请假</div>
      </div>
      <div class="attendance-stat-card">
        <div class="attendance-stat-num" style="color:var(--info)">${members.reduce((s, m) => s + (ATTENDANCE_STATS[m.id]?.triplePayDays || 0), 0)}</div>
        <div class="attendance-stat-label">本月三薪天数</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">人员出勤明细</span>
        <div style="display:flex;gap:8px">
          <input type="text" class="form-control" style="width:160px;height:28px" placeholder="搜索人员..." oninput="filterAttTable(this.value)">
        </div>
      </div>
      <div class="card-body" style="padding:0">
        <div class="table-wrap">
          <table class="table" id="attTable">
            <thead>
              <tr>
                <th>人员</th><th>团队</th><th>今日班次</th><th>出勤天数</th><th>请假天数</th>
                <th>三薪天数</th><th>操作</th>
              </tr>
            </thead>
            <tbody>
              ${members.map(m => {
                const stats = ATTENDANCE_STATS[m.id] || {};
                const todayShift = getMemberShift(m.id, new Date().getDate());
                const shiftInfo = getShiftDisplayInfo(todayShift);
                return `<tr>
                  <td>
                    <div style="display:flex;align-items:center;gap:8px;cursor:pointer" onclick="showPersonDetail(${m.id})">
                      ${avatarImg(m, '28px')}
                      <span style="font-weight:500">${m.name}</span>
                    </div>
                  </td>
                  <td><span class="tag tag-blue">${m.team}</span></td>
                  <td><span class="shift-cell ${shiftInfo.color}" style="display:inline-flex;padding:2px 8px;border-radius:4px;font-size:12px">${shiftInfo.name}</span></td>
                  <td>${stats.workDays || 0}</td>
                  <td>${stats.leaveDays || 0}</td>
                  <td>${stats.triplePayDays || 0}</td>
                  <td>
                    <button class="btn btn-ghost btn-sm" onclick="showPunchDetail(${m.id})">打卡记录</button>
                    <button class="btn btn-ghost btn-sm" onclick="showLeaveApply(${m.id})">申请请假</button>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function filterAttTable(val) {
  const rows = document.querySelectorAll('#attTable tbody tr');
  rows.forEach(row => {
    row.style.display = row.textContent.includes(val) ? '' : 'none';
  });
}

function showPunchDetail(memberId) {
  const member = getMemberById(memberId);
  const records = [
    { date: '2026-04-08', in: '08:02', out: '17:05', status: 'normal' },
    { date: '2026-04-07', in: '08:15', out: '17:00', status: 'late' },
    { date: '2026-04-06', in: '07:58', out: '17:02', status: 'normal' },
    { date: '2026-04-05', in: '08:00', out: '16:45', status: 'early' },
    { date: '2026-04-04', in: '09:00', out: '18:00', status: 'normal' },
  ];
  const content = `
    <div style="margin-bottom:12px;display:flex;align-items:center;gap:10px">
      ${avatarImg(member, '36px')}
      <div><div style="font-weight:600">${member.name}</div><div style="font-size:12px;color:var(--text-tertiary)">${member.team}</div></div>
    </div>
    <table class="table">
      <thead><tr><th>日期</th><th>上班打卡</th><th>下班打卡</th><th>状态</th></tr></thead>
      <tbody>
        ${records.map(r => `<tr>
          <td>${r.date}</td>
          <td class="punch-time">${r.in}</td>
          <td class="punch-time">${r.out}</td>
          <td><span class="punch-status-${r.status}">${r.status === 'normal' ? '正常' : r.status === 'late' ? '迟到' : '早退'}</span></td>
        </tr>`).join('')}
      </tbody>
    </table>
  `;
  openModal(`打卡记录 - ${member.name}`, content, `<button class="btn btn-default" onclick="closeModal()">关闭</button>`);
}

function showLeaveApply(memberId) {
  const member = getMemberById(memberId);
  const firstLt = LEAVE_TYPES[0] || {};
  const content = `
    <div style="margin-bottom:16px;display:flex;align-items:center;gap:10px">
      ${avatarImg(member, '36px')}
      <div><div style="font-weight:600">${member.name}</div><div style="font-size:12px;color:var(--text-tertiary)">${member.team}</div></div>
    </div>
    <div class="form-group">
      <label class="form-label required">请假类型</label>
      <select class="form-control" id="leaveTypeSelect" onchange="updateLeaveDurationHint(this)">
        ${LEAVE_TYPES.map(lt => `<option value="${lt.id}" data-duration="${lt.duration || 1}">${lt.name}（${lt.duration === 0.5 ? '半天' : '全天'}）</option>`).join('')}
      </select>
      <div id="leaveDurationHint" style="font-size:12px;color:var(--text-tertiary);margin-top:4px">此类型请假默认时长：<strong id="leaveDurationVal">${firstLt.duration === 0.5 ? '半天（0.5天）' : '全天（1天）'}</strong></div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label required">开始日期</label>
        <input type="date" class="form-control" id="leaveStart">
      </div>
      <div class="form-group">
        <label class="form-label required">结束日期</label>
        <input type="date" class="form-control" id="leaveEnd">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">请假原因</label>
      <textarea class="form-control" id="leaveReason" rows="3" placeholder="请输入请假原因"></textarea>
    </div>
    <div class="alert-banner alert-info">ℹ️ 请假申请提交后需负责人审批，审批通过后自动更新排班日历</div>
  `;
  openModal(`请假申请 - ${member.name}`, content, `
    <button class="btn btn-default" onclick="closeModal()">取消</button>
    <button class="btn btn-primary" onclick="submitLeaveApply(${memberId})">提交申请</button>
  `);
}

function updateLeaveDurationHint(selectEl) {
  const opt = selectEl.options[selectEl.selectedIndex];
  const duration = parseFloat(opt.dataset.duration || '1');
  const hint = document.getElementById('leaveDurationVal');
  if (hint) hint.textContent = duration === 0.5 ? '半天（0.5天）' : '全天（1天）';
}

function submitLeaveApply(memberId) {
  const member = getMemberById(memberId);
  const typeSelect = document.getElementById('leaveTypeSelect');
  const leaveStart = document.getElementById('leaveStart')?.value;
  const leaveEnd = document.getElementById('leaveEnd')?.value;
  const reason = document.getElementById('leaveReason')?.value?.trim();

  const ltId = typeSelect ? typeSelect.value : (LEAVE_TYPES[0]?.id || 'annual');
  const lt = LEAVE_TYPES.find(t => t.id === ltId) || LEAVE_TYPES[0];
  const ltName = lt ? lt.name : '请假';
  const duration = lt ? (lt.duration || 1) : 1;
  const durationLabel = duration === 0.5 ? '半天' : '全天';

  let contentStr = `${ltName}（${durationLabel}）`;
  if (leaveStart && leaveEnd) contentStr += ` ${leaveStart} 至 ${leaveEnd}`;
  else if (leaveStart) contentStr += ` ${leaveStart}`;
  if (reason) contentStr += `，原因：${reason}`;

  closeModal();
  showToast(`${member.name} 的请假申请已提交，等待审批`, 'success');
  addWorkLog('考勤系统', '请假申请', `${member.name} 提交${ltName}申请（${durationLabel}）`);
  APPROVAL_RECORDS.unshift({
    id: 'leave_' + Date.now(), type: 'leave',
    applicant: member.name, applicantId: memberId, team: member.team,
    content: contentStr,
    leaveTypeId: ltId, duration,
    submittedAt: formatDate(new Date(), 'YYYY-MM-DD HH:mm'),
    status: 'pending',
    context: { recentAttendance: '本月出勤18天', teamOnDuty: '当日在岗10人', efficiency: `${member.efficiency}/天` }
  });
  saveApprovalRecords();
  updateBadges();
}

// 导出考勤报表（CSV格式）
function exportAttendanceReport() {
  const members = MEMBERS_DATA.filter(m => !m.excludeFromSchedule);
  const teamFilter = document.getElementById('attTeamFilter')?.value || 'all';
  const filtered = teamFilter === 'all' ? members : members.filter(m => m.team === teamFilter);

  const headers = ['姓名', 'MIS号', '团队', '今日班次', '出勤天数', '请假天数', '三薪天数'];
  const rows = filtered.map(m => {
    const stats = ATTENDANCE_STATS[m.id] || {};
    const todayShift = getMemberShift(m.id, new Date().getDate());
    const shiftInfo = getShiftDisplayInfo(todayShift);
    return [
      m.name, m.mis, m.team, shiftInfo.name,
      stats.workDays || 0, stats.leaveDays || 0,
      stats.triplePayDays || 0
    ];
  });

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${cell}"`).join(','))
    .join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `考勤报表_${scheduleYear}年${scheduleMonth}月_${formatDate(new Date())}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  addWorkLog('考勤系统', '数据导出', `导出${scheduleYear}年${scheduleMonth}月考勤报表（${filtered.length}人）`);
  showToast(`考勤报表已导出（${filtered.length}人）`, 'success');
}

// ===== 排班数据弹窗：各团队在班详情（两列并排）=====
// r84: 使用 _allStatTeams（含自定义日历卡片团队）替代硬编码 TEAMS
function showOndutyStatDetail() {
  const today = new Date();
  // r81: 使用月历缓存
  const cal = _ensureMonthCalendar(scheduleYear, scheduleMonth);
  const daysInMonth = cal.daysInMonth;
  const isCurrentMonth = (today.getFullYear() === scheduleYear && today.getMonth() + 1 === scheduleMonth);
  const dateLabel = isCurrentMonth ? today.getDate() + '日（今日）' : scheduleMonth + '月整月';

  // r84: 动态获取所有团队（内置 + 自定义，排除隐藏）
  const _hiddenStatTeams = CUSTOM_CALENDARS.filter(function(c) { return c.builtinTeam && c.hidden; }).map(function(c) { return c.builtinTeam; });
  const _statTeams = TEAMS.filter(function(t) { return !_hiddenStatTeams.includes(t); }).concat(
    CUSTOM_CALENDARS.filter(function(c) { return !c.builtinTeam; }).map(function(c) { return c.name; })
  );

  // 构建各团队详情
  const teamDetails = _statTeams.map(function(team) {
    const members = _getTeamMembers(team);
    const rows = members.map(function(m) {
      const sv = isCurrentMonth ? getMemberShift(m.id, today.getDate()) : null;
      // 统计整月各班次天数
      const shiftCounts = {};
      for (let d = 1; d <= daysInMonth; d++) {
        const s = getMemberShift(m.id, d);
        if (s && s !== _SHIFT_OFF) shiftCounts[s] = (shiftCounts[s] || 0) + 1;
      }
      return { name: m.name, todayShift: sv, shiftCounts: shiftCounts };
    });

    // 今日在班人数
    const ondutyToday = isCurrentMonth ? rows.filter(function(r) {
      return r.todayShift && r.todayShift !== _SHIFT_OFF && !isLeaveShift(r.todayShift) && SHIFTS[r.todayShift];
    }).length : null;

    // 按班次分组（ABC排序，休假排最后）
    const shiftOrder = Object.keys(SHIFTS).filter(function(k) { return k !== _SHIFT_OFF; });
    const grouped = {};
    shiftOrder.forEach(function(k) { grouped[k] = []; });
    grouped['LEAVE'] = [];

    rows.forEach(function(r) {
      const sv = isCurrentMonth ? r.todayShift : null;
      if (!isCurrentMonth) {
        // 非当月：按整月主要班次分组
        const mainShift = Object.entries(r.shiftCounts).sort(function(a,b){return b[1]-a[1];})[0];
        const key = mainShift ? mainShift[0] : _SHIFT_OFF;
        if (isLeaveShift(key)) { grouped['LEAVE'].push(r); }
        else if (grouped[key]) { grouped[key].push(r); }
        else { grouped['LEAVE'].push(r); }
      } else {
        if (!sv || sv === _SHIFT_OFF) return;
        if (isLeaveShift(sv)) { grouped['LEAVE'].push(r); }
        else if (grouped[sv]) { grouped[sv].push(r); }
      }
    });

    return { team: team, ondutyToday: ondutyToday, grouped: grouped, total: members.length };
  });

  // 渲染四列等宽（增强版）
  function renderTeamBlock(td) {
    const shiftOrder = Object.keys(SHIFTS).filter(function(k) { return k !== _SHIFT_OFF; });
    let rows = '';
    shiftOrder.forEach(function(k) {
      const people = td.grouped[k] || [];
      if (people.length === 0) return;
      const shiftInfo = SHIFTS[k];
      const timeStr = shiftInfo && shiftInfo.start && shiftInfo.end
        ? '<span style="font-size:11px;color:#999;font-weight:400;margin-left:3px">' + shiftInfo.start + '–' + shiftInfo.end + '</span>' : '';
      rows += '<div style="margin-bottom:10px">'
        + '<div style="font-size:12px;font-weight:700;color:#444;margin-bottom:5px;display:flex;align-items:center;gap:5px;padding-bottom:4px;border-bottom:1px solid rgba(0,0,0,0.06)">'
        + '<div class="shift-cell ' + (shiftInfo ? shiftInfo.color : '') + '" style="width:20px;height:20px;border-radius:5px;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0">' + k + '</div>'
        + '<span style="font-size:12.5px;font-weight:700">' + (shiftInfo ? shiftInfo.name : k) + '</span>' + timeStr
        + '<span style="margin-left:auto;font-size:11px;color:#86909C;font-weight:500">' + people.length + '人</span>'
        + '</div>'
        + '<div style="display:flex;flex-wrap:wrap;gap:4px">'
        + people.map(function(p) {
            return '<span style="font-size:12.5px;padding:2px 8px;background:#F2F3F5;border-radius:5px;color:#1d2129;font-weight:500">' + p.name + '</span>';
          }).join('')
        + '</div></div>';
    });
    // 休假
    const leavePeople = td.grouped['LEAVE'] || [];
    if (leavePeople.length > 0) {
      rows += '<div style="margin-bottom:10px">'
        + '<div style="font-size:12px;font-weight:700;color:#D46B08;margin-bottom:5px;display:flex;align-items:center;gap:5px;padding-bottom:4px;border-bottom:1px solid rgba(212,107,8,0.12)">'
        + '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="flex-shrink:0"><path d="M8 2a6 6 0 100 12A6 6 0 008 2z" stroke="#D46B08" stroke-width="1.4"/><path d="M8 5v3.5l2 1.5" stroke="#D46B08" stroke-width="1.4" stroke-linecap="round"/></svg>'
        + '<span>休假中</span>'
        + '<span style="margin-left:auto;font-size:11px;color:#D46B08;font-weight:500">' + leavePeople.length + '人</span>'
        + '</div>'
        + '<div style="display:flex;flex-wrap:wrap;gap:4px">'
        + leavePeople.map(function(p) {
            return '<span style="font-size:12.5px;padding:2px 8px;background:#FFF7E6;border-radius:5px;color:#D46B08;font-weight:500">' + p.name + '</span>';
          }).join('')
        + '</div></div>';
    }
    const ondutyRate = td.total > 0 && td.ondutyToday !== null ? Math.round(td.ondutyToday / td.total * 100) : null;
    const rateColor = ondutyRate !== null ? (ondutyRate >= 80 ? '#00B42A' : ondutyRate >= 50 ? '#FF9500' : '#F53F3F') : '#86909C';
    const ondutyStr = isCurrentMonth && td.ondutyToday !== null
      ? '<div style="display:flex;align-items:center;gap:6px">'
        + '<span style="font-size:20px;font-weight:800;color:' + rateColor + ';line-height:1">' + td.ondutyToday + '</span>'
        + '<span style="font-size:13px;color:#86909C">/ ' + td.total + ' 人</span>'
        + '<span style="font-size:11px;font-weight:700;color:' + rateColor + ';background:' + rateColor + '18;padding:1px 6px;border-radius:4px;margin-left:2px">' + ondutyRate + '%</span>'
        + '</div>'
      : '<span style="font-size:14px;color:#86909C;font-weight:600">' + td.total + ' 人</span>';
    return '<div style="background:#fff;border:1px solid #E5E8EF;border-radius:10px;padding:14px 14px 10px;box-shadow:0 1px 4px rgba(0,0,0,0.04)">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding-bottom:10px;border-bottom:2px solid #F2F3F5">'
      + '<div style="display:flex;align-items:center;gap:7px">'
      + '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="6" cy="5" r="2.5" stroke="#1664FF" stroke-width="1.4"/><circle cx="11" cy="5" r="2" stroke="#1664FF" stroke-width="1.3" opacity="0.5"/><path d="M1.5 13c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" stroke="#1664FF" stroke-width="1.4" stroke-linecap="round"/><path d="M12 9c1.5.5 2.5 1.8 2.5 4" stroke="#1664FF" stroke-width="1.3" stroke-linecap="round" opacity="0.5"/></svg>'
      + '<span style="font-size:15px;font-weight:800;color:#1d2129">' + td.team + '</span>'
      + '</div>'
      + ondutyStr
      + '</div>'
      + (rows || '<div style="font-size:13px;color:#86909C;text-align:center;padding:16px 0;display:flex;flex-direction:column;align-items:center;gap:6px"><svg width="28" height="28" viewBox="0 0 28 28" fill="none" style="opacity:0.3"><rect x="3" y="5" width="22" height="18" rx="3" stroke="currentColor" stroke-width="1.6"/><path d="M8 11h12M8 15h7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>暂无排班数据</div>')
      + '</div>';
  }

  // r84: 动态列数——根据实际团队数量自适应（2-4列），弹窗宽度也自适应
  // 按自定义顺序排列团队
  var _orderedTeamNames = _sortTeamsByOrder(teamDetails.map(function(td) { return td.team; }));
  var _orderedDetails = _orderedTeamNames.map(function(name) {
    return teamDetails.find(function(td) { return td.team === name; });
  }).filter(Boolean);

  const teamCount = _orderedDetails.length;
  const gridCols = teamCount <= 2 ? teamCount : teamCount <= 4 ? Math.min(teamCount, 3) : Math.min(teamCount, 4);
  const modalWidth = gridCols <= 2 ? 560 : gridCols === 3 ? 780 : 960;

  // 拖拽排序栏：拖动团队标签调整顺序，前4个显示在卡片右侧
  var dragBar = '<div style="margin-bottom:14px;padding:10px 14px;background:#F7F8FA;border-radius:10px;border:1px solid #E5E8EF">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'
    + '<span style="font-size:12px;font-weight:700;color:#1d2129">拖拽调整团队顺序</span>'
    + '<span style="font-size:11px;color:#86909C">前 4 个团队将展示在卡片右侧</span>'
    + '</div>'
    + '<div id="sc5TeamDragWrap" style="display:flex;flex-wrap:wrap;gap:6px">'
    + _orderedDetails.map(function(td, i) {
        var highlight = i < 4 ? 'background:#3370FF;color:#fff;border-color:#3370FF' : 'background:#fff;color:#1d2129;border-color:#C9CDD4';
        return '<div class="sc5-drag-tag" draggable="true" data-team="' + td.team + '" style="padding:4px 12px;border-radius:6px;font-size:12px;font-weight:600;cursor:grab;border:1.5px solid;user-select:none;transition:all 0.15s;' + highlight + '">'
          + (i < 4 ? '<span style="font-size:10px;opacity:0.7;margin-right:3px">' + (i + 1) + '</span>' : '')
          + td.team + '</div>';
      }).join('')
    + '</div></div>';

  const content = dragBar
    + '<div style="display:grid;grid-template-columns:repeat(' + gridCols + ',1fr);gap:14px;align-items:start">'
    + _orderedDetails.map(renderTeamBlock).join('')
    + '</div>';

  openModal(
    scheduleYear + '年' + scheduleMonth + '月 排班数据 · ' + dateLabel,
    content,
    '<button class="btn btn-default" onclick="closeModal()">关闭</button>',
    modalWidth
  );

  // 绑定拖拽事件
  _initTeamDragSort('sc5TeamDragWrap', function() {
    // 拖拽完成后刷新卡片
    if (typeof _refreshCardStats === 'function') _refreshCardStats();
  });
}

// ===== 在班天数下拉详情面板 =====
function toggleOndutyDetail(e) {
  e.stopPropagation();
  const panel = document.getElementById('ondutyDetailPanel');
  if (!panel) return;
  const isOpen = panel.style.display !== 'none';
  if (isOpen) {
    panel.style.display = 'none';
    return;
  }
  // 先显示以获取尺寸
  panel.style.display = 'block';
  // 定位到触发卡片下方
  const card = e.currentTarget || e.target.closest('.sch-hcard-onduty');
  if (card) {
    const rect = card.getBoundingClientRect();
    const panelW = 260;
    let left = rect.left;
    // 防止超出右边界
    if (left + panelW > window.innerWidth - 8) left = window.innerWidth - panelW - 8;
    panel.style.left = left + 'px';
    panel.style.top  = (rect.bottom + 6) + 'px';
    panel.style.width = panelW + 'px';
  }
  // 点击其他地方关闭
  setTimeout(function() {
    document.addEventListener('click', function closePanel(ev) {
      if (!panel.contains(ev.target)) {
        panel.style.display = 'none';
        document.removeEventListener('click', closePanel);
      }
    });
  }, 0);
}

// ===== 排班规则编辑弹窗 =====
function showEditRulesModal() {
  const savedRules = (function() {
    try { return typeof _storageGetRaw === 'function' ? JSON.parse(_storageGetRaw('glxt_schedule_rules') || 'null') : SCHEDULE_RULES; } catch(e) { return null; }
  })();
  // 兜底：savedRules 为 null 或空对象（缺少关键字段）时使用默认值
  const rules = (savedRules && savedRules.minOndutyPerDay != null)
    ? savedRules
    : { minOndutyPerDay: 5, maxConsecutiveDays: 6 };
  const weekendExempt = rules.weekendExempt !== undefined ? rules.weekendExempt : true;

  // r81: 计算本月双休日数量（使用月历缓存）
  const _calRules = _ensureMonthCalendar(scheduleYear, scheduleMonth);
  const _daysInMonth = _calRules.daysInMonth;
  const _weekendCount = _calRules.days.filter(d => d.isWeekend).length;

  // 获取当前所有班次 key（排除 OFF）
  const shiftKeys = Object.keys(SHIFTS).filter(k => k !== _SHIFT_OFF);

  // 各团队规则块（内置团队 + 自定义日历卡片）
  const _hiddenRuleTeams = CUSTOM_CALENDARS.filter(c => c.builtinTeam && c.hidden).map(c => c.builtinTeam);
  const _allRuleTeamNames = [...TEAMS.filter(t => !_hiddenRuleTeams.includes(t)), ...CUSTOM_CALENDARS.filter(c => !c.builtinTeam).map(c => c.name)];
  const teamsHtml = _allRuleTeamNames.map(function(team) {
    const teamRule = (rules.teamRules && rules.teamRules[team]) || {};
    const minOnduty = teamRule.minOndutyPerDay !== undefined ? teamRule.minOndutyPerDay : rules.minOndutyPerDay;
    const minTotal  = teamRule.minTotalPerMonth !== undefined ? teamRule.minTotalPerMonth : '';
    const teamWeekendExempt = teamRule.weekendExempt !== undefined ? teamRule.weekendExempt : weekendExempt;
    const tid = team.replace(/\s/g,'_');
    const isCustom = !TEAMS.includes(team);

    // 该团队各班次最少人数
    const shiftRowsHtml = shiftKeys.map(function(k) {
      const shiftInfo = SHIFTS[k];
      // r85: 团队级 shiftMin 优先，不再回退到已废弃的 rules.shiftMin
      const val = (teamRule.shiftMin && teamRule.shiftMin[k] !== undefined) ? teamRule.shiftMin[k] : 1;
      return `<div style="display:flex;align-items:center;gap:6px">
        <div class="shift-cell ${shiftInfo ? shiftInfo.color : ''}" style="width:22px;height:22px;border-radius:5px;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${k}</div>
        <span style="font-size:12px;color:#555;min-width:28px">${shiftInfo ? shiftInfo.name : k}</span>
        <input type="number" class="form-control" id="ruleTeamShift_${tid}_${k}" min="0" max="30" value="${val}" style="width:52px;text-align:center;height:28px;font-size:12px">
        <span style="font-size:11px;color:#999">人</span>
      </div>`;
    }).join('');

    return `<div class="rule-team-card" id="ruleTeamCard_${tid}">
      <div class="rule-team-card-header" onclick="_toggleRuleTeam('${tid}')">
        <div style="display:flex;align-items:center;gap:8px">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="6" cy="5" r="2.5" stroke="currentColor" stroke-width="1.4"/><circle cx="11" cy="5" r="2" stroke="currentColor" stroke-width="1.3" opacity="0.6"/><path d="M1.5 13c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M12 9c1.5.5 2.5 1.8 2.5 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity="0.6"/></svg>
          <span style="font-size:13px;font-weight:700;color:#1d2129">${team}</span>
          ${isCustom ? '<span style="font-size:10px;color:#00B42A;background:#E8F7E8;padding:1px 6px;border-radius:4px;margin-left:4px">自定义</span>' : ''}
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:11px;color:#86909C">每日≥${minOnduty}人</span>
          <svg class="rule-team-chevron" id="ruleChevron_${tid}" width="12" height="12" viewBox="0 0 12 12" fill="none" style="transition:transform 0.2s;transform:rotate(0deg)"><path d="M3 4.5l3 3 3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
      </div>
      <div class="rule-team-card-body" id="ruleTeamBody_${tid}" style="display:none">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;margin-bottom:10px">
          <div>
            <div style="font-size:11px;color:#86909C;margin-bottom:4px;font-weight:600">每日最少在班人数</div>
            <div style="display:flex;align-items:center;gap:6px">
              <input type="number" class="form-control" id="ruleMin_${tid}" min="0" max="50" value="${minOnduty}" style="width:64px;text-align:center;height:30px">
              <span style="font-size:12px;color:#999">人/天</span>
            </div>
          </div>
          <div>
            <div style="font-size:11px;color:#86909C;margin-bottom:4px;font-weight:600">月总在班最少天数</div>
            <div style="display:flex;align-items:center;gap:6px">
              <input type="number" class="form-control" id="ruleTotalMin_${tid}" min="0" max="31" value="${minTotal}" placeholder="不限" style="width:64px;text-align:center;height:30px">
              <span style="font-size:12px;color:#999">天/月</span>
            </div>
          </div>
        </div>
        <div style="margin-bottom:10px">
          <div style="font-size:11px;color:#86909C;margin-bottom:6px;font-weight:600">各班次最少人数</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">${shiftRowsHtml}</div>
        </div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 8px;background:#F7F8FA;border-radius:6px;margin-bottom:8px">
          <input type="checkbox" id="ruleWeekend_${tid}" ${teamWeekendExempt ? 'checked' : ''} style="width:14px;height:14px;cursor:pointer">
          <div>
            <div style="font-size:12px;font-weight:600;color:#1d2129">双休日豁免</div>
            <div style="font-size:11px;color:#86909C;margin-top:1px">勾选后，双休日无人在班不触发预警</div>
          </div>
        </label>
        <button onclick="_clearTeamRule('${tid}')" style="font-size:11px;color:#F53F3F;background:#FFF2F0;border:1px solid #FFCCC7;border-radius:5px;padding:3px 10px;cursor:pointer;width:100%;line-height:1.6">
          🗑 一键清空该团队所有条件
        </button>
      </div>
    </div>`;
  }).join('');

  const content = `
    <div class="rule-modal-banner">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zm0 3v3.5M8 11v.5" stroke="#1664FF" stroke-width="1.4" stroke-linecap="round"/></svg>
      <div>
        <div style="font-weight:600;color:#1664FF">排班规则配置</div>
        <div style="font-size:11.5px;color:#86909C;margin-top:1px">低于阈值时规则验证卡片将显示预警，点击卡片可查看详情</div>
      </div>
    </div>

    <div class="rule-section">
      <div class="rule-section-title">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="#1664FF" stroke-width="1.3"/><path d="M7 4.5v3l1.5 1" stroke="#1664FF" stroke-width="1.3" stroke-linecap="round"/></svg>
        全局规则
      </div>
      <div class="rule-row">
        <div class="rule-row-label">
          <span class="rule-row-icon" style="background:#FFF7E6;color:#FA8C16">📅</span>
          <div>
            <div class="rule-row-name">最大连续排班天数</div>
            <div class="rule-row-desc">超过此值显示警告</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <input type="number" class="form-control" id="ruleMaxConsecutive" min="1" max="31" value="${rules.maxConsecutiveDays}" style="width:64px;text-align:center;height:30px">
          <span style="font-size:12px;color:#999">天</span>
        </div>
      </div>
      <div class="rule-row" style="margin-top:6px">
        <div class="rule-row-label">
          <span class="rule-row-icon" style="background:#E8F3FF;color:#1664FF">👥</span>
          <div>
            <div class="rule-row-name">全局每日最少在班（兜底）</div>
            <div class="rule-row-desc">各团队未单独设置时使用此值</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <input type="number" class="form-control" id="ruleGlobalMin" min="1" max="50" value="${rules.minOndutyPerDay}" style="width:64px;text-align:center;height:30px">
          <span style="font-size:12px;color:#999">人/天</span>
        </div>
      </div>
      <!-- 双休豁免可视化提示 -->
      <div style="margin-top:10px;padding:8px 12px;background:#F0F9FF;border-radius:7px;border:1px solid #BAE0FF;display:flex;align-items:center;gap:8px">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="11" rx="2" stroke="#1664FF" stroke-width="1.4"/><path d="M5 1v3M11 1v3M2 7h12" stroke="#1664FF" stroke-width="1.4" stroke-linecap="round"/><circle cx="5.5" cy="11" r="1" fill="#1664FF"/><circle cx="10.5" cy="11" r="1" fill="#1664FF"/></svg>
        <span style="font-size:12px;color:#1664FF;font-weight:600">${scheduleYear}年${scheduleMonth}月</span>
        <span style="font-size:12px;color:#4E6EF2">共 <b>${_weekendCount}</b> 个双休日</span>
        <span style="font-size:11px;color:#86909C;margin-left:2px">— 各团队开启豁免后，这些天不触发在班预警</span>
      </div>
    </div>

    <div class="rule-section">
      <div class="rule-section-title" style="display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:6px">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M7 2v10" stroke="#7B2FBE" stroke-width="1.3" stroke-linecap="round"/></svg>
          各团队规则（展开配置）
        </div>
        <button onclick="_applyGlobalRuleToAllTeams()" style="font-size:11px;color:#7B2FBE;background:#F5EDFF;border:1px solid #D3ADF7;border-radius:5px;padding:2px 8px;cursor:pointer;white-space:nowrap;line-height:1.6" title="将全局每日最少在班人数应用到所有团队">
          ↓ 一键应用全局值
        </button>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">${teamsHtml}</div>
    </div>

    <!-- 预览影响 -->
    <div id="rulePreviewBar" style="margin-top:10px;padding:9px 12px;background:#FAFAFA;border-radius:7px;border:1px solid #E5E6EB;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span style="font-size:11.5px;color:#86909C;font-weight:600;flex-shrink:0">预览影响：</span>
      <span id="rulePreviewContent" style="font-size:12px;color:#86909C">调整规则后自动更新</span>
    </div>
  `;

  openModal(
    '排班规则配置',
    content,
    `<button class="btn btn-default" onclick="closeModal()">取消</button>
     <button class="btn btn-primary" onclick="saveScheduleRules()">保存规则</button>`,
    580
  );
  // 弹窗渲染完成后绑定实时预览
  setTimeout(_bindRulePreview, 80);
}

// ===== 规则弹窗辅助函数 =====

// 绑定实时预览：监听弹窗内所有 input/checkbox 变化
function _bindRulePreview() {
  const modal = document.querySelector('.modal-body');
  if (!modal) return;
  _updateRulePreview(); // 初始渲染
  modal.addEventListener('input', _updateRulePreview);
  modal.addEventListener('change', _updateRulePreview);
}

// 更新预览影响区域
function _updateRulePreview() {
  const el = document.getElementById('rulePreviewContent');
  if (!el) return;
  const result = _calcPreviewImpact();
  if (result === null) {
    el.innerHTML = '<span style="color:#86909C">暂无排班数据</span>';
    return;
  }
  const { danger, warning } = result;
  if (danger === 0 && warning === 0) {
    el.innerHTML = '<span style="color:#00B42A;font-weight:600">✓ 当前规则下无预警</span>';
  } else {
    const parts = [];
    if (danger > 0) parts.push(`<span style="color:#F53F3F;font-weight:700">🔴 严重 ${danger} 条</span>`);
    if (warning > 0) parts.push(`<span style="color:#FF7D00;font-weight:600">⚠️ 警告 ${warning} 条</span>`);
    el.innerHTML = parts.join('<span style="color:#C9CDD4;margin:0 4px">|</span>') +
      '<span style="font-size:11px;color:#86909C;margin-left:6px">（基于当前月份排班数据）</span>';
  }
}

// 基于弹窗当前 input 值模拟计算 danger/warning 数量
function _calcPreviewImpact() {
  if (!MEMBERS_DATA || !MEMBERS_DATA.length) return null;
  const daysInMonth = new Date(scheduleYear, scheduleMonth, 0).getDate();
  // 读取弹窗当前值
  const gMinRaw = parseInt(document.getElementById('ruleGlobalMin')?.value, 10);
  const maxConsecRaw = parseInt(document.getElementById('ruleMaxConsecutive')?.value, 10);
  const globalMin = isNaN(gMinRaw) ? 5 : gMinRaw;
  const maxConsecLimit = isNaN(maxConsecRaw) ? 6 : maxConsecRaw;
  // 读取各团队当前值
  function getTeamPreviewRule(team) {
    const tid = team.replace(/\s/g,'_');
    const minEl = document.getElementById('ruleMin_' + tid);
    const weekendEl = document.getElementById('ruleWeekend_' + tid);
    const minVal = minEl ? parseInt(minEl.value, 10) : NaN;
    return {
      minOndutyPerDay: isNaN(minVal) ? globalMin : minVal,
      weekendExempt: weekendEl ? weekendEl.checked : true
    };
  }
  function isWeekend(day) {
    return new Date(scheduleYear, scheduleMonth - 1, day).getDay() % 6 === 0;
  }
  let danger = 0, warning = 0;
  // ① 连续排班
  MEMBERS_DATA.forEach(function(m) {
    if (m.role === 'leader') return;
    let consec = 0, maxC = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const s = getMemberShift(m.id, d);
      if (s && s !== _SHIFT_OFF && !isLeaveShift(s)) { consec++; maxC = Math.max(maxC, consec); }
      else consec = 0;
    }
    if (maxC > maxConsecLimit) warning++;
  });
  // r81: _previewGetMembers → 模块级 _getTeamMembers
  // ② 每日在班人数（含自定义日历卡片）
  const _hiddenPreview = CUSTOM_CALENDARS.filter(function(c) { return c.builtinTeam && c.hidden; }).map(function(c) { return c.builtinTeam; });
  const _previewAllTeams = [...TEAMS.filter(function(t) { return !_hiddenPreview.includes(t); }), ...CUSTOM_CALENDARS.filter(function(c) { return !c.builtinTeam; }).map(function(c) { return c.name; })];
  _previewAllTeams.forEach(function(team) {
    const tr = getTeamPreviewRule(team);
    const minOnduty = tr.minOndutyPerDay;
    if (minOnduty <= 0) return;
    const members = _getTeamMembers(team);
    for (let d = 1; d <= daysInMonth; d++) {
      if (tr.weekendExempt && isWeekend(d)) continue;
      const onduty = members.filter(function(m) {
        const s = getMemberShift(m.id, d);
        return s && s !== _SHIFT_OFF && !isLeaveShift(s) && SHIFTS[s];
      }).length;
      if (onduty < minOnduty) danger++;
    }
  });
  return { danger, warning };
}

// 一键将全局每日最少在班人数应用到所有团队（含自定义日历卡片）
function _applyGlobalRuleToAllTeams() {
  const gMinRaw = parseInt(document.getElementById('ruleGlobalMin')?.value, 10);
  const globalMin = isNaN(gMinRaw) ? 5 : gMinRaw;
  const _hiddenApply = CUSTOM_CALENDARS.filter(c => c.builtinTeam && c.hidden).map(c => c.builtinTeam);
  const _allTeams = [...TEAMS.filter(t => !_hiddenApply.includes(t)), ...CUSTOM_CALENDARS.filter(c => !c.builtinTeam).map(c => c.name)];
  _allTeams.forEach(function(team) {
    const tid = team.replace(/\s/g,'_');
    const minEl = document.getElementById('ruleMin_' + tid);
    if (minEl) minEl.value = globalMin;
  });
  _updateRulePreview();
  showToast(`已将 ${globalMin} 人/天 应用到全部 ${_allTeams.length} 个团队`, 'success');
}

// 展开/收起团队规则卡片
function _toggleRuleTeam(tid) {
  const body = document.getElementById('ruleTeamBody_' + tid);
  const chevron = document.getElementById('ruleChevron_' + tid);
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (chevron) chevron.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
}

// 一键清空某团队所有规则条件
function _clearTeamRule(tid) {
  const minEl = document.getElementById('ruleMin_' + tid);
  const totalEl = document.getElementById('ruleTotalMin_' + tid);
  const weekendEl = document.getElementById('ruleWeekend_' + tid);
  if (minEl) minEl.value = 0;
  if (totalEl) totalEl.value = '';
  if (weekendEl) weekendEl.checked = false;
  // 清空各班次最少人数
  const shiftKeys = Object.keys(SHIFTS).filter(k => k !== _SHIFT_OFF);
  shiftKeys.forEach(function(k) {
    const el = document.getElementById('ruleTeamShift_' + tid + '_' + k);
    if (el) el.value = 0;
  });
  _updateRulePreview();
  showToast('已清空该团队所有条件', 'success');
}

function saveScheduleRules() {
  const _gMinRaw = parseInt(document.getElementById('ruleGlobalMin')?.value, 10);
  const _maxRaw  = parseInt(document.getElementById('ruleMaxConsecutive')?.value, 10);
  const globalMin     = isNaN(_gMinRaw) ? 5 : _gMinRaw;
  const maxConsecutive = isNaN(_maxRaw)  ? 6 : _maxRaw;
  const shiftKeys = Object.keys(SHIFTS).filter(k => k !== _SHIFT_OFF);
  const teamRules = {};
  // 收集所有团队的规则（内置 + 自定义日历卡片，排除已隐藏团队）
  const _hiddenSave = CUSTOM_CALENDARS.filter(c => c.builtinTeam && c.hidden).map(c => c.builtinTeam);
  const _allRuleTeams = [...TEAMS.filter(t => !_hiddenSave.includes(t)), ...CUSTOM_CALENDARS.filter(c => !c.builtinTeam).map(c => c.name)];
  _allRuleTeams.forEach(function(team) {
    const tid = team.replace(/\s/g,'_');
    const minEl = document.getElementById('ruleMin_' + tid);
    const totalEl = document.getElementById('ruleTotalMin_' + tid);
    const weekendEl = document.getElementById('ruleWeekend_' + tid);
    // 如果 DOM 元素不存在（弹窗已关闭等情况），跳过
    if (!minEl && !totalEl && !weekendEl) return;
    const teamRule = {};
    if (minEl) { const v = parseInt(minEl.value, 10); if (!isNaN(v)) teamRule.minOndutyPerDay = v; }
    if (totalEl && totalEl.value !== '') { const v = parseInt(totalEl.value, 10); if (!isNaN(v)) teamRule.minTotalPerMonth = v; }
    if (weekendEl) teamRule.weekendExempt = weekendEl.checked;
    // 各班次最少人数
    const shiftMin = {};
    shiftKeys.forEach(function(k) {
      const el = document.getElementById('ruleTeamShift_' + tid + '_' + k);
      if (el) { const v = parseInt(el.value, 10); if (!isNaN(v)) shiftMin[k] = v; }
    });
    if (Object.keys(shiftMin).length > 0) teamRule.shiftMin = shiftMin;
    teamRules[team] = teamRule;
  });
  // 清除可能存在的脏数据（空对象 {}）
  try {
    const _existing = typeof _storageGetRaw === 'function' ? JSON.parse(_storageGetRaw('glxt_schedule_rules') || 'null') : null;
    if (_existing && typeof _existing === 'object' && Object.keys(_existing).length === 0) {
      if (typeof _storageDel === 'function') _storageDel('glxt_schedule_rules');
    }
  } catch(e) { /* ignore */ }
  const rules = {
    minOndutyPerDay: globalMin,
    maxConsecutiveDays: maxConsecutive,
    teamRules: teamRules
  };
  // ③ 修复：同步更新内存中的 SCHEDULE_RULES 对象，防止刷新后规则恢复初始值
  // storage.js 的 initStorage 会从 SCHEDULE_RULES 对象恢复，必须保持两者一致
  Object.keys(SCHEDULE_RULES).forEach(k => delete SCHEDULE_RULES[k]);
  Object.assign(SCHEDULE_RULES, rules);
  saveScheduleRules();
  addWorkLog('考勤系统', '规则修改', `更新排班规则：全局最少${globalMin}人/天，最大连续${maxConsecutive}天`);
  closeModal();
  showToast('排班规则已保存', 'success');
  renderSchedulePage(document.getElementById('contentArea'));
}

// ===== r95: 排班导出（增强版 — 范围选择 + 自定义列 + 水印） =====
let _exportColumns = {}; // { colKey: true/false }

function exportScheduleCSV() {
  const hasXLSX = typeof XLSX !== 'undefined';
  const { statHeaders } = _buildStatHeaders();
  const daysInMonth = new Date(scheduleYear, scheduleMonth, 0).getDate();
  const teams = [...new Set(MEMBERS_DATA.filter(m => !m.excludeFromSchedule).map(m => m.team).filter(Boolean))];

  // 初始化列选择（默认全选）
  _exportColumns = { name: true, team: true, days: true };
  statHeaders.forEach(h => { _exportColumns['stat_' + (h.key || h.label)] = true; });

  let teamCheckboxes = teams.map(t =>
    `<label class="export-columns-item"><input type="checkbox" checked data-export-team="${t}" style="width:13px;height:13px;accent-color:var(--primary)"> ${t}</label>`
  ).join('');

  let statCheckboxes = statHeaders.map(h => {
    const key = 'stat_' + (h.key || h.label);
    const label = h.isShift ? (SHIFTS[h.key]?.name || h.label) + '(天)' : h.isTotal ? '合计在班(天)' : h.isLeave ? h.label + '(天)' : h.isOff ? '休息(天)' : h.isHours ? '工时(h)' : h.label;
    return `<label class="export-columns-item"><input type="checkbox" checked data-export-col="${key}" style="width:13px;height:13px;accent-color:var(--primary)"> ${label}</label>`;
  }).join('');

  const content = `
    <div class="export-modal-wrap">
      <div class="export-section">
        <div class="export-section-title">导出范围</div>
        <div class="export-range-row">
          <div class="export-range-field">
            <label class="export-range-label">月份</label>
            <input type="month" id="exportMonth" class="form-control" value="${scheduleYear}-${String(scheduleMonth).padStart(2,'0')}" style="border-radius:8px;padding:6px 10px;font-size:13px">
          </div>
          <div class="export-range-field">
            <label class="export-range-label">团队筛选</label>
            <div class="export-team-checks">${teamCheckboxes || '<span style="color:#86909C;font-size:12px">无团队数据</span>'}</div>
          </div>
        </div>
      </div>
      <div class="export-section">
        <div class="export-section-title">自定义列 <button class="export-col-toggle" onclick="_exportToggleAllCols()">全选/反选</button></div>
        <div class="export-columns-grid">${statCheckboxes}</div>
      </div>
      <div class="export-section">
        <div class="export-section-title">导出格式</div>
        <div class="export-format-options">
          <label class="export-format-option${hasXLSX ? ' selected' : ''}" id="exportOptXlsx">
            <input type="radio" name="exportFmt" value="xlsx" ${hasXLSX ? 'checked' : 'disabled'}>
            <div class="export-format-icon" style="background:#E8F5E9;color:#2E7D32">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" stroke-width="1.5"/><path d="M14 2v6h6" stroke="currentColor" stroke-width="1.5"/><path d="M8 13l3 4M11 13l-3 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            </div>
            <div>
              <div class="export-format-name">Excel (.xlsx)</div>
              <div class="export-format-desc">${hasXLSX ? '推荐，含格式' : '未加载，刷新可用'}</div>
            </div>
          </label>
          <label class="export-format-option${!hasXLSX ? ' selected' : ''}" id="exportOptCsv">
            <input type="radio" name="exportFmt" value="csv" ${!hasXLSX ? 'checked' : ''}>
            <div class="export-format-icon" style="background:#E3F2FD;color:#1565C0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" stroke-width="1.5"/><path d="M14 2v6h6" stroke="currentColor" stroke-width="1.5"/><path d="M8 13h8M8 17h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            </div>
            <div>
              <div class="export-format-name">CSV (.csv)</div>
              <div class="export-format-desc">通用格式</div>
            </div>
          </label>
        </div>
      </div>
      <div class="export-section">
        <label class="export-watermark-check"><input type="checkbox" id="exportWatermark" checked style="width:13px;height:13px;accent-color:var(--primary)"> 在文件名中添加时间戳水印</label>
      </div>
    </div>
  `;
  openModal('导出排班表', content, `
    <button class="btn btn-default" onclick="closeModal()">取消</button>
    <button class="btn btn-primary" onclick="_executeExport()">导出</button>
  `, 560);

  setTimeout(() => {
    document.querySelectorAll('.export-format-option input[name="exportFmt"]').forEach(radio => {
      radio.addEventListener('change', () => {
        document.querySelectorAll('.export-format-option').forEach(o => o.classList.remove('selected'));
        radio.closest('.export-format-option').classList.add('selected');
      });
    });
  }, 50);
}

function _exportToggleAllCols() {
  const checks = document.querySelectorAll('[data-export-col]');
  const allChecked = [...checks].every(c => c.checked);
  checks.forEach(c => { c.checked = !allChecked; });
}

function _executeExport() {
  // 导出前冲突校验
  const _preExportAnomalies = detectScheduleAnomalies();
  const _dangerCount = _preExportAnomalies.filter(a => a.level === 'danger').length;
  const _warnCount   = _preExportAnomalies.filter(a => a.level === 'warning').length;
  if (_dangerCount > 0 || _warnCount > 0) {
    const _msg = [
      _dangerCount > 0 ? `🔴 严重冲突 ${_dangerCount} 处` : '',
      _warnCount   > 0 ? `🟡 警告 ${_warnCount} 处` : '',
    ].filter(Boolean).join('，');
    if (!confirm(`当前排班存在 ${_msg}，是否仍然导出？`)) return;
  }

  const fmt = document.querySelector('input[name="exportFmt"]:checked')?.value || 'csv';
  const addWatermark = document.getElementById('exportWatermark')?.checked;

  // 读取导出月份
  const monthVal = document.getElementById('exportMonth')?.value;
  let exYear = scheduleYear, exMonth = scheduleMonth;
  if (monthVal) {
    const [yy, mm] = monthVal.split('-');
    exYear = parseInt(yy); exMonth = parseInt(mm);
  }
  const daysInMonth = new Date(exYear, exMonth, 0).getDate();

  // 读取团队筛选
  const teamChecks = document.querySelectorAll('[data-export-team]');
  const selectedTeams = new Set();
  teamChecks.forEach(c => { if (c.checked) selectedTeams.add(c.dataset.exportTeam); });

  // 读取目标月份数据
  const exKey = `glxt_schedule_${exYear}_${exMonth}`;
  const exData = _storageGet(exKey) || {};

  const members = MEMBERS_DATA.filter(m => !m.excludeFromSchedule && (selectedTeams.size === 0 || selectedTeams.has(m.team)));
  const shiftKeys = Object.keys(SHIFTS).filter(k => k !== _SHIFT_OFF);
  const { statHeaders } = _buildStatHeaders();

  // 读取列选择
  const colChecks = document.querySelectorAll('[data-export-col]');
  const enabledCols = new Set();
  colChecks.forEach(c => { if (c.checked) enabledCols.add(c.dataset.exportCol); });

  // 构建表头
  const filteredStatHeaders = statHeaders.filter(h => enabledCols.has('stat_' + (h.key || h.label)));
  const statHeaderLabels = filteredStatHeaders.map(h => {
    if (h.isShift) return `${SHIFTS[h.key]?.name || h.label}(天)`;
    if (h.isTotal) return '合计在班(天)';
    if (h.isLeave) return `${h.label}(天)`;
    if (h.isOff) return '休息(天)';
    if (h.isHours) return '工时(h)';
    return h.label;
  });
  const headerRow = ['姓名', '团队', ...Array.from({length: daysInMonth}, (_, i) => String(i + 1)), ...statHeaderLabels];

  const dataRows = members.map(m => {
    const shifts = [];
    const mStats = {};
    shiftKeys.forEach(k => { mStats[k] = 0; });
    LEAVE_TYPES.forEach(lt => { mStats['leave_' + lt.id] = 0; });
    mStats.off = 0;
    let totalWorkDays = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      // 从指定月份数据读取
      const s = (exData[m.id] && exData[m.id][String(d)]) || (exYear === scheduleYear && exMonth === scheduleMonth ? getMemberShift(m.id, d) : '') || '';
      if (s.startsWith('LEAVE:')) {
        const leaveId = s.replace('LEAVE:', '');
        const _lt = LEAVE_TYPES.find(t => t.id === leaveId);
        const _dur = _lt ? (_lt.duration || 1) : 1;
        mStats['leave_' + leaveId] = (mStats['leave_' + leaveId] || 0) + _dur;
        shifts.push('假');
      } else if (s === _SHIFT_OFF || s === 'OFF') {
        mStats.off++;
        shifts.push('休');
      } else if (s && SHIFTS[s]) {
        mStats[s] = (mStats[s] || 0) + 1;
        totalWorkDays++;
        shifts.push(SHIFTS[s]?.label || s);
      } else {
        shifts.push(s || '');
      }
    }
    mStats._workHours = totalWorkDays * 8;

    const statVals = filteredStatHeaders.map(h => {
      if (h.isTotal) return totalWorkDays;
      if (h.isHours) return mStats._workHours;
      if (h.isOff) return mStats.off || 0;
      if (h.isLeave && h.mergedIds) return h.mergedIds.reduce((s, id) => s + (mStats['leave_' + id] || 0), 0);
      return mStats[h.key] || 0;
    });

    return [m.name, m.team, ...shifts, ...statVals];
  });

  // 文件名
  const now = new Date();
  const tsStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
  const fileName = addWatermark
    ? `排班表_${exYear}年${exMonth}月_${tsStr}`
    : `排班表_${exYear}年${exMonth}月`;

  closeModal();

  if (fmt === 'xlsx' && typeof XLSX !== 'undefined') {
    _exportAsExcel(headerRow, dataRows, fileName, daysInMonth, filteredStatHeaders, exYear, exMonth);
  } else {
    _exportAsCSV(headerRow, dataRows, fileName);
  }
}

// Excel 导出
function _exportAsExcel(headerRow, dataRows, fileName, daysInMonth, statHeaders, exYear, exMonth) {
  const wb = XLSX.utils.book_new();
  const wsData = [headerRow, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const colWidths = [{ wch: 10 }, { wch: 8 }];
  for (let i = 0; i < daysInMonth; i++) colWidths.push({ wch: 4 });
  statHeaders.forEach(() => colWidths.push({ wch: 12 }));
  ws['!cols'] = colWidths;
  ws['!freeze'] = { xSplit: 2, ySplit: 1 };
  XLSX.utils.book_append_sheet(wb, ws, `${exYear}年${exMonth}月`);
  const refData = [['代号', '名称', '时间段']];
  Object.keys(SHIFTS).forEach(k => {
    if (k === _SHIFT_OFF) refData.push(['休', '休息', '']);
    else refData.push([SHIFTS[k].label || k, SHIFTS[k].name || k, `${SHIFTS[k].startTime || ''}-${SHIFTS[k].endTime || ''}`]);
  });
  LEAVE_TYPES.forEach(lt => { refData.push([lt.name, lt.name, `请假(${lt.duration || 1}天)`]); });
  const ws2 = XLSX.utils.aoa_to_sheet(refData);
  ws2['!cols'] = [{ wch: 8 }, { wch: 12 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws2, '班次说明');
  XLSX.writeFile(wb, fileName + '.xlsx');
  showToast(`已导出 ${exYear}年${exMonth}月排班表 (Excel)`, 'success');
}

// CSV 导出
function _exportAsCSV(headerRow, dataRows, fileName) {
  const BOM = '\uFEFF';
  const csvContent = [headerRow, ...dataRows].map(row =>
    row.map(cell => {
      const s = String(cell);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')
  ).join('\n');
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName + '.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`已导出排班表 (CSV)`, 'success');
}

// ===== 键盘快捷操作 =====
// 当前焦点格子 { memberId, day }
let _kbFocus = null;

function _setKbFocus(memberId, day) {
  // 清除旧焦点
  document.querySelectorAll('.shift-cell.kb-focus').forEach(el => el.classList.remove('kb-focus'));
  _kbFocus = { memberId, day };
  const cell = document.querySelector(`.shift-cell[data-member-id="${memberId}"][data-day="${day}"]`);
  if (cell) {
    cell.classList.add('kb-focus');
    cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

// 全局键盘监听（仅在排班页面激活）
document.addEventListener('keydown', function(e) {
  // 如果焦点在输入框/弹窗内，不拦截
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  if (document.querySelector('.modal-overlay')) return; // 弹窗打开时不拦截
  if (!document.querySelector('.schedule-page-wrap')) return; // 不在排班页面

  // Ctrl+Z：撤销 / Ctrl+Y 或 Ctrl+Shift+Z：重做
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    if (!isAdmin()) return;
    e.preventDefault();
    _undoApply(_undoStack, _redoStack);
    return;
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    if (!isAdmin()) return;
    e.preventDefault();
    _undoApply(_redoStack, _undoStack);
    return;
  }

  // r91: Ctrl+C 复制选区（支持纯键盘：如果无鼠标选区则用焦点格）
  if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
    if (isAdmin()) {
      if (_cpSelected.size === 0 && _kbFocus) _cpSelectSingle(_kbFocus.memberId, _kbFocus.day);
      if (_cpSelected.size > 0) { e.preventDefault(); _cpCopy(); return; }
    }
  }
  // r91: Ctrl+V 粘贴（支持纯键盘：如果无鼠标选区则用焦点格作为粘贴锚点）
  if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
    if (isAdmin() && _cpCopied.length > 0) {
      if (_cpSelected.size === 0 && _kbFocus) _cpSelectSingle(_kbFocus.memberId, _kbFocus.day);
      if (_cpSelected.size > 0) { e.preventDefault(); _cpPaste(); return; }
    }
  }
  // r91: Delete 删除选中格子（支持纯键盘）
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (isAdmin()) {
      if (_cpSelected.size === 0 && _kbFocus) _cpSelectSingle(_kbFocus.memberId, _kbFocus.day);
      if (_cpSelected.size > 0) { e.preventDefault(); _cpDeleteSelected(); return; }
    }
  }

  // Esc：关闭弹窗 → 关闭菜单 → 清除复制状态 → 退出选区 → 退出批量模式
  if (e.key === 'Escape') {
    if (_shiftPopover) { closeShiftDetailPopover(); e.preventDefault(); return; }
    if (_cpContextMenu) { _closeCpContextMenu(); e.preventDefault(); return; }
    if (_cpCopied.length > 0) { _cpClearCopied(); e.preventDefault(); return; }
    if (_cpSelected.size > 0) { _cpClearSelection(); e.preventDefault(); return; }
    if (_batchMode) { _exitBatchMode(); e.preventDefault(); }
    return;
  }

  // #7: Tab 键横向移动格子焦点
  if (e.key === 'Tab' && _kbFocus && document.querySelector('.schedule-page-wrap')) {
    e.preventDefault();
    const daysInMonth = new Date(scheduleYear, scheduleMonth, 0).getDate();
    const memberCells = Array.from(document.querySelectorAll('.shift-cell[data-member-id][data-day="1"]'));
    const memberIds = memberCells.map(c => parseInt(c.dataset.memberId));
    let mId = _kbFocus.memberId, d = _kbFocus.day;
    const mIdx = memberIds.indexOf(mId);
    if (e.shiftKey) {
      // Shift+Tab：向左，到头则跳上一行末尾
      if (d > 1) { d--; }
      else if (mIdx > 0) { mId = memberIds[mIdx - 1]; d = daysInMonth; }
    } else {
      // Tab：向右，到末尾则跳下一行开头
      if (d < daysInMonth) { d++; }
      else if (mIdx < memberIds.length - 1) { mId = memberIds[mIdx + 1]; d = 1; }
    }
    _setKbFocus(mId, d);
    if (isAdmin()) { _cpClearSelection(); _cpAddToSelection(mId, d); }
    return;
  }

  // 方向键：移动焦点
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) {
    e.preventDefault();
    const daysInMonth = new Date(scheduleYear, scheduleMonth, 0).getDate();
    // 获取当前可见的所有成员（按渲染顺序）
    const memberCells = Array.from(document.querySelectorAll('.shift-cell[data-member-id][data-day="1"]'));
    const memberIds = memberCells.map(c => parseInt(c.dataset.memberId));
    if (memberIds.length === 0) return;

    let mId = _kbFocus?.memberId || memberIds[0];
    let d = _kbFocus?.day || 1;
    const mIdx = memberIds.indexOf(mId);

    if (e.key === 'ArrowRight') d = Math.min(d + 1, daysInMonth);
    else if (e.key === 'ArrowLeft') d = Math.max(d - 1, 1);
    else if (e.key === 'ArrowDown') {
      const nextIdx = Math.min(mIdx + 1, memberIds.length - 1);
      mId = memberIds[nextIdx];
    }
    else if (e.key === 'ArrowUp') {
      const prevIdx = Math.max(mIdx - 1, 0);
      mId = memberIds[prevIdx];
    }
    _setKbFocus(mId, d);
    // r91: 管理员方向键移动时同步选区（单格跟随焦点），实现纯键盘选择
    if (isAdmin() && !e.shiftKey) { _cpClearSelection(); _cpAddToSelection(mId, d); }
    // r91: 管理员 Shift+方向键扩展选区（矩形框选）
    if (isAdmin() && e.shiftKey) { _cpAddToSelection(mId, d); }
    return;
  }

  // r90: Enter 键打开排班详情弹窗
  if (e.key === 'Enter' && _kbFocus) {
    e.preventDefault();
    showShiftDetailPopover(_kbFocus.memberId, _kbFocus.day, null);
    return;
  }

  // B：进入批量模式
  if (e.key === 'b' || e.key === 'B') {
    if (isAdmin()) { _enterBatchMode(); }
  }
}, false);

// 点击格子时设置键盘焦点
document.addEventListener('click', function(e) {
  const cell = e.target.closest('.shift-cell[data-member-id]');
  if (cell && !_batchMode) {
    _setKbFocus(parseInt(cell.dataset.memberId), parseInt(cell.dataset.day));
  }
  // 点击外部关闭导入/导出菜单
  if (!e.target.closest('.sch-io-wrap')) closeSchIOMenu();
}, false);

// ===== 导入/导出下拉菜单 =====
function toggleSchIOMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById('schIOMenu');
  if (!menu) return;
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}
function closeSchIOMenu() {
  const menu = document.getElementById('schIOMenu');
  if (menu) menu.style.display = 'none';
}

// ===== ① 卡片班次/请假信息栏：管理员自定义编辑 =====
// 图例栏数据存储 key
const LEGEND_STORAGE_KEY = 'glxt_legend_config';

function getLegendConfig() {
  try {
    const raw = typeof _storageGetRaw === 'function' ? _storageGetRaw(LEGEND_STORAGE_KEY) : localStorage.getItem(LEGEND_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  // 默认：所有班次 + 前2个请假类型（排除病假）
  return {
    showShifts: Object.keys(SHIFTS).filter(k => k !== _SHIFT_OFF),
    showLeaves: LEAVE_TYPES.filter(lt => lt.id !== 'sick').slice(0, 2).map(lt => lt.id),
  };
}

function saveLegendConfig(cfg) {
  if (typeof _storageSetRaw === 'function') _storageSetRaw(LEGEND_STORAGE_KEY, JSON.stringify(cfg));
  else localStorage.setItem(LEGEND_STORAGE_KEY, JSON.stringify(cfg));
}

function showLegendEditModal() {
  const cfg = getLegendConfig();
  const shiftOptions = Object.entries(SHIFTS).filter(([k]) => k !== _SHIFT_OFF).map(([k, v]) => `
    <label style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer">
      <input type="checkbox" name="legendShift" value="${k}" ${cfg.showShifts.includes(k) ? 'checked' : ''} style="width:14px;height:14px;cursor:pointer">
      <span class="shift-cell ${v.color}" style="width:20px;height:20px;border-radius:4px;font-size:11px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">${v.label}</span>
      <span style="font-size:13px">${v.name}</span>
      ${v.start && v.end ? `<span style="font-size:11px;color:var(--text-tertiary)">${v.start}–${v.end}</span>` : ''}
    </label>
  `).join('');

  const leaveOptions = LEAVE_TYPES.map(lt => `
    <label style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer">
      <input type="checkbox" name="legendLeave" value="${lt.id}" ${cfg.showLeaves.includes(lt.id) ? 'checked' : ''} style="width:14px;height:14px;cursor:pointer">
      <span class="shift-legend-dot ${lt.color}" style="width:13px;height:13px;border-radius:3px;flex-shrink:0"></span>
      <span style="font-size:13px">${lt.name}</span>
    </label>
  `).join('');

  const content = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <div>
        <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--border)">班次图例</div>
        ${shiftOptions}
      </div>
      <div>
        <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--border)">请假类型图例</div>
        ${leaveOptions}
      </div>
    </div>
  `;
  openModal('自定义图例栏', content,
    `<button class="btn btn-default" onclick="closeModal()">取消</button>
     <button class="btn btn-primary" onclick="saveLegendEditModal()">保存</button>`,
    560
  );
}

function saveLegendEditModal() {
  const shiftChecks = Array.from(document.querySelectorAll('input[name="legendShift"]:checked')).map(el => el.value);
  const leaveChecks = Array.from(document.querySelectorAll('input[name="legendLeave"]:checked')).map(el => el.value);
  saveLegendConfig({ showShifts: shiftChecks, showLeaves: leaveChecks });
  closeModal();
  showToast('图例栏已更新', 'success');
  renderSchedulePage(document.getElementById('contentArea'));
}

// ===== #2: 快速填充菜单 =====
let _quickFillMenu = null;
function showQuickFillMenu(e, team, day) {
  e.stopPropagation();
  // 关闭已有菜单
  if (_quickFillMenu) { _quickFillMenu.remove(); _quickFillMenu = null; }
  const menu = document.createElement('div');
  menu.className = 'sch-quick-fill-menu';
  // 班次选项
  const shiftItems = Object.entries(SHIFTS).map(([k, v]) =>
    `<button class="sch-quick-fill-item" onclick="applyQuickFill('${team}',${day},'${k}')">
      <span class="shift-cell ${v.color}" style="width:16px;height:16px;border-radius:3px;font-size:9px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">${v.label}</span>
      <span>${v.name}</span>
    </button>`
  ).join('');
  // 休息选项
  const offItem = `<button class="sch-quick-fill-item" onclick="applyQuickFill('${team}',${day},'${_SHIFT_OFF}')">
    <span class="shift-cell shift-off" style="width:16px;height:16px;border-radius:3px;font-size:9px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">休</span>
    <span>休息</span>
  </button>`;
  menu.innerHTML = `
    <div class="sch-quick-fill-header">${scheduleMonth}/${day} 整列填充</div>
    ${shiftItems}${offItem}
    <div class="sch-quick-fill-sep"></div>
    <button class="sch-quick-fill-item sch-quick-fill-clear" onclick="applyQuickFill('${team}',${day},'')">
      <span style="width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px">✕</span>
      <span>清空该列</span>
    </button>
  `;
  document.body.appendChild(menu);
  _quickFillMenu = menu;
  // 定位
  const rect = e.currentTarget.getBoundingClientRect();
  const menuW = 160;
  let left = rect.left;
  if (left + menuW > window.innerWidth - 8) left = window.innerWidth - menuW - 8;
  menu.style.cssText = `position:fixed;top:${rect.bottom + 4}px;left:${left}px;z-index:9999`;
  // 点击外部关闭
  setTimeout(() => {
    document.addEventListener('click', _closeQuickFillMenu, { once: true });
  }, 0);
}
function _closeQuickFillMenu() {
  if (_quickFillMenu) { _quickFillMenu.remove(); _quickFillMenu = null; }
}
function applyQuickFill(team, day, shiftKey) {
_closeQuickFillMenu();
// r81: 复用模块级 _getTeamMembers
const members = _getTeamMembers(team);
if (members.length === 0) return;
  // #11: 推入撤销栈
  _undoPush({ year: scheduleYear, month: scheduleMonth, data: JSON.parse(JSON.stringify(SCHEDULE_DATA)), desc: `${team} ${day}日整列填充 ${shiftKey || '清空'}` });
  members.forEach(m => {
    if (!SCHEDULE_DATA[m.id]) SCHEDULE_DATA[m.id] = {};
    if (shiftKey) SCHEDULE_DATA[m.id][day] = shiftKey;
    else delete SCHEDULE_DATA[m.id][day];
  });
  saveScheduleData();
  addWorkLog('考勤系统', '排班修改', `${team} ${scheduleMonth}月${day}日整列填充为 ${shiftKey || '清空'}`);
  showToast(`已将 ${team} ${day}日 ${members.length} 人填充为 ${shiftKey ? getShiftDisplayInfo(shiftKey).name : '清空'}`, 'success');
  renderSchedulePage(document.getElementById('contentArea'));
}
