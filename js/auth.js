// ============================================================
// 权限登录模块 (auth.js) r136
// r136: 多用户登录 — cookie-session + 选人登录，修复局域网全员同一账号 bug
// r135: 全栈部署模式 — SSO 信息从服务端 API 获取
// r134: 3级角色体系：admin（管理员）/ leader（小组长）/ reviewer（审核员）
// wb_aijunlei 永久拥有 admin 角色，无需申请，不可撤销
//
// 登录方式：
//   1. 大象 SSO 自动登录（Nginx 网关注入 + cookie）
//   2. 局域网选人登录（从成员列表选择 + cookie）
//   3. URL 参数登录（开发调试）
// 角色由 MEMBERS_DATA 中的 role 字段决定，登录时不再提供角色选择
// ============================================================

var AUTH_STORAGE_KEY     = 'glxt_auth_session';
var AUTH_PERMANENT_OWNER = 'wb_aijunlei';
var NOTIFY_STORAGE_KEY   = 'glxt_notifications';
var AUTH_SESSION_TTL     = 8 * 60 * 60 * 1000;

var AUTH_ADMIN_INFO = {
  name:      '艾俊磊',
  mis:       'wb_aijunlei',
  daxiangId: '3397720408',
};

// ============================================================
// SSO 信息读取（V4.2: SSO header / cookie / URL 参数）
// ============================================================
// 缓存 SSO 信息，避免重复请求
var _ssoInfoCache = null;

function _getSsoUserInfo() {
  // 优先返回缓存
  if (_ssoInfoCache) return _ssoInfoCache;

  // 1. 尝试从 URL 参数获取（开发模式 / 登录中转）
  try {
    var params = new URLSearchParams(window.location.search);
    var devMis = params.get('dev_mis') || params.get('mis');
    var devName = params.get('dev_name') || params.get('name');
    if (devMis) {
      _ssoInfoCache = { ok: true, mis: devMis, name: devName || devMis, env: 'dev' };
      return _ssoInfoCache;
    }
  } catch (e) {}

  // 2. 尝试从服务端 API 同步获取
  try {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/auth/sso-info', false); // 同步请求
    xhr.send();
    if (xhr.status === 200) {
      var resp = JSON.parse(xhr.responseText);
      if (resp.ok && resp.mis) {
        _ssoInfoCache = { ok: true, mis: resp.mis, name: resp.name || resp.mis, env: resp.env || 'prod' };
        return _ssoInfoCache;
      }
    }
  } catch (e) {
    console.warn('[auth] SSO API 请求失败:', e);
  }

  // 3. 兼容旧版：尝试读取全局变量 SSO_USER_INFO（本地开发降级）
  if (typeof SSO_USER_INFO !== 'undefined' && SSO_USER_INFO && SSO_USER_INFO.ok) {
    _ssoInfoCache = { ok: true, mis: SSO_USER_INFO.mis, name: SSO_USER_INFO.name, env: SSO_USER_INFO.env || 'prod' };
    return _ssoInfoCache;
  }

  // V4.2: 未登录状态，前端将弹出选人登录窗
  return { ok: false, error: '未登录，请选择您的身份登录系统' };
}

// ============================================================
// 会话管理
// ============================================================
function _loadSession() {
  try { var raw = localStorage.getItem(AUTH_STORAGE_KEY); if (raw) return JSON.parse(raw); } catch(e) {}
  return null;
}
function _saveSession(session) {
  try { localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session)); } catch(e) {}
}
function _clearSession() { localStorage.removeItem(AUTH_STORAGE_KEY); }
function _isSessionExpired(session) {
  if (!session || !session.loginAt) return true;
  return (Date.now() - session.loginAt) > AUTH_SESSION_TTL;
}

// ============================================================
// 初始化
// ============================================================
(function initAuth() {
  var session = _loadSession();
  if (session && session.mis) {
    var member = MEMBERS_DATA.find(function(m) { return m.mis === session.mis; });
    if (member) {
      // r134: 角色从成员数据读取，永久管理员强制 admin
      var role = session.mis === AUTH_PERMANENT_OWNER ? 'admin' : (member.role || 'reviewer');
      CURRENT_USER.id = member.id; CURRENT_USER.name = member.name; CURRENT_USER.mis = member.mis;
      CURRENT_USER.role = role; CURRENT_USER.avatar = member.avatar || ''; CURRENT_USER.team = member.team || '';
      CURRENT_USER.managedTeams = member.managedTeams || [];
      CURRENT_USER.loggedIn = true;
      // 会话过期时静默续期（仅检查 SSO 信息是否匹配）
      if (_isSessionExpired(session)) {
        console.log('[auth] 会话已过期，尝试静默续期...');
        _silentRenew(member, session);
      }
    } else if (session.mis === AUTH_PERMANENT_OWNER) {
      // 管理员不在 MEMBERS_DATA 中也能恢复
      CURRENT_USER.id = 0; CURRENT_USER.name = session.name || '艾俊磊'; CURRENT_USER.mis = session.mis;
      CURRENT_USER.role = 'admin'; CURRENT_USER.avatar = ''; CURRENT_USER.team = '管理层';
      CURRENT_USER.managedTeams = [];
      CURRENT_USER.loggedIn = true;
    } else { _clearSession(); }
  }
  _initNotifySystem();
  _updateAuthUI();
  _initCrossTabSync();
})();

function _silentRenew(member, session) {
  var sso = _getSsoUserInfo();
  if (sso.ok && sso.mis === session.mis) {
    session.loginAt = Date.now(); _saveSession(session);
    console.log('[auth] 静默续期成功');
  } else if (sso.ok && sso.mis !== session.mis) {
    console.warn('[auth] 静默续期失败：SSO 账号不匹配');
    _clearSession(); CURRENT_USER.loggedIn = false; _updateAuthUI();
    showToast('检测到大象账号已切换，请重新登录', 'warning');
  } else {
    // SSO 信息不可用，保留本地会话但续期
    session.loginAt = Date.now(); _saveSession(session);
    console.warn('[auth] SSO 信息不可用，已保留本地会话并续期');
  }
}

// ============================================================
// 跨标签页同步
// ============================================================
function _initCrossTabSync() {
  window.addEventListener('storage', function(e) {
    if (e.key !== AUTH_STORAGE_KEY) return;
    if (!e.newValue) {
      if (CURRENT_USER.loggedIn) {
        CURRENT_USER.id = 0; CURRENT_USER.name = '游客'; CURRENT_USER.mis = '';
        CURRENT_USER.role = 'reviewer'; CURRENT_USER.avatar = ''; CURRENT_USER.team = '';
        CURRENT_USER.loggedIn = false;
        closeAllDrawers(); _updateAuthUI(); showToast('您已在其他标签页退出登录', 'info');
      }
    } else {
      try {
        var session = JSON.parse(e.newValue);
        if (session && session.mis && !CURRENT_USER.loggedIn) {
          var member = MEMBERS_DATA.find(function(m) { return m.mis === session.mis; });
          if (member) {
            var role = session.mis === AUTH_PERMANENT_OWNER ? 'admin' : (member.role || 'reviewer');
            CURRENT_USER.id = member.id; CURRENT_USER.name = member.name; CURRENT_USER.mis = member.mis;
            CURRENT_USER.role = role; CURRENT_USER.avatar = member.avatar || ''; CURRENT_USER.team = member.team || '';
            CURRENT_USER.managedTeams = member.managedTeams || [];
            CURRENT_USER.loggedIn = true; _updateAuthUI(); showToast('已同步登录状态：' + member.name, 'success');
          }
        }
      } catch(err) {}
    }
  });
}

// ============================================================
// 更新 UI
// ============================================================
function _updateAuthUI() {
  var user = CURRENT_USER;
  var isLoggedIn = !!user.loggedIn;
  var rp = ROLE_PERMISSIONS[user.role] || ROLE_PERMISSIONS.reviewer;
  var avatarEl = document.getElementById('navUserAvatar');
  if (avatarEl) { avatarEl.src = (user.avatar && isLoggedIn) ? user.avatar : _uiAvatar(user.name || '?', 32); avatarEl.onerror = function() { this.src = _uiAvatar(user.name || '?', 32); }; }
  var nameEl = document.getElementById('navUserName');
  if (nameEl) nameEl.textContent = isLoggedIn ? user.name : '未登录';
  var roleEl = document.getElementById('navUserRole');
  if (roleEl) { roleEl.textContent = isLoggedIn ? rp.label : '点击登录'; roleEl.style.color = isLoggedIn ? rp.badgeColor : '#999'; }
  var footerAvatar = document.getElementById('sidebarFooterAvatar');
  var footerName   = document.getElementById('sidebarFooterName');
  var footerRole   = document.getElementById('sidebarFooterRole');
  if (footerAvatar) { footerAvatar.src = (user.avatar && isLoggedIn) ? user.avatar : _uiAvatar(user.name || '?', 32); footerAvatar.onerror = function() { this.src = _uiAvatar(user.name || '?', 32); }; }
  if (footerName) footerName.textContent = isLoggedIn ? user.name : '未登录';
  if (footerRole) { footerRole.textContent = isLoggedIn ? rp.label : '—'; footerRole.style.color = isLoggedIn ? rp.badgeColor : '#999'; }
  _updateDrawerHeader();
  _updateDrawerNotifyBadge();
}

