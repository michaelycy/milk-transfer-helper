import { supabase } from '../lib/supabase';

/** 管理员会话与白名单自检（admins 表 RLS：仅能查到自己的行） */
export const AuthService = {
  async signIn(email: string, password: string): Promise<void> {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  },

  async signOut(): Promise<void> {
    await supabase.auth.signOut();
  },

  async getSession() {
    const { data } = await supabase.auth.getSession();
    return data.session;
  },

  /** 已登录但不在 admins 白名单 → false（登录页据此提示"无权限"） */
  async isAdmin(): Promise<boolean> {
    const { data } = await supabase.from('admins').select('user_id').maybeSingle();
    return !!data;
  },
};
