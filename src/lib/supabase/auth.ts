/**
 * 认证服务
 * 
 * 登录流程：
 * 1. 首次登录：输入MIS号+姓名+密码 → 注册 → 选择申请角色 → 等待审批（或直接成为member）
 * 2. 后续登录：MIS号+密码 → 进入系统
 * 3. 第一个注册的用户自动成为管理员
 */

import { userDB, sessionDB, generateId, now, hashPassword } from '@/lib/db';
import type { User } from '@/types/database';

/**
 * 检查 MIS 号状态
 */
export async function checkMisStatus(mis: string): Promise<{ exists: boolean; hasPassword: boolean }> {
  const user = userDB.getByMis(mis.trim());
  if (!user) return { exists: false, hasPassword: false };
  return { exists: true, hasPassword: !!user.passwordHash };
}

/**
 * 注册新用户
 * 如果是系统中第一个用户，自动成为管理员
 */
export async function registerUser(mis: string, name: string, password: string): Promise<User> {
  const existing = userDB.getByMis(mis.trim());
  if (existing) {
    throw new Error('该MIS号已注册，请直接登录');
  }

  const passwordHash = await hashPassword(password);
  const allUsers = userDB.getAll();
  const isFirstUser = allUsers.length === 0;

  const newUser: User = {
    id: generateId(),
    mis: mis.trim(),
    name: name.trim(),
    avatar: null,
    role: isFirstUser ? 'admin' : 'member', // 第一个用户自动成为管理员
    groupId: null,
    status: 'active',
    passwordHash,
    createdAt: now(),
    lastLogin: now(),
    loginCount: 1,
  };

  userDB.add(newUser);
  sessionDB.set(newUser.id, newUser.mis);

  return newUser;
}

/**
 * 登录
 */
export async function signInWithPassword(mis: string, password: string): Promise<User> {
  const user = userDB.getByMis(mis.trim());
  if (!user) {
    throw new Error('MIS号不存在，请先注册');
  }

  const passwordHash = await hashPassword(password);
  if (user.passwordHash !== passwordHash) {
    throw new Error('密码错误');
  }

  // 更新登录信息
  userDB.update(user.id, {
    lastLogin: now(),
    loginCount: user.loginCount + 1,
  });

  sessionDB.set(user.id, user.mis);

  return { ...user, lastLogin: now(), loginCount: user.loginCount + 1 };
}

/**
 * 获取当前登录用户
 */
export function getCurrentUser(): User | null {
  const session = sessionDB.get();
  if (!session) return null;

  const user = userDB.getById(session.userId);
  if (!user) {
    sessionDB.clear();
    return null;
  }

  return user;
}

/**
 * 退出登录
 */
export function signOut(): void {
  sessionDB.clear();
}

/**
 * 修改密码
 */
export async function changePassword(mis: string, oldPassword: string, newPassword: string): Promise<void> {
  const user = userDB.getByMis(mis.trim());
  if (!user) throw new Error('用户不存在');

  const oldHash = await hashPassword(oldPassword);
  if (user.passwordHash !== oldHash) {
    throw new Error('原密码错误');
  }

  const newHash = await hashPassword(newPassword);
  userDB.update(user.id, { passwordHash: newHash });
}

/**
 * 获取 session（供 AuthProvider 使用）
 */
export function getSession() {
  return sessionDB.get();
}
