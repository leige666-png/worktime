// 工时系统数据

// ===== 旧类型（保留兼容旧记录渲染） =====
const OT_TYPES = [
  { id: 'normal', name: '普通加班', color: 'ot-type-normal' },
  { id: 'urgent', name: '紧急任务加班', color: 'ot-type-urgent' },
  { id: 'holiday', name: '节假日加班', color: 'ot-type-holiday' },
];

const INJURY_TYPES = [
  { id: 'physical', name: '身体工损', color: 'injury-type-physical' },
  { id: 'mental', name: '心理工损', color: 'injury-type-mental' },
  { id: 'accident', name: '意外工损', color: 'injury-type-accident' },
];

// ===== 统一工时类型（管理员可自定义，localStorage 持久化） =====
// category: 'overtime' = 加班类 | 'injury' = 工损类
// 所有类型均可编辑、删除、重命名、改色
let WORKTIME_TYPES = [
  // 加班类（默认预设，可自由管理）
  { id: 'wt_normal',  name: '普通加班',   category: 'overtime', color: 'wt-type-blue',   sortOrder: 1, icon: '🕐', desc: '日常业务延长工作时间' },
  { id: 'wt_urgent',  name: '紧急任务加班', category: 'overtime', color: 'wt-type-orange', sortOrder: 2, icon: '⚡', desc: '突发紧急任务需即时处理' },
  { id: 'wt_holiday', name: '节假日加班',  category: 'overtime', color: 'wt-type-red',    sortOrder: 3, icon: '📅', desc: '法定节假日安排值班工作' },
  // 工损类（默认预设，可自由管理）
  { id: 'wt_physical', name: '身体工损', category: 'injury', color: 'wt-type-pink',   sortOrder: 10, icon: '🏥', desc: '因工作导致的身体不适或损伤' },
  { id: 'wt_mental',   name: '心理工损', category: 'injury', color: 'wt-type-purple', sortOrder: 11, icon: '🧠', desc: '因工作压力导致的心理疲劳' },
  { id: 'wt_accident', name: '意外工损', category: 'injury', color: 'wt-type-amber',  sortOrder: 12, icon: '⚠️', desc: '工作中发生的意外伤害事故' },
];

// 根据 ID 获取工时类型
function getWorktimeTypeById(id) {
  return WORKTIME_TYPES.find(t => t.id === id) || null;
}
// 按分类获取类型列表
function getWorktimeTypesByCategory(cat) {
  return WORKTIME_TYPES.filter(t => t.category === cat).sort((a, b) => a.sortOrder - b.sortOrder);
}
// 兼容旧类型 ID → 新类型 ID 映射
function legacyTypeToWorktime(type, subType) {
  if (type === 'overtime') {
    const map = { normal: 'wt_normal', urgent: 'wt_urgent', holiday: 'wt_holiday' };
    return map[subType] || 'wt_normal';
  }
  const map = { physical: 'wt_physical', mental: 'wt_mental', accident: 'wt_accident' };
  return map[subType] || 'wt_physical';
}

// 作业平台选项
const WORK_PLATFORMS = [
  { id: 'queue',   name: '队列',   desc: '线上审核队列作业',   icon: '📋', hasQueue: true },
  { id: 'label',   name: '标注',   desc: '数据标注任务',       icon: '🏷️', hasQueue: false },
  { id: 'offline', name: '离线',   desc: '离线/线下专项任务',   icon: '📂', hasQueue: false },
];

const OT_STATUS = {
  draft:    { label: '草稿',   color: 'tag-gray',   icon: '📝', barColor: 'var(--text-quaternary)' },
  pending:  { label: '待审批', color: 'tag-orange', icon: '⏳', barColor: 'var(--warning)' },
  approved: { label: '已通过', color: 'tag-green',  icon: '✅', barColor: 'var(--success)' },
  rejected: { label: '已驳回', color: 'tag-red',    icon: '❌', barColor: 'var(--danger)' },
  archived: { label: '已归档', color: 'tag-blue',   icon: '📦', barColor: 'var(--primary)' },
};

