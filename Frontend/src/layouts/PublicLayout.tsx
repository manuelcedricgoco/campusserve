import { Link, NavLink, Outlet } from 'react-router';
import { useAuth } from '@/lib/auth';
import { Logo } from '@/components/brand/brand';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

const LINKS = [
  { to: '/services', label: 'Services' },
  { to: '/map', label: 'Campus map' },
  { to: '/ask', label: 'Ask a question' },
];

export function PublicLayout() {
  const { status } = useAuth();
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">Skip to content</a>
      <header className="border-b border-mist bg-paper">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link to="/" aria-label="CampusServe home"><Logo /></Link>
          <nav aria-label="Public" className="ml-4 hidden gap-1 md:flex">
            {LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) => cn('rounded-lg px-3 py-2 text-[0.95rem] font-medium', isActive ? 'text-lagoon' : 'text-ink-soft hover:text-ink')}>{l.label}</NavLink>
            ))}
          </nav>
          <div className="flex-1" />
          {status === 'signed_in'
            ? <Button asChild><Link to="/home">Open CampusServe</Link></Button>
            : <Button asChild><Link to="/sign-in">Sign in</Link></Button>}
        </div>
        <nav aria-label="Public (mobile)" className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 pb-2 md:hidden">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => cn('whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium', isActive ? 'bg-lagoon text-white' : 'bg-white text-ink-soft ring-1 ring-mist')}>{l.label}</NavLink>
          ))}
        </nav>
      </header>
      <main id="main" className="flex-1"><Outlet /></main>
      <footer className="border-t border-mist">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-ink-faint sm:flex-row sm:justify-between sm:px-6">
          <p>CampusServe for Occidental Mindoro State University, Mamburao Campus.</p>
          <p>Official decisions are made by the responsible office, never by the assistant.</p>
        </div>
      </footer>
    </div>
  );
}
