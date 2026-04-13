import { Navigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { AppShell } from '@/shared/components/AppShell';
import { Button } from '@/shared/components/Button';
import { apiJson } from '@/shared/services/apiClient';
import { useQueryClient } from '@tanstack/react-query';
import { useMatches } from 'react-router-dom';

type Handle = { title?: string; subtitle?: string };

export function ProtectedLayout() {
  const { data: user, isLoading } = useAuth();
  const qc = useQueryClient();
  const matches = useMatches();
  const handle = (matches[matches.length - 1]?.handle ?? {}) as Handle;

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
    await apiJson('/auth/logout', { method: 'POST' });
    await qc.invalidateQueries({ queryKey: ['auth', 'me'] });
  }

  return (
    <AppShell
      title={handle.title ?? 'AI-диетолог'}
      subtitle={handle.subtitle}
      isAdmin={user.role === 'ADMIN'}
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-right text-sm">
            <div className="font-semibold text-ink-heading">{user.email}</div>
            <div className="text-ink-muted">
              {user.role === 'ADMIN' ? 'Администратор' : 'Пользователь'}
            </div>
          </div>
          <Button variant="pill" onClick={() => void logout()}>
            Выйти
          </Button>
        </div>
      }
    />
  );
}
