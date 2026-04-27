// 人员管理模块（r134: 3级角色体系，用 isManagerRole() 替代散落的 includes 判断）
function renderMembersPage(container) {
  const canManage = isManagerRole();
  const teamNames = getTeamNames();
  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">人员管理</div>
        <div class="page-subtitle">管理团队成员信息与权限</div>
      </div>
      <div class="page-actions">
        ${canManage ? '<button class="btn btn-default btn-sm" onclick="showTeamManager()">团队管理</button>' : ''}
        <button class="btn btn-default btn-sm" onclick="showBatchImport()">批量导入</button>
        <button class="btn btn-primary btn-sm" onclick="showAddMember()">+ 新增人员</button>
      </div>
    </div>

    <div class="filter-bar">
      <div class="filter-item">
        <span class="filter-label">团队</span>
        <select class="filter-select" id="memberTeamFilter" onchange="filterMembers()">
          <option value="all">全部</option>
          ${teamNames.map(t => `<option value="${t}">${t}</option>`).join('')}
        </select>
      </div>
      <div class="filter-item">
        <span class="filter-label">权限</span>
        <select class="filter-select" id="memberRoleFilter" onchange="filterMembers()">
          <option value="all">全部</option>
          ${Object.entries(ROLES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
        </select>
      </div>
      <div class="filter-item" style="margin-left:auto">
        <input type="text" class="form-control" style="width:180px;height:28px" placeholder="搜索姓名/MIS号..." id="memberSearch" oninput="filterMembers()">
      </div>
    </div>

    <div class="member-grid" id="memberGrid">
      ${renderMemberCards(MEMBERS_DATA)}
    </div>
  `;
}

// 判断当前用户是否有管理权限（管理员及以上）
function canEditAvatar() {
  return isManagerRole();
}

function renderMemberCards(members) {
  const canManage = isManagerRole();
  return members.map(m => {
    const effLevel = getEfficiencyLevel(m.efficiency);
    const todayShift = getMemberShift(m.id, new Date().getDate());
    const shiftInfo = SHIFTS[todayShift] || SHIFTS.OFF;
    const canEdit = canEditAvatar();
    const avatarUrl = getAvatarUrl(m);
    const tColor = getTeamColor(m.team);
    return `
      <div class="member-card" onclick="showPersonDetail(${m.id})">
        <div class="member-card-header">
          <!-- 头像区：管理员+可点击编辑 -->
          <div class="member-avatar-wrap" style="position:relative;flex-shrink:0">
            <img src="${avatarUrl}" alt="${m.name}"
              style="width:40px;height:40px;border-radius:50%;object-fit:cover;display:block;cursor:${canEdit ? 'pointer' : 'default'}"
              onerror="this.onerror=null;this.src='${_uiAvatar(m.name)}'"
              onclick="${canEdit ? `event.stopPropagation();showAvatarEditor(${m.id})` : ''}"
              title="${canEdit ? '点击修改头像' : m.name}">
            ${canEdit ? `
            <div class="avatar-edit-badge" onclick="event.stopPropagation();showAvatarEditor(${m.id})" title="修改头像">
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                <path d="M6.5 1L8 2.5L3 7.5H1.5V6L6.5 1Z" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>
              </svg>
            </div>` : ''}
          </div>
          <div class="member-info">
            <div class="member-name">${m.name}</div>
            <div class="member-mis">${m.mis}</div>
            <div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap;align-items:center">
              <span class="tag" style="font-size:10px;background:${tColor}18;color:${tColor};border:1px solid ${tColor}30">${m.team}</span>
              <span class="tag tag-gray" style="font-size:10px">${ROLES[m.role] || m.role}</span>
            </div>
          </div>
          <div style="text-align:right">
            <div class="shift-cell ${shiftInfo.color}" style="display:inline-flex;padding:2px 8px;border-radius:4px;font-size:11px;margin-bottom:4px">${shiftInfo.name}</div>
            ${!m.excludeFromSchedule ? `<div><span class="efficiency-badge eff-${effLevel}">${getEfficiencyLabel(m.efficiency)}</span></div>` : ''}
            ${canManage ? `<div style="margin-top:4px;display:flex;gap:4px;justify-content:flex-end"><button class="btn btn-ghost" style="font-size:10px;padding:1px 6px;min-height:0" onclick="event.stopPropagation();showEditMember(${m.id})" title="编辑人员">编辑</button></div>` : ''}
          </div>
        </div>
        ${!m.excludeFromSchedule ? `
        <div class="member-stats">
          <div class="member-stat">
            <div class="member-stat-val" style="color:var(--primary)">${m.efficiency}</div>
            <div class="member-stat-label">人效/天</div>
          </div>
          <div class="member-stat">
            <div class="member-stat-val" style="color:var(--success)">${m.quality}%</div>
            <div class="member-stat-label">质量</div>
          </div>
          <div class="member-stat">
            <div class="member-stat-val">${ATTENDANCE_STATS[m.id]?.workDays || 0}</div>
            <div class="member-stat-label">出勤天</div>
          </div>
        </div>` : `<div style="text-align:center;padding:8px 0;color:var(--text-tertiary);font-size:12px">${m.mis === AUTH_PERMANENT_OWNER ? '永久管理员 · 全权限' : '不参与排班'}</div>`}
      </div>
    `;
  }).join('');
}

function filterMembers() {
  const team = document.getElementById('memberTeamFilter')?.value || 'all';
  const role = document.getElementById('memberRoleFilter')?.value || 'all';
  const search = document.getElementById('memberSearch')?.value || '';
  let filtered = MEMBERS_DATA;
  if (team !== 'all') filtered = filtered.filter(m => m.team === team);
  if (role !== 'all') filtered = filtered.filter(m => m.role === role);
  if (search) filtered = filtered.filter(m => m.name.includes(search) || m.mis.includes(search));
  const grid = document.getElementById('memberGrid');
  if (grid) grid.innerHTML = renderMemberCards(filtered);
}

// ===== r133: 团队管理弹窗 =====
function showTeamManager() {
  if (!isManagerRole()) {
    showToast('权限不足', 'warning'); return;
  }
  _renderTeamManagerContent();
}

function _renderTeamManagerContent() {
  const teams = CUSTOM_TEAMS;
  const content = `
    <div style="margin-bottom:16px">
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <input type="text" class="form-control" id="newTeamNameInput" placeholder="输入新团队名称（如：XX团队）" style="flex:1">
        <input type="color" id="newTeamColorInput" value="${_TEAM_COLORS[teams.length % _TEAM_COLORS.length]}" style="width:36px;height:32px;border:1px solid var(--border);border-radius:6px;padding:2px;cursor:pointer" title="选择颜色">
        <button class="btn btn-primary btn-sm" onclick="_addTeam()">添加</button>
      </div>
      <div id="teamListArea">
        ${_renderTeamList()}
      </div>
    </div>
    <div class="alert-banner alert-info" style="margin-top:8px">
      团队用于对人员进行分类管理。修改团队名称后，该团队下所有成员的所属团队会自动同步更新。删除团队后，该团队下的成员会变为"未分配"。
    </div>
  `;
  openModal('团队管理', content, `
    <button class="btn btn-default" onclick="closeModal()">关闭</button>
  `);
}

function _renderTeamList() {
  if (CUSTOM_TEAMS.length === 0) {
    return '<div style="text-align:center;padding:20px;color:var(--text-tertiary);font-size:13px">暂无团队，请添加</div>';
  }
  return CUSTOM_TEAMS.map((t, idx) => {
    const memberCount = MEMBERS_DATA.filter(m => m.team === t.name).length;
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg);border-radius:8px;margin-bottom:6px">
        <span style="width:14px;height:14px;border-radius:50%;background:${t.color};flex-shrink:0"></span>
        <input type="text" class="form-control" value="${t.name}" style="flex:1;height:28px;font-size:13px"
          onchange="_renameTeam('${t.id}',this.value)" id="tmInput_${t.id}">
        <input type="color" value="${t.color}" style="width:28px;height:28px;border:1px solid var(--border);border-radius:4px;padding:1px;cursor:pointer"
          onchange="_changeTeamColor('${t.id}',this.value)">
        <span style="font-size:11px;color:var(--text-tertiary);white-space:nowrap">${memberCount} 人</span>
        <button class="btn btn-ghost btn-sm" style="color:var(--danger);padding:2px 6px;min-height:0" onclick="_deleteTeam('${t.id}')" title="删除团队">
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M3 4h8M5.5 4V3a1 1 0 011-1h1a1 1 0 011 1v1M4 4v7.5a1 1 0 001 1h4a1 1 0 001-1V4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>`;
  }).join('');
}

