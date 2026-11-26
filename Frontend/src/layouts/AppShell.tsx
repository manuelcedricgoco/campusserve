import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import * as DM from '@radix-ui/react-dropdown-menu';
import { Bell, ChevronDown, LogOut, Menu, UserRound, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AccessProvider, useAccessState, WORKSPACE_HOME, WORKSPACE_LABEL, type Access, type Workspace } from '@/lib/access';
import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';
import { Logo } from '@/components/brand/brand';
import { Button } from '@/components/ui/button';
import { ErrorState, Spinner } from '@/components/ui/states';
import { NAV, type NavItem } from './nav';

const WS_KEY = 'campusserve.workspace';
const PREFIX: [string, Workspace][] = [['/student', 'student'], ['/org', 'organization'], ['/office', 'office'], ['/department', 'department'], ['/cashier', 'cashier'], ['/admin', 'admin']];

function useWorkspace(access: Access): Workspace {
  const { pathname } = useLocation();
  const fromPath = PREFIX.find(([p]) => pathname === p || pathname.startsWith(`${p}/`))?.[1];
  let stored: Workspace | null = null;
  try { stored = localStorage.getItem(WS_KEY) as Workspace | null; } catch { /* ignore */ }
  const ws = fromPath ?? (stored && access.workspaces.includes(stored) ? stored : access.workspaces[0] ?? 'student');
  useEffect(() => { try { localStorage.setItem(WS_KEY, ws); } catch { /* ignore */ } }, [ws]);
  return ws;
}

function NavList({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  return (
    <ul className="space-y-0.5">
      {items.map((i) => (
        <li key={i.to}>
          <NavLink to={i.to} end={i.end} onClick={onNavigate}
            className={({ isActive }) => cn('flex items-center gap-3 rounded-lg px-3 py-2 text-[0.95rem] font-medium',
              isActive ? 'bg-white/10 text-white' : 'text-white/75 hover:bg-white/5 hover:text-white')}>
            {({ isActive }) => (<><i.icon className={cn('h-[18px] w-[18px]', isActive && 'text-mango')} aria-hidden />{i.label}</>)}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

function WorkspaceSwitcher({ access, current }: { access: Access; current: Workspace }) {
  const navigate = useNavigate();
  if (access.workspaces.length < 2) return <p className="px-3 text-sm text-white/80">{WORKSPACE_LABEL[current]}</p>;
  return (
    <label className="block px-3">
      <span className="sr-only">Workspace</span>
      <select value={current} onChange={(e) => navigate(WORKSPACE_HOME[e.target.value as Workspace])}
        className="h-9 w-full rounded-lg border-0 bg-white/10 px-2 text-sm font-semibold text-white focus:ring-2 focus:ring-mango">
        {access.workspaces.map((w) => <option key={w} value={w} className="text-ink">{WORKSPACE_LABEL[w]}</option>)}
      </select>
    </label>
  );
}

function Shell() {
  const { access, isLoading, error } = useAccessState();
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  const unread = useQuery({
    queryKey: ['notifications', 'count'],
    queryFn: () => api.page('/notifications', { unread: 'true', pageSize: 1 }),
    refetchInterval: 60_000, enabled: Boolean(access),
  });

  if (isLoading) return <div className="flex min-h-dvh items-center justify-center"><Spinner label="Loading your account" /></div>;
  if (error || !access) return <div className="mx-auto max-w-lg p-6"><ErrorState error={error ?? new Error('No profile found for this account.')} /></div>;
  return <ShellInner access={access} open={open} setOpen={setOpen} unread={Number(unread.data?.meta.unread ?? 0)} signOut={signOut} />;
}

function ShellInner({ access, open, setOpen, unread, signOut }: { access: Access; open: boolean; setOpen: (o: boolean) => void; unread: number; signOut: () => Promise<void> }) {
  const ws = useWorkspace(access);
  const items = NAV[ws].filter((i) => !i.show || i.show(access));
  const navigate = useNavigate();
  const name = access.profile.full_name ?? access.profile.email;
  const tabs = items.slice(0, 4);

  const sidebar = (
    <div className="flex h-full flex-col gap-5 bg-lagoon-800 px-3 py-5 text-white">
      <Link to={WORKSPACE_HOME[ws]} className="px-3"><Logo light /></Link>
      <WorkspaceSwitcher access={access} current={ws} />
      <nav aria-label="Main" className="flex-1 overflow-y-auto"><NavList items={items} onNavigate={() => setOpen(false)} /></nav>
      <p className="px-3 text-xs text-white/70">OMSU Mamburao Campus{access.academicYear ? `, AY ${access.academicYear.code}` : ''}</p>
    </div>
  );

  return (
    <div className="min-h-dvh lg:pl-64">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">Skip to content</a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-ink/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[17rem] max-w-[85vw]">{sidebar}
            <Button variant="ghost" size="icon" className="absolute right-2 top-4 text-white hover:bg-white/10" aria-label="Close menu" onClick={() => setOpen(false)}><X className="h-5 w-5" /></Button>
          </div>
        </div>
      )}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-mist bg-paper/95 px-3 backdrop-blur sm:px-6">
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></Button>
        <Link to={WORKSPACE_HOME[ws]} className="lg:hidden" aria-label="CampusServe home"><Logo compact /></Link>
        <div className="flex-1" />
        <Button variant="ghost" size="icon" asChild>
          <Link to="/notifications" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} className="relative">
            <Bell className="h-5 w-5" aria-hidden />
            {unread > 0 && <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-mango px-1 text-[0.65rem] font-bold text-ink">{unread > 9 ? '9+' : unread}</span>}
          </Link>
        </Button>
        <DM.Root>
          <DM.Trigger asChild>
            <button className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-lagoon-50" aria-label="Account menu">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-lagoon text-sm font-bold text-white">{initials(name)}</span>
              <span className="hidden max-w-[12rem] truncate text-sm font-semibold sm:block">{name}</span>
              <ChevronDown className="hidden h-4 w-4 sm:block" aria-hidden />
            </button>
          </DM.Trigger>
          <DM.Portal>
            <DM.Content align="end" sideOffset={6} className="z-50 min-w-[12rem] rounded-xl bg-white p-1.5 shadow-lift ring-1 ring-mist">
              <DM.Item onSelect={() => navigate('/profile')} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-lagoon-50"><UserRound className="h-4 w-4" aria-hidden />Profile</DM.Item>
              <DM.Item onSelect={() => { void signOut().then(() => navigate('/')); }} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-lagoon-50"><LogOut className="h-4 w-4" aria-hidden />Sign out</DM.Item>
            </DM.Content>
          </DM.Portal>
        </DM.Root>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:pb-12">
        <Outlet />
      </main>
      {ws === 'student' && (
        <nav aria-label="Quick" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-mist bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
          {tabs.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => cn('flex flex-col items-center gap-0.5 py-2 text-[0.72rem] font-semibold', isActive ? 'text-lagoon' : 'text-ink-faint')}>
              <i.icon className="h-5 w-5" aria-hidden />{i.label}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}

export function AppShell() {
  return <AccessProvider><Shell /></AccessProvider>;
}
