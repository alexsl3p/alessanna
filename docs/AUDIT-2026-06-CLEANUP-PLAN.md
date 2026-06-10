# Аудит платформы Alessanna (июнь 2026) и инструкция по чистке

Документ — результат полного аудита кода (лендинг, `work/`, `work-crm/`, `server/`, `supabase/`).
Часть 1 — находки. Часть 2 — пошаговая инструкция для исполнителя (Sonnet).

**Подтверждено владельцем:**
- `server/` (Express + SQLite) нигде не запускается — всё работает через Supabase. Мёртвый код.
- `work-crm/` (Next.js) не нужен — удалить. Основное приложение — `work/`.
- Объём работ: безопасность + чистка мусора + баги + оптимизация.

**Ключевой факт о деплое:** Vercel собирает только статику (`scripts/build-all.mjs` → `dist/`):
лендинг + Vite-сборка `work/` (отдаётся на `work.alessannailu.com` через `middleware.js` →
`dist/_crm_dist/`). Node-сервера в проде нет, все обращения к `/api/*` — мёртвые ветки
с graceful fallback на Supabase.

---

# Часть 1. Находки аудита

## 🔴 Критично (безопасность)

| # | Где | Что |
|---|-----|-----|
| 1 | `work/src/components/reception/ReceptionSidebar.tsx:323` | Пароль перехода ресепшен→CRM `"2025alessanna"` захардкожен во фронтенде — виден любому в JS-бандле. При вводе ставит `crm_role_override=manager` в sessionStorage. |
| 2 | `work/src/context/EffectiveRoleContext.tsx:32–35` | `crm_role_override` читается из sessionStorage без валидации против реальной роли из БД — эскалация роли через DevTools. |
| 3 | `supabase/migrations/031_...rls_and_search_path.sql:40–50` | RLS-политики `using(true) with check(true)` на `appointments`, `appointment_services`, `staff_services`, `staff_schedule`, `staff_time_off` — любой с anon-ключом видит/пишет все строки. Фронтенд-гейты — единственная защита. |
| 4 | `supabase/functions/google-calendar-sync/config.toml` | `verify_jwt = false` на edge-функции; функция при этом уже не нужна (синхронизация отключена миграцией 072). |
| 5 | `server/auth.js:6`, `server/db.js:161–188` | JWT-fallback `"dev-only-change-me"` и сид-пароль `"salon2026"` — уходит вместе с удалением `server/`; пароли остаются в истории git, при переиспользовании где-то ещё — сменить. |

Anon-ключ Supabase (`sb_publishable_...`) в `supabase-public-config.js` — публичный по дизайну, это нормально.

## 🟠 Баги

1. `work/src/lib/bookingSalonTz.ts:92–138` — кэш `salonDayStartUtcCache` (Map) никогда не чистится: стейл после перехода DST + неограниченный рост памяти.
2. `work/src/context/AuthContext.tsx:180` — флаг `google_auth_error` в sessionStorage не чистится при bootstrap, может протекать между попытками входа/вкладками.
3. `en/index.html` (~строка 134) — `-` вместо `—` в `data-selected-master-display`, расхождение с ru/et.
4. `work-crm/components/QrPanel.tsx:72–92` (гонка интервалов поллинга) и `work-crm/app/calendar/page.tsx:17–21` (наивная date-math) — устраняются удалением `work-crm/`.
5. `server/reminders.js` — запрашивает несуществующую в Supabase таблицу/поля — устраняется удалением `server/`.

## 🟡 Мёртвый код и мусор