function _addTeam() {
  const nameInput = document.getElementById('newTeamNameInput');
  const colorInput = document.getElementById('newTeamColorInput');
  const name = nameInput?.value?.trim();
  if (!name) { showToast('请输入团队名称', 'warning'); return; }
  if (CUSTOM_TEAMS.some(t => t.name === name)) { showToast('该团队已存在', 'warning'); return; }
  const color = colorInput?.value || _TEAM_COLORS[CUSTOM_TEAMS.length % _TEAM_COLORS.length];
  CUSTOM_TEAMS.push({ id: 'tm_' + Date.now(), name, color });
  // 同步更新 TEAMS 数组
  _syncTeamsArray();
  saveCustomTeams();
  const area = document.getElementById('teamListArea');
  if (area) area.innerHTML = _renderTeamList();
  if (nameInput) nameInput.value = '';
  showToast(`团队"${name}"已添加`, 'success');
}

function _renameTeam(teamId, newName) {
  newName = newName.trim();
  if (!newName) { showToast('团队名称不能为空', 'warning'); return; }
  const t = CUSTOM_TEAMS.find(t => t.id === teamId);
  if (!t) return;
  if (t.name === newName) return;
  if (CUSTOM_TEAMS.some(x => x.id !== teamId && x.name === newName)) {
    showToast('该名称已被使用', 'warning');
    const input = document.getElementById('tmInput_' + teamId);
    if (input) input.value = t.name;
    return;
  }
  const oldName = t.name;
  // 同步更新所有使用旧团队名的成员
  MEMBERS_DATA.forEach(m => { if (m.team === oldName) m.team = newName; });
  t.name = newName;
  _syncTeamsArray();
  saveCustomTeams();
  saveMembersData();
  showToast(`团队已重命名为"${newName}"`, 'success');
}

