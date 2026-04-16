import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/shared/hooks/useToast';
import { apiJson, ApiError } from '@/shared/services/apiClient';
import { Button } from '@/shared/components/Button';
import { Input } from '@/shared/components/Input';
import { Card } from '@/shared/components/Card';
import { USER_INPUT } from '@/shared/lib/userInputBounds';

export function RegisterPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiJson('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          password: password.slice(0, USER_INPUT.passwordMaxChars),
        }),
      });
      await qc.invalidateQueries({ queryKey: ['auth', 'me'] });
      nav('/');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Не удалось зарегистрироваться');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4">
      <Card className="w-full max-w-md">
        <h1 className="mb-1 text-xl font-bold text-ink-heading">Регистрация</h1>
        <p className="mb-6 text-sm text-ink-muted">Минимум 8 символов в пароле</p>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-muted">Email</label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              maxLength={254}
              autoComplete="email"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-muted">Пароль</label>
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={USER_INPUT.passwordMaxChars}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Создание…' : 'Создать аккаунт'}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-ink-muted">
          Уже есть аккаунт?{' '}
          <Link className="font-semibold text-primary hover:underline" to="/login">
            Вход
          </Link>
        </p>
      </Card>
    </div>
  );
}