// 模拟加班记录
const OVERTIME_RECORDS = [
  { id: 1, type: 'overtime', otType: 'normal', memberId: 2, memberName: '钱皓', team: '高曝团队', date: '2026-04-07', startTime: '18:00', endTime: '21:00', duration: 3, queueId: 36, queueName: '高曝-图文-笔记-驻场', volume: 936, efficiency: 312, project: '高曝专项', status: 'approved', submittedAt: '2026-04-07 21:05', approvedAt: '2026-04-07 22:10', approver: '艾俊磊', remark: '' },
  { id: 2, type: 'overtime', otType: 'urgent', memberId: 4, memberName: '何妍', team: '高曝团队', date: '2026-04-07', startTime: '17:00', endTime: '20:30', duration: 3.5, queueId: 143, queueName: '高曝-视频-笔记-驻场', volume: 1138, efficiency: 325, project: '视频积压清理', status: 'pending', submittedAt: '2026-04-07 20:35', approvedAt: null, approver: null, remark: '' },
  { id: 3, type: 'overtime', otType: 'normal', memberId: 8, memberName: '吴家希', team: '高曝团队', date: '2026-04-06', startTime: '18:00', endTime: '20:00', duration: 2, queueId: 36, queueName: '高曝-图文-笔记-驻场', volume: 630, efficiency: 315, project: '日常加班', status: 'approved', submittedAt: '2026-04-06 20:05', approvedAt: '2026-04-06 21:00', approver: '艾俊磊', remark: '' },
  { id: 4, type: 'injury', injuryType: 'physical', memberId: 7, memberName: '邵林', team: '高曝团队', date: '2026-04-05', startTime: '10:00', endTime: '12:00', duration: 2, queueId: 36, queueName: '高曝-图文-笔记-驻场', volume: 556, efficiency: 278, project: '', status: 'approved', submittedAt: '2026-04-05 12:10', approvedAt: '2026-04-05 14:00', approver: '艾俊磊', remark: '腰部不适', proof: '医疗证明.jpg' },
  { id: 5, type: 'overtime', otType: 'holiday', memberId: 13, memberName: '朱玲燕', team: '复审团队', date: '2026-04-04', startTime: '09:00', endTime: '18:00', duration: 9, queueId: 12, queueName: '复审-图文-笔记-驻场', volume: 1692, efficiency: 188, project: '清明节加班', status: 'approved', submittedAt: '2026-04-04 18:05', approvedAt: '2026-04-04 19:00', approver: '艾俊磊', remark: '' },
  { id: 6, type: 'overtime', otType: 'normal', memberId: 3, memberName: '连创奇', team: '高曝团队', date: '2026-04-08', startTime: '18:00', endTime: '21:00', duration: 3, queueId: 143, queueName: '高曝-视频-笔记-驻场', volume: 894, efficiency: 298, project: '视频积压', status: 'draft', submittedAt: null, approvedAt: null, approver: null, remark: '' },
  { id: 7, type: 'injury', injuryType: 'mental', memberId: 19, memberName: '方帅康', team: '复审团队', date: '2026-04-03', startTime: '14:00', endTime: '16:00', duration: 2, queueId: 91, queueName: '复审-视频-笔记-驻场', volume: 338, efficiency: 169, project: '', status: 'pending', submittedAt: '2026-04-03 16:15', approvedAt: null, approver: null, remark: '情绪疲劳', proof: '医疗证明2.jpg' },
  { id: 8, type: 'overtime', otType: 'urgent', memberId: 11, memberName: '陈芷珊', team: '高曝团队', date: '2026-04-08', startTime: '18:00', endTime: '22:00', duration: 4, queueId: 36, queueName: '高曝-图文-笔记-驻场', volume: 1276, efficiency: 319, project: '高曝积压紧急清理', status: 'pending', submittedAt: '2026-04-08 22:05', approvedAt: null, approver: null, remark: '' },
  { id: 9, type: 'overtime', otType: 'normal', memberId: 14, memberName: '谢博志', team: '复审团队', date: '2026-04-07', startTime: '18:00', endTime: '20:30', duration: 2.5, queueId: 12, queueName: '复审-图文-笔记-驻场', volume: 438, efficiency: 175, project: '复审日常加班', status: 'approved', submittedAt: '2026-04-07 20:35', approvedAt: '2026-04-07 21:30', approver: '艾俊磊', remark: '' },
  { id: 10, type: 'injury', injuryType: 'accident', memberId: 22, memberName: '伍照萱', team: '账号团队', date: '2026-04-06', startTime: '09:00', endTime: '11:00', duration: 2, queueId: 201, queueName: '账号-实名-驻场', volume: 290, efficiency: 145, project: '', status: 'approved', submittedAt: '2026-04-06 11:10', approvedAt: '2026-04-06 13:00', approver: '艾俊磊', remark: '手腕扭伤', proof: '医疗证明3.jpg' },
  { id: 11, type: 'overtime', otType: 'holiday', memberId: 25, memberName: '王荟蛟', team: 'POI团队', date: '2026-04-04', startTime: '09:00', endTime: '17:00', duration: 8, queueId: 301, queueName: 'POI-商户-驻场', volume: 784, efficiency: 98, project: '清明节POI加班', status: 'approved', submittedAt: '2026-04-04 17:05', approvedAt: '2026-04-04 18:00', approver: '艾俊磊', remark: '' },
  { id: 12, type: 'overtime', otType: 'normal', memberId: 10, memberName: '耿苏倩', team: '高曝团队', date: '2026-04-05', startTime: '18:00', endTime: '20:00', duration: 2, queueId: 143, queueName: '高曝-视频-笔记-驻场', volume: 616, efficiency: 308, project: '视频积压', status: 'rejected', submittedAt: '2026-04-05 20:05', approvedAt: null, approver: '艾俊磊', remark: '当日已有加班记录，不可重复申请' },
  { id: 13, type: 'overtime', otType: 'normal', memberId: 16, memberName: '邱英英', team: '复审团队', date: '2026-04-02', startTime: '18:00', endTime: '20:00', duration: 2, queueId: 12, queueName: '复审-图文-笔记-驻场', volume: 362, efficiency: 181, project: '日常加班', status: 'archived', submittedAt: '2026-04-02 20:05', approvedAt: '2026-04-02 21:00', approver: '艾俊磊', remark: '' },
  { id: 14, type: 'injury', injuryType: 'physical', memberId: 24, memberName: '乔明远', team: '账号团队', date: '2026-04-01', startTime: '14:00', endTime: '16:00', duration: 2, queueId: 201, queueName: '账号-实名-驻场', volume: 304, efficiency: 152, project: '', status: 'archived', submittedAt: '2026-04-01 16:10', approvedAt: '2026-04-01 17:30', approver: '艾俊磊', remark: '颈椎不适', proof: '医疗证明4.jpg' },
  { id: 15, type: 'overtime', otType: 'urgent', memberId: 26, memberName: '崔文武', team: 'POI团队', date: '2026-04-08', startTime: '17:30', endTime: '21:00', duration: 3.5, queueId: 301, queueName: 'POI-商户-驻场', volume: 368, efficiency: 105, project: 'POI专项核查', status: 'pending', submittedAt: '2026-04-08 21:05', approvedAt: null, approver: null, remark: '' },
];