function _changeTeamColor(teamId, newColor) {
  const t = CUSTOM_TEAMS.find(t => t.id === teamId);
  if (!t) return;
  t.color = newColor;
  saveCustomTeams();
  const area = document.getElementById('teamListArea');
  if (area) area.innerHTML = _renderTeamList();
}

function _deleteTeam(teamId) {
  const t = CUSTOM_TEAMS.find(t => t.id === teamId);
  if (!t) return;
  const memberCount = MEMBERS_DATA.filter(m => m.team === t.name).length;
  if (!confirm(`确认删除团队"${t.name}"？${memberCount > 0 ? `\n该团队下有 ${memberCount} 名成员，删除后这些成员将变为"未分配"。` : ''}`)) return;
  // 清除使用该团队的成员
  MEMBERS_DATA.forEach(m => { if (m.team === t.name) m.team = ''; });
  CUSTOM_TEAMS.splice(CUSTOM_TEAMS.indexOf(t), 1);
  _syncTeamsArray();
  saveCustomTeams();
  saveMembersData();
  const area = document.getElementById('teamListArea');
  if (area) area.innerHTML = _renderTeamList();
  showToast(`团队"${t.name}"已删除`, 'success');
}

// 同步 CUSTOM_TEAMS → TEAMS 数组（保持排班等模块兼容）
function _syncTeamsArray() {
  TEAMS.length = 0;
  CUSTOM_TEAMS.forEach(t => TEAMS.push(t.name));
}

