// ===== 信息中心（含系统通知完整功能）=====

// ── 系统通知 Tab 状态 ──
let _annActiveTab = 'all';

// ── P0/P1/P2 优先级配置 ──
const ANN_PRIORITY_CONFIG = {
  p0: { label: 'P0', desc: '紧急', color: '#F53F3F', bg: 'rgba(245,63,63,0.10)', icon: '🚨', autoPin: true,  autoDx: true  },
  p1: { label: 'P1', desc: '重要', color: '#FF7D00', bg: 'rgba(255,125,0,0.10)',  icon: '⚠️', autoPin: true,  autoDx: false },
  p2: { label: 'P2', desc: '普通', color: '#3370FF', bg: 'rgba(51,112,255,0.08)', icon: '📢', autoPin: false, autoDx: false },
};

// ── P0 过期自动降级 ──
function _checkAnnExpiry() {
  const now = Date.now();
  let changed = false;
  ANNOUNCEMENTS_DATA.forEach(function(a) {
    if (a.type === 'p0' && a.expireAt && now > a.expireAt) {
      a.type = 'p2';
      a.expireAt = null;
      changed = true;
    }
  });
  if (changed) saveAnnouncements();
}

// ── P0 过期轮询 ──
let _annExpiryTimer = null;
function _startAnnExpiryPolling() {
  _stopAnnExpiryPolling();
  _modalCloseHooks.push(_stopAnnExpiryPolling);
  _annExpiryTimer = setInterval(function() {
    const before = ANNOUNCEMENTS_DATA.filter(function(a) { return a.type === 'p0'; }).map(function(a) { return a.id; });
    _checkAnnExpiry();
    const degraded = before.filter(function(id) {
      const a = ANNOUNCEMENTS_DATA.find(function(x) { return x.id === id; });
      return a && a.type !== 'p0';
    });
    if (degraded.length > 0) _reloadSysNoticeList();
  }, 60000);
}
function _stopAnnExpiryPolling() {
  if (_annExpiryTimer) { clearInterval(_annExpiryTimer); _annExpiryTimer = null; }
}

// ── 根据当前 Tab 生成列表 HTML ──
function _buildAnnListHtml(allList, unreadList, starList, trashList) {
  function emptyHtml(msg) {
    return '<div class="ann-empty"><svg width="40" height="40" viewBox="0 0 40 40" fill="none" style="opacity:0.2;margin-bottom:8px"><path d="M8 10h24M8 18h16M8 26h10" stroke="#86909C" stroke-width="2.5" stroke-linecap="round"/></svg><p>' + msg + '</p></div>';
  }
  if (_annActiveTab === 'all')    return allList.length    ? allList.map(_renderAnnItem).join('')    : emptyHtml('暂无通知');
  if (_annActiveTab === 'unread') return unreadList.length ? unreadList.map(_renderAnnItem).join('') : emptyHtml('没有未读通知');
  if (_annActiveTab === 'star')   return starList.length   ? starList.map(_renderAnnItem).join('')   : emptyHtml('没有星标通知');
  if (_annActiveTab === 'trash')  return trashList.length
    ? '<div class="ann-trash-tip">回收站中的通知可恢复或永久删除</div>' + trashList.map(_renderAnnItem).join('')
    : emptyHtml('回收站为空');
  return '';
}

// ── 渲染单条通知 HTML ──
function _renderAnnItem(a) {
  const pc        = ANN_PRIORITY_CONFIG[a.type] || ANN_PRIORITY_CONFIG.p2;
  const isUnread  = a.status === 'unread';
  const isDeleted = a.status === 'deleted';
  const isPinned  = (a.type === 'p0' || a.type === 'p1') && !isDeleted;
  const title     = a.title || '';
  const content   = a.text  || '';
  const readByCount = (a.readBy || []).length;
  const readByNames = (a.readBy || []).map(function(r) { return r.name; }).join('、');

  var expireHtml = '';
  if (a.type === 'p0' && a.expireAt && !isDeleted) {
    const remaining = a.expireAt - Date.now();
    if (remaining > 0) {
      const h = Math.floor(remaining / 3600000);
      const m = Math.floor((remaining % 3600000) / 60000);
      expireHtml = '<span class="ann2-expire-badge">⏰ ' + (h > 0 ? h + 'h ' : '') + m + 'm 后降级</span>';
    }
  }

  var bodyHtml;
  if (isPinned) {
    bodyHtml = '<div class="ann2-pinned-row" onclick="showAnnDetail(' + a.id + ')" title="点击查看详情">'
      + '<div class="ann2-pinned-title">' + (title || content) + '</div>'
      + '<svg class="ann2-pinned-arrow" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      + '</div>';
  } else {
    bodyHtml = (title ? '<div class="ann2-title">' + title + '</div>' : '')
      + '<div class="ann2-text ann2-text-clamp" onclick="showAnnDetail(' + a.id + ')" style="cursor:pointer">' + content + '</div>'
      + ((content.length > 60 || content.indexOf('\n') !== -1) ? '<div class="ann2-read-more" onclick="showAnnDetail(' + a.id + ')">查看全文 →</div>' : '');
  }

  var actionsHtml;
  if (!isDeleted) {
    actionsHtml = '<button class="ann2-btn ' + (a.starred ? 'ann2-btn-star-on' : 'ann2-btn-star') + '" title="' + (a.starred ? '取消星标' : '加星标') + '" onclick="toggleAnnStar(' + a.id + ')">'
      + '<svg width="14" height="14" viewBox="0 0 14 14" fill="' + (a.starred ? '#FF7D00' : 'none') + '" stroke="' + (a.starred ? '#FF7D00' : '#86909C') + '" stroke-width="1.3"><path d="M7 1.5l1.5 3 3.3.5-2.4 2.3.6 3.2L7 9l-3 1.5.6-3.2L2.2 5l3.3-.5z"/></svg>'
      + '</button>';
    if (isUnread) {
      actionsHtml += '<button class="ann2-btn" title="标为已读" onclick="setAnnStatus(' + a.id + ',\'read\')">'
        + '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7l3.5 3.5L12 3.5" stroke="#3370FF" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
    } else {
      actionsHtml += '<button class="ann2-btn" title="标为未读" onclick="setAnnStatus(' + a.id + ',\'unread\')">'
        + '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="2.5" fill="#3370FF"/><circle cx="7" cy="7" r="5" stroke="#3370FF" stroke-width="1.2"/></svg></button>';
    }
    actionsHtml += '<button class="ann2-btn ann2-btn-del" title="移入回收站" onclick="setAnnStatus(' + a.id + ',\'deleted\')">'
      + '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 4h10M5 4V2.5h4V4M5.5 6.5v4M8.5 6.5v4M3 4l.7 7.5h6.6L11 4" stroke="#F53F3F" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
  } else {
    actionsHtml = '<button class="ann2-btn" title="恢复通知" onclick="setAnnStatus(' + a.id + ',\'read\')">'
      + '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7c0-2.8 2.2-5 5-5 1.4 0 2.6.6 3.5 1.5L12 1.5V6H7.5l1.8-1.8A3 3 0 104 7" stroke="#3370FF" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>'
      + '<button class="ann2-btn ann2-btn-del" title="永久删除" onclick="permDeleteAnn(' + a.id + ')">'
      + '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="#F53F3F" stroke-width="1.5" stroke-linecap="round"/></svg></button>';
  }

  return '<div class="ann2-item ' + (isUnread ? 'ann2-unread' : '') + ' ' + (isDeleted ? 'ann2-deleted' : '') + ' ' + (isPinned ? 'ann2-pinned' : '') + '" data-ann-id="' + a.id + '">'
    + '<div class="ann2-priority-bar" style="background:' + pc.color + '"></div>'
    + '<div class="ann2-content-wrap">'
    + '<div class="ann2-header-row">'
    + '<span class="ann2-priority-badge" style="background:' + pc.bg + ';color:' + pc.color + '">' + pc.icon + ' ' + pc.label + '</span>'
    + (isPinned ? '<span class="ann2-pin-badge"><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1v5M3 3l2-2 2 2M2 8h6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg> 置顶</span>' : '')
    + expireHtml
    + (isUnread ? '<span class="ann2-badge-unread">未读</span>' : '')
    + (!isDeleted && readByCount > 0 ? '<span class="ann2-badge-read" title="已读：' + readByNames + '" onclick="showAnnReadReceipt(' + a.id + ')" style="cursor:pointer">✓ 已读 ' + readByCount + ' 人</span>' : '')
    + '<span class="ann2-meta-time">' + a.createdAt + ' · ' + a.createdBy + '</span>'
    + '</div>'
    + bodyHtml
    + '</div>'
    + '<div class="ann2-actions">' + actionsHtml + '</div>'
    + '</div>';
}