// 审批记录
const APPROVAL_RECORDS = [
  // 待审批
  { id: 1, type: 'leave', applicant: '叶紫玲', applicantId: 5, team: '高曝团队', content: '年假申请 2026-04-10 至 2026-04-11（2天）', submittedAt: '2026-04-08 09:00', status: 'pending', context: { recentAttendance: '本月出勤18天', teamOnDuty: '当日在岗10人', efficiency: '297/天' } },
  { id: 2, type: 'overtime', applicant: '何妍', applicantId: 4, team: '高曝团队', content: '加班申请 2026-04-07 17:00-20:30（3.5h）紧急任务加班', submittedAt: '2026-04-07 20:35', status: 'pending', context: { recentOT: '近7天加班2次共5.5h', shift: 'A班 08:00-17:00', efficiency: '325/天' } },
  { id: 3, type: 'injury', applicant: '方帅康', applicantId: 19, team: '复审团队', content: '工损申请 2026-04-03 14:00-16:00（2h）心理工损', submittedAt: '2026-04-03 16:15', status: 'pending', context: { recentOT: '近7天加班1次共3h', shift: 'A班 08:00-17:00', efficiency: '169/天' } },
  { id: 5, type: 'overtime', applicant: '陈芷珊', applicantId: 11, team: '高曝团队', content: '加班申请 2026-04-08 18:00-22:00（4h）紧急任务加班', submittedAt: '2026-04-08 22:05', status: 'pending', context: { recentOT: '近7天加班1次共3h', shift: 'A班 08:00-17:00', efficiency: '319/天' } },
  { id: 6, type: 'overtime', applicant: '崔文武', applicantId: 26, team: 'POI团队', content: '加班申请 2026-04-08 17:30-21:00（3.5h）紧急任务加班', submittedAt: '2026-04-08 21:05', status: 'pending', context: { recentOT: '近7天加班0次', shift: 'A班 08:00-17:00', efficiency: '105/天' } },
  // 已处理
  { id: 7, type: 'overtime', applicant: '钱皓', applicantId: 2, team: '高曝团队', content: '加班申请 2026-04-07 18:00-21:00（3h）普通加班', submittedAt: '2026-04-07 21:05', status: 'approved', approvedAt: '2026-04-07 22:10', approver: '艾俊磊', context: { recentOT: '近7天加班1次共3h', shift: 'A班 08:00-17:00', efficiency: '312/天' } },
  { id: 8, type: 'overtime', applicant: '吴家希', applicantId: 8, team: '高曝团队', content: '加班申请 2026-04-06 18:00-20:00（2h）普通加班', submittedAt: '2026-04-06 20:05', status: 'approved', approvedAt: '2026-04-06 21:00', approver: '艾俊磊', context: { recentOT: '近7天加班1次共2h', shift: 'A班 08:00-17:00', efficiency: '315/天' } },
  { id: 9, type: 'injury', applicant: '邵林', applicantId: 7, team: '高曝团队', content: '工损申请 2026-04-05 10:00-12:00（2h）身体工损', submittedAt: '2026-04-05 12:10', status: 'approved', approvedAt: '2026-04-05 14:00', approver: '艾俊磊', context: { recentOT: '近7天加班0次', shift: 'A班 08:00-17:00', efficiency: '278/天' } },
  { id: 10, type: 'overtime', applicant: '耿苏倩', applicantId: 10, team: '高曝团队', content: '加班申请 2026-04-05 18:00-20:00（2h）普通加班', submittedAt: '2026-04-05 20:05', status: 'rejected', rejectReason: '当日已有加班记录，不可重复申请', context: { recentOT: '近7天加班1次共2h', shift: 'A班 08:00-17:00', efficiency: '308/天' } },
  { id: 11, type: 'overtime', applicant: '朱玲燕', applicantId: 13, team: '复审团队', content: '加班申请 2026-04-04 09:00-18:00（9h）节假日加班', submittedAt: '2026-04-04 18:05', status: 'approved', approvedAt: '2026-04-04 19:00', approver: '艾俊磊', context: { recentOT: '近7天加班0次', shift: '清明节值班', efficiency: '188/天' } },
  { id: 12, type: 'leave', applicant: '赵可欣', applicantId: 15, team: '复审团队', content: '病假申请 2026-04-03（1天）', submittedAt: '2026-04-03 08:30', status: 'approved', approvedAt: '2026-04-03 09:00', approver: '艾俊磊', context: { recentAttendance: '本月出勤15天', teamOnDuty: '当日在岗8人', efficiency: '192/天' } },
];

