// 工时系统模块（统一工时登记 + 工时数据）

// ===== 统一工时登记页 =====
// 合并加班登记 + 工损登记为统一表单
// 字段：登记类型、姓名、团队、日期、作业平台、队列、人效、量级、时间、时长、证明

// 当前表单内部状态
let _wtFormState = {
  category: 'overtime',
  subType: 'normal',       // 加班子类型: normal | queue_ot | urgent | holiday
  platform: 'queue',
  queueId: null,
  memberId: null,
  effStandard: 0,
  effCoef: 1,
  useQueueEff: false,      // 是否使用队列天级人效
};

// 工时类型颜色 → CSS 变量名映射（保留供历史记录显示使用）
function _wtColorVar(colorClass) {
  const map = {
    'wt-type-blue': 'primary', 'wt-type-orange': 'warning', 'wt-type-red': 'danger',
    'wt-type-pink': 'danger', 'wt-type-purple': 'purple', 'wt-type-amber': 'warning',
    'wt-type-green': 'success', 'wt-type-cyan': 'info', 'wt-type-indigo': 'primary',
  };
  return map[colorClass] || 'primary';
}

// 类型颜色选项
const WT_COLOR_OPTIONS = [
  { id: 'wt-type-blue', label: '蓝', css: 'var(--primary)' },
  { id: 'wt-type-orange', label: '橙', css: 'var(--warning)' },
  { id: 'wt-type-red', label: '红', css: 'var(--danger)' },
  { id: 'wt-type-green', label: '绿', css: 'var(--success)' },
  { id: 'wt-type-purple', label: '紫', css: 'var(--purple)' },
  { id: 'wt-type-cyan', label: '青', css: '#13C2C2' },
  { id: 'wt-type-pink', label: '粉', css: '#EB2F96' },
  { id: 'wt-type-amber', label: '琥珀', css: '#FA8C16' },
];