// ── 更新 Tab 按钮激活态和徽标 ──
function _refreshAnnTabBadges(tabCounts) {
  var keys = ['all', 'unread', 'star', 'trash'];
  keys.forEach(function(key) {
    var btn = document.querySelector('.ann-tab-btn[data-tab="' + key + '"]');
    if (!btn) return;
    btn.classList.toggle('ann-tab-active', _annActiveTab === key);
    var iconWrap = btn.querySelector('.ann-tab-icon-wrap');
    if (iconWrap) {
      var color = btn.style.getPropertyValue('--tab-color');
      iconWrap.style.background = _annActiveTab === key ? color : color + '22';
      iconWrap.style.color      = _annActiveTab === key ? '#fff' : color;
    }
    var badge = btn.querySelector('.ann-tab-badge');
    var count = tabCounts ? tabCounts[key] : 0;
    if (count > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'ann-tab-badge' + (key === 'unread' ? ' ann-tab-badge-red' : '');
        btn.appendChild(badge);
      }
      badge.textContent = count;
    } else if (badge) {
      badge.remove();
    }
  });
}

// ── 单条通知局部刷新 ──
function _refreshAnnItem(id) {
  var ann = ANNOUNCEMENTS_DATA.find(function(a) { return a.id === id; });
  var oldEl = document.querySelector('.ann2-item[data-ann-id="' + id + '"]');
  if (!oldEl) { _reloadSysNoticeList(); return; }

  var stillVisible = (function() {
    if (!ann) return false;
    if (_annActiveTab === 'all')    return ann.status !== 'deleted' && ann.status !== 'perm_deleted';
    if (_annActiveTab === 'unread') return ann.status === 'unread';
    if (_annActiveTab === 'star')   return ann.starred && ann.status !== 'deleted' && ann.status !== 'perm_deleted';
    if (_annActiveTab === 'trash')  return ann.status === 'deleted';
    return false;
  })();

  if (!stillVisible) {
    oldEl.style.transition = 'max-height 0.2s ease, opacity 0.2s ease, margin 0.2s ease';
    oldEl.style.maxHeight  = oldEl.offsetHeight + 'px';
    oldEl.style.overflow   = 'hidden';
    requestAnimationFrame(function() {
      oldEl.style.maxHeight   = '0';
      oldEl.style.opacity     = '0';
      oldEl.style.marginTop   = '0';
      oldEl.style.marginBottom = '0';
    });
    setTimeout(function() { _reloadSysNoticeList(); }, 220);
    return;
  }

  var tmp = document.createElement('div');
  tmp.innerHTML = _renderAnnItem(ann);
  var newEl = tmp.firstElementChild;
  newEl.style.transition = 'opacity 0.1s ease';
  newEl.style.opacity = '0';
  oldEl.replaceWith(newEl);
  requestAnimationFrame(function() { newEl.style.opacity = '1'; });

  var allList    = ANNOUNCEMENTS_DATA.filter(function(a) { return a.status !== 'perm_deleted' && a.status !== 'deleted'; });
  var unreadList = ANNOUNCEMENTS_DATA.filter(function(a) { return a.status === 'unread'; });
  var starList   = ANNOUNCEMENTS_DATA.filter(function(a) { return a.starred && a.status !== 'deleted' && a.status !== 'perm_deleted'; });
  var trashList  = ANNOUNCEMENTS_DATA.filter(function(a) { return a.status === 'deleted'; });
  _refreshAnnTabBadges({ all: allList.length, unread: unreadList.length, star: starList.length, trash: trashList.length });
}

// ── 重新加载通知列表区域（Tab 切换 / 操作后刷新）──
function _reloadSysNoticeList() {
  _checkAnnExpiry();
  var allList    = ANNOUNCEMENTS_DATA.filter(function(a) { return a.status !== 'perm_deleted' && a.status !== 'deleted'; })
    .sort(function(a, b) {
      var pOrder = { p0: 0, p1: 1, p2: 2, info: 3, success: 3, warning: 2 };
      var pa = pOrder[a.type] !== undefined ? pOrder[a.type] : 3;
      var pb = pOrder[b.type] !== undefined ? pOrder[b.type] : 3;
      if (pa !== pb) return pa - pb;
      return b.id - a.id;
    });
  var unreadList = ANNOUNCEMENTS_DATA.filter(function(a) { return a.status === 'unread'; });
  var starList   = ANNOUNCEMENTS_DATA.filter(function(a) { return a.starred && a.status !== 'deleted' && a.status !== 'perm_deleted'; });
  var trashList  = ANNOUNCEMENTS_DATA.filter(function(a) { return a.status === 'deleted'; });
  var tabCounts  = { all: allList.length, unread: unreadList.length, star: starList.length, trash: trashList.length };

  _refreshAnnTabBadges(tabCounts);

  var contentArea = document.getElementById('sysNoticeListArea');
  if (!contentArea) return;
  contentArea.classList.add('ann2-list-fade-out');
  setTimeout(function() {
    contentArea.innerHTML = _buildAnnListHtml(allList, unreadList, starList, trashList);
    contentArea.scrollTop = 0;
    contentArea.classList.remove('ann2-list-fade-out');
  }, 120);

  _annMarkReadAfterSwitch();
  // 同步更新顶部导航徽标 + 左侧分类徽标
  updateBadges();
  _refreshMsgCenterNav();
}

// ── 延迟标记未读为已读 ──
function _annMarkReadAfterSwitch() {
  if (_annActiveTab !== 'all' && _annActiveTab !== 'unread') return;
  setTimeout(function() {
    var changed = ANNOUNCEMENTS_DATA.filter(function(a) { return a.status === 'unread'; });
    if (changed.length > 0) {
      changed.forEach(function(a) {
        a.status = 'read';
        if (!a.readBy) a.readBy = [];
        var alreadyRead = a.readBy.some(function(r) { return r.mis === CURRENT_USER.mis || r.name === CURRENT_USER.name; });
        if (!alreadyRead) a.readBy.push({ name: CURRENT_USER.name, mis: CURRENT_USER.mis || '', readAt: formatDate(new Date()) });
      });
      saveAnnouncements();
      updateBadges();
    }
  }, 1500);
}

// ── 星标切换 ──
function toggleAnnStar(id) {
  var ann = ANNOUNCEMENTS_DATA.find(function(a) { return a.id === id; });
  if (!ann) return;
  ann.starred = !ann.starred;
  saveAnnouncements();
  _refreshAnnItem(id);
}

// ── 设置通知状态 ──
function setAnnStatus(id, status) {
  var ann = ANNOUNCEMENTS_DATA.find(function(a) { return a.id === id; });
  if (!ann) return;
  ann.status = status;
  if (status === 'read') {
    if (!ann.readBy) ann.readBy = [];
    var alreadyRead = ann.readBy.some(function(r) { return r.mis === CURRENT_USER.mis || r.name === CURRENT_USER.name; });
    if (!alreadyRead) ann.readBy.push({ name: CURRENT_USER.name, mis: CURRENT_USER.mis || '', readAt: formatDate(new Date()) });
  }
  saveAnnouncements();
  _refreshAnnItem(id);
}

