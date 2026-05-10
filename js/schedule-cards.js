// ===== 排班日历模块 — 卡片渲染 & 弹窗 =====
// opt4: 从 schedule.js 拆分出来的卡片层
// 包含：5张顶部信息卡片 + 在班天数编辑 + 公告管理 + 月份选择器

// ===== #5 骨架屏 — 月份切换时卡片 shimmer 过渡 =====
function _showCardSkeleton() {
  var cards = document.querySelectorAll('.sch-hcard');
  cards.forEach(function(c) { c.classList.add('sch-hcard-skeleton'); });
}

// ===== #14/#16 卡片数据统一构建 =====
function _buildCardData(today, daysInMonth, anomalies) {
  var weekStr = getWeekDay(today);
  var ondutyOverride = getOndutyOverride(scheduleYear, scheduleMonth);
  var canEditCards = isAdmin();
  var ruleOk = anomalies.filter(function(a) { return a.level === 'danger'; }).length === 0;
  var ruleWarn = anomalies.filter(function(a) { return a.level === 'warning'; }).length;
  var ruleDanger = anomalies.filter(function(a) { return a.level === 'danger'; }).length;
  // 月总在班达标率
  var _rulesSaved;
  try { _rulesSaved = JSON.parse(localStorage.getItem('glxt_schedule_rules') || 'null'); } catch(e) { _rulesSaved = null; }
  var _totalCompliantTeams = TEAMS.filter(function(team) {
    var tr = (_rulesSaved && _rulesSaved.teamRules && _rulesSaved.teamRules[team]) || {};
    if (!tr.minTotalPerMonth) return true;
    var members = MEMBERS_DATA.filter(function(m) { return m.team === team && !m.excludeFromSchedule; });
    return members.every(function(m) {
      var totalDays = 0;
      for (var d = 1; d <= daysInMonth; d++) {
        var s = getMemberShift(m.id, d);
        if (s && s !== 'OFF' && !isLeaveShift(s) && SHIFTS[s]) totalDays++;
      }
      return totalDays >= tr.minTotalPerMonth;
    });
  }).length;
  var _hasMinTotalRule = TEAMS.some(function(team) {
    var tr = (_rulesSaved && _rulesSaved.teamRules && _rulesSaved.teamRules[team]) || {};
    return !!tr.minTotalPerMonth;
  });
  var isCurrentMonth = (today.getFullYear() === scheduleYear && today.getMonth() + 1 === scheduleMonth);
  // ④ 修复：同时包含内置团队 + CUSTOM_CALENDARS 中的自定义团队（排除已隐藏的内置团队）
  var _hiddenBuiltinTeams = CUSTOM_CALENDARS.filter(function(c) { return c.builtinTeam && c.hidden; }).map(function(c) { return c.builtinTeam; });
  var _customTeamNames = CUSTOM_CALENDARS.filter(function(c) { return !c.builtinTeam; }).map(function(c) { return c.name; });
  var _allStatTeams = TEAMS.filter(function(t) { return !_hiddenBuiltinTeams.includes(t); }).concat(_customTeamNames);
  var _teamOndutyStats = _allStatTeams.map(function(team) {
    // 自定义日历卡片：按 memberIds 取成员；内置团队：按 team 字段过滤
    var customCal = CUSTOM_CALENDARS.find(function(c) { return !c.builtinTeam && c.name === team; });
    var members;
    if (customCal && customCal.memberIds && customCal.memberIds.length > 0) {
      members = MEMBERS_DATA.filter(function(m) { return customCal.memberIds.includes(m.id); });
    } else {
      members = MEMBERS_DATA.filter(function(m) { return m.team === team && !m.excludeFromSchedule; });
    }
    var total = members.length;
    var onduty = 0;
    if (isCurrentMonth) {
      onduty = members.filter(function(m) {
        var sv = getMemberShift(m.id, today.getDate());
        return sv && sv !== 'OFF' && !isLeaveShift(sv) && SHIFTS[sv];
      }).length;
    } else {
      onduty = members.filter(function(m) {
        return Array.from({length: daysInMonth}, function(_, i) { return i + 1; }).some(function(d) {
          var sv = getMemberShift(m.id, d);
          return sv && sv !== 'OFF' && !isLeaveShift(sv) && SHIFTS[sv];
        });
      }).length;
    }
    // 统计当天各班次人数（当前月用今天，非当前月用1号）
    var shiftDist = { A: 0, B: 0, C: 0 };
    var _statDay = isCurrentMonth ? today.getDate() : 1;
    members.forEach(function(m) {
      var sv = getMemberShift(m.id, _statDay);
      if (sv && SHIFTS[sv] && sv !== 'OFF' && !isLeaveShift(sv)) {
        if (shiftDist.hasOwnProperty(sv)) shiftDist[sv]++;
      }
    });
    return { team: team, total: total, onduty: onduty, shiftDist: shiftDist };
  });
  var _totalOnduty = _teamOndutyStats.reduce(function(s, t) { return s + t.onduty; }, 0);
  var _totalMembers = _teamOndutyStats.reduce(function(s, t) { return s + t.total; }, 0);
  return {
    scheduleMonth: scheduleMonth, scheduleYear: scheduleYear, today: today,
    daysInMonth: daysInMonth, weekStr: weekStr, isCurrentMonth: isCurrentMonth,
    canEditCards: canEditCards, ondutyOverride: ondutyOverride,
    ruleOk: ruleOk, ruleWarn: ruleWarn, ruleDanger: ruleDanger, anomalies: anomalies,
    _hasMinTotalRule: _hasMinTotalRule, _totalCompliantTeams: _totalCompliantTeams,
    _totalOnduty: _totalOnduty, _totalMembers: _totalMembers, _teamOndutyStats: _teamOndutyStats
  };
}

// ===== #13 实时卡片刷新（无需重建整个页面）=====
function _refreshCardStats() {
  var container = document.querySelector('.schedule-header-cards');
  if (!container) return;
  var today = new Date();
  var daysInMonth = new Date(scheduleYear, scheduleMonth, 0).getDate();
  var anomalies = detectScheduleAnomalies();
  var cd = _buildCardData(today, daysInMonth, anomalies);
  container.innerHTML =
    _renderCardDate(cd) +
    _renderCardOnduty(cd) +
    _renderCardRule(cd) +
    _renderCardAnnouncement(cd) +
    _renderCardOndutyStats(cd);
}