function _updateDrawerHeader() {
  var user = CURRENT_USER;
  var isLoggedIn = !!user.loggedIn;
  var rp = ROLE_PERMISSIONS[user.role] || ROLE_PERMISSIONS.reviewer;
  // Avatar
  var drawerAvatar = document.getElementById('drawerAvatar');
  if (drawerAvatar) { drawerAvatar.src = (user.avatar && isLoggedIn) ? user.avatar : _uiAvatar(user.name || '?', 60); drawerAvatar.onerror = function() { this.src = _uiAvatar(user.name || '?', 60); }; }
  // Name & MIS
  var drawerName = document.getElementById('drawerName');
  if (drawerName) drawerName.textContent = isLoggedIn ? user.name : '未登录';
  var drawerMis = document.getElementById('drawerMis');
  if (drawerMis) drawerMis.textContent = isLoggedIn ? user.mis : '';
  // Online dot
  var dot = document.getElementById('drawerOnlineDot');
  if (dot) { if (isLoggedIn) { dot.className = 'ud-online-dot'; } else { dot.className = 'ud-online-dot offline'; } }
  // Role badges
  var drawerBadge = document.getElementById('drawerRoleBadge');
  if (drawerBadge) {
    if (isLoggedIn) {
      var teamColor = typeof getTeamColor === 'function' ? getTeamColor(user.team) : '#999';
      drawerBadge.innerHTML = '<span style="display:inline-flex;align-items:center;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600;background:' + rp.badgeBg + ';color:' + rp.badgeColor + '">' + rp.label + '</span>'
        + (user.team ? '<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:500;background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.8);border:1px solid rgba(255,255,255,0.12)"><span style="width:6px;height:6px;border-radius:50%;background:' + teamColor + ';flex-shrink:0"></span>' + user.team + '</span>' : '')
        + (user.mis === AUTH_PERMANENT_OWNER ? '<span style="font-size:10px;color:#D6B4FC;background:rgba(114,46,209,0.2);padding:2px 8px;border-radius:20px;font-weight:500;border:1px solid rgba(114,46,209,0.2)">永久管理员</span>' : '');
    } else { drawerBadge.innerHTML = ''; }
  }
  // Header meta bar (login duration, team)
  var metaEl = document.getElementById('drawerHeaderMeta');
  if (metaEl) {
    if (isLoggedIn) {
      var loginDur = _getLoginDuration();
      var ssoLabel = '大象 SSO';
      metaEl.innerHTML = '<div class="ud-meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg><span class="ud-meta-val">' + loginDur + '</span></div>'
        + '<div class="ud-meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>' + ssoLabel + '</div>'
        + (user.team ? '<div class="ud-meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' + user.team + '</div>' : '');
    } else { metaEl.innerHTML = ''; }
  }
}

function _getLoginDuration() {
  try {
    var s = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY));
    if (s && s.loginAt) {
      var diff = Date.now() - s.loginAt;
      if (diff <= 0) return '刚刚登录';
      var h = Math.floor(diff / 3600000); var m = Math.floor((diff % 3600000) / 60000);
      if (h > 0) return h + '小时' + m + '分钟';
      return m + '分钟';
    }
  } catch(e) {} return '—';
}

function _updateDrawerNotifyBadge() {
if (!_notifications) return;
var unread = _notifications.filter(function(n) { return !n.read; }).length;
  var badge = document.getElementById('drawerNotifyBadge');
  if (badge) { badge.style.display = unread > 0 ? '' : 'none'; }
  // 顶栏用户头像旁的 badge 小红点
  var navBadge = document.getElementById('navUserBadge');
  if (navBadge) { navBadge.style.display = unread > 0 ? '' : 'none'; }
}

// ============================================================
// 登录弹窗（V4.2: SSO 识别 + 选人登录双模式）
// ============================================================
// V4.2 选人登录：暂存选中的成员
var _selectedLoginMember = null;

function showLoginModal() {
  _selectedLoginMember = null;
  var sso = _getSsoUserInfo();
  var ssoReady = sso.ok && sso.mis;

  // 根据 SSO 状态查找成员信息
  var member = ssoReady ? MEMBERS_DATA.find(function(m) { return m.mis === sso.mis; }) : null;
  var isNewUser = ssoReady && !member;
  var isPermanentOwner = ssoReady && sso.mis === AUTH_PERMANENT_OWNER;

  // r134: 角色由数据决定，不再提供选择
  var memberRole = isPermanentOwner ? 'admin' : (member ? (member.role || 'reviewer') : 'reviewer');

  var content = '<div style="text-align:center;padding:8px 0 20px">'
    + '<div style="width:72px;height:72px;border-radius:20px;background:linear-gradient(135deg,#1664FF,#3B82F6);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;box-shadow:0 6px 20px rgba(22,100,255,0.35)">'
    + '<svg width="40" height="40" viewBox="0 0 40 40" fill="none"><ellipse cx="20" cy="24" rx="14" ry="10" fill="white" opacity="0.9"/><ellipse cx="12" cy="28" rx="4" ry="6" fill="white" opacity="0.8"/><ellipse cx="28" cy="28" rx="4" ry="6" fill="white" opacity="0.8"/><circle cx="15" cy="20" r="2.5" fill="#1664FF"/><circle cx="25" cy="20" r="2.5" fill="#1664FF"/><path d="M8 18C8 12 13 8 20 8C27 8 32 12 32 18" stroke="white" stroke-width="2" stroke-linecap="round" fill="none"/></svg>'
    + '</div>'
    + '<div style="font-size:18px;font-weight:700;margin-bottom:6px;color:#1d2129">' + (ssoReady ? '大象账号 SSO 登录' : '选择身份登录') + '</div>'
    + '<div style="font-size:13px;color:var(--text-tertiary);line-height:1.6">' + (ssoReady ? '使用您当前登录的大象账号<br>一键授权进入工时管理系统' : '请从下方成员列表中选择您的姓名<br>确认后即可登录工时管理系统') + '</div>'
    + '</div>';

  if (ssoReady) {
    // ── SSO 用户预览卡片 ──
    var avatarSrc = (member && member.avatar) ? member.avatar : _uiAvatar(sso.name || sso.mis, 44);
    content += '<div style="background:linear-gradient(135deg,#EBF5FF,#F0F4FF);border-radius:14px;padding:16px;margin-bottom:16px;border:1px solid #d1e9ff">'
      + '<div style="display:flex;align-items:center;gap:12px">'
      + '<img src="' + avatarSrc + '" style="width:44px;height:44px;border-radius:12px;object-fit:cover;border:2px solid #fff;box-shadow:0 2px 8px rgba(22,100,255,0.15)" alt="" onerror="this.src=\'' + _uiAvatar(sso.name || sso.mis, 44) + '\'">'
      + '<div><div style="font-size:15px;font-weight:700;color:#1d2129">' + (sso.name || sso.mis) + '</div><div style="font-size:12px;color:#86909c;margin-top:2px">' + sso.mis + '</div></div>'
      + '<div style="margin-left:auto"><span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;background:#e8ffea;border-radius:20px;font-size:11px;font-weight:600;color:#00b42a"><svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6L5 9L10 3" stroke="#00b42a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>已验证</span></div>'
      + '</div></div>';

    // ── 新用户提示 ──
    if (isNewUser && !isPermanentOwner) {
      content += '<div style="background:#E8F4FF;border:1px solid #91CAFF;border-radius:12px;padding:14px 16px;margin-bottom:16px">'
        + '<div style="display:flex;align-items:flex-start;gap:10px">'
        + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1664FF" stroke-width="2" style="flex-shrink:0;margin-top:1px"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>'
        + '<div style="flex:1">'
        + '<div style="font-size:13px;font-weight:600;color:#1664FF;margin-bottom:4px">新用户自动注册</div>'
        + '<div style="font-size:12px;color:#86909c;line-height:1.6">您的账号不在系统成员列表中，登录后将自动创建为审核员身份。如需更高权限，请联系系统负责人。</div>'
        + '</div></div></div>';
    }

    // ── r134: 显示当前角色信息 ──
    var loginRp = ROLE_PERMISSIONS[memberRole] || ROLE_PERMISSIONS.reviewer;
    if (isPermanentOwner) {
      content += '<div style="background:#F3E8FF;border-radius:12px;padding:14px 16px;margin-bottom:16px;border:1px solid #D6B4FC">'
        + '<div style="display:flex;align-items:center;gap:8px"><span style="font-size:13px;font-weight:600;color:#7B2FBE">永久管理员</span><span style="font-size:11px;color:#7B2FBE;opacity:0.7">拥有所有权限，不可撤销</span></div>'
        + '</div>';
    } else {
      content += '<div style="background:' + loginRp.badgeBg + '20;border-radius:12px;padding:14px 16px;margin-bottom:16px;border:1px solid ' + loginRp.badgeBg + '">'
        + '<div style="display:flex;align-items:center;gap:8px">'
        + '<span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:10px;font-size:12px;font-weight:600;background:' + loginRp.badgeBg + ';color:' + loginRp.badgeColor + '">' + loginRp.label + '</span>'
        + '<span style="font-size:12px;color:var(--text-tertiary)">' + loginRp.desc + '</span>'
        + '</div></div>';
    }
  } else {
    // ── V4.2: SSO 不可用 — 显示「选人登录」界面 ──
    content += '<div style="background:#E8F4FF;border:1px solid #91CAFF;border-radius:12px;padding:14px 16px;margin-bottom:16px">'
      + '<div style="display:flex;align-items:flex-start;gap:10px">'
      + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1664FF" stroke-width="2" style="flex-shrink:0;margin-top:1px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
      + '<div style="flex:1">'
      + '<div style="font-size:13px;font-weight:600;color:#1664FF;margin-bottom:4px">选择身份登录</div>'
      + '<div style="font-size:12px;color:#86909c;line-height:1.6">局域网模式：请从下方成员列表中选择您的姓名，或搜索 MIS 号登录。</div>'
      + '</div></div></div>';

    // ── 搜索框 ──
    content += '<div style="margin-bottom:12px">'
      + '<input type="text" id="loginSearchInput" placeholder="搜索姓名或 MIS 号..." oninput="_filterLoginMembers()" '
      + 'style="width:100%;box-sizing:border-box;height:38px;border:1px solid #d9d9d9;border-radius:10px;padding:0 12px;font-size:13px;outline:none;transition:border-color 0.2s" '
      + 'onfocus="this.style.borderColor=\'#1664FF\'" onblur="this.style.borderColor=\'#d9d9d9\'">'
      + '</div>';

    // ── 成员列表 ──
    content += '<div id="loginMemberList" style="max-height:240px;overflow-y:auto;border:1px solid var(--border-light);border-radius:10px;background:#fff">';
    content += _buildLoginMemberList('');
    content += '</div>';

    // ── 当前选中提示 ──
    content += '<div id="loginSelectedTip" style="margin-top:8px;font-size:12px;color:var(--text-tertiary);text-align:center">请选择您的身份</div>';
  }

  // 权限说明
  content += '<div style="background:var(--bg);border-radius:10px;padding:12px 14px;font-size:12px;color:var(--text-tertiary);line-height:1.8;margin-top:12px">'
    + '<div style="font-weight:600;color:var(--text-secondary);margin-bottom:4px">权限说明</div>'
    + '<div>· <b style="color:#7B2FBE">管理员</b>：最高权限，wb_aijunlei 永久拥有，可在权限管理中分配</div>'
    + '<div>· <b style="color:#1664FF">小组长</b>：管理所辖团队的排班、审批与数据</div>'
    + '<div>· <b style="color:#86909C">审核员</b>：查看本人排班、提交调班申请（默认角色）</div>'
    + '</div>';

  var footer = '<button class="btn btn-default" onclick="closeModal()">取消</button>';
  if (ssoReady) {
    footer += '<button class="btn btn-primary" id="loginSubmitBtn" onclick="doLogin()">一键登录</button>';
  } else {
    footer += '<button class="btn btn-primary" id="loginSubmitBtn" onclick="doManualLogin()" disabled>确认登录</button>';
  }

  openModal('登录工时管理系统', content, footer);
}

