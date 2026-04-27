// ===== 排班日历模块 — 全局状态 & 颜色配置 =====
// opt4: 从 schedule.js 拆分出来的全局状态层
// opt7: 收拢全局变量为 scheduleState 对象

const scheduleState = {
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1,
  viewMode: 'month', // month | week
  filter: { team: 'all' },
  foldState: {}, // opt6: 各团队折叠状态持久化
};
// 向后兼容：暴露顶层变量（getter/setter 同步到 scheduleState）
let scheduleYear = scheduleState.year;
let scheduleMonth = scheduleState.month;
let scheduleViewMode = scheduleState.viewMode;
let scheduleFilter = scheduleState.filter;

// opt7/r134: 权限判断辅助函数，替代重复的 includes 判断
function isAdmin() {
  return ['admin', 'leader'].includes(CURRENT_USER.role);
}

// opt6: 折叠状态持久化
function _loadFoldState() {
  try { const s = localStorage.getItem('glxt_schedule_foldState'); if (s) scheduleState.foldState = JSON.parse(s); } catch(e) {}
}
function _saveFoldState() {
  try { localStorage.setItem('glxt_schedule_foldState', JSON.stringify(scheduleState.foldState)); } catch(e) {}
}
_loadFoldState();

// ===== 22种底色配置（腾讯文档官方调色板，浅底深字）=====
const SHIFT_COLOR_OPTIONS = [
  // Primaryblue 系
  { value: 'shift-a',       label: '品牌蓝',   bg: '#E8F0FE', fg: '#1456F0' },
  // Indigoblue 系
  { value: 'shift-sky',     label: '靛蓝色',   bg: '#EEF2FF', fg: '#3D5AF1' },
  // Acidblue 系
  { value: 'shift-navy',    label: '天蓝色',   bg: '#E6F7FF', fg: '#0E8FD8' },
  // Cyan 系
  { value: 'shift-teal',    label: '青碧色',   bg: '#E6FFFB', fg: '#08979C' },
  // Green 系
  { value: 'shift-c',       label: '翠绿色',   bg: '#F6FFED', fg: '#389E0D' },
  // Green 深
  { value: 'shift-mint',    label: '深绿色',   bg: '#D9F7BE', fg: '#237804' },
  // Cyan 深
  { value: 'shift-sage',    label: '深青色',   bg: '#B5F5EC', fg: '#006D75' },
  // Acidblue 深
  { value: 'shift-olive',   label: '深天蓝',   bg: '#BAE7FF', fg: '#096DD9' },
  // Orange 系
  { value: 'shift-b',       label: '暖橙色',   bg: '#FFF7E6', fg: '#D46B08' },
  // Yellow 系
  { value: 'shift-amber',   label: '琥珀黄',   bg: '#FFFBE6', fg: '#D48806' },
  // Orange 深
  { value: 'shift-coral',   label: '深橙色',   bg: '#FFE7BA', fg: '#AD4E00' },
  // Red 系
  { value: 'shift-rose',    label: '玫瑰红',   bg: '#FFF1F0', fg: '#CF1322' },
  // Purple 系
  { value: 'shift-leave',   label: '薰衣草',   bg: '#F3EEFF', fg: '#6B3FD4' },
  // Purple 深
  { value: 'shift-lavender',label: '深紫色',   bg: '#EFDBFF', fg: '#531DAB' },
  // Indigoblue 深
  { value: 'shift-plum',    label: '深靛蓝',   bg: '#D6E4FF', fg: '#1D39C4' },
  // Red 深
  { value: 'shift-mauve',   label: '深红色',   bg: '#FFCCC7', fg: '#A8071A' },
  // GrayBlue 中性
  { value: 'shift-off',     label: '银灰色',   bg: '#F0F2F5', fg: '#8C8C8C' },
  { value: 'shift-slate',   label: '蓝灰色',   bg: '#EEF0F5', fg: '#5C6B8A' },
  { value: 'shift-sand',    label: '沙漠金',   bg: '#FFFBE6', fg: '#876800' },
  { value: 'shift-stone',   label: '暖石灰',   bg: '#F5F5F5', fg: '#595959' },
  { value: 'shift-dusk',    label: '暮色蓝',   bg: '#E8EAF0', fg: '#4A5568' },
  { value: 'shift-mist',    label: '晨雾蓝',   bg: '#F0F2F5', fg: '#6B7A99' },
];

