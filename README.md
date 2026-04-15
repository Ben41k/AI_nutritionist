# AI-диетолог (MVP)

Монорепозиторий: **React 19 + Vite** (`apps/web`), **Fastify + Prisma** (`apps/api`), **PostgreSQL + pgvector** (Docker). Визуальная стилистика — по [design.html](design.html). Требования — [TZ-AI-dietitian.md](TZ-AI-dietitian.md).

## Предварительные условия

- Node.js LTS
- npm 9+
- Docker Desktop (для Postgres с pgvector) — опционально для локальной БД

## Быстрый старт

1. Поднимите базу:

   ```bash
   docker compose up -d
   ```

2. Создайте `apps/api/.env` на основе [.env.example](.env.example) в корне (скопируйте переменные в файл `apps/api/.env`). Укажите реальный `OPENROUTER_API_KEY`.

3. Установите зависимости и примените миграции:

   ```bash
   npm install
   cd apps/api
   npx prisma migrate deploy
   cd ../..
   ```

4. Запуск в режиме разработки (API + фронт с прокси `/api`):

   ```bash
   npm run dev
   ```

   - Фронт: http://localhost:5173  
   - API: http://localhost:3001  
   - Запросы с фронта идут на `/api/*` и проксируются на API; cookie сессии выставляются для origin фронта.

5. Первый пользователь с email, совпадающим с `BOOTSTRAP_ADMIN_EMAIL`, при регистрации получит роль **ADMIN** и доступ к `/admin/knowledge`.

## Скрипты

| Команда | Описание |
|--------|----------|
| `npm run dev` | concurrently: web + api |
| `npm run build` | сборка web и api |
| `npm run lint` | ESLint в обоих приложениях |
| `npm run format` | Prettier |
| `npm run reembed:knowledge -w apps/api` | пересчёт эмбеддингов всех чанков БЗ (после смены `OPENROUTER_EMBEDDING_MODEL`); опция `--documentId=<id>` |

## Критерии приёмки MVP (ТЗ §10)

1. Регистрация, вход, заполнение профиля.  
2. Добавление приёма пищи и список за день (`GET /meals?from=&to=` или `?date=`, с пагинацией `limit` / `cursor`).  
3. Чат с сохранением истории; при наличии документов в базе знаний ответы используют pgvector retrieval.  
4. `npx prisma migrate deploy` на чистой БД.  
5. Секреты только из окружения, не в репозитории.

## Полезные пути API

- `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/delete-account` (тело `{ "password": "..." }`, затем cookie сбрасывается)
- `GET/PATCH /profile`
- `GET/POST /meals`, `GET /meals?from=&to=` (или `?date=`) и опционально `limit`, `cursor`, `hasMore`, `nextCursor`
- `GET/POST /chat/threads`, `GET /chat/threads/:id/messages` (пагинация `limit` / `cursor`), `POST /chat/threads/:id/messages`
- Админ БЗ: `GET/POST/PATCH/DELETE /admin/knowledge/documents`, `POST /admin/knowledge/documents/upload` (multipart, поле `file`, опционально `title`; `.txt`/`.md`). Обновление чанков при смене контента — через `PATCH` документа (отдельный CRUD чанков не используется).

## Лимиты и приватность (MVP)

- Глобальный HTTP rate limit: `API_RATE_LIMIT_MAX` (на IP, в минуту). Ответ `429` с `error.code` **`RATE_LIMITED`**.
- Отдельные лимиты на вызовы OpenRouter: `API_LLM_RATE_LIMIT_MAX`, `API_LLM_RATE_LIMIT_WINDOW` (чат, анализ приёма с `analyzeWithModel`); для индексации БЗ: `API_KNOWLEDGE_INDEX_RATE_LIMIT_MAX`, `API_KNOWLEDGE_INDEX_RATE_LIMIT_WINDOW`. См. [apps/api/.env.example](apps/api/.env.example).

## Примечание по эмбеддингам

Размерность вектора в схеме Prisma: **1536** (`vector(1536)`). Используйте embedding-модель с 1536 измерениями (например `openai/text-embedding-3-small` через OpenRouter) и `EMBEDDING_DIMENSIONS=1536`. После смены `OPENROUTER_EMBEDDING_MODEL` выполните `npm run reembed:knowledge -w apps/api`, чтобы пересчитать векторы в `KnowledgeChunk` без ручного SQL.