// ===== 头像编辑弹窗 =====
function showAvatarEditor(memberId) {
  const m = getMemberById(memberId);
  if (!m) return;
  if (!canEditAvatar()) { showToast('权限不足，无法修改头像', 'warning'); return; }

  const daxiangAvatarUrl = m.daxiangId
    ? `https://api.neixin.cn/xs/api/profile/image_${m.daxiangId}/${m.daxiangId}?t=THUMB_PROFILE`
    : '';
  const defaultAvatarUrl = _uiAvatar(m.name, 80);
  const currentIsDaxiang = m.avatar && m.avatar.includes('neixin.cn');
  const currentIsDefault = !m.avatar;

  const content = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;padding:14px;background:var(--bg);border-radius:10px">
      <img id="avatarPreviewImg" src="${getAvatarUrl(m)}"
        style="width:64px;height:64px;border-radius:50%;object-fit:cover;box-shadow:0 2px 10px rgba(0,0,0,0.12);flex-shrink:0"
        onerror="this.onerror=null;this.src='${defaultAvatarUrl}'">
      <div>
        <div style="font-size:15px;font-weight:600;color:var(--text-primary)">${m.name}</div>
        <div style="font-size:12px;color:var(--text-tertiary);margin-top:2px">${m.mis} · ${m.team}</div>
        <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">当前：<span id="avatarCurrentLabel" style="color:var(--primary);font-weight:500">${currentIsDefault ? '默认头像' : currentIsDaxiang ? '大象头像' : '自定义头像'}</span></div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <label class="avatar-option-card ${currentIsDefault ? 'selected' : ''}" id="avatarOptDefault"
        onclick="selectAvatarOption('default','${defaultAvatarUrl}','默认头像')">
        <input type="radio" name="avatarMode" value="default" ${currentIsDefault ? 'checked' : ''} style="display:none">
        <div class="avatar-option-preview">
          <img src="${defaultAvatarUrl}" style="width:48px;height:48px;border-radius:50%;object-fit:cover">
        </div>
        <div class="avatar-option-info">
          <div class="avatar-option-title">默认头像</div>
          <div class="avatar-option-desc">系统自动生成文字头像，无需上传</div>
        </div>
        <div class="avatar-option-check">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" fill="var(--primary)"/><path d="M4.5 7L6.5 9L9.5 5" stroke="#fff" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
      </label>

      <label class="avatar-option-card ${currentIsDaxiang ? 'selected' : ''}" id="avatarOptDaxiang"
        onclick="selectAvatarOption('daxiang','${daxiangAvatarUrl}','大象头像')">
        <input type="radio" name="avatarMode" value="daxiang" ${currentIsDaxiang ? 'checked' : ''} style="display:none">
        <div class="avatar-option-preview">
          ${daxiangAvatarUrl
            ? `<img src="${daxiangAvatarUrl}" style="width:48px;height:48px;border-radius:50%;object-fit:cover" onerror="this.onerror=null;this.src='${defaultAvatarUrl}'">`
            : `<div style="width:48px;height:48px;border-radius:50%;background:var(--fill-tertiary);display:flex;align-items:center;justify-content:center;font-size:20px">🐘</div>`
          }
        </div>
        <div class="avatar-option-info">
          <div class="avatar-option-title">大象头像</div>
          <div class="avatar-option-desc">${m.daxiangId ? `大象 ID: ${m.daxiangId}` : '未绑定大象账号'}</div>
        </div>
        <div class="avatar-option-check">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" fill="var(--primary)"/><path d="M4.5 7L6.5 9L9.5 5" stroke="#fff" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
      </label>
    </div>

    <div id="avatarDaxiangIdRow" style="display:${!m.daxiangId ? 'block' : 'none'}">
      <div class="alert-banner alert-warning" style="margin-bottom:10px">⚠️ 该成员未绑定大象账号，请先填写大象 ID 才能使用大象头像</div>
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">大象用户 ID</label>
        <div style="display:flex;gap:8px">
          <input type="text" class="form-control" id="newDaxiangId" placeholder="如 2939435860" style="flex:1">
          <button class="btn btn-default btn-sm" onclick="previewDaxiangAvatar(${memberId})">预览</button>
        </div>
      </div>
    </div>
  `;

  openModal(`修改头像 — ${m.name}`, content, `
    <button class="btn btn-default" onclick="closeModal()">取消</button>
    <button class="btn btn-primary" onclick="saveAvatarChange(${memberId})">保存</button>
  `);
}

function selectAvatarOption(mode, url, label) {
  document.querySelectorAll('.avatar-option-card').forEach(c => c.classList.remove('selected'));
  const card = document.getElementById(mode === 'default' ? 'avatarOptDefault' : 'avatarOptDaxiang');
  if (card) card.classList.add('selected');
  const radio = card?.querySelector('input[type="radio"]');
  if (radio) radio.checked = true;
  const preview = document.getElementById('avatarPreviewImg');
  if (preview && url) preview.src = url;
  const lbl = document.getElementById('avatarCurrentLabel');
  if (lbl) lbl.textContent = label;
  const dxRow = document.getElementById('avatarDaxiangIdRow');
  if (dxRow) dxRow.style.display = (mode === 'daxiang' && !dxRow.dataset.hasId) ? 'block' : 'none';
}

function previewDaxiangAvatar(memberId) {
  const idInput = document.getElementById('newDaxiangId');
  const dxId = idInput?.value?.trim();
  if (!dxId) { showToast('请输入大象用户 ID', 'warning'); return; }
  const url = `https://api.neixin.cn/xs/api/profile/image_${dxId}/${dxId}?t=THUMB_PROFILE`;
  const preview = document.getElementById('avatarPreviewImg');
  if (preview) {
    preview.src = url;
    preview.onerror = () => { preview.src = _uiAvatar(getMemberById(memberId)?.name || '?'); showToast('头像加载失败，请检查大象ID', 'warning'); };
  }
  const dxCard = document.getElementById('avatarOptDaxiang');
  if (dxCard) {
    const img = dxCard.querySelector('img');
    if (img) img.src = url;
    dxCard.dataset.daxiangUrl = url;
    dxCard.dataset.daxiangId = dxId;
  }
  showToast('已预览大象头像，确认后保存', 'info');
}