// ============================================================
// V4.2: 选人登录 — 辅助函数
// ============================================================
function _buildLoginMemberList(keyword) {
  var kw = (keyword || '').toLowerCase().trim();
  var members = MEMBERS_DATA.filter(function(m) {
    if (!kw) return true;
    return (m.name && m.name.toLowerCase().indexOf(kw) >= 0)
      || (m.mis && m.mis.toLowerCase().indexOf(kw) >= 0)
      || (m.team && m.team.toLowerCase().indexOf(kw) >= 0);
  });
  if (members.length === 0) {
    return '<div style="padding:24px;text-align:center;color:var(--text-tertiary);font-size:13px">未找到匹配的成员</div>';
  }
  var html = '';
  members.forEach(function(m) {
    var avatarSrc = m.avatar || _uiAvatar(m.name, 36);
    var rp = ROLE_PERMISSIONS[m.role || 'reviewer'] || ROLE_PERMISSIONS.reviewer;
    var isSelected = _selectedLoginMember && _selectedLoginMember.mis === m.mis;
    html += '<div class="login-member-item' + (isSelected ? ' selected' : '') + '" '
      + 'onclick="_selectLoginMember(\'' + m.mis + '\')" '
      + 'style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;border-bottom:1px solid #f5f5f5;transition:background 0.15s'
      + (isSelected ? ';background:#EBF5FF' : '') + '" '
      + 'onmouseover="if(!this.classList.contains(\'selected\'))this.style.background=\'#fafafa\'" '
      + 'onmouseout="if(!this.classList.contains(\'selected\'))this.style.background=\'#fff\'" '
      + 'data-mis="' + m.mis + '">'
      + '<img src="' + avatarSrc + '" style="width:36px;height:36px;border-radius:10px;object-fit:cover;flex-shrink:0" onerror="this.src=\'' + _uiAvatar(m.name, 36) + '\'">'
      + '<div style="flex:1;min-width:0">'
      + '<div style="font-size:13px;font-weight:600;color:#1d2129">' + m.name + '</div>'
      + '<div style="font-size:11px;color:#86909c">' + m.mis + (m.team ? ' · ' + m.team : '') + '</div>'
      + '</div>'
      + '<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:' + rp.badgeBg + ';color:' + rp.badgeColor + ';font-weight:500">' + rp.label + '</span>'
      + (isSelected ? '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 8L6.5 11.5L13 4.5" stroke="#1664FF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '')
      + '</div>';
  });
  return html;
}

function _selectLoginMember(mis) {
  var m = MEMBERS_DATA.find(function(item) { return item.mis === mis; });
  if (!m) return;
  _selectedLoginMember = m;
  // 更新列表高亮
  var listEl = document.getElementById('loginMemberList');
  if (listEl) listEl.innerHTML = _buildLoginMemberList(
    (document.getElementById('loginSearchInput') || {}).value || ''
  );
  // 更新选中提示
  var tipEl = document.getElementById('loginSelectedTip');
  if (tipEl) {
    tipEl.innerHTML = '<span style="color:#1664FF;font-weight:600">已选择：' + m.name + '</span>（' + m.mis + '）';
  }
  // 启用登录按钮
  var btn = document.getElementById('loginSubmitBtn');
  if (btn) btn.disabled = false;
}

function _filterLoginMembers() {
  var input = document.getElementById('loginSearchInput');
  var kw = input ? input.value : '';
  var listEl = document.getElementById('loginMemberList');
  if (listEl) listEl.innerHTML = _buildLoginMemberList(kw);
}

// V4.2: 选人登录 — POST 到服务端设 cookie
function doManualLogin() {
  if (!_selectedLoginMember) {
    showToast('请先从列表中选择您的身份', 'warning');
    return;
  }
  var btn = document.getElementById('loginSubmitBtn');
  if (btn) { btn.disabled = true; btn.textContent = '登录中...'; }

  var mis = _selectedLoginMember.mis;
  var name = _selectedLoginMember.name;

  // POST 到服务端设置 cookie
  try {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/auth/login', false); // 同步
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(JSON.stringify({ mis: mis, name: name }));
    if (xhr.status === 200) {
      var resp = JSON.parse(xhr.responseText);
      if (resp.ok) {
        // 清除 SSO 缓存（下次 _getSsoUserInfo 会重新读 cookie）
        _ssoInfoCache = null;
        // 完成前端登录流程
        _completeLogin(_selectedLoginMember, mis, null);
        _selectedLoginMember = null;
        return;
      }
    }
    showToast('登录请求失败，请重试', 'error');
  } catch (e) {
    console.error('[auth] 登录请求失败:', e);
    showToast('网络错误，请检查服务器连接', 'error');
  }
  if (btn) { btn.disabled = false; btn.textContent = '确认登录'; }
}

// ============================================================
// 执行 SSO 登录（V4.2: 同时 POST 设 cookie）
// ============================================================
function doLogin() {
  var btn = document.getElementById('loginSubmitBtn');
  if (btn) { btn.disabled = true; btn.textContent = '登录中...'; }

  var sso = _getSsoUserInfo();
  if (!sso.ok || !sso.mis) {
    showToast('SSO 信息不可用，请在 URL 中添加 ?dev_mis=xxx&dev_name=xxx 参数后刷新页面', 'error');
    if (btn) { btn.disabled = false; btn.textContent = '一键登录'; }
    return;
  }

  var mis = sso.mis;
  var member = MEMBERS_DATA.find(function(m) { return m.mis === mis; });
  var isPermanentOwner = mis === AUTH_PERMANENT_OWNER;

  // r134: 角色由数据决定，不再从用户选择读取
  var role;
  if (isPermanentOwner) {
    role = 'admin';
  } else if (member) {
    role = member.role || 'reviewer';
  } else {
    role = 'reviewer';
  }

  // V4.2: 同步 POST 设 cookie（确保刷新后身份不丢失）
  try {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/auth/login', false);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(JSON.stringify({ mis: mis, name: sso.name || mis }));
  } catch (e) {
    console.warn('[auth] 设置 cookie 失败（不影响本次登录）:', e);
  }

  if (member) {
    // 已有成员：直接登录
    _completeLogin(member, mis, role);
  } else if (isPermanentOwner) {
    // 管理员不在列表中也可以登录
    var ownerMember = { id: 0, name: sso.name || mis, mis: mis, role: 'admin', avatar: '', team: '管理层', managedTeams: [], excludeFromSchedule: true };
    _completeLogin(ownerMember, mis, 'admin');
  } else {
    // 新用户：自动创建为审核员
    var newMember = {
      id: Date.now(),
      name: sso.name || mis,
      mis: mis,
      daxiangId: '',
      team: '',
      role: 'reviewer',
      avatar: '',
      efficiency: 0,
      quality: 0,
      managedTeams: [],
      excludeFromSchedule: false,
    };
    // 添加到运行时数据（不持久化到 members.js 文件）
    MEMBERS_DATA.push(newMember);
    _completeLogin(newMember, mis, 'reviewer');
  }
}

function _completeLogin(member, mis, role) {
  if (!role) role = mis === AUTH_PERMANENT_OWNER ? 'admin' : (member.role || 'reviewer');
  CURRENT_USER.id = member.id; CURRENT_USER.name = member.name; CURRENT_USER.mis = member.mis || mis;
  CURRENT_USER.role = role; CURRENT_USER.avatar = member.avatar || ''; CURRENT_USER.team = member.team || '';
  CURRENT_USER.managedTeams = member.managedTeams || [];
  CURRENT_USER.loggedIn = true;
  _saveSession({ id: member.id, mis: member.mis || mis, name: member.name, role: role, loginAt: Date.now(), loginMethod: 'catdesk-sso' });
  closeModal(); _updateAuthUI();
  var rp = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.reviewer;
  showToast('欢迎回来，' + member.name + '！当前身份：' + rp.label, 'success');
  _pushNotify({ type: 'login', title: '登录成功', body: '您已通过大象 SSO 以「' + rp.label + '」身份登录工时管理系统', icon: 'check', color: '#e8ffea' });
  WORK_LOGS.unshift({ id: Date.now(), time: new Date().toLocaleString('zh-CN'), module: '系统管理', action: '用户登录', operator: member.name, operatorMis: member.mis || mis, target: member.name + '（' + (member.mis || mis) + '）通过大象 SSO 登录，身份：' + rp.label, remark: '' });
  saveWorkLogs();
}

// ============================================================
// 退出登录（V4.2: 同时清除服务端 cookie）
// ============================================================
function doLogout() {
  var name = CURRENT_USER.name;
  // V4.2: POST 到服务端清除 cookie
  try {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/auth/logout', false);
    xhr.send();
  } catch (e) {
    console.warn('[auth] 清除服务端 cookie 失败:', e);
  }
  // 清除 SSO 缓存
  _ssoInfoCache = null;
  _clearSession();
  CURRENT_USER.id = 0; CURRENT_USER.name = '游客'; CURRENT_USER.mis = '';
  CURRENT_USER.role = 'reviewer'; CURRENT_USER.avatar = ''; CURRENT_USER.team = '';
  CURRENT_USER.loggedIn = false;
  closeAllDrawers(); _updateAuthUI(); showToast(name + ' 已退出登录', 'info');
}

// ============================================================
// 右侧抽屉系统
// ============================================================
var _activeDrawer    = null;
var _activeDrawerTab = 'account';

function toggleUserDrawer()  { if (_activeDrawer === 'user')   { closeAllDrawers(); } else { openUserDrawer(); } }
// toggleNotifyDrawer 现在直接打开用户抽屉的通知 tab（保留函数名兼容）
function toggleNotifyDrawer() { if (_activeDrawer === 'user' && _activeDrawerTab === 'notify') { closeAllDrawers(); } else { openUserDrawer('notify'); } }

function openUserDrawer(tab) {
  closeAllDrawers(true);
  var drawer  = document.getElementById('userDrawer');
  var overlay = document.getElementById('drawerOverlay');
  if (!drawer || !overlay) return;
  if (!CURRENT_USER.loggedIn) { showLoginModal(); return; }
  if (tab) { _activeDrawerTab = tab; }
  drawer.style.display = 'flex';
  overlay.style.display = 'block';
  _activeDrawer = 'user';
  _renderDrawerTab(_activeDrawerTab);
  // 同步 tab 高亮
  var tabs = document.querySelectorAll('#drawerTabs .ud-tab');
  tabs.forEach(function(t) {
    var isActive = t.getAttribute('data-tab') === _activeDrawerTab;
    t.classList.toggle('active', isActive);
    t.setAttribute('aria-selected', isActive ? 'true' : 'false');
    t.setAttribute('tabindex', isActive ? '0' : '-1');
  });
  requestAnimationFrame(function() {
    overlay.classList.add('visible');
    drawer.style.transform = 'translateX(0)';
    drawer.style.transition = 'transform 0.25s cubic-bezier(0.4,0,0.2,1)';
  });
}

function closeAllDrawers(silent) {
  var userDrawer = document.getElementById('userDrawer');
  var overlay    = document.getElementById('drawerOverlay');
  var active = userDrawer && userDrawer.style.display === 'flex' ? userDrawer : null;
  if (overlay) {
    overlay.classList.remove('visible');
    if (!silent) { setTimeout(function() { overlay.style.display = 'none'; }, 230); }
    else { overlay.style.display = 'none'; }
  }
  if (active && !silent) {
    active.style.transition = 'transform 0.22s cubic-bezier(0.32, 0.72, 0, 1)';
    active.style.transform = 'translateX(100%)';
    setTimeout(function() {
      active.style.display = 'none';
      active.style.transform = '';
      active.style.transition = '';
    }, 230);
  } else {
    if (userDrawer) userDrawer.style.display = 'none';
  }
  _activeDrawer = null;
}

function switchDrawerTab(tab, btn) {
  _activeDrawerTab = tab;
  var tabs = document.querySelectorAll('#drawerTabs .ud-tab');
  tabs.forEach(function(t) {
    var isActive = t.getAttribute('data-tab') === tab;
    t.classList.toggle('active', isActive);
    t.setAttribute('aria-selected', isActive ? 'true' : 'false');
    t.setAttribute('tabindex', isActive ? '0' : '-1');
  });
  if (btn) btn.focus();
  _renderDrawerTab(tab);
}
// 键盘导航：左右方向键切换 Tab，ESC 关闭抽屉
(function() {
  document.addEventListener('keydown', function(e) {
    if (_activeDrawer === 'user') {
      if (e.key === 'Escape') { closeAllDrawers(); return; }
      var tabOrder = ['account','notify','settings'];
      var idx = tabOrder.indexOf(_activeDrawerTab);
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        idx = e.key === 'ArrowRight' ? (idx + 1) % tabOrder.length : (idx - 1 + tabOrder.length) % tabOrder.length;
        var nextTab = tabOrder[idx];
        var btn = document.querySelector('#drawerTabs .ud-tab[data-tab="' + nextTab + '"]');
        if (btn) switchDrawerTab(nextTab, btn);
      }
    }
  });
  // 用户区域也支持回车/空格打开
  document.addEventListener('keydown', function(e) {
    if (e.target.id === 'navUserArea' && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault(); toggleUserDrawer();
    }
  });
})();

