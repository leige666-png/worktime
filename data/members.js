// 人员数据（统一数据源）
// daxiangId: 大象 user-id，用于直接发送消息
// avatar: 大象真实头像 URL（api.neixin.cn 或 s3plus-img.meituan.net）
// r133: 移除 group 字段，团队统一由 team 字段管理，管理员通过"团队管理"维护
const MEMBERS_DATA = [
  // 负责人
  { id: 1, name: '艾俊磊', mis: 'wb_aijunlei', daxiangId: '3397720408', team: '管理层', role: 'admin',
    avatar: 'https://api.neixin.cn/xs/api/image/image_1898903482997178377/1898903483026337821?t=THUMB', efficiency: 0, quality: 0,
    managedTeams: [], excludeFromSchedule: false },
  // 高曝团队
  { id: 2, name: '钱皓', mis: 'wb_qianhao02', daxiangId: '2939578067', team: '高曝团队', role: 'reviewer',
    avatar: 'https://api.neixin.cn/xs/api/profile/image_1769532351505342517/1769532351518019626?t=THUMB_PROFILE', efficiency: 312, quality: 98.5 },
  { id: 3, name: '连创奇', mis: 'wb_lianchuangqi', daxiangId: '2939491131', team: '高曝团队', role: 'reviewer',
    avatar: 'https://api.neixin.cn/xs/api/image/image_1769531251997999169/1769531252006391848?t=THUMB', efficiency: 298, quality: 97.8 },
  { id: 4, name: '何妍', mis: 'wb_heyan03', daxiangId: '1930786713', team: '高曝团队', role: 'reviewer',
    avatar: 'https://s3plus-img.meituan.net/v1/mss_491cda809310478f898d7e10a9bb68ec/profile12/0c84a483-e8e0-46b6-9063-380a63b6cf9d_200_200', efficiency: 325, quality: 99.1 },
  { id: 5, name: '叶紫玲', mis: 'wb_yeziling', daxiangId: '1930785912', team: '高曝团队', role: 'reviewer',
    avatar: 'https://api.neixin.cn/xs/api/image/image_1859900921795604579/1859900921820647488?t=THUMB', efficiency: 287, quality: 96.9 },
  { id: 6, name: '董皓旸', mis: 'wb_donghaoyang', daxiangId: '2939435860', team: '高曝团队', role: 'reviewer',
    avatar: '', efficiency: 301, quality: 98.2 },
  { id: 7, name: '邵林', mis: 'wb_shaolin02', daxiangId: '2680197876', team: '高曝团队', role: 'reviewer',
    avatar: 'https://s3plus-img.meituan.net/v1/mss_491cda809310478f898d7e10a9bb68ec/profile13/ae7d3e1a-12c7-4780-ba99-3ee1fbbc5d76', efficiency: 278, quality: 97.3 },
  { id: 8, name: '吴家希', mis: 'wb_wujiaxi', daxiangId: '3503887259', team: '高曝团队', role: 'reviewer',
    avatar: 'https://api.neixin.cn/xs/api/profile/image_1921738264956977244/1921738264982143053?t=THUMB_PROFILE', efficiency: 315, quality: 98.7 },
  { id: 9, name: '沈顺发', mis: 'wb_shenshunfa', daxiangId: '1925894881', team: '高曝团队', role: 'reviewer',
    avatar: '', efficiency: 292, quality: 97.1 },
  { id: 10, name: '耿苏倩', mis: 'wb_gengsuqian', daxiangId: '2251146237', team: '高曝团队', role: 'reviewer',
    avatar: 'https://s3plus-img.meituan.net/v1/mss_491cda809310478f898d7e10a9bb68ec/profile6/e6a71469-582e-4989-9335-afe8ae1ce4a3_200_200', efficiency: 308, quality: 98.4 },
  { id: 11, name: '陈芷珊', mis: 'wb_chenzhishan', daxiangId: '3514475608', team: '高曝团队', role: 'reviewer',
    avatar: 'https://api.neixin.cn/xs/api/profile/image_1924273852470313010/1924273852495048797?t=THUMB_PROFILE', efficiency: 319, quality: 99.0 },
  { id: 12, name: '王颖', mis: 'wb_wangying48', daxiangId: '3504145145', team: '高曝团队', role: 'reviewer',
    avatar: 'https://api.neixin.cn/xs/api/profile/image_1921738059415175243/1921738059440476216?t=THUMB_PROFILE', efficiency: 295, quality: 97.6 },
  // 复审团队
  { id: 13, name: '朱玲燕', mis: 'wb_zhulingyan', daxiangId: '2644332117', team: '复审团队', role: 'reviewer',
    avatar: 'https://s3plus-img.meituan.net/v1/mss_491cda809310478f898d7e10a9bb68ec/profile4/44b4b9ba-c05e-47ee-8823-5af3404331b1_200_200', efficiency: 188, quality: 98.9 },
  { id: 14, name: '谢博志', mis: 'wb_xiebozhi', daxiangId: '1925893996', team: '复审团队', role: 'reviewer',
    avatar: 'https://s3plus-img.meituan.net/v1/mss_491cda809310478f898d7e10a9bb68ec/profile8/1b64730c-0bf2-466b-ab88-b028e10f260a', efficiency: 175, quality: 97.5 },
  { id: 15, name: '赵可欣', mis: 'wb_zhaokexin', daxiangId: '3358936880', team: '复审团队', role: 'reviewer',
    avatar: 'https://api.neixin.cn/xs/api/image/image_1888758814128906258/1888758814158278724?t=THUMB', efficiency: 192, quality: 99.2 },
  { id: 16, name: '邱英英', mis: 'wb_qiuyingying', daxiangId: '2485316658', team: '复审团队', role: 'reviewer',
    avatar: 'https://api.neixin.cn/xs/api/image/image_2031260876058144861/2031260876078465088?t=THUMB', efficiency: 181, quality: 98.1 },
  { id: 17, name: '姚芳', mis: 'wb_yaofang', daxiangId: '3418254114', team: '复审团队', role: 'reviewer',
    avatar: 'https://api.neixin.cn/xs/api/profile/image_1902164053368471596/1902164053389279276?t=THUMB_PROFILE', efficiency: 196, quality: 99.4 },
  // 黄义坤已离职，已删除
  { id: 19, name: '方帅康', mis: 'wb_fangshuaikang', daxiangId: '2991330690', team: '复审团队', role: 'reviewer',
    avatar: 'https://api.neixin.cn/xs/api/image/image_1794922639526551575/1794922639539241019?t=THUMB', efficiency: 184, quality: 97.9 },
  { id: 20, name: '卞民杰', mis: 'wb_bianminjie', daxiangId: '2251129041', team: '复审团队', role: 'reviewer',
    avatar: 'https://s3plus-img.meituan.net/v1/mss_491cda809310478f898d7e10a9bb68ec/profile13/238ef73f-aade-4f7e-b09f-4c8cdd03906c_200_200', efficiency: 178, quality: 98.3 },
  { id: 21, name: '王萌萌', mis: 'wb_wangmengmeng02', daxiangId: '2251146262', team: '复审团队', role: 'reviewer',
    avatar: 'https://s3plus-img.meituan.net/v1/mss_491cda809310478f898d7e10a9bb68ec/profile12/6d78b612-7e15-4717-9110-45f9886c7bdb_200_200', efficiency: 190, quality: 98.6 },
  // 账号团队
  { id: 22, name: '伍照萱', mis: 'wb_wuzhaoxuan', daxiangId: '2939605373', team: '账号团队', role: 'reviewer',
    avatar: 'https://api.neixin.cn/xs/api/image/image_1942843198943567924/1942843198964568138?t=THUMB', efficiency: 145, quality: 97.2 },
  { id: 23, name: '朱晟丰', mis: 'wb_zhushengfeng', daxiangId: '2939537632', team: '账号团队', role: 'reviewer',
    avatar: 'https://api.neixin.cn/xs/api/profile/image_1769529810461794368/1769529810478739473?t=THUMB_PROFILE', efficiency: 138, quality: 96.5 },
  { id: 24, name: '乔明远', mis: 'wb_qiaomingyuan', daxiangId: '2939577853', team: '账号团队', role: 'reviewer',
    avatar: 'https://api.neixin.cn/xs/api/image/image_1905557534682083330/1905557534690545678?t=THUMB', efficiency: 152, quality: 98.0 },
  // POI团队
  { id: 25, name: '王荟蛟', mis: 'wb_wanghuijiao', daxiangId: '2251227662', team: 'POI团队', role: 'reviewer',
    avatar: 'https://api.neixin.cn/xs/api/image/image_1903995253024178239/1903995253057863696?t=THUMB', efficiency: 98, quality: 97.8 },
  { id: 26, name: '崔文武', mis: 'wb_cuiwenwu02', daxiangId: '2197501295', team: 'POI团队', role: 'reviewer',
    avatar: 'https://s3plus-img.meituan.net/v1/mss_491cda809310478f898d7e10a9bb68ec/profile9/8287619b-1c99-4679-9737-3dfaa37541c4', efficiency: 105, quality: 98.5 },
];

// r133: TEAMS 为默认团队列表（硬编码），CUSTOM_TEAMS 为管理员可维护的动态团队列表
const TEAMS = ['高曝团队', '复审团队', '账号团队', 'POI团队'];

// 自定义团队（管理员可增删改，由 storage.js 持久化）
// 结构：[{ id: string, name: string, color: string }]
const _TEAM_COLORS = ['#3370FF', '#00B365', '#FA8C16', '#722ED1', '#F5222D', '#13C2C2', '#EB2F96', '#52C41A'];
let CUSTOM_TEAMS = TEAMS.map((t, i) => ({ id: 'tm_' + (i + 1), name: t, color: _TEAM_COLORS[i % _TEAM_COLORS.length] }));

// 获取所有团队名称列表（供下拉选择用）
function getTeamNames() {
  return CUSTOM_TEAMS.map(t => t.name);
}
// 根据团队名获取颜色
function getTeamColor(name) {
  const t = CUSTOM_TEAMS.find(t => t.name === name);
  return t ? t.color : '#999';
}

// r134: 角色显示名称映射（3级角色体系，移除 system_owner）
const ROLES = {
  admin:        '管理员',
  leader:       '小组长',
  reviewer:     '审核员',
};
