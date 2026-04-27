// 队列数据
// status: 'active' | 'paused'  —— 队列启用/暂停状态
// project: 项目类型, owner: 负责人, requirement: 要求(日清/时清/周清等)
// effTarget: 人效目标, effActual: 人效实际达成, realTarget: 时效(字符串类型，如 '24h'/'0.5h'/'周清')
// dailyVolume: 日均进审量级, effCoef: 队列系数, auditTags: 审核标签
// inReviewTime: 进审时间, enableWarning: 是否加入预警(yes/no), warningTime: 预警时间
// remark: 备注信息
const QUEUES_DATA = [
  // ========== 复审团队 ==========
  { id: 182, name: '用户投诉-图文-笔记-负反馈&投诉-复审', team: '复审团队', project: '客诉', owner: '吴玥/郭闯', requirement: '日清', effCoef: 1, effTarget: 800, effActual: 792, realTarget: '24h', dailyVolume: 526, backlog: 0, inReview: 0, outReview: 0, auditTags: '画风标签', inReviewTime: '实时', enableWarning: 'no', warningTime: '', remark: '', status: 'active' },
  { id: 183, name: '用户投诉-视频-笔记-负反馈&投诉-复审', team: '复审团队', project: '客诉', owner: '骆依泓', requirement: '日清', effCoef: 1.38, effTarget: 600, effActual: 851, realTarget: '24h', dailyVolume: 212, backlog: 0, inReview: 0, outReview: 0, auditTags: '画风标签', inReviewTime: '实时', enableWarning: 'no', warningTime: '', remark: '', status: 'active' },
  { id: 91, name: '复审-视频-笔记-驻场', team: '复审团队', project: '笔记', owner: '吴玥/郭闯', requirement: '时清', effCoef: 1.38, effTarget: 800, effActual: 946, realTarget: '0.5h', dailyVolume: 1412, backlog: 0, inReview: 0, outReview: 0, auditTags: '医美移交判断,画风标签,营销分级标签', inReviewTime: '实时', enableWarning: 'yes', warningTime: '60min/1条', remark: '', status: 'active' },
  { id: 12, name: '复审-图文-笔记-驻场', team: '复审团队', project: '笔记', owner: '骆依泓', requirement: '时清', effCoef: 1, effTarget: 1000, effActual: 1200, realTarget: '0.5h', dailyVolume: 1664, backlog: 0, inReview: 0, outReview: 0, auditTags: '医美移交判断,画风标签,营销分级标签', inReviewTime: '实时', enableWarning: 'yes', warningTime: '60min/1条', remark: '', status: 'active' },
  { id: 187, name: '复审-图文-笔记-模型预测结果测试', team: '复审团队', project: '笔记', owner: '骆依泓', requirement: '时清', effCoef: 1, effTarget: 1000, effActual: 1221, realTarget: '0.6h', dailyVolume: 1683, backlog: 0, inReview: 0, outReview: 0, auditTags: '医美移交判断,画风标签,营销分级标签', inReviewTime: '实时', enableWarning: 'yes', warningTime: '60min/2条', remark: '', status: 'active' },
  { id: 197, name: '评估-视频-笔记-复审机审评估', team: '复审团队', project: '评估', owner: '徐夕画', requirement: '周清', effCoef: 1.38, effTarget: 800, effActual: 789, realTarget: '周清', dailyVolume: 41, backlog: 0, inReview: 0, outReview: 0, auditTags: '画风标签', inReviewTime: '每天上午8点', enableWarning: 'no', warningTime: '', remark: '', status: 'active' },
  { id: 196, name: '评估-图文-笔记-复审机审评估', team: '复审团队', project: '评估', owner: '徐夕画', requirement: '周清', effCoef: 1, effTarget: 1000, effActual: 1060, realTarget: '周清', dailyVolume: 458, backlog: 0, inReview: 0, outReview: 0, auditTags: '画风标签', inReviewTime: '', enableWarning: 'no', warningTime: '', remark: '', status: 'active' },
  { id: 374, name: '初审-兴趣poi账号专审(AIGC)-复审', team: '复审团队', project: '/', owner: '骆依泓', requirement: '日清', effCoef: 6.7, effTarget: 200, effActual: 200, realTarget: null, dailyVolume: 350, backlog: 0, inReview: 0, outReview: 0, auditTags: '', inReviewTime: '', enableWarning: 'no', warningTime: '', remark: '2026年2月6号高曝团队承接审核（爬坡至人效300）。2026年3月12号转交给复审团队（由人效200（爬坡当中））', status: 'active' },
  // ========== 高曝团队 ==========
  { id: 36, name: '高曝-图文-笔记-驻场', team: '高曝团队', project: '笔记', owner: '骆依泓', requirement: '时清', effCoef: 1.2, effTarget: 600, effActual: 698, realTarget: '0.5h', dailyVolume: 357, backlog: 0, inReview: 0, outReview: 0, auditTags: '内容心智标签,画风标签,营销分级标签', inReviewTime: '实时', enableWarning: 'yes', warningTime: '20min/1条', remark: '', status: 'active' },
  { id: 143, name: '高曝-视频-笔记-驻场', team: '高曝团队', project: '笔记', owner: '骆依泓', requirement: '时清', effCoef: 1.5, effTarget: 600, effActual: 522, realTarget: '0.5h', dailyVolume: 110, backlog: 0, inReview: 0, outReview: 0, auditTags: '内容心智标签,画风标签,营销分级标签', inReviewTime: '实时', enableWarning: 'yes', warningTime: '20min/2条', remark: '', status: 'active' },
  { id: 111, name: '评估-图文-笔记-内容治理大盘评估', team: '高曝团队', project: '评估', owner: '吴玥', requirement: '日清', effCoef: 1.2, effTarget: 600, effActual: 588, realTarget: '24h', dailyVolume: 1200, backlog: 0, inReview: 0, outReview: 0, auditTags: '画风标签,营销分级标签,情感分级标签', inReviewTime: '10点-12点', enableWarning: 'no', warningTime: '', remark: '', status: 'active' },
  { id: 145, name: '评估-视频-笔记-内容治理大盘评估', team: '高曝团队', project: '评估', owner: '吴玥', requirement: '日清', effCoef: 1.2, effTarget: 600, effActual: 420, realTarget: '24h', dailyVolume: 200, backlog: 0, inReview: 0, outReview: 0, auditTags: '画风标签,营销分级标签,情感分级标签', inReviewTime: '10点-14点', enableWarning: 'no', warningTime: '', remark: '', status: 'active' },
  { id: 190, name: '评估-图文-笔记-低质标签评估-高曝', team: '高曝团队', project: '评估', owner: '吴玥', requirement: '周清', effCoef: 1.34, effTarget: 670, effActual: 815, realTarget: '周清', dailyVolume: 857, backlog: 0, inReview: 0, outReview: 0, auditTags: '画风标签,营销分级标签', inReviewTime: '周一下午进审，每次进6000', enableWarning: 'no', warningTime: '', remark: '', status: 'active' },
  { id: 79, name: '用户申诉-其他-攻略-申诉-高曝', team: '高曝团队', project: '客诉', owner: '/', requirement: '周清', effCoef: 1.2, effTarget: 670, effActual: null, realTarget: '日清', dailyVolume: 1, backlog: 0, inReview: 0, outReview: 0, auditTags: '画风标签,分发判断', inReviewTime: '实时', enableWarning: 'no', warningTime: '', remark: '', status: 'active' },
  { id: 78, name: '用户申诉-图文-笔记-申诉-高曝', team: '高曝团队', project: '客诉', owner: '/', requirement: '周清', effCoef: 1.2, effTarget: 670, effActual: 346, realTarget: '日清', dailyVolume: 46, backlog: 0, inReview: 0, outReview: 0, auditTags: '画风标签,分发判断', inReviewTime: '实时', enableWarning: 'no', warningTime: '', remark: '', status: 'active' },
  { id: 141, name: '用户申诉-视频-笔记-申诉-高曝', team: '高曝团队', project: '客诉', owner: '/', requirement: '周清', effCoef: 1, effTarget: 600, effActual: 351, realTarget: '日清', dailyVolume: 4, backlog: 0, inReview: 0, outReview: 0, auditTags: '画风标签,分发判断', inReviewTime: '实时', enableWarning: 'no', warningTime: '', remark: '', status: 'active' },
  { id: 221, name: '评估-图文-笔记-发布意图标签评估-高曝', team: '高曝团队', project: '评估', owner: '程文文', requirement: '周三清空', effCoef: 1, effTarget: 670, effActual: 961, realTarget: '周清', dailyVolume: 300, backlog: 0, inReview: 0, outReview: 0, auditTags: '耗流量养号', inReviewTime: '周一上午进审', enableWarning: 'no', warningTime: '', remark: '', status: 'active' },
  { id: 315, name: '用户投诉-图文-笔记-高投负反馈&投诉-高曝', team: '高曝团队', project: '申诉', owner: '周心悦', requirement: '日清', effCoef: 1.5, effTarget: 650, effActual: 889, realTarget: '24h', dailyVolume: 56, backlog: 0, inReview: 0, outReview: 0, auditTags: '内容心智标签,画风标签', inReviewTime: '每天上午8点', enableWarning: 'no', warningTime: '', remark: '', status: 'active' },
  { id: 316, name: '用户投诉-视频-笔记-高投负反馈&投诉-高曝', team: '高曝团队', project: '申诉', owner: '周心悦', requirement: '日清', effCoef: 1.2, effTarget: 600, effActual: 745, realTarget: '24h', dailyVolume: 122, backlog: 0, inReview: 0, outReview: 0, auditTags: '内容心智标签,画风标签', inReviewTime: '', enableWarning: 'no', warningTime: '', remark: '', status: 'active' },
  // ========== 账号团队 ==========
  { id: 8, name: '评估-大盘账号评估', team: '账号团队', project: '账号', owner: '', requirement: '', effCoef: null, effTarget: null, effActual: null, realTarget: '周三晚清空', dailyVolume: null, backlog: 0, inReview: 0, outReview: 0, auditTags: '账号判断,账号营销属性', inReviewTime: '周一进审', enableWarning: 'no', warningTime: '', remark: '', status: 'active' },
  { id: 370, name: '初审-兴趣POI父子关系干预-企晟', team: '账号团队', project: '账号', owner: '', requirement: '', effCoef: null, effTarget: null, effActual: null, realTarget: null, dailyVolume: null, backlog: 0, inReview: 0, outReview: 0, auditTags: '', inReviewTime: '', enableWarning: 'no', warningTime: '', remark: '', status: 'active' },
  // ========== POI团队 ==========
  { id: 245, name: '用户投诉-兴趣POI投诉-复审', team: 'POI团队', project: '/', owner: '蔡昕然', requirement: '周清', effCoef: null, effTarget: 700, effActual: null, realTarget: '0.5h', dailyVolume: null, backlog: 0, inReview: 0, outReview: 0, auditTags: '共建标签', inReviewTime: '实时', enableWarning: 'yes', warningTime: '', remark: '', status: 'active' },
  { id: 246, name: '初审-报错审核', team: 'POI团队', project: '/', owner: '蔡昕然', requirement: '周清', effCoef: null, effTarget: 700, effActual: null, realTarget: '0.5h', dailyVolume: null, backlog: 0, inReview: 0, outReview: 0, auditTags: '报错标签', inReviewTime: '实时', enableWarning: 'yes', warningTime: '', remark: '', status: 'active' },
];

function getQueueById(id) { return QUEUES_DATA.find(q => q.id === id); }
function getQueuesByTeam(team) { return QUEUES_DATA.filter(q => q.team === team); }
function getBacklogLevel(backlog) {
  if (backlog > 3000) return 'high';
  if (backlog > 1000) return 'mid';
  return 'low';
}
