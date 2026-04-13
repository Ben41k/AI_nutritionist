import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Card } from '@/shared/components/Card';

const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(90,103,216,0.35)] transition hover:bg-primary-hover';
const btnPill =
  'inline-flex items-center justify-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-ink-body transition hover:border-primary hover:shadow-soft';

export function HomePage() {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card lavender>
        <h2 className="mb-2 text-lg font-bold text-ink-heading">Персональный рацион</h2>
        <p className="mb-4 text-sm text-ink-body">
          Заполните профиль — цели, активность и ограничения помогут AI давать более точные советы.
        </p>
        <Link className={clsx(btnPrimary, 'w-full sm:w-auto')} to="/profile">
          К профилю
        </Link>
      </Card>
      <Card>
        <h2 className="mb-2 text-lg font-bold text-ink-heading">Дневник питания</h2>
        <p className="mb-4 text-sm text-ink-muted">
          Фиксируйте приёмы пищи и при необходимости получайте оценку БЖУ от модели.
        </p>
        <Link className={btnPill} to="/meals">
          Открыть дневник
        </Link>
      </Card>
      <Card>
        <h2 className="mb-2 text-lg font-bold text-ink-heading">Чат с ассистентом</h2>
        <p className="mb-4 text-sm text-ink-muted">
          Вопросы в свободной форме с учётом вашего контекста и базы знаний.
        </p>
        <Link className={btnPill} to="/chat">
          ✦ Спросить AI
        </Link>
      </Card>
    </div>
  );
}