function _renderDrawerTab(tab) {
  var content = document.getElementById('drawerContent');
  if (!content) return;
  switch(tab) {
    case 'account':  content.innerHTML = _buildAccountTab();  break;
    case 'notify':   content.innerHTML = _buildNotifyTab();   break;
    case 'settings': content.innerHTML = _buildSettingsTab(); break;
    default:         content.innerHTML = _buildAccountTab();
  }
}

// ============================================================
// HTML 模板辅助函数
// ============================================================
function _htmlEmpty(icon, title, sub) {
  return '<div class="ud-empty">'
    + '<div class="ud-empty-icon">' + icon + '</div>'
    + '<div class="ud-empty-text">' + title + '</div>'
    + (sub ? '<div class="ud-empty-sub">' + sub + '</div>' : '')
    + '</div>';
}
function _htmlInfoRow(label, value) {
  return '<div class="ud-info-row"><span class="ud-info-label">' + label + '</span><span class="ud-info-value">' + value + '</span></div>';
}
function _htmlStatCard(items, cols) {
  var c = cols || items.length;
  var html = '<div class="ud-stat-grid" style="grid-template-columns:repeat(' + c + ',1fr)">';
  items.forEach(function(item) {
    html += '<div class="ud-stat-item"><div class="ud-stat-num" style="color:' + (item.color || 'var(--primary)') + '">' + item.value + '</div><div class="ud-stat-label">' + item.label + '</div></div>';
  });
  return html + '</div>';
}
function _htmlStatusBar(type, text) {
  return '<div class="ud-status-bar ud-status-bar-' + type + '">' + text + '</div>';
}
function _htmlSection(title, content, style) {
  return '<div class="ud-section"' + (style ? ' style="' + style + '"' : '') + '>'
    + (title ? '<div class="ud-section-title">' + title + '</div>' : '')
    + content + '</div>';
}
function _svgIcon(paths, size) {
  var s = size || 14;
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' + paths + '</svg>';
}