// ===== 公告富文本渲染 =====
// 支持 **加粗**、[链接文字](URL)、换行 → <br>，其余内容原样输出（XSS 安全）
function _renderAnnText(text) {
  if (!text) return '';
  // 先转义 HTML 特殊字符
  let safe = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  // **加粗**
  safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // [链接文字](URL)
  safe = safe.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener" style="color:#3370FF;text-decoration:underline">$1</a>');
  // r150: 换行符 → <br>（否则 HTML 会折叠换行）
  safe = safe.replace(/\n/g, '<br>');
  return safe;
}

// ===== opt5: 五张卡片独立渲染函数 =====
function _renderCardDate(p) {
  return `<div class="sch-hcard sch-hcard-date"><div class="sch-hcard-deco"></div><div class="sch-hcard-inner">
    <div class="sc-label-row">
      <span class="sc-label"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M5 1v3M11 1v3M2 7h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> 当前月份</span>
      <div class="sc-nav-group">
        <button class="sc-nav-btn" onclick="changeScheduleMonth(-1)" title="上一月"><svg width="6" height="10" viewBox="0 0 6 10" fill="none"><path d="M5 1L1 5l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <button class="sc-nav-btn sc-nav-today" onclick="goToToday()">今天</button>
        <button class="sc-nav-btn" onclick="changeScheduleMonth(1)" title="下一月"><svg width="6" height="10" viewBox="0 0 6 10" fill="none"><path d="M1 1l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      </div>
    </div>
    <div class="sc-value-row">
      <div class="sc-date-month-group sch-month-clickable" style="cursor:pointer" onclick="showMonthPickerModal()" title="点击选择月份">
        <span class="sc-date-month-num">${p.scheduleMonth}</span><span class="sc-date-month-label">月</span>
      </div>
      <span class="sc-date-divider"></span>
      <span class="sc-value" style="font-size:26px;letter-spacing:-1px;opacity:0.5">${p.today.getDate()}</span>
      <span class="sc-date-week">${p.weekStr}</span>
    </div>
    <div class="sc-footer-row">
      <span class="sc-footer-item">本月共 <b>${p.daysInMonth}</b> 天</span>
      <span class="sc-footer-sep">·</span>
      <span class="sc-footer-item">${p.isCurrentMonth ? '今日第 <b>' + p.today.getDate() + '</b> 天' : p.scheduleYear + ' 年'}</span>
    </div>
  </div></div>`;
}

function _renderCardOnduty(p) {
  const ov = p.ondutyOverride;
  // #10 环形进度 SVG — 在班天数 / 当月天数
  const _ringR = 18, _ringC = 2 * Math.PI * _ringR;
  const _ringPct = (ov.total !== null && p.daysInMonth) ? Math.min(ov.total / p.daysInMonth, 1) : 0;
  const _ringDash = _ringPct * _ringC;
  const _ringSvg = ov.total !== null ? '<svg class="sc-ring-svg" width="44" height="44" viewBox="0 0 44 44" style="flex-shrink:0;margin-left:auto"><circle cx="22" cy="22" r="' + _ringR + '" fill="none" stroke="rgba(173,78,0,0.1)" stroke-width="4"/><circle cx="22" cy="22" r="' + _ringR + '" fill="none" stroke="#AD4E00" stroke-width="4" stroke-linecap="round" stroke-dasharray="' + _ringDash.toFixed(1) + ' ' + _ringC.toFixed(1) + '" transform="rotate(-90 22 22)" style="transition:stroke-dasharray 0.5s ease"/><text x="22" y="22" text-anchor="middle" dominant-baseline="central" fill="#AD4E00" font-size="10" font-weight="700">' + Math.round(_ringPct * 100) + '%</text></svg>' : '';
  return `<div class="sch-hcard sch-hcard-onduty" ${p.canEditCards ? 'style="cursor:pointer" onclick="showOndutyEditModal()" title="点击编辑在班天数" tabindex="0" role="button" onkeydown="if(event.key===\'Enter\')this.click()"' : ''}>
    <div class="sch-hcard-deco"></div><div class="sch-hcard-inner">
    <div class="sc-label-row">
      <span class="sc-label"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M8 5v3.5l2.5 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> 在班天数</span>
      ${p.canEditCards ? '<span class="sc-action-tag">编辑</span>' : ''}
    </div>
    <div class="sc-value-row">
      <span class="sc-value">${ov.total !== null ? ov.total : '—'}</span>
      ${ov.total !== null ? '<span class="sc-unit">天</span>' : ''}
      ${_ringSvg}
    </div>
    <div class="sc-footer-row">
      ${ov.normal !== null
        ? '<span class="sc-footer-item"><svg width="10" height="10" viewBox="0 0 12 12" fill="none" style="margin-right:2px;vertical-align:-1px;opacity:0.6"><circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.3"/><path d="M4 6l1.5 1.5L8 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>普通班 <b>' + ov.normal + '</b> 天</span>'
        : '<span class="sc-footer-item sc-footer-empty">' + (p.canEditCards ? '点击填写天数' : '待管理员填写') + '</span>'}
      ${ov.triple !== null && ov.triple > 0
        ? '<span class="sc-footer-sep">·</span><span class="sc-footer-item sc-footer-triple"><svg width="10" height="10" viewBox="0 0 12 12" fill="none" style="margin-right:2px;vertical-align:-1px"><path d="M6 1.5l1.2 2.4 2.7.4-1.95 1.9.46 2.66L6 7.6l-2.41 1.3.46-2.66L2.1 4.3l2.7-.4z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" fill="currentColor" opacity="0.85"/></svg>三薪 <b>' + ov.triple + '</b> 天</span>'
        : ''}
    </div>
  </div></div>`;
}