function renderWorktimeRegisterPage(container, defaultCategory) {
  if (defaultCategory === 'overtime' || defaultCategory === 'injury') {
    _wtFormState.category = defaultCategory;
  }
  const cat = _wtFormState.category;
  const isManager = isManagerRole();
  const isSelf = !isManager;

  const selfMember = MEMBERS_DATA.find(m => m.mis === CURRENT_USER.mis);
  const defaultTeam = (isSelf && selfMember) ? selfMember.team : TEAMS[0];

  _wtFormState.platform = 'queue';
  _wtFormState.queueId = null;
  _wtFormState.effStandard = (isSelf && selfMember) ? selfMember.efficiency : 0;
  _wtFormState.effCoef = 1;
  _wtFormState.memberId = (isSelf && selfMember) ? selfMember.id : null;

  const teamQueues = getQueuesByTeam(defaultTeam).filter(q => q.status === 'active');

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">工时登记</div>
        <div class="page-subtitle">统一登记加班与工损信息，系统自动校验排班并计算时长</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-default btn-sm" onclick="showPage('worktime-data')">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="vertical-align:-2px;margin-right:4px"><rect x="1.5" y="2" width="11" height="10" rx="1.5" stroke="currentColor" stroke-width="1.2"/><path d="M4.5 5.5h5M4.5 8h3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
          查看记录
        </button>
      </div>
    </div>

    <!-- 步骤指示器 -->
    <div class="wt-step-indicator" id="wtStepIndicator">
      <div class="wt-step active" data-step="1" onclick="wtScrollToSection(1)">
        <span class="wt-step-num">1</span><span class="wt-step-text">人员信息</span>
      </div>
      <div class="wt-step-line" data-line="1"></div>
      <div class="wt-step" data-step="2" onclick="wtScrollToSection(2)">
        <span class="wt-step-num">2</span><span class="wt-step-text">业务关联</span>
      </div>
      <div class="wt-step-line" data-line="2"></div>
      <div class="wt-step" data-step="3" onclick="wtScrollToSection(3)">
        <span class="wt-step-num">3</span><span class="wt-step-text">时间信息</span>
      </div>
      <div class="wt-step-line" data-line="3"></div>
      <div class="wt-step" data-step="4" onclick="wtScrollToSection(4)">
        <span class="wt-step-num">4</span><span class="wt-step-text">证明材料</span>
      </div>
    </div>

    <div class="ot-form-layout">
      <div class="ot-form-main">

        <!-- 登记类型切换 -->
        <div class="wt-category-switcher">
          <button class="wt-cat-btn ${cat === 'overtime' ? 'active' : ''}" data-cat="overtime" onclick="wtSwitchCategory('overtime')">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.3"/><path d="M8 4.5V8.5L10.5 10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
            加班登记
          </button>
          <button class="wt-cat-btn ${cat === 'injury' ? 'active' : ''}" data-cat="injury" onclick="wtSwitchCategory('injury')">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 2H10V6H14V10H10V14H6V10H2V6H6V2Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
            工损登记
          </button>
        </div>

        ${cat === 'overtime' ? `
        <!-- 加班子类型选择 -->
        <div class="wt-subtype-group" id="wtSubTypeGroup">
          <label class="wt-subtype-card ${_wtFormState.subType === 'normal' ? 'selected' : ''}" onclick="wtSelectSubType('normal')">
            <span class="wt-subtype-icon">🕐</span>
            <span class="wt-subtype-name">普通加班</span>
          </label>
          <label class="wt-subtype-card wt-subtype-queue ${_wtFormState.subType === 'queue_ot' ? 'selected' : ''}" onclick="wtSelectSubType('queue_ot')">
            <span class="wt-subtype-icon">📋</span>
            <span class="wt-subtype-name">队列加班</span>
            <span class="wt-subtype-tag">自动人效</span>
          </label>
          <label class="wt-subtype-card ${_wtFormState.subType === 'urgent' ? 'selected' : ''}" onclick="wtSelectSubType('urgent')">
            <span class="wt-subtype-icon">⚡</span>
            <span class="wt-subtype-name">紧急任务</span>
          </label>
          <label class="wt-subtype-card ${_wtFormState.subType === 'holiday' ? 'selected' : ''}" onclick="wtSelectSubType('holiday')">
            <span class="wt-subtype-icon">📅</span>
            <span class="wt-subtype-name">节假日</span>
          </label>
        </div>
        ` : ''}

        <!-- Section 1: 人员信息 -->
        <div class="ot-form-section" data-section="1">
          <div class="ot-form-section-title">
            <span class="section-num">1</span>
            人员信息
          </div>
          ${isSelf ? `
          <div class="wt-self-info">
            ${selfMember ? avatarImg(selfMember, '36px') : ''}
            <div class="wt-self-detail">
              <div class="wt-self-name">${selfMember ? selfMember.name : CURRENT_USER.name}<span class="wt-self-mis">${selfMember ? selfMember.mis : ''}</span></div>
              <div class="wt-self-team">${defaultTeam}${selfMember ? ' · 标准人效 ' + selfMember.efficiency + '/天' : ''}</div>
            </div>
            <input type="hidden" id="wtTeam" value="${defaultTeam}">
            <input type="hidden" id="wtMember" value="${selfMember ? selfMember.id : ''}">
          </div>` : `
          <div class="form-row">
            <div class="form-group">
              <label class="form-label required">团队</label>
              <select class="form-control" id="wtTeam" onchange="wtOnTeamChange()">
                ${TEAMS.map(t => `<option value="${t}" ${t === defaultTeam ? 'selected' : ''}>${t}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label required">人员</label>
              <select class="form-control" id="wtMember" onchange="wtOnMemberChange()">
                <option value="">请选择人员</option>
                ${getMembersByTeam(defaultTeam).map(m => `<option value="${m.id}">${m.name}（${m.mis}）</option>`).join('')}
              </select>
            </div>
          </div>`}
          <div class="form-group" style="margin-top:${isSelf ? '12' : '0'}px">
            <label class="form-label required">日期</label>
            <div class="wt-date-row">
              <input type="date" class="form-control" id="wtDate" value="${formatDate(new Date())}" onchange="wtOnDateChange()" style="flex:1">
              <span class="wt-weekday" id="wtWeekday">${getWeekDay(new Date())}</span>
            </div>
          </div>
          <div id="wtScheduleHint" class="schedule-hint" style="display:none">
            <span class="schedule-hint-icon">📅</span>
            <span id="wtScheduleHintText"></span>
          </div>
        </div>

        <!-- Section 2: 业务关联 -->
        <div class="ot-form-section" data-section="2">
          <div class="ot-form-section-title">
            <span class="section-num">2</span>
            业务关联
          </div>
          <div class="form-group">
            <label class="form-label required">作业平台</label>
            <div class="wt-platform-group">
              ${WORK_PLATFORMS.map((p, i) => `
                <label class="wt-platform-card ${i === 0 ? 'selected' : ''}" data-pid="${p.id}" onclick="wtSelectPlatform('${p.id}')">
                  <span class="wt-plat-icon">${p.icon}</span>
                  <div class="wt-plat-text">
                    <span class="wt-plat-name">${p.name}</span>
                    <span class="wt-plat-desc">${p.desc}</span>
                  </div>
                  <input type="radio" name="wtPlatform" value="${p.id}" ${i === 0 ? 'checked' : ''} style="display:none">
                </label>
              `).join('')}
            </div>
          </div>
          <div class="form-group" id="wtQueueRow">
            <label class="form-label required">关联队列</label>
            <select class="form-control" id="wtQueue" onchange="wtOnQueueChange()">
              <option value="">请选择队列</option>
              ${teamQueues.map(q => `<option value="${q.id}" data-coef="${q.effCoef}">${q.name}（ID:${q.id}，人效 ${q.effTarget || '—'}/天，系数 ${q.effCoef}）</option>`).join('')}
            </select>
          </div>
          <div class="wt-eff-row" id="wtEffRow">
            <div class="wt-eff-card">
              <div class="wt-eff-label" id="wtEffStdLabel">标准人效</div>
              <div class="wt-eff-value" id="wtEffStandard">${_wtFormState.effStandard || '—'}<span class="wt-eff-unit">/天</span></div>
            </div>
            <div class="wt-eff-arrow">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M10 5l3 3-3 3" stroke="var(--text-quaternary)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
            <div class="wt-eff-card wt-eff-corrected">
              <div class="wt-eff-label">修正人效 <span class="wt-eff-coef" id="wtCoefTag">×1.00</span></div>
              <div class="wt-eff-value" id="wtEffCorrected">${_wtFormState.effStandard || '—'}<span class="wt-eff-unit">/天</span></div>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label required">量级</label>
            <input type="number" class="form-control" id="wtVolume" placeholder="请输入实际审核量级" min="0" oninput="wtCalcDuration()">
          </div>
        </div>

        <!-- Section 3: 时间信息（参考） -->
        <div class="ot-form-section" data-section="3">
          <div class="ot-form-section-title">
            <span class="section-num">3</span>
            时间信息 <span class="wt-section-hint">（参考，认定时长以量级折算为准）</span>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">开始时间</label>
              <input type="time" class="form-control" id="wtStartTime" onchange="wtCalcDuration()">
            </div>
            <div class="form-group">
              <label class="form-label">结束时间</label>
              <input type="time" class="form-control" id="wtEndTime" onchange="wtCalcDuration()">
            </div>
          </div>
          <div class="wt-duration-bar" id="wtDurationBar" style="display:none">
            <div class="wt-dur-item wt-dur-item-primary">
              <span class="wt-dur-label">认定时长 <span class="wt-dur-badge">量级折算</span></span>
              <span class="wt-dur-value wt-dur-calc" id="wtDurCalc">—</span>
            </div>
            <div class="wt-dur-sep"></div>
            <div class="wt-dur-item">
              <span class="wt-dur-label">时间参考</span>
              <span class="wt-dur-value" id="wtDurActual">—</span>
            </div>
            <div class="wt-dur-sep"></div>
            <div class="wt-dur-item">
              <span class="wt-dur-label">差异</span>
              <span class="wt-dur-value" id="wtDurDiff">—</span>
            </div>
          </div>
          <div id="wtTimeValidation"></div>
        </div>

        <!-- Section 4: 证明材料 -->
        <div class="ot-form-section" data-section="4">
          <div class="ot-form-section-title">
            <span class="section-num">4</span>
            证明材料
          </div>
          <div class="form-group">
            <label class="form-label">${cat === 'injury' ? '工损描述' : '备注说明'}</label>
            <textarea class="form-control" id="wtRemark" rows="2" placeholder="${cat === 'injury' ? '请描述工损情况' : '如有特殊情况请备注说明（选填）'}"></textarea>
          </div>
          <div class="upload-area" onclick="triggerFileUpload('worktime')" id="uploadArea">
            <input type="file" id="otFileInput" style="display:none" accept=".jpg,.jpeg,.png,.pdf" multiple onchange="handleOTFileUpload(this)">
            <div class="upload-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 16V8M12 8L9 11M12 8L15 11" stroke="var(--text-tertiary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 16V18C20 19.1 19.1 20 18 20H6C4.9 20 4 19.1 4 18V16" stroke="var(--text-tertiary)" stroke-width="1.5" stroke-linecap="round"/></svg>
            </div>
            <div class="upload-text">${cat === 'injury' ? '上传截图或相关文件（必传）' : '上传截图或相关文件（可选）'}</div>
            <div class="upload-hint">支持 JPG、PNG、PDF，单文件不超过10MB</div>
          </div>
        </div>

        <!-- 提交按钮 -->
        <div class="wt-submit-row">
          <button class="btn btn-default btn-lg" onclick="wtSaveDraft()">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="vertical-align:-2px;margin-right:4px"><path d="M2 10V12H12V10M7 2V9M7 9L4 6.5M7 9L10 6.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            保存草稿
          </button>
          <button class="btn btn-primary btn-lg" onclick="wtSubmitForm()">提交申请</button>
        </div>
      </div>

      <!-- 右侧：信息面板 -->
      <div class="ot-form-aside">
        <!-- 月度配额卡片 -->
        <div class="ot-aside-card wt-quota-card" id="wtQuotaCard">
          <div class="ot-aside-title" style="display:flex;align-items:center;justify-content:space-between">
            <span style="display:flex;align-items:center;gap:6px">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="3" width="12" height="8" rx="1.5" stroke="var(--warning)" stroke-width="1.3"/><path d="M4 6h6M4 8.5h3" stroke="var(--warning)" stroke-width="1.2" stroke-linecap="round"/></svg>
              本月配额
            </span>
            ${isManager ? '<button class="btn btn-ghost btn-sm wt-aside-edit-btn" onclick="wtOpenQuotaEditor()" title="编辑配额设置"><svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2.5 11.5l.7-2.8L9.3 2.6a1 1 0 011.4 0l1 1a1 1 0 010 1.4L5.5 11l-3 .5z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' : ''}
          </div>
          ${(() => {
            const now = new Date();
            const monthStart = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
            const monthEnd = formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
            // 全量本月记录（不按人员筛选，用于团队占比计算）
            const allMonthCat = OVERTIME_RECORDS.filter(r => r.type === cat && r.date >= monthStart && r.date <= monthEnd && (r.status === 'approved' || r.status === 'pending'));
            const totalHours = allMonthCat.reduce((s, r) => s + (r.duration || 0), 0);
            const totalCount = allMonthCat.length;

            // 各团队占比
            const teamMap = {};
            allMonthCat.forEach(r => {
              const t = r.team || '未知';
              if (!teamMap[t]) teamMap[t] = { hours: 0, count: 0 };
              teamMap[t].hours += (r.duration || 0);
              teamMap[t].count += 1;
            });
            const teamArr = Object.entries(teamMap).sort((a, b) => b[1].hours - a[1].hours);
            const teamColors = ['var(--primary)', 'var(--success)', 'var(--warning)', 'var(--danger)', 'var(--purple)', '#13C2C2'];

            const teamBarHtml = totalHours > 0 ? `
              <div class="wt-quota-team-bar">
                ${teamArr.map(([, v], i) => `<div style="width:${(v.hours / totalHours * 100).toFixed(1)}%;background:${teamColors[i % teamColors.length]}" title="${(v.hours / totalHours * 100).toFixed(0)}%"></div>`).join('')}
              </div>
              <div class="wt-quota-team-legend">
                ${teamArr.map(([name, v], i) => `<span class="wt-quota-team-tag"><span class="wt-quota-team-dot" style="background:${teamColors[i % teamColors.length]}"></span>${name} ${(v.hours / totalHours * 100).toFixed(0)}%</span>`).join('')}
              </div>
            ` : '<div style="font-size:11px;color:var(--text-tertiary);text-align:center;padding:6px 0">暂无数据</div>';

            const quotaCfg = _wtGetQuotaConfig();
            const maxOT = quotaCfg.maxOTHours;
            const catLabel = cat === 'overtime' ? '加班' : '工损';
            const accentColor = cat === 'overtime' ? '' : 'color:var(--danger)';

            if (cat === 'overtime') {
              const otPct = Math.min((totalHours / maxOT) * 100, 100);
              const isOver = totalHours > maxOT * (quotaCfg.warnPct / 100);
              return `
                <div class="wt-quota-item">
                  <div class="wt-quota-header">
                    <span>加班时长</span>
                    <span class="${isOver ? 'wt-quota-warn' : ''}">${totalHours.toFixed(1)}h / ${maxOT}h</span>
                  </div>
                  <div class="wt-quota-bar">
                    <div class="wt-quota-fill ${isOver ? 'warn' : ''}" style="width:${otPct}%"></div>
                  </div>
                </div>
                <div class="wt-quota-item">
                  <div class="wt-quota-header">
                    <span>加班次数</span>
                    <span>${totalCount} 次</span>
                  </div>
                </div>
                ${isOver ? '<div class="wt-quota-alert">⚠️ 月度加班时长已超过阈值，请合理安排</div>' : ''}
                <div class="wt-quota-item" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border-light)">
                  <div class="wt-quota-header" style="margin-bottom:6px"><span>各团队加班占比</span></div>
                  ${teamBarHtml}
                </div>
              `;
            } else {
              return `
                <div class="wt-quota-item">
                  <div class="wt-quota-header">
                    <span>工损时长</span>
                    <span style="color:var(--danger)">${totalHours.toFixed(1)}h</span>
                  </div>
                </div>
                <div class="wt-quota-item">
                  <div class="wt-quota-header">
                    <span>工损次数</span>
                    <span style="color:var(--danger)">${totalCount} 次</span>
                  </div>
                </div>
                <div class="wt-quota-item" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border-light)">
                  <div class="wt-quota-header" style="margin-bottom:6px"><span>各团队工损占比</span></div>
                  ${teamBarHtml}
                </div>
              `;
            }
          })()}
        </div>

        <div class="ot-aside-card" style="margin-top:12px">
          <div class="ot-aside-title" style="display:flex;align-items:center;justify-content:space-between">
            <span style="display:flex;align-items:center;gap:6px">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="var(--primary)" stroke-width="1.3"/><path d="M7 6v4M7 4.5v.5" stroke="var(--primary)" stroke-width="1.3" stroke-linecap="round"/></svg>
              填写说明
            </span>
            ${isManager ? '<button class="btn btn-ghost btn-sm wt-aside-edit-btn" onclick="wtOpenTipsEditor()" title="编辑填写说明"><svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2.5 11.5l.7-2.8L9.3 2.6a1 1 0 011.4 0l1 1a1 1 0 010 1.4L5.5 11l-3 .5z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' : ''}
          </div>
          <div class="ot-aside-list" id="wtAsideTips">
            ${_renderWtAsideTips(cat)}
          </div>
        </div>

        <div class="ot-aside-card" style="margin-top:12px">
          <div class="ot-aside-title">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="2" width="12" height="10" rx="1.5" stroke="var(--success)" stroke-width="1.3"/><path d="M4 6h6M4 8.5h4" stroke="var(--success)" stroke-width="1.3" stroke-linecap="round"/></svg>
            班次参考
          </div>
          <div style="font-size:12px">
            ${Object.entries(SHIFTS).filter(([k]) => k !== 'OFF' && k !== 'LEAVE').map(([k, s]) => `
            <div style="display:flex;align-items:center;padding:5px 0;border-bottom:1px solid var(--border-light)">
              <span class="shift-cell ${s.color}" style="width:30%;flex-shrink:0;padding:1px 8px;border-radius:4px;font-size:11px;text-align:center;box-sizing:border-box">${s.name}</span>
              <span style="width:70%;color:var(--text-secondary);text-align:right">${s.start} – ${s.end}</span>
            </div>`).join('')}
          </div>
        </div>

        <div class="ot-aside-card" style="margin-top:12px">
          <div class="ot-aside-title">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1L8.8 5H13L9.6 7.6L10.9 12L7 9.4L3.1 12L4.4 7.6L1 5H5.2L7 1Z" stroke="var(--warning)" stroke-width="1.3" stroke-linejoin="round"/></svg>
            今日在班
          </div>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:6px">
            ${TEAMS.map(team => {
              const teamMembers = MEMBERS_DATA.filter(m => m.team === team && !m.excludeFromSchedule);
              const working = teamMembers.filter(m => {
                const s = getMemberShift(m.id, new Date().getDate());
                return s !== 'OFF' && !isLeaveShift(s);
              }).length;
              return `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-light)">
                <span>${team}</span>
                <span style="font-weight:600;color:var(--text-primary)">${working}/${teamMembers.length}</span>
              </div>`;
            }).join('')}
          </div>
        </div>

        <!-- 近期登记摘要 -->
        <div class="ot-aside-card" style="margin-top:12px">
          <div class="ot-aside-title">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2" y="1" width="10" height="12" rx="1.5" stroke="var(--text-secondary)" stroke-width="1.2"/><path d="M5 4h4M5 6.5h4M5 9h2" stroke="var(--text-secondary)" stroke-width="1.1" stroke-linecap="round"/></svg>
            近7天记录
          </div>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:6px">
            ${(() => {
              const now = new Date();
              const d7 = new Date(now); d7.setDate(d7.getDate() - 7);
              const recent = OVERTIME_RECORDS.filter(r => r.date >= formatDate(d7));
              const otCount = recent.filter(r => r.type === 'overtime').length;
              const injCount = recent.filter(r => r.type === 'injury').length;
              const totalH = recent.reduce((s, r) => s + (r.duration || 0), 0);
              return `
                <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-light)">
                  <span>加班</span><span style="font-weight:600;color:var(--primary)">${otCount} 次</span>
                </div>
                <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-light)">
                  <span>工损</span><span style="font-weight:600;color:var(--danger)">${injCount} 次</span>
                </div>
                <div style="display:flex;justify-content:space-between;padding:4px 0">
                  <span>总时长</span><span style="font-weight:600;color:var(--text-primary)">${totalH.toFixed(1)}h</span>
                </div>`;
            })()}
          </div>
        </div>
      </div>
    </div>
  `;

  // 初始化：审核员自动触发排班提示
  if (isSelf && selfMember) {
    wtOnDateChange();
  }

  // 初始化步骤滚动追踪
  _wtInitStepTracker();

  // 自动保存草稿 & 恢复
  _wtStartAutoSave();
  _wtRestoreDraft();
}

// ---- 步骤指示器：滚动追踪 & 点击跳转 ----
let _wtStepObserver = null;
function _wtInitStepTracker() {
  if (_wtStepObserver) { _wtStepObserver.disconnect(); _wtStepObserver = null; }
  const sections = document.querySelectorAll('.ot-form-section[data-section]');
  if (!sections.length) return;

  _wtStepObserver = new IntersectionObserver((entries) => {
    let topSection = null;
    let topY = Infinity;
    sections.forEach(sec => {
      const rect = sec.getBoundingClientRect();
      if (rect.top < 200 && rect.top < topY) { topY = rect.top; topSection = sec; }
    });
    // fallback：如果没有在视口上半部的，取第一个可见的
    if (!topSection) {
      entries.forEach(e => { if (e.isIntersecting && !topSection) topSection = e.target; });
    }
    if (!topSection) return;
    const activeStep = parseInt(topSection.dataset.section);
    _wtUpdateStepIndicator(activeStep);
  }, { threshold: [0, 0.3, 0.6], rootMargin: '-80px 0px -40% 0px' });

  sections.forEach(sec => _wtStepObserver.observe(sec));
}

function _wtUpdateStepIndicator(activeStep) {
  const indicator = document.getElementById('wtStepIndicator');
  if (!indicator) return;
  indicator.querySelectorAll('.wt-step').forEach(el => {
    const s = parseInt(el.dataset.step);
    el.classList.remove('active', 'done');
    if (s === activeStep) el.classList.add('active');
    else if (s < activeStep) el.classList.add('done');
  });
  indicator.querySelectorAll('.wt-step-line').forEach(el => {
    const l = parseInt(el.dataset.line);
    el.classList.toggle('done', l < activeStep);
  });
}