| Что | Размер/строки | Почему мёртвое |
|-----|--------------|----------------|
| `server/` целиком | ~116KB | Не деплоится, не запускается (подтверждено владельцем) |
| `work-crm/` целиком | ~164KB | Старая Next.js CRM, не в сборке, дублирует `work/` |
| `gcal-test/` | **5.2MB** | Закоммиченный билд заброшенного эксперимента |
| `tmp-audit/` | 72KB | Заброшенное chrome-расширение |
| `legacy-work-qr/` | 52KB | Старый QR-вход, нигде не подключён |
| `work.html` / `work.js` / `work.css` | ~1000 строк | Legacy «phone CRM demo», не слинкованы, но копируются в прод-сборку |
| `scripts/import-google-calendar.mjs` | 319 строк | Ручной импорт из Google, синхронизация удалена |
| `supabase/functions/google-calendar-sync`, `google-calendar-import` | 1200+ строк | Синхронизация отключена миграцией 072 |
| Ветки `/api/*` в `script.js` (~3472, 3898, 3915, 3922, 4373) | — | API не существует, рабочий путь — Supabase RPC + mailto |
| `work/src/context/AuthContext.tsx:220–235` | — | Fallback на RPC `verify_staff_phone` («можно удалить через несколько релизов») |
| `work/src/types/database.ts:42–51` | — | Поля `google_calendar_*`, `calendar_email` — не читаются нигде |
| npm-зависимости корня | — | `express`, `better-sqlite3`, `bcryptjs`, `cookie-parser`, `jsonwebtoken`, `node-telegram-bot-api`, `stripe` нужны только `server/` |

## 🟢 Оптимизация

1. Картинки лендинга: `assets/salon-bg.png`, `henna-bg.png`, `kolorist-bg.png` — по **1.7MB**, без WebP и lazy-load.
2. `script.js` (197KB) и `styles.css` (92KB) отдаются неминифицированными.
3. 6+ несогласованных `setInterval` в `work/`: `Layout.tsx:269` (10s), `Layout.tsx:291` (15s), `ReceptionWeekGrid.tsx:307` (60s), `MyHelpPage.tsx:171,183` (5s/2s), `AdminSupportPage.tsx:336,382` — поллинг продолжается в фоновых вкладках.
4. `ReceptionWeekGrid.tsx` (755 строк) — нет `React.memo`/`useMemo` на блоках записей.
5. `ServiceListPicker.tsx:55,74` — синхронная запись в localStorage на каждый клик.

## ✅ Что в порядке (не трогать)

- Букинг-цепочка лендинга: Supabase RPC `public_book_chain` → mailto-fallback, валидации на месте.
- csel-дропдауны стабилизированы серией коммитов — поведение не менять.
- `middleware.js` (прокси work.alessannailu.com → `_crm_dist/`) — корректный.
- Защита от двойного бронирования: триггер `060_appointments_no_overlap_guard.sql`.
- Миграции без конфликтов; отключение Google-синхронизации (072) сделано чисто.

---

# Часть 2. Инструкция для исполнителя (Sonnet)

**Ветка:** создать `cleanup/full-audit-test` от `main`. НЕ пушить в `main`, PR не создавать без запроса владельца. Отдельный коммит на каждую фазу.

## Фаза 1. Удаление мёртвого кода (первой — уберёт половину багов)

1. **Проверка перед удалением:** `grep -rn "/api/" work/src/` — убедиться, что ничего критичного в `work/` не ходит ТОЛЬКО на Express API без Supabase-фоллбека. Если ходит — остановиться и доложить.
2. Удалить: `server/`, `work-crm/`, `legacy-work-qr/`, `gcal-test/`, `tmp-audit/`, `work.html`, `work.js`, `work.css`, `scripts/import-google-calendar.mjs`.
3. `package.json` (корень): удалить scripts `start`, `dev`, `crm:*`, `google:import*`; зависимости `express`, `better-sqlite3`, `bcryptjs`, `cookie-parser`, `jsonwebtoken`, `node-telegram-bot-api`, `stripe`. `dotenv` и `@supabase/supabase-js` удалить только если не используются в `scripts/*.mjs` / `site-*.mjs`. Обновить `main` и `description`. Перегенерировать `package-lock.json`.
4. `scripts/build-all.mjs`: убрать копирование `work.html`, `work.js`, `work.css` (~строки 73–84). Для `public-site/book.*` (~100–105): если grep не находит ссылок на `book.html` — удалить `public-site/` и копирование; иначе оставить, но убрать из `public-site/book.js:5–45, 305–345` вызов edge-функции `google-calendar-sync` (прямой RPC `public_book_chain` уже есть как fallback).
5. `script.js`: удалить мёртвые ветки `/api/health`, `/api/public/employees`, `/api/public/services`, `/api/public/calendar-month`, `POST /api/public/bookings` — не ломая цепочку Supabase RPC → mailto.
6. `work/src/context/AuthContext.tsx:220–235`: удалить fallback `verify_staff_phone` после проверки (Supabase MCP `list_migrations`), что миграция 041+ применена на проде.
7. `work/src/types/database.ts:42–51`: убрать поля `google_calendar_*`, `calendar_email` из типов. Колонки в БД НЕ трогать.
8. `supabase/functions/google-calendar-sync/`, `google-calendar-import/`: удалить из репо (задеплоенные функции удалить через Supabase MCP, если доступен; иначе пометить в отчёте). `send-followup-emails` — проверить активность, по умолчанию оставить.
9. `work/src/lib/receptionLayout.ts:232–261` (`legacyOrderToRows`): оставить, добавить TODO-комментарий с условием удаления (миграция сохранённых раскладок).

