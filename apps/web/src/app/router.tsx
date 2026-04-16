import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedLayout } from './ProtectedLayout';
import { AdminGuard } from './AdminGuard';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { RegisterPage } from '@/features/auth/pages/RegisterPage';
import { PRIMARY_NAV } from '@/shared/constants/primaryNav';

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
        handle: { title: PRIMARY_NAV.metrics.pageTitle, subtitle: PRIMARY_NAV.metrics.description },
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
        handle: { title: PRIMARY_NAV.meals.pageTitle, subtitle: PRIMARY_NAV.meals.description },
      },
      {
        path: 'ration',
        lazy: async () => {
          const { RationPage } = await import('@/features/ration/pages/RationPage');
          return { Component: RationPage };
        },
        handle: { title: PRIMARY_NAV.ration.pageTitle, subtitle: PRIMARY_NAV.ration.description },
      },
      {
        path: 'chat',
        lazy: async () => {
          const { ChatWorkspacePage } = await import('@/features/chat/pages/ChatWorkspacePage');
          return { Component: ChatWorkspacePage };
        },
        handle: { title: PRIMARY_NAV.chat.pageTitle, subtitle: PRIMARY_NAV.chat.description },
        children: [
          {
            index: true,
            lazy: async () => {
              const { ChatEmptyRight } = await import('@/features/chat/pages/ChatEmptyRight');
              return { Component: ChatEmptyRight };
            },
            handle: { title: PRIMARY_NAV.chat.pageTitle, subtitle: PRIMARY_NAV.chat.description },
          },
          {
            path: ':threadId',
            lazy: async () => {
              const { ChatThreadPage } = await import('@/features/chat/pages/ChatThreadPage');
              return { Component: ChatThreadPage };
            },
            handle: {
              title: PRIMARY_NAV.chat.pageTitle,
              subtitle: 'Сообщения в этом чате с AI-ассистентом по питанию.',
            },
          },
        ],
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
