// 数据看板模块
let dashboardTimeRange = 'day';

function renderDashboardPage(container) {
  const totalInReview = QUEUES_DATA.reduce((s, q) => s + q.inReview, 0);
  const totalOutReview = QUEUES_DATA.reduce((s, q) => s + q.outReview, 0);
  const totalBacklog = QUEUES_DATA.reduce((s, q) => s + q.backlog, 0);
  const avgQuality = (QUEUES_DATA.reduce((s, q) => s + q.quality, 0) / QUEUES_DATA.length).toFixed(1);
  const nonLeaderMembers = MEMBERS_DATA.filter(m => !m.excludeFromSchedule);
  const avgEfficiency = Math.round(nonLeaderMembers.reduce((s, m) => s + m.efficiency, 0) / nonLeaderMembers.length);
  const outRate = ((totalOutReview / totalInReview) * 100).toFixed(1);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">数据看板</div>
        <div class="page-subtitle">实时监控审核质量、人效与队列状态</div>
      </div>
      <div class="page-actions">
        <div class="time-range-picker">
          ${['day','week','month'].map(t => `<button class="time-range-btn ${dashboardTimeRange===t?'active':''}" onclick="setTimeRange('${t}')">${t==='day'?'今日':t==='week'?'本周':'本月'}</button>`).join('')}
        </div>
        <button class="btn btn-default btn-sm" onclick="showPage('export')">导出数据</button>
      </div>
    </div>

    <!-- 关联后台快捷入口 -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px">
      <a class="external-link-card" href="https://bi.sankuai.com/dashboard/171551" target="_blank">
        <div class="external-link-icon">📊</div>
        <div class="external-link-info">
          <div class="external-link-title">BI看板 171551</div>
          <div class="external-link-url">bi.sankuai.com</div>
        </div>
        <svg class="external-link-arrow" width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7H11M8 4L11 7L8 10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
      </a>
      <a class="external-link-card" href="https://dpaudit.sankuai.com/content/contentPartition/delineateTaskList" target="_blank">
        <div class="external-link-icon">🔍</div>
        <div class="external-link-info">
          <div class="external-link-title">审核后台</div>
          <div class="external-link-url">dpaudit.sankuai.com</div>
        </div>
        <svg class="external-link-arrow" width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7H11M8 4L11 7L8 10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
      </a>
      <a class="external-link-card" href="https://bi.sankuai.com/dashboard/111337" target="_blank">
        <div class="external-link-icon">📈</div>
        <div class="external-link-info">
          <div class="external-link-title">BI看板 111337</div>
          <div class="external-link-url">bi.sankuai.com</div>
        </div>
        <svg class="external-link-arrow" width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7H11M8 4L11 7L8 10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
      </a>
      <a class="external-link-card" href="https://bi.sankuai.com/dashboard/209057" target="_blank">
        <div class="external-link-icon">📉</div>
        <div class="external-link-info">
          <div class="external-link-title">BI看板 209057</div>
          <div class="external-link-url">bi.sankuai.com</div>
        </div>
        <svg class="external-link-arrow" width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7H11M8 4L11 7L8 10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
      </a>
    </div>

    <!-- KPI卡片 -->
    <div class="kpi-grid">
      <div class="kpi-card green" onclick="showQualityDetail()">
        <div class="kpi-label">团队质量准确率</div>
        <div class="kpi-value">${avgQuality}<span>%</span></div>
        <div class="kpi-trend up">↑ 0.3% 较昨日</div>
        <div class="kpi-sub">目标 ≥ 97%</div>
      </div>
      <div class="kpi-card" onclick="showEfficiencyDetail()">
        <div class="kpi-label">团队平均人效</div>
        <div class="kpi-value">${avgEfficiency}<span>/天</span></div>
        <div class="kpi-trend down">↓ 5 较昨日</div>
        <div class="kpi-sub">修正人效 ${Math.round(avgEfficiency * 0.75)}/天</div>
      </div>
      <div class="kpi-card orange" onclick="showOutRateDetail()">
        <div class="kpi-label">审出率</div>
        <div class="kpi-value">${outRate}<span>%</span></div>
        <div class="kpi-trend flat">→ 持平</div>
        <div class="kpi-sub">进审 ${formatNum(totalInReview)} / 审出 ${formatNum(totalOutReview)}</div>
      </div>
      <div class="kpi-card red" onclick="showBacklogDetail()">
        <div class="kpi-label">当前积压量</div>
        <div class="kpi-value">${formatNum(totalBacklog)}</div>
        <div class="kpi-trend down">↑ 1.2k 较昨日</div>
        <div class="kpi-sub">高风险队列 ${QUEUES_DATA.filter(q=>q.backlog>3000).length} 个</div>
      </div>
    </div>

    <!-- 图表区 -->
    <div class="dashboard-grid">
      <div class="chart-card">
        <div class="chart-card-header">
          <span class="chart-card-title">进审/审出趋势（近7天）</span>
          <div class="time-range-picker">
            <button class="time-range-btn active">7天</button>
            <button class="time-range-btn">14天</button>
            <button class="time-range-btn">30天</button>
          </div>
        </div>
        <div class="chart-card-body">
          <div id="trendChart" style="height:160px"></div>
          <div style="display:flex;gap:16px;margin-top:8px;font-size:12px">
            <span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:3px;background:var(--primary);display:inline-block;border-radius:2px"></span>进审量</span>
            <span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:3px;background:var(--success);display:inline-block;border-radius:2px"></span>审出量</span>
          </div>
        </div>
      </div>
      <div class="chart-card">
        <div class="chart-card-header">
          <span class="chart-card-title">人效排行（今日）</span>
          <button class="btn btn-ghost btn-sm" onclick="showPage('members')">查看全部</button>
        </div>
        <div class="chart-card-body" style="padding:8px 16px">
          <ul class="person-rank-list">
            ${[...MEMBERS_DATA].filter(m=>m.role!=='leader').sort((a,b)=>b.efficiency-a.efficiency).slice(0,8).map((m,i) => {
              const todayShift = getMemberShift(m.id, new Date().getDate());
              const shiftInfo = SHIFTS[todayShift] || SHIFTS.OFF;
              return `<li class="person-rank-item" onclick="showPersonDetail(${m.id})">
                <span class="rank-num ${i<3?'rank-'+(i+1):'rank-other'}">${i+1}</span>
                ${avatarImg(m, 'width:26px;height:26px;border-radius:50%;flex-shrink:0;')}
                <div class="person-rank-info">
                  <div class="person-rank-name" title="${m.name}">${m.name}</div>
                  <div class="person-rank-team" title="${m.team}">${m.team}</div>
                </div>
                <div class="person-rank-right">
                  <span class="person-rank-shift shift-cell ${shiftInfo.color}">${shiftInfo.label}</span>
                  <span class="person-rank-val">${m.efficiency}</span>
                </div>
              </li>`;
            }).join('')}
          </ul>
        </div>
      </div>
    </div>

    <!-- 队列积压 + 质量分布 -->
    <div class="dashboard-grid-3">
      <div class="chart-card" style="grid-column:span 2">
        <div class="chart-card-header">
          <span class="chart-card-title">队列积压状态</span>
          <button class="btn btn-ghost btn-sm" onclick="showPage('queue-manage')">队列管理</button>
        </div>
        <div class="chart-card-body" style="max-height:280px;overflow-y:auto">
          ${[...QUEUES_DATA].sort((a,b)=>b.backlog-a.backlog).map(q => {
            const level = getBacklogLevel(q.backlog);
            const maxBacklog = Math.max(...QUEUES_DATA.map(x=>x.backlog));
            const pct = Math.round(q.backlog / maxBacklog * 100);
            return `<div class="queue-backlog-item">
              <div class="queue-backlog-name" title="${q.name}">${q.name}</div>
              <div class="queue-backlog-bar">
                <div class="progress-bar">
                  <div class="progress-fill ${level==='high'?'progress-red':level==='mid'?'progress-orange':'progress-green'}" style="width:${pct}%"></div>
                </div>
              </div>
              <div class="queue-backlog-val ${level}">${formatNum(q.backlog)}</div>
              <span class="tag tag-${level==='high'?'red':level==='mid'?'orange':'green'}" style="font-size:10px">${level==='high'?'高风险':level==='mid'?'注意':'正常'}</span>
            </div>`;
          }).join('')}
        </div>
      </div>
      <div class="chart-card">
        <div class="chart-card-header"><span class="chart-card-title">质量分布</span></div>
        <div class="chart-card-body">
          <div id="qualityGauge" style="text-align:center;margin-bottom:12px"></div>
          <div style="font-size:12px">
            ${[
              { label: '≥99%', count: MEMBERS_DATA.filter(m=>m.quality>=99).length, color: 'var(--success)' },
              { label: '97-99%', count: MEMBERS_DATA.filter(m=>m.quality>=97&&m.quality<99).length, color: 'var(--primary)' },
              { label: '<97%', count: MEMBERS_DATA.filter(m=>m.quality>0&&m.quality<97).length, color: 'var(--danger)' },
            ].map(item => `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0">
                <span style="display:flex;align-items:center;gap:6px">
                  <span style="width:8px;height:8px;border-radius:50%;background:${item.color};display:inline-block"></span>
                  ${item.label}
                </span>
                <span style="font-weight:600">${item.count}人</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>

    <!-- 人员数据表格 -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">人员审核数据明细</span>
        <div style="display:flex;gap:8px">
          <select class="filter-select" onchange="filterDashTable(this.value)">
            <option value="all">全部团队</option>
            ${TEAMS.map(t=>`<option value="${t}">${t}</option>`).join('')}
          </select>
          <button class="btn btn-default btn-sm" onclick="showPage('export')">导出</button>
        </div>
      </div>
      <div class="card-body" style="padding:0">
        <div class="table-wrap">
          <table class="data-table" id="dashTable">
            <thead>
              <tr>
                <th>人员</th><th>团队</th><th>今日班次</th><th>标准人效</th><th>修正人效</th>
                <th>质量准确率</th><th>今日审出</th><th>积压贡献</th><th>状态</th>
              </tr>
            </thead>
            <tbody>
              ${MEMBERS_DATA.filter(m=>m.role!=='leader').map(m => {
                const todayShift = getMemberShift(m.id, new Date().getDate());
                const shiftInfo = SHIFTS[todayShift] || SHIFTS.OFF;
                const isWorking = todayShift !== 'OFF' && todayShift !== 'LEAVE';
                const todayOut = isWorking ? Math.round(m.efficiency * (0.85 + Math.random() * 0.3)) : 0;
                return `<tr>
                  <td class="col-name" style="cursor:pointer" onclick="showPersonDetail(${m.id})">
                    <div style="display:flex;align-items:center;gap:6px">
                      ${avatarImg(m, '24px')}
                      ${m.name}
                    </div>
                  </td>
                  <td><span class="tag tag-blue">${m.team}</span></td>
                  <td><span class="shift-cell ${shiftInfo.color}" style="display:inline-flex;padding:1px 6px;border-radius:4px;font-size:11px">${shiftInfo.name}</span></td>
                  <td class="col-num">${m.efficiency}</td>
                  <td>${Math.round(m.efficiency * 0.75)}</td>
                  <td class="${m.quality>=98?'col-good':m.quality>=97?'':'col-bad'}">${m.quality}%</td>
                  <td>${todayOut}</td>
                  <td>${isWorking ? Math.round(todayOut * 0.1) : 0}</td>
                  <td><span class="tag ${isWorking?'tag-green':'tag-gray'}">${isWorking?'在岗':todayShift==='LEAVE'?'请假':'休息'}</span></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  // 渲染图表
  setTimeout(() => {
    const trendEl = document.getElementById('trendChart');
    if (trendEl) {
      const days = ['4/2','4/3','4/4','4/5','4/6','4/7','4/8'];
      renderLineChart(trendEl, [
        { data: [42000, 45000, 38000, 51000, 48000, 53000, 49000], color: '#1664FF' },
        { data: [38000, 41000, 35000, 46000, 43000, 48000, 44000], color: '#00B42A' },
      ], days);
    }
    const gaugeEl = document.getElementById('qualityGauge');
    if (gaugeEl) renderQualityGauge(gaugeEl, parseFloat(avgQuality), '#00B42A');
  }, 100);
}

function setTimeRange(range) {
  dashboardTimeRange = range;
  renderDashboardPage(document.getElementById('contentArea'));
}

function filterDashTable(team) {
  const rows = document.querySelectorAll('#dashTable tbody tr');
  rows.forEach(row => {
    if (team === 'all') { row.style.display = ''; return; }
    row.style.display = row.textContent.includes(team) ? '' : 'none';
  });
}

function showQualityDetail() {
  const content = `
    <div class="tabs">
      <div class="tab active">队列维度</div>
      <div class="tab">人员维度</div>
      <div class="tab">标签维度</div>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>队列</th><th>准确率</th><th>审出量</th><th>错误量</th><th>趋势</th></tr></thead>
        <tbody>
          ${QUEUES_DATA.map(q => `<tr>
            <td>${q.name}</td>
            <td class="${q.quality>=98?'col-good':q.quality>=97?'':'col-bad'}">${q.quality}%</td>
            <td>${formatNum(q.outReview)}</td>
            <td>${Math.round(q.outReview * (1 - q.quality/100))}</td>
            <td><span class="trend-up">↑</span></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
  openModal('质量指标详情', content, `<button class="btn btn-default" onclick="closeModal()">关闭</button>`);
}

function showEfficiencyDetail() {
  const sorted = [...MEMBERS_DATA].filter(m=>m.role!=='leader').sort((a,b)=>b.efficiency-a.efficiency);
  const content = `
    <div style="margin-bottom:12px">
      <div class="alert-banner alert-info">ℹ️ 修正人效 = 标准人效 × 75%，用于工时系统时长计算</div>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>排名</th><th>人员</th><th>团队</th><th>标准人效</th><th>修正人效</th><th>等级</th></tr></thead>
        <tbody>
          ${sorted.map((m,i) => `<tr>
            <td><span class="rank-num ${i<3?'rank-'+(i+1):'rank-other'}">${i+1}</span></td>
            <td style="cursor:pointer" onclick="showPersonDetail(${m.id})">${m.name}</td>
            <td>${m.team}</td>
            <td class="col-num">${m.efficiency}</td>
            <td>${Math.round(m.efficiency*0.75)}</td>
            <td><span class="efficiency-badge eff-${getEfficiencyLevel(m.efficiency)}">${getEfficiencyLabel(m.efficiency)}</span></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
  openModal('人效指标详情', content, `<button class="btn btn-default" onclick="closeModal()">关闭</button>`);
}

function showOutRateDetail() {
  const content = `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>队列</th><th>进审量</th><th>审出量</th><th>审出率</th><th>积压</th></tr></thead>
        <tbody>
          ${QUEUES_DATA.map(q => {
            const rate = ((q.outReview/q.inReview)*100).toFixed(1);
            return `<tr>
              <td>${q.name}</td>
              <td>${formatNum(q.inReview)}</td>
              <td>${formatNum(q.outReview)}</td>
              <td class="${parseFloat(rate)>=85?'col-good':parseFloat(rate)>=75?'col-warn':'col-bad'}">${rate}%</td>
              <td class="${getBacklogLevel(q.backlog)==='high'?'col-bad':getBacklogLevel(q.backlog)==='mid'?'col-warn':'col-good'}">${formatNum(q.backlog)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
  openModal('审出率详情', content, `<button class="btn btn-default" onclick="closeModal()">关闭</button>`);
}

function showBacklogDetail() {
  const highRisk = QUEUES_DATA.filter(q => q.backlog > 3000);
  const content = `
    ${highRisk.length > 0 ? `
    <div class="alert-banner alert-danger" style="margin-bottom:12px">
      ⚠️ 当前有 ${highRisk.length} 个队列积压超过3000，建议增加排班人员
    </div>` : ''}
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>队列</th><th>积压量</th><th>风险等级</th><th>所属团队</th><th>建议操作</th></tr></thead>
        <tbody>
          ${[...QUEUES_DATA].sort((a,b)=>b.backlog-a.backlog).map(q => {
            const level = getBacklogLevel(q.backlog);
            return `<tr>
              <td>${q.name}</td>
              <td class="${level==='high'?'col-bad':level==='mid'?'col-warn':'col-good'}">${formatNum(q.backlog)}</td>
              <td><span class="tag tag-${level==='high'?'red':level==='mid'?'orange':'green'}">${level==='high'?'高风险':level==='mid'?'注意':'正常'}</span></td>
              <td>${q.team}</td>
              <td>${level==='high'?'<button class="btn btn-danger btn-sm" onclick="showToast(\'已推送排班建议\',\'success\')">推送排班建议</button>':'—'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
  openModal('积压量详情', content, `<button class="btn btn-default" onclick="closeModal()">关闭</button>`);
}

// 数据导出页
function renderExportPage(container) {
  container.innerHTML = `
    <div class="page-header">
      <div class="page-title">数据导出</div>
      <div class="page-subtitle">导出人效、质量、考勤、工时系统联合报表</div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      ${[
        { title: '人效报表', desc: '各人员标准人效、修正人效、审出量', icon: '📊' },
        { title: '质量报表', desc: '准确率、错误量、队列/标签/人员维度', icon: '✅' },
        { title: '考勤报表', desc: '出勤天数、请假、迟到、三薪统计', icon: '📅' },
        { title: '工时报表', desc: '加班次数、时长、工损统计', icon: '⏰' },
        { title: '联合报表', desc: '人员考勤+人效+工时综合分析', icon: '📋' },
        { title: '审批效率报表', desc: '各审批人处理时长、驳回率统计', icon: '⚡' },
      ].map(item => `
        <div class="card" style="cursor:pointer" onclick="showExportConfig('${item.title}')">
          <div class="card-body" style="display:flex;align-items:center;gap:16px">
            <div style="font-size:32px">${item.icon}</div>
            <div style="flex:1">
              <div style="font-size:14px;font-weight:600;margin-bottom:4px">${item.title}</div>
              <div style="font-size:12px;color:var(--text-tertiary)">${item.desc}</div>
            </div>
            <button class="btn btn-primary btn-sm">导出</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function showExportConfig(title) {
  const content = `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">开始日期</label>
        <input type="date" class="form-control" value="2026-04-01">
      </div>
      <div class="form-group">
        <label class="form-label">结束日期</label>
        <input type="date" class="form-control" value="2026-04-08">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">团队范围</label>
      <select class="form-control">
        <option>全部团队</option>
        ${TEAMS.map(t=>`<option>${t}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">导出格式</label>
      <div style="display:flex;gap:12px">
        <label class="checkbox-wrap"><input type="radio" name="exportFmt" value="xlsx" checked> <span class="checkbox-label">Excel (.xlsx)</span></label>
        <label class="checkbox-wrap"><input type="radio" name="exportFmt" value="csv"> <span class="checkbox-label">CSV (.csv)</span></label>
      </div>
    </div>
  `;
  openModal(`导出 - ${title}`, content, `
    <button class="btn btn-default" onclick="closeModal()">取消</button>
    <button class="btn btn-primary" onclick="executeExport('${title}')">开始导出</button>
  `);
}

function executeExport(title) {
  closeModal();
  showToast(`正在导出 ${title}...`, 'info');
  setTimeout(() => showToast(`${title} 导出成功！`, 'success'), 1500);
  addWorkLog('数据看板', '数据导出', title);
}