function saveAvatarChange(memberId) {
  const m = getMemberById(memberId);
  if (!m) return;
  const selected = document.querySelector('input[name="avatarMode"]:checked');
  if (!selected) { showToast('请选择头像类型', 'warning'); return; }

  const mode = selected.value;
  if (mode === 'default') {
    m.avatar = '';
  } else {
    const newDxId = document.getElementById('newDaxiangId')?.value?.trim();
    if (newDxId) {
      m.daxiangId = newDxId;
      m.avatar = `https://api.neixin.cn/xs/api/profile/image_${newDxId}/${newDxId}?t=THUMB_PROFILE`;
    } else if (m.daxiangId) {
      m.avatar = `https://api.neixin.cn/xs/api/profile/image_${m.daxiangId}/${m.daxiangId}?t=THUMB_PROFILE`;
    } else {
      showToast('请先填写大象用户 ID', 'warning'); return;
    }
  }

  saveMembersData();
  addWorkLog('人员管理', '头像修改', `修改 ${m.name} 的头像为${mode === 'default' ? '默认头像' : '大象头像'}`);
  closeModal();
  showToast(`${m.name} 的头像已更新`, 'success');
  renderMembersPage(document.getElementById('contentArea'));
}

// ===== 新增人员 =====
function showAddMember() {
  const teamNames = getTeamNames();
  const content = `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label required">姓名</label>
        <input type="text" class="form-control" id="newMemberName" placeholder="请输入姓名" oninput="updateNewMemberAvatarPreview()">
      </div>
      <div class="form-group">
        <label class="form-label required">MIS号</label>
        <input type="text" class="form-control" id="newMemberMis" placeholder="如 wb_xxxxx">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label required">所属团队</label>
        <select class="form-control" id="newMemberTeam">
          ${teamNames.map(t => `<option>${t}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">角色</label>
        <select class="form-control" id="newMemberRole">
          <option value="reviewer">审核员</option>
          <option value="leader">小组长</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">大象用户ID</label>
        <input type="text" class="form-control" id="newMemberDaxiangId" placeholder="如 2939435860（可选）">
      </div>
      <div class="form-group">
        <label class="form-label">标准人效/天</label>
        <input type="number" class="form-control" id="newMemberEfficiency" placeholder="如 300" value="0">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">质量准确率(%)</label>
        <input type="number" class="form-control" id="newMemberQuality" placeholder="如 98.5" value="0" step="0.1">
      </div>
      <div class="form-group">
        <label class="form-label">参与排班</label>
        <select class="form-control" id="newMemberSchedule">
          <option value="yes" selected>是 - 参与排班</option>
          <option value="no">否 - 不参与排班</option>
        </select>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--bg);border-radius:10px;margin-top:8px">
      <img id="newMemberAvatarPreview" src="${_uiAvatar('新成员', 48)}" style="width:48px;height:48px;border-radius:50%;object-fit:cover">
      <div style="font-size:12px;color:var(--text-tertiary)">头像预览（保存后可在人员卡片上修改头像）</div>
    </div>
  `;

  openModal('新增人员', content, `
    <button class="btn btn-default" onclick="closeModal()">取消</button>
    <button class="btn btn-primary" onclick="_doAddMember()">确认添加</button>
  `);
}

function updateNewMemberAvatarPreview() {
  const name = document.getElementById('newMemberName')?.value?.trim() || '新成员';
  const img = document.getElementById('newMemberAvatarPreview');
  if (img) img.src = _uiAvatar(name, 48);
}

function _doAddMember() {
  const name = document.getElementById('newMemberName')?.value?.trim();
  const mis = document.getElementById('newMemberMis')?.value?.trim();
  const team = document.getElementById('newMemberTeam')?.value;
  const role = document.getElementById('newMemberRole')?.value || 'reviewer';
  const daxiangId = document.getElementById('newMemberDaxiangId')?.value?.trim() || '';
  const efficiency = parseInt(document.getElementById('newMemberEfficiency')?.value) || 0;
  const quality = parseFloat(document.getElementById('newMemberQuality')?.value) || 0;

  if (!name) { showToast('请输入姓名', 'warning'); return; }
  if (!mis) { showToast('请输入MIS号', 'warning'); return; }
  if (!team) { showToast('请选择所属团队', 'warning'); return; }
  if (MEMBERS_DATA.some(m => m.mis === mis)) { showToast(`MIS号"${mis}"已存在`, 'warning'); return; }

  const newId = Math.max(0, ...MEMBERS_DATA.map(m => m.id)) + 1;
  const avatar = daxiangId
    ? `https://api.neixin.cn/xs/api/profile/image_${daxiangId}/${daxiangId}?t=THUMB_PROFILE`
    : '';

  const excludeFromSchedule = document.getElementById('newMemberSchedule')?.value === 'no';
  MEMBERS_DATA.push({ id: newId, name, mis, daxiangId, team, role, avatar, efficiency, quality, excludeFromSchedule, managedTeams: [] });
  saveMembersData();
  closeModal();
  showToast(`成员"${name}"已添加`, 'success');
  addWorkLog('人员管理', '新增人员', `新增 ${name}（${mis}），团队：${team}`);
  renderMembersPage(document.getElementById('contentArea'));
}