function _renderCardRule(p) {
  const ruleState = p.ruleOk && p.ruleWarn === 0 ? 'ok' : p.ruleDanger > 0 ? 'danger' : 'warn';
  let footerHtml;
  if (p.ruleOk && p.ruleWarn === 0) {
    footerHtml = '<svg width="10" height="10" viewBox="0 0 12 12" fill="none" style="flex-shrink:0;opacity:0.6"><path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="sc-footer-item">所有规则均符合</span>';
    if (p._hasMinTotalRule) footerHtml += '<span class="sc-footer-sep">·</span><span class="sc-footer-item" style="opacity:0.8">' + p._totalCompliantTeams + '/' + TEAMS.length + ' 团队达标</span>';
  } else {
    const first = p.anomalies[0];
    const shortText = first ? first.text.replace(/（.*?）/g,'').substring(0,18) : '';
    footerHtml = '<span class="sc-footer-item ' + (first && first.level==='danger' ? 'sc-footer-danger' : 'sc-footer-warn') + '" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:110px" title="' + (first ? first.text : '') + '">' + shortText + '</span>';
    if (p.anomalies.length > 1) footerHtml += '<span class="sc-footer-sep">·</span><span class="sc-footer-item" style="opacity:0.55">+' + (p.anomalies.length-1) + '</span>';
    if (p._hasMinTotalRule) footerHtml += '<span class="sc-footer-sep">·</span><span class="sc-footer-item" style="opacity:0.7">' + p._totalCompliantTeams + '/' + TEAMS.length + '达标</span>';
  }
  return `<div class="sch-hcard sch-hcard-rule sch-hcard-rule-${ruleState}" style="cursor:pointer" onclick="showScheduleAnomalies()" tabindex="0" role="button" onkeydown="if(event.key==='Enter')this.click()">
    <div class="sch-hcard-deco"></div><div class="sch-hcard-inner">
    <div class="sc-label-row">
      <span class="sc-label"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 2a6 6 0 100 12A6 6 0 008 2z" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 8l2 2 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> 规则验证</span>
      ${p.canEditCards ? '<span class="sc-action-tag" onclick="event.stopPropagation();showEditRulesModal()">配置</span>' : ''}
    </div>
    <div class="sc-value-row">
      ${p.ruleOk && p.ruleWarn === 0
        ? '<span class="sc-value sc-value-icon">✓</span><span class="sc-unit">全部通过</span>'
        : '<span class="sc-value">' + (p.ruleDanger + p.ruleWarn) + '</span><span class="sc-unit">项问题</span>'}
    </div>
    <div class="sc-footer-row">${footerHtml}</div>
  </div></div>`;
}