// ── 永久删除确认弹窗 ──
function permDeleteAnn(id) {
  var ann = ANNOUNCEMENTS_DATA.find(function(a) { return a.id === id; });
  if (!ann) return;
  var confirmHtml = '<div style="text-align:center;padding:8px 0">'
    + '<div style="font-size:32px;margin-bottom:12px">🗑️</div>'
    + '<div style="font-size:15px;font-weight:600;color:#1D2129;margin-bottom:8px">永久删除通知</div>'
    + '<div style="font-size:13px;color:#86909C;margin-bottom:4px">此操作不可撤销，通知将被彻底删除</div>'
    + '<div style="font-size:13px;color:#1D2129;background:#F7F8FA;border-radius:8px;padding:8px 12px;margin-top:12px">"' + ann.text + '"</div>'
    + '</div>';
  openModal('确认永久删除', confirmHtml,
    '<button class="btn btn-default" onclick="closeModal()">取消</button>'
    + '<button class="btn btn-danger" onclick="_doPermDeleteAnn(' + id + ')">永久删除</button>');
}

function _doPermDeleteAnn(id) {
  var idx = ANNOUNCEMENTS_DATA.findIndex(function(a) { return a.id === id; });
  if (idx !== -1) ANNOUNCEMENTS_DATA.splice(idx, 1);
  saveAnnouncements();
  showToast('通知已永久删除', 'success');
  closeModal();
  _reloadSysNoticeList();
}

