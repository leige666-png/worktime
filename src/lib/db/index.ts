/**
 * 工时管理系统 - 本地数据库服务
 * 
 * 基于 localStorage 的完整数据持久化方案。
 * 设计要点：
 * 1. 统一的 CRUD 接口
 * 2. 事件系统实现模块联动
 * 3. 数据写入时自动触发关联更新（通知、统计等）
 * 4. 初始化时自动创建默认数据（默认类型等）
 */

import type {
  User,
  Group,
  OvertimeType,
  WorklossType,
  OvertimeRecord,
  WorklossRecord,
  Notification,
  PermissionRequest,
  TaskAssignment,
  SystemConfig,
} from '@/types/database';

// ========== 存储 Key 定义 ==========

const KEYS = {
  users: 'wt_users',
  groups: 'wt_groups',
  overtimeTypes: 'wt_overtime_types',
  worklossTypes: 'wt_workloss_types',
  overtimeRecords: 'wt_overtime_records',
  worklossRecords: 'wt_workloss_records',
  notifications: 'wt_notifications',
  permissionRequests: 'wt_permission_requests',
  tasks: 'wt_tasks',
  config: 'wt_config',
  session: 'wt_session',
  initialized: 'wt_initialized',
} as const;

// ========== 工具函数 ==========

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function now(): string {
  return new Date().toISOString();
}

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + '_worktime_secure_2024');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/** 计算两个时间字符串之间的分钟差 */
export function calcTimeDuration(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff < 0) diff += 24 * 60; // 跨天
  return diff;
}

/** 计算量级时长（分钟）= (workload / efficiency) * 60 */
export function calcWorkloadDuration(workload: number, efficiency: number): number {
  if (efficiency <= 0) return 0;
  return Math.round((workload / efficiency) * 60);
}

/** 计算偏差百分比 */
export function calcDeviation(timeDuration: number, calculatedDuration: number): number {
  if (calculatedDuration === 0) return timeDuration > 0 ? 100 : 0;
  return Math.round(Math.abs(timeDuration - calculatedDuration) / calculatedDuration * 100);
}

// ========== 通用存取方法 ==========

function getAll<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setAll<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
}

function getOne<T extends { id: string }>(key: string, id: string): T | null {
  const all = getAll<T>(key);
  return all.find(item => item.id === id) || null;
}

function addOne<T>(key: string, item: T): void {
  const all = getAll<T>(key);
  all.push(item);
  setAll(key, all);
}

function updateOne<T extends { id: string }>(key: string, id: string, updates: Partial<T>): T | null {
  const all = getAll<T>(key);
  const index = all.findIndex(item => item.id === id);
  if (index === -1) return null;
  all[index] = { ...all[index], ...updates };
  setAll(key, all);
  return all[index];
}

function deleteOne<T extends { id: string }>(key: string, id: string): boolean {
  const all = getAll<T>(key);
  const filtered = all.filter(item => item.id !== id);
  if (filtered.length === all.length) return false;
  setAll(key, filtered);
  return true;
}

// ========== 用户服务 ==========

export const userDB = {
  getAll: () => getAll<User>(KEYS.users),
  getById: (id: string) => getOne<User>(KEYS.users, id),
  getByMis: (mis: string): User | null => {
    const users = getAll<User>(KEYS.users);
    return users.find(u => u.mis === mis) || null;
  },
  add: (user: User) => addOne(KEYS.users, user),
  update: (id: string, updates: Partial<User>) => updateOne<User>(KEYS.users, id, updates),
  delete: (id: string) => deleteOne<User>(KEYS.users, id),
  getByGroup: (groupId: string): User[] => {
    return getAll<User>(KEYS.users).filter(u => u.groupId === groupId);
  },
  getActive: (): User[] => {
    return getAll<User>(KEYS.users).filter(u => u.status === 'active');
  },
  getAdmins: (): User[] => {
    return getAll<User>(KEYS.users).filter(u => u.role === 'admin' && u.status === 'active');
  },
};