// ---- 概览 Tab（原账号信息） ----
function _buildAccountTab() {
  var user = CURRENT_USER;
  var isLoggedIn = !!user.loggedIn;
  var rp = ROLE_PERMISSIONS[user.role] || ROLE_PERMISSIONS.reviewer;
  if (!isLoggedIn) {
    return '<div class="ud-empty">'
      + '<div class="ud-empty-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#c9cdd4" stroke-width="1.5"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>'
      + '<div class="ud-empty-text">请登录以查看账号信息</div>'
      + '<button onclick="closeAllDrawers();showLoginModal()" style="padding:9px 28px;background:var(--primary);color:#fff;border:none;border-radius:var(--radius-md);font-size:13px;cursor:pointer;font-weight:500;box-shadow:0 2px 8px rgba(20,86,240,0.3);font-family:inherit;margin-top:8px">大象 SSO 一键登录</button>'
      + '</div>';
  }
  // 获取成员数据用于人效/质量
  var member = MEMBERS_DATA.find(function(m) { return m.mis === user.mis; });
  var efficiency = (member && member.efficiency) || 0;
  var quality = (member && member.quality) || 0;
  var sessionRemain = _getSessionRemain();

  var html = '';

  // ─── 数据看板卡片 ───
  html += '<div class="ud-section">'
    + '<div class="ud-section-title">数据看板</div>'
    + '<div class="ud-card">'
    + '<div style="display:flex;align-items:center;gap:16px">';
  // 人效环形图
  html += '<div style="text-align:center;flex-shrink:0"><svg width="70" height="70" viewBox="0 0 70 70">';
  var effPct = efficiency > 0 ? Math.min(efficiency / 400 * 100, 100) : 0;
  var r1 = 28, c1 = 2 * Math.PI * r1, off1 = c1 * (1 - effPct / 100);
  var effColor = efficiency >= 300 ? '#00B42A' : (efficiency >= 200 ? '#FF7D00' : '#F53F3F');
  html += '<circle cx="35" cy="35" r="' + r1 + '" fill="none" stroke="#f0f0f0" stroke-width="6"/>'
    + '<circle cx="35" cy="35" r="' + r1 + '" fill="none" stroke="' + effColor + '" stroke-width="6" stroke-linecap="round" stroke-dasharray="' + c1 + '" stroke-dashoffset="' + off1 + '" transform="rotate(-90 35 35)" style="transition:stroke-dashoffset 0.6s ease"/>'
    + '<text x="35" y="33" text-anchor="middle" font-size="14" font-weight="700" fill="' + effColor + '">' + (efficiency || '—') + '</text>'
    + '<text x="35" y="45" text-anchor="middle" font-size="9" fill="#86909c">人效</text>'
    + '</svg></div>';
  // 质量环形图
  html += '<div style="text-align:center;flex-shrink:0"><svg width="70" height="70" viewBox="0 0 70 70">';
  var qPct = quality > 0 ? quality : 0;
  var off2 = c1 * (1 - qPct / 100);
  var qColor = quality >= 98 ? '#00B42A' : (quality >= 95 ? '#FF7D00' : '#F53F3F');
  html += '<circle cx="35" cy="35" r="' + r1 + '" fill="none" stroke="#f0f0f0" stroke-width="6"/>'
    + '<circle cx="35" cy="35" r="' + r1 + '" fill="none" stroke="' + qColor + '" stroke-width="6" stroke-linecap="round" stroke-dasharray="' + c1 + '" stroke-dashoffset="' + off2 + '" transform="rotate(-90 35 35)" style="transition:stroke-dashoffset 0.6s ease"/>'
    + '<text x="35" y="33" text-anchor="middle" font-size="13" font-weight="700" fill="' + qColor + '">' + (quality ? quality + '%' : '—') + '</text>'
    + '<text x="35" y="45" text-anchor="middle" font-size="9" fill="#86909c">质量</text>'
    + '</svg></div>';
  // 统计数字
  var otCount = (typeof OVERTIME_RECORDS !== 'undefined') ? OVERTIME_RECORDS.filter(function(r) { return r.memberId === (member ? member.id : 0); }).length : 0;
  html += '<div style="flex:1;display:grid;grid-template-rows:1fr 1fr;gap:6px">'
    + '<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:#fff;border-radius:var(--radius-sm);border:1px solid var(--border-light)"><span style="font-size:20px;font-weight:700;color:var(--primary);letter-spacing:-0.5px">' + otCount + '</span><span style="font-size:11px;color:var(--text-tertiary)">工时记录</span></div>'
    + '<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:#fff;border-radius:var(--radius-sm);border:1px solid var(--border-light)"><span style="font-size:20px;font-weight:700;color:' + (sessionRemain === '已过期' ? 'var(--danger)' : '#00B42A') + ';letter-spacing:-0.5px">' + sessionRemain + '</span><span style="font-size:11px;color:var(--text-tertiary)">会话剩余</span></div>'
    + '</div>';
  html += '</div></div></div>';

  // ─── 账号信息卡片 ───
  html += '<div class="ud-section" style="padding-top:0">'
    + '<div class="ud-section-title">账号信息</div>'
    + '<div class="ud-card">';
  var infoRows = [
    ['姓名', user.name],
    ['MIS 号', user.mis],
    ['权限角色', '<span style="display:inline-flex;align-items:center;padding:2px 10px;border-radius:20px;font-size:12px;font-weight:600;background:' + rp.badgeBg + ';color:' + rp.badgeColor + '">' + rp.label + '</span>'],
    ['所属团队', user.team || '—'],
    ['登录方式', '<span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:500;color:var(--primary)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>大象 SSO</span>'],
  ];
  infoRows.forEach(function(r) {
    html += '<div class="ud-info-row"><span class="ud-info-label">' + r[0] + '</span><span class="ud-info-value">' + r[1] + '</span></div>';
  });
  html += '</div></div>';

  // ─── 账号安全区块 ───
  html += '<div class="ud-section" style="padding-top:0">'
    + '<div class="ud-section-title">账号安全</div>'
    + '<div class="ud-card">';
  // 系统账号（MIS）
  html += '<div class="ud-info-row"><span class="ud-info-label">系统账号</span><span class="ud-info-value" style="font-family:\'SF Mono\',Consolas,monospace;font-size:12px;letter-spacing:0.3px">' + (user.mis || '—') + '</span></div>';
  // SSO Token 状态
  var tokenStatus = '有效';
  var tokenColor = '#00B42A';
  try {
    var sess = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY));
    if (sess && sess.loginAt) {
      var remain = AUTH_SESSION_TTL - (Date.now() - sess.loginAt);
      if (remain <= 0) { tokenStatus = '已过期'; tokenColor = '#F53F3F'; }
    } else { tokenStatus = '未获取'; tokenColor = '#86909c'; }
  } catch(e) { tokenStatus = '未知'; tokenColor = '#86909c'; }
  html += '<div class="ud-info-row"><span class="ud-info-label">SSO 令牌</span><span class="ud-info-value"><span style="display:inline-flex;align-items:center;gap:4px"><span style="width:6px;height:6px;border-radius:50%;background:' + tokenColor + ';display:inline-block"></span><span style="font-size:12px;color:' + tokenColor + ';font-weight:500">' + tokenStatus + '</span></span></span></div>';
  // 登录 IP / 设备
  html += '<div class="ud-info-row"><span class="ud-info-label">登录设备</span><span class="ud-info-value" style="font-size:12px;color:var(--text-secondary)">当前浏览器</span></div>';
  // 操作按钮
  html += '<div style="display:flex;gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid var(--border-light)">'
    + '<button onclick="navigator.clipboard.writeText(\'' + (user.mis || '') + '\');showToast(\'账号已复制到剪贴板\',\'success\')" style="flex:1;padding:7px 0;background:var(--bg);border:1px solid var(--border-light);border-radius:var(--radius-sm);font-size:12px;color:var(--text-secondary);cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:4px;transition:all 0.15s"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>复制账号</button>'
    + '<button onclick="closeAllDrawers();showLoginModal()" style="flex:1;padding:7px 0;background:var(--bg);border:1px solid var(--border-light);border-radius:var(--radius-sm);font-size:12px;color:var(--primary);cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:4px;transition:all 0.15s"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>重新认证</button>'
    + '</div>';
  html += '</div></div>';

  // ─── 状态条 ───
  html += '<div class="ud-section" style="padding-top:0">';
  html += '<div class="ud-status-bar ud-status-bar-success"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>已通过大象 SSO 身份验证，登录状态正常</div>';
  if (user.mis === AUTH_PERMANENT_OWNER) {
    html += '<div class="ud-status-bar ud-status-bar-info" style="margin-top:6px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>系统永久管理员 — 拥有所有权限，不可撤销</div>';
  }
  html += '</div>';

  // ─── 快捷操作 ───
  html += '<div class="ud-section" style="padding-top:0">'
    + '<div class="ud-section-title">快捷操作</div>'
    + '<div class="ud-actions-grid">'
    + '<button class="ud-action-btn" onclick="closeAllDrawers();showProfilePage()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"><circle cx="12" cy="7" r="4"/><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/></svg>个人中心</button>'
    + '<button class="ud-action-btn" onclick="closeAllDrawers();showPage(\'settings\')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/></svg>系统设置</button>'
    + '<button class="ud-action-btn" onclick="closeAllDrawers();showPage(\'logs\')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>工作日志</button>'
    + '<button class="ud-action-btn ud-action-btn-danger" onclick="doLogout()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>退出登录</button>'
    + '</div></div>';

  return html;
}