// ===== 编辑人员 =====
function showEditMember(memberId) {
  const m = getMemberById(memberId);
  if (!m) return;
  const canManage = isManagerRole();
  if (!canManage) { showToast('权限不足', 'warning'); return; }
  const teamNames = getTeamNames();

  const content = `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label required">姓名</label>
        <input type="text" class="form-control" id="editMemberName" value="${m.name}">
      </div>
      <div class="form-group">
        <label class="form-label required">MIS号</label>
        <input type="text" class="form-control" id="editMemberMis" value="${m.mis}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label required">所属团队</label>
        <select class="form-control" id="editMemberTeam">
          ${teamNames.map(t => `<option ${t === m.team ? 'selected' : ''}>${t}</option>`).join('')}
          ${!teamNames.includes(m.team) && m.team ? `<option selected>${m.team}</option>` : ''}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">角色</label>
        <select class="form-control" id="editMemberRole" ${m.mis === AUTH_PERMANENT_OWNER ? 'disabled' : ''}
          onchange="document.getElementById('editManagedTeamsRow').style.display=this.value==='leader'?'':'none'">
          <option value="reviewer" ${m.role === 'reviewer' ? 'selected' : ''}>审核员</option>
          <option value="leader" ${m.role === 'leader' ? 'selected' : ''}>小组长</option>
          ${CURRENT_USER.role === 'admin' ? `<option value="admin" ${m.role === 'admin' ? 'selected' : ''}>管理员</option>` : ''}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">大象用户ID</label>
        <input type="text" class="form-control" id="editMemberDaxiangId" value="${m.daxiangId || ''}">
      </div>
      <div class="form-group">
        <label class="form-label">标准人效/天</label>
        <input type="number" class="form-control" id="editMemberEfficiency" value="${m.efficiency}">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">质量准确率(%)</label>
        <input type="number" class="form-control" id="editMemberQuality" value="${m.quality}" step="0.1">
      </div>
      <div class="form-group">
        <label class="form-label">参与排班</label>
        <select class="form-control" id="editMemberSchedule">
          <option value="yes" ${!m.excludeFromSchedule ? 'selected' : ''}>是 - 参与排班</option>
          <option value="no" ${m.excludeFromSchedule ? 'selected' : ''}>否 - 不参与排班</option>
        </select>
      </div>
    </div>
    <div class="form-row" id="editManagedTeamsRow" style="display:${m.role === 'leader' ? '' : 'none'}">
      <div class="form-group" style="grid-column:1/-1">
        <label class="form-label">管辖团队（小组长可管理的团队范围，不选则无团队级权限）</label>
        <div id="editManagedTeamsWrap" style="display:flex;flex-wrap:wrap;gap:8px;padding:8px 0">
          ${getTeamNames().map(t => `<label style="display:flex;align-items:center;gap:4px;font-size:13px;cursor:pointer">
            <input type="checkbox" class="editManagedTeamCb" value="${t}" ${(m.managedTeams || []).includes(t) ? 'checked' : ''}> ${t}
          </label>`).join('')}
        </div>
      </div>
    </div>
  `;

  openModal(`编辑人员 — ${m.name}`, content, `
    ${m.mis !== AUTH_PERMANENT_OWNER ? `<button class="btn btn-default" style="color:var(--danger);margin-right:auto" onclick="_deleteMember(${memberId})">删除</button>` : ''}
    <button class="btn btn-default" onclick="closeModal()">取消</button>
    <button class="btn btn-primary" onclick="_saveEditMember(${memberId})">保存</button>
  `);
}