// 工作日志
const WORK_LOGS = [
  { id: 1,  module: '考勤系统',   action: '排班修改', operator: '艾俊磊', operatorMis: 'wb_aijunlei', target: '钱皓 2026-04-10 A班→B班', time: '2026-04-08 09:15', remark: '' },
  { id: 2,  module: '工时系统',  action: '审批通过', operator: '艾俊磊', operatorMis: 'wb_aijunlei', target: '钱皓 加班申请 #1', time: '2026-04-07 22:10', remark: '' },
  { id: 3,  module: '数据看板',   action: '数据导出', operator: '艾俊磊', operatorMis: 'wb_aijunlei', target: '高曝团队 2026-04 人效报表', time: '2026-04-08 08:30', remark: '' },
  { id: 4,  module: '考勤系统',   action: '审批通过', operator: '艾俊磊', operatorMis: 'wb_aijunlei', target: '吴家希 加班申请 #3', time: '2026-04-06 21:00', remark: '' },
  { id: 5,  module: '系统管理',   action: '权限变更', operator: '艾俊磊', operatorMis: 'wb_aijunlei', target: '新增人员 崔文武 审核员权限', time: '2026-04-05 10:00', remark: '' },
  { id: 6,  module: '工时系统',  action: '审批通过', operator: '艾俊磊', operatorMis: 'wb_aijunlei', target: '邵林 工损申请 #4', time: '2026-04-05 14:00', remark: '' },
  { id: 7,  module: '数据看板',   action: '队列配置', operator: '艾俊磊', operatorMis: 'wb_aijunlei', target: '修改队列 #36 人效系数 1.0→1.05', time: '2026-04-04 16:00', remark: '' },
  { id: 8,  module: '工时系统',  action: '审批通过', operator: '艾俊磊', operatorMis: 'wb_aijunlei', target: '朱玲燕 节假日加班申请 #5', time: '2026-04-04 19:00', remark: '' },
  { id: 9,  module: '工时系统',  action: '审批驳回', operator: '艾俊磊', operatorMis: 'wb_aijunlei', target: '耿苏倩 加班申请 #12：当日已有加班记录', time: '2026-04-05 20:30', remark: '' },
  { id: 10, module: '考勤系统',   action: '排班修改', operator: '艾俊磊', operatorMis: 'wb_aijunlei', target: '赵可欣 2026-04-03 A班→请假', time: '2026-04-03 09:00', remark: '' },
  { id: 11, module: '数据看板',   action: '数据导出', operator: '艾俊磊', operatorMis: 'wb_aijunlei', target: '全团队 2026-04 考勤报表', time: '2026-04-07 17:00', remark: '' },
  { id: 12, module: '系统管理',   action: '权限变更', operator: '艾俊磊', operatorMis: 'wb_aijunlei', target: '王荟蛟 审核员→管理员', time: '2026-04-03 11:00', remark: '' },
];

