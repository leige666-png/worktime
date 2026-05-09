/**
 * 工时管理系统 - 远程数据库服务
 * 
 * 基于 GitHub API 的共享数据持久化方案。
 * 所有用户读写同一份远程数据，实现多人协作。
 * 
 * 设计要点：
 * 1. 统一的 CRUD 接口（异步）
 * 2. 写入时自动触发关联更新（通知等）
 * 3. 本地 session 仅存储当前登录状态
 * 4. 初始化时自动创建默认数据
 */

import { readFile, writeFile, ensureDataBranch, invalidateCache } from './github-storage';
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

// ========== 文件名定义 ==========

const FILES = {
  users: 'users.json',
  groups: 'groups.json',
  overtimeTypes: 'overtime-types.json',
  worklossTypes: 'workloss-types.json',
  overtimeRecords: 'overtime-records.json',
  worklossRecords: 'workloss-records.json',
  notifications: 'notifications.json',
  permissionRequests: 'permission-requests.json',
  tasks: 'tasks.json',
  config: 'config.json',
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
  if (diff < 0) diff += 24 * 60;
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

// ========== 用户服务 ==========

export const userDB = {
  getAll: () => readFile<User>(FILES.users),
  getById: async (id: string): Promise<User | null> => {
    const users = await readFile<User>(FILES.users);
    return users.find(u => u.id === id) || null;
  },
  getByMis: async (mis: string): Promise<User | null> => {
    const users = await readFile<User>(FILES.users);
    return users.find(u => u.mis === mis) || null;
  },
  add: async (user: User) => {
    const users = await readFile<User>(FILES.users);
    users.push(user);
    await writeFile(FILES.users, users);
  },
  update: async (id: string, updates: Partial<User>) => {
    const users = await readFile<User>(FILES.users);
    const index = users.findIndex(u => u.id === id);
    if (index === -1) return null;
    users[index] = { ...users[index], ...updates };
    await writeFile(FILES.users, users);
    return users[index];
  },
  delete: async (id: string) => {
    const users = await readFile<User>(FILES.users);
    const filtered = users.filter(u => u.id !== id);
    await writeFile(FILES.users, filtered);
  },
  getByGroup: async (groupId: string): Promise<User[]> => {
    const users = await readFile<User>(FILES.users);
    return users.filter(u => u.groupId === groupId);
  },
  getActive: async (): Promise<User[]> => {
    const users = await readFile<User>(FILES.users);
    return users.filter(u => u.status === 'active');
  },
  getAdmins: async (): Promise<User[]> => {
    const users = await readFile<User>(FILES.users);
    return users.filter(u => u.role === 'admin' && u.status === 'active');
  },
};

// ========== 分组服务 ==========

export const groupDB = {
  getAll: () => readFile<Group>(FILES.groups),
  getById: async (id: string): Promise<Group | null> => {
    const groups = await readFile<Group>(FILES.groups);
    return groups.find(g => g.id === id) || null;
  },
  add: async (group: Group) => {
    const groups = await readFile<Group>(FILES.groups);
    groups.push(group);
    await writeFile(FILES.groups, groups);
  },
  update: async (id: string, updates: Partial<Group>) => {
    const groups = await readFile<Group>(FILES.groups);
    const index = groups.findIndex(g => g.id === id);
    if (index === -1) return null;
    groups[index] = { ...groups[index], ...updates };
    await writeFile(FILES.groups, groups);
    return groups[index];
  },
  delete: async (id: string) => {
    // 删除分组时，将该分组下的用户的 groupId 置空
    const users = await readFile<User>(FILES.users);
    const updated = users.map(u => u.groupId === id ? { ...u, groupId: null } : u);
    await writeFile(FILES.users, updated);
    const groups = await readFile<Group>(FILES.groups);
    await writeFile(FILES.groups, groups.filter(g => g.id !== id));
  },
  refreshMemberCount: async (groupId: string) => {
    const users = await readFile<User>(FILES.users);
    const count = users.filter(u => u.groupId === groupId && u.status === 'active').length;
    const groups = await readFile<Group>(FILES.groups);
    const index = groups.findIndex(g => g.id === groupId);
    if (index !== -1) {
      groups[index] = { ...groups[index], memberCount: count };
      await writeFile(FILES.groups, groups);
    }
  },
};

// ========== 加班类型服务 ==========

export const overtimeTypeDB = {
  getAll: () => readFile<OvertimeType>(FILES.overtimeTypes),
  getActive: async () => (await readFile<OvertimeType>(FILES.overtimeTypes)).filter(t => t.isActive),
  getById: async (id: string) => {
    const types = await readFile<OvertimeType>(FILES.overtimeTypes);
    return types.find(t => t.id === id) || null;
  },
  add: async (type: OvertimeType) => {
    const types = await readFile<OvertimeType>(FILES.overtimeTypes);
    types.push(type);
    await writeFile(FILES.overtimeTypes, types);
  },
  update: async (id: string, updates: Partial<OvertimeType>) => {
    const types = await readFile<OvertimeType>(FILES.overtimeTypes);
    const index = types.findIndex(t => t.id === id);
    if (index === -1) return null;
    types[index] = { ...types[index], ...updates };
    await writeFile(FILES.overtimeTypes, types);
    return types[index];
  },
  delete: async (id: string) => {
    const types = await readFile<OvertimeType>(FILES.overtimeTypes);
    await writeFile(FILES.overtimeTypes, types.filter(t => t.id !== id));
  },
};

// ========== 工损类型服务 ==========

export const worklossTypeDB = {
  getAll: () => readFile<WorklossType>(FILES.worklossTypes),
  getActive: async () => (await readFile<WorklossType>(FILES.worklossTypes)).filter(t => t.isActive),
  getById: async (id: string) => {
    const types = await readFile<WorklossType>(FILES.worklossTypes);
    return types.find(t => t.id === id) || null;
  },
  add: async (type: WorklossType) => {
    const types = await readFile<WorklossType>(FILES.worklossTypes);
    types.push(type);
    await writeFile(FILES.worklossTypes, types);
  },
  update: async (id: string, updates: Partial<WorklossType>) => {
    const types = await readFile<WorklossType>(FILES.worklossTypes);
    const index = types.findIndex(t => t.id === id);
    if (index === -1) return null;
    types[index] = { ...types[index], ...updates };
    await writeFile(FILES.worklossTypes, types);
    return types[index];
  },
  delete: async (id: string) => {
    const types = await readFile<WorklossType>(FILES.worklossTypes);
    await writeFile(FILES.worklossTypes, types.filter(t => t.id !== id));
  },
};

// ========== 通知服务 ==========

export const notificationDB = {
  getAll: () => readFile<Notification>(FILES.notifications),
  getByUser: async (userId: string) => {
    const all = await readFile<Notification>(FILES.notifications);
    return all.filter(n => n.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  getUnread: async (userId: string) => {
    const all = await readFile<Notification>(FILES.notifications);
    return all.filter(n => n.userId === userId && !n.isRead);
  },
  getUnreadCount: async (userId: string) => {
    const all = await readFile<Notification>(FILES.notifications);
    return all.filter(n => n.userId === userId && !n.isRead).length;
  },
  add: async (notification: Notification) => {
    const all = await readFile<Notification>(FILES.notifications);
    all.push(notification);
    await writeFile(FILES.notifications, all);
  },
  markRead: async (id: string) => {
    const all = await readFile<Notification>(FILES.notifications);
    const index = all.findIndex(n => n.id === id);
    if (index !== -1) {
      all[index] = { ...all[index], isRead: true };
      await writeFile(FILES.notifications, all);
    }
  },
  markAllRead: async (userId: string) => {
    const all = await readFile<Notification>(FILES.notifications);
    const updated = all.map(n => n.userId === userId ? { ...n, isRead: true } : n);
    await writeFile(FILES.notifications, updated);
  },
  delete: async (id: string) => {
    const all = await readFile<Notification>(FILES.notifications);
    await writeFile(FILES.notifications, all.filter(n => n.id !== id));
  },
  clearAll: async (userId: string) => {
    const all = await readFile<Notification>(FILES.notifications);
    await writeFile(FILES.notifications, all.filter(n => n.userId !== userId));
  },
};

// ========== 加班记录服务 ==========

export const overtimeDB = {
  getAll: () => readFile<OvertimeRecord>(FILES.overtimeRecords),
  getById: async (id: string) => {
    const records = await readFile<OvertimeRecord>(FILES.overtimeRecords);
    return records.find(r => r.id === id) || null;
  },
  getByUser: async (userId: string) => {
    const records = await readFile<OvertimeRecord>(FILES.overtimeRecords);
    return records.filter(r => r.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  getPending: async () => {
    const records = await readFile<OvertimeRecord>(FILES.overtimeRecords);
    return records.filter(r => r.status === 'pending');
  },
  getApproved: async () => {
    const records = await readFile<OvertimeRecord>(FILES.overtimeRecords);
    return records.filter(r => r.status === 'approved');
  },
  getByDateRange: async (start: string, end: string) => {
    const records = await readFile<OvertimeRecord>(FILES.overtimeRecords);
    return records.filter(r => r.date >= start && r.date <= end);
  },
  getByGroup: async (groupId: string) => {
    const records = await readFile<OvertimeRecord>(FILES.overtimeRecords);
    return records.filter(r => r.groupId === groupId);
  },
  add: async (record: OvertimeRecord) => {
    const records = await readFile<OvertimeRecord>(FILES.overtimeRecords);
    records.push(record);
    await writeFile(FILES.overtimeRecords, records);

    // 联动：异常警报
    if (record.hasAnomaly) {
      const admins = await userDB.getAdmins();
      const notifications = await readFile<Notification>(FILES.notifications);
      admins.forEach(admin => {
        notifications.push({
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
      await writeFile(FILES.notifications, notifications);
    }

    // 联动：待审批通知
    const users = await readFile<User>(FILES.users);
    const reviewers = users.filter(
      u => (u.role === 'admin' || u.role === 'reviewer' || u.role === 'team_lead') && u.status === 'active' && u.id !== record.submittedBy
    );
    if (reviewers.length > 0) {
      const notifications = await readFile<Notification>(FILES.notifications);
      reviewers.forEach(reviewer => {
        notifications.push({
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
      await writeFile(FILES.notifications, notifications);
    }
  },
  update: async (id: string, updates: Partial<OvertimeRecord>) => {
    const records = await readFile<OvertimeRecord>(FILES.overtimeRecords);
    const index = records.findIndex(r => r.id === id);
    if (index === -1) return null;
    records[index] = { ...records[index], ...updates };
    await writeFile(FILES.overtimeRecords, records);
    return records[index];
  },
  approve: async (id: string, reviewerId: string, reviewerName: string, comment?: string) => {
    const records = await readFile<OvertimeRecord>(FILES.overtimeRecords);
    const index = records.findIndex(r => r.id === id);
    if (index === -1) return null;
    records[index] = { ...records[index], status: 'approved', reviewerId, reviewerName, reviewedAt: now(), reviewComment: comment || null };
    await writeFile(FILES.overtimeRecords, records);

    // 通知提交人
    const notifications = await readFile<Notification>(FILES.notifications);
    notifications.push({
      id: generateId(),
      userId: records[index].userId,
      title: '✅ 加班申请已通过',
      content: `您 ${records[index].date} 的加班申请（${records[index].typeName}：${records[index].task}）已通过审批。${comment ? '审批意见：' + comment : ''}`,
      type: 'record_approved',
      relatedId: id,
      isRead: false,
      createdAt: now(),
    });
    await writeFile(FILES.notifications, notifications);
    return records[index];
  },
  reject: async (id: string, reviewerId: string, reviewerName: string, comment?: string) => {
    const records = await readFile<OvertimeRecord>(FILES.overtimeRecords);
    const index = records.findIndex(r => r.id === id);
    if (index === -1) return null;
    records[index] = { ...records[index], status: 'rejected', reviewerId, reviewerName, reviewedAt: now(), reviewComment: comment || '审批未通过' };
    await writeFile(FILES.overtimeRecords, records);

    const notifications = await readFile<Notification>(FILES.notifications);
    notifications.push({
      id: generateId(),
      userId: records[index].userId,
      title: '❌ 加班申请被驳回',
      content: `您 ${records[index].date} 的加班申请（${records[index].typeName}：${records[index].task}）被驳回。原因：${comment || '未说明'}`,
      type: 'record_rejected',
      relatedId: id,
      isRead: false,
      createdAt: now(),
    });
    await writeFile(FILES.notifications, notifications);
    return records[index];
  },
  delete: async (id: string) => {
    const records = await readFile<OvertimeRecord>(FILES.overtimeRecords);
    await writeFile(FILES.overtimeRecords, records.filter(r => r.id !== id));
  },
};

// ========== 工损记录服务 ==========

export const worklossDB = {
  getAll: () => readFile<WorklossRecord>(FILES.worklossRecords),
  getById: async (id: string) => {
    const records = await readFile<WorklossRecord>(FILES.worklossRecords);
    return records.find(r => r.id === id) || null;
  },
  getByUser: async (userId: string) => {
    const records = await readFile<WorklossRecord>(FILES.worklossRecords);
    return records.filter(r => r.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  getPending: async () => {
    const records = await readFile<WorklossRecord>(FILES.worklossRecords);
    return records.filter(r => r.status === 'pending');
  },
  getApproved: async () => {
    const records = await readFile<WorklossRecord>(FILES.worklossRecords);
    return records.filter(r => r.status === 'approved');
  },
  getByDateRange: async (start: string, end: string) => {
    const records = await readFile<WorklossRecord>(FILES.worklossRecords);
    return records.filter(r => r.date >= start && r.date <= end);
  },
  getByGroup: async (groupId: string) => {
    const records = await readFile<WorklossRecord>(FILES.worklossRecords);
    return records.filter(r => r.groupId === groupId);
  },
  add: async (record: WorklossRecord) => {
    const records = await readFile<WorklossRecord>(FILES.worklossRecords);
    records.push(record);
    await writeFile(FILES.worklossRecords, records);

    if (record.hasAnomaly) {
      const admins = await userDB.getAdmins();
      const notifications = await readFile<Notification>(FILES.notifications);
      admins.forEach(admin => {
        notifications.push({
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
      await writeFile(FILES.notifications, notifications);
    }

    const users = await readFile<User>(FILES.users);
    const reviewers = users.filter(
      u => (u.role === 'admin' || u.role === 'reviewer' || u.role === 'team_lead') && u.status === 'active' && u.id !== record.submittedBy
    );
    if (reviewers.length > 0) {
      const notifications = await readFile<Notification>(FILES.notifications);
      reviewers.forEach(reviewer => {
        notifications.push({
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
      await writeFile(FILES.notifications, notifications);
    }
  },
  update: async (id: string, updates: Partial<WorklossRecord>) => {
    const records = await readFile<WorklossRecord>(FILES.worklossRecords);
    const index = records.findIndex(r => r.id === id);
    if (index === -1) return null;
    records[index] = { ...records[index], ...updates };
    await writeFile(FILES.worklossRecords, records);
    return records[index];
  },
  approve: async (id: string, reviewerId: string, reviewerName: string, comment?: string) => {
    const records = await readFile<WorklossRecord>(FILES.worklossRecords);
    const index = records.findIndex(r => r.id === id);
    if (index === -1) return null;
    records[index] = { ...records[index], status: 'approved', reviewerId, reviewerName, reviewedAt: now(), reviewComment: comment || null };
    await writeFile(FILES.worklossRecords, records);

    const notifications = await readFile<Notification>(FILES.notifications);
    notifications.push({
      id: generateId(),
      userId: records[index].userId,
      title: '✅ 工损申请已通过',
      content: `您 ${records[index].date} 的工损申请（${records[index].typeName}：${records[index].task}）已通过审批。${comment ? '审批意见：' + comment : ''}`,
      type: 'record_approved',
      relatedId: id,
      isRead: false,
      createdAt: now(),
    });
    await writeFile(FILES.notifications, notifications);
    return records[index];
  },
  reject: async (id: string, reviewerId: string, reviewerName: string, comment?: string) => {
    const records = await readFile<WorklossRecord>(FILES.worklossRecords);
    const index = records.findIndex(r => r.id === id);
    if (index === -1) return null;
    records[index] = { ...records[index], status: 'rejected', reviewerId, reviewerName, reviewedAt: now(), reviewComment: comment || '审批未通过' };
    await writeFile(FILES.worklossRecords, records);

    const notifications = await readFile<Notification>(FILES.notifications);
    notifications.push({
      id: generateId(),
      userId: records[index].userId,
      title: '❌ 工损申请被驳回',
      content: `您 ${records[index].date} 的工损申请（${records[index].typeName}：${records[index].task}）被驳回。原因：${comment || '未说明'}`,
      type: 'record_rejected',
      relatedId: id,
      isRead: false,
      createdAt: now(),
    });
    await writeFile(FILES.notifications, notifications);
    return records[index];
  },
  delete: async (id: string) => {
    const records = await readFile<WorklossRecord>(FILES.worklossRecords);
    await writeFile(FILES.worklossRecords, records.filter(r => r.id !== id));
  },
};

// ========== 权限申请服务 ==========

export const permissionRequestDB = {
  getAll: () => readFile<PermissionRequest>(FILES.permissionRequests),
  getPending: async () => {
    const all = await readFile<PermissionRequest>(FILES.permissionRequests);
    return all.filter(r => r.status === 'pending');
  },
  getByUser: async (userId: string) => {
    const all = await readFile<PermissionRequest>(FILES.permissionRequests);
    return all.filter(r => r.userId === userId);
  },
  add: async (request: PermissionRequest) => {
    const all = await readFile<PermissionRequest>(FILES.permissionRequests);
    all.push(request);
    await writeFile(FILES.permissionRequests, all);

    // 通知管理员
    const admins = await userDB.getAdmins();
    const notifications = await readFile<Notification>(FILES.notifications);
    admins.forEach(admin => {
      notifications.push({
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
    await writeFile(FILES.notifications, notifications);
  },
  approve: async (id: string, reviewerId: string, reviewerName: string, comment?: string) => {
    const all = await readFile<PermissionRequest>(FILES.permissionRequests);
    const index = all.findIndex(r => r.id === id);
    if (index === -1) return null;
    const request = all[index];

    all[index] = { ...request, status: 'approved', reviewerId, reviewerName, reviewComment: comment || null, reviewedAt: now() };
    await writeFile(FILES.permissionRequests, all);

    // 更新用户角色
    await userDB.update(request.userId, { role: request.requestedRole, status: 'active' });

    // 通知申请人
    const notifications = await readFile<Notification>(FILES.notifications);
    notifications.push({
      id: generateId(),
      userId: request.userId,
      title: '✅ 权限申请已通过',
      content: `您的权限申请已通过，当前角色：${request.requestedRole === 'admin' ? '管理员' : request.requestedRole === 'team_lead' ? '小组长' : '审核员'}。${comment ? '备注：' + comment : ''}`,
      type: 'permission_approved',
      relatedId: id,
      isRead: false,
      createdAt: now(),
    });
    await writeFile(FILES.notifications, notifications);
    return request;
  },
  reject: async (id: string, reviewerId: string, reviewerName: string, comment?: string) => {
    const all = await readFile<PermissionRequest>(FILES.permissionRequests);
    const index = all.findIndex(r => r.id === id);
    if (index === -1) return null;
    const request = all[index];

    all[index] = { ...request, status: 'rejected', reviewerId, reviewerName, reviewComment: comment || '申请未通过', reviewedAt: now() };
    await writeFile(FILES.permissionRequests, all);

    const notifications = await readFile<Notification>(FILES.notifications);
    notifications.push({
      id: generateId(),
      userId: request.userId,
      title: '❌ 权限申请被拒绝',
      content: `您的权限申请未通过。原因：${comment || '未说明'}。`,
      type: 'permission_rejected',
      relatedId: id,
      isRead: false,
      createdAt: now(),
    });
    await writeFile(FILES.notifications, notifications);
    return request;
  },
};

// ========== 任务服务 ==========

export const taskDB = {
  getAll: () => readFile<TaskAssignment>(FILES.tasks),
  getByUser: async (userId: string) => {
    const all = await readFile<TaskAssignment>(FILES.tasks);
    return all.filter(t => t.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  getById: async (id: string) => {
    const all = await readFile<TaskAssignment>(FILES.tasks);
    return all.find(t => t.id === id) || null;
  },
  add: async (task: TaskAssignment) => {
    const all = await readFile<TaskAssignment>(FILES.tasks);
    all.push(task);
    await writeFile(FILES.tasks, all);
    // 联动：通知被分配人
    const notification: Notification = {
      id: generateId(),
      userId: task.userId,
      title: '📌 新任务分配',
      content: `${task.assignedByName} 给您分配了任务：${task.title}${task.dueDate ? '，截止日期：' + task.dueDate : ''}`,
      type: 'task_assigned',
      relatedId: task.id,
      isRead: false,
      createdAt: now(),
    };
    const notifications = await readFile<Notification>(FILES.notifications);
    notifications.push(notification);
    await writeFile(FILES.notifications, notifications);
  },
  update: async (id: string, updates: Partial<TaskAssignment>) => {
    const all = await readFile<TaskAssignment>(FILES.tasks);
    const index = all.findIndex(t => t.id === id);
    if (index === -1) return null;
    all[index] = { ...all[index], ...updates };
    await writeFile(FILES.tasks, all);
    return all[index];
  },
  delete: async (id: string) => {
    const all = await readFile<TaskAssignment>(FILES.tasks);
    const filtered = all.filter(t => t.id !== id);
    if (filtered.length === all.length) return false;
    await writeFile(FILES.tasks, filtered);
    return true;
  },
};

// ========== 系统配置 ==========

export const configDB = {
  get: async (): Promise<SystemConfig> => {
    try {
      const data = await readFile<SystemConfig>('config.json');
      if (data.length > 0) return data[0];
    } catch { /* ignore */ }
    return { anomalyThreshold: 20, systemName: '工时管理系统', allowSelfRegister: true };
  },
  set: async (config: Partial<SystemConfig>) => {
    const current = await configDB.get();
    const updated = { ...current, ...config };
    await writeFile('config.json', [updated]);
  },
};

// ========== Session 管理（仅本地） ==========

interface SessionData {
  userId: string;
  mis: string;
  loginAt: string;
}

export const sessionDB = {
  get: (): SessionData | null => {
    try {
      const raw = localStorage.getItem('wt_session');
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
    localStorage.setItem('wt_session', JSON.stringify({ userId, mis, loginAt: now() }));
  },
  clear: () => {
    localStorage.removeItem('wt_session');
  },
};

// ========== 系统初始化 ==========

export async function initializeSystem(): Promise<void> {
  // 确保 data 分支存在
  await ensureDataBranch();

  // 检查是否已初始化（远程有数据）
  const types = await readFile<OvertimeType>(FILES.overtimeTypes);
  if (types.length > 0) return; // 已初始化

  // 创建默认加班类型
  const defaultOvertimeTypes: OvertimeType[] = [
    { id: generateId(), name: '队列加班', color: '#1890ff', defaultEfficiency: 30, description: '队列相关加班工作', isActive: true, sortOrder: 1, createdAt: now() },
    { id: generateId(), name: '标注加班', color: '#52c41a', defaultEfficiency: 25, description: '标注相关加班工作', isActive: true, sortOrder: 2, createdAt: now() },
    { id: generateId(), name: '其他加班', color: '#faad14', defaultEfficiency: 20, description: '其他类型加班', isActive: true, sortOrder: 3, createdAt: now() },
  ];
  await writeFile(FILES.overtimeTypes, defaultOvertimeTypes);

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
  await writeFile(FILES.worklossTypes, defaultWorklossTypes);

  // 创建默认系统配置
  await writeFile('config.json', [{ anomalyThreshold: 20, systemName: '工时管理系统', allowSelfRegister: true }]);
}
