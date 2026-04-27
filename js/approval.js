// 统一审批工作台
function renderApprovalPage(container) {
  const pending = APPROVAL_RECORDS.filter(r => r.status === 'pending');
  const done = APPROVAL_RECORDS.filter(r => r.status !== 'pending');
  // r81: 我发起的（含 pending + cancelled + approved + rejected）
  const mine = APPROVAL_RECORDS.filter(r =>
    r.applicant === CURRENT_USER.name || r.applicantId === CURRENT_USER.id
  );

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">审批工作台</div>
        <div class="page-subtitle">统一处理考勤、工时、权限变更等审批事项</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-default btn-sm" onclick="batchApprove()">批量通过</button>
      </div>
    </div>

    <div class="tabs" id="approvalTabs">
      <div class="tab active" onclick="switchApprovalTab(this,'pending')">
        待审批
        <span class="tab-badge">${pending.length}</span>
      </div>
      <div class="tab" onclick="switchApprovalTab(this,'done')">已处理</div>
      <div class="tab" onclick="switchApprovalTab(this,'mine')">
        我发起的
        ${mine.filter(r => r.status === 'pending').length > 0 ? `<span class="tab-badge" style="background:#FF7D00">${mine.filter(r => r.status === 'pending').length}</span>` : ''}
      </div>
    </div>

    <div id="approvalContent" style="min-height:0;padding-bottom:8px">
      ${renderApprovalList(pending, true)}
    </div>
  `;
}

function switchApprovalTab(el, type) {
  document.querySelectorAll('#approvalTabs .tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  let records;
  if (type === 'pending') {
    records = APPROVAL_RECORDS.filter(r => r.status === 'pending');
  } else if (type === 'mine') {
    records = APPROVAL_RECORDS.filter(r =>
      r.applicant === CURRENT_USER.name || r.applicantId === CURRENT_USER.id
    );
  } else {
    records = APPROVAL_RECORDS.filter(r => r.status !== 'pending');
  }
  document.getElementById('approvalContent').innerHTML = renderApprovalList(records, type === 'pending', type === 'mine');
}

function renderApprovalList(records, showActions, isMine) {
  if (records.length === 0) return `
  <div style="background:var(--card);border:0.5px solid var(--border);border-radius:var(--radius-md);
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    padding:48px 24px;gap:12px;box-shadow:var(--shadow-xs)">
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="20" stroke="#C9CDD4" stroke-width="2"/>
      <path d="M16 24L22 30L32 18" stroke="#C9CDD4" stroke-width="2" stroke-linecap="round"/>
    </svg>
    <p style="font-size:14px;color:var(--text-tertiary);margin:0">${isMine ? '暂无发起的申请' : '暂无待处理事项'}</p>
    <p style="font-size:12px;color:var(--text-quaternary,#bbb);margin:0">${isMine ? '你还没有提交过任何申请' : '所有审批事项均已处理完毕'}</p>
  </div>`;

const typeLabels = { leave: '请假申请', overtime: '加班申请', injury: '工损申请', permission: '权限变更', shift_change: '排班调整' };
const typeColors = { leave: 'tag-blue', overtime: 'tag-orange', injury: 'tag-red', permission: 'tag-gray', shift_change: 'tag-purple' };
  // r81: 状态标签
  const statusTag = (r) => {
    if (r.status === 'pending') return `<span class="tag tag-orange" style="font-size:11px">待审批</span>`;
    if (r.status === 'approved') return `<span class="tag tag-green" style="font-size:11px">已通过</span>`;
    if (r.status === 'rejected') return `<span class="tag tag-red" style="font-size:11px">已驳回</span>`;
    if (r.status === 'cancelled') return `<span class="tag tag-gray" style="font-size:11px">已撤回</span>`;
    return '';
  };

  return records.map(r => {
    const applicant = getMemberById(r.applicantId);
    // r81: 「我发起的」视图中，pending 记录显示撤回按钮
    const canWithdraw = isMine && r.status === 'pending';
    return `
      <div class="approval-card">
        <div class="approval-card-header">
          <div style="display:flex;align-items:center;gap:10px">
            ${applicant ? avatarImg(applicant, '32px') : ''}
            <div>
              <div style="display:flex;align-items:center;gap:8px">
                <span class="approval-type">${r.applicant}</span>
                <span class="tag ${typeColors[r.type] || 'tag-gray'}">${typeLabels[r.type] || r.type}</span>
                <span class="tag tag-blue" style="font-size:11px">${r.team}</span>
                ${isMine ? statusTag(r) : ''}
              </div>
              <div style="font-size:12px;color:var(--text-tertiary);margin-top:2px">${r.content}</div>
            </div>
          </div>
          <div style="text-align:right">
            <div class="approval-time">${r.submittedAt}</div>
            ${!showActions && !isMine ? `<span class="tag ${r.status === 'approved' ? 'tag-green' : 'tag-red'}" style="margin-top:4px">${r.status === 'approved' ? '已通过' : '已驳回'}</span>` : ''}
          </div>
        </div>

        <!-- 上下文辅助信息 -->
        <div class="approval-context">
          <div style="font-size:11px;font-weight:600;color:var(--text-tertiary);margin-bottom:6px">📋 申请人上下文</div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
            ${Object.entries(r.context || {}).map(([k, v]) => `
              <div>
                <div style="font-size:11px;color:var(--text-tertiary)">${
                  k === 'recentAttendance' ? '近期出勤' :
                  k === 'teamOnDuty' ? '团队在岗' :
                  k === 'efficiency' ? '当前人效' :
                  k === 'recentOT' ? '近期加班' :
                  k === 'shift' ? '当日班次' :
                  k === 'currentShift' ? '当前班次' :
                  k === 'targetShift' ? '目标班次' :
                  k === 'reason' ? '申请原因' : k
                }</div>
                <div style="font-size:12px;font-weight:500;color:var(--text-primary)">${v}</div>
              </div>
            `).join('')}
          </div>
        </div>

        ${showActions ? `
        <div class="approval-actions">
          <button class="btn btn-default btn-sm" onclick="showRejectModal('${r.id}')">驳回</button>
          <button class="btn btn-default btn-sm" onclick="showToast('已要求补充材料','info')">要求补充</button>
          <button class="btn btn-success btn-sm" onclick="approveRecord('${r.id}')">通过</button>
        </div>` : ''}
        ${canWithdraw ? `
        <div class="approval-actions">
          <button class="btn btn-default btn-sm" onclick="withdrawFromApprovalPage('${r.id}')">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M7 4l-4 4 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            撤回申请
          </button>
        </div>` : ''}
      </div>
    `;
  }).join('');
}

// r81: 从审批工作台撤回申请
function withdrawFromApprovalPage(recordId) {
  const record = APPROVAL_RECORDS.find(r => r.id === recordId);
  if (!record || record.status !== 'pending') { showToast('申请已处理，无法撤回', 'warning'); return; }
  openModal('撤回申请', `
    <div style="font-size:14px;color:var(--text-primary);margin-bottom:8px">确认撤回以下申请？</div>
    <div style="font-size:13px;color:var(--text-secondary);background:var(--bg-secondary,#F7F8FA);border-radius:8px;padding:10px 12px">${record.content}</div>
    <div style="font-size:12px;color:var(--text-tertiary);margin-top:8px">撤回后申请将从待审列表移除，可重新提交。</div>
  `, `
    <button class="btn btn-default" onclick="closeModal()">取消</button>
    <button class="btn btn-danger" onclick="closeModal();_doWithdrawApproval('${recordId}')">确认撤回</button>
  `);
}

function _doWithdrawApproval(recordId) {
  const record = APPROVAL_RECORDS.find(r => r.id === recordId);
  if (!record) return;
  record.status = 'cancelled';
  record.cancelledAt = formatDate(new Date(), 'YYYY-MM-DD HH:mm');
  saveApprovalRecords();
  updateBadges();
  showToast('申请已撤回', 'success');
  addWorkLog('考勤系统', '撤回申请', record.content);
  renderApprovalPage(document.getElementById('contentArea'));
  // 切换回「我发起的」Tab
  setTimeout(() => {
    const tabs = document.querySelectorAll('#approvalTabs .tab');
    if (tabs[2]) { tabs[2].click(); }
  }, 50);
}

function approveRecord(id) {
  if (!checkPermission('approve')) return;
  const record = APPROVAL_RECORDS.find(r => r.id === id);
  if (!record) return;
  record.status = 'approved';
  record.approvedAt = formatDate(new Date(), 'YYYY-MM-DD HH:mm');
  record.approver = CURRENT_USER.name;

  // 同步更新关联记录（OT记录用 memberId 字段，审批记录用 applicantId 字段）
  const otRecord = OVERTIME_RECORDS.find(r => r.memberId === record.applicantId && r.status === 'pending');
  if (otRecord) {
    otRecord.status = 'approved';
    otRecord.approvedAt = record.approvedAt;
    otRecord.approver = CURRENT_USER.name;
  }

  // r90: 排班调整审批通过后自动回写排班数据
  if (record.type === 'shift_change' && record.shiftChangeData) {
    const scd = record.shiftChangeData;
    if (!SCHEDULE_DATA[scd.memberId]) SCHEDULE_DATA[scd.memberId] = {};
    SCHEDULE_DATA[scd.memberId][scd.day] = scd.newShift;
    saveScheduleData();
    if (typeof markMonthAsImported === 'function') markMonthAsImported(scd.year, scd.month);
  }

  saveApprovalRecords();
  saveOvertimeRecords();
  const typeLabel = record.type === 'leave' ? '请假' : record.type === 'overtime' ? '加班' : record.type === 'injury' ? '工损' : record.type === 'shift_change' ? '排班调整' : '其他';
  addWorkLog('审批工作台', '审批通过', `${record.applicant} 的${typeLabel}申请`);

  // 推送消息
  MESSAGES_DATA.unshift({
    id: MESSAGES_DATA.length + 1,
    type: 'result',
    title: `${record.applicant} 的申请已通过`,
    desc: record.content,
    time: '刚刚',
    read: false,
    icon: '✅',
    iconClass: 'msg-icon-green',
    action: 'worktime-data'
  });

  updateBadges();
  if (typeof _pushNotify === 'function') {
    _pushNotify({ type: 'approval', title: '审批通过', body: record.applicant + ' 的' + typeLabel + '申请已通过', icon: 'check', color: '#e8f9e8' });
  }
  showToast('审批已通过', 'success');
  renderApprovalPage(document.getElementById('contentArea'));
}

function showRejectModal(id) {
  const content = `
    <div class="form-group">
      <label class="form-label required">驳回原因</label>
      <textarea class="form-control" id="rejectReason" rows="3" placeholder="请输入驳回原因"></textarea>
    </div>
  `;
  openModal('驳回申请', content, `
    <button class="btn btn-default" onclick="closeModal()">取消</button>
    <button class="btn btn-danger" onclick="rejectRecord('${id}')">确认驳回</button>
  `);
}

function rejectRecord(id) {
  if (!checkPermission('approve')) return;
  const reason = document.getElementById('rejectReason')?.value;
  if (!reason) { showToast('请填写驳回原因', 'warning'); return; }
  const record = APPROVAL_RECORDS.find(r => r.id === id);
  if (record) {
    record.status = 'rejected';
    record.rejectReason = reason;
    saveApprovalRecords();
    addWorkLog('审批工作台', '审批驳回', `${record.applicant} 的申请被驳回：${reason}`);
    MESSAGES_DATA.unshift({
      id: MESSAGES_DATA.length + 1, type: 'result',
      title: `${record.applicant} 的申请已驳回`,
      desc: `驳回原因：${reason}`, time: '刚刚', read: false,
      icon: '❌', iconClass: 'msg-icon-red', action: 'worktime-data'
    });
    updateBadges();
    if (typeof _pushNotify === 'function') {
      _pushNotify({ type: 'approval', title: '审批驳回', body: record.applicant + ' 的申请已驳回：' + reason, icon: 'error', color: '#fde8e8' });
    }
  }
  closeModal();
  showToast('已驳回申请', 'success');
  renderApprovalPage(document.getElementById('contentArea'));
}

function batchApprove() {
  const pending = APPROVAL_RECORDS.filter(r => r.status === 'pending');
  if (pending.length === 0) { showToast('暂无待审批事项', 'info'); return; }
  const content = `
    <div class="alert-banner alert-warning">⚠️ 即将批量通过 ${pending.length} 条待审批申请，请确认</div>
    <div style="max-height:200px;overflow-y:auto;margin-top:12px">
      ${pending.map(r => `<div style="padding:6px 0;border-bottom:1px solid var(--border-light);font-size:13px">${r.applicant} - ${r.content}</div>`).join('')}
    </div>
  `;
  openModal('批量审批确认', content, `
    <button class="btn btn-default" onclick="closeModal()">取消</button>
    <button class="btn btn-success" onclick="executeBatchApprove()">确认批量通过</button>
  `);
}

function executeBatchApprove() {
  const pending = APPROVAL_RECORDS.filter(r => r.status === 'pending');
  pending.forEach(r => {
    r.status = 'approved';
    r.approvedAt = formatDate(new Date(), 'YYYY-MM-DD HH:mm');
    r.approver = CURRENT_USER.name;
  });
  saveApprovalRecords();
  addWorkLog('审批工作台', '批量审批', `批量通过 ${pending.length} 条申请`);
  updateBadges();
  if (typeof _pushNotify === 'function') {
    _pushNotify({ type: 'approval', title: '批量审批通过', body: '已批量通过 ' + pending.length + ' 条待审批申请', icon: 'check', color: '#e8f9e8' });
  }
  closeModal();
  showToast(`已批量通过 ${pending.length} 条申请`, 'success');
  renderApprovalPage(document.getElementById('contentArea'));
}