function wtScrollToSection(step) {
  const sec = document.querySelector(`.ot-form-section[data-section="${step}"]`);
  if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ---- 辅助渲染函数 ----

// ---- 填写说明渲染（管理员可自定义） ----

// 默认提示内容
const _WT_DEFAULT_TIPS = {
  overtime: [
    '加班须在<strong>次日12:00前</strong>完成登记，逾期需补充说明',
    '紧急任务加班需提前获得<strong>TL审批</strong>，节假日加班需提前<strong>3天</strong>申请',
    '加班量级填写<strong>实际审核量</strong>，系统将自动计算折算时长',
    '时间段需与排班系统<strong>不重叠</strong>，否则将触发冲突提示',
  ],
  injury: [
    '工损须在<strong>发生当日</strong>完成登记，并上传截图或相关文件',
    '相关文件需包含<strong>有效凭证</strong>及日期信息',
    '工损期间<strong>不计入</strong>人效考核，但需每日更新状态',
    '严重工损请同时通知<strong>HR</strong>及直属TL',
  ],
};

// 默认配额配置
const _WT_DEFAULT_QUOTA = { maxOTHours: 36, warnPct: 80 };

function _wtGetQuotaConfig() {
  try {
    const raw = localStorage.getItem('glxt_wt_quota_config');
    if (raw) { const c = JSON.parse(raw); return { maxOTHours: c.maxOTHours || 36, warnPct: c.warnPct || 80 }; }
  } catch(e) {}
  return { ..._WT_DEFAULT_QUOTA };
}
function _wtSaveQuotaConfig(cfg) {
  localStorage.setItem('glxt_wt_quota_config', JSON.stringify(cfg));
}

function _wtGetTipsConfig() {
  try {
    const raw = localStorage.getItem('glxt_wt_tips_config');
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  return null; // null 表示使用默认
}
function _wtSaveTipsConfig(cfg) {
  localStorage.setItem('glxt_wt_tips_config', JSON.stringify(cfg));
}

function _renderWtAsideTips(cat) {
  const custom = _wtGetTipsConfig();
  const tips = (custom && custom[cat]) ? custom[cat] : _WT_DEFAULT_TIPS[cat];
  const dotClass = cat === 'overtime' ? 'blue' : 'orange';
  return tips.map(t => `<div class="ot-aside-item"><span class="ot-aside-dot ${dotClass}"></span><span>${t}</span></div>`).join('');
}

// ---- 表单交互函数 ----

function wtSwitchCategory(cat) {
  _wtFormState.category = cat;
  _wtFormState.subType = 'normal';
  _wtFormState.useQueueEff = false;
  // 重新渲染整个页面
  const content = document.getElementById('contentArea');
  if (content) renderWorktimeRegisterPage(content, cat);
}

// ---- 加班子类型选择 ----
function wtSelectSubType(subType) {
  _wtFormState.subType = subType;
  // 更新选中状态
  document.querySelectorAll('.wt-subtype-card').forEach(c => c.classList.remove('selected'));
  const card = document.querySelector(`.wt-subtype-card[onclick*="${subType}"]`);
  if (card) card.classList.add('selected');

  if (subType === 'queue_ot') {
    // 队列加班：强制切换到队列平台，使用队列天级人效
    _wtFormState.useQueueEff = true;
    _wtFormState.platform = 'queue';
    // 更新平台选择UI
    document.querySelectorAll('.wt-platform-card').forEach(c => c.classList.remove('selected'));
    const queueCard = document.querySelector('.wt-platform-card[data-pid="queue"]');
    if (queueCard) { queueCard.classList.add('selected'); queueCard.querySelector('input').checked = true; }
    const queueRow = document.getElementById('wtQueueRow');
    if (queueRow) { queueRow.style.display = ''; queueRow.classList.add('wt-queue-row-active'); }
    // 如果已选队列，用队列人效
    if (_wtFormState.queueId) {
      const q = getQueueById(_wtFormState.queueId);
      if (q && q.effTarget) {
        _wtFormState.effStandard = q.effTarget;
      }
    }
    _updateEffDisplay();
    // 显示队列人效提示
    _showQueueEffHint(true);
  } else {
    // 非队列加班：恢复个人人效
    _wtFormState.useQueueEff = false;
    const memberId = _wtFormState.memberId || parseInt(document.getElementById('wtMember')?.value);
    const member = memberId ? getMemberById(memberId) : null;
    _wtFormState.effStandard = member ? member.efficiency : 0;
    _updateEffDisplay();
    _showQueueEffHint(false);
    _hideQueueAutoFill();
    const queueRow = document.getElementById('wtQueueRow');
    if (queueRow) queueRow.classList.remove('wt-queue-row-active');
  }
  wtCalcDuration();
}

function _showQueueEffHint(show) {
  let hint = document.getElementById('wtQueueEffHint');
  if (show) {
    if (!hint) {
      hint = document.createElement('div');
      hint.id = 'wtQueueEffHint';
      hint.className = 'wt-queue-eff-hint';
      const effRow = document.getElementById('wtEffRow');
      if (effRow) effRow.parentNode.insertBefore(hint, effRow.nextSibling);
    }
    hint.innerHTML = '<span class="wt-qeh-icon">💡</span> <b>队列加班时长计算：</b>认定时长 = 量级 ÷ 队列天级人效 × 8h<br><span style="opacity:0.7">例：队列人效1000条/天 → 填250条 = <b>2小时</b>（250 ÷ 1000 × 8）</span>';
    hint.style.display = 'block';
  } else {
    if (hint) hint.style.display = 'none';
  }
}

function wtSelectPlatform(pid) {
  _wtFormState.platform = pid;
  document.querySelectorAll('.wt-platform-card').forEach(c => c.classList.remove('selected'));
  const card = document.querySelector(`.wt-platform-card[data-pid="${pid}"]`);
  if (card) { card.classList.add('selected'); card.querySelector('input').checked = true; }

  const queueRow = document.getElementById('wtQueueRow');
  const plat = WORK_PLATFORMS.find(p => p.id === pid);
  if (queueRow) {
    queueRow.style.display = (plat && plat.hasQueue) ? '' : 'none';
  }
  // 非队列平台时清空人效系数
  if (!plat || !plat.hasQueue) {
    _wtFormState.effCoef = 1;
    _wtFormState.queueId = null;
    _updateEffDisplay();
  }
}

function wtOnTeamChange() {
  const team = document.getElementById('wtTeam')?.value;
  const memberSel = document.getElementById('wtMember');
  if (!memberSel) return;
  const members = getMembersByTeam(team);
  memberSel.innerHTML = '<option value="">请选择人员</option>' +
    members.map(m => `<option value="${m.id}">${m.name}（${m.mis}）</option>`).join('');

  // 刷新队列列表
  _refreshQueueList(team);

  _wtFormState.memberId = null;
  _wtFormState.effStandard = 0;
  _wtFormState.effCoef = 1;
  _updateEffDisplay();
  document.getElementById('wtScheduleHint').style.display = 'none';
}

function wtOnMemberChange() {
  const memberId = parseInt(document.getElementById('wtMember')?.value);
  const member = getMemberById(memberId);
  _wtFormState.memberId = memberId || null;
  _wtFormState.effStandard = member ? member.efficiency : 0;
  _updateEffDisplay();
  wtOnDateChange();
}

function wtOnDateChange() {
  const memberId = _wtFormState.memberId || parseInt(document.getElementById('wtMember')?.value);
  const dateVal = document.getElementById('wtDate')?.value;
  // 更新星期
  const weekday = document.getElementById('wtWeekday');
  if (weekday && dateVal) weekday.textContent = getWeekDay(dateVal);

  if (!memberId || !dateVal) return;
  const day = new Date(dateVal).getDate();
  const shift = getMemberShift(memberId, day);
  const shiftInfo = getShiftDisplayInfo(shift);
  const hint = document.getElementById('wtScheduleHint');
  const hintText = document.getElementById('wtScheduleHintText');
  if (hint && hintText) {
    hint.style.display = 'flex';
    if (shiftInfo.start) {
      hintText.innerHTML = `当日班次：<strong>${shiftInfo.name}</strong>，工作时间 ${shiftInfo.start}–${shiftInfo.end}`;
    } else {
      hintText.innerHTML = `当日状态：<strong>${shiftInfo.name}</strong>（非工作日）`;
    }
  }
}

function wtOnQueueChange() {
  const sel = document.getElementById('wtQueue');
  if (!sel) return;
  const queueId = parseInt(sel.value);
  const queue = getQueueById(queueId);
  _wtFormState.queueId = queueId || null;
  _wtFormState.effCoef = queue ? queue.effCoef : 1;

  // 队列加班模式：使用队列天级人效替代个人人效
  if (_wtFormState.useQueueEff && queue) {
    _wtFormState.effStandard = queue.effTarget || 0;
    // 队列加班时系数固定为1（天级人效已包含系数含义）
    _wtFormState.effCoef = 1;
    // 显示自动填充通知
    _showQueueAutoFill(queue);
  } else {
    _hideQueueAutoFill();
  }

  _updateEffDisplay();
  wtCalcDuration();
}

function _showQueueAutoFill(queue) {
  let nf = document.getElementById('wtQueueAutoFill');
  if (!nf) {
    nf = document.createElement('div');
    nf.id = 'wtQueueAutoFill';
    nf.className = 'wt-queue-autofill';
    const queueRow = document.getElementById('wtQueueRow');
    if (queueRow) queueRow.parentNode.insertBefore(nf, queueRow.nextSibling);
  }
  nf.innerHTML = `<span class="wt-af-icon">✨</span><span><b>已选择队列「${queue.name}」</b>，天级人效 <b>${queue.effTarget || '—'}</b> 条/天 系数 <b>${queue.effCoef}</b> 已自动填入</span>`;
  nf.style.display = 'flex';
  // 闪烁动画重触
  nf.classList.remove('wt-af-flash');
  void nf.offsetWidth;
  nf.classList.add('wt-af-flash');
}

function _hideQueueAutoFill() {
  const nf = document.getElementById('wtQueueAutoFill');
  if (nf) nf.style.display = 'none';
}

function _refreshQueueList(team) {
  const queueSel = document.getElementById('wtQueue');
  if (!queueSel) return;
  const queues = getQueuesByTeam(team).filter(q => q.status === 'active');
  queueSel.innerHTML = '<option value="">请选择队列</option>' +
    queues.map(q => `<option value="${q.id}" data-coef="${q.effCoef}">${q.name}（ID:${q.id}，人效 ${q.effTarget || '—'}/天，系数 ${q.effCoef}）</option>`).join('');
  _wtFormState.queueId = null;
  _wtFormState.effCoef = 1;
}

function _updateEffDisplay() {
  const std = _wtFormState.effStandard;
  const coef = _wtFormState.effCoef;
  const corrected = std ? Math.round(std * coef) : 0;

  const elStd = document.getElementById('wtEffStandard');
  const elCorr = document.getElementById('wtEffCorrected');
  const elCoef = document.getElementById('wtCoefTag');
  const elStdLabel = document.getElementById('wtEffStdLabel');

  // 队列加班模式下标签不同
  if (elStdLabel) {
    elStdLabel.textContent = _wtFormState.useQueueEff ? '队列天级人效' : '标准人效';
  }

  if (elStd) elStd.innerHTML = `${std || '—'}<span class="wt-eff-unit">/天</span>`;
  if (elCorr) elCorr.innerHTML = `${corrected || '—'}<span class="wt-eff-unit">/天</span>`;
  if (elCoef) elCoef.textContent = `×${coef.toFixed(2)}`;
}

function wtCalcDuration() {
  const start = document.getElementById('wtStartTime')?.value;
  const end = document.getElementById('wtEndTime')?.value;
  const volume = parseFloat(document.getElementById('wtVolume')?.value) || 0;
  const bar = document.getElementById('wtDurationBar');
  const durActual = document.getElementById('wtDurActual');
  const durCalc = document.getElementById('wtDurCalc');
  const durDiff = document.getElementById('wtDurDiff');
  const validation = document.getElementById('wtTimeValidation');

  // 量级折算（核心认定时长）
  const eff = _wtFormState.effStandard * _wtFormState.effCoef;
  let calcH = 0;
  if (volume > 0 && eff > 0) {
    calcH = (volume / eff * 8);
  }

  // 时间差（仅作参考）
  let timeDur = 0;
  if (start && end) {
    timeDur = calcHourDiff(start, end);
    if (timeDur <= 0) {
      if (validation) validation.innerHTML = '<div class="validation-error">⚠️ 结束时间必须晚于开始时间</div>';
    }
  }

  // 只要有量级就显示时长条
  const showBar = (volume > 0 && eff > 0) || (start && end && timeDur > 0);
  if (bar) bar.style.display = showBar ? 'flex' : 'none';
  if (!showBar) return;

  // 认定时长 = 量级折算（主）
  if (volume > 0 && eff > 0) {
    if (durCalc) {
      durCalc.textContent = calcH.toFixed(1) + 'h';
      durCalc.className = 'wt-dur-value wt-dur-calc wt-dur-primary';
    }
  } else {
    if (durCalc) { durCalc.textContent = '—'; durCalc.className = 'wt-dur-value wt-dur-calc'; }
  }

  // 时间参考
  if (start && end && timeDur > 0) {
    if (durActual) durActual.textContent = timeDur.toFixed(1) + 'h';
  } else {
    if (durActual) durActual.textContent = '—';
  }

  // 差异
  if (volume > 0 && eff > 0 && start && end && timeDur > 0) {
    const diff = timeDur - calcH;
    if (durDiff) {
      durDiff.textContent = (diff >= 0 ? '+' : '') + diff.toFixed(1) + 'h';
      durDiff.className = 'wt-dur-value ' + (Math.abs(diff) > 1 ? 'wt-dur-warn' : 'wt-dur-ok');
    }
  } else {
    if (durDiff) { durDiff.textContent = '—'; durDiff.className = 'wt-dur-value'; }
  }

  // 清除旧校验
  if (validation) validation.innerHTML = '';

  // 时段校验提示（仅参考性质）
  const memberId = _wtFormState.memberId || parseInt(document.getElementById('wtMember')?.value);
  const dateVal = document.getElementById('wtDate')?.value;
  if (memberId && dateVal && start && end && timeDur > 0) {
    const day = new Date(dateVal).getDate();
    const cat = _wtFormState.category;
    if (cat === 'overtime') {
      const isNonWork = isNonWorkingTime(memberId, day, start, end);
      if (!isNonWork && validation) {
        validation.innerHTML = '<div class="validation-error">⚠️ 加班时段与排班工作时间重叠，请检查</div>';
      }
    } else {
      const isWork = isWorkingTime(memberId, day, start, end);
      if (!isWork && validation) {
        validation.innerHTML = '<div class="validation-error">⚠️ 工损时段不在排班工作时间内，请检查</div>';
      }
    }
  }
}

// ---- 自动保存草稿（5.4）----
const WT_DRAFT_KEY = 'glxt_wt_draft';
let _wtAutoSaveTimer = null;

function _wtStartAutoSave() {
  if (_wtAutoSaveTimer) clearInterval(_wtAutoSaveTimer);
  _wtAutoSaveTimer = setInterval(() => _wtAutoSaveDraft(), 15000); // 每15秒
}

function _wtAutoSaveDraft() {
  const data = _wtCollectFormData();
  if (!data) return;
  try { localStorage.setItem(WT_DRAFT_KEY, JSON.stringify({ ...data, savedAt: new Date().toISOString() })); } catch(e) {}
}

function _wtCollectFormData() {
  return {
    category: _wtFormState.category,
    memberId: document.getElementById('wtMember')?.value || '',
    team: document.getElementById('wtTeam')?.value || '',
    date: document.getElementById('wtDate')?.value || '',
    platform: _wtFormState.platform,
    queueId: _wtFormState.queueId,
    volume: document.getElementById('wtVolume')?.value || '',
    startTime: document.getElementById('wtStartTime')?.value || '',
    endTime: document.getElementById('wtEndTime')?.value || '',
    remark: document.getElementById('wtRemark')?.value || '',
  };
}

function _wtRestoreDraft() {
  try {
    const raw = localStorage.getItem(WT_DRAFT_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    // 只恢复同类型草稿
    if (d.category !== _wtFormState.category) return;
    // 检查是否超过24h
    if (d.savedAt) {
      const diff = (new Date() - new Date(d.savedAt)) / (1000 * 60 * 60);
      if (diff > 24) { localStorage.removeItem(WT_DRAFT_KEY); return; }
    }
    // 恢复字段
    setTimeout(() => {
      if (d.date) { const el = document.getElementById('wtDate'); if (el) el.value = d.date; }
      if (d.volume) { const el = document.getElementById('wtVolume'); if (el) el.value = d.volume; }
      if (d.startTime) { const el = document.getElementById('wtStartTime'); if (el) el.value = d.startTime; }
      if (d.endTime) { const el = document.getElementById('wtEndTime'); if (el) el.value = d.endTime; }
      if (d.remark) { const el = document.getElementById('wtRemark'); if (el) el.value = d.remark; }
      showToast('已恢复上次未提交的草稿', 'info');
    }, 200);
  } catch(e) {}
}

function _wtClearDraft() {
  localStorage.removeItem(WT_DRAFT_KEY);
  if (_wtAutoSaveTimer) { clearInterval(_wtAutoSaveTimer); _wtAutoSaveTimer = null; }
}

// ---- 提交 & 草稿 ----

function wtSaveDraft() {
  _wtAutoSaveDraft();
  showToast('草稿已保存', 'success');
}

function wtSubmitForm() {
  const cat = _wtFormState.category;
  if (!checkPermission('add_overtime')) return;

  const memberId = parseInt(document.getElementById('wtMember')?.value);
  const date = document.getElementById('wtDate')?.value;
  const start = document.getElementById('wtStartTime')?.value;
  const end = document.getElementById('wtEndTime')?.value;
  const volume = parseFloat(document.getElementById('wtVolume')?.value) || 0;
  const remark = document.getElementById('wtRemark')?.value || '';
  const platform = _wtFormState.platform;

  if (!memberId) { showToast('请选择人员', 'warning'); return; }
  if (!date) { showToast('请选择日期', 'warning'); return; }
  if (!volume || volume <= 0) { showToast('请填写审核量级', 'warning'); return; }

  const plat = WORK_PLATFORMS.find(p => p.id === platform);
  if (plat && plat.hasQueue && !_wtFormState.queueId) {
    showToast('请选择关联队列', 'warning'); return;
  }

  const member = getMemberById(memberId);
  if (!member) { showToast('人员数据异常', 'error'); return; }

  const day = new Date(date).getDate();
  const timeDur = (start && end) ? calcHourDiff(start, end) : 0;

  // ===== 核心：以量级折算为认定时长 =====
  const queue = _wtFormState.queueId ? getQueueById(_wtFormState.queueId) : null;
  const correctedEff = Math.round((_wtFormState.effStandard || member.efficiency) * _wtFormState.effCoef);
  let dur = 0;
  if (volume > 0 && correctedEff > 0) {
    // 量级折算：认定时长 = (量级 / 天级人效) × 8小时
    dur = parseFloat((volume / correctedEff * 8).toFixed(1));
  } else if (timeDur > 0) {
    // 无量级时回退到时间差
    dur = timeDur;
  }
  if (dur <= 0) { showToast('请填写量级或有效的时间段', 'warning'); return; }

  // ===== 4.5 时间窗口约束 =====
  const submitDate = new Date(date);
  const now = new Date();
  if (cat === 'overtime') {
    // 规则1：加班须在次日12:00前提交
    const deadline = new Date(submitDate);
    deadline.setDate(deadline.getDate() + 1);
    deadline.setHours(12, 0, 0, 0);
    if (now > deadline) {
      showToast('加班登记已超过次日12:00截止时间，请联系管理员补录', 'warning'); return;
    }
    // 规则2：不可申请超过7天前的加班
    const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);
    if (submitDate < sevenDaysAgo) {
      showToast('不可申请7天前的加班记录，请联系管理员', 'warning'); return;
    }
  }

  // 时段校验（参考性质，不阻断提交）
  if (start && end && timeDur > 0) {
    if (cat === 'overtime') {
      if (!isNonWorkingTime(memberId, day, start, end)) {
        showToast('提示：加班时段与工作时段有重叠，已记录供参考', 'info');
      }
    } else {
      if (!isWorkingTime(memberId, day, start, end)) {
        showToast('提示：工损时段不在工作时段内，已记录供参考', 'info');
      }
    }
  }

  // 超阈值提醒
  if (dur > 3) {
    showToast(`单次${cat === 'overtime' ? '加班' : '工损'}超过3小时，已通知负责人`, 'warning');
  }

  const subTypeNames = { normal: '普通加班', queue_ot: '队列加班', urgent: '紧急任务加班', holiday: '节假日加班' };
  const newRecord = {
    id: 'ot_' + Date.now(),
    type: cat,
    subType: _wtFormState.subType,
    subTypeName: subTypeNames[_wtFormState.subType] || '普通加班',
    platform: platform,
    memberId, memberName: member.name, team: member.team,
    date, startTime: start || '', endTime: end || '',
    duration: dur,           // 认定时长（量级折算）
    timeDuration: timeDur > 0 ? parseFloat(timeDur.toFixed(1)) : null,  // 时间参考时长
    queueId: queue?.id || null, queueName: queue?.name || (platform === 'label' ? '标注' : platform === 'offline' ? '离线' : ''),
    volume, efficiency: _wtFormState.useQueueEff ? correctedEff : member.efficiency,
    effCoef: _wtFormState.effCoef, correctedEff,
    useQueueEff: _wtFormState.useQueueEff,
    project: remark,
    status: 'pending',
    submittedAt: formatDate(new Date(), 'YYYY-MM-DD HH:mm'),
    approvedAt: null, approver: null, remark: remark,
  };
  OVERTIME_RECORDS.unshift(newRecord);
  saveOvertimeRecords();

  APPROVAL_RECORDS.unshift({
    id: 'ot_ap_' + Date.now(),
    type: cat,
    applicant: member.name, applicantId: memberId, team: member.team,
    content: `${cat === 'overtime' ? '加班' : '工损'}申请 ${date} ${start}-${end}（${dur.toFixed(1)}h）`,
    submittedAt: formatDate(new Date(), 'YYYY-MM-DD HH:mm'),
    status: 'pending',
    context: {
      recentOT: `近7天${cat === 'overtime' ? '加班' : '工损'}${OVERTIME_RECORDS.filter(r => r.memberId === memberId && r.type === cat && r.status === 'approved').length}次`,
      shift: `${SHIFTS[getMemberShift(memberId, day)]?.name || '未知'}`,
      efficiency: `${correctedEff}/天`,
    },
  });
  saveApprovalRecords();

  addWorkLog('工时系统', `${cat === 'overtime' ? '加班' : '工损'}申请`,
    `${member.name} 提交${cat === 'overtime' ? '加班' : '工损'}申请 ${date} ${start}-${end}`);
  updateBadges();
  _wtClearDraft(); // 提交成功后清除草稿
  _otNotifyOnSubmit(newRecord); // 5.3 通知闭环
  showToast(`${cat === 'overtime' ? '加班' : '工损'}申请已提交，等待审批`, 'success');
  showPage('worktime-data');
}

// ===== 管理员编辑：配额设置弹窗 =====

function wtOpenQuotaEditor() {
  if (!checkPermission('manage_settings')) return;
  const cfg = _wtGetQuotaConfig();

  const content = `
    <div class="form-group" style="margin-bottom:12px">
      <label class="form-label">本月加班上限（小时）</label>
      <input type="number" class="form-control" id="wtQuotaMax" value="${cfg.maxOTHours}" min="1" max="200" step="1">
    </div>
    <div class="form-group">
      <label class="form-label">预警阈值（%）</label>
      <input type="number" class="form-control" id="wtQuotaWarn" value="${cfg.warnPct}" min="50" max="100" step="5">
      <div class="form-hint" style="margin-top:4px;color:var(--text-tertiary);font-size:12px">当已用配额达到此百分比时显示橙色预警</div>
    </div>
  `;

  openModal('配额设置', content, `
    <button class="btn btn-default" onclick="closeModal()">取消</button>
    <button class="btn btn-primary" onclick="wtSaveQuotaEditor()">保存</button>
  `, '380px');
}

function wtSaveQuotaEditor() {
  const maxOT = parseInt(document.getElementById('wtQuotaMax')?.value) || 36;
  const warnPct = parseInt(document.getElementById('wtQuotaWarn')?.value) || 80;
  _wtSaveQuotaConfig({ maxOTHours: Math.max(1, Math.min(200, maxOT)), warnPct: Math.max(50, Math.min(100, warnPct)) });
  showToast('配额设置已保存', 'success');
  closeModal();
  // 刷新页面以体现新配额
  const content = document.getElementById('contentArea');
  if (content) renderWorktimeRegisterPage(content, _wtFormState.category);
}

// ===== 管理员编辑：填写说明弹窗 =====

function wtOpenTipsEditor() {
  if (!checkPermission('manage_settings')) return;
  const cat = _wtFormState.category;
  const catLabel = cat === 'overtime' ? '加班' : '工损';
  const custom = _wtGetTipsConfig();
  const tips = (custom && custom[cat]) ? custom[cat] : _WT_DEFAULT_TIPS[cat];

  const listHtml = tips.map((t, i) => `
    <div class="wt-tip-edit-row" style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <input type="text" class="form-control wt-tip-input" value="${t.replace(/<[^>]+>/g, '')}" style="flex:1" data-idx="${i}">
      <button class="btn btn-ghost btn-sm wt-tm-del" onclick="this.parentElement.remove()" style="padding:2px 8px;flex-shrink:0">删除</button>
    </div>
  `).join('');

  const content = `
    <div id="wtTipsList">${listHtml}</div>
    <button class="btn btn-ghost btn-sm" onclick="wtAddTipRow()" style="margin-top:4px">+ 添加一条</button>
    <div class="form-hint" style="margin-top:8px;color:var(--text-tertiary);font-size:12px">支持使用 &lt;strong&gt; 标签加粗关键内容</div>
  `;

  openModal(`${catLabel}填写说明`, content, `
    <button class="btn btn-default" onclick="closeModal()">取消</button>
    <button class="btn btn-ghost" onclick="wtResetTips()" style="margin-right:auto">恢复默认</button>
    <button class="btn btn-primary" onclick="wtSaveTipsEditor()">保存</button>
  `, '480px');
}

function wtAddTipRow() {
  const list = document.getElementById('wtTipsList');
  if (!list) return;
  const div = document.createElement('div');
  div.className = 'wt-tip-edit-row';
  div.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px';
  div.innerHTML = `
    <input type="text" class="form-control wt-tip-input" value="" style="flex:1">
    <button class="btn btn-ghost btn-sm wt-tm-del" onclick="this.parentElement.remove()" style="padding:2px 8px;flex-shrink:0">删除</button>
  `;
  list.appendChild(div);
  div.querySelector('input').focus();
}

function wtSaveTipsEditor() {
  const inputs = document.querySelectorAll('#wtTipsList .wt-tip-input');
  const tips = [];
  inputs.forEach(inp => {
    const v = inp.value.trim();
    if (v) tips.push(v);
  });
  if (tips.length === 0) { showToast('至少保留一条说明', 'warning'); return; }

  const cat = _wtFormState.category;
  const cfg = _wtGetTipsConfig() || { ..._WT_DEFAULT_TIPS };
  cfg[cat] = tips;
  _wtSaveTipsConfig(cfg);

  showToast('填写说明已保存', 'success');
  closeModal();
  const content = document.getElementById('contentArea');
  if (content) renderWorktimeRegisterPage(content, cat);
}

function wtResetTips() {
  if (!confirm('确定恢复默认说明？自定义内容将被清除。')) return;
  const cat = _wtFormState.category;
  const cfg = _wtGetTipsConfig() || {};
  delete cfg[cat];
  // 如果两个分类都没自定义了，就清除整个配置
  if (!cfg.overtime && !cfg.injury) {
    localStorage.removeItem('glxt_wt_tips_config');
  } else {
    _wtSaveTipsConfig(cfg);
  }
  showToast('已恢复默认说明', 'success');
  closeModal();
  const content = document.getElementById('contentArea');
  if (content) renderWorktimeRegisterPage(content, cat);
}

// 保留旧函数名兼容
function renderOvertimeFormPage(container, formType) {
  renderWorktimeRegisterPage(container, formType);
}
function onOTTeamChange() { wtOnTeamChange(); }
function onOTMemberChange() { wtOnMemberChange(); }
function onOTDateChange() { wtOnDateChange(); }
function calcOTDuration() { wtCalcDuration(); }
function saveOTDraft() { wtSaveDraft(); }
function submitOTForm(formType) { _wtFormState.category = formType; wtSubmitForm(); }

// ===== 工时数据合并页（记录 + 报表 Tab 切换）=====
let _wtActiveTab = 'records';

function renderWorktimeDataPage(container, defaultTab) {
  if (defaultTab === 'records' || defaultTab === 'report') _wtActiveTab = defaultTab;

  const pendingCount = OVERTIME_RECORDS.filter(r => r.status === 'pending').length;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">工时数据</div>
        <div class="page-subtitle">加班/工损记录管理与统计分析</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary btn-sm" onclick="showPage('worktime-register')">+ 工时登记</button>
      </div>
    </div>

    <div class="tabs" id="wtTabs">
      <div class="tab ${_wtActiveTab === 'records' ? 'active' : ''}" data-tab="records" onclick="switchWTTab('records')">
        申报记录${pendingCount > 0 ? `<span class="tab-badge">${pendingCount}</span>` : ''}
      </div>
      <div class="tab ${_wtActiveTab === 'report' ? 'active' : ''}" data-tab="report" onclick="switchWTTab('report')">
        统计报表
      </div>
    </div>

    <div id="wtTabContent"></div>
  `;

  _renderWTTabContent();
}

function switchWTTab(tab) {
  _wtActiveTab = tab;
  document.querySelectorAll('#wtTabs .tab').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  _renderWTTabContent();
}

function _renderWTTabContent() {
  const box = document.getElementById('wtTabContent');
  if (!box) return;
  if (_wtActiveTab === 'records') {
    _renderRecordsTab(box);
  } else {
    _renderReportTab(box);
  }
}

// ── 记录 Tab（含批量操作） ──
let _otBatchSelected = new Set();

function _renderRecordsTab(box) {
  _otBatchSelected.clear();
  const hasApprovePermission = checkPermission && checkPermission('approve');
  box.innerHTML = `
    <!-- 批量操作工具栏 -->
    <div class="ot-batch-bar" id="otBatchBar" style="display:none">
      <label class="ot-batch-checkbox" style="margin-right:4px">
        <input type="checkbox" id="otBatchSelectAll" onchange="otBatchToggleAll(this.checked)">
        <span style="font-size:12px">全选</span>
      </label>
      <span class="ot-batch-count" id="otBatchCount">已选 0 条</span>
      <div style="flex:1"></div>
      ${hasApprovePermission ? '<button class="btn btn-primary btn-sm" onclick="otBatchApprove()">批量通过</button>' : ''}
      ${hasApprovePermission ? '<button class="btn btn-danger btn-sm" onclick="otBatchReject()">批量驳回</button>' : ''}
      <button class="btn btn-default btn-sm" onclick="otBatchExport()">导出选中</button>
      <button class="btn btn-ghost btn-sm" onclick="otBatchCancel()">取消</button>
    </div>
    <div class="filter-bar">
      <div class="filter-item">
        <span class="filter-label">类型</span>
        <select class="filter-select" id="otTypeFilter" onchange="filterOTRecords()">
          <option value="all">全部</option>
          <option value="overtime">加班</option>
          <option value="injury">工损</option>
        </select>
      </div>
      <div class="filter-item">
        <span class="filter-label">状态</span>
        <select class="filter-select" id="otStatusFilter" onchange="filterOTRecords()">
          <option value="all">全部</option>
          ${Object.entries(OT_STATUS).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('')}
        </select>
      </div>
      <div class="filter-item">
        <span class="filter-label">团队</span>
        <select class="filter-select" id="otTeamFilter" onchange="filterOTRecords()">
          <option value="all">全部</option>
          ${TEAMS.map(t=>`<option>${t}</option>`).join('')}
        </select>
      </div>
      <div style="flex:1"></div>
      <button class="btn btn-default btn-sm" onclick="otEnterBatchMode()" title="进入批量操作模式">☑ 批量</button>
      <button class="btn btn-default btn-sm" onclick="otImportExcel()" title="Excel导入加班记录">📥 导入</button>
    </div>
    <div id="otRecordsList">
      ${renderOTRecordsList(OVERTIME_RECORDS)}
    </div>
  `;
}

// 批量模式控制
let _otBatchMode = false;
function otEnterBatchMode() {
  _otBatchMode = true;
  _otBatchSelected.clear();
  document.getElementById('otBatchBar').style.display = 'flex';
  // 显示所有checkbox
  document.querySelectorAll('.ot-batch-cb').forEach(el => el.style.display = 'flex');
  _otUpdateBatchCount();
}
function otBatchCancel() {
  _otBatchMode = false;
  _otBatchSelected.clear();
  document.getElementById('otBatchBar').style.display = 'none';
  document.querySelectorAll('.ot-batch-cb').forEach(el => { el.style.display = 'none'; el.querySelector('input').checked = false; });
}
function otBatchToggleAll(checked) {
  document.querySelectorAll('.ot-batch-cb input').forEach(cb => {
    cb.checked = checked;
    const id = cb.dataset.id;
    if (checked) _otBatchSelected.add(id); else _otBatchSelected.delete(id);
  });
  _otUpdateBatchCount();
}
function otBatchToggleOne(id, checked) {
  if (checked) _otBatchSelected.add(id); else _otBatchSelected.delete(id);
  _otUpdateBatchCount();
}
function _otUpdateBatchCount() {
  const el = document.getElementById('otBatchCount');
  if (el) el.textContent = `已选 ${_otBatchSelected.size} 条`;
  const allCb = document.getElementById('otBatchSelectAll');
  const total = document.querySelectorAll('.ot-batch-cb input').length;
  if (allCb) allCb.checked = _otBatchSelected.size > 0 && _otBatchSelected.size === total;
}
function otBatchApprove() {
  if (_otBatchSelected.size === 0) { showToast('请先选择记录', 'warning'); return; }
  const ids = [..._otBatchSelected];
  const pending = ids.filter(id => { const r = OVERTIME_RECORDS.find(x => String(x.id) === String(id)); return r && r.status === 'pending'; });
  if (pending.length === 0) { showToast('选中记录中没有待审批的记录', 'warning'); return; }
  openModal('批量审批确认', `<p>确认通过选中的 <strong>${pending.length}</strong> 条待审批记录？</p>`, `
    <button class="btn btn-default" onclick="closeModal()">取消</button>
    <button class="btn btn-primary" onclick="_doOtBatchApprove(${JSON.stringify(pending)})">确认通过</button>
  `);
}
function _doOtBatchApprove(ids) {
  const approver = CURRENT_USER.name;
  const now = formatDate(new Date(), 'YYYY-MM-DD HH:mm');
  ids.forEach(id => {
    const r = OVERTIME_RECORDS.find(x => String(x.id) === String(id));
    if (r) { r.status = 'approved'; r.approver = approver; r.approvedAt = now; _otPushNotify(r, 'approved'); }
  });
  saveOvertimeRecords();
  closeModal();
  showToast(`已批量通过 ${ids.length} 条记录`, 'success');
  addWorkLog('工时系统', '批量审批', `批量通过 ${ids.length} 条记录`);
  otBatchCancel();
  renderWorktimeDataPage(document.getElementById('contentArea'), 'records');
}
function otBatchReject() {
  if (_otBatchSelected.size === 0) { showToast('请先选择记录', 'warning'); return; }
  const ids = [..._otBatchSelected];
  const pending = ids.filter(id => { const r = OVERTIME_RECORDS.find(x => String(x.id) === String(id)); return r && r.status === 'pending'; });
  if (pending.length === 0) { showToast('选中记录中没有待审批的记录', 'warning'); return; }
  openModal('批量驳回', `
    <p>确认驳回选中的 <strong>${pending.length}</strong> 条记录？</p>
    <div class="form-group">
      <label class="form-label">驳回原因</label>
      <textarea class="form-control" id="batchRejectReason" rows="2" placeholder="请输入驳回原因（可选）"></textarea>
    </div>
  `, `
    <button class="btn btn-default" onclick="closeModal()">取消</button>
    <button class="btn btn-danger" onclick="_doOtBatchReject(${JSON.stringify(pending)})">确认驳回</button>
  `);
}
function _doOtBatchReject(ids) {
  const reason = document.getElementById('batchRejectReason')?.value || '';
  const now = formatDate(new Date(), 'YYYY-MM-DD HH:mm');
  ids.forEach(id => {
    const r = OVERTIME_RECORDS.find(x => String(x.id) === String(id));
    if (r) { r.status = 'rejected'; r.rejectReason = reason; r.approvedAt = now; r.approver = CURRENT_USER.name; _otPushNotify(r, 'rejected'); }
  });
  saveOvertimeRecords();
  closeModal();
  showToast(`已批量驳回 ${ids.length} 条记录`, 'success');
  addWorkLog('工时系统', '批量驳回', `批量驳回 ${ids.length} 条记录`);
  otBatchCancel();
  renderWorktimeDataPage(document.getElementById('contentArea'), 'records');
}
function otBatchExport() {
  if (_otBatchSelected.size === 0) { showToast('请先选择记录', 'warning'); return; }
  const ids = [..._otBatchSelected];
  const records = OVERTIME_RECORDS.filter(r => ids.includes(String(r.id)));
  _doExportRecords(records, `工时导出_选中${records.length}条_${formatDate(new Date())}`);
  showToast(`已导出 ${records.length} 条记录`, 'success');
}

// Excel 导入
function otImportExcel() {
  const content = `
    <div style="margin-bottom:12px">
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">支持导入 CSV 格式文件，模板列为：<strong>姓名、日期(YYYY-MM-DD)、开始时间(HH:mm)、结束时间(HH:mm)、类型(加班/工损)、平台(队列/标注/离线)、队列名称、量级</strong></p>
      <button class="btn btn-default btn-sm" onclick="_otDownloadTemplate()">📋 下载导入模板</button>
    </div>
    <div class="upload-area" id="importUploadArea" onclick="document.getElementById('otImportFile').click()" style="cursor:pointer;padding:24px;border:2px dashed var(--border);border-radius:8px;text-align:center">
      <input type="file" id="otImportFile" style="display:none" accept=".csv,.tsv,.txt" onchange="_otHandleImportFile(this)">
      <div style="font-size:28px;margin-bottom:8px">📤</div>
      <div style="font-size:13px;color:var(--text-secondary)">点击或拖拽 CSV 文件到此处</div>
    </div>
    <div id="importPreview" style="margin-top:12px"></div>
  `;
  openModal('Excel/CSV 导入加班记录', content, `
    <button class="btn btn-default" onclick="closeModal()">取消</button>
    <button class="btn btn-primary" id="btnDoImport" onclick="_otDoImport()" disabled>确认导入</button>
  `);
}
let _otImportRows = [];
function _otDownloadTemplate() {
  const tpl = '姓名,日期,开始时间,结束时间,类型,平台,队列名称,量级\n张三,2026-04-25,18:00,20:00,加班,队列,C1-高曝中文,120';
  const blob = new Blob(['\uFEFF' + tpl], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '加班导入模板.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}
function _otHandleImportFile(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const text = e.target.result;
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) { showToast('文件内容为空或格式不正确', 'warning'); return; }
    const headers = lines[0].split(',').map(h => h.trim());
    _otImportRows = [];
    const errors = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      if (cells.length < 5) { errors.push(`第${i+1}行列数不足`); continue; }
      const [name, date, start, end, typeStr, platStr, queueName, volume] = cells;
      const member = MEMBERS_DATA.find(m => m.name === name);
      if (!member) { errors.push(`第${i+1}行：找不到成员 "${name}"`); continue; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { errors.push(`第${i+1}行：日期格式错误`); continue; }
      const type = typeStr === '工损' ? 'injury' : 'overtime';
      const platform = platStr === '标注' ? 'label' : platStr === '离线' ? 'offline' : 'queue';
      const sH = parseInt(start.split(':')[0]) + parseInt(start.split(':')[1] || 0) / 60;
      const eH = parseInt(end.split(':')[0]) + parseInt(end.split(':')[1] || 0) / 60;
      const dur = Math.round((eH - sH) * 10) / 10;
      if (dur <= 0) { errors.push(`第${i+1}行：时间范围无效`); continue; }
      _otImportRows.push({ memberId: member.id, memberName: member.name, team: member.team, date, startTime: start, endTime: end, type, platform, queueName: queueName || '', volume: parseInt(volume) || 0, duration: dur });
    }
    const preview = document.getElementById('importPreview');
    if (preview) {
      preview.innerHTML = `
        <div class="alert-banner ${errors.length > 0 ? 'alert-warning' : 'alert-info'}" style="margin-bottom:10px">
          解析完成：<strong>${_otImportRows.length}</strong> 条有效，${errors.length > 0 ? `<strong>${errors.length}</strong> 条错误` : '无错误'}
        </div>
        ${errors.length > 0 ? `<div style="max-height:80px;overflow-y:auto;font-size:11px;color:var(--danger);margin-bottom:8px">${errors.join('<br>')}</div>` : ''}
        ${_otImportRows.length > 0 ? `
          <div style="max-height:150px;overflow-y:auto;scrollbar-width:thin">
            <table class="data-table" style="font-size:11px">
              <thead><tr><th>姓名</th><th>日期</th><th>时间</th><th>类型</th><th>时长</th></tr></thead>
              <tbody>${_otImportRows.slice(0, 20).map(r => `<tr><td>${r.memberName}</td><td>${r.date}</td><td>${r.startTime}-${r.endTime}</td><td>${r.type === 'overtime' ? '加班' : '工损'}</td><td>${r.duration}h</td></tr>`).join('')}
              ${_otImportRows.length > 20 ? `<tr><td colspan="5" style="text-align:center;color:var(--text-tertiary)">...还有 ${_otImportRows.length - 20} 条</td></tr>` : ''}
              </tbody>
            </table>
          </div>
        ` : ''}
      `;
    }
    const btn = document.getElementById('btnDoImport');
    if (btn) btn.disabled = _otImportRows.length === 0;
  };
  reader.readAsText(file, 'UTF-8');
}
function _otDoImport() {
  if (_otImportRows.length === 0) return;
  const now = formatDate(new Date(), 'YYYY-MM-DD HH:mm');
  _otImportRows.forEach(row => {
    const id = 'ot_imp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    OVERTIME_RECORDS.push({
      id, ...row,
      status: 'pending',
      submittedAt: now,
      applicant: row.memberName,
      applicantId: row.memberId,
      efficiency: 0, correctedEff: 0, effCoef: 1,
      source: 'import'
    });
  });
  saveOvertimeRecords();
  closeModal();
  showToast(`成功导入 ${_otImportRows.length} 条记录`, 'success');
  addWorkLog('工时系统', '批量导入', `CSV导入 ${_otImportRows.length} 条加班/工损记录`);
  _otImportRows = [];
  renderWorktimeDataPage(document.getElementById('contentArea'), 'records');
}

// 通用导出
function _doExportRecords(records, filename) {
  const headers = ['姓名', 'MIS号', '团队', '类型', '平台', '日期', '开始时间', '结束时间', '时长(小时)', '量级', '人效系数', '队列名称', '状态', '审批人', '审批时间'];
  const typeMap = { overtime: '加班', injury: '工损' };
  const platMap = { queue: '队列', label: '标注', offline: '离线' };
  const statusMap = {};
  Object.entries(OT_STATUS).forEach(([k, v]) => statusMap[k] = v.label);
  const rows = records.map(r => {
    const member = getMemberById(r.memberId);
    return [member?.name || r.applicant || '-', member?.mis || '-', member?.team || '-', typeMap[r.type] || r.type, platMap[r.platform] || '队列', r.date || '-', r.startTime || '-', r.endTime || '-', r.duration || 0, r.volume || 0, r.effCoef || 1, r.queueName || '-', statusMap[r.status] || r.status, r.approver || '-', r.approvedAt || '-'];
  });
  const csvContent = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── 报表 Tab（4.7增强版：趋势图、分布图、热力图、排行榜） ──
function _renderReportTab(box) {
  const totalOT = OVERTIME_RECORDS.filter(r => r.type === 'overtime' && r.status === 'approved');
  const totalInjury = OVERTIME_RECORDS.filter(r => r.type === 'injury' && r.status === 'approved');
  const totalOTHours = totalOT.reduce((s, r) => s + r.duration, 0);
  const totalInjHours = totalInjury.reduce((s, r) => s + r.duration, 0);
  const avgOTPerPerson = totalOT.length > 0 ? (totalOTHours / new Set(totalOT.map(r => r.memberId)).size) : 0;

  const memberOTCount = {};
  OVERTIME_RECORDS.filter(r => r.status === 'approved').forEach(r => {
    memberOTCount[r.memberId] = (memberOTCount[r.memberId] || 0) + r.duration;
  });
  const riskPersons = Object.entries(memberOTCount)
    .filter(([, h]) => h >= 5)
    .map(([id, h]) => ({ member: getMemberById(parseInt(id)), hours: h }))
    .filter(r => r.member)
    .sort((a, b) => b.hours - a.hours);

  // 近7天趋势数据
  const trendDays = [];
  const trendOT = [];
  const trendInj = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = formatDate(d);
    trendDays.push((d.getMonth() + 1) + '/' + d.getDate());
    trendOT.push(OVERTIME_RECORDS.filter(r => r.type === 'overtime' && r.date === ds && r.status === 'approved').reduce((s, r) => s + r.duration, 0));
    trendInj.push(OVERTIME_RECORDS.filter(r => r.type === 'injury' && r.date === ds && r.status === 'approved').reduce((s, r) => s + r.duration, 0));
  }

  // 团队分布数据
  const teamDistrib = TEAMS.map(team => {
    const h = OVERTIME_RECORDS.filter(r => r.team === team && r.type === 'overtime' && r.status === 'approved').reduce((s, r) => s + r.duration, 0);
    return { team, hours: h };
  });

  // 周热力图数据（7天 x 24小时）
  const heatmapData = [];
  const weekDays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  for (let wd = 0; wd < 7; wd++) {
    for (let h = 0; h < 24; h++) {
      heatmapData.push({ day: wd, hour: h, count: 0 });
    }
  }
  OVERTIME_RECORDS.filter(r => r.status === 'approved').forEach(r => {
    const d = new Date(r.date);
    const wd = (d.getDay() + 6) % 7; // 0=Mon
    const startH = r.startTime ? parseInt(r.startTime.split(':')[0]) : 0;
    const endH = r.endTime ? parseInt(r.endTime.split(':')[0]) : 0;
    for (let h = startH; h <= Math.min(endH, 23); h++) {
      const cell = heatmapData.find(c => c.day === wd && c.hour === h);
      if (cell) cell.count++;
    }
  });
  const heatMax = Math.max(...heatmapData.map(c => c.count), 1);

  // 排行榜
  const ranking = MEMBERS_DATA.filter(m => m.role !== 'leader').map(m => {
    const h = OVERTIME_RECORDS.filter(r => r.memberId === m.id && r.type === 'overtime' && r.status === 'approved').reduce((s, r) => s + r.duration, 0);
    return { member: m, hours: h };
  }).sort((a, b) => b.hours - a.hours).slice(0, 10);

  box.innerHTML = `
    <div class="kpi-grid" style="margin-bottom:20px">
      <div class="kpi-card">
        <div class="kpi-label">本日加班人数</div>
        <div class="kpi-value">${OVERTIME_RECORDS.filter(r=>r.type==='overtime'&&r.date===formatDate(new Date())).length}<span>人</span></div>
      </div>
      <div class="kpi-card orange">
        <div class="kpi-label">本月工损</div>
        <div class="kpi-value">${totalInjury.length}<span>次 · ${totalInjHours.toFixed(1)}h</span></div>
      </div>
      <div class="kpi-card red">
        <div class="kpi-label">高风险人员</div>
        <div class="kpi-value">${riskPersons.length}<span>人</span></div>
      </div>
      <div class="kpi-card green">
        <div class="kpi-label">本月加班总时长</div>
        <div class="kpi-value">${totalOTHours.toFixed(1)}<span>h · 人均${avgOTPerPerson.toFixed(1)}h</span></div>
      </div>
    </div>

    <div class="ot-report-grid">
      <div class="card">
        <div class="card-header"><span class="card-title">⚠️ 高风险人员名单</span></div>
        <div class="card-body">
          ${riskPersons.length === 0 ? '<div class="empty-state"><p>暂无高风险人员</p></div>' :
            riskPersons.map(({ member, hours }) => `
              <div class="risk-person-card" onclick="showPersonDetail(${member.id})" style="cursor:pointer">
                ${avatarImg(member, '32px')}
                <div class="risk-person-info">
                  <div class="risk-person-name">${member.name}</div>
                  <div class="risk-person-reason">${member.team} · 近期累计加班/工损</div>
                </div>
                <div class="risk-person-stats">${hours}h</div>
              </div>
            `).join('')}
        </div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">📈 加班-工损趋势（近7天）</span></div>
        <div class="card-body">
          <div id="otTrendChart" style="height:160px"></div>
          <div style="display:flex;gap:16px;margin-top:8px;font-size:12px">
            <span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:3px;background:var(--primary);display:inline-block;border-radius:2px"></span>加班时长</span>
            <span style="display:flex;align-items:center;gap:4px"><span style="width:12px;height:3px;background:var(--danger);display:inline-block;border-radius:2px"></span>工损时长</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 团队加班分布 + 排行榜 -->
    <div class="ot-report-grid" style="margin-bottom:14px">
      <div class="card">
        <div class="card-header"><span class="card-title">📊 团队加班分布</span></div>
        <div class="card-body">
          <div id="otTeamDistChart" style="height:140px"></div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">🏆 加班时长排行 TOP10</span></div>
        <div class="card-body" style="padding:0">
          <div style="max-height:200px;overflow-y:auto;scrollbar-width:thin">
            ${ranking.map((r, i) => `
              <div style="display:flex;align-items:center;gap:8px;padding:8px 14px;border-bottom:0.5px solid var(--border-light);cursor:pointer" onclick="showPersonDetail(${r.member.id})">
                <span style="width:20px;font-size:12px;font-weight:700;color:${i < 3 ? 'var(--primary)' : 'var(--text-tertiary)'}">${i + 1}</span>
                ${avatarImg(r.member, '24px')}
                <span style="flex:1;font-size:12px;font-weight:500">${r.member.name}</span>
                <span style="font-size:12px;font-weight:700;color:var(--text-primary)">${r.hours.toFixed(1)}h</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>

    <!-- 热力图：周/小时加班分布 -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><span class="card-title">🔥 加班热力图（周/小时分布）</span></div>
      <div class="card-body">
        <div class="ot-heatmap" id="otHeatmap">
          <div class="ot-heatmap-header">
            <span></span>
            ${Array.from({length:24},(_,i)=>`<span class="ot-hm-hour">${i}</span>`).join('')}
          </div>
          ${weekDays.map((dayName, wd) => `
            <div class="ot-heatmap-row">
              <span class="ot-hm-day">${dayName}</span>
              ${Array.from({length:24},(_,h)=>{
                const cell = heatmapData.find(c => c.day === wd && c.hour === h);
                const intensity = cell ? cell.count / heatMax : 0;
                const bg = intensity === 0 ? 'var(--bg-tertiary)' :
                  `rgba(20,86,240,${(0.15 + intensity * 0.7).toFixed(2)})`;
                return `<span class="ot-hm-cell" style="background:${bg}" title="${dayName} ${h}:00 — ${cell?.count || 0}次"></span>`;
              }).join('')}
            </div>
          `).join('')}
          <div class="ot-heatmap-legend">
            <span>少</span>
            <span class="ot-hm-cell" style="background:rgba(20,86,240,0.1)"></span>
            <span class="ot-hm-cell" style="background:rgba(20,86,240,0.3)"></span>
            <span class="ot-hm-cell" style="background:rgba(20,86,240,0.55)"></span>
            <span class="ot-hm-cell" style="background:rgba(20,86,240,0.85)"></span>
            <span>多</span>
          </div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="card-header">
        <span class="card-title">部门月度加班明细</span>
        <button class="btn btn-default btn-sm" onclick="exportOTReport()">导出CSV</button>
      </div>
      <div class="card-body" style="padding:0">
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>人员</th><th>团队</th><th>加班次数</th><th>加班总时长</th><th>工损次数</th><th>工损时长</th><th>出勤天数</th><th>加班占比</th></tr></thead>
            <tbody>
              ${MEMBERS_DATA.filter(m=>m.role!=='leader').map(m => {
                const otRecs = OVERTIME_RECORDS.filter(r => r.memberId === m.id && r.type === 'overtime' && r.status === 'approved');
                const injRecs = OVERTIME_RECORDS.filter(r => r.memberId === m.id && r.type === 'injury' && r.status === 'approved');
                const otHours = otRecs.reduce((s, r) => s + r.duration, 0);
                const injHours = injRecs.reduce((s, r) => s + r.duration, 0);
                const _now = new Date();
                const _attS = typeof _getAttStats === 'function' ? _getAttStats(m.id, String(_now.getFullYear()), String(_now.getMonth()+1).padStart(2,'0')) : null;
                const workDays = (_attS && _attS.hasRealData) ? _attS.workDays : (ATTENDANCE_STATS[m.id]?.workDays || 20);
                const otPct = ((otHours / (workDays * 8)) * 100).toFixed(1);
                return `<tr>
                  <td style="cursor:pointer" onclick="showPersonDetail(${m.id})">
                    <div style="display:flex;align-items:center;gap:6px">
                      ${avatarImg(m, '22px')}
                      ${m.name}
                    </div>
                  </td>
                  <td><span class="tag tag-blue">${m.team}</span></td>
                  <td>${otRecs.length}</td>
                  <td class="${otHours>10?'col-bad':otHours>5?'col-warn':''}">${otHours.toFixed(1)}h</td>
                  <td>${injRecs.length}</td>
                  <td class="${injHours>4?'col-bad':''}">${injHours.toFixed(1)}h</td>
                  <td>${workDays}</td>
                  <td>${otPct}%</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">作业平台分布</span></div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:repeat(${WORK_PLATFORMS.length},1fr);gap:16px">
          ${WORK_PLATFORMS.map(p => {
            const pOT = OVERTIME_RECORDS.filter(r => r.type === 'overtime' && r.platform === p.id && r.status === 'approved');
            const pInj = OVERTIME_RECORDS.filter(r => r.type === 'injury' && r.platform === p.id && r.status === 'approved');
            const otH = pOT.reduce((s, r) => s + (r.duration || 0), 0);
            const injH = pInj.reduce((s, r) => s + (r.duration || 0), 0);
            return `<div style="padding:14px;background:var(--bg);border-radius:8px">
              <div style="text-align:center;margin-bottom:10px">
                <span style="font-size:20px">${p.icon}</span>
                <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-top:2px">${p.name}</div>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary);padding:4px 0;border-bottom:1px solid var(--border-light)">
                <span>加班</span>
                <span style="font-weight:600;color:var(--primary)">${pOT.length}次 / ${otH.toFixed(1)}h</span>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary);padding:4px 0">
                <span>工损</span>
                <span style="font-weight:600;color:var(--danger)">${pInj.length}次 / ${injH.toFixed(1)}h</span>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>
  `;

  setTimeout(() => {
    // 趋势图
    const el = document.getElementById('otTrendChart');
    if (el) {
      renderLineChart(el, [
        { data: trendOT, color: '#1664FF' },
        { data: trendInj, color: '#F53F3F' },
      ], trendDays);
    }
    // 团队分布柱状图
    const distEl = document.getElementById('otTeamDistChart');
    if (distEl) {
      renderBarChart(distEl, teamDistrib.map(t => t.hours), teamDistrib.map(t => t.team), ['#1664FF']);
    }
  }, 100);
}

// 保留旧函数名兼容
function renderOTRecordsPage(container) { renderWorktimeDataPage(container, 'records'); }
function renderOTReportPage(container) { renderWorktimeDataPage(container, 'report'); }

function renderOTRecordsList(records) {
  if (records.length === 0) return '<div class="empty-state" style="height:200px;max-height:200px"><p>暂无记录</p></div>';
  return records.map(r => {
    const typeInfo = r.type === 'overtime'
      ? OT_TYPES.find(t => t.id === r.otType)
      : INJURY_TYPES.find(t => t.id === r.injuryType);
    // 兼容新类型
    const wtTypeInfo = r.worktimeType ? getWorktimeTypeById(r.worktimeType) : null;
    const displayType = wtTypeInfo || typeInfo;
    const statusInfo = OT_STATUS[r.status];
    // 时间线条 — 以24小时为基准
    const tStart = r.startTime ? parseInt(r.startTime.split(':')[0]) + parseInt(r.startTime.split(':')[1]) / 60 : 0;
    const tEnd = r.endTime ? parseInt(r.endTime.split(':')[0]) + parseInt(r.endTime.split(':')[1]) / 60 : 0;
    const tlLeft = ((tStart / 24) * 100).toFixed(1);
    const tlWidth = (((tEnd - tStart) / 24) * 100).toFixed(1);
    return `
      <div class="ot-record-card" style="border-left:3px solid ${statusInfo?.barColor || 'var(--border)'}">
        <div class="ot-record-header">
          <label class="ot-batch-cb" style="display:${_otBatchMode ? 'flex' : 'none'};align-items:center;margin-right:4px">
            <input type="checkbox" data-id="${r.id}" onchange="otBatchToggleOne('${r.id}',this.checked)" ${_otBatchSelected.has(String(r.id)) ? 'checked' : ''}>
          </label>
          <div style="display:flex;align-items:center;gap:8px;flex:1">
            <span class="ot-type-badge ${displayType?.color || ''}">${displayType?.name || (r.type === 'overtime' ? '加班' : '工损')}</span>
            <span style="font-size:13px;font-weight:600">${r.memberName}</span>
            <span class="tag tag-blue" style="font-size:11px">${r.team}</span>
            ${r.platform && r.platform !== 'queue' ? `<span class="tag tag-gray" style="font-size:10px">${r.platform === 'label' ? '标注' : '离线'}</span>` : ''}
          </div>
          <span class="ot-status-tag ${statusInfo?.color}"><span class="ot-status-icon">${statusInfo?.icon || ''}</span>${statusInfo?.label}</span>
        </div>
        <div class="ot-record-info">
          <div class="ot-record-item">
            <div class="ot-record-item-label">日期</div>
            <div class="ot-record-item-value">${r.date}</div>
          </div>
          <div class="ot-record-item">
            <div class="ot-record-item-label">时间</div>
            <div class="ot-record-item-value">${r.startTime} - ${r.endTime}（${r.duration}h）</div>
          </div>
          <div class="ot-record-item">
            <div class="ot-record-item-label">队列/平台</div>
            <div class="ot-record-item-value" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.queueName || '—'}</div>
          </div>
          <div class="ot-record-item">
            <div class="ot-record-item-label">量级/人效</div>
            <div class="ot-record-item-value">${r.volume} / ${r.correctedEff || r.efficiency}/天</div>
          </div>
        </div>
        <!-- 时间线可视化条 -->
        <div class="ot-timeline-bar">
          <div class="ot-timeline-track">
            <div class="ot-timeline-fill ${r.type === 'injury' ? 'injury' : ''}" style="left:${tlLeft}%;width:${tlWidth}%">
              <span class="ot-timeline-label">${r.startTime}–${r.endTime}</span>
            </div>
          </div>
          <div class="ot-timeline-ticks">
            <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span>
          </div>
        </div>
        ${r.remark ? `<div style="font-size:12px;color:var(--text-tertiary);margin-top:6px">备注：${r.remark}</div>` : ''}
        <div class="ot-record-actions">
          ${r.status === 'pending' ? `<button class="btn btn-default btn-sm" onclick="withdrawOTRecord('${r.id}')">撤回</button>` : ''}
          ${r.status === 'draft' ? `<button class="btn btn-primary btn-sm" onclick="submitDraftRecord('${r.id}')">提交</button>` : ''}
          ${r.status === 'approved' ? `<button class="btn btn-default btn-sm" onclick="showModifyRequest('${r.id}')">申请修改</button>` : ''}
          <button class="btn btn-ghost btn-sm" onclick="showOTRecordDetail('${r.id}')">详情</button>
        </div>
      </div>
    `;
  }).join('');
}

function filterOTRecords() {
  const type = document.getElementById('otTypeFilter')?.value || 'all';
  const status = document.getElementById('otStatusFilter')?.value || 'all';
  const team = document.getElementById('otTeamFilter')?.value || 'all';
  let filtered = OVERTIME_RECORDS;
  if (type !== 'all') filtered = filtered.filter(r => r.type === type);
  if (status !== 'all') filtered = filtered.filter(r => r.status === status);
  if (team !== 'all') filtered = filtered.filter(r => r.team === team);
  const list = document.getElementById('otRecordsList');
  if (list) list.innerHTML = renderOTRecordsList(filtered);
}

function withdrawOTRecord(id) {
  const record = OVERTIME_RECORDS.find(r => String(r.id) === String(id));
  if (record) {
    record.status = 'draft';
    saveOvertimeRecords();
    _otPushNotify(record, 'revoked');
    addWorkLog('工时系统', '撤回申请', `${record.memberName} 撤回${record.type === 'overtime' ? '加班' : '工损'}申请 #${id}`);
    showToast('申请已撤回', 'success');
    renderWorktimeDataPage(document.getElementById('contentArea'), 'records');
  }
}

function submitDraftRecord(id) {
  const record = OVERTIME_RECORDS.find(r => String(r.id) === String(id));
  if (record) {
    record.status = 'pending';
    record.submittedAt = formatDate(new Date(), 'YYYY-MM-DD HH:mm');
    saveOvertimeRecords();
    showToast('申请已提交，等待审批', 'success');
    renderWorktimeDataPage(document.getElementById('contentArea'), 'records');
  }
}

function showOTRecordDetail(id) {
  const r = OVERTIME_RECORDS.find(rec => String(rec.id) === String(id));
  if (!r) return;
  const typeInfo = r.type === 'overtime' ? OT_TYPES.find(t => t.id === r.otType) : INJURY_TYPES.find(t => t.id === r.injuryType);
  const wtTypeInfo = r.worktimeType ? getWorktimeTypeById(r.worktimeType) : null;
  const displayType = wtTypeInfo || typeInfo;
  const statusInfo = OT_STATUS[r.status];
  const corrEff = r.correctedEff || r.efficiency;
  const content = `
    <div class="data-row"><span class="data-row-label">类型</span><span class="data-row-value"><span class="ot-type-badge ${displayType?.color}">${displayType?.name}</span></span></div>
    <div class="data-row"><span class="data-row-label">申请人</span><span class="data-row-value">${r.memberName}（${r.team}）</span></div>
    <div class="data-row"><span class="data-row-label">日期</span><span class="data-row-value">${r.date}</span></div>
    <div class="data-row"><span class="data-row-label">时间</span><span class="data-row-value">${r.startTime} - ${r.endTime}（${r.duration}h）</span></div>
    <div class="data-row"><span class="data-row-label">作业平台</span><span class="data-row-value">${r.platform === 'queue' ? '队列' : r.platform === 'label' ? '标注' : r.platform === 'offline' ? '离线' : '队列'}</span></div>
    <div class="data-row"><span class="data-row-label">队列</span><span class="data-row-value">${r.queueName || '—'}${r.queueId ? '（ID:' + r.queueId + '）' : ''}</span></div>
    <div class="data-row"><span class="data-row-label">量级</span><span class="data-row-value">${r.volume}</span></div>
    <div class="data-row"><span class="data-row-label">标准人效</span><span class="data-row-value">${r.efficiency}/天</span></div>
    <div class="data-row"><span class="data-row-label">修正人效</span><span class="data-row-value">${corrEff}/天${r.effCoef ? '（系数 ×' + r.effCoef + '）' : ''}</span></div>
    <div class="data-row"><span class="data-row-label">量级计算时长</span><span class="data-row-value">${corrEff > 0 ? (r.volume / corrEff * 8).toFixed(1) + 'h' : '—'}</span></div>
    <div class="data-row"><span class="data-row-label">状态</span><span class="data-row-value"><span class="tag ${statusInfo?.color}">${statusInfo?.label}</span></span></div>
    <div class="data-row"><span class="data-row-label">提交时间</span><span class="data-row-value">${r.submittedAt || '—'}</span></div>
    <div class="data-row"><span class="data-row-label">审批人</span><span class="data-row-value">${r.approver || '—'}</span></div>
    <div class="data-row"><span class="data-row-label">审批时间</span><span class="data-row-value">${r.approvedAt || '—'}</span></div>
    ${r.remark ? `<div class="data-row"><span class="data-row-label">备注</span><span class="data-row-value">${r.remark}</span></div>` : ''}
    <!-- 5.2 审批上下文：30天加班日历 -->
    <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border-light)">
      <div style="font-size:12px;font-weight:600;margin-bottom:8px;color:var(--text-secondary)">📅 ${r.memberName} 近30天加班分布</div>
      <div class="ot-mini-calendar">${_renderMiniCalendar(r.memberId, r.date)}</div>
      <div style="display:flex;gap:10px;margin-top:6px;font-size:10px;color:var(--text-tertiary)">
        <span style="display:flex;align-items:center;gap:3px"><span style="width:10px;height:10px;border-radius:2px;background:rgba(20,86,240,0.3);display:inline-block"></span>加班</span>
        <span style="display:flex;align-items:center;gap:3px"><span style="width:10px;height:10px;border-radius:2px;background:rgba(245,63,63,0.3);display:inline-block"></span>工损</span>
        <span style="display:flex;align-items:center;gap:3px"><span style="width:10px;height:10px;border-radius:2px;background:rgba(20,86,240,0.7);display:inline-block"></span>当前记录</span>
      </div>
    </div>
  `;
  openModal('记录详情', content, `<button class="btn btn-default" onclick="closeModal()">关闭</button>`);
}

// 30天迷你日历
function _renderMiniCalendar(memberId, highlightDate) {
  const today = new Date();
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(today.getDate() - i);
    days.push(formatDate(d));
  }
  const memberRecords = OVERTIME_RECORDS.filter(r => r.memberId === memberId && r.status !== 'draft');
  return `<div style="display:grid;grid-template-columns:repeat(10,1fr);gap:3px">
    ${days.map(ds => {
      const dayRecords = memberRecords.filter(r => r.date === ds);
      const hasOT = dayRecords.some(r => r.type === 'overtime');
      const hasInj = dayRecords.some(r => r.type === 'injury');
      const isHL = ds === highlightDate;
      const d = new Date(ds);
      const dayNum = d.getDate();
      let bg = 'var(--bg-tertiary)';
      if (isHL) bg = 'rgba(20,86,240,0.7)';
      else if (hasInj) bg = 'rgba(245,63,63,0.3)';
      else if (hasOT) bg = 'rgba(20,86,240,0.3)';
      const totalH = dayRecords.reduce((s, r) => s + r.duration, 0);
      return `<span style="display:flex;flex-direction:column;align-items:center;padding:3px 0;border-radius:4px;background:${bg};font-size:10px;line-height:1.3;${isHL ? 'color:#fff;font-weight:700' : ''}" title="${ds}${totalH > 0 ? ' ' + totalH.toFixed(1) + 'h' : ''}">
        <span>${dayNum}</span>
        ${totalH > 0 ? `<span style="font-size:8px;opacity:0.8">${totalH.toFixed(1)}</span>` : ''}
      </span>`;
    }).join('')}
  </div>`;
}

function showModifyRequest(id) {
  const r = OVERTIME_RECORDS.find(rec => String(rec.id) === String(id));
  if (!r) return;
  const content = `
    <div class="modify-diff">
      <div class="modify-diff-before">
        <div class="modify-diff-label">修改前</div>
        <div>时间：${r.startTime} - ${r.endTime}</div>
        <div>量级：${r.volume}</div>
      </div>
      <div class="modify-diff-after">
        <div class="modify-diff-label">修改后</div>
        <div class="form-group" style="margin-bottom:6px">
          <input type="time" class="form-control" id="modifyStart" value="${r.startTime}">
        </div>
        <div class="form-group" style="margin-bottom:6px">
          <input type="time" class="form-control" id="modifyEnd" value="${r.endTime}">
        </div>
        <div class="form-group">
          <input type="number" class="form-control" id="modifyVolume" value="${r.volume}" placeholder="量级">
        </div>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label required">修改原因</label>
      <textarea class="form-control" id="modifyReason" rows="2" placeholder="请说明修改原因"></textarea>
    </div>
    <div class="alert-banner alert-info">ℹ️ 修改申请将发送给原审批人复审，修改通过后数据看板将重新计算</div>
  `;
  openModal('申请修改', content, `
    <button class="btn btn-default" onclick="closeModal()">取消</button>
    <button class="btn btn-primary" onclick="submitModifyRequest('${id}')">提交修改申请</button>
  `);
}

function submitModifyRequest(id) {
  const reason = document.getElementById('modifyReason')?.value;
  if (!reason) { showToast('请填写修改原因', 'warning'); return; }
  closeModal();
  showToast('修改申请已提交，等待原审批人复审', 'success');
  addWorkLog('工时系统', '申请修改', `记录 #${id} 申请修改`);
}

// 文件上传处理
function triggerFileUpload() {
  const input = document.getElementById('otFileInput');
  if (input) input.click();
}

function handleOTFileUpload(input) {
  const files = Array.from(input.files);
  if (files.length === 0) return;
  const uploadArea = document.getElementById('uploadArea');
  if (!uploadArea) return;

  const MAX_SIZE = 10 * 1024 * 1024;
  const validFiles = files.filter(f => f.size <= MAX_SIZE);
  const oversized = files.filter(f => f.size > MAX_SIZE);

  if (oversized.length > 0) {
    showToast(`${oversized.length} 个文件超过10MB限制，已跳过`, 'warning');
  }
  if (validFiles.length === 0) return;

  const fileListHtml = validFiles.map(f => `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border-light)">
      <span style="font-size:16px">${f.name.endsWith('.pdf') ? '📄' : '🖼️'}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.name}</div>
        <div style="font-size:11px;color:var(--text-tertiary)">${(f.size / 1024).toFixed(1)} KB</div>
      </div>
      <span style="color:var(--success);font-size:12px">✓</span>
    </div>
  `).join('');

  uploadArea.innerHTML = `
    <input type="file" id="otFileInput" style="display:none" accept=".jpg,.jpeg,.png,.pdf" multiple onchange="handleOTFileUpload(this)">
    <div style="padding:4px 0">
      <div style="font-size:13px;font-weight:600;margin-bottom:8px;color:var(--text-primary)">已选择 ${validFiles.length} 个文件</div>
      ${fileListHtml}
      <div style="margin-top:8px;text-align:center">
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('otFileInput').click()">重新选择</button>
      </div>
    </div>
  `;
  showToast(`已选择 ${validFiles.length} 个文件`, 'success');
}

// 5.3 通知闭环 — 审批结果推送 + 消息关联
function _otPushNotify(record, action) {
  if (typeof _pushNotify !== 'function') return;
  const typeStr = record.type === 'overtime' ? '加班' : '工损';
  const statusMap = { approved: '已通过', rejected: '已驳回', pending: '待审批', revoked: '已撤销' };
  const iconMap = { approved: 'check', rejected: 'error', pending: 'bell', revoked: 'warn' };
  const colorMap = { approved: '#e8f8ee', rejected: '#ffece8', pending: '#e8f3ff', revoked: '#fff7e8' };
  _pushNotify({
    type: 'approval',
    title: `${typeStr}申请${statusMap[action] || action}`,
    body: `${record.memberName} 的${typeStr}申请（${record.date} ${record.startTime}-${record.endTime}）${statusMap[action] || ''}${record.approver ? '，审批人：' + record.approver : ''}`,
    icon: iconMap[action] || 'bell',
    color: colorMap[action] || '#e8f3ff',
    link: { page: 'overtime', tab: 'records', recordId: record.id }
  });
}
function _otNotifyOnSubmit(record) {
  if (typeof _pushNotify !== 'function') return;
  const typeStr = record.type === 'overtime' ? '加班' : '工损';
  _pushNotify({
    type: 'approval',
    title: `新${typeStr}申请待审批`,
    body: `${record.memberName} 提交了${typeStr}申请（${record.date} ${record.startTime}-${record.endTime}，${record.duration}h）`,
    icon: 'bell',
    color: '#e8f3ff',
    link: { page: 'overtime', tab: 'records', recordId: record.id }
  });
}

// 导出工时报表（CSV）— 使用通用导出
function exportOTReport() {
  const records = OVERTIME_RECORDS.filter(r => r.status === 'approved');
  _doExportRecords(records, `工时报表_${formatDate(new Date())}`);
  addWorkLog('工时系统', '数据导出', `导出工时报表（${records.length}条记录）`);
  showToast(`报表已导出（${records.length} 条记录）`, 'success');
}
