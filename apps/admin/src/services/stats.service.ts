import { supabase } from '../lib/supabase';

/** admin-stats Edge Function 的响应契约（supabase/functions/admin-stats） */
export interface AdminStats {
  window: { days: number; since: string };
  users: number;
  plans: { active: number; total: number };
  eventsByName: Record<string, number>;
  trend: { date: string; app_launch: number; plan_created: number; feed_recorded: number }[];
  topArticles: { title: string; count: number }[];
}

/** 数据看板（FR-H4：analytics_events 无客户端 select 权限，聚合在 Edge Function 服务端完成） */
export const StatsService = {
  async overview(days = 30): Promise<AdminStats> {
    const { data, error } = await supabase.functions.invoke<AdminStats>('admin-stats', {
      body: { days },
    });
    if (error) throw error;
    if (!data) throw new Error('看板数据为空');
    return data;
  },
};
