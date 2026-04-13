import { Suspense } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';

/**
 * Централизованный роутер приложения (см. также `router.tsx` / `router.ts`).
 */
export function AppRouter() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-page text-ink-muted">
          Загрузка…
        </div>
      }
    >
      <RouterProvider router={router} />
    </Suspense>
  );
}