function _renderCardAnnouncement(p) {
  const allAnns = ANNOUNCEMENTS_DATA.filter(a => a.status !== 'deleted')
    .sort((a,b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  const unreadAnns = allAnns.filter(a => a.status === 'unread');
  const unreadCount = unreadAnns.length;
  // #11 自动轮播：最多展示前 4 条公告
  const displayAnns = allAnns.slice(0, 4);
  const n = displayAnns.length;
  let footerContent;
  if (n === 0) {
    footerContent = '<span class="sc-footer-empty">暂无公告</span>';
  } else if (n === 1) {
    footerContent = '<span class="sc-ann-preview-text sc-ann-preview-bold">' + _renderAnnText(displayAnns[0].text) + '</span>';
  } else {
    // 多条轮播：CSS animation 垂直滚动
    const items = displayAnns.map(function(a) {
      return '<div class="sc-ann-carousel-item"><span class="sc-ann-preview-text sc-ann-preview-bold">' + _renderAnnText(a.text) + '</span></div>';
    }).join('');
    footerContent = '<div class="sc-ann-carousel" style="--ann-count:' + n + '">' + items + '</div>';
  }
  return `<div class="sch-hcard sch-hcard-ann" style="cursor:pointer" onclick="showAnnouncementModal()" tabindex="0" role="button" onkeydown="if(event.key==='Enter')this.click()">
    <div class="sch-hcard-deco"></div><div class="sch-hcard-inner">
    <div class="sc-label-row">
      <span class="sc-label"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M4 6h8M4 9h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> 排班公告</span>
      ${p.canEditCards ? '<span class="sc-action-tag" onclick="event.stopPropagation();showAnnouncementEditModal()">管理</span>' : ''}
    </div>
    <div class="sc-value-row"><span class="sc-value">${unreadCount}</span><span class="sc-unit">条未读</span></div>
    <div class="sc-footer-row sc-footer-ann">
      ${footerContent}
    </div>
  </div></div>`;
}

function _renderCardOndutyStats(p) {
  // r98: 双栏布局 — 左侧总览 + 右侧2×2团队网格（含班次分布）
  var _totalShiftDist = { A: 0, B: 0, C: 0 };
  p._teamOndutyStats.forEach(function(t) {
    if (t.shiftDist) { _totalShiftDist.A += t.shiftDist.A; _totalShiftDist.B += t.shiftDist.B; _totalShiftDist.C += t.shiftDist.C; }
  });
  var _totalPct = p._totalMembers > 0 ? Math.round(p._totalOnduty / p._totalMembers * 100) : 0;
  // 班次颜色映射
  var _shiftColors = { A: '#0FC6C2', B: '#F59E0B', C: '#6366F1' };
  return '<div class="sch-hcard sch-hcard-onduty-stat" onclick="showOndutyStatDetail()" style="cursor:pointer" title="点击查看各团队详情" tabindex="0" role="button" onkeydown="if(event.key===\'Enter\')this.click()">' +
    '<div class="sch-hcard-deco"></div><div class="sch-hcard-inner sc5-dual-layout">' +
    // ── 左侧：总览 ──
    '<div class="sc5-left">' +
      '<div class="sc-label-row">' +
        '<span class="sc-label"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="5.5" cy="5" r="2" stroke="currentColor" stroke-width="1.5"/><circle cx="10.5" cy="5" r="2" stroke="currentColor" stroke-width="1.5"/><path d="M1 13c0-2.2 2-3.5 4.5-3.5S10 10.8 10 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M12 9.5c1.5.5 2.5 1.6 2.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> 排班数据</span>' +
        '<span class="sc-action-tag sc-tag-plain">' + (p.isCurrentMonth ? '今日' : p.scheduleMonth + '月') + '</span>' +
      '</div>' +
      '<div class="sc5-overview-value"><span class="sc-value">' + p._totalOnduty + '</span><span class="sc-unit">/ ' + p._totalMembers + ' 人</span></div>' +
      '<div class="sc5-overview-pct">' +
        '<div class="sc5-pct-bar"><div class="sc5-pct-fill" style="width:' + _totalPct + '%"></div></div>' +
        '<span class="sc5-pct-text">' + _totalPct + '%</span>' +
      '</div>' +
      '<div class="sc5-shift-summary">' +
        ['A','B','C'].map(function(s) {
          return '<span class="sc5-shift-tag" style="background:' + _shiftColors[s] + '22;color:' + _shiftColors[s] + '">' + s + ' <b>' + _totalShiftDist[s] + '</b></span>';
        }).join('') +
      '</div>' +
    '</div>' +
    // ── 右侧：2×2团队网格（按自定义顺序取前4个） ──
    '<div class="sc5-right">' +
      '<div class="sc5-team-grid">' +
        (function() {
          var _names = p._teamOndutyStats.map(function(t) { return t.team; });
          var _sorted = _sortTeamsByOrder(_names);
          return _sorted.slice(0, 4).map(function(name) {
            return p._teamOndutyStats.find(function(t) { return t.team === name; });
          }).filter(Boolean);
        })().map(function(t) {
          var pct = t.total > 0 ? Math.round(t.onduty / t.total * 100) : 0;
          var dist = t.shiftDist || { A: 0, B: 0, C: 0 };
          return '<div class="sc5-team-cell">' +
            '<div class="sc5-team-head">' +
              '<span class="sc5-team-name">' + t.team.replace(/团队$/,'') + '</span>' +
              '<span class="sc5-team-count">' + t.onduty + '<span class="sc5-team-total">/' + t.total + '</span></span>' +
            '</div>' +
            '<div class="sc5-team-bar-wrap"><div class="sc5-team-bar-fill" style="width:' + pct + '%"></div></div>' +
            '<div class="sc5-team-shifts">' +
              ['A','B','C'].map(function(s) {
                return '<span class="sc5-mini-tag" style="color:' + _shiftColors[s] + '">' + s + ':' + dist[s] + '</span>';
              }).join('') +
            '</div>' +
          '</div>';
        }).join('') +
      '</div>' +
    '</div>' +
  '</div></div>';
}

function showScheduleAnomalies() {
  const anomalies = detectScheduleAnomalies();
  if (anomalies.length === 0) { showToast('当前无排班异常', 'success'); return; }
  const content = `
    <ul class="anomaly-list">
      ${anomalies.map(a => `
        <li class="anomaly-item anomaly-${a.level === 'danger' ? 'critical' : a.level}">
          <span class="anomaly-icon">${a.level === 'danger' ? '🔴' : '⚠️'}</span>
          <span class="anomaly-text">${a.text}</span>
        </li>
      `).join('')}
    </ul>
  `;
  openModal('排班规则验证结果', content, `<button class="btn btn-default" onclick="closeModal()">关闭</button>`);
}

// ===== 在班天数自定义编辑弹窗（纯手动填写）=====
// r84: 月份改为管理员手动选择（年+月下拉），未编辑月份显示无数据
var _ondutyEditYear = 0;
var _ondutyEditMonth = 0;

function showOndutyEditModal() {
  // 默认选中当前排班月份
  _ondutyEditYear = scheduleYear;
  _ondutyEditMonth = scheduleMonth;
  _renderOndutyEditContent();
}

function _renderOndutyEditContent() {
  const y = _ondutyEditYear;
  const m = _ondutyEditMonth;
  const override = getOndutyOverride(y, m);

  // 年份选项：当前年 ± 1 年
  const curYear = new Date().getFullYear();
  const yearOpts = [curYear - 1, curYear, curYear + 1].map(yr =>
    '<option value="' + yr + '"' + (yr === y ? ' selected' : '') + '>' + yr + '年</option>'
  ).join('');
  const monthOpts = Array.from({length: 12}, (_, i) => {
    const mo = i + 1;
    return '<option value="' + mo + '"' + (mo === m ? ' selected' : '') + '>' + mo + '月</option>';
  }).join('');

  const content = `
    <div style="margin-bottom:14px;padding:10px 12px;background:#FFF7E6;border:1px solid rgba(250,140,22,0.2);border-radius:8px;font-size:12px;color:#874D00">
      <div style="font-weight:600;margin-bottom:2px">📝 在班天数编辑</div>
      <div style="color:rgba(0,0,0,0.45)">选择目标月份后填写，留空则卡片显示"—"</div>
    </div>
    <div class="form-row" style="margin-bottom:12px">
      <div class="form-group" style="flex:0 0 auto">
        <label class="form-label required">目标月份</label>
        <div style="display:flex;gap:8px;align-items:center">
          <select class="form-control" id="editOndutyYear" onchange="_onOndutyMonthChange()" style="width:90px;height:32px;font-size:13px">${yearOpts}</select>
          <select class="form-control" id="editOndutyMonth" onchange="_onOndutyMonthChange()" style="width:72px;height:32px;font-size:13px">${monthOpts}</select>
        </div>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label required">① 当月在班总天数</label>
        <input type="number" class="form-control" id="editOndutyTotal" min="0" max="31"
          value="${override.total !== null ? override.total : ''}"
          placeholder="请输入天数">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">② 普通班天数</label>
        <input type="number" class="form-control" id="editOndutyNormal" min="0" max="31"
          value="${override.normal !== null ? override.normal : ''}"
          placeholder="请输入天数">
      </div>
      <div class="form-group">
        <label class="form-label">③ 三薪天数</label>
        <input type="number" class="form-control" id="editOndutyTriple" min="0" max="31"
          value="${override.triple !== null ? override.triple : ''}"
          placeholder="请输入天数">
      </div>
    </div>
    <div class="form-group" style="margin-top:4px">
      <label class="form-label" style="display:flex;align-items:center;justify-content:space-between">
        <span>三薪具体日期</span>
        <span style="font-size:11px;color:rgba(0,0,0,0.4);font-weight:400">点击日期选择/取消</span>
      </label>
      <div class="triple-date-picker" id="editOndutyTripleDates">
        ${Array.from({length: new Date(y, m, 0).getDate()}, (_, i) => {
          const d = i + 1;
          const label = m + '/' + d;
          const isSelected = (override.tripleDates || []).includes(label);
          return '<button type="button" class="triple-date-btn' + (isSelected ? ' selected' : '') + '" data-date="' + label + '" onclick="toggleTripleDate(this)">' + d + '</button>';
        }).join('')}
      </div>
    </div>
  `;
  openModal(
    `编辑在班天数 · ${y}年${m}月`,
    content,
    `<button class="btn btn-default" onclick="closeModal()">取消</button>
     <button class="btn btn-primary" onclick="saveOndutyEditModal()">保存</button>`
  );
}

// r84: 切换月份时刷新弹窗内容
function _onOndutyMonthChange() {
  const yEl = document.getElementById('editOndutyYear');
  const mEl = document.getElementById('editOndutyMonth');
  if (yEl) _ondutyEditYear = parseInt(yEl.value, 10);
  if (mEl) _ondutyEditMonth = parseInt(mEl.value, 10);
  _renderOndutyEditContent();
}

function saveOndutyEditModal() {
  const totalVal  = document.getElementById('editOndutyTotal')?.value.trim();
  const normalVal = document.getElementById('editOndutyNormal')?.value.trim();
  const tripleVal = document.getElementById('editOndutyTriple')?.value.trim();

  // 从日期选择器读取选中的日期
  const tripleDates = Array.from(
    document.querySelectorAll('#editOndutyTripleDates .triple-date-btn.selected')
  ).map(btn => btn.dataset.date);

  const data = {
    total:  totalVal  !== '' ? parseInt(totalVal,  10) : null,
    normal: normalVal !== '' ? parseInt(normalVal, 10) : null,
    triple: tripleVal !== '' ? parseInt(tripleVal, 10) : null,
    tripleDates,
  };

  // 简单校验
  if (data.total !== null && isNaN(data.total))  { showToast('当月天数请输入有效数字', 'warning'); return; }
  if (data.normal !== null && isNaN(data.normal)) { showToast('普通班天数请输入有效数字', 'warning'); return; }
  if (data.triple !== null && isNaN(data.triple)) { showToast('三薪天数请输入有效数字', 'warning'); return; }

  // r84: 保存到管理员选择的目标月份（而非当前排班月份）
  const targetY = _ondutyEditYear || scheduleYear;
  const targetM = _ondutyEditMonth || scheduleMonth;
  saveOndutyOverride(targetY, targetM, data);
  addWorkLog('考勤系统', '排班修改', `编辑在班天数 ${targetY}年${targetM}月：总${data.total ?? '—'} 普通${data.normal ?? '—'} 三薪${data.triple ?? '—'}${tripleDates.length ? ' 三薪日期:'+tripleDates.join(',') : ''}`);
  closeModal();
  showToast(`${targetY}年${targetM}月 在班天数已保存`, 'success');
  renderSchedulePage(document.getElementById('contentArea'));
}

// 三薪日期选择器：切换选中状态
function toggleTripleDate(btn) {
  btn.classList.toggle('selected');
}

function clearOndutyOverrideAndRefresh() {
  clearOndutyOverride(scheduleYear, scheduleMonth);
  showToast('已清空在班天数数据', 'info');
  renderSchedulePage(document.getElementById('contentArea'));
}

// ===== 排班公告管理弹窗 =====
function showAnnouncementEditModal() {
  const typeOptions = [
    { value: 'success', label: '✅ 完成通知', color: '#00B42A' },
    { value: 'info',    label: '📌 普通通知', color: '#1664FF' },
    { value: 'warning', label: '⚠️ 警示通知', color: '#FF9500' },
  ];

  const renderList = () => ANNOUNCEMENTS_DATA.map(a => `
    <div class="ann-item ann-item-rich" id="ann-item-${a.id}">
      <div class="ann-item-top">
        <button class="ann-pin-btn${a.pinned ? ' ann-pin-btn-active' : ''}" onclick="toggleAnnPin(${a.id})" title="${a.pinned ? '取消置顶' : '置顶'}">📌</button>
        <select class="ann-type-sel" data-id="${a.id}" style="width:110px;font-size:12px;padding:3px 6px;border:1px solid var(--border);border-radius:6px;background:var(--card)">
          ${typeOptions.map(t => `<option value="${t.value}" ${a.type === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
        </select>
        <button class="btn btn-ghost btn-sm" style="color:var(--danger);padding:2px 6px;font-size:16px;line-height:1" onclick="deleteAnnouncement(${a.id})">×</button>
      </div>
      <textarea class="ann-text-input" data-id="${a.id}" rows="2"
        style="width:100%;font-size:12px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);resize:vertical;line-height:1.5;margin-top:4px"
        placeholder="公告内容，支持 **加粗** 和 [链接文字](URL)">${a.text.replace(/</g,'&lt;')}</textarea>
    </div>
  `).join('');

  const content = `
    <div style="margin-bottom:10px;font-size:12px;color:rgba(0,0,0,0.45)">支持 <code style="background:#F2F3F5;padding:1px 4px;border-radius:3px">**加粗**</code> 和 <code style="background:#F2F3F5;padding:1px 4px;border-radius:3px">[链接](URL)</code> 格式</div>
    <div id="annListWrap" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px">
      ${renderList()}
    </div>
    <button class="btn btn-default btn-sm" onclick="addAnnouncementRow()" style="width:100%">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 2v8M2 6h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
      新增公告
    </button>
  `;

  openModal(
    '管理排班公告',
    content,
    `<button class="btn btn-default" onclick="closeModal()">取消</button>
     <button class="btn btn-primary" onclick="saveAnnouncementModal()">保存</button>`
  );
}

function addAnnouncementRow() {
  const wrap = document.getElementById('annListWrap');
  if (!wrap) return;
  const tempId = Date.now();
  const div = document.createElement('div');
  div.className = 'ann-item ann-item-rich';
  div.id = `ann-item-${tempId}`;
  div.innerHTML = `
    <div class="ann-item-top">
      <button class="ann-pin-btn" onclick="toggleAnnPin(${tempId})" title="置顶">📌</button>
      <select class="ann-type-sel" data-id="${tempId}" style="width:110px;font-size:12px;padding:3px 6px;border:1px solid var(--border);border-radius:6px;background:var(--card)">
        <option value="success">✅ 完成通知</option>
        <option value="info" selected>📌 普通通知</option>
        <option value="warning">⚠️ 警示通知</option>
      </select>
      <button class="btn btn-ghost btn-sm" style="color:var(--danger);padding:2px 6px;font-size:16px;line-height:1" onclick="this.closest('.ann-item').remove()">×</button>
    </div>
    <textarea class="ann-text-input" data-id="${tempId}" rows="2"
      style="width:100%;font-size:12px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);resize:vertical;line-height:1.5;margin-top:4px"
      placeholder="公告内容，支持 **加粗** 和 [链接文字](URL)"></textarea>
  `;
  wrap.appendChild(div);
  div.querySelector('textarea').focus();
}

function saveAnnouncementModal() {
  const items = document.querySelectorAll('.ann-item');
  const newList = [];
  let hasError = false;
  items.forEach(item => {
    const textEl = item.querySelector('.ann-text-input');
    const typeEl = item.querySelector('.ann-type-sel');
    const text = textEl?.value.trim();
    if (!text) { hasError = true; textEl?.classList.add('input-error'); return; }
    textEl?.classList.remove('input-error');
    const id = parseInt(textEl.dataset.id) || Date.now();
    const existingAnn = ANNOUNCEMENTS_DATA.find(a => a.id === id);
    const pinEl = item.querySelector('.ann-pin-btn');
    const pinHidden = item.querySelector('.ann-pin-input');
    const isPinned = pinEl ? pinEl.classList.contains('ann-pin-btn-active') : (pinHidden ? pinHidden.value === '1' : false);
    newList.push({
      id,
      text,
      type: typeEl?.value || 'info',
      pinned: isPinned,
      status: existingAnn?.status || 'unread',
      createdAt: existingAnn?.createdAt || formatDate(new Date()),
      createdBy: existingAnn?.createdBy || CURRENT_USER.name,
    });
  });
  if (hasError) { showToast('公告内容不能为空', 'warning'); return; }

  ANNOUNCEMENTS_DATA.length = 0;
  newList.forEach(a => ANNOUNCEMENTS_DATA.push(a));
  saveAnnouncements();
  addWorkLog('考勤系统', '排班修改', `更新排班公告（共${newList.length}条）`);
  closeModal();
  showToast('排班公告已保存', 'success');
  renderSchedulePage(document.getElementById('contentArea'));
}

// 切换公告置顶状态（管理弹窗内实时切换）
function toggleAnnPin(id) {
  const btn = document.querySelector(`#ann-item-${id} .ann-pin-btn`);
  if (!btn) return;
  const isNowPinned = !btn.classList.contains('ann-pin-btn-active');
  btn.classList.toggle('ann-pin-btn-active', isNowPinned);
  btn.title = isNowPinned ? '取消置顶' : '置顶';
  // 同步到 ANNOUNCEMENTS_DATA（如果已存在）
  const ann = ANNOUNCEMENTS_DATA.find(a => a.id === id);
  if (ann) ann.pinned = isNowPinned;
}

function deleteAnnouncement(id) {
  const idx = ANNOUNCEMENTS_DATA.findIndex(a => a.id === id);
  if (idx === -1) {
    // 可能是弹窗内的临时行，直接移除 DOM
    const el = document.getElementById(`ann-item-${id}`);
    if (el) el.remove();
    return;
  }
  ANNOUNCEMENTS_DATA.splice(idx, 1);
  saveAnnouncements();
  // 如果弹窗开着，刷新列表；否则刷新页面
  const wrap = document.getElementById('annListWrap');
  if (wrap) {
    const el = document.getElementById(`ann-item-${id}`);
    if (el) el.remove();
  } else {
    renderSchedulePage(document.getElementById('contentArea'));
  }
  showToast('公告已删除', 'info');
}

// ── 排班公告弹窗辅助函数 ──────────────────────────────────

// r145: 考勤公告内嵌确认/异议交互按钮（仅非管理员 + 有 attNotifyMonth 的公告）
function _renderAnnAttButtons(ann) {
  if (!ann.attNotifyMonth) return '';
  // 仅对当前登录用户显示（非管理员角色时才需要确认）
  if (typeof isManagerRole === 'function' && isManagerRole()) return '';
  const ym = ann.attNotifyMonth;
  const data = typeof loadAttNotify === 'function' ? loadAttNotify(ym) : null;
  if (!data || !data.sent) return '';
  const myId = typeof CURRENT_USER !== 'undefined' && CURRENT_USER.id ? String(CURRENT_USER.id) : null;
  if (!myId) return '';
  const ms = data.members[myId];
  if (!ms) return '';
  if (ms.confirmed) {
    return `<div class="att-ann-interact att-ann-interact-done" style="margin-top:8px">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5l3 3 6-6" stroke="#52C41A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      已确认无误 <span style="font-size:10px;color:var(--text-tertiary);margin-left:4px">${ms.confirmedAt ? new Date(ms.confirmedAt).toLocaleString() : ''}</span>
    </div>`;
  }
  if (ms.disputed) {
    return `<div class="att-ann-interact att-ann-interact-disputed" style="margin-top:8px">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="#CF1322" stroke-width="2" stroke-linecap="round"/></svg>
      已提交异议 <span style="font-size:10px;color:var(--text-tertiary);margin-left:4px">${ms.disputedAt ? new Date(ms.disputedAt).toLocaleString() : ''}</span>
      ${ms.disputeReason ? '<div style="font-size:11px;color:#CF1322;margin-top:4px;padding:4px 8px;background:rgba(207,19,34,0.05);border-radius:4px">' + ms.disputeReason + '</div>' : ''}
    </div>`;
  }
  // 待确认：显示两个交互按钮
  return `<div class="att-ann-interact" style="margin-top:10px;display:flex;gap:8px">
    <button class="att-ann-btn att-ann-btn-confirm" onclick="event.stopPropagation();_attNotifyConfirm('${myId}');switchAnnModalTab(document.querySelector('#annModalTabs .sch-ann-tab.active')?.dataset?.tab||'unread')">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5l3 3 6-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      确认无误
    </button>
    <button class="att-ann-btn att-ann-btn-dispute" onclick="event.stopPropagation();_attNotifyDispute('${myId}')">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      有异议
    </button>
  </div>`;
}

// 渲染指定 tab 的公告列表 HTML（弹窗版）
function renderAnnList(tab, list, canEdit) {
  const STATUS_LABEL = { unread: '未读', read: '已读', starred: '标记', deleted: '已删除' };
  // 类型配置：图标SVG + 颜色
  const TYPE_CONFIG = {
    success: {
      svg: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" fill="#E8FFF0"/><path d="M5 8l2.5 2.5L11 5.5" stroke="#00B42A" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      bar: '#00B42A', bg: '#F0FFF5', label: '完成通知'
    },
    info: {
      svg: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" fill="#EBF1FF"/><path d="M8 7v4M8 5.5v.5" stroke="#1664FF" stroke-width="1.6" stroke-linecap="round"/></svg>',
      bar: '#1664FF', bg: '#F0F4FF', label: '重要通知'
    },
    warning: {
      svg: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2.5L14 13H2L8 2.5z" fill="#FFF7E6" stroke="#FF9500" stroke-width="1.3" stroke-linejoin="round"/><path d="M8 6.5v3M8 11v.5" stroke="#FF9500" stroke-width="1.5" stroke-linecap="round"/></svg>',
      bar: '#FF9500', bg: '#FFFBF0', label: '警示通知'
    },
  };
  const filtered = list.filter(a => a.status === tab)
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  if (filtered.length === 0) {
    return `<div class="sch-ann-empty">
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" style="opacity:0.25;margin-bottom:6px"><rect x="4" y="6" width="28" height="24" rx="4" stroke="currentColor" stroke-width="1.8"/><path d="M10 13h16M10 18h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      <div>暂无${STATUS_LABEL[tab] || ''}公告</div>
    </div>`;
  }
  return filtered.map(a => {
    const cfg = TYPE_CONFIG[a.type] || TYPE_CONFIG.info;
    const actions = [];
    if (tab === 'unread')  actions.push(`<button class="sch-ann-action" onclick="annAction(${a.id},'read')"><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>已读</button>`);
    if (tab === 'unread' || tab === 'read') actions.push(`<button class="sch-ann-action sch-ann-action-star" onclick="annAction(${a.id},'starred')"><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M6 1.5l1.1 2.3 2.5.35-1.8 1.75.43 2.5L6 7.2l-2.23 1.2.43-2.5L2.4 4.15l2.5-.35z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>标记</button>`);
    if (tab !== 'deleted') actions.push(`<button class="sch-ann-action sch-ann-action-del" onclick="annAction(${a.id},'deleted')"><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M4.5 5v4M7.5 5v4M3 3l.5 7h5l.5-7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>删除</button>`);
    if (tab === 'deleted') {
      actions.push(`<button class="sch-ann-action" onclick="annAction(${a.id},'unread')"><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6a4 4 0 107 3.46" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M2 3v3h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>恢复</button>`);
      actions.push(`<button class="sch-ann-action sch-ann-action-perm-del" onclick="annPermDelete(${a.id})"><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M3 3l.5 7h5l.5-7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>永久删除</button>`);
    }
    if (tab === 'starred') actions.push(`<button class="sch-ann-action sch-ann-action-del" onclick="annAction(${a.id},'deleted')"><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M4.5 5v4M7.5 5v4M3 3l.5 7h5l.5-7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>删除</button>`);
    return `
      <div class="sch-ann-item2${a.pinned ? ' sch-ann-item2-pinned' : ''}" id="ann-panel-item-${a.id}" style="border-left:3px solid ${cfg.bar}">
        <div class="sch-ann-item2-left">
          <div class="sch-ann-item2-icon" style="background:${cfg.bg}">${cfg.svg}</div>
        </div>
        <div class="sch-ann-item2-body">
          <div class="sch-ann-item2-header">
            <span class="sch-ann-item2-type" style="color:${cfg.bar}">${cfg.label}</span>
            ${a.pinned ? '<span class="sch-ann-pin-tag2">📌 置顶</span>' : ''}
            <span class="sch-ann-item2-date">${a.createdAt || ''}</span>
          </div>
          <div class="sch-ann-item2-text">${_renderAnnText(a.text)}</div>
          ${a.createdBy ? `<div class="sch-ann-item2-author">— ${a.createdBy}</div>` : ''}
          ${_renderAnnAttButtons(a)}
        </div>
        <div class="sch-ann-item2-actions">${actions.join('')}</div>
      </div>`;
  }).join('');
}

// 打开排班公告弹窗
function showAnnouncementModal() {
  const canEdit = isManagerRole();
  const unreadCount = ANNOUNCEMENTS_DATA.filter(a => a.status === 'unread').length;

  const content = `
    <div class="sch-ann-modal-wrap">
      <div class="sch-ann-tabs" id="annModalTabs" style="background:#F7F8FA;border-radius:8px;margin-bottom:10px;border:none;padding:4px 6px;gap:4px">
        <button class="sch-ann-tab active" data-tab="unread" onclick="switchAnnModalTab('unread')" style="border-radius:6px">
          未读
          ${unreadCount > 0 ? `<span class="sch-ann-tab-badge">${unreadCount}</span>` : ''}
        </button>
        <button class="sch-ann-tab" data-tab="read" onclick="switchAnnModalTab('read')" style="border-radius:6px">已读</button>
        <button class="sch-ann-tab" data-tab="starred" onclick="switchAnnModalTab('starred')" style="border-radius:6px">⭐ 星标</button>
        <button class="sch-ann-tab" data-tab="deleted" onclick="switchAnnModalTab('deleted')" style="border-radius:6px">已删除</button>
      </div>
      <div class="sch-ann-list" id="annModalList" style="max-height:360px;overflow-y:auto;border:1px solid rgba(0,0,0,0.06);border-radius:8px">
        ${renderAnnList('unread', ANNOUNCEMENTS_DATA, canEdit)}
      </div>
    </div>
  `;

  const footer = `
    <button class="btn btn-default" onclick="closeModal()">关闭</button>
    ${canEdit ? `<button class="btn btn-primary" onclick="closeModal();showAnnouncementEditModal()">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="margin-right:4px"><path d="M6 2v8M2 6h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
      新增公告
    </button>` : ''}
  `;

  openModal('排班公告', content, footer);
}

// 切换公告弹窗 Tab
function switchAnnModalTab(tab) {
  const canEdit = isManagerRole();
  document.querySelectorAll('#annModalTabs .sch-ann-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  const listEl = document.getElementById('annModalList');
  if (listEl) {
    listEl.innerHTML = renderAnnList(tab, ANNOUNCEMENTS_DATA, canEdit);
  }
}

// 公告操作（已读/标记/删除/恢复）
function annAction(id, newStatus) {
  setAnnouncementStatus(id, newStatus);
  // 刷新当前激活 tab 的列表（弹窗模式）
  const activeTab = document.querySelector('#annModalTabs .sch-ann-tab.active');
  const tab = activeTab ? activeTab.dataset.tab : 'unread';
  switchAnnModalTab(tab);
  // 更新未读 tab 徽标
  const unreadCount = ANNOUNCEMENTS_DATA.filter(a => a.status === 'unread').length;
  const unreadTabBtn = document.querySelector('#annModalTabs .sch-ann-tab[data-tab="unread"]');
  if (unreadTabBtn) {
    const badge = unreadTabBtn.querySelector('.sch-ann-tab-badge');
    if (unreadCount > 0) {
      if (badge) badge.textContent = unreadCount;
      else unreadTabBtn.insertAdjacentHTML('beforeend', `<span class="sch-ann-tab-badge">${unreadCount}</span>`);
    } else {
      if (badge) badge.remove();
    }
  }
  // 刷新卡片（更新未读数）
  renderSchedulePage(document.getElementById('contentArea'));
}

// 永久删除公告
function annPermDelete(id) {
  if (!confirm('确定要永久删除这条公告吗？此操作不可恢复。')) return;
  const idx = ANNOUNCEMENTS_DATA.findIndex(a => a.id === id);
  if (idx !== -1) {
    ANNOUNCEMENTS_DATA.splice(idx, 1);
    saveAnnouncements();
    addWorkLog('考勤系统', '排班修改', `永久删除公告 ID:${id}`);
    showToast('公告已永久删除', 'info');
    switchAnnModalTab('deleted');
    renderSchedulePage(document.getElementById('contentArea'));
  }
}

// ── 月份选择弹窗 ──────────────────────────────────────────────

// 打开年月选择弹窗
function showMonthPickerModal() {
  const curYear = scheduleYear;
  const curMonth = scheduleMonth;
  const today = new Date();
  const minYear = today.getFullYear() - 3;
  const maxYear = today.getFullYear() + 2;

  const content = `
    <div class="mp-wrap">
      <div class="mp-year-row">
        <button class="mp-year-btn" onclick="_mpChangeYear(-1)">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 2.5L4.5 7L9 11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <span class="mp-year-label" id="mpYearLabel" onclick="_mpYearClick()" title="点击直接输入年份" style="cursor:pointer;user-select:none">${curYear}</span>
        <button class="mp-year-btn" onclick="_mpChangeYear(1)">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 2.5L9.5 7L5 11.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
      <div id="mpMonthGrid" class="mp-grid">
        ${renderMonthGridHtml(curYear, curMonth)}
      </div>
      <div class="mp-footer">
        <button class="btn btn-ghost btn-sm" onclick="_mpGoToday()">回到今天</button>
      </div>
    </div>
  `;

  openModal('选择月份', content, '', '320px');
}

let _mpYear = null;
function _mpChangeYear(delta) {
  const label = document.getElementById('mpYearLabel');
  if (!label) return;
  _mpYear = (_mpYear || scheduleYear) + delta;
  label.textContent = _mpYear;
  const grid = document.getElementById('mpMonthGrid');
  if (grid) grid.innerHTML = renderMonthGridHtml(_mpYear, scheduleMonth);
}
function _mpGoToday() {
  const today = new Date();
  closeModal();
  scheduleYear = today.getFullYear();
  scheduleMonth = today.getMonth() + 1;
  const _saved = loadScheduleData(scheduleYear, scheduleMonth);
  SCHEDULE_DATA = _saved ? JSON.parse(JSON.stringify(_saved)) : generateScheduleData(scheduleYear, scheduleMonth);
  renderSchedulePage(document.getElementById('contentArea'));
}

function renderMonthGridHtml(year, selectedMonth) {
  const today = new Date();
  const todayY = today.getFullYear(), todayM = today.getMonth() + 1;
  return Array.from({length: 12}, (_, i) => i + 1).map(m => {
    const isSelected = (year === scheduleYear && m === scheduleMonth);
    const isToday    = (year === todayY && m === todayM);
    // 检查该月是否有排班数据
    const hasData    = !!loadScheduleData(year, m);
    return `<button class="mp-month-btn${isSelected ? ' mp-selected' : ''}${isToday ? ' mp-today' : ''}" onclick="pickMonth(${m},${year})">
      <span class="mp-month-num">${m}</span>
      <span class="mp-month-unit">月</span>
      ${hasData ? '<span class="mp-has-data-dot"></span>' : ''}
      ${isToday ? '<span class="mp-today-dot"></span>' : ''}
    </button>`;
  }).join('');
}

function renderMonthGrid() {
  const yearEl = document.getElementById('mpYear');
  if (!yearEl) return;
  const year = parseInt(yearEl.value);
  const grid = document.getElementById('mpMonthGrid');
  if (grid) grid.innerHTML = renderMonthGridHtml(year, scheduleMonth);
}

function pickMonth(month, year) {
  const y = year || (_mpYear || scheduleYear);
  _mpYear = null;
  closeModal();
  scheduleYear = y;
  scheduleMonth = month;
  const _saved = loadScheduleData(scheduleYear, scheduleMonth);
  SCHEDULE_DATA = _saved ? JSON.parse(JSON.stringify(_saved)) : generateScheduleData(scheduleYear, scheduleMonth);
  renderSchedulePage(document.getElementById('contentArea'));
}

// #5: 年份标签点击 — 替换为 input 直接输入
function _mpYearClick() {
  const label = document.getElementById('mpYearLabel');
  if (!label) return;
  const curVal = _mpYear || scheduleYear;
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
    _mpYear = v;
    // 还原为 span
    const span = document.createElement('span');
    span.className = 'mp-year-label';
    span.id = 'mpYearLabel';
    span.textContent = v;
    span.onclick = _mpYearClick;
    span.title = '点击直接输入年份';
    span.style.cssText = 'cursor:pointer;user-select:none';
    input.replaceWith(span);
    // 刷新月份网格
    const grid = document.getElementById('mpMonthGrid');
    if (grid) grid.innerHTML = renderMonthGridHtml(v, scheduleMonth);
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); input.value = curVal; commit(); }
  });
}