function _saveEditMember(memberId) {
  const m = getMemberById(memberId);
  if (!m) return;
  const name = document.getElementById('editMemberName')?.value?.trim();
  const mis = document.getElementById('editMemberMis')?.value?.trim();
  const team = document.getElementById('editMemberTeam')?.value;
  const role = document.getElementById('editMemberRole')?.value || m.role;
  const daxiangId = document.getElementById('editMemberDaxiangId')?.value?.trim() || '';
  const efficiency = parseInt(document.getElementById('editMemberEfficiency')?.value) || 0;
  const quality = parseFloat(document.getElementById('editMemberQuality')?.value) || 0;

  if (!name) { showToast('姓名不能为空', 'warning'); return; }
  if (!mis) { showToast('MIS号不能为空', 'warning'); return; }
  if (MEMBERS_DATA.some(x => x.id !== memberId && x.mis === mis)) {
    showToast(`MIS号"${mis}"已被其他成员使用`, 'warning'); return;
  }

  const changes = [];
  // 读取排班参与和管辖团队
  const scheduleVal = document.getElementById('editMemberSchedule')?.value;
  const newExclude = scheduleVal === 'no';
  const managedTeamsCbs = document.querySelectorAll('.editManagedTeamCb:checked');
  const newManagedTeams = Array.from(managedTeamsCbs).map(cb => cb.value);

  if (m.name !== name) changes.push(`姓名: ${m.name}→${name}`);
  if (m.team !== team) changes.push(`团队: ${m.team}→${team}`);
  if (m.role !== role) changes.push(`角色: ${ROLES[m.role]}→${ROLES[role]}`);
  if (!!m.excludeFromSchedule !== newExclude) changes.push(`排班: ${m.excludeFromSchedule ? '不参与→参与' : '参与→不参与'}`);

  m.name = name;
  m.mis = mis;
  m.team = team;
  if (m.mis !== AUTH_PERMANENT_OWNER) m.role = role;
  m.daxiangId = daxiangId;
  m.efficiency = efficiency;
  m.quality = quality;
  m.excludeFromSchedule = newExclude;
  if (m.role === 'leader') m.managedTeams = newManagedTeams;

  if (daxiangId && m.avatar && m.avatar.includes('neixin.cn')) {
    m.avatar = `https://api.neixin.cn/xs/api/profile/image_${daxiangId}/${daxiangId}?t=THUMB_PROFILE`;
  }

  saveMembersData();
  closeModal();
  showToast(`${name} 的信息已更新`, 'success');
  if (changes.length > 0) {
    addWorkLog('人员管理', '编辑人员', `${name}（${mis}）：${changes.join('，')}`);
  }
  renderMembersPage(document.getElementById('contentArea'));
}

function _deleteMember(memberId) {
  const m = getMemberById(memberId);
  if (!m) return;
  if (m.mis === AUTH_PERMANENT_OWNER) { showToast('无法删除永久管理员', 'warning'); return; }
  if (!confirm(`确认删除成员"${m.name}"？此操作不可撤销。`)) return;

  const idx = MEMBERS_DATA.findIndex(x => x.id === memberId);
  if (idx >= 0) MEMBERS_DATA.splice(idx, 1);
  if (SCHEDULE_DATA[memberId]) delete SCHEDULE_DATA[memberId];

  saveMembersData();
  saveScheduleData();
  closeModal();
  showToast(`成员"${m.name}"已删除`, 'success');
  addWorkLog('人员管理', '删除人员', `删除 ${m.name}（${m.mis}），原团队：${m.team}`);
  renderMembersPage(document.getElementById('contentArea'));
}

