import { create } from 'zustand';
import type { UserWithRoles } from '@/types/database';

interface AuthState {
  user: UserWithRoles | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  setUser: (user: UserWithRoles | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
  hasRole: (roleName: string) => boolean;
  hasPermission: (permission: string) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  setUser: (user) => set({ user, isAuthenticated: !!user, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),

  logout: () => set({ user: null, isAuthenticated: false }),

  hasRole: (roleName: string) => {
    const { user } = get();
    if (!user) return false;
    return user.roles.some((r) => r.name === roleName);
  },

  hasPermission: (permission: string) => {
    const { user } = get();
    if (!user) return false;
    return user.roles.some(
      (r) => r.permissions.all === true || r.permissions[permission] === true
    );
  },
}));
