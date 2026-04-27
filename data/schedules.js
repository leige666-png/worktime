// 排班数据
const SHIFTS = {
  A: { name: 'A班', start: '08:00', end: '17:00', color: 'shift-a', label: 'A', breakMinutes: 60 },
  B: { name: 'B班', start: '12:00', end: '21:00', color: 'shift-b', label: 'B', breakMinutes: 60 },
  C: { name: 'C班', start: '09:00', end: '18:00', color: 'shift-c', label: 'C', breakMinutes: 60 },
  OFF: { name: '休息', start: '', end: '', color: 'shift-off', label: '休', breakMinutes: 0 },
};
// 注意：请假不再是固定班次，由 LEAVE_TYPES 动态管理
// 排班格子存储格式：'LEAVE:annual'、'LEAVE:sick' 等，前缀 LEAVE: 标识请假类型 id

// 生成当月排班数据（初始全空，所有格子默认 OFF，由用户手动排班）
function generateScheduleData(year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const schedules = {};
  MEMBERS_DATA.forEach(member => {
    if (member.role === 'leader') return;
    schedules[member.id] = {};
    for (let d = 1; d <= daysInMonth; d++) {
      schedules[member.id][d] = 'OFF';
    }
  });
  return schedules;
}

// 当前月份排班（初始值由 storage.js 从 localStorage 恢复，首次访问时调用 generateScheduleData）
const today = new Date();
let SCHEDULE_DATA = generateScheduleData(today.getFullYear(), today.getMonth() + 1);

// 自定义排班日历卡片（由 storage.js 持久化）
// 结构：[{ id, name, memberIds:[], shiftKeys:[], leaveTypeIds:[], createdAt }]
// 内置4个团队为 TEAMS 默认卡片，此处只存自定义新建的
let CUSTOM_CALENDARS = [];

// 请假类型（全系统统一数据源）
// duration: 0.5 = 半天，1 = 全天
const LEAVE_TYPES = [
{ id: 'annual',    name: '年假',  color: 'leave-b3',  duration: 1,   desc: '带薪年假' },
{ id: 'personal',  name: '事假',  color: 'leave-p3',  duration: 0.5, desc: '个人事务' },
{ id: 'marriage',  name: '婚假',  color: 'leave-k3',  duration: 1,   desc: '结婚假期' },
{ id: 'maternity', name: '产假',  color: 'leave-g3',  duration: 1,   desc: '生育假期' },
];

// 根据请假类型id获取请假信息（全系统通用）
function getLeaveTypeById(id) {
  return LEAVE_TYPES.find(lt => lt.id === id) || null;
}

// 解析排班值：判断是否为请假，返回 { isLeave, leaveTypeId, leaveType }
function parseShiftValue(shiftVal) {
  if (typeof shiftVal === 'string' && shiftVal.startsWith('LEAVE:')) {
    const leaveTypeId = shiftVal.slice(6);
    const leaveType = getLeaveTypeById(leaveTypeId);
    return { isLeave: true, leaveTypeId, leaveType: leaveType || { id: leaveTypeId, name: '请假', color: 'leave-annual', duration: 1 } };
  }
  return { isLeave: false, leaveTypeId: null, leaveType: null };
}

// 获取排班格子的显示信息（兼容旧 LEAVE 格式 + 新 LEAVE:xxx 格式）
function getShiftDisplayInfo(shiftVal) {
if (!shiftVal) return SHIFTS.OFF;
// 兼容旧格式
if (shiftVal === 'LEAVE') {
const lt = LEAVE_TYPES[0];
return { name: '请假', label: '假', color: lt ? lt.color : 'leave-b3', start: '', end: '', isLeave: true, leaveTypeId: lt?.id };
}
const parsed = parseShiftValue(shiftVal);
if (parsed.isLeave) {
const lt = parsed.leaveType;
// 已删除的请假类型（如旧数据中的病假）渲染为休息
if (!lt || !LEAVE_TYPES.find(x => x.id === lt.id)) return SHIFTS.OFF;
const durationLabel = lt.duration === 0.5 ? '半天' : '全天';
return { name: lt.name, label: lt.name.slice(0, 1), color: lt.color, start: '', end: '', isLeave: true, leaveTypeId: lt.id, durationLabel };
}
return SHIFTS[shiftVal] || SHIFTS.OFF;
}

// 获取某人某天的班次
function getMemberShift(memberId, day) {
  if (!SCHEDULE_DATA[memberId]) return 'OFF';
  return SCHEDULE_DATA[memberId][day] || 'OFF';
}

// 判断某个排班值是否为请假（兼容旧 LEAVE 和新 LEAVE:xxx）
function isLeaveShift(shiftVal) {
  return shiftVal === 'LEAVE' || (typeof shiftVal === 'string' && shiftVal.startsWith('LEAVE:'));
}

// 获取某天在班人数
function getDayOnDutyCount(day) {
  let count = 0;
  MEMBERS_DATA.forEach(m => {
    if (m.role === 'leader') return;
    const shift = getMemberShift(m.id, day);
    if (shift !== 'OFF' && !isLeaveShift(shift)) count++;
  });
  return count;
}

// 检查是否工作时段
function isWorkingTime(memberId, day, startTime, endTime) {
  const shift = getMemberShift(memberId, day);
  if (shift === 'OFF' || isLeaveShift(shift)) return false;
  const shiftInfo = SHIFTS[shift];
  if (!shiftInfo || !shiftInfo.start) return false;
  return startTime >= shiftInfo.start && endTime <= shiftInfo.end;
}

// 检查是否非工作时段（加班校验）
function isNonWorkingTime(memberId, day, startTime, endTime) {
  const shift = getMemberShift(memberId, day);
  if (shift === 'OFF') return true;
  if (isLeaveShift(shift)) return true;
  const shiftInfo = SHIFTS[shift];
  if (!shiftInfo || !shiftInfo.start) return true;
  return endTime <= shiftInfo.start || startTime >= shiftInfo.end;
}

// 考勤统计数据（固定值，避免每次刷新随机变化）
const ATTENDANCE_STATS = {};
const _STATS_SEED = [
  [18,1,0],[20,0,1],[19,2,0],[22,0,1],[18,1,0],
  [21,0,0],[19,1,0],[20,0,1],[18,2,0],[22,0,0],
  [19,1,1],[20,0,0],[18,1,0],[21,0,1],[19,2,0],
  [22,0,0],[18,1,1],[20,0,0],[19,1,0],[21,0,0],
  [18,2,1],[20,0,0],[19,1,0],[22,0,0],[18,1,1],
];
MEMBERS_DATA.forEach((m, i) => {
  if (m.role === 'leader') return;
  const s = _STATS_SEED[i % _STATS_SEED.length];
  ATTENDANCE_STATS[m.id] = {
    workDays: s[0], leaveDays: s[1], triplePayDays: s[2],
  };
});

// ============================================================
// 排班规则（按团队配置，由 storage.js 持久化）
// 结构：{
//   "高曝团队": {
//     enabled: true,                    // 是否启用该团队的规则检测
//     minOnDutyPerDay: { "A": 2, "B": 2 }, // 每天每班次至少在班人数
//     minWorkDays: 18,                  // 每人每月最少在班天数
//     maxWorkDays: 23                   // 每人每月最多在班天数（0 = 不限）
//   },
//   ...
// }
// ============================================================
const SCHEDULE_RULES = {};
