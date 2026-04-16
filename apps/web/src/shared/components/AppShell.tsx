import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

const nav = [
  { to: '/', label: 'Метрики', icon: 'chart' },
  { to: '/meals', label: 'Дневник', icon: 'meal' },
  { to: '/ration', label: 'Рацион', icon: 'ration' },
  { to: '/chat', label: 'Чат', icon: 'chat' },
] as const;

type NavIcon = (typeof nav)[number]['icon'];

function Icon({ name }: { name: NavIcon }) {
  const common = 'h-5 w-5';
  if (name === 'chart')
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 19h16" />
        <path d="M7 15v-4" />
        <path d="M12 15V9" />
        <path d="M17 15V5" />
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
  if (name === 'ration')
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4" />
        <path d="M8 2v4" />
        <path d="M3 10h18" />
        <path d="M8 14h.01" />
        <path d="M12 14h.01" />
        <path d="M16 14h.01" />
        <path d="M8 18h.01" />
        <path d="M12 18h.01" />
        <path d="M16 18h.01" />
      </svg>
    );
  return (
    <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

const SIDEBAR_PINNED_STORAGE_KEY = 'ai-nutritionist-sidebar-pinned';

function readSidebarPinnedFromStorage(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(SIDEBAR_PINNED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

const SIDEBAR_TRANSITION = 'transition-[width] duration-500 ease-in-out';
const SIDEBAR_LABEL_TRANSITION = 'transition-[max-width,opacity] duration-500 ease-in-out';
/** Без скачка w-11 ↔ w-full: строка всегда на ширину сайдбара, меняются отступы и выравнивание */
const SIDEBAR_ROW_TRANSITION =
  'transition-[justify-content,gap,padding,border-radius] duration-500 ease-in-out';

function SidebarPinChevron({ pinned, expanded }: { pinned: boolean; expanded: boolean }) {
  return (
    <svg
      className={clsx(
        'h-5 w-5 shrink-0 origin-center transition-transform duration-500 ease-in-out',
        expanded && 'rotate-90',
        pinned && 'scale-110',
      )}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="15 7 9 12 15 17" />
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
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [sidebarPinned, setSidebarPinned] = useState(readSidebarPinnedFromStorage);
  const sidebarExpanded = sidebarPinned || sidebarHovered;

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_PINNED_STORAGE_KEY, sidebarPinned ? 'true' : 'false');
    } catch {
      // storage disabled / quota
    }
  }, [sidebarPinned]);

  return (
    <div className="flex min-h-screen">
      <aside
        className={clsx(
          'sticky top-0 flex h-screen max-h-screen shrink-0 flex-col overflow-hidden border-r border-border bg-surface py-5 pl-2 pr-2 self-start',
          SIDEBAR_TRANSITION,
          sidebarExpanded ? 'w-56' : 'w-sidebar',
        )}
        onMouseEnter={() => setSidebarHovered(true)}
        onMouseLeave={() => setSidebarHovered(false)}
      >
        <div
          className={clsx(
            'mb-8 flex min-h-11 w-full items-center overflow-hidden',
            SIDEBAR_ROW_TRANSITION,
            sidebarExpanded ? 'justify-start gap-2.5' : 'justify-center gap-0',
          )}
        >
          <div className="grid shrink-0 grid-cols-2 gap-1">
            <span className="h-3.5 w-3.5 rounded-full bg-primary/85" />
            <span className="h-3.5 w-3.5 rounded-full bg-primary/85" />
            <span className="h-3.5 w-3.5 rounded-full bg-primary/85" />
            <span className="h-3.5 w-3.5 rounded-full bg-primary/85" />
          </div>
          <span
            className={clsx(
              'overflow-hidden whitespace-nowrap text-sm font-bold tracking-tight text-ink-heading',
              SIDEBAR_LABEL_TRANSITION,
              sidebarExpanded ? 'max-w-[11rem] opacity-100' : 'max-w-0 opacity-0',
            )}
          >
            AI-диетолог
          </span>
        </div>
        <nav className="flex min-h-0 flex-1 flex-col items-stretch gap-2">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => {
                const chatActive = item.to === '/chat' && location.pathname.startsWith('/chat');
                const active = isActive || chatActive;
                return clsx(
                  'flex h-11 w-full shrink-0 items-center overflow-hidden text-ink-muted transition-colors hover:bg-primary-soft hover:text-primary',
                  SIDEBAR_ROW_TRANSITION,
                  sidebarExpanded
                    ? 'justify-start gap-3 rounded-xl px-3'
                    : 'justify-center gap-0 rounded-full px-0',
                  active && 'bg-primary text-white hover:bg-primary hover:text-white',
                );
              }}
              title={item.label}
            >
              <span className="flex shrink-0 items-center justify-center [&>svg]:shrink-0">
                <Icon name={item.icon} />
              </span>
              <span
                className={clsx(
                  'overflow-hidden whitespace-nowrap text-left text-sm font-semibold',
                  SIDEBAR_LABEL_TRANSITION,
                  sidebarExpanded ? 'max-w-[9rem] opacity-100' : 'max-w-0 opacity-0',
                )}
              >
                {item.label}
              </span>
            </NavLink>
          ))}
          {isAdmin ? (
            <NavLink
              to="/admin/knowledge"
              className={({ isActive }) =>
                clsx(
                  'mt-2 flex h-11 w-full shrink-0 items-center overflow-hidden text-ink-muted transition-colors hover:bg-primary-soft hover:text-primary',
                  SIDEBAR_ROW_TRANSITION,
                  sidebarExpanded
                    ? 'justify-start gap-3 rounded-xl px-3'
                    : 'justify-center gap-0 rounded-full px-0',
                  isActive && 'bg-primary text-white',
                )
              }
              title="База знаний"
            >
              <span className="flex shrink-0 items-center justify-center">
                <svg
                  className="h-5 w-5 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
              </span>
              <span
                className={clsx(
                  'overflow-hidden whitespace-nowrap text-left text-sm font-semibold',
                  SIDEBAR_LABEL_TRANSITION,
                  sidebarExpanded ? 'max-w-[9rem] opacity-100' : 'max-w-0 opacity-0',
                )}
              >
                База знаний
              </span>
            </NavLink>
          ) : null}
        </nav>
        <button
          type="button"
          className={clsx(
            'mx-auto mt-3 grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-muted transition-colors hover:bg-primary-soft hover:text-primary',
            sidebarPinned && 'bg-primary-soft text-primary hover:bg-primary-soft',
          )}
          aria-pressed={sidebarPinned}
          aria-label={sidebarPinned ? 'Открепить меню' : 'Закрепить меню открытым'}
          title={sidebarPinned ? 'Открепить меню' : 'Закрепить меню открытым'}
          onClick={() => setSidebarPinned((p) => !p)}
        >
          <SidebarPinChevron pinned={sidebarPinned} expanded={sidebarExpanded} />
        </button>
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
