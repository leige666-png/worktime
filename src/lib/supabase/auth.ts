import { supabase } from './client';

/**
 * 使用美团 SSO 登录
 * Supabase 已内置美团 OAuth provider，直接调用即可
 */
export async function signInWithMeituanSSO() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'meituan' as any, // 美团定制 provider
    options: {
      redirectTo: `${window.location.origin}/api/auth/callback`,
    },
  });

  if (error) {
    throw error;
  }

  return data;
}

/**
 * 退出登录
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * 获取当前会话
 */
export async function getSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  return session;
}

/**
 * 获取当前用户信息（含角色和分组）
 */
export async function getCurrentUserWithRoles() {
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;

  // 从 user_metadata 中获取 MIS 号
  const mis = authUser.user_metadata?.mis || authUser.email?.split('@')[0] || '';

  // 查询用户详细信息
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('mis', mis)
    .single();

  if (error || !user) {
    // 用户首次登录，自动创建
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert({
        mis,
        name: authUser.user_metadata?.name || authUser.user_metadata?.full_name || mis,
        avatar: authUser.user_metadata?.avatar_url || null,
        department: authUser.user_metadata?.department || null,
      })
      .select()
      .single();

    if (createError) throw createError;

    // 分配默认角色（member）
    const { data: memberRole } = await supabase
      .from('roles')
      .select('id')
      .eq('name', 'member')
      .single();

    if (memberRole) {
      await supabase.from('user_roles').insert({
        user_id: newUser.id,
        role_id: memberRole.id,
      });
    }

    return {
      ...newUser,
      roles: memberRole ? [{ ...memberRole, name: 'member', display_name: '普通成员', description: '', level: 10, permissions: { view_own: true, submit_records: true }, created_at: '' }] : [],
      groups: [],
    };
  }

  // 查询用户角色
  const { data: userRoles } = await supabase
    .from('user_roles')
    .select('role_id, roles(*)')
    .eq('user_id', user.id);

  // 查询用户分组
  const { data: userGroups } = await supabase
    .from('user_groups')
    .select('group_id, groups(*)')
    .eq('user_id', user.id);

  // 更新最后登录时间
  await supabase
    .from('users')
    .update({ last_login: new Date().toISOString(), login_count: (user.login_count || 0) + 1 })
    .eq('id', user.id);

  return {
    ...user,
    roles: userRoles?.map((ur: any) => ur.roles).filter(Boolean) || [],
    groups: userGroups?.map((ug: any) => ug.groups).filter(Boolean) || [],
  };
}