function _getSessionRemain() {
  try {
    var s = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY));
    if (s && s.loginAt) {
      var remain = AUTH_SESSION_TTL - (Date.now() - s.loginAt);
      if (remain <= 0) return '已过期';
      var h = Math.floor(remain / 3600000); var m = Math.floor((remain % 3600000) / 60000);
      if (h > 0) return h + 'h' + m + 'm';
      return m + 'm';
    }
  } catch(e) {} return '—';
}

// ---- 通知 Tab ----
var _notifyFilter = 'all';
function _buildNotifyTab() {
  var notifs = _getNotifications();
  var unread = notifs.filter(function(n) { return !n.read; }).length;
  if (notifs.length === 0) {
    return '<div class="ud-empty">'
      + '<div class="ud-empty-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#c9cdd4" stroke-width="2"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg></div>'
      + '<div class="ud-empty-text">暂无系统通知</div>'
      + '<div class="ud-empty-sub">操作产生的通知将展示在这里</div>'
      + '</div>';
  }
  // 筛选
  var filtered = _notifyFilter === 'all' ? notifs : notifs.filter(function(n) { return n.type === _notifyFilter; });
  var html = '';
  // 筛选条
  html += '<div class="ud-filter-bar">'
    + '<button class="ud-filter-chip' + (_notifyFilter === 'all' ? ' active' : '') + '" onclick="_setNotifyFilter(\'all\')">全部 (' + notifs.length + ')</button>'
    + '<button class="ud-filter-chip' + (_notifyFilter === 'login' ? ' active' : '') + '" onclick="_setNotifyFilter(\'login\')">登录</button>'
    + '<button class="ud-filter-chip' + (_notifyFilter === 'approval' ? ' active' : '') + '" onclick="_setNotifyFilter(\'approval\')">审批</button>'
    + '<button class="ud-filter-chip' + (_notifyFilter === 'system' ? ' active' : '') + '" onclick="_setNotifyFilter(\'system\')">系统</button>'
    + (unread > 0 ? '<span style="margin-left:auto;font-size:11px;color:var(--text-tertiary)">' + unread + ' 条未读</span>' : '')
    + '</div>';
  // 通知列表
  html += '<div class="ud-section">';
  if (filtered.length === 0) {
    html += '<div class="ud-empty" style="padding:32px 20px"><div class="ud-empty-text">当前分类暂无通知</div></div>';
  } else {
    filtered.forEach(function(n) {
      html += '<div class="ud-card" onclick="_markNotifyRead(\'' + n.id + '\')" style="cursor:pointer;padding:12px 14px' + (!n.read ? ';background:rgba(20,86,240,0.03);border-color:rgba(20,86,240,0.1)' : '') + '">'
        + '<div style="display:flex;align-items:flex-start;gap:10px">'
        + '<div style="width:32px;height:32px;border-radius:var(--radius-md);background:' + (n.color || '#e8f3ff') + ';display:flex;align-items:center;justify-content:center;flex-shrink:0">' + _notifyIcon(n.icon) + '</div>'
        + '<div style="flex:1;min-width:0">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px">'
        + '<span style="font-size:13px;font-weight:' + (n.read ? '400' : '600') + ';color:var(--text-primary)">' + n.title + '</span>';
      if (!n.read) html += '<span style="width:6px;height:6px;border-radius:50%;background:var(--primary);flex-shrink:0"></span>';
      html += '</div>'
        + '<div style="font-size:12px;color:var(--text-tertiary);line-height:1.5">' + n.body + '</div>'
        + '<div style="font-size:11px;color:var(--text-quaternary);margin-top:4px">' + _relativeTime(n.time) + '</div>'
        + '</div></div></div>';
    });
  }
  html += '</div>';
  // 底部操作
  html += '<div style="padding:8px 20px 16px;display:flex;gap:8px">'
    + '<button class="ud-action-btn" style="flex:1;justify-content:center" onclick="markAllNotifyRead()"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 11 3 3L22 4"/></svg>全部已读</button>'
    + '<button class="ud-action-btn ud-action-btn-danger" style="flex:1;justify-content:center" onclick="clearAllNotify()"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>清空</button>'
    + '</div>';
  return html;
}

function _setNotifyFilter(type) {
  _notifyFilter = type;
  _renderDrawerTab('notify');
}

function _relativeTime(timeStr) {
  if (!timeStr) return '';
  try {
    var d = new Date(timeStr);
    if (isNaN(d.getTime())) return timeStr;
    var diff = Date.now() - d.getTime();
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
    if (diff < 604800000) return Math.floor(diff / 86400000) + ' 天前';
    return timeStr;
  } catch(e) { return timeStr; }
}

// ---- 审批 Tab ----
function _buildApprovalTab() {
  var allRecords = (typeof OVERTIME_RECORDS !== 'undefined') ? OVERTIME_RECORDS : [];
  var pending = allRecords.filter(function(r) { return r.status === 'pending'; });
  var approved = allRecords.filter(function(r) { return r.status === 'approved'; }).length;
  var rejected = allRecords.filter(function(r) { return r.status === 'rejected'; }).length;

  // 审批统计卡片
  var stats = _htmlStatCard([
    { value: pending.length, label: '待处理', color: '#ff7d00' },
    { value: approved, label: '已通过', color: '#00b42a' },
    { value: rejected, label: '已驳回', color: '#f53f3f' },
    { value: allRecords.length, label: '总计', color: 'var(--primary)' }
  ], 4);
  var html = _htmlSection('审批概览', '<div class="ud-card" style="padding:14px 16px">' + stats + '</div>');

  if (pending.length === 0) {
    var shieldIcon = _svgIcon('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>', 24);
    return html + _htmlEmpty(shieldIcon, '暂无待审批事项', '所有审批均已处理完成');
  }

  // 待审批列表
  var listHtml = '';
  pending.slice(0, 5).forEach(function(r) {
    var memberName = '未知';
    if (typeof MEMBERS_DATA !== 'undefined') {
      var m = MEMBERS_DATA.find(function(m) { return m.id === r.memberId; });
      if (m) memberName = m.name;
    }
    var typeLabel = '工时';
    if (r.type === 'overtime') {
      var ot = (typeof OT_TYPES !== 'undefined') ? OT_TYPES.find(function(t) { return t.id === r.otType; }) : null;
      typeLabel = ot ? ot.name : '加班';
    } else {
      var inj = (typeof INJURY_TYPES !== 'undefined') ? INJURY_TYPES.find(function(t) { return t.id === r.injuryType; }) : null;
      typeLabel = inj ? inj.name : '工损';
    }
    listHtml += '<div class="ud-card" style="padding:12px 14px;cursor:pointer" onclick="closeAllDrawers();showPage(\'approval\')">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">'
      + '<span style="font-size:13px;font-weight:600;color:var(--text-primary)">' + memberName + '</span>'
      + '<span style="font-size:11px;color:var(--text-quaternary)">' + _relativeTime(r.date) + '</span>'
      + '</div>'
      + '<div style="display:flex;align-items:center;gap:8px">'
      + '<span style="font-size:11px;padding:2px 8px;border-radius:var(--radius-sm);background:rgba(255,125,0,0.08);color:#ff7d00;font-weight:500">' + typeLabel + '</span>'
      + '<span style="font-size:12px;color:var(--text-tertiary)">' + r.duration + 'h · ' + (r.queueName || '—') + '</span>'
      + '</div></div>';
  });
  if (pending.length > 5) {
    listHtml += '<div style="text-align:center;padding:8px"><span style="font-size:12px;color:var(--primary);cursor:pointer" onclick="closeAllDrawers();showPage(\'approval\')">查看全部 ' + pending.length + ' 条 →</span></div>';
  }
  html += _htmlSection('待处理审批', listHtml);

  // 快捷操作
  html += '<div style="padding:4px 20px 16px">'
    + '<button class="ud-action-btn" style="width:100%;justify-content:center;background:rgba(255,125,0,0.06);color:#ff7d00;border-color:rgba(255,125,0,0.15)" onclick="closeAllDrawers();showPage(\'approval\')">'
    + _svgIcon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>') + '进入审批管理'
    + '</button></div>';
  return html;
}

