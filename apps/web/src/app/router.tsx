import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedLayout } from './ProtectedLayout';
import { AdminGuard } from './AdminGuard';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { RegisterPage } from '@/features/auth/pages/RegisterPage';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  {
    path: '/',
    element: <ProtectedLayout />,
    children: [
      {
        index: true,
        lazy: async () => {
          const { DashboardPage } = await import('@/features/dashboard/pages/DashboardPage');
          return { Component: DashboardPage };
        },
        handle: { title: 'Метрики', subtitle: 'Калькулятор и аналитика' },
      },
      {
        path: 'profile',
        lazy: async () => {
          const { ProfilePage } = await import('@/features/profile/pages/ProfilePage');
          return { Component: ProfilePage };
        },
        handle: { title: 'Профиль', subtitle: 'Цели и ограничения' },
      },
      {
        path: 'meals',
        lazy: async () => {
          const { MealsPage } = await import('@/features/meals/pages/MealsPage');
          return { Component: MealsPage };
        },
        handle: { title: 'Дневник питания', subtitle: 'Приёмы пищи' },
      },
      {
        path: 'ration',
        lazy: async () => {
          const { RationPage } = await import('@/features/ration/pages/RationPage');
          return { Component: RationPage };
        },
        handle: { title: 'Рацион', subtitle: 'Примерный план на месяц' },
      },
      {
        path: 'chat',
        lazy: async () => {
          const { ChatListPage } = await import('@/features/chat/pages/ChatListPage');
          return { Component: ChatListPage };
        },
        handle: { title: 'Чат с AI', subtitle: 'Диетолог-ассистент' },
      },
      {
        path: 'chat/:threadId',
        lazy: async () => {
          const { ChatThreadPage } = await import('@/features/chat/pages/ChatThreadPage');
          return { Component: ChatThreadPage };
        },
        handle: { title: 'Диалог', subtitle: 'Чат с AI' },
      },
      {
        path: 'admin/knowledge',
        lazy: async () => {
          const { AdminKnowledgePage } = await import('@/features/admin/pages/AdminKnowledgePage');
          function AdminKnowledgeRoute() {
            return (
              <AdminGuard>
                <AdminKnowledgePage />
              </AdminGuard>
            );
          }
          return { Component: AdminKnowledgeRoute };
        },
        handle: { title: 'База знаний', subtitle: 'Администрирование' },
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
