// 工具函数库

// ===== 卡片右侧团队展示顺序（localStorage 持久化） =====
var _CARD_TEAM_ORDER_KEY = 'glxt_card_team_order';

function _loadCardTeamOrder() {
  try { return JSON.parse(localStorage.getItem(_CARD_TEAM_ORDER_KEY)) || []; } catch(e) { return []; }
}
function _saveCardTeamOrder(order) {
  localStorage.setItem(_CARD_TEAM_ORDER_KEY, JSON.stringify(order));
}
/** 根据自定义顺序重排团队数组，未在 order 中的追加到末尾 */
function _sortTeamsByOrder(teams) {
  var order = _loadCardTeamOrder();
  if (!order.length) return teams;
  var sorted = [];
  order.forEach(function(t) { if (teams.indexOf(t) !== -1) sorted.push(t); });
  teams.forEach(function(t) { if (sorted.indexOf(t) === -1) sorted.push(t); });
  return sorted;
}

/**
 * 初始化拖拽排序：将 wrapperId 容器内的 .sc5-drag-tag 绑定 drag 事件
 * 拖拽完成后保存顺序到 localStorage 并调用 onDone 回调
 */
function _initTeamDragSort(wrapperId, onDone) {
  var wrap = document.getElementById(wrapperId);
  if (!wrap) return;
  var dragSrc = null;

  wrap.querySelectorAll('.sc5-drag-tag').forEach(function(tag) {
    tag.addEventListener('dragstart', function(e) {
      dragSrc = this;
      this.style.opacity = '0.4';
      e.dataTransfer.effectAllowed = 'move';
    });
    tag.addEventListener('dragend', function() {
      this.style.opacity = '1';
      dragSrc = null;
      // 去掉所有 drag-over 指示
      wrap.querySelectorAll('.sc5-drag-tag').forEach(function(t) {
        t.style.boxShadow = '';
      });
    });
    tag.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (this !== dragSrc) {
        this.style.boxShadow = '-3px 0 0 0 #3370FF';
      }
    });
    tag.addEventListener('dragleave', function() {
      this.style.boxShadow = '';
    });
    tag.addEventListener('drop', function(e) {
      e.preventDefault();
      this.style.boxShadow = '';
      if (!dragSrc || dragSrc === this) return;
      // 在 DOM 中交换位置
      var allTags = Array.from(wrap.querySelectorAll('.sc5-drag-tag'));
      var fromIdx = allTags.indexOf(dragSrc);
      var toIdx = allTags.indexOf(this);
      if (fromIdx < toIdx) {
        wrap.insertBefore(dragSrc, this.nextSibling);
      } else {
        wrap.insertBefore(dragSrc, this);
      }
      // 保存新顺序
      var newOrder = Array.from(wrap.querySelectorAll('.sc5-drag-tag')).map(function(t) {
        return t.getAttribute('data-team');
      });
      _saveCardTeamOrder(newOrder);
      // 更新前4个高亮样式 + 序号
      wrap.querySelectorAll('.sc5-drag-tag').forEach(function(t, i) {
        if (i < 4) {
          t.style.background = '#3370FF';
          t.style.color = '#fff';
          t.style.borderColor = '#3370FF';
        } else {
          t.style.background = '#fff';
          t.style.color = '#1d2129';
          t.style.borderColor = '#C9CDD4';
        }
        // 更新序号
        var numSpan = t.querySelector('span');
        if (i < 4) {
          if (numSpan && numSpan.style.opacity === '0.7') {
            numSpan.textContent = (i + 1);
          } else {
            var s = document.createElement('span');
            s.style.cssText = 'font-size:10px;opacity:0.7;margin-right:3px';
            s.textContent = (i + 1);
            t.insertBefore(s, t.firstChild);
          }
        } else {
          if (numSpan && numSpan.style.opacity === '0.7') {
            numSpan.remove();
          }
        }
      });
      // 回调刷新卡片
      if (typeof onDone === 'function') onDone();
    });
  });
}

// 格式化日期
function formatDate(date, fmt = 'YYYY-MM-DD') {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return fmt.replace('YYYY', y).replace('MM', m).replace('DD', day).replace('HH', h).replace('mm', min);
}

// 获取星期
function getWeekDay(date) {
const days = ['日', '一', '二', '三', '四', '五', '六'];
const d = typeof date === 'string' ? new Date(date) : date;
return '星期' + days[d.getDay()];
}

