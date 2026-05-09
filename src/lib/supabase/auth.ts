/**
 * 纯前端认证系统
 * 用户数据存储在 localStorage 中，无需后端服务
 */

import type { UserWithRoles } from '@/types/database';

// ========== 密码哈希 ==========

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + '_worktime_2024');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ========== 用户数据存储 ==========

const USERS_KEY = 'worktime_users';
const SESSION_KEY = 'worktime_session';

interface StoredUser {
  id: string;
  mis: string;
  name: string;
  passwordHash: string;
  createdAt: string;
  lastLogin: string | null;
  loginCount: number;
}

function getStoredUsers(): StoredUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredUsers(users: StoredUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ========== 认证方法 ==========

/**
 * 检查 MIS 号状态
 */
export async function checkMisStatus(mis: string): Promise<{ exists: boolean; hasPassword: boolean }> {
  const users = getStoredUsers();
  const user = users.find(u => u.mis === mis.trim());

  if (!user) {
    return { exists: false, hasPassword: false };
  }

  return { exists: true, hasPassword: !!user.passwordHash };
}

/**
 * 首次登录：注册用户并设置密码
 */
export async function registerWithPassword(mis: string, name: string, password: string) {
  const users = getStoredUsers();

  // 检查是否已存在
  if (users.find(u => u.mis === mis.trim())) {
    throw new Error('该MIS号已注册，请直接登录');
  }

  const passwordHash = await hashPassword(password);
  const newUser: StoredUser = {
    id: generateId(),
    mis: mis.trim(),
    name: name.trim(),
    passwordHash,
    createdAt: new Date().toISOString(),
    lastLogin: new Date().toISOString(),
    loginCount: 1,
  };

  users.push(newUser);
  saveStoredUsers(users);

  // 保存登录状态
  saveSession(newUser.id, newUser.mis);

  return newUser;
}

/**
 * 已有用户设置密码
 */
export async function setPassword(mis: string, password: string) {
  const users = getStoredUsers();
  const index = users.findIndex(u => u.mis === mis.trim());

  if (index === -1) {
    throw new Error('用户不存在');
  }

  users[index].passwordHash = await hashPassword(password);
  saveStoredUsers(users);
}

/**
 * 登录：MIS号 + 密码
 */
export async function signInWithPassword(mis: string, password: string) {
  const users = getStoredUsers();
  const passwordHash = await hashPassword(password);
  const user = users.find(u => u.mis === mis.trim() && u.passwordHash === passwordHash);

  if (!user) {
    throw new Error('MIS号或密码错误');
  }

  // 更新登录信息
  user.lastLogin = new Date().toISOString();
  user.loginCount += 1;
  saveStoredUsers(users);

  // 保存登录状态
  saveSession(user.id, user.mis);

  return user;
}

/**
 * 获取当前登录用户（含角色和分组）
 */
export async function getCurrentUserWithRoles(): Promise<UserWithRoles | null> {
  const session = getSession();
  if (!session) return null;

  const users = getStoredUsers();
  const user = users.find(u => u.id === session.userId);

  if (!user) {
    clearSession();
    return null;
  }

  // 返回兼容 UserWithRoles 的结构
  return {
    id: user.id,
    mis: user.mis,
    name: user.name,
    avatar: null,
    status: 'active',
    department: null,
    password_hash: null,
    created_at: user.createdAt,
    last_login: user.lastLogin,
    login_count: user.loginCount,
    roles: [
      {
        id: 'default-member',
        name: 'member',
        display_name: '普通成员',
        description: null,
        level: 10,
        permissions: { view_own: true, submit_records: true },
        created_at: user.createdAt,
      },
    ],
    groups: [],
  };
}

/**
 * 退出登录
 */
export async function signOut() {
  clearSession();
}

/**
 * 修改密码
 */
export async function changePassword(mis: string, oldPassword: string, newPassword: string) {
  const users = getStoredUsers();
  const oldHash = await hashPassword(oldPassword);
  const user = users.find(u => u.mis === mis.trim() && u.passwordHash === oldHash);

  if (!user) {
    throw new Error('原密码错误');
  }

  user.passwordHash = await hashPassword(newPassword);
  saveStoredUsers(users);
}

// ========== Session 管理 ==========

interface SessionData {
  userId: string;
  mis: string;
  loginAt: string;
}

function saveSession(userId: string, mis: string) {
  const session: SessionData = {
    userId,
    mis,
    loginAt: new Date().toISOString(),
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function getSession(): SessionData | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session: SessionData = JSON.parse(raw);

    // 30天过期
    const loginAt = new Date(session.loginAt).getTime();
    const now = Date.now();
    if (now - loginAt > 30 * 24 * 60 * 60 * 1000) {
      clearSession();
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
