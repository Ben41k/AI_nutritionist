import { useState } from 'react';
import { Navigate, useMatches } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { AppShell } from '@/shared/components/AppShell';
import { Button } from '@/shared/components/Button';
import { ApiError, apiJson } from '@/shared/services/apiClient';

type Handle = { title?: string; subtitle?: string };

function logoutErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 502 || err.status === 503) {
      return 'Сервер недоступен (ошибка шлюза). Запустите API (порт 3001) или повторите позже.';
    }
    return err.message;
  }
  return 'Не удалось выйти. Проверьте соединение и повторите попытку.';
}

export function ProtectedLayout() {
  const { data: user, isLoading } = useAuth();
  const qc = useQueryClient();
  const matches = useMatches();
  const handle = (matches[matches.length - 1]?.handle ?? {}) as Handle;
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page text-ink-muted">
        Загрузка…
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  async function logout() {
    setLogoutError(null);
    setLoggingOut(true);
    try {
      await apiJson('/auth/logout', { method: 'POST' });
    } catch (err) {
      console.error('Logout failed', err);
      setLogoutError(logoutErrorMessage(err));
    } finally {
      setLoggingOut(false);
      await qc.invalidateQueries({ queryKey: ['auth', 'me'] });
    }
  }

  return (
    <AppShell
      title={handle.title ?? 'AI-диетолог'}
      subtitle={handle.subtitle}
      isAdmin={user.role === 'ADMIN'}
      actions={
        <div className="flex max-w-md flex-col items-end gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-right text-sm">
              <div className="font-semibold text-ink-heading">{user.email}</div>
              <div className="text-ink-muted">
                {user.role === 'ADMIN' ? 'Администратор' : 'Пользователь'}
              </div>
            </div>
            <Button variant="pill" disabled={loggingOut} onClick={() => void logout()}>
              {loggingOut ? 'Выход…' : 'Выйти'}
            </Button>
          </div>
          {logoutError ? <p className="text-right text-sm text-red-600">{logoutError}</p> : null}
        </div>
      }
    />
  );
}