// ---- 设置 Tab ----
function _buildSettingsTab() {
  var user = CURRENT_USER;
  var rp = ROLE_PERMISSIONS[user.role] || ROLE_PERMISSIONS.reviewer;
  var html = '';
  var chevron = _svgIcon('<path d="m9 18 6-6-6-6"/>');

  // ─── 快捷导航 ───
  var navItems = [
    { onclick: "closeAllDrawers();showPage('settings')", icon: _svgIcon('<circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>', 16), title: '系统设置', sub: '权限管理、数据配置' },
    { onclick: "closeAllDrawers();showPage('members')", icon: _svgIcon('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>', 16), title: '人员管理', sub: '成员列表、角色分配' },
    { onclick: "closeAllDrawers();showPage('logs')", icon: _svgIcon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>', 16), title: '工作日志', sub: '操作记录、审计日志' },
  ];
  var navHtml = '';
  navItems.forEach(function(item) {
    navHtml += '<div class="ud-setting-item" onclick="' + item.onclick + '">'
      + '<div style="width:34px;height:34px;border-radius:var(--radius-md);background:var(--bg);display:flex;align-items:center;justify-content:center;flex-shrink:0">' + item.icon + '</div>'
      + '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:500;color:var(--text-primary)">' + item.title + '</div>'
      + '<div style="font-size:11px;color:var(--text-tertiary)">' + item.sub + '</div></div>'
      + chevron + '</div>';
  });
  html += _htmlSection('快捷导航', navHtml);

  // ─── 数据管理 ───
  var dataHtml = '<div class="ud-setting-item" onclick="_exportAllData()">'
    + '<div style="width:34px;height:34px;border-radius:var(--radius-md);background:rgba(20,86,240,0.06);display:flex;align-items:center;justify-content:center;flex-shrink:0">' + _svgIcon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>', 16) + '</div>'
    + '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:500;color:var(--text-primary)">导出数据</div>'
    + '<div style="font-size:11px;color:var(--text-tertiary)">将排班、审批等数据导出为 JSON</div></div>'
    + chevron + '</div>';
  dataHtml += '<div class="ud-setting-item" onclick="_clearCacheData()">'
    + '<div style="width:34px;height:34px;border-radius:var(--radius-md);background:rgba(245,63,63,0.06);display:flex;align-items:center;justify-content:center;flex-shrink:0">' + _svgIcon('<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>', 16) + '</div>'
    + '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:500;color:var(--text-primary)">清理缓存</div>'
    + '<div style="font-size:11px;color:var(--text-tertiary)">清除临时缓存，保留核心数据</div></div>'
    + chevron + '</div>';
  html += _htmlSection('数据管理', dataHtml);

  // ─── 系统信息 ───
  var version = (typeof GLXT_VERSION !== 'undefined') ? GLXT_VERSION : '未知';
  var storageUsed = _calcStorageUsage();
  var roleBadge = '<span style="padding:1px 8px;border-radius:var(--radius-sm);font-size:11px;font-weight:600;background:' + rp.badgeBg + ';color:' + rp.badgeColor + '">' + rp.label + '</span>';
  var infoHtml = '<div class="ud-card" style="padding:12px 14px">'
    + _htmlInfoRow('系统版本', '<span style="font-family:monospace;font-size:12px">' + version + '</span>')
    + _htmlInfoRow('当前角色', roleBadge)
    + _htmlInfoRow('本地存储', storageUsed)
    + _htmlInfoRow('运行环境', '浏览器本地')
    + '</div>';
  html += _htmlSection('系统信息', infoHtml);

  // ─── 账号操作 ───
  var logoutIcon = _svgIcon('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>');
  html += _htmlSection('账号操作',
    '<button class="ud-action-btn ud-action-btn-danger" style="width:100%;justify-content:center" onclick="closeAllDrawers();doLogout()">'
    + logoutIcon + '退出登录</button>');
  return html;
}

// ---- 数据导出 ----
function _exportAllData() {
  try {
    var exportObj = {};
    var exportKeys = ['glxt_schedule_', 'glxt_overtime_', 'glxt_members', 'glxt_notify', 'glxt_auth'];
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      var match = exportKeys.some(function(ek) { return key.indexOf(ek) === 0 || key === ek; });
      if (match) { try { exportObj[key] = JSON.parse(localStorage.getItem(key)); } catch(e) { exportObj[key] = localStorage.getItem(key); } }
    }
    var blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'GLXT_backup_' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    showToast('数据导出成功', 'success');
    _pushNotify({ type: 'system', title: '数据导出', body: '已成功导出系统数据备份', icon: 'check', color: '#e8f9e8' });
  } catch(e) { showToast('导出失败：' + e.message, 'error'); }
}

// ---- 缓存清理 ----
function _clearCacheData() {
  if (!confirm('确认清理缓存？此操作将清除临时数据，核心数据（排班、人员、审批）不受影响。')) return;
  try {
    var protectedKeys = ['glxt_schedule_', 'glxt_overtime_', 'glxt_members', 'glxt_auth', 'glxt_notify'];
    var removed = 0;
    var keys = [];
    for (var i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    keys.forEach(function(key) {
      if (key.indexOf('glxt_') !== 0) return;
      var isProtected = protectedKeys.some(function(pk) { return key.indexOf(pk) === 0 || key === pk; });
      if (!isProtected) { localStorage.removeItem(key); removed++; }
    });
    showToast('已清理 ' + removed + ' 项缓存数据', 'success');
    if (_activeDrawer === 'user' && _activeDrawerTab === 'settings') _renderDrawerTab('settings');
  } catch(e) { showToast('清理失败：' + e.message, 'error'); }
}

function _calcStorageUsage() {
  try {
    var total = 0;
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      total += key.length + (localStorage.getItem(key) || '').length;
    }
    var kb = (total * 2 / 1024).toFixed(1);
    if (kb > 1024) return (kb / 1024).toFixed(2) + ' MB';
    return kb + ' KB';
  } catch(e) { return '未知'; }
}

// ---- 刷新登录状态 ----
function _refreshLoginStatus() {
  var user = CURRENT_USER;
  if (!user.loggedIn) return;
  var sso = _getSsoUserInfo();
  if (sso.ok && sso.mis === user.mis) {
    var session = _loadSession() || {}; session.loginAt = Date.now(); _saveSession(session);
    showToast('登录状态正常，会话已续期', 'success');
  } else if (sso.ok && sso.mis !== user.mis) {
    showToast('检测到大象账号已切换（' + sso.name + '），建议重新登录', 'warning');
  } else {
    showToast('SSO 信息暂不可用，本地会话仍有效', 'warning');
  }
  if (_activeDrawer === 'user' && _activeDrawerTab === 'account') { _renderDrawerTab('account'); }
}

// ============================================================
// 系统通知模块
// ============================================================
var _notifications = [];