// 计算时间差（小时）
function calcHourDiff(start, end) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return ((eh * 60 + em) - (sh * 60 + sm)) / 60;
}

// Toast通知
function showToast(msg, type = 'info', duration = 3000) {
  const container = document.getElementById('toastContainer');
  const icons = { success: '✅', warning: '⚠️', error: '❌', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(12px) scale(0.95)';
    toast.style.transition = 'opacity 0.22s ease, transform 0.22s ease';
    setTimeout(() => toast.remove(), 240);
  }, duration);
}

// 带操作按钮的 Toast（用于"是否跳转"等确认场景）
function showConfirmToast(msg, onConfirm, confirmText = '去查看', cancelText = '忽略') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast toast-confirm';
  toast.innerHTML = `
    <span class="toast-icon">📅</span>
    <span class="toast-confirm-msg">${msg}</span>
    <button class="toast-confirm-btn" onclick="this.closest('.toast-confirm')._onConfirm()">${confirmText}</button>
    <button class="toast-cancel-btn" onclick="this.closest('.toast-confirm')._onCancel()">${cancelText}</button>
  `;
  let timer = null;
  const remove = () => {
    clearTimeout(timer);
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(12px) scale(0.95)';
    toast.style.transition = 'opacity 0.22s ease, transform 0.22s ease';
    setTimeout(() => toast.remove(), 240);
  };
  toast._onConfirm = () => { remove(); onConfirm && onConfirm(); };
  toast._onCancel  = () => { remove(); };
  container.appendChild(toast);
  timer = setTimeout(remove, 8000); // 8s 后自动消失
}

// 打开弹窗
function openModal(title, content, footer = '', width = '') {
  const overlay = document.getElementById('modalOverlay');
  const container = document.getElementById('modalContainer');
  // 支持自定义宽度（如 '360px'），不传则由 CSS min-width 决定
  container.style.width = width || '';
  container.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">${title}</span>
        <button class="modal-close" onclick="closeModal()">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <div class="modal-body">${content}</div>
      ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
    </div>
  `;
  overlay.classList.add('show');
  container.classList.add('show');
}

// 弹窗关闭钩子数组，各模块可 push 回调，closeModal 时依次执行并清空
const _modalCloseHooks = [];
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('show');
  document.getElementById('modalContainer').classList.remove('show');
  _modalCloseHooks.splice(0).forEach(fn => { try { fn(); } catch(e) {} });
}

// 切换侧边栏
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('collapsed');
}

// 关闭搜索结果（点击外部）
document.addEventListener('click', (e) => {
  const searchResults = document.getElementById('searchResults');
  if (searchResults && !e.target.closest('.global-search')) {
    searchResults.classList.remove('show');
  }
});

// 全局搜索
function handleGlobalSearch(val) {
  const results = document.getElementById('searchResults');
  if (!val.trim()) { results.classList.remove('show'); return; }
  const items = [];
  MEMBERS_DATA.forEach(m => {
    if (m.name.includes(val) || m.mis.includes(val)) {
      items.push({ type: '人员', label: m.name, sub: m.mis, action: () => showPersonDetail(m.id) });
    }
  });
  QUEUES_DATA.forEach(q => {
    if (q.name.includes(val) || String(q.id).includes(val)) {
      items.push({ type: '队列', label: q.name, sub: `ID: ${q.id}`, action: () => showPage('queue-manage') });
    }
  });
  if (items.length === 0) {
    results.innerHTML = '<div class="search-result-item" style="color:var(--text-tertiary)">无匹配结果</div>';
  } else {
    results.innerHTML = items.slice(0, 8).map((item, i) => `
      <div class="search-result-item" onclick="searchResultClick(${i})">
        <span class="search-result-tag">${item.type}</span>
        <span>${item.label}</span>
        <span style="color:var(--text-tertiary);font-size:11px;margin-left:auto">${item.sub}</span>
      </div>
    `).join('');
    window._searchItems = items;
  }
  results.classList.add('show');
}

function searchResultClick(idx) {
  const item = window._searchItems[idx];
  if (item) { item.action(); document.getElementById('searchResults').classList.remove('show'); document.getElementById('globalSearch').value = ''; }
}

// 切换导航组折叠
function toggleNavGroup(el) {
  el.classList.toggle('collapsed');
}

// 生成SVG折线图
function renderLineChart(container, datasets, labels, height = 160) {
  const w = container.offsetWidth || 400;
  const h = height;
  const padL = 32, padR = 12, padT = 12, padB = 24;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;

  const allVals = datasets.flatMap(d => d.data);
  const minVal = Math.min(...allVals) * 0.9;
  const maxVal = Math.max(...allVals) * 1.05;

  const xStep = chartW / (labels.length - 1);
  const yScale = (v) => padT + chartH - ((v - minVal) / (maxVal - minVal)) * chartH;
  const xPos = (i) => padL + i * xStep;

  const colors = ['#1664FF', '#00B42A', '#FF7D00', '#F53F3F'];
  let svgContent = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;

  // 网格线
  for (let i = 0; i <= 4; i++) {
    const y = padT + (chartH / 4) * i;
    svgContent += `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="#F0F0F0" stroke-width="1"/>`;
    const val = Math.round(maxVal - (maxVal - minVal) * i / 4);
    svgContent += `<text x="${padL - 4}" y="${y + 4}" text-anchor="end" font-size="9" fill="#86909C">${val}</text>`;
  }

  // X轴标签
  labels.forEach((label, i) => {
    if (i % Math.ceil(labels.length / 7) === 0 || i === labels.length - 1) {
      svgContent += `<text x="${xPos(i)}" y="${h - 4}" text-anchor="middle" font-size="9" fill="#86909C">${label}</text>`;
    }
  });

  // 数据线
  datasets.forEach((ds, di) => {
    const color = ds.color || colors[di % colors.length];
    const points = ds.data.map((v, i) => `${xPos(i)},${yScale(v)}`).join(' ');
    // 面积
    const areaPoints = `${xPos(0)},${padT + chartH} ${points} ${xPos(ds.data.length - 1)},${padT + chartH}`;
    svgContent += `<polygon points="${areaPoints}" fill="${color}" opacity="0.08"/>`;
    // 线
    svgContent += `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    // 点
    ds.data.forEach((v, i) => {
      svgContent += `<circle cx="${xPos(i)}" cy="${yScale(v)}" r="3" fill="${color}" stroke="#fff" stroke-width="1.5"/>`;
    });
  });

  svgContent += '</svg>';
  container.innerHTML = svgContent;
}

