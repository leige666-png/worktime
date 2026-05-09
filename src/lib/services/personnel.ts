import { supabase } from '@/lib/supabase/client';
import type { User, Group, Role } from '@/types/database';

// ========== 用户管理 ==========

export async function getUsers(params?: {
  search?: string;
  status?: string;
  groupId?: string;
}) {
  let query = supabase
    .from('users')
    .select('*, user_roles(role_id, roles(*)), user_groups(group_id, groups(*))')
    .order('created_at', { ascending: false });

  if (params?.search) {
    query = query.or(`name.ilike.%${params.search}%,mis.ilike.%${params.search}%`);
  }
  if (params?.status) {
    query = query.eq('status', params.status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getUserById(id: string) {
  const { data, error } = await supabase
    .from('users')
    .select('*, user_roles(role_id, roles(*)), user_groups(group_id, groups(*))')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

export async function updateUser(id: string, updates: Partial<User>) {
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateUserStatus(id: string, status: 'active' | 'inactive' | 'frozen') {
  return updateUser(id, { status });
}

// ========== 角色管理 ==========

export async function getRoles() {
  const { data, error } = await supabase
    .from('roles')
    .select('*')
    .order('level', { ascending: false });

  if (error) throw error;
  return data as Role[];
}

export async function assignRole(userId: string, roleId: string, assignedBy?: string) {
  const { data, error } = await supabase
    .from('user_roles')
    .insert({ user_id: userId, role_id: roleId, assigned_by: assignedBy })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function removeRole(userId: string, roleId: string) {
  const { error } = await supabase
    .from('user_roles')
    .delete()
    .eq('user_id', userId)
    .eq('role_id', roleId);

  if (error) throw error;
}

// ========== 分组管理 ==========

export async function getGroups() {
  const { data, error } = await supabase
    .from('groups')
    .select('*, user_groups(user_id, users(id, name, mis, avatar))')
    .order('sort_order');

  if (error) throw error;
  return data;
}

export async function createGroup(group: {
  name: string;
  description?: string;
  color?: string;
  leader_id?: string;
  created_by?: string;
}) {
  const { data, error } = await supabase
    .from('groups')
    .insert(group)
    .select()
    .single();

  if (error) throw error;
  return data as Group;
}

export async function updateGroup(id: string, updates: Partial<Group>) {
  const { data, error } = await supabase
    .from('groups')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteGroup(id: string) {
  const { error } = await supabase.from('groups').delete().eq('id', id);
  if (error) throw error;
}

export async function addUserToGroup(userId: string, groupId: string) {
  const { error } = await supabase
    .from('user_groups')
    .insert({ user_id: userId, group_id: groupId });

  if (error) throw error;
}

export async function removeUserFromGroup(userId: string, groupId: string) {
  const { error } = await supabase
    .from('user_groups')
    .delete()
    .eq('user_id', userId)
    .eq('group_id', groupId);

  if (error) throw error;
}
