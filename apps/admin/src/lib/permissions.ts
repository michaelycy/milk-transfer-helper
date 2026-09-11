/**
 * 管理端权限矩阵（FR-J8）：与后端 app/core/deps.py ROLE_PERMISSIONS 同源镜像。
 * 裁决事实源是 DB has_permission()（迁移 20260912120000），本文件仅供菜单/按钮渲染；
 * 两侧修改必须同步（apps/backend/tests/test_rbac.py 锁定 DB↔后端一致）。
 */
import { createContext, useContext } from 'react';

export type Permission =
  | 'dashboard:read'
  | 'milk:write'
  | 'article:write'
  | 'template:write'
  | 'ai:config'
  | 'ai:key'
  | 'user:read'
  | 'admin:manage'
  | 'audit:read';

export type AdminRole = 'super_admin' | 'operator' | 'analyst';

export const ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  super_admin: [
    'dashboard:read',
    'milk:write',
    'article:write',
    'template:write',
    'ai:config',
    'ai:key',
    'user:read',
    'admin:manage',
    'audit:read',
  ],
  operator: [
    'dashboard:read',
    'milk:write',
    'article:write',
    'template:write',
    'ai:config',
  ],
  analyst: ['dashboard:read', 'audit:read'],
};

export const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: '超级管理员',
  operator: '运营',
  analyst: '分析师',
};

export interface AdminMe {
  user_id: string;
  email: string | null;
  role: AdminRole;
  permissions: string[];
}

export const PermissionContext = createContext<AdminMe | null>(null);

export function usePermissions(): AdminMe | null {
  return useContext(PermissionContext);
}

/** 页面级权限守卫：无权限渲染 403（菜单已隐藏入口，直连 URL 时兜底） */
export function useHasPermission(permission: Permission): boolean {
  const me = usePermissions();
  return (me?.permissions ?? []).includes(permission);
}