const LEAVE_COLOR_OPTIONS = [
  // Primaryblue 系
  { value: 'leave-annual',   label: '品牌蓝',  bg: '#E8F0FE', fg: '#1456F0' },
  // Indigoblue 系
  { value: 'leave-sky',      label: '靛蓝色',  bg: '#EEF2FF', fg: '#3D5AF1' },
  // Acidblue 系
  { value: 'leave-navy',     label: '天蓝色',  bg: '#E6F7FF', fg: '#0E8FD8' },
  // Cyan 系
  { value: 'leave-teal',     label: '青碧色',  bg: '#E6FFFB', fg: '#08979C' },
  // Green 系
  { value: 'leave-maternity',label: '翠绿色',  bg: '#F6FFED', fg: '#389E0D' },
  // Green 深
  { value: 'leave-mint',     label: '深绿色',  bg: '#D9F7BE', fg: '#237804' },
  // Cyan 深
  { value: 'leave-sage',     label: '深青色',  bg: '#B5F5EC', fg: '#006D75' },
  // Acidblue 深
  { value: 'leave-olive',    label: '深天蓝',  bg: '#BAE7FF', fg: '#096DD9' },
  // Orange 系
  { value: 'leave-sick',     label: '暖橙色',  bg: '#FFF7E6', fg: '#D46B08' },
  // Yellow 系
  { value: 'leave-amber',    label: '琥珀黄',  bg: '#FFFBE6', fg: '#D48806' },
  // Orange 深
  { value: 'leave-coral',    label: '深橙色',  bg: '#FFE7BA', fg: '#AD4E00' },
  // Red 系
  { value: 'leave-marriage', label: '玫瑰红',  bg: '#FFF1F0', fg: '#CF1322' },
  // Purple 系
  { value: 'leave-personal', label: '薰衣草',  bg: '#F3EEFF', fg: '#6B3FD4' },
  // Purple 深
  { value: 'leave-lavender', label: '深紫色',  bg: '#EFDBFF', fg: '#531DAB' },
  // Indigoblue 深
  { value: 'leave-plum',     label: '深靛蓝',  bg: '#D6E4FF', fg: '#1D39C4' },
  // Red 深
  { value: 'leave-mauve',    label: '深红色',  bg: '#FFCCC7', fg: '#A8071A' },
  // GrayBlue 中性
  { value: 'leave-gray',     label: '银灰色',  bg: '#F0F2F5', fg: '#8C8C8C' },
  { value: 'leave-slate',    label: '蓝灰色',  bg: '#EEF0F5', fg: '#5C6B8A' },
  { value: 'leave-sand',     label: '沙漠金',  bg: '#FFFBE6', fg: '#876800' },
  { value: 'leave-stone',    label: '暖石灰',  bg: '#F5F5F5', fg: '#595959' },
  { value: 'leave-dusk',     label: '暮色蓝',  bg: '#E8EAF0', fg: '#4A5568' },
  { value: 'leave-mist',     label: '晨雾蓝',  bg: '#F0F2F5', fg: '#6B7A99' },
];

// 渲染颜色选择器（网格布局）
function renderColorPicker(options, radioName, currentValue) {
  return `
    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px">
      ${options.map(c => `
        <label title="${c.label}" style="cursor:pointer;position:relative" onclick="selectColorSwatch(this,'${radioName}')">
          <input type="radio" name="${radioName}" value="${c.value}" ${currentValue === c.value ? 'checked' : ''} style="position:absolute;opacity:0;width:0;height:0">
          <div class="color-swatch ${currentValue === c.value ? 'color-swatch-selected' : ''}"
               style="background:${c.bg};color:${c.fg};border:2px solid ${currentValue === c.value ? c.fg : 'transparent'}"
               data-value="${c.value}" data-fg="${c.fg}">
            <div style="font-size:11px;font-weight:700;line-height:1">${c.label.slice(0,2)}</div>
            <div style="font-size:9px;margin-top:1px;opacity:0.8">${c.label.slice(2)}</div>
          </div>
        </label>
      `).join('')}
    </div>
  `;
}

function selectColorSwatch(labelEl, radioName) {
  const radio = labelEl.querySelector('input[type="radio"]');
  if (!radio) return;
  radio.checked = true;
  const fg = labelEl.querySelector('.color-swatch').dataset.fg;
  // 重置所有同组 swatch
  document.querySelectorAll(`input[name="${radioName}"]`).forEach(r => {
    const swatch = r.closest('label')?.querySelector('.color-swatch');
    if (swatch) {
      swatch.style.border = '2px solid transparent';
      swatch.classList.remove('color-swatch-selected');
    }
  });
  // 高亮当前
  const swatch = labelEl.querySelector('.color-swatch');
  if (swatch) {
    swatch.style.border = `2px solid ${fg}`;
    swatch.classList.add('color-swatch-selected');
  }
}
