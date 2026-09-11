import { callBackendApi } from '../lib/backend';
import type { ApiLogPage, ApiLogQuery } from '../types';

/**
 * API 运行日志（FR-J12）：经后端 /v1/admin/logs 只读查询 api_logs 表。
 * 只读——不提供任何删除/导出能力；request_id 为排障第一关联键（响应头 X-Request-Id）。
 */
export const LogService = {
  async query(params: ApiLogQuery): Promise<ApiLogPage> {
    const search = new URLSearchParams();
    if (params.level) search.set('level', params.level);
    if (params.path) search.set('path', params.path);
    if (params.request_id) search.set('request_id', params.request_id);
    if (params.since) search.set('since', params.since);
    if (params.until) search.set('until', params.until);
    search.set('limit', String(params.limit ?? 50));
    search.set('offset', String(params.offset ?? 0));
    const qs = search.toString();
    return callBackendApi<ApiLogPage>(`/v1/admin/logs${qs ? `?${qs}` : ''}`, undefined, 'GET');
  },
};
