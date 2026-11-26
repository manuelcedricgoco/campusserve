import {
  Bell, Bot, BookOpen, Building2, CalendarClock, ClipboardCheck, CreditCard, FileText, Gauge, Home, LibraryBig, ListChecks, Map, Receipt,
  ScrollText, Settings, ShieldAlert, Signature, Users, Workflow, HeartHandshake, Landmark, Files,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Access, Workspace } from '@/lib/access';

export interface NavItem { to: string; label: string; icon: LucideIcon; show?: (a: Access) => boolean; end?: boolean }

const any = (...perms: string[]) => (a: Access) => perms.some((p) => a.can(p));

export const NAV: Record<Workspace, NavItem[]> = {
  student: [
    { to: '/student', label: 'Home', icon: Home, end: true },
    { to: '/student/queue', label: 'Queue', icon: CalendarClock },
    { to: '/student/requests', label: 'Requests', icon: FileText },
    { to: '/student/clearance', label: 'Clearance', icon: ClipboardCheck },
    { to: '/student/penalties', label: 'Penalties', icon: ShieldAlert },
    { to: '/student/receipts', label: 'Receipts', icon: Receipt },
    { to: '/student/payments', label: 'Payments', icon: CreditCard },
    { to: '/assistant', label: 'Assistant', icon: Bot },
    { to: '/campus-map', label: 'Campus map', icon: Map },
  ],
  organization: [
    { to: '/org', label: 'Overview', icon: Home, end: true },
    { to: '/org/receipts', label: 'Receipts', icon: Receipt, show: any('receipts.record', 'receipts.verify', 'receipts.view') },
    { to: '/org/remittances', label: 'Remittances', icon: Files, show: any('remittance.create', 'remittance.review') },
    { to: '/org/violations', label: 'Violations', icon: ShieldAlert, show: any('violations.report', 'violations.review', 'violations.view') },
    { to: '/org/penalties', label: 'Penalties', icon: HeartHandshake, show: any('penalties.view', 'penalties.assess', 'penalties.verify_service') },
    { to: '/org/payments', label: 'Payments', icon: CreditCard, show: any('payments.verify', 'payments.reconcile') },
    { to: '/approvals', label: 'Clearance signing', icon: Signature, show: any('clearance.approve') },
  ],
  office: [
    { to: '/office', label: 'Overview', icon: Home, end: true },
    { to: '/office/queue', label: 'Queue board', icon: CalendarClock, show: any('queue.manage') },
    { to: '/office/requests', label: 'Requests', icon: FileText, show: any('requests.manage') },
    { to: '/office/guidance', label: 'Guidance', icon: BookOpen, show: any('guidance.manage') },
    { to: '/office/library', label: 'Library', icon: LibraryBig, show: any('library.manage') },
    { to: '/office/clearance', label: 'Clearances', icon: ClipboardCheck, show: any('clearance.initiate') },
    { to: '/approvals', label: 'Clearance signing', icon: Signature, show: any('clearance.approve') },
    { to: '/reports', label: 'Reports', icon: Gauge, show: any('reports.view', 'reports.view_all') },
  ],
  department: [
    { to: '/department', label: 'Overview', icon: Home, end: true },
    { to: '/approvals', label: 'Clearance signing', icon: Signature, show: any('clearance.approve') },
    { to: '/reports', label: 'Reports', icon: Gauge, show: any('reports.view', 'reports.view_all') },
  ],
  cashier: [
    { to: '/cashier', label: 'Payments', icon: CreditCard, end: true },
    { to: '/reports', label: 'Reports', icon: Gauge, show: any('reports.view', 'reports.view_all') },
  ],
  admin: [
    { to: '/admin', label: 'Overview', icon: Home, end: true },
    { to: '/admin/users', label: 'Users and roles', icon: Users, show: any('users.manage') },
    { to: '/admin/config', label: 'Services and settings', icon: Settings, show: any('config.manage') },
    { to: '/admin/policies', label: 'Policies and fees', icon: Landmark, show: any('config.manage') },
    { to: '/admin/clearance', label: 'Clearance templates', icon: ListChecks, show: any('config.manage') },
    { to: '/admin/ai', label: 'Assistant knowledge', icon: Bot, show: any('ai.manage_knowledge', 'ai.view_usage') },
    { to: '/admin/automation', label: 'Automation', icon: Workflow, show: any('automation.view', 'automation.manage') },
    { to: '/admin/gis', label: 'Campus map data', icon: Building2, show: any('gis.manage') },
    { to: '/admin/payments', label: 'Payments', icon: CreditCard, show: any('payments.view_all') },
    { to: '/admin/audit', label: 'Audit log', icon: ScrollText, show: any('audit.view') },
    { to: '/reports', label: 'Reports', icon: Gauge, show: any('reports.view', 'reports.view_all') },
  ],
};

export const SHARED: NavItem[] = [
  { to: '/notifications', label: 'Notifications', icon: Bell },
];