// 生成柱状图
function renderBarChart(container, data, labels, colors = ['#1664FF']) {
  const w = container.offsetWidth || 400;
  const h = 140;
  const padL = 32, padR = 12, padT = 12, padB = 24;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;
  const maxVal = Math.max(...data.flat()) * 1.1;
  const barW = Math.min(chartW / data.length * 0.6, 32);
  const gap = chartW / data.length;

  let svgContent = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
  for (let i = 0; i <= 3; i++) {
    const y = padT + (chartH / 3) * i;
    svgContent += `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="#F0F0F0" stroke-width="1"/>`;
  }

  data.forEach((val, i) => {
    const vals = Array.isArray(val) ? val : [val];
    const x = padL + gap * i + gap / 2;
    vals.forEach((v, vi) => {
      const barH = (v / maxVal) * chartH;
      const bx = x - barW / 2 + vi * (barW / vals.length + 1);
      const bw = barW / vals.length - 1;
      svgContent += `<rect x="${bx}" y="${padT + chartH - barH}" width="${bw}" height="${barH}" rx="2" fill="${colors[vi % colors.length]}" opacity="0.85"/>`;
    });
    if (labels[i]) {
      const label = labels[i].length > 4 ? labels[i].slice(0, 4) : labels[i];
      svgContent += `<text x="${x}" y="${h - 4}" text-anchor="middle" font-size="9" fill="#86909C">${label}</text>`;
    }
  });

  svgContent += '</svg>';
  container.innerHTML = svgContent;
}

// 渲染质量环形图
function renderQualityGauge(container, value, color = '#1664FF') {
  const r = 40, cx = 50, cy = 50;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - value / 100);
  container.innerHTML = `
    <svg width="100" height="100" viewBox="0 0 100 100">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#F0F0F0" stroke-width="8"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="8"
        stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
        transform="rotate(-90 ${cx} ${cy})" style="transition:stroke-dashoffset 0.8s ease"/>
      <text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="14" font-weight="700" fill="${color}">${value}%</text>
    </svg>
  `;
}