// ========== 分组服务 ==========

export const groupDB = {
  getAll: () => getAll<Group>(KEYS.groups),
  getById: (id: string) => getOne<Group>(KEYS.groups, id),
  add: (group: Group) => addOne(KEYS.groups, group),
  update: (id: string, updates: Partial<Group>) => updateOne<Group>(KEYS.groups, id, updates),
  delete: (id: string) => {
    // 删除分组时，将该分组下的用户的 groupId 置空
    const users = getAll<User>(KEYS.users);
    const updated = users.map(u => u.groupId === id ? { ...u, groupId: null } : u);
    setAll(KEYS.users, updated);
    return deleteOne<Group>(KEYS.groups, id);
  },
  refreshMemberCount: (groupId: string) => {
    const count = getAll<User>(KEYS.users).filter(u => u.groupId === groupId && u.status === 'active').length;
    updateOne<Group>(KEYS.groups, groupId, { memberCount: count } as Partial<Group>);
  },
};

// ========== 加班类型服务 ==========

export const overtimeTypeDB = {
  getAll: () => getAll<OvertimeType>(KEYS.overtimeTypes),
  getActive: () => getAll<OvertimeType>(KEYS.overtimeTypes).filter(t => t.isActive),
  getById: (id: string) => getOne<OvertimeType>(KEYS.overtimeTypes, id),
  add: (type: OvertimeType) => addOne(KEYS.overtimeTypes, type),
  update: (id: string, updates: Partial<OvertimeType>) => updateOne<OvertimeType>(KEYS.overtimeTypes, id, updates),
  delete: (id: string) => deleteOne<OvertimeType>(KEYS.overtimeTypes, id),
};

// ========== 工损类型服务 ==========

export const worklossTypeDB = {
  getAll: () => getAll<WorklossType>(KEYS.worklossTypes),
  getActive: () => getAll<WorklossType>(KEYS.worklossTypes).filter(t => t.isActive),
  getById: (id: string) => getOne<WorklossType>(KEYS.worklossTypes, id),
  add: (type: WorklossType) => addOne(KEYS.worklossTypes, type),
  update: (id: string, updates: Partial<WorklossType>) => updateOne<WorklossType>(KEYS.worklossTypes, id, updates),
  delete: (id: string) => deleteOne<WorklossType>(KEYS.worklossTypes, id),
};

// ========== 通知服务（先定义，供记录服务引用） ==========