## Фаза 2. Безопасность

1. **Пароль ресепшен→CRM:** новая миграция (следующий свободный номер) — таблица/строка настроек с bcrypt-хэшем пароля + RPC `verify_crm_access(password text)` (security definer, `revoke from public`, grant anon/authenticated). Хэш от текущего `2025alessanna` (UX не меняется). В `ReceptionSidebar.tsx` заменить сравнение строки на вызов RPC.
2. **Role override:** в `EffectiveRoleContext.tsx` override может только понижать роль относительно реальной роли из AuthContext; повышение — только после успешного `verify_crm_access`, хранить с меткой времени и сроком (12ч).
3. **RLS:** политики НЕ менять автоматически. Снять предупреждения через Supabase MCP `get_advisors` (security) и написать `docs/rls-hardening-plan.md` с предложением политик под staff-аутентификацию — владелец решит отдельно.
4. `AuthContext.tsx:180`: ошибку Google-входа держать в state контекста; sessionStorage-ключ чистить при bootstrap.
5. `work/src/pages/LoginPage.tsx:252`: e-mail ресепшена → `VITE_RECEPTION_EMAIL` с текущим значением как дефолтом (низкий приоритет).

## Фаза 3. Баги

1. `bookingSalonTz.ts:92–138`: ограничить кэш (LRU или очистка при >1000 записей) + инвалидация по возрасту.
2. `en/index.html:~134`: унифицировать `—` с остальными локалями.
3. Логика «скрыть выбор мастера до выбора услуги» (`script.js:1272,1278,1282,1925`): поведение НЕ менять (текущее = скрывать), только проверить, что label и wrap скрываются/показываются синхронно при смене категории/услуги.

## Фаза 4. Оптимизация

1. WebP-версии `salon-bg`, `henna-bg`, `kolorist-bg` + `<picture>`/`image-set()` с PNG-фоллбеком, lazy для ниже фолда. Во всех 4 html (корень + ru/en/et).
2. В `build-all.mjs` минифицировать `script.js`/`styles.css` через `esbuild` (devDependency) при копировании в dist. Исходники не трогать.
3. Общий хук `useVisiblePolling`: пауза интервалов при `document.visibilityState === "hidden"` (Layout, ReceptionWeekGrid, MyHelpPage, AdminSupportPage). Объединение в один тикер/WebSocket — не в этой ветке.
4. `React.memo` на блоки записей + `useMemo` на фильтрацию списков в `ReceptionWeekGrid.tsx`.
5. Дебаунс (~300ms) записи в localStorage в `ServiceListPicker.tsx:55,74`.

## Что НЕ делать

- Не трогать `main`, не создавать PR без запроса.
- Не редактировать/удалять существующие Supabase-миграции.
- Не менять RLS-политики (только документ-предложение).
- Не менять UX букинг-виджета и csel-дропдаунов.
- Не дропать колонки в БД.

## Верификация

1. `node scripts/build-all.mjs` — сборка проходит; в `dist/` нет `work.html`/`work.js`, есть лендинг + `_crm_dist/`.
2. `cd work && npx tsc --noEmit && npm run build` — без ошибок.
3. Лендинг (`npx serve dist`): букинг до отправки (RPC/mailto), csel-дропдауны, появление выбора мастера после выбора услуги, локали ru/en/et.
4. CRM (`work/`, `npm run dev`): вход email + Google, вход ресепшена, переход ресепшен→CRM по паролю через новый RPC, календарь недели, создание записи.
5. `grep -rn "work-crm\|legacy-work-qr\|gcal-test\|/api/public\|/api/crm" .` (кроме миграций/доков) — нет битых ссылок.
6. Итоговый отчёт: удалено (с размерами), исправлено, отложено (RLS-план), открытые вопросы.
