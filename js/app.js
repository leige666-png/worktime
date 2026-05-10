// 应用主入口
let currentPage = 'schedule';

function showPage(page) {
  currentPage = page;
  // 旧页面名映射到新侧边栏项（合并后兼容）
  const navAlias = {
    'ot-records': 'worktime-data', 'ot-report': 'worktime-data',
    'overtime-form': 'worktime-register', 'injury-form': 'worktime-register'
  };
  const navPage = navAlias[page] || page;
  // 更新侧边栏高亮
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === navPage);
  });

  const content = document.getElementById('contentArea');
  content.innerHTML = '';

  switch (page) {
    case 'schedule': renderSchedulePage(content); break;
    case 'members': renderMembersPage(content); break;
    case 'attendance': renderAttendancePage(content); break;
    case 'approval': renderApprovalPage(content); break;
    case 'dashboard': renderDashboardPage(content); break;
    case 'messages': renderMessagesPage(content); break;
    case 'export': renderExportPage(content); break;
    case 'worktime-register': renderWorktimeRegisterPage(content); break;
    case 'overtime-form': renderWorktimeRegisterPage(content, 'overtime'); break;
    case 'injury-form': renderWorktimeRegisterPage(content, 'injury'); break;
    case 'worktime-data': renderWorktimeDataPage(content); break;
    case 'ot-records': renderWorktimeDataPage(content, 'records'); break;
    case 'ot-report': renderWorktimeDataPage(content, 'report'); break;
    case 'queue-manage': renderQueueManagePage(content); break;
    case 'logs': renderLogsPage(content); break;
    case 'settings': renderSettingsPage(content); break;
    default: renderDashboardPage(content);
  }

  // 滚动到顶部
  content.scrollTop = 0;
}

// 初始化
// 注意：index.html 通过动态脚本链式加载（loadNext），所有脚本都在 DOMContentLoaded 之后才开始加载。
// app.js 是第 6 个加载的脚本，此时 schedule.js 等后续脚本还未加载，
// 不能在此直接调用 renderSchedulePage。
// 正确做法：暴露 initApp 函数，由 index.html 的 onAllLoaded 回调调用。
function initApp() {
  showPage('schedule');
  updateBadges();
}

function updateBadges() {
  const pendingApprovals = APPROVAL_RECORDS.filter(r => r.status === 'pending').length;
  const annUnread  = (typeof ANNOUNCEMENTS_DATA !== 'undefined')
    ? ANNOUNCEMENTS_DATA.filter(a => a.status === 'unread').length : 0;
  const unreadMsgs = MESSAGES_DATA.filter(m => !m.read).length + annUnread;

  // 侧边栏 nav-badge：0 时隐藏，>0 时显示
  document.querySelectorAll('.nav-badge').forEach(el => {
    const parent = el.closest('.nav-item');
    if (parent && parent.dataset.page === 'approval') {
      el.textContent = pendingApprovals;
      el.style.display = pendingApprovals > 0 ? '' : 'none';
    }
    if (parent && parent.dataset.page === 'messages') {
      el.textContent = unreadMsgs;
      el.style.display = unreadMsgs > 0 ? '' : 'none';
    }
  });
}

