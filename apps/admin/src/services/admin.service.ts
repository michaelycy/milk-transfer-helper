import { callBackendApi } from '../lib/backend';
import type { AdminInviteBody, AdminMe, AdminPatchBody, AdminRow, AdminUserPage, AdminUserQuery, AdminUserProfile, AuditLogPage, AuditLogQuery } from '../types';

/**
 * 管理员与权限（FR-J8/J9）、C 端用户查询（FR-J10）、操作审计（FR-J11）。
 * 全部走后端 /v1/admin/**（服务端裁决权限点），前端不做任何本地鉴权决定。
 */
export const AdminService = {
  async me(): Promise<AdminMe> {
    return callBackendApi<AdminMe>('/v1/admin/me', undefined, 'GET');
  },

  async listAdmins(): Promise<AdminRow[]> {
    return callBackendApi<AdminRow[]>('/v1/admin/admins', undefined, 'GET');
  },

  async inviteAdmin(body: AdminInviteBody): Promise<AdminRow> {
    return callBackendApi<AdminRow>('/v1/admin/admins/invite', body);
  },

  async updateAdmin(userId: string, body: AdminPatchBody): Promise<AdminRow> {
    return callBackendApi<AdminRow>(`/v1/admin/admins/${userId}`, body, 'PUT');
  },

  async removeAdmin(userId: string): Promise<{ removed: string }> {
    return callBackendApi<{ removed: string }>(`/v1/admin/admins/${userId}`, undefined, 'DELETE');
  },

  async queryUsers(params: AdminUserQuery): Promise<AdminUserPage> {
    const search = new URLSearchParams();
    if (params.openid) search.set('openid', params.openid);
    if (params.since) search.set('since', params.since);
    if (params.until) search.set('until', params.until);
    search.set('limit', String(params.limit ?? 20));
    search.set('offset', String(params.offset ?? 0));
    const qs = search.toString();
    return callBackendApi<AdminUserPage>(`/v1/admin/users${qs ? `?${qs}` : ''}`, undefined, 'GET');
  },

  async userProfile(userId: string): Promise<AdminUserProfile> {
    return callBackendApi<AdminUserProfile>(`/v1/admin/users/${userId}`, undefined, 'GET');
  },

  async auditLogs(params: AuditLogQuery): Promise<AuditLogPage> {
    const search = new URLSearchParams();
    if (params.action) search.set('action', params.action);
    if (params.actor) search.set('actor', params.actor);
    if (params.since) search.set('since', params.since);
    if (params.until) search.set('until', params.until);
    search.set('limit', String(params.limit ?? 50));
    search.set('offset', String(params.offset ?? 0));
    const qs = search.toString();
    return callBackendApi<AuditLogPage>(`/v1/admin/audit-logs${qs ? `?${qs}` : ''}`, undefined, 'GET');
  },
};
