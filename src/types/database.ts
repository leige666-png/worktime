/**
 * 工时管理系统 - 数据模型定义
 * 
 * 设计原则：
 * 1. 所有实体都有 id、createdAt 字段
 * 2. 关联关系通过 ID 引用，查询时再组装
 * 3. 状态字段使用联合类型，确保类型安全
 * 4. 计算字段在写入时就计算好，避免读取时重复计算
 */

// ========== 基础类型 ==========

/** 用户角色等级：admin > team_lead > reviewer > member */
export type UserRole = 'admin' | 'team_lead' | 'reviewer' | 'member';

/** 角色中文映射 */
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: '管理员',
  team_lead: '小组长',
  reviewer: '审核员',
  member: '普通成员',
};

/** 角色权限等级（数字越大权限越高） */
export const ROLE_LEVELS: Record<UserRole, number> = {
  admin: 100,
  team_lead: 80,
  reviewer: 60,
  member: 10,
};

// ========== 用户 ==========

export interface User {
  id: string;
  mis: string;
  name: string;
  avatar: string | null;
  role: UserRole;
  groupId: string | null;
  status: 'active' | 'pending_approval'; // pending_approval = 首次登录待审批
  passwordHash: string;
  createdAt: string;
  lastLogin: string | null;
  loginCount: number;
}

// ========== 权限申请 ==========

export interface PermissionRequest {
  id: string;
  userId: string;
  userName: string;
  userMis: string;
  requestedRole: UserRole;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewerId: string | null;
  reviewerName: string | null;
  reviewComment: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

// ========== 分组 ==========

export interface Group {
  id: string;
  name: string;
  description: string | null;
  color: string;
  leaderId: string | null;
  leaderName: string | null;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

// ========== 加班类型 ==========

export interface OvertimeType {
  id: string;
  name: string;
  color: string;
  defaultEfficiency: number; // 默认人效（件/小时）
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

// ========== 工损类型 ==========

export interface WorklossType {
  id: string;
  name: string;
  color: string;
  defaultEfficiency: number;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

// ========== 加班记录 ==========

export interface OvertimeRecord {
  id: string;
  // 人员信息
  userId: string;
  userName: string;
  userMis: string;
  groupId: string | null;
  groupName: string | null;
  // 时间信息
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  /** 时间差计算的时长（分钟）= endTime - startTime */
  timeDuration: number;
  // 类型与内容
  typeId: string;
  typeName: string;
  task: string; // 加班事项（具体内容名称）
  // 量化信息
  /** 人效（件/小时），由申请人填写 */
  efficiency: number;
  /** 加班量级（件数），由申请人填写 */
  workload: number;
  /** 量级计算的时长（分钟）= (workload / efficiency) * 60 */
  calculatedDuration: number;
  // 异常检测
  /** 两种时长是否存在异常偏差 */
  hasAnomaly: boolean;
  /** 异常原因描述 */
  anomalyReason: string | null;
  /** 偏差百分比 = |timeDuration - calculatedDuration| / calculatedDuration * 100 */
  deviationPercent: number;
  // 证明材料
  proof: string | null; // 证明描述或文件名
  // 审批流
  status: 'pending' | 'approved' | 'rejected';
  submittedBy: string; // 提交人ID（管理员可代提交）
  submittedByName: string;
  reviewerId: string | null;
  reviewerName: string | null;
  reviewedAt: string | null;
  reviewComment: string | null;
  // 时间戳
  createdAt: string;
  updatedAt: string;
}

// ========== 工损记录 ==========

export interface WorklossRecord {
  id: string;
  // 人员信息
  userId: string;
  userName: string;
  userMis: string;
  groupId: string | null;
  groupName: string | null;
  // 时间信息
  date: string;
  startTime: string;
  endTime: string;
  timeDuration: number;
  // 类型与内容
  typeId: string;
  typeName: string;
  task: string; // 工损事项
  // 量化信息
  efficiency: number;
  workload: number;
  calculatedDuration: number;
  // 异常检测
  hasAnomaly: boolean;
  anomalyReason: string | null;
  deviationPercent: number;
  // 证明材料
  proof: string | null;
  // 审批流
  status: 'pending' | 'approved' | 'rejected';
  submittedBy: string;
  submittedByName: string;
  reviewerId: string | null;
  reviewerName: string | null;
  reviewedAt: string | null;
  reviewComment: string | null;
  // 时间戳
  createdAt: string;
  updatedAt: string;
}

// ========== 通知 ==========

export type NotificationType =
  | 'permission_request'   // 有人申请权限（发给管理员）
  | 'permission_approved'  // 权限申请通过（发给申请人）
  | 'permission_rejected'  // 权限申请拒绝（发给申请人）
  | 'record_submitted'     // 有人提交记录待审批（发给审核员/管理员）
  | 'record_approved'      // 记录审批通过（发给提交人）
  | 'record_rejected'      // 记录审批拒绝（发给提交人）
  | 'anomaly_alert'        // 异常警报（发给管理员）
  | 'task_assigned'        // 任务分配（发给被分配人）
  | 'system';             // 系统通知

export interface Notification {
  id: string;
  userId: string; // 接收人
  title: string;
  content: string;
  type: NotificationType;
  relatedId: string | null; // 关联的记录/申请ID
  isRead: boolean;
  createdAt: string;
}

// ========== 任务分配 ==========

export interface TaskAssignment {
  id: string;
  userId: string; // 被分配人
  userName: string;
  title: string;
  description: string | null;
  assignedBy: string; // 分配人ID
  assignedByName: string;
  status: 'pending' | 'in_progress' | 'completed';
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

// ========== 系统配置 ==========

export interface SystemConfig {
  /** 异常偏差阈值（百分比），超过此值触发警报 */
  anomalyThreshold: number;
  /** 系统名称 */
  systemName: string;
  /** 是否允许自主注册 */
  allowSelfRegister: boolean;
}

// ========== 统计相关 ==========

export interface MonthlyStats {
  userId: string;
  userName: string;
  groupName: string | null;
  year: number;
  month: number;
  totalOvertimeMinutes: number;
  totalWorklossMinutes: number;
  overtimeCount: number;
  worklossCount: number;
  anomalyCount: number;
}

export interface GroupStats {
  groupId: string;
  groupName: string;
  totalOvertimeMinutes: number;
  totalWorklossMinutes: number;
  memberCount: number;
  recordCount: number;
}
