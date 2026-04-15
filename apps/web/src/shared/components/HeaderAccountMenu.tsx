import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Button } from '@/shared/components/Button';

function UserMenuIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export function HeaderAccountMenu({
  email,
  roleLabel,
  loggingOut,
  onLogout,
  logoutError,
}: {
  email: string;
  roleLabel: string;
  loggingOut: boolean;
  onLogout: () => void;
  logoutError: string | null;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const profileActive = location.pathname === '/profile';

  return (
    <div ref={rootRef} className="relative flex flex-col items-end gap-2">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Меню аккаунта"
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          'grid h-14 w-14 place-items-center rounded-full border border-border bg-surface text-ink-heading shadow-sm transition',
          'hover:border-primary/45 hover:bg-primary-soft hover:text-primary',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-page',
          (open || profileActive) &&
            'border-transparent bg-primary text-white shadow-[0_4px_14px_rgba(90,103,216,0.35)] hover:border-transparent hover:bg-primary hover:text-white',
        )}
      >
        <UserMenuIcon className="h-8 w-8" />
      </button>

      {open ? (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-border bg-surface py-2 shadow-[0_8px_30px_rgba(15,23,42,0.12)]"
          role="menu"
        >
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-sm font-semibold text-ink-heading">{email}</p>
            <p className="text-xs text-ink-muted">{roleLabel}</p>
          </div>
          <NavLink
            to="/profile"
            role="menuitem"
            className={({ isActive }) =>
              clsx(
                'block px-4 py-3 text-sm font-medium transition hover:bg-primary-soft',
                isActive ? 'text-primary' : 'text-ink-body',
              )
            }
            onClick={() => setOpen(false)}
          >
            Профиль
          </NavLink>
          <div className="border-t border-border px-4 py-3">
            <Button
              variant="pill"
              className="w-full"
              disabled={loggingOut}
              onClick={() => {
                void onLogout();
              }}
            >
              {loggingOut ? 'Выход…' : 'Выйти'}
            </Button>
          </div>
        </div>
      ) : null}

      {logoutError ? <p className="max-w-xs text-right text-sm text-red-600">{logoutError}</p> : null}
    </div>
  );
}
