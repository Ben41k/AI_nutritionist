import { Navigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/hooks/useAuth';

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useAuth();
  if (isLoading) return <div className="p-6 text-ink-muted">Загрузка…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'ADMIN') return <Navigate to="/" replace />;
  return <>{children}</>;
}
