import { create } from 'zustand';
import type { User, UserRole } from '@/types/database';
import { ROLE_LEVELS } from '@/types/database';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
  /** 检查当前用户是否拥有指定角色（或更高权限） */
  hasRole: (role: UserRole) => boolean;
  /** 检查是否是管理员 */
  isAdmin: () => boolean;
  /** 检查是否有审批权限（admin/team_lead/reviewer） */
  canReview: () => boolean;
  /** 检查是否可以管理人员（admin/team_lead） */
  canManagePersonnel: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  setUser: (user) => set({ user, isAuthenticated: !!user, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),

  logout: () => set({ user: null, isAuthenticated: false }),

  hasRole: (role: UserRole) => {
    const { user } = get();
    if (!user) return false;
    return ROLE_LEVELS[user.role] >= ROLE_LEVELS[role];
  },

  isAdmin: () => {
    const { user } = get();
    return user?.role === 'admin';
  },

  canReview: () => {
    const { user } = get();
    if (!user) return false;
    return ['admin', 'team_lead', 'reviewer'].includes(user.role);
  },

  canManagePersonnel: () => {
    const { user } = get();
    if (!user) return false;
    return ['admin', 'team_lead'].includes(user.role);
  },
}));