// 消息数据
const MESSAGES_DATA = [
  { id: 1,  type: 'approval', title: '您有1条加班申请待审批', desc: '何妍 提交了加班申请，请及时处理', time: '10分钟前', read: false, icon: '📋', iconClass: 'msg-icon-orange', action: 'approval' },
  { id: 2,  type: 'approval', title: '您有1条工损申请待审批', desc: '方帅康 提交了工损申请，请及时处理', time: '2小时前', read: false, icon: '🏥', iconClass: 'msg-icon-red', action: 'approval' },
  { id: 3,  type: 'approval', title: '您有1条请假申请待审批', desc: '叶紫玲 提交了年假申请 2026-04-10 至 2026-04-11', time: '3小时前', read: false, icon: '📋', iconClass: 'msg-icon-orange', action: 'approval' },
  { id: 5,  type: 'warning', title: '队列积压预警', desc: '高曝-图文-笔记-驻场 积压量已达4500，超过阈值', time: '3小时前', read: false, icon: '⚠️', iconClass: 'msg-icon-orange', action: 'dashboard' },
  { id: 6,  type: 'warning', title: '人员连续加班预警', desc: '何妍 近7天累计加班5.5h，接近预警阈值', time: '昨天 18:00', read: true, icon: '⚠️', iconClass: 'msg-icon-orange', action: 'overtime' },
  { id: 7,  type: 'result', title: '钱皓的加班申请已通过', desc: '加班申请 2026-04-07 18:00-21:00（3h）已审批通过', time: '昨天 22:10', read: true, icon: '✅', iconClass: 'msg-icon-green', action: 'worktime-data' },
  { id: 8,  type: 'result', title: '耿苏倩的加班申请已驳回', desc: '驳回原因：当日已有加班记录，不可重复申请', time: '昨天 20:30', read: true, icon: '❌', iconClass: 'msg-icon-red', action: 'worktime-data' },
  { id: 9,  type: 'daily', title: '今日人效排名推送', desc: '1.何妍 325 2.陈芷珊 319 3.吴家希 315...', time: '今天 09:00', read: false, icon: '📊', iconClass: 'msg-icon-blue', action: 'dashboard' },
  { id: 10, type: 'system', title: '系统通知：权限变更', desc: '王荟蛟 的权限已由审核员变更为管理员', time: '2026-04-03 11:00', read: true, icon: '🔑', iconClass: 'msg-icon-blue', action: 'settings' },
];