// ── 富文本渲染（Markdown 子集）──
function _renderAnnRichText(text) {
  if (!text) return '';
  var html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  var codeBlocks = [];
  html = html.replace(/```([\s\S]*?)```/g, function(_, code) {
    var ph = '\x00CODE' + codeBlocks.length + '\x00';
    codeBlocks.push('<pre class="ann-rich-pre"><code>' + code.trim() + '</code></pre>');
    return ph;
  });
  html = html.replace(/`([^`\n]+)`/g, '<code class="ann-rich-code">$1</code>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener" class="ann-rich-link">$1</a>');
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote class="ann-rich-quote">$1</blockquote>');
  html = html.split('\n').reduce(function(acc, line) {
    if (/^\d+\. /.test(line)) {
      var item = line.replace(/^\d+\. /, '').trim();
      if (acc.inOl) { acc.buf.push(item); }
      else { acc.flushUl(); acc.inOl = true; acc.buf = [item]; }
    } else {
      acc.flushOl();
      if (/^- /.test(line)) {
        var item2 = line.replace(/^- /, '').trim();
        if (acc.inUl) { acc.buf.push(item2); }
        else { acc.inUl = true; acc.buf = [item2]; }
      } else {
        acc.flushUl();
        acc.out.push(line);
      }
    }
    return acc;
  }, {
    out: [], buf: [], inOl: false, inUl: false,
    flushOl: function() { if (this.inOl) { this.out.push('<ol class="ann-rich-ol">' + this.buf.map(function(i) { return '<li>' + i + '</li>'; }).join('') + '</ol>'); this.inOl = false; this.buf = []; } },
    flushUl: function() { if (this.inUl) { this.out.push('<ul class="ann-rich-ul">' + this.buf.map(function(i) { return '<li>' + i + '</li>'; }).join('') + '</ul>'); this.inUl = false; this.buf = []; } },
    finish: function() { this.flushOl(); this.flushUl(); return this.out.join('\n'); }
  }).finish();
  html = html.replace(/^---$/gm, '<hr class="ann-rich-hr">');
  codeBlocks.forEach(function(block, i) {
    html = html.replace('\x00CODE' + i + '\x00', block);
  });
  html = html.replace(/\n/g, '<br>');
  return html;
}

// ── 通知详情弹窗 ──
function showAnnDetail(id) {
  var a = ANNOUNCEMENTS_DATA.find(function(x) { return x.id === id; });
  if (!a) return;
  var pc = ANN_PRIORITY_CONFIG[a.type] || ANN_PRIORITY_CONFIG.p2;
  var isPinned = (a.type === 'p0' || a.type === 'p1') && a.status !== 'deleted';
  var readByCount = (a.readBy || []).length;
  var expireHtml = '';
  if (a.type === 'p0' && a.expireAt) {
    var remaining = a.expireAt - Date.now();
    if (remaining > 0) {
      var h = Math.floor(remaining / 3600000);
      var m = Math.floor((remaining % 3600000) / 60000);
      expireHtml = '<span class="ann-detail-expire">⏰ ' + (h > 0 ? h + 'h ' : '') + m + 'm 后降级</span>';
    }
  }
  var richBody = _renderAnnRichText(a.text);
  var readBtn = a.status === 'unread'
    ? '<button class="ann-detail-action-btn ann-detail-action-read" onclick="setAnnStatus(' + a.id + ',\'read\')">'
      + '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7l3.5 3.5L12 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg> 标为已读</button>'
    : '<button class="ann-detail-action-btn" onclick="setAnnStatus(' + a.id + ',\'unread\')">'
      + '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="2.5" fill="#86909C"/><circle cx="7" cy="7" r="5" stroke="#86909C" stroke-width="1.2"/></svg> 标为未读</button>';

  var html = '<div class="ann-detail-wrap ann-detail-wrap-rich">'
    + '<div class="ann-detail-side-bar" style="background:' + pc.color + '"></div>'
    + '<div class="ann-detail-main">'
    + '<div class="ann-detail-meta">'
    + '<span class="ann2-priority-badge" style="background:' + pc.bg + ';color:' + pc.color + ';font-size:12px">' + pc.icon + ' ' + pc.label + '</span>'
    + (isPinned ? '<span class="ann2-pin-badge" style="font-size:11px"><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 1v5M3 3l2-2 2 2M2 8h6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg> 置顶</span>' : '')
    + expireHtml
    + (a.status === 'unread' ? '<span class="ann2-badge-unread">未读</span>' : '')
    + '<span class="ann-detail-time">' + a.createdAt + ' · 发布人：' + a.createdBy + '</span>'
    + (readByCount > 0 ? '<span class="ann2-badge-read" onclick="showAnnReadReceipt(' + a.id + ')" style="cursor:pointer;margin-left:auto">✓ 已读 ' + readByCount + ' 人</span>' : '')
    + '</div>'
    + (a.title ? '<h2 class="ann-detail-title">' + a.title + '</h2>' : '')
    + '<div class="ann-detail-body ann-detail-body-rich">' + richBody + '</div>'
    + '<div class="ann-detail-footer">'
    + '<button class="ann-detail-action-btn" onclick="toggleAnnStar(' + a.id + ');showAnnDetail(' + a.id + ')">'
    + '<svg width="14" height="14" viewBox="0 0 14 14" fill="' + (a.starred ? '#FF7D00' : 'none') + '" stroke="' + (a.starred ? '#FF7D00' : '#86909C') + '" stroke-width="1.3"><path d="M7 1.5l1.5 3 3.3.5-2.4 2.3.6 3.2L7 9l-3 1.5.6-3.2L2.2 5l3.3-.5z"/></svg>'
    + (a.starred ? ' 取消星标' : ' 加星标') + '</button>'
    + readBtn
    + '<button class="ann-detail-action-btn ann-detail-action-back" onclick="closeModal()">'
    + '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 3L5 7l4 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg> 返回</button>'
    + '</div></div></div>';

  var container = document.getElementById('modalContainer');
  if (container) container.style.minWidth = '640px';
  openModal(a.title || '通知详情', html, '<button class="btn btn-primary" onclick="closeModal()">关闭</button>');
  setTimeout(function() { if (container) container.style.minWidth = ''; }, 50);
}

// ── 已读回执弹窗 ──
function showAnnReadReceipt(id) {
  var ann = ANNOUNCEMENTS_DATA.find(function(a) { return a.id === id; });
  if (!ann) return;
  var readList   = ann.readBy || [];
  var allMembers = MEMBERS_DATA.filter(function(m) { return !m.excludeFromSchedule; });
  var readMisSet = new Set(readList.map(function(r) { return r.mis || r.name; }));
  var unreadList = allMembers.filter(function(m) { return !readMisSet.has(m.mis || '') && !readMisSet.has(m.name); });

  var readRows = readList.map(function(r) {
    return '<tr><td>' + r.name + '</td><td style="color:#86909C">' + (r.mis || '-') + '</td><td style="color:#86909C">' + (r.readAt || '-') + '</td><td><span style="color:#00B42A;font-weight:600">✓ 已读</span></td></tr>';
  }).join('');
  var unreadRows = unreadList.map(function(m) {
    return '<tr><td>' + m.name + '</td><td style="color:#86909C">' + (m.mis || '-') + '</td><td style="color:#86909C">-</td><td><span style="color:#F53F3F;font-weight:600">✗ 未读</span></td></tr>';
  }).join('');

  var tableHtml = '<div style="margin-bottom:10px;display:flex;align-items:center;justify-content:space-between">'
    + '<span style="font-size:12px;color:#86909C">共 ' + allMembers.length + ' 人 · 已读 ' + readList.length + ' · 未读 ' + unreadList.length + '</span>'
    + '<button class="btn btn-default" style="font-size:12px;padding:4px 10px" onclick="_exportAnnReadReceipt(' + id + ')">'
    + '<svg width="12" height="12" viewBox="0 0 14 14" fill="none" style="margin-right:4px"><path d="M7 1v8M4 6l3 3 3-3M2 11h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>导出 CSV</button></div>'
    + '<div style="max-height:320px;overflow-y:auto;border-radius:8px;border:0.5px solid var(--border)">'
    + '<table style="width:100%;border-collapse:collapse;font-size:12.5px">'
    + '<thead><tr style="background:var(--bg-secondary);position:sticky;top:0">'
    + '<th style="padding:7px 12px;text-align:left;font-weight:600;color:var(--text-secondary)">姓名</th>'
    + '<th style="padding:7px 12px;text-align:left;font-weight:600;color:var(--text-secondary)">MIS</th>'
    + '<th style="padding:7px 12px;text-align:left;font-weight:600;color:var(--text-secondary)">已读时间</th>'
    + '<th style="padding:7px 12px;text-align:left;font-weight:600;color:var(--text-secondary)">状态</th>'
    + '</tr></thead><tbody>' + readRows + unreadRows + '</tbody></table></div>';

  var title = ann.title ? '「' + ann.title + '」已读回执' : '通知已读回执';
  openModal(title, tableHtml,
    '<button class="btn btn-default" onclick="closeModal()">关闭</button>');
}

// ── 导出已读回执 CSV ──
function _exportAnnReadReceipt(id) {
  var ann = ANNOUNCEMENTS_DATA.find(function(a) { return a.id === id; });
  if (!ann) return;
  var readList   = ann.readBy || [];
  var allMembers = MEMBERS_DATA.filter(function(m) { return !m.excludeFromSchedule; });
  var readMisSet = new Set(readList.map(function(r) { return r.mis || r.name; }));
  var unreadList = allMembers.filter(function(m) { return !readMisSet.has(m.mis || '') && !readMisSet.has(m.name); });
  var rows = [['姓名', 'MIS', '已读时间', '状态']]
    .concat(readList.map(function(r) { return [r.name, r.mis || '', r.readAt || '', '已读']; }))
    .concat(unreadList.map(function(m) { return [m.name, m.mis || '', '', '未读']; }));
  var csv = rows.map(function(r) { return r.map(function(c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
  var bom  = '\uFEFF';
  var blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' });
  var url  = URL.createObjectURL(blob);
  var el   = document.createElement('a');
  el.href = url;
  el.download = '已读回执_' + (ann.title || ann.id) + '_' + formatDate(new Date()) + '.csv';
  el.click();
  URL.revokeObjectURL(url);
  showToast('已读回执已导出', 'success');
}

// ── 优先级切换时更新提示和大象通知状态 ──
function _onAnnPriorityChange(key) {
  var pc = ANN_PRIORITY_CONFIG[key];
  if (!pc) return;
  var hint     = document.getElementById('annPriorityHint');
  var dxCb     = document.getElementById('annMethodDx');
  var expireRow = document.getElementById('annExpireRow');
  if (hint) {
    if (pc.autoDx)       hint.textContent = 'P0 将自动触发大象通知';
    else if (pc.autoPin) hint.textContent = 'P1 将自动置顶';
    else                 hint.textContent = '';
  }
  if (dxCb && pc.autoDx) { dxCb.checked = true; toggleAnnMethod(); }
  if (expireRow) expireRow.style.display = (key === 'p0') ? 'flex' : 'none';
  document.querySelectorAll('.ann2-priority-opt').forEach(function(el) {
    el.classList.toggle('selected', el.dataset.key === key);
  });
}

// ── 大象通知 Toggle ──
function toggleAnnMethod() {
  var dxChecked = document.getElementById('annMethodDx') && document.getElementById('annMethodDx').checked;
  var dxTrack = document.querySelector('.ann-dx-toggle-track');
  if (dxTrack) dxTrack.classList.toggle('on', !!dxChecked);
  var desc = document.getElementById('annDxToggleDesc');
  if (desc) desc.textContent = dxChecked ? '开启后将同步推送大象消息给选定成员' : '仅发布系统通知，不推送大象消息';
}

// ── 切换通知对象范围 Tab ──
function switchAnnScope(scope, btn) {
  document.querySelectorAll('.ann-scope-tab').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  ['annScopeAll', 'annScopeTeam', 'annScopeMember'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  var panelMap = { all: 'annScopeAll', team: 'annScopeTeam', member: 'annScopeMember' };
  var panel = document.getElementById(panelMap[scope]);
  if (panel) panel.style.display = '';
}

// ── Markdown 工具栏插入 ──
function _annInsert(type) {
  var ta = document.getElementById('newAnnText');
  if (!ta) return;
  var start  = ta.selectionStart;
  var end    = ta.selectionEnd;
  var sel    = ta.value.slice(start, end);
  var before = ta.value.slice(0, start);
  var after  = ta.value.slice(end);
  var insert = '', cursorOffset = 0;
  switch (type) {
    case 'bold':   insert = '**' + (sel || '加粗文字') + '**'; cursorOffset = sel ? insert.length : 2; break;
    case 'italic': insert = '*'  + (sel || '斜体文字') + '*';  cursorOffset = sel ? insert.length : 1; break;
    case 'code':   insert = '`'  + (sel || '代码')     + '`';  cursorOffset = sel ? insert.length : 1; break;
    case 'link':   insert = '[' + (sel || '链接文字') + '](https://)'; cursorOffset = insert.length - 1; break;
    case 'hr':     insert = (before.endsWith('\n') || before === '' ? '' : '\n') + '---\n'; cursorOffset = insert.length; break;
    case 'ol': {
      var olLines = (sel || '列表项').split('\n');
      insert = (before.endsWith('\n') || before === '' ? '' : '\n') + olLines.map(function(l, i) { return (i + 1) + '. ' + l; }).join('\n') + '\n';
      cursorOffset = insert.length; break;
    }
    case 'ul': {
      var ulLines = (sel || '列表项').split('\n');
      insert = (before.endsWith('\n') || before === '' ? '' : '\n') + ulLines.map(function(l) { return '- ' + l; }).join('\n') + '\n';
      cursorOffset = insert.length; break;
    }
    case 'quote':  insert = (before.endsWith('\n') || before === '' ? '' : '\n') + '> ' + (sel || '引用内容') + '\n'; cursorOffset = insert.length; break;
  }
  ta.value = before + insert + after;
  var newPos = start + cursorOffset;
  ta.setSelectionRange(newPos, newPos);
  ta.focus();
}

// ── 发布新通知 ──
function addAnnouncement() {
  var title = (document.getElementById('newAnnTitle') && document.getElementById('newAnnTitle').value.trim()) || '';
  var text  = document.getElementById('newAnnText') && document.getElementById('newAnnText').value.trim();
  var typeEl = document.querySelector('input[name="annPriority"]:checked');
  var type  = typeEl ? typeEl.value : 'p2';
  if (!text) { showToast('请输入通知内容', 'warning'); return; }

  var pc    = ANN_PRIORITY_CONFIG[type] || ANN_PRIORITY_CONFIG.p2;
  var dxCbEl = document.getElementById('annMethodDx');
  var useDx = pc.autoDx || !!(dxCbEl && dxCbEl.checked);

  var activeScopeBtn = document.querySelector('.ann-scope-tab.active');
  var activeScope = activeScopeBtn ? activeScopeBtn.textContent.trim() : '全选';
  var dxTargets = [];
  if (!activeScope || activeScope === '全选') {
    dxTargets = MEMBERS_DATA.filter(function(m) { return !m.excludeFromSchedule; }).map(function(m) { return m.id; });
  } else if (activeScope === '按团队') {
    var checkedTeams = Array.from(document.querySelectorAll('input[name="annTargetTeam"]:checked')).map(function(el) { return el.value; });
    dxTargets = MEMBERS_DATA.filter(function(m) { return !m.excludeFromSchedule && checkedTeams.indexOf(m.team) !== -1; }).map(function(m) { return m.id; });
  } else if (activeScope === '按个人') {
    dxTargets = Array.from(document.querySelectorAll('input[name="annTargetMember"]:checked')).map(function(el) { return parseInt(el.value, 10); });
  }
  if (useDx && dxTargets.length === 0) { showToast('请选择至少一个通知对象', 'warning'); return; }

  var expireHoursEl = document.getElementById('annExpireHours');
  var expireHours = (type === 'p0' && expireHoursEl) ? (parseInt(expireHoursEl.value, 10) || 0) : 0;
  var expireAt = expireHours > 0 ? (Date.now() + expireHours * 3600 * 1000) : null;
  var pinTopEl = document.getElementById('annPinTop');
  var pinTop = pc.autoPin || pc.autoDx || !!(pinTopEl && pinTopEl.checked);

  var newAnn = {
    id: Date.now(), title: title, text: text, type: type,
    status: 'unread', starred: pinTop,
    createdAt: formatDate(new Date()), createdBy: CURRENT_USER.name,
    notifyMethod: useDx ? 'both' : 'system',
    readBy: [], notifyCount: useDx ? dxTargets.length : 0, expireAt: expireAt,
  };
  ANNOUNCEMENTS_DATA.unshift(newAnn);
  saveAnnouncements();

  if (useDx && dxTargets.length > 0) {
    var fullMsg = title ? title + '\n' + text : text;
    _sendDaxiangAnnouncement(fullMsg, dxTargets);
  }

  showToast('通知已发布' + (useDx ? '，大象通知 ' + dxTargets.length + ' 人' : '') + ' 🎉', 'success');
  addWorkLog('系统通知', '发布通知', (title || text.slice(0, 20)));

  // 重置表单
  var titleEl2 = document.getElementById('newAnnTitle');
  var textEl   = document.getElementById('newAnnText');
  if (titleEl2) titleEl2.value = '';
  if (textEl)   textEl.value   = '';
  var defaultPrio = document.querySelector('input[name="annPriority"][value="p2"]');
  if (defaultPrio) { defaultPrio.checked = true; _onAnnPriorityChange('p2'); }
  if (dxCbEl && dxCbEl.checked) { dxCbEl.checked = false; toggleAnnMethod(); }
  var allScopeBtn = document.querySelector('.ann-scope-tab');
  if (allScopeBtn && !allScopeBtn.classList.contains('active')) switchAnnScope('all', allScopeBtn);

  // 刷新列表
  _annActiveTab = 'all';
  _reloadSysNoticeList();
}

// ── 大象通知发送（旧中继服务已废弃，保留接口供 UI 调用）──
async function _sendDaxiangAnnouncement(text, memberIds) {
  // 大象中继服务（daxiang-relay.py）已在 r50 废弃并删除
  // 此函数保留签名以防 addAnnouncement UI 侧调用，仅记录日志
  console.warn('[大象通知] 中继服务已废弃，通知仅以系统内通知形式发布');
  showToast('大象推送服务暂不可用，通知已以系统内通知形式发布', 'info');
  addWorkLog('系统通知', '大象通知', '（中继已废弃）' + text.slice(0, 30));
}

// ===== 信息中心主页面渲染 =====

// ── 信息中心当前激活的左侧分类 ──
var _msgCenterCategory = 'approval';

// ── 左侧分类导航配置 ──
var MSG_CATEGORIES = [
  { key: 'approval', label: '审批通知', icon: '📋', color: '#FF7D00',
    desc: '加班、请假等审批消息' },
  { key: 'warning',  label: '异常预警', icon: '⚠️', color: '#F53F3F',
    desc: '队列积压、人员异常等预警' },
  { key: 'daily',    label: '定时推送', icon: '📊', color: '#3370FF',
    desc: '日报、排名等定时推送消息' },
  { key: 'sysnotice', label: '系统通知', icon: '📢', color: '#7B61FF',
    desc: '管理员发布的系统级通知' },
];

function renderMessagesPage(container) {
  var isAdmin = isManagerRole();

  // 各分类未读数
  var unreadByCategory = {
    approval:  MESSAGES_DATA.filter(function(m) { return !m.read && m.type === 'approval'; }).length,
    warning:   MESSAGES_DATA.filter(function(m) { return !m.read && m.type === 'warning'; }).length,
    daily:     MESSAGES_DATA.filter(function(m) { return !m.read && (m.type === 'daily' || m.type === 'result'); }).length,
    sysnotice: ANNOUNCEMENTS_DATA.filter(function(a) { return a.status === 'unread'; }).length,
  };

  // ── 左侧分类导航 HTML ──
  var navHtml = '<div class="msg-center-nav">'
    + '<div class="msg-center-nav-title">消息分类</div>'
    + MSG_CATEGORIES.map(function(cat) {
        var isActive = _msgCenterCategory === cat.key;
        var unread   = unreadByCategory[cat.key] || 0;
        return '<button class="msg-cat-item' + (isActive ? ' msg-cat-active' : '') + '" data-cat="' + cat.key + '" onclick="_switchMsgCategory(\'' + cat.key + '\')">'
          + '<span class="msg-cat-icon" style="background:' + cat.color + '1a;color:' + cat.color + '">' + cat.icon + '</span>'
          + '<span class="msg-cat-label">' + cat.label + '</span>'
          + (unread > 0 ? '<span class="msg-cat-badge">' + unread + '</span>' : '')
          + '</button>';
      }).join('')
    + '<div class="msg-cat-divider"></div>'
    + '<button class="msg-cat-item msg-cat-markall" onclick="_markAllMsgsRead()">'
    + '<span class="msg-cat-icon" style="background:#00B42A1a;color:#00B42A">✓</span>'
    + '<span class="msg-cat-label">全部已读</span>'
    + '</button>'
    + '</div>';

  // ── 右侧内容区 HTML ──
  var rightHtml = '<div class="msg-center-content" id="msgCenterContent">'
    + _buildMsgCategoryContent(_msgCenterCategory, isAdmin)
    + '</div>';

  container.innerHTML = '<div class="page-header">'
    + '<div><div class="page-title">信息中心</div>'
    + '<div class="page-subtitle">审批通知、异常预警、定时推送、系统通知统一管理</div></div>'
    + '</div>'
    + '<div class="msg-center-layout">'
    + navHtml
    + rightHtml
    + '</div>';

  // 如果当前是系统通知分类，初始化相关逻辑
  if (_msgCenterCategory === 'sysnotice') {
    setTimeout(function() { _onAnnPriorityChange('p2'); }, 50);
    _startAnnExpiryPolling();
    _annMarkReadAfterSwitch();
  }
}

// ── 切换左侧分类 ──
function _switchMsgCategory(cat) {
  // 离开系统通知时停止轮询
  if (_msgCenterCategory === 'sysnotice' && cat !== 'sysnotice') {
    _stopAnnExpiryPolling();
  }
  _msgCenterCategory = cat;
  // 更新左侧导航激活态（用 data-cat 属性匹配，更可靠）
  document.querySelectorAll('.msg-cat-item[data-cat]').forEach(function(el) {
    el.classList.toggle('msg-cat-active', el.dataset.cat === cat);
  });
  // 更新右侧内容
  var isAdmin = isManagerRole();
  var content = document.getElementById('msgCenterContent');
  if (!content) return;
  content.innerHTML = _buildMsgCategoryContent(cat, isAdmin);
  if (cat === 'sysnotice') {
    setTimeout(function() { _onAnnPriorityChange('p2'); }, 50);
    _startAnnExpiryPolling();
    _annMarkReadAfterSwitch();
  }
}

// ── 构建右侧内容区 HTML（根据分类）──
function _buildMsgCategoryContent(cat, isAdmin) {
  if (cat === 'sysnotice') {
    return _buildSysNoticeContent(isAdmin);
  }
  return _buildNormalMsgContent(cat, isAdmin);
}

// ── 构建普通消息内容（审批/预警/推送）──
function _buildNormalMsgContent(cat, isAdmin) {
  var catConf = MSG_CATEGORIES.find(function(c) { return c.key === cat; }) || MSG_CATEGORIES[0];

  // 过滤对应分类的消息
  var msgs;
  if (cat === 'approval') {
    msgs = MESSAGES_DATA.filter(function(m) { return m.type === 'approval' || m.type === 'result'; });
  } else if (cat === 'warning') {
    msgs = MESSAGES_DATA.filter(function(m) { return m.type === 'warning'; });
  } else if (cat === 'daily') {
    msgs = MESSAGES_DATA.filter(function(m) { return m.type === 'daily' || m.type === 'system'; });
  } else {
    msgs = MESSAGES_DATA;
  }

  var unreadCount = msgs.filter(function(m) { return !m.read; }).length;

  var headerHtml = '<div class="msg-content-header">'
    + '<span class="msg-content-icon" style="background:' + catConf.color + '1a;color:' + catConf.color + ';font-size:18px">' + catConf.icon + '</span>'
    + '<div>'
    + '<div class="msg-content-title">' + catConf.label + '</div>'
    + '<div class="msg-content-desc">' + catConf.desc + '</div>'
    + '</div>'
    + (unreadCount > 0 ? '<span class="msg-content-unread-badge">' + unreadCount + ' 条未读</span>' : '')
    + '</div>';

  if (msgs.length === 0) {
    return headerHtml + '<div class="msg-empty"><svg width="40" height="40" viewBox="0 0 40 40" fill="none" style="opacity:0.2;margin-bottom:8px"><path d="M8 10h24M8 18h16M8 26h10" stroke="#86909C" stroke-width="2.5" stroke-linecap="round"/></svg><p>暂无消息</p></div>';
  }

  var listHtml = msgs.map(function(m) {
    return '<div class="msg-item' + (m.read ? '' : ' msg-item-unread') + '" data-msg-id="' + m.id + '" onclick="_onMsgItemClick(' + m.id + ')">'
      + '<div class="msg-item-icon ' + (m.iconClass || 'msg-icon-blue') + '">' + (m.icon || '📩') + '</div>'
      + '<div class="msg-item-body">'
      + '<div class="msg-item-title">' + m.title + (m.read ? '' : '<span class="msg-dot"></span>') + '</div>'
      + '<div class="msg-item-desc">' + m.desc + '</div>'
      + '</div>'
      + '<div class="msg-item-meta">'
      + '<span class="msg-item-time">' + m.time + '</span>'
      + (!m.read ? '<button class="msg-read-btn" onclick="event.stopPropagation();_markMsgRead(' + m.id + ')" title="标为已读">✓</button>' : '')
      + '</div>'
      + '</div>';
  }).join('');

  return headerHtml + '<div class="msg-list">' + listHtml + '</div>';
}

// ── 构建系统通知内容（完整功能）──
function _buildSysNoticeContent(isAdmin) {
  _checkAnnExpiry();
  var allList    = ANNOUNCEMENTS_DATA.filter(function(a) { return a.status !== 'perm_deleted' && a.status !== 'deleted'; })
    .sort(function(a, b) {
      var pOrder = { p0: 0, p1: 1, p2: 2, info: 3, success: 3, warning: 2 };
      var pa = pOrder[a.type] !== undefined ? pOrder[a.type] : 3;
      var pb = pOrder[b.type] !== undefined ? pOrder[b.type] : 3;
      if (pa !== pb) return pa - pb;
      return b.id - a.id;
    });
  var unreadList = ANNOUNCEMENTS_DATA.filter(function(a) { return a.status === 'unread'; });
  var starList   = ANNOUNCEMENTS_DATA.filter(function(a) { return a.starred && a.status !== 'deleted' && a.status !== 'perm_deleted'; });
  var trashList  = ANNOUNCEMENTS_DATA.filter(function(a) { return a.status === 'deleted'; });
  var tabCounts  = { all: allList.length, unread: unreadList.length, star: starList.length, trash: trashList.length };

  var catConf = MSG_CATEGORIES.find(function(c) { return c.key === 'sysnotice'; });

  var headerHtml = '<div class="msg-content-header">'
    + '<span class="msg-content-icon" style="background:' + catConf.color + '1a;color:' + catConf.color + ';font-size:18px">' + catConf.icon + '</span>'
    + '<div>'
    + '<div class="msg-content-title">' + catConf.label + '</div>'
    + '<div class="msg-content-desc">' + catConf.desc + '</div>'
    + '</div>'
    + (unreadList.length > 0 ? '<span class="msg-content-unread-badge">' + unreadList.length + ' 条未读</span>' : '')
    + '</div>';

  // Tab 栏
  var tabs = [
    { key: 'all',    label: '全部',   color: '#3370FF',
      icon: '<svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M2 4h10M2 7h7M2 10h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>' },
    { key: 'unread', label: '未读',   color: '#F53F3F',
      icon: '<svg width="12" height="12" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.4"/><circle cx="7" cy="7" r="2" fill="currentColor"/></svg>' },
    { key: 'star',   label: '星标',   color: '#FF7D00',
      icon: '<svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor" stroke="currentColor" stroke-width="0.5"><path d="M7 1.5l1.5 3 3.3.5-2.4 2.3.6 3.2L7 9l-3 1.5.6-3.2L2.2 5l3.3-.5z"/></svg>' },
    { key: 'trash',  label: '回收站', color: '#86909C',
      icon: '<svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M2 4h10M5 4V2.5h4V4M5.5 6.5v4M8.5 6.5v4M3 4l.7 7.5h6.6L11 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
  ];
  var tabBarHtml = '<div class="ann-tab-bar">' + tabs.map(function(t) {
    var isActive  = _annActiveTab === t.key;
    var iconBg    = isActive ? t.color : t.color + '22';
    var iconColor = isActive ? '#fff' : t.color;
    var badgeHtml = tabCounts[t.key] > 0
      ? '<span class="ann-tab-badge' + (t.key === 'unread' ? ' ann-tab-badge-red' : '') + '">' + tabCounts[t.key] + '</span>'
      : '';
    return '<button class="ann-tab-btn ' + (isActive ? 'ann-tab-active' : '') + '" data-tab="' + t.key + '" onclick="_switchSysNoticeTab(\'' + t.key + '\')" style="--tab-color:' + t.color + '">'
      + '<span class="ann-tab-icon-wrap" style="background:' + iconBg + ';color:' + iconColor + '">' + t.icon + '</span>'
      + t.label + badgeHtml + '</button>';
  }).join('') + '</div>';

  var listHtml = _buildAnnListHtml(allList, unreadList, starList, trashList);

  // 发布表单（管理员）
  var teamOptions   = TEAMS.map(function(t) { return '<label class="ann-target-chip"><input type="checkbox" name="annTargetTeam" value="' + t + '"> ' + t + '</label>'; }).join('');
  var memberOptions = MEMBERS_DATA.filter(function(m) { return !m.excludeFromSchedule; }).map(function(m) {
    return '<label class="ann-target-chip"><input type="checkbox" name="annTargetMember" value="' + m.id + '"> ' + m.name + '</label>';
  }).join('');

  var addFormHtml = isAdmin ? (
    '<div class="ann2-add-form">'
    + '<div class="ann2-form-section-title">发布新通知</div>'
    + '<div class="ann2-add-row">'
    + '<div class="ann2-priority-selector" id="annPrioritySelector">'
    + Object.entries(ANN_PRIORITY_CONFIG).map(function(entry) {
        var k = entry[0], v = entry[1];
        return '<label class="ann2-priority-opt" data-key="' + k + '">'
          + '<input type="radio" name="annPriority" value="' + k + '" ' + (k === 'p2' ? 'checked' : '') + ' onchange="_onAnnPriorityChange(\'' + k + '\')">'
          + '<span style="background:' + v.bg + ';color:' + v.color + ';border:1.5px solid ' + v.color + '33;display:flex;align-items:center;justify-content:center;gap:4px;width:100%;padding:5px 0;border-radius:6px;font-size:12.5px;white-space:nowrap">'
          + v.icon + ' ' + v.label + '&nbsp;<em style="font-style:normal;opacity:0.75">' + v.desc + '</em></span></label>';
      }).join('')
    + '</div></div>'
    + '<div class="ann2-add-row" style="margin-top:8px"><input type="text" class="ann2-input" id="newAnnTitle" placeholder="通知标题（选填）" style="flex:1"></div>'
    + '<div class="ann2-add-row" style="margin-top:6px">'
    + '<div class="ann-editor-wrap">'
    + '<div class="ann-editor-toolbar">'
    + '<button type="button" class="ann-tb-btn" onclick="_annInsert(\'bold\')" title="加粗"><svg width="13" height="13" viewBox="0 0 14 14" fill="none"><text x="2" y="11" font-size="11" font-weight="900" fill="currentColor" font-family="serif">B</text></svg></button>'
    + '<button type="button" class="ann-tb-btn" onclick="_annInsert(\'italic\')" title="斜体"><svg width="13" height="13" viewBox="0 0 14 14" fill="none"><text x="3" y="11" font-size="11" font-style="italic" fill="currentColor" font-family="serif">I</text></svg></button>'
    + '<button type="button" class="ann-tb-btn" onclick="_annInsert(\'code\')" title="代码"><svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M4.5 4L2 7l2.5 3M9.5 4L12 7l-2.5 3M6 10.5l2-7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg></button>'
    + '<div class="ann-tb-sep"></div>'
    + '<button type="button" class="ann-tb-btn" onclick="_annInsert(\'link\')" title="链接"><svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M5.5 8.5a3 3 0 004.24 0l1.5-1.5a3 3 0 00-4.24-4.24l-.75.75" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M8.5 5.5a3 3 0 00-4.24 0L2.76 7a3 3 0 004.24 4.24l.75-.75" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg></button>'
    + '<button type="button" class="ann-tb-btn" onclick="_annInsert(\'hr\')" title="分割线"><svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 7h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button>'
    + '<div class="ann-tb-sep"></div>'
    + '<button type="button" class="ann-tb-btn" onclick="_annInsert(\'ol\')" title="有序列表"><svg width="13" height="13" viewBox="0 0 14 14" fill="none"><text x="1" y="6" font-size="5" fill="currentColor" font-family="monospace" font-weight="700">1.</text><text x="1" y="11" font-size="5" fill="currentColor" font-family="monospace" font-weight="700">2.</text><path d="M6 4.5h6M6 9.5h6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg></button>'
    + '<button type="button" class="ann-tb-btn" onclick="_annInsert(\'ul\')" title="无序列表"><svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="3" cy="4.5" r="1.2" fill="currentColor"/><circle cx="3" cy="9.5" r="1.2" fill="currentColor"/><path d="M6 4.5h6M6 9.5h6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg></button>'
    + '<button type="button" class="ann-tb-btn" onclick="_annInsert(\'quote\')" title="引用"><svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M2 3.5v7" stroke="#4096FF" stroke-width="2" stroke-linecap="round"/><path d="M5 5h7M5 7.5h5M5 10h6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg></button>'
    + '<div class="ann-tb-sep"></div><span class="ann-tb-hint">支持 Markdown 语法</span>'
    + '</div>'
    + '<textarea class="ann2-textarea ann-editor-textarea" id="newAnnText" placeholder="通知内容（必填）..." rows="4"></textarea>'
    + '</div></div>'
    + '<div class="ann2-add-row ann2-expire-row" id="annExpireRow" style="display:none;margin-top:6px;align-items:center;gap:8px">'
    + '<span style="font-size:12px;color:#86909C;white-space:nowrap">⏰ 过期降级</span>'
    + '<select class="ann2-select" id="annExpireHours" style="flex:1">'
    + '<option value="">不设置（持续置顶）</option>'
    + '<option value="2">2 小时后降为 P2</option>'
    + '<option value="4">4 小时后降为 P2</option>'
    + '<option value="8">8 小时后降为 P2</option>'
    + '<option value="24">24 小时后降为 P2</option>'
    + '<option value="48">48 小时后降为 P2</option>'
    + '</select></div>'
    + '<div class="ann2-form-divider"></div>'
    + '<div class="ann-notify-row" style="align-items:flex-start">'
    + '<span class="ann-notify-label" style="padding-top:2px">发送对象 <span style="color:#F53F3F">*</span></span>'
    + '<div class="ann-target-scope" style="flex:1">'
    + '<div class="ann-scope-tabs">'
    + '<button class="ann-scope-tab active" onclick="switchAnnScope(\'all\',this)">全选</button>'
    + '<button class="ann-scope-tab" onclick="switchAnnScope(\'team\',this)">按团队</button>'
    + '<button class="ann-scope-tab" onclick="switchAnnScope(\'member\',this)">按个人</button>'
    + '</div>'
    + '<div id="annScopeAll" class="ann-scope-panel"><span style="font-size:12px;color:#86909C">将通知所有成员（' + MEMBERS_DATA.filter(function(m) { return !m.excludeFromSchedule; }).length + ' 人）</span></div>'
    + '<div id="annScopeTeam" class="ann-scope-panel" style="display:none"><div class="ann-target-chips">' + teamOptions + '</div></div>'
    + '<div id="annScopeMember" class="ann-scope-panel" style="display:none"><div class="ann-target-chips">' + memberOptions + '</div></div>'
    + '</div></div>'
    + '<div class="ann-dx-toggle-row" id="annDxToggleRow">'
    + '<div class="ann-dx-toggle-inner">'
    + '<label class="ann-dx-toggle-switch" id="annDxToggleLabel" title="开启后将同步推送大象消息">'
    + '<input type="checkbox" id="annMethodDx" onchange="toggleAnnMethod()">'
    + '<span class="ann-dx-toggle-track"></span></label>'
    + '<div class="ann-dx-toggle-info">'
    + '<span class="ann-dx-toggle-title">'
    + '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" style="vertical-align:-2px;flex-shrink:0">'
    + '<path d="M3 9.5C3 6.5 4.5 4 8 4C11.5 4 13 6.5 13 9.5V11C13 12.1 12.1 13 11 13H5C3.9 13 3 12.1 3 11V9.5Z" fill="#3370FF" opacity="0.15" stroke="#3370FF" stroke-width="1.2"/>'
    + '<path d="M3 8.5C3 8.5 1.5 7.5 1.5 6C1.5 4.8 2.3 4 3 4.5V8.5Z" fill="#3370FF" opacity="0.25" stroke="#3370FF" stroke-width="1.1" stroke-linejoin="round"/>'
    + '<path d="M13 8.5C13 8.5 14.5 7.5 14.5 6C14.5 4.8 13.7 4 13 4.5V8.5Z" fill="#3370FF" opacity="0.25" stroke="#3370FF" stroke-width="1.1" stroke-linejoin="round"/>'
    + '<path d="M6.5 13C6.5 13 6 14.5 5 15" stroke="#3370FF" stroke-width="1.2" stroke-linecap="round"/>'
    + '<circle cx="6.2" cy="9" r="0.8" fill="#3370FF"/><circle cx="9.8" cy="9" r="0.8" fill="#3370FF"/>'
    + '</svg> 大象通知 <span class="ann-dx-toggle-badge">可选</span></span>'
    + '<span class="ann-dx-toggle-desc" id="annDxToggleDesc">仅发布系统通知，不推送大象消息</span>'
    + '</div></div>'
    + '<span class="ann2-priority-hint" id="annPriorityHint"></span>'
    + '</div>'
    + '<div class="ann-pin-row" id="annPinRow">'
    + '<label class="ann-pin-checkbox-label"><input type="checkbox" id="annPinTop"><span>置顶显示</span></label>'
    + '</div>'
    + '<div style="display:flex;justify-content:flex-end;margin-top:12px;gap:8px">'
    + '<button class="ann2-publish-btn" onclick="addAnnouncement()">'
    + '<svg width="13" height="13" viewBox="0 0 14 14" fill="none" style="vertical-align:-1px"><path d="M7 1v9M3 6l4 4 4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M1 12h12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg> 发布</button>'
    + '</div></div>'
  ) : '';

  // 系统通知：Tab 列表区 + 右侧发布表单（管理员）
  return headerHtml
    + '<div style="display:grid;grid-template-columns:' + (isAdmin ? '1fr 340px' : '1fr') + ';gap:16px;align-items:start;margin-top:14px">'
    + '<div style="background:var(--bg-secondary);border-radius:10px;overflow:hidden;border:0.5px solid var(--border-light)">'
    + tabBarHtml
    + '<div id="sysNoticeListArea" class="ann2-list" style="padding:0 16px 16px">'
    + listHtml
    + '</div></div>'
    + (isAdmin ? '<div class="card"><div class="card-body">' + addFormHtml + '</div></div>' : '')
    + '</div>';
}

// ── Tab 切换（页面内，不走弹窗）──
function _switchSysNoticeTab(tab) {
  _annActiveTab = tab;
  _reloadSysNoticeList();
}

// ── 消息条目点击（跳转对应页面）──
function _onMsgItemClick(id) {
  var msg = MESSAGES_DATA.find(function(m) { return m.id === id; });
  if (!msg) return;
  // 标为已读
  if (!msg.read) { msg.read = true; _refreshMsgCenterNav(); updateBadges(); }
  // 跳转
  if (msg.action) showPage(msg.action);
}

// ── 标记单条消息已读（局部 DOM 更新，不重建整区）──
function _markMsgRead(id) {
  var msg = MESSAGES_DATA.find(function(m) { return m.id === id; });
  if (!msg || msg.read) return;
  msg.read = true;

  // 找到对应的 .msg-item 元素，局部更新样式
  var itemEl = document.querySelector('.msg-item[data-msg-id="' + id + '"]');
  if (itemEl) {
    itemEl.classList.remove('msg-item-unread');
    // 移除未读圆点
    var dot = itemEl.querySelector('.msg-dot');
    if (dot) dot.remove();
    // 移除已读按钮
    var readBtn = itemEl.querySelector('.msg-read-btn');
    if (readBtn) readBtn.remove();
    // 淡入动画
    itemEl.style.transition = 'opacity 0.2s';
    itemEl.style.opacity = '0.6';
    setTimeout(function() { itemEl.style.opacity = '1'; }, 200);
  }

  // 更新右侧 header 的未读数徽标
  var unreadCount = MESSAGES_DATA.filter(function(m) {
    if (_msgCenterCategory === 'approval') return !m.read && (m.type === 'approval' || m.type === 'result');
    if (_msgCenterCategory === 'warning')  return !m.read && m.type === 'warning';
    if (_msgCenterCategory === 'daily')    return !m.read && (m.type === 'daily' || m.type === 'system');
    return !m.read;
  }).length;
  var badge = document.querySelector('.msg-content-unread-badge');
  if (badge) {
    if (unreadCount > 0) badge.textContent = unreadCount + ' 条未读';
    else badge.remove();
  }

  _refreshMsgCenterNav();
  updateBadges();
}

// ── 全部已读（当前分类 + 系统通知）──
function _markAllMsgsRead() {
  MESSAGES_DATA.forEach(function(m) { m.read = true; });
  ANNOUNCEMENTS_DATA.forEach(function(a) {
    if (a.status === 'unread') {
      a.status = 'read';
      if (!a.readBy) a.readBy = [];
      var already = a.readBy.some(function(r) { return r.mis === CURRENT_USER.mis || r.name === CURRENT_USER.name; });
      if (!already) a.readBy.push({ name: CURRENT_USER.name, mis: CURRENT_USER.mis || '', readAt: formatDate(new Date()) });
    }
  });
  saveAnnouncements();
  // 刷新左侧导航徽标
  _refreshMsgCenterNav();
  // 刷新右侧内容
  var isAdmin = isManagerRole();
  var content = document.getElementById('msgCenterContent');
  if (content) content.innerHTML = _buildMsgCategoryContent(_msgCenterCategory, isAdmin);
  updateBadges();
  showToast('已全部标为已读', 'success');
}

// ── 刷新左侧导航徽标（不重建整个页面）──
function _refreshMsgCenterNav() {
  var unreadByCategory = {
    approval:  MESSAGES_DATA.filter(function(m) { return !m.read && m.type === 'approval'; }).length,
    warning:   MESSAGES_DATA.filter(function(m) { return !m.read && m.type === 'warning'; }).length,
    daily:     MESSAGES_DATA.filter(function(m) { return !m.read && (m.type === 'daily' || m.type === 'result'); }).length,
    sysnotice: ANNOUNCEMENTS_DATA.filter(function(a) { return a.status === 'unread'; }).length,
  };
  MSG_CATEGORIES.forEach(function(cat) {
    var btn = document.querySelector('.msg-cat-item[data-cat="' + cat.key + '"]');
    if (!btn) return;
    var badge = btn.querySelector('.msg-cat-badge');
    var count = unreadByCategory[cat.key] || 0;
    if (count > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'msg-cat-badge';
        btn.appendChild(badge);
      }
      badge.textContent = count;
    } else if (badge) {
      badge.remove();
    }
  });
}

// ── updateBadges 兼容：计算系统通知未读数 ──
function getSysNoticeUnreadCount() {
  return ANNOUNCEMENTS_DATA.filter(function(a) { return a.status === 'unread'; }).length;
}

