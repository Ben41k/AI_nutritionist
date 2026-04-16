import { Outlet } from 'react-router-dom';
import { ChatSidebar } from '@/features/chat/components/ChatSidebar';

/** Единый экран чата: список диалогов слева, активный чат справа на всё оставшееся место. */
export function ChatWorkspacePage() {
  return (
    <div className="flex w-full flex-col overflow-hidden rounded-2xl border border-border bg-page/80 shadow-sm shadow-black/[0.02] md:h-[calc(100dvh-10.5rem)] md:min-h-[22rem] md:max-h-[calc(100dvh-10.5rem)] md:flex-row">
      <ChatSidebar />
      <section className="flex min-h-[min(46dvh,24rem)] min-w-0 flex-1 flex-col border-t border-border md:min-h-0 md:border-l md:border-t-0">
        <Outlet />
      </section>
    </div>
  );
}
