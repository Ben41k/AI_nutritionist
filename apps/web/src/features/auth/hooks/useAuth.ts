import { useQuery } from '@tanstack/react-query';
import { apiJson } from '@/shared/services/apiClient';

export type AuthUser = { id: string; email: string; role: 'USER' | 'ADMIN' };

export function useAuth() {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const res = await apiJson<{ user: AuthUser | null }>('/auth/me');
      return res.user;
    },
    staleTime: 60_000,
  });
}