function _initNotifySystem() {
  _notifications = [];
  try { var raw = localStorage.getItem(NOTIFY_STORAGE_KEY); if (raw) _notifications = JSON.parse(raw) || []; } catch(e) { _notifications = []; }
  _updateNotifyBadge();
}
function _saveNotifications() {
  try { if (_notifications.length > 50) _notifications = _notifications.slice(0, 50); localStorage.setItem(NOTIFY_STORAGE_KEY, JSON.stringify(_notifications)); } catch(e) {}
}
function _getNotifications() { return _notifications; }
function _pushNotify(opts) {
  var notif = { id: 'n_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), type: opts.type || 'system', title: opts.title || '系统通知', body: opts.body || '', icon: opts.icon || 'bell', color: opts.color || '#e8f3ff', read: false, time: new Date().toLocaleString('zh-CN') };
  _notifications.unshift(notif); _saveNotifications(); _updateNotifyBadge();
  if (_activeDrawer === 'user' && _activeDrawerTab === 'notify') { _renderDrawerTab('notify'); }
}
function _updateNotifyBadge() {
if (!_notifications) return;
  _updateDrawerNotifyBadge();
}
function _markNotifyRead(id) {
  var notif = _notifications.find(function(n) { return n.id === id; });
  if (notif && !notif.read) { notif.read = true; _saveNotifications(); _updateNotifyBadge(); if (_activeDrawer === 'user' && _activeDrawerTab === 'notify') _renderDrawerTab('notify'); }
}
function markAllNotifyRead() {
  _notifications.forEach(function(n) { n.read = true; }); _saveNotifications(); _updateNotifyBadge();
  if (_activeDrawer === 'user' && _activeDrawerTab === 'notify') _renderDrawerTab('notify');
}
function clearAllNotify() {
  _notifications = []; _saveNotifications(); _updateNotifyBadge();
  if (_activeDrawer === 'user' && _activeDrawerTab === 'notify') _renderDrawerTab('notify');
}
// _renderNotifyList 已废弃，通知统一在 userDrawer 的 notify tab 中渲染
function _notifyIcon(icon) {
  var icons = { check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00b42a" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg>', bell: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1664FF" stroke-width="2"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>', warn: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ff7d00" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>', error: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f53f3f" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>', info: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1664FF" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>' };
  return icons[icon] || icons.bell;
}

// ============================================================
// 个人中心
// ============================================================
var _profileMonth = (function() { var t = new Date(); return t.getFullYear() + '-' + String(t.getMonth()+1).padStart(2,'0'); })();

function showProfilePage() {
  closeAllDrawers();
  var user = CURRENT_USER;
  if (!user.loggedIn) { showLoginModal(); return; }
  var member = MEMBERS_DATA.find(function(m) { return m.mis === user.mis; });
  if (!member) return;
  var t = new Date(); _profileMonth = t.getFullYear() + '-' + String(t.getMonth()+1).padStart(2,'0');
  _openProfileModal(member);
}

function _openProfileModal(member) {
  var user = CURRENT_USER;
  var rp = ROLE_PERMISSIONS[user.role] || ROLE_PERMISSIONS.reviewer;
  var parts = _profileMonth.split('-'); var yearStr = parts[0], monthStr = parts[1];
  var attStats = typeof _getAttStats === 'function' ? _getAttStats(member.id, yearStr, monthStr) : (ATTENDANCE_STATS[member.id] || {});
  var otRecords = OVERTIME_RECORDS.filter(function(r) { return r.memberId === member.id; }).slice(0, 5);
  var avatarSrc = member.avatar || _uiAvatar(member.name, 72);
  var teamColor = typeof getTeamColor === 'function' ? getTeamColor(member.team) : 'var(--primary)';

  // 头部区域 — 深色渐变
  var content = '<div style="margin:-20px -24px 16px;padding:24px 24px 20px;background:linear-gradient(135deg,#0F1629 0%,#1a2744 50%,#1456F0 100%);border-radius:12px 12px 0 0;position:relative;overflow:hidden">'
    + '<div style="position:absolute;top:-30px;right:-30px;width:120px;height:120px;border-radius:50%;background:rgba(20,86,240,0.15)"></div>'
    + '<div style="position:absolute;bottom:-20px;left:30%;width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,0.03)"></div>'
    + '<div style="display:flex;align-items:center;gap:16px;position:relative;z-index:1">'
    + '<div style="position:relative;flex-shrink:0"><img src="' + avatarSrc + '" style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:3px solid rgba(255,255,255,0.2);box-shadow:0 4px 16px rgba(0,0,0,0.3)" onerror="this.src=\'' + _uiAvatar(member.name, 72) + '\'">'
    + '<div style="position:absolute;bottom:2px;right:2px;width:16px;height:16px;border-radius:50%;background:#52C41A;border:2px solid #1a2744"></div></div>'
    + '<div style="flex:1;min-width:0">'
    + '<div style="font-size:20px;font-weight:700;color:#fff;margin-bottom:2px">' + member.name + '</div>'
    + '<div style="font-size:12px;color:rgba(255,255,255,0.6)">' + member.mis + '</div>'
    + '<div style="margin-top:8px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">'
    + '<span style="padding:2px 10px;border-radius:10px;font-size:11px;font-weight:600;background:rgba(255,255,255,0.12);color:rgba(255,255,255,0.9);backdrop-filter:blur(4px)">' + rp.label + '</span>'
    + '<span style="padding:2px 8px;border-radius:10px;font-size:11px;background:' + teamColor + '22;color:' + teamColor + ';border:1px solid ' + teamColor + '33">' + member.team + '</span>'
    + (user.mis === AUTH_PERMANENT_OWNER ? '<span style="font-size:10px;color:#d8b4fe;background:rgba(139,92,246,0.15);padding:2px 8px;border-radius:8px">永久管理员</span>' : '')
    + '</div></div>'
    + '</div></div>';

  // 数据面板 — 人效 + 质量
  content += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">'
    + '<div style="background:var(--bg);border-radius:var(--radius-lg);padding:16px;text-align:center;border:1px solid var(--border-light)">'
    + '<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:6px">人效指数</div>'
    + '<div style="font-size:28px;font-weight:700;color:var(--primary);line-height:1">' + (member.efficiency || '—') + '</div></div>'
    + '<div style="background:var(--bg);border-radius:var(--radius-lg);padding:16px;text-align:center;border:1px solid var(--border-light)">'
    + '<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:6px">质量评分</div>'
    + '<div style="font-size:28px;font-weight:700;color:#00b42a;line-height:1">' + (member.quality || '—') + '<span style="font-size:14px;font-weight:400">%</span></div></div></div>';

  // 考勤卡片
  content += '<div style="background:var(--bg);border-radius:var(--radius-lg);padding:16px;margin-bottom:12px;border:1px solid var(--border-light)">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">'
    + '<div style="font-size:13px;font-weight:600;color:var(--text-primary)">考勤数据</div>'
    + '<input type="month" value="' + _profileMonth + '" style="height:28px;font-size:11px;border:1px solid var(--border-light);border-radius:var(--radius-md);padding:0 8px;background:#fff;color:var(--text-primary);cursor:pointer" onchange="_profileMonth=this.value;_refreshProfileAttStats(' + member.id + ')"></div>'
    + '<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:10px" id="profileAttMonthLabel">' + yearStr + '年' + parseInt(monthStr) + '月</div>'
    + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px" id="profileAttGrid">'
    + '<div style="text-align:center;padding:10px 4px;background:#fff;border-radius:var(--radius-md);border:1px solid var(--border-light)"><div style="font-size:22px;font-weight:700;color:var(--primary)">' + (attStats.workDays || 0) + '</div><div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">出勤天</div></div>'
    + '<div style="text-align:center;padding:10px 4px;background:#fff;border-radius:var(--radius-md);border:1px solid var(--border-light)"><div style="font-size:22px;font-weight:700;color:#FA8C16">' + (attStats.leaveDays || 0) + '</div><div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">请假天</div></div>'
    + '<div style="text-align:center;padding:10px 4px;background:#fff;border-radius:var(--radius-md);border:1px solid var(--border-light)"><div style="font-size:22px;font-weight:700;color:#389E0D">' + (attStats.triplePayDays || 0) + '</div><div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">三薪天</div></div>'
    + '</div></div>';

  // 权限详情卡片
  content += '<div style="background:var(--bg);border-radius:var(--radius-lg);padding:16px;margin-bottom:12px;border:1px solid var(--border-light)">'
    + '<div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:10px">权限详情</div>'
    + '<div style="margin-bottom:8px;display:flex;align-items:center;gap:8px">'
    + '<span style="padding:3px 12px;border-radius:10px;font-size:12px;font-weight:600;background:' + rp.badgeBg + ';color:' + rp.badgeColor + '">' + rp.label + '</span>'
    + (user.mis === AUTH_PERMANENT_OWNER ? '<span style="font-size:10px;color:#7B2FBE;background:#F3E8FF;padding:2px 8px;border-radius:8px;font-weight:500">永久管理员</span>' : '')
    + '</div>'
    + '<div style="font-size:12px;color:var(--text-tertiary);margin-bottom:10px;line-height:1.5">' + rp.desc + '</div>'
    + '<div style="display:flex;flex-wrap:wrap;gap:6px">';
  rp.permissions.forEach(function(p) {
    content += '<span style="font-size:11px;padding:3px 8px;background:#fff;border-radius:var(--radius-sm);color:var(--text-secondary);border:1px solid var(--border-light)">' + p + '</span>';
  });
  content += '</div></div>';

  // 近期工时记录
  if (otRecords.length > 0) {
    content += '<div style="background:var(--bg);border-radius:var(--radius-lg);padding:16px;border:1px solid var(--border-light)">'
      + '<div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:10px">近期工时记录</div>'
      + '<div class="table-wrap"><table class="table" style="font-size:12px"><thead><tr><th>类型</th><th>日期</th><th>时长</th><th>队列</th><th>状态</th></tr></thead><tbody>';
    otRecords.forEach(function(r) {
      content += '<tr>';
      if (r.type === 'overtime') { var ot = OT_TYPES.find(function(t) { return t.id === r.otType; }); content += '<td><span class="ot-type-badge ot-type-' + r.otType + '">' + (ot ? ot.name : '加班') + '</span></td>'; }
      else { var inj = INJURY_TYPES.find(function(t) { return t.id === r.injuryType; }); content += '<td><span class="ot-type-badge injury-type-' + r.injuryType + '">' + (inj ? inj.name : '工损') + '</span></td>'; }
      content += '<td>' + r.date + '</td><td>' + r.duration + 'h</td><td style="max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + r.queueName + '</td>';
      var st = OT_STATUS[r.status] || {}; content += '<td><span class="tag ' + (st.color || '') + '">' + (st.label || r.status) + '</span></td></tr>';
    });
    content += '</tbody></table></div></div>';
  }

  openModal('个人中心', content,
    '<button class="btn btn-default" onclick="closeModal()">关闭</button>'
    + '<button class="btn btn-danger btn-sm" onclick="closeModal();doLogout()" style="margin-left:auto">'
    + '<svg width="12" height="12" viewBox="0 0 14 14" fill="none" style="margin-right:4px;vertical-align:-1px"><path d="M8.5 4.5L11 6.5L8.5 8.5M11 6.5H5M5 2H3C2.45 2 2 2.45 2 3V10C2 10.55 2.45 11 3 11H5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>退出登录</button>'
  );
}

function _refreshProfileAttStats(memberId) {
  var parts = _profileMonth.split('-'); var yearStr = parts[0], monthStr = parts[1];
  var s = typeof _getAttStats === 'function' ? _getAttStats(memberId, yearStr, monthStr) : (ATTENDANCE_STATS[memberId] || {});
  var label = document.getElementById('profileAttMonthLabel'); if (label) label.textContent = yearStr + '年' + parseInt(monthStr) + '月';
  var grid = document.getElementById('profileAttGrid'); if (!grid) return;
  grid.innerHTML = '<div style="text-align:center;padding:10px 4px;background:#fff;border-radius:var(--radius-md);border:1px solid var(--border-light)"><div style="font-size:22px;font-weight:700;color:var(--primary)">' + (s.workDays || 0) + '</div><div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">出勤天</div></div>'
    + '<div style="text-align:center;padding:10px 4px;background:#fff;border-radius:var(--radius-md);border:1px solid var(--border-light)"><div style="font-size:22px;font-weight:700;color:#FA8C16">' + (s.leaveDays || 0) + '</div><div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">请假天</div></div>'
    + '<div style="text-align:center;padding:10px 4px;background:#fff;border-radius:var(--radius-md);border:1px solid var(--border-light)"><div style="font-size:22px;font-weight:700;color:#389E0D">' + (s.triplePayDays || 0) + '</div><div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">三薪天</div></div>';
}