// ===== 批量导入 =====
function showBatchImport() {
  const canManage = isManagerRole();
  if (!canManage) { showToast('权限不足', 'warning'); return; }
  const teamNames = getTeamNames();

  const content = `
    <div class="form-group">
      <label class="form-label">导入格式</label>
      <div class="alert-banner alert-info" style="font-size:12px;line-height:1.6">
        每行一个人员，字段用制表符或逗号分隔，格式如下：<br>
        <code>姓名, MIS号, 所属团队, 角色(reviewer/admin), 大象ID, 人效, 质量</code><br>
        其中角色、大象ID、人效、质量为可选字段。<br>
        示例：<code>张三, wb_zhangsan, 高曝团队, reviewer, 12345678, 300, 98.5</code>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">默认团队（未指定时使用）</label>
      <select class="form-control" id="batchDefaultTeam">
        ${teamNames.map(t => `<option value="${t}">${t}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label required">批量数据</label>
      <textarea class="form-control" id="batchImportData" rows="10" placeholder="张三, wb_zhangsan, 高曝团队&#10;李四, wb_lisi, 复审团队" style="font-family:monospace;font-size:12px"></textarea>
    </div>
    <div id="batchImportPreview"></div>
  `;

  openModal('批量导入人员', content, `
    <button class="btn btn-default" onclick="closeModal()">取消</button>
    <button class="btn btn-default" onclick="_previewBatchImport()">预览</button>
    <button class="btn btn-primary" onclick="_confirmBatchImport()">确认导入</button>
  `, '640px');
}

function _parseBatchLines() {
  const raw = document.getElementById('batchImportData')?.value || '';
  const defaultTeam = document.getElementById('batchDefaultTeam')?.value || TEAMS[0] || '';
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const results = [];

  for (const line of lines) {
    const parts = line.includes('\t') ? line.split('\t') : line.split(',');
    const trimmed = parts.map(p => p.trim());
    if (trimmed.length < 2) {
      results.push({ error: `格式不正确: "${line}"`, raw: line });
      continue;
    }
    const [name, mis, team, role, daxiangId, efficiency, quality] = trimmed;
    if (!name || !mis) {
      results.push({ error: `姓名或MIS号为空: "${line}"`, raw: line });
      continue;
    }
    if (MEMBERS_DATA.some(m => m.mis === mis)) {
      results.push({ error: `MIS号"${mis}"已存在`, raw: line, duplicate: true });
      continue;
    }
    results.push({
      name,
      mis,
      team: team || defaultTeam,
      role: (role === 'admin' || role === 'leader') ? role : 'reviewer',
      daxiangId: daxiangId || '',
      efficiency: parseInt(efficiency) || 0,
      quality: parseFloat(quality) || 0,
      raw: line
    });
  }
  return results;
}

function _previewBatchImport() {
  const results = _parseBatchLines();
  const valid = results.filter(r => !r.error);
  const errors = results.filter(r => r.error);
  const preview = document.getElementById('batchImportPreview');
  if (!preview) return;

  let html = `<div style="margin-top:12px">`;
  if (valid.length > 0) {
    html += `<div style="font-size:13px;font-weight:500;margin-bottom:8px;color:var(--success)">✓ 可导入 ${valid.length} 人</div>`;
    html += `<div class="table-wrap" style="max-height:200px;overflow-y:auto"><table class="table" style="font-size:12px"><thead><tr><th>姓名</th><th>MIS</th><th>团队</th><th>角色</th></tr></thead><tbody>`;
    valid.forEach(v => {
      html += `<tr><td>${v.name}</td><td>${v.mis}</td><td>${v.team}</td><td>${ROLES[v.role] || v.role}</td></tr>`;
    });
    html += `</tbody></table></div>`;
  }
  if (errors.length > 0) {
    html += `<div style="font-size:13px;font-weight:500;margin:8px 0;color:var(--danger)">✗ ${errors.length} 条异常</div>`;
    errors.forEach(e => {
      html += `<div style="font-size:12px;color:var(--danger);padding:4px 0">${e.error}</div>`;
    });
  }
  html += `</div>`;
  preview.innerHTML = html;
}

function _confirmBatchImport() {
  const results = _parseBatchLines();
  const valid = results.filter(r => !r.error);
  if (valid.length === 0) {
    showToast('没有可导入的有效数据，请检查格式', 'warning');
    return;
  }

  let maxId = Math.max(0, ...MEMBERS_DATA.map(m => m.id));
  const added = [];

  for (const v of valid) {
    maxId++;
    const avatar = v.daxiangId
      ? `https://api.neixin.cn/xs/api/profile/image_${v.daxiangId}/${v.daxiangId}?t=THUMB_PROFILE`
      : '';
    MEMBERS_DATA.push({
      id: maxId, name: v.name, mis: v.mis, daxiangId: v.daxiangId,
      team: v.team, role: v.role, avatar, efficiency: v.efficiency, quality: v.quality,
      excludeFromSchedule: false, managedTeams: [],
    });
    added.push(v.name);
  }

  saveMembersData();
  closeModal();
  showToast(`成功导入 ${added.length} 名成员`, 'success');
  addWorkLog('人员管理', '批量导入', `导入 ${added.length} 人：${added.join('、')}`);
  renderMembersPage(document.getElementById('contentArea'));
}