// 人员详情页（统一入口）
function showPersonDetail(memberId) {
  const member = getMemberById(memberId);
  if (!member) return;
  const today = new Date();
  const day = today.getDate();
  const shift = getMemberShift(memberId, day);
  const shiftInfo = getShiftDisplayInfo(shift);
  const _yearStr = String(today.getFullYear()), _monthStr = String(today.getMonth()+1).padStart(2,'0');
  const stats = typeof _getAttStats === 'function' ? _getAttStats(memberId, _yearStr, _monthStr) : (ATTENDANCE_STATS[memberId] || {});
  const otRecords = OVERTIME_RECORDS.filter(r => r.memberId === memberId).slice(0, 5);
  const effLevel = getEfficiencyLevel(member.efficiency);
  const effLabel = getEfficiencyLabel(member.efficiency);

  // 综合预警
  const warnings = [];
  const memberOT = OVERTIME_RECORDS.filter(r => r.memberId === memberId && r.status === 'approved');
  const recentOT = memberOT.filter(r => {
    const d = new Date(r.date);
    const diff = (today - d) / (1000 * 60 * 60 * 24);
    return diff <= 7;
  });
  if (recentOT.length >= 3) warnings.push({ type: 'red', text: `近7天已加班${recentOT.length}次，存在连续加班风险` });
  if (member.quality < 97) warnings.push({ type: 'orange', text: `质量准确率${member.quality}%，低于97%预警线` });
  if (effLevel === 'low') warnings.push({ type: 'orange', text: `人效偏低（${member.efficiency}/天），建议关注` });

  const content = `
    <div class="person-detail-header">
      ${avatarImg(member, 'width:64px;height:64px;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.12);', '')}
      <div class="person-detail-info">
        <div class="person-detail-name">${member.name}</div>
        <div class="person-detail-meta">
          <span class="person-detail-meta-item">🏷️ ${member.mis}</span>
          <span class="person-detail-meta-item">👥 ${member.team}</span>
          <span class="person-detail-meta-item">🔑 ${ROLES[member.role] || member.role}</span>
        </div>
        <div class="person-detail-tags">
          <span class="tag tag-blue">${member.team}</span>
          <span class="efficiency-badge eff-${effLevel}">人效${effLabel} ${member.efficiency}/天</span>
          <span class="tag tag-green">质量 ${member.quality}%</span>
        </div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
      <div class="card">
        <div class="card-header"><span class="card-title">📅 今日排班</span></div>
        <div class="card-body">
          <div class="data-row"><span class="data-row-label">班次</span><span class="data-row-value"><span class="shift-cell ${shiftInfo.color}" style="display:inline-flex;padding:2px 10px;border-radius:4px">${shiftInfo.name}</span></span></div>
          <div class="data-row"><span class="data-row-label">工作时间</span><span class="data-row-value">${shiftInfo.start ? shiftInfo.start + ' - ' + shiftInfo.end : '休息'}</span></div>
          <div class="data-row"><span class="data-row-label">本月出勤</span><span class="data-row-value">${stats.workDays || 0}天</span></div>
          <div class="data-row"><span class="data-row-label">请假天数</span><span class="data-row-value">${stats.leaveDays || 0}天</span></div>
          <div class="data-row"><span class="data-row-label">三薪天数</span><span class="data-row-value">${stats.triplePayDays || 0}天</span></div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">📊 审核绩效</span></div>
        <div class="card-body">
          <div class="data-row"><span class="data-row-label">标准人效</span><span class="data-row-value col-num">${member.efficiency}/天</span></div>
          <div class="data-row"><span class="data-row-label">修正人效(75%)</span><span class="data-row-value">${Math.round(member.efficiency * 0.75)}/天</span></div>
          <div class="data-row"><span class="data-row-label">质量准确率</span><span class="data-row-value ${member.quality >= 98 ? 'col-good' : member.quality >= 97 ? '' : 'col-bad'}">${member.quality}%</span></div>
          <div class="data-row"><span class="data-row-label">人效等级</span><span class="data-row-value"><span class="efficiency-badge eff-${effLevel}">${effLabel}</span></span></div>
        </div>
      </div>
    </div>

    ${warnings.length > 0 ? `
    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><span class="card-title">⚠️ 综合预警</span></div>
      <div class="card-body">
        <ul class="warning-list">
          ${warnings.map(w => `<li class="warning-item warning-item-${w.type}">⚠️ ${w.text}</li>`).join('')}
        </ul>
      </div>
    </div>` : ''}

    <div class="card">
      <div class="card-header"><span class="card-title">⏰ 近期工时记录</span></div>
      <div class="card-body">
        ${otRecords.length === 0 ? '<div class="empty-state"><p>暂无记录</p></div>' : `
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>类型</th><th>日期</th><th>时间</th><th>时长</th><th>队列</th><th>状态</th></tr></thead>
            <tbody>
              ${otRecords.map(r => `
                <tr>
                  <td>${r.type === 'overtime' ? `<span class="ot-type-badge ot-type-${r.otType}">${OT_TYPES.find(t=>t.id===r.otType)?.name||'加班'}</span>` : `<span class="ot-type-badge injury-type-${r.injuryType}">${INJURY_TYPES.find(t=>t.id===r.injuryType)?.name||'工损'}</span>`}</td>
                  <td>${r.date}</td>
                  <td>${r.startTime}-${r.endTime}</td>
                  <td>${r.duration}h</td>
                  <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.queueName}</td>
                  <td><span class="tag ${OT_STATUS[r.status]?.color}">${OT_STATUS[r.status]?.label}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`}
      </div>
    </div>
  `;

  openModal(`人员详情 - ${member.name}`, content, `<button class="btn btn-default" onclick="closeModal()">关闭</button>`);
}