// 防抖
function debounce(fn, delay = 300) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

// 数字格式化
function formatNum(n) {
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

// 添加工作日志
// detail:   可选，结构化明细对象，用于导入历史等场景展开查看
// snapshot: 可选，排班快照对象 { year, month, data }，用于撤销回滚
function addWorkLog(module, action, target, remark = '', detail = null, snapshot = null) {
  const operator    = (typeof CURRENT_USER !== 'undefined' && CURRENT_USER.name)    ? CURRENT_USER.name    : '艾俊磊';
  const operatorMis = (typeof CURRENT_USER !== 'undefined' && CURRENT_USER.mis)     ? CURRENT_USER.mis     : 'wb_aijunlei';
  const log = {
    id: Date.now(),
    module, action,
    operator,
    operatorMis,
    target, time: formatDate(new Date(), 'YYYY-MM-DD HH:mm'),
    remark,
    ...(detail   ? { detail }   : {}),
    ...(snapshot ? { snapshot } : {}),
  };
  WORK_LOGS.unshift(log);
  // 日志只保留最近500条，避免 localStorage 撑爆
  if (WORK_LOGS.length > 500) WORK_LOGS.length = 500;
  saveWorkLogs();
}

// 渲染成员头像（支持真实 URL 和 fallback 文字头像）
// size 参数可以是 CSS 尺寸字符串（如 '32px'）或完整 style 字符串（含 width/height）
function avatarImg(member, sizeOrStyle, fallbackBg) {
  if (!member) return '';
  // 判断是否是完整 style 字符串（含冒号）
  const isFullStyle = sizeOrStyle && sizeOrStyle.includes(':');
  const style = isFullStyle
    ? sizeOrStyle
    : `width:${sizeOrStyle || '32px'};height:${sizeOrStyle || '32px'};border-radius:50%;flex-shrink:0;`;

  if (member.avatar) {
    return `<img src="${member.avatar}" alt="${member.name}"
      style="${style}object-fit:cover;"
      onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
      <div style="${style}background:${fallbackBg || '#1664FF'};color:#fff;display:none;
        align-items:center;justify-content:center;font-size:12px;font-weight:600;">
        ${member.name ? member.name.slice(-1) : '?'}
      </div>`;
  }
  // 无头像：显示文字头像
  const bg = fallbackBg || '#1664FF';
  return `<div style="${style}background:${bg};color:#fff;display:flex;
    align-items:center;justify-content:center;font-size:12px;font-weight:600;">
    ${member.name ? member.name.slice(-1) : '?'}
  </div>`;
}

// 根据人效值返回等级标识（用于 CSS class）
function getEfficiencyLevel(efficiency) {
  if (!efficiency || efficiency <= 0) return 'na';
  if (efficiency >= 300) return 'high';
  if (efficiency >= 200) return 'mid';
  return 'low';
}

// 根据人效值返回显示文字
function getEfficiencyLabel(efficiency) {
  if (!efficiency || efficiency <= 0) return '-';
  if (efficiency >= 300) return '高效';
  if (efficiency >= 200) return '正常';
  return '待提升';
}

// ===== 全局常量 =====

// 当前登录用户（初始为未登录状态，由 auth.js 从 localStorage 恢复）
const CURRENT_USER = {
  id: 0,
  name: '游客',
  mis: '',
  role: 'reviewer',
  avatar: '',
  team: '',
  managedTeams: [],   // r134: 小组长管辖的团队列表
  loggedIn: false,
};

// r134: 权限等级配置（3级角色体系：管理员 > 小组长 > 审核员）
const ROLE_PERMISSIONS = {
  admin: {
    label: '管理员',
    desc: '最高权限，可管理所有模块、人员、配置与权限分配',
    permissions: ['排班管理', '审批管理', '人员管理', '团队管理', '系统配置', '数据导出', '权限分配', '公告管理', '日历管理'],
    badgeBg: '#F3E8FF', badgeColor: '#7B2FBE',
  },
  leader: {
    label: '小组长',
    desc: '可管理所辖团队的排班、审批与数据查阅',
    permissions: ['排班管理（本组）', '审批管理（本组）', '数据查阅（本组）', '数据导出（本组）', '加班登记（本组）', '公告管理'],
    badgeBg: '#E8F4FF', badgeColor: '#1664FF',
  },
  reviewer: {
    label: '审核员',
    desc: '普通审核员，可查看自己的排班、提交调班申请',
    permissions: ['排班查看（本人）', '申请调班', '个人数据'],
    badgeBg: '#F2F3F5', badgeColor: '#86909C',
  },
};

// ===== 全局工具函数 =====

// 根据 ID 获取人员对象
function getMemberById(id) {
  return MEMBERS_DATA.find(m => m.id === id) || null;
}

// 生成文字头像 URL（ui-avatars 服务）
function _uiAvatar(name, size = 40) {
  const bg = '1664FF';
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || '?')}&background=${bg}&color=fff&size=${size}`;
}

// 获取成员头像 URL（优先真实头像，fallback 文字头像）
function getAvatarUrl(member) {
  if (!member) return _uiAvatar('?');
  if (member.avatar) return member.avatar;
  return _uiAvatar(member.name);
}

// r134: 按团队筛选成员（排除不参与排班的人员）
function getMembersByTeam(team) {
  if (!team) return MEMBERS_DATA.filter(m => !m.excludeFromSchedule);
  return MEMBERS_DATA.filter(m => m.team === team && !m.excludeFromSchedule);
}

// ===== 权限守卫（r134: 3级角色体系 + 团队范围校验） =====
// 权限动作 → 允许的角色列表
const PERMISSION_REQUIRED = {
  edit_schedule:     ['admin', 'leader'],   // 修改排班（leader 需团队校验）
  import_schedule:   ['admin', 'leader'],   // 导入排班
  manage_calendar:   ['admin'],             // 日历管理（新增/编辑日历）
  manage_rules:      ['admin'],             // 排班规则配置
  approve:           ['admin', 'leader'],   // 审批操作（leader 仅本组）
  manage_members:    ['admin'],             // 人员增删改
  manage_teams:      ['admin'],             // 团队管理
  assign_roles:      ['admin'],             // 角色/权限分配
  manage_settings:   ['admin'],             // 系统设置
  export_data:       ['admin', 'leader'],   // 数据导出
  add_overtime:      ['admin', 'leader'],   // 工时系统登记
  post_announcement: ['admin', 'leader'],   // 发布/编辑公告
  view_reports:      ['admin', 'leader'],   // 查看全量报表
  request_change:    ['admin', 'leader', 'reviewer'],  // 提交调班申请
};

/**
 * 检查当前用户是否有指定操作权限
 * @param {string} action  - 操作标识，见 PERMISSION_REQUIRED
 * @param {string} [targetTeam] - 目标团队名称（小组长需校验管辖范围）
 * @param {boolean} [silent=false] - 为 true 时不弹 Toast，仅返回布尔值
 * @returns {boolean}
 */
function checkPermission(action, targetTeam, silent) {
  // 兼容旧调用：checkPermission('action', true) → silent=true
  if (typeof targetTeam === 'boolean') { silent = targetTeam; targetTeam = undefined; }
  const user = CURRENT_USER;
  // 未登录：仅只读操作放行，写操作一律拒绝
  if (!user.loggedIn) {
    if (!silent) {
      showToast('请先登录后再进行此操作', 'warning');
      setTimeout(() => { if (typeof showLoginModal === 'function') showLoginModal(); }, 800);
    }
    return false;
  }
  const allowed = PERMISSION_REQUIRED[action];
  if (!allowed) return true; // 未配置的操作默认放行
  if (!allowed.includes(user.role)) {
    if (!silent) {
      const rp = ROLE_PERMISSIONS[user.role] || ROLE_PERMISSIONS.reviewer;
      showToast('权限不足：' + rp.label + ' 无法执行此操作', 'error');
    }
    return false;
  }
  // 管理员无团队限制
  if (user.role === 'admin') return true;
  // 小组长需要检查管辖团队（如果指定了目标团队）
  if (user.role === 'leader' && targetTeam) {
    const member = MEMBERS_DATA.find(m => m.mis === user.mis);
    const managed = (member && member.managedTeams) || user.managedTeams || [];
    if (managed.length > 0 && !managed.includes(targetTeam)) {
      if (!silent) showToast('该团队不在您的管辖范围内', 'warning');
      return false;
    }
  }
  return true;
}

/** r134: 判断当前用户是否为管理员或小组长（管理级权限） */
function isManagerRole() {
  return CURRENT_USER.role === 'admin' || CURRENT_USER.role === 'leader';
}
