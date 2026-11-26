import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface Assignment {
  scope_type: 'organization' | 'office' | 'program' | 'department';
  scope_id: string; scope_code: string; scope_name: string; position_code: string; position_name: string;
  academic_year: string; program_id: string | null; section: string | null;
}
export interface AccessContext {
  profile: { id: string; email: string; full_name: string | null; phone: string | null; is_active: boolean };
  roles: string[];
  student: null | { student_number: string; year_level: number; section: string; program_code: string; program_name: string;
    department_organization_id: string | null; department_organization_code: string | null; organization_mapping_status: string };
  assignments: Assignment[];
  globalPermissions: string[];
  scopedPermissions: { permission: string; scopeType: string; scopeId: string }[];
  academicYear: { id: string; code: string } | null;
}

export type Workspace = 'student' | 'organization' | 'office' | 'department' | 'cashier' | 'admin';

export interface Access extends AccessContext {
  /** Holds the permission anywhere (UI hint only; the server enforces every action). */
  can(permission: string): boolean;
  canIn(permission: string, scopeId: string): boolean;
  scopesWith(permission: string, type?: Assignment['scope_type']): Assignment[];
  workspaces: Workspace[];
}

const Ctx = createContext<{ access: Access | null; isLoading: boolean; error: unknown } | null>(null);

export function buildAccess(ctx: AccessContext): Access {
  const can = (p: string) => ctx.globalPermissions.includes(p) || ctx.scopedPermissions.some((s) => s.permission === p);
  const canIn = (p: string, id: string) => ctx.globalPermissions.includes(p) || ctx.scopedPermissions.some((s) => s.permission === p && s.scopeId === id);
  const scopesWith = (p: string, type?: Assignment['scope_type']) => {
    const ids = new Set(ctx.scopedPermissions.filter((s) => s.permission === p && (!type || s.scopeType === type)).map((s) => s.scopeId));
    const seen = new Set<string>();
    return ctx.assignments.filter((a) => ids.has(a.scope_id) && !seen.has(a.scope_id) && seen.add(a.scope_id));
  };
  const ws: Workspace[] = [];
  if (ctx.student) ws.push('student');
  if (ctx.assignments.some((a) => a.scope_type === 'organization')) ws.push('organization');
  if (ctx.assignments.some((a) => a.scope_type === 'office')) ws.push('office');
  if (ctx.assignments.some((a) => a.scope_type === 'program' || a.scope_type === 'department') || ctx.roles.includes('department_head')) ws.push('department');
  if (ctx.roles.includes('cashier')) ws.push('cashier');
  if (ctx.roles.includes('administrator')) ws.push('admin');
  return { ...ctx, can, canIn, scopesWith, workspaces: ws };
}

export function AccessProvider({ children }: { children: ReactNode }) {
  const q = useQuery({ queryKey: ['me'], queryFn: () => api.get<AccessContext>('/me'), staleTime: 60_000 });
  const access = useMemo(() => (q.data ? buildAccess(q.data) : null), [q.data]);
  return <Ctx.Provider value={{ access, isLoading: q.isLoading, error: q.error }}>{children}</Ctx.Provider>;
}

export function useAccessState() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAccess must be used inside AccessProvider');
  return c;
}
export function useAccess(): Access {
  const { access } = useAccessState();
  if (!access) throw new Error('Access not loaded');
  return access;
}

export const WORKSPACE_LABEL: Record<Workspace, string> = {
  student: 'Student', organization: 'Organization', office: 'Office', department: 'Department', cashier: 'Cashier', admin: 'Administration',
};
export const WORKSPACE_HOME: Record<Workspace, string> = {
  student: '/student', organization: '/org', office: '/office', department: '/department', cashier: '/cashier', admin: '/admin',
};