export const notificationDB = {
  getAll: () => getAll<Notification>(KEYS.notifications),
  getByUser: (userId: string) => getAll<Notification>(KEYS.notifications)
    .filter(n => n.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  getUnread: (userId: string) => getAll<Notification>(KEYS.notifications).filter(n => n.userId === userId && !n.isRead),
  getUnreadCount: (userId: string) => getAll<Notification>(KEYS.notifications).filter(n => n.userId === userId && !n.isRead).length,
  add: (notification: Notification) => addOne(KEYS.notifications, notification),
  markRead: (id: string) => updateOne<Notification>(KEYS.notifications, id, { isRead: true } as Partial<Notification>),
  markAllRead: (userId: string) => {
    const all = getAll<Notification>(KEYS.notifications);
    const updated = all.map(n => n.userId === userId ? { ...n, isRead: true } : n);
    setAll(KEYS.notifications, updated);
  },
  delete: (id: string) => deleteOne<Notification>(KEYS.notifications, id),
  clearAll: (userId: string) => {
    const all = getAll<Notification>(KEYS.notifications);
    setAll(KEYS.notifications, all.filter(n => n.userId !== userId));
  },
};

// ========== 加班记录服务 ==========

export const overtimeDB = {
  getAll: () => getAll<OvertimeRecord>(KEYS.overtimeRecords),
  getById: (id: string) => getOne<OvertimeRecord>(KEYS.overtimeRecords, id),
  getByUser: (userId: string) => getAll<OvertimeRecord>(KEYS.overtimeRecords)
    .filter(r => r.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  getPending: () => getAll<OvertimeRecord>(KEYS.overtimeRecords).filter(r => r.status === 'pending'),
  getApproved: () => getAll<OvertimeRecord>(KEYS.overtimeRecords).filter(r => r.status === 'approved'),
  getByDateRange: (start: string, end: string) => {
    return getAll<OvertimeRecord>(KEYS.overtimeRecords).filter(r => r.date >= start && r.date <= end);
  },
  getByGroup: (groupId: string) => {
    return getAll<OvertimeRecord>(KEYS.overtimeRecords).filter(r => r.groupId === groupId);
  },
  add: (record: OvertimeRecord) => {
    addOne(KEYS.overtimeRecords, record);
    // 联动：异常警报
    if (record.hasAnomaly) {
      const admins = userDB.getAdmins();
      admins.forEach(admin => {
        notificationDB.add({
          id: generateId(),
          userId: admin.id,
          title: '⚠️ 加班异常警报',
          content: `${record.userName} 的加班记录存在时长偏差（偏差${record.deviationPercent}%），时间计算${record.timeDuration}分钟 vs 量级计算${record.calculatedDuration}分钟。事项：${record.task}`,
          type: 'anomaly_alert',
          relatedId: record.id,
          isRead: false,
          createdAt: now(),
        });
      });
    }
    // 联动：待审批通知
    const reviewers = getAll<User>(KEYS.users).filter(
      u => (u.role === 'admin' || u.role === 'reviewer' || u.role === 'team_lead') && u.status === 'active' && u.id !== record.submittedBy
    );
    reviewers.forEach(reviewer => {
      notificationDB.add({
        id: generateId(),
        userId: reviewer.id,
        title: '新的加班申请待审批',
        content: `${record.userName} 提交了 ${record.date} 的加班申请（${record.typeName}：${record.task}），时长${Math.round(record.timeDuration / 60 * 10) / 10}小时，请审批。`,
        type: 'record_submitted',
        relatedId: record.id,
        isRead: false,
        createdAt: now(),
      });
    });
  },
  update: (id: string, updates: Partial<OvertimeRecord>) => updateOne<OvertimeRecord>(KEYS.overtimeRecords, id, updates),
  approve: (id: string, reviewerId: string, reviewerName: string, comment?: string) => {
    const record = updateOne<OvertimeRecord>(KEYS.overtimeRecords, id, {
      status: 'approved',
      reviewerId,
      reviewerName,
      reviewedAt: now(),
      reviewComment: comment || null,
    } as Partial<OvertimeRecord>);
    if (record) {
      notificationDB.add({
        id: generateId(),
        userId: record.userId,
        title: '✅ 加班申请已通过',
        content: `您 ${record.date} 的加班申请（${record.typeName}：${record.task}）已通过审批。${comment ? '审批意见：' + comment : ''}`,
        type: 'record_approved',
        relatedId: id,
        isRead: false,
        createdAt: now(),
      });
    }
    return record;
  },
  reject: (id: string, reviewerId: string, reviewerName: string, comment?: string) => {
    const record = updateOne<OvertimeRecord>(KEYS.overtimeRecords, id, {
      status: 'rejected',
      reviewerId,
      reviewerName,
      reviewedAt: now(),
      reviewComment: comment || '审批未通过',
    } as Partial<OvertimeRecord>);
    if (record) {
      notificationDB.add({
        id: generateId(),
        userId: record.userId,
        title: '❌ 加班申请被驳回',
        content: `您 ${record.date} 的加班申请（${record.typeName}：${record.task}）被驳回。原因：${comment || '未说明'}`,
        type: 'record_rejected',
        relatedId: id,
        isRead: false,
        createdAt: now(),
      });
    }
    return record;
  },
  delete: (id: string) => deleteOne<OvertimeRecord>(KEYS.overtimeRecords, id),
};

// ========== 工损记录服务 ==========

export const worklossDB = {
  getAll: () => getAll<WorklossRecord>(KEYS.worklossRecords),
  getById: (id: string) => getOne<WorklossRecord>(KEYS.worklossRecords, id),
  getByUser: (userId: string) => getAll<WorklossRecord>(KEYS.worklossRecords)
    .filter(r => r.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  getPending: () => getAll<WorklossRecord>(KEYS.worklossRecords).filter(r => r.status === 'pending'),
  getApproved: () => getAll<WorklossRecord>(KEYS.worklossRecords).filter(r => r.status === 'approved'),
  getByDateRange: (start: string, end: string) => {
    return getAll<WorklossRecord>(KEYS.worklossRecords).filter(r => r.date >= start && r.date <= end);
  },
  getByGroup: (groupId: string) => {
    return getAll<WorklossRecord>(KEYS.worklossRecords).filter(r => r.groupId === groupId);
  },
  add: (record: WorklossRecord) => {
    addOne(KEYS.worklossRecords, record);
    if (record.hasAnomaly) {
      const admins = userDB.getAdmins();
      admins.forEach(admin => {
        notificationDB.add({
          id: generateId(),
          userId: admin.id,
          title: '⚠️ 工损异常警报',
          content: `${record.userName} 的工损记录存在时长偏差（偏差${record.deviationPercent}%），时间计算${record.timeDuration}分钟 vs 量级计算${record.calculatedDuration}分钟。事项：${record.task}`,
          type: 'anomaly_alert',
          relatedId: record.id,
          isRead: false,
          createdAt: now(),
        });
      });
    }
    const reviewers = getAll<User>(KEYS.users).filter(
      u => (u.role === 'admin' || u.role === 'reviewer' || u.role === 'team_lead') && u.status === 'active' && u.id !== record.submittedBy
    );
    reviewers.forEach(reviewer => {
      notificationDB.add({
        id: generateId(),
        userId: reviewer.id,
        title: '新的工损申请待审批',
        content: `${record.userName} 提交了 ${record.date} 的工损申请（${record.typeName}：${record.task}），时长${Math.round(record.timeDuration / 60 * 10) / 10}小时，请审批。`,
        type: 'record_submitted',
        relatedId: record.id,
        isRead: false,
        createdAt: now(),
      });
    });
  },
  update: (id: string, updates: Partial<WorklossRecord>) => updateOne<WorklossRecord>(KEYS.worklossRecords, id, updates),
  approve: (id: string, reviewerId: string, reviewerName: string, comment?: string) => {
    const record = updateOne<WorklossRecord>(KEYS.worklossRecords, id, {
      status: 'approved',
      reviewerId,
      reviewerName,
      reviewedAt: now(),
      reviewComment: comment || null,
    } as Partial<WorklossRecord>);
    if (record) {
      notificationDB.add({
        id: generateId(),
        userId: record.userId,
        title: '✅ 工损申请已通过',
        content: `您 ${record.date} 的工损申请（${record.typeName}：${record.task}）已通过审批。${comment ? '审批意见：' + comment : ''}`,
        type: 'record_approved',
        relatedId: id,
        isRead: false,
        createdAt: now(),
      });
    }
    return record;
  },
  reject: (id: string, reviewerId: string, reviewerName: string, comment?: string) => {
    const record = updateOne<WorklossRecord>(KEYS.worklossRecords, id, {
      status: 'rejected',
      reviewerId,
      reviewerName,
      reviewedAt: now(),
      reviewComment: comment || '审批未通过',
    } as Partial<WorklossRecord>);
    if (record) {
      notificationDB.add({
        id: generateId(),
        userId: record.userId,
        title: '❌ 工损申请被驳回',
        content: `您 ${record.date} 的工损申请（${record.typeName}：${record.task}）被驳回。原因：${comment || '未说明'}`,
        type: 'record_rejected',
        relatedId: id,
        isRead: false,
        createdAt: now(),
      });
    }
    return record;
  },
  delete: (id: string) => deleteOne<WorklossRecord>(KEYS.worklossRecords, id),
};

// ========== 权限申请服务 ==========

export const permissionRequestDB = {
  getAll: () => getAll<PermissionRequest>(KEYS.permissionRequests),
  getPending: () => getAll<PermissionRequest>(KEYS.permissionRequests).filter(r => r.status === 'pending'),
  getByUser: (userId: string) => getAll<PermissionRequest>(KEYS.permissionRequests).filter(r => r.userId === userId),
  add: (request: PermissionRequest) => {
    addOne(KEYS.permissionRequests, request);
    // 联动：通知所有管理员
    const admins = userDB.getAdmins();
    admins.forEach(admin => {
      notificationDB.add({
        id: generateId(),
        userId: admin.id,
        title: '📋 新的权限申请',
        content: `${request.userName}（${request.userMis}）申请成为${request.requestedRole === 'admin' ? '管理员' : request.requestedRole === 'team_lead' ? '小组长' : '审核员'}。理由：${request.reason}`,
        type: 'permission_request',
        relatedId: request.id,
        isRead: false,
        createdAt: now(),
      });
    });
  },
  approve: (id: string, reviewerId: string, reviewerName: string, comment?: string) => {
    const request = getOne<PermissionRequest>(KEYS.permissionRequests, id);
    if (!request) return null;

    updateOne<PermissionRequest>(KEYS.permissionRequests, id, {
      status: 'approved',
      reviewerId,
      reviewerName,
      reviewComment: comment || null,
      reviewedAt: now(),
    } as Partial<PermissionRequest>);

    // 联动：更新用户角色和状态
    userDB.update(request.userId, { role: request.requestedRole, status: 'active' });

    // 联动：通知申请人
    notificationDB.add({
      id: generateId(),
      userId: request.userId,
      title: '✅ 权限申请已通过',
      content: `您的权限申请已通过，当前角色：${request.requestedRole === 'admin' ? '管理员' : request.requestedRole === 'team_lead' ? '小组长' : '审核员'}。${comment ? '备注：' + comment : ''}`,
      type: 'permission_approved',
      relatedId: id,
      isRead: false,
      createdAt: now(),
    });

    return request;
  },
  reject: (id: string, reviewerId: string, reviewerName: string, comment?: string) => {
    const request = getOne<PermissionRequest>(KEYS.permissionRequests, id);
    if (!request) return null;

    updateOne<PermissionRequest>(KEYS.permissionRequests, id, {
      status: 'rejected',
      reviewerId,
      reviewerName,
      reviewComment: comment || '申请未通过',
      reviewedAt: now(),
    } as Partial<PermissionRequest>);

    // 用户状态改为 active（普通成员）
    userDB.update(request.userId, { status: 'active', role: 'member' });

    notificationDB.add({
      id: generateId(),
      userId: request.userId,
      title: '❌ 权限申请被拒绝',
      content: `您的权限申请未通过。原因：${comment || '未说明'}。您当前为普通成员，可正常使用系统。`,
      type: 'permission_rejected',
      relatedId: id,
      isRead: false,
      createdAt: now(),
    });

    return request;
  },
};

// ========== 任务服务 ==========

export const taskDB = {
  getAll: () => getAll<TaskAssignment>(KEYS.tasks),
  getByUser: (userId: string) => getAll<TaskAssignment>(KEYS.tasks)
    .filter(t => t.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  getById: (id: string) => getOne<TaskAssignment>(KEYS.tasks, id),
  add: (task: TaskAssignment) => {
    addOne(KEYS.tasks, task);
    // 联动：通知被分配人
    notificationDB.add({
      id: generateId(),
      userId: task.userId,
      title: '📌 新任务分配',
      content: `${task.assignedByName} 给您分配了任务：${task.title}${task.dueDate ? '，截止日期：' + task.dueDate : ''}`,
      type: 'task_assigned',
      relatedId: task.id,
      isRead: false,
      createdAt: now(),
    });
  },
  update: (id: string, updates: Partial<TaskAssignment>) => updateOne<TaskAssignment>(KEYS.tasks, id, updates),
  delete: (id: string) => deleteOne<TaskAssignment>(KEYS.tasks, id),
};

// ========== 系统配置 ==========

export const configDB = {
  get: (): SystemConfig => {
    try {
      const raw = localStorage.getItem(KEYS.config);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return { anomalyThreshold: 20, systemName: '工时管理系统', allowSelfRegister: true };
  },
  set: (config: Partial<SystemConfig>) => {
    const current = configDB.get();
    localStorage.setItem(KEYS.config, JSON.stringify({ ...current, ...config }));
  },
};

// ========== Session 管理 ==========

interface SessionData {
  userId: string;
  mis: string;
  loginAt: string;
}

export const sessionDB = {
  get: (): SessionData | null => {
    try {
      const raw = localStorage.getItem(KEYS.session);
      if (!raw) return null;
      const session: SessionData = JSON.parse(raw);
      // 30天过期
      const loginAt = new Date(session.loginAt).getTime();
      if (Date.now() - loginAt > 30 * 24 * 60 * 60 * 1000) {
        sessionDB.clear();
        return null;
      }
      return session;
    } catch {
      return null;
    }
  },
  set: (userId: string, mis: string) => {
    localStorage.setItem(KEYS.session, JSON.stringify({ userId, mis, loginAt: now() }));
  },
  clear: () => {
    localStorage.removeItem(KEYS.session);
  },
};

// ========== 系统初始化 ==========

export function initializeSystem(): void {
  const isInitialized = localStorage.getItem(KEYS.initialized);
  if (isInitialized) return;

  // 创建默认加班类型
  const defaultOvertimeTypes: OvertimeType[] = [
    { id: generateId(), name: '队列加班', color: '#1890ff', defaultEfficiency: 30, description: '队列相关加班工作', isActive: true, sortOrder: 1, createdAt: now() },
    { id: generateId(), name: '标注加班', color: '#52c41a', defaultEfficiency: 25, description: '标注相关加班工作', isActive: true, sortOrder: 2, createdAt: now() },
    { id: generateId(), name: '其他加班', color: '#faad14', defaultEfficiency: 20, description: '其他类型加班', isActive: true, sortOrder: 3, createdAt: now() },
  ];
  setAll(KEYS.overtimeTypes, defaultOvertimeTypes);

  // 创建默认工损类型
  const defaultWorklossTypes: WorklossType[] = [
    { id: generateId(), name: '申述类', color: '#ff4d4f', defaultEfficiency: 10, description: '申述相关工损', isActive: true, sortOrder: 1, createdAt: now() },
    { id: generateId(), name: '试标类', color: '#fa8c16', defaultEfficiency: 15, description: '试标相关工损', isActive: true, sortOrder: 2, createdAt: now() },
    { id: generateId(), name: '客诉类', color: '#eb2f96', defaultEfficiency: 8, description: '客诉相关工损', isActive: true, sortOrder: 3, createdAt: now() },
    { id: generateId(), name: '巡检类', color: '#722ed1', defaultEfficiency: 12, description: '巡检相关工损', isActive: true, sortOrder: 4, createdAt: now() },
    { id: generateId(), name: '培训类', color: '#13c2c2', defaultEfficiency: 20, description: '培训相关工损', isActive: true, sortOrder: 5, createdAt: now() },
    { id: generateId(), name: '会议类', color: '#2f54eb', defaultEfficiency: 0, description: '会议相关工损', isActive: true, sortOrder: 6, createdAt: now() },
    { id: generateId(), name: '其他类', color: '#8c8c8c', defaultEfficiency: 10, description: '其他类型工损', isActive: true, sortOrder: 7, createdAt: now() },
  ];
  setAll(KEYS.worklossTypes, defaultWorklossTypes);

  // 创建默认系统配置
  localStorage.setItem(KEYS.config, JSON.stringify({
    anomalyThreshold: 20,
    systemName: '工时管理系统',
    allowSelfRegister: true,
  }));

  // 标记已初始化
  localStorage.setItem(KEYS.initialized, 'true');
}
