import clsx from 'clsx';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

const nav = [
  { to: '/', label: 'Обзор', icon: 'grid' },
  { to: '/meals', label: 'Дневник', icon: 'meal' },
  { to: '/chat', label: 'Чат', icon: 'chat' },
  { to: '/profile', label: 'Профиль', icon: 'user' },
] as const;

function Icon({ name }: { name: (typeof nav)[number]['icon'] }) {
  const common = 'h-5 w-5';
  if (name === 'grid')
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    );
  if (name === 'meal')
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6 13h12" />
        <path d="M6 17h8" />
        <path d="M10 9V3" />
        <path d="M6 3v10a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4V3" />
      </svg>
    );
  if (name === 'chat')
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    );
  return (
    <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export function AppShell({
  title,
  subtitle,
  actions,
  isAdmin,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  isAdmin?: boolean;
}) {
  const location = useLocation();
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-sidebar shrink-0 flex-col items-center border-r border-border bg-surface py-5">
        <div className="mb-8 grid grid-cols-2 gap-1">
          <span className="h-3.5 w-3.5 rounded-full bg-primary/85" />
          <span className="h-3.5 w-3.5 rounded-full bg-primary/85" />
          <span className="h-3.5 w-3.5 rounded-full bg-primary/85" />
          <span className="h-3.5 w-3.5 rounded-full bg-primary/85" />
        </div>
        <nav className="flex flex-1 flex-col items-center gap-3">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => {
                const chatActive = item.to === '/chat' && location.pathname.startsWith('/chat');
                const active = isActive || chatActive;
                return clsx(
                  'grid h-11 w-11 place-items-center rounded-full text-ink-muted transition hover:bg-primary-soft hover:text-primary',
                  active && 'bg-primary text-white hover:bg-primary hover:text-white',
                );
              }}
              title={item.label}
            >
              <Icon name={item.icon} />
            </NavLink>
          ))}
          {isAdmin ? (
            <NavLink
              to="/admin/knowledge"
              className={({ isActive }) =>
                clsx(
                  'mt-4 grid h-11 w-11 place-items-center rounded-full text-ink-muted transition hover:bg-primary-soft hover:text-primary',
                  isActive && 'bg-primary text-white',
                )
              }
              title="База знаний"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </NavLink>
          ) : null}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border bg-page px-8 py-6">
          <div>
            {subtitle ? (
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {subtitle}
              </p>
            ) : null}
            <h1 className="text-2xl font-bold text-ink-heading">{title}</h1>
          </div>
          {actions}
        </header>
        <main className="flex-1 px-8 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
