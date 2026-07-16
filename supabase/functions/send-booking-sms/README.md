# send-booking-sms

SMS-подтверждение записи, оформленной на публичном сайте.

## Как работает

1. `public_book_chain` (миграция `082_booking_sms_confirmation.sql`) при
   успешной брони с сайта (`source='public_site'`) и указанном телефоне кладёт
   строку в `public.notifications_outbox` (`kind='sms'`, `status='pending'`).
   В `payload` — язык брони (`lang`: `ru|et|en`), телефон, имя, локальное время
   (`start_local`, зона Europe/Tallinn), услуги и мастера.
2. Эта Edge Function под `service_role` забирает pending-строки, рендерит
   локализованный текст и отправляет через **Twilio** (pay-as-you-go, без
   месячной платы и без минимума; аккаунт должен быть НЕ trial). Буквенный
   sender `AlesSanna` в EE — без предрегистрации. Русский шаблон укорочен до 1 сегмента
   (≤70 символов кириллицы), чтобы не платить за два part.
3. Помечает `sent` / `error`, растит `attempts`. После 5 неудач — `error`.

Язык SMS = язык страницы, на котором клиент оформил запись.

## Деплой

```bash
supabase functions deploy send-booking-sms --no-verify-jwt

# Секреты Twilio (Console → Account Info):
supabase secrets set TWILIO_ACCOUNT_SID=ACxxxxxxxx
supabase secrets set TWILIO_AUTH_TOKEN=xxxxxxxx
supabase secrets set SMS_SENDER='AlesSanna'      # буквенный sender ID (в EE)
                                                 # или купленный Twilio-номер
```

Аккаунт Twilio должен быть выведен из trial (привязать карту/пополнить), иначе
можно слать только на подтверждённые номера. На буквенного отправителя клиент
ответить не может — для подтверждений это норм.

`SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY` доступны в Edge-функциях
автоматически — задавать не нужно.

## Расписание (pg_cron + pg_net)

Выполнить один раз в SQL Editor (подставить project-ref):

```sql
select cron.schedule(
  'send-booking-sms-tick',
  '* * * * *',
  $$
    select net.http_post(
      url := 'https://<project-ref>.functions.supabase.co/send-booking-sms',
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  $$
);
```

Снять с расписания: `select cron.unschedule('send-booking-sms-tick');`

## Проверка

1. Оформить тестовую запись на сайте с телефоном (на любом из языков).
2. В `notifications_outbox` появится строка `kind='sms', status='pending'`.
3. После срабатывания cron (или ручного `curl` на URL функции) статус станет
   `sent`, придёт SMS. При ошибке — `status='error'`, текст в `last_error`.

Ручной прогон без cron:

```bash
curl -X POST 'https://<project-ref>.functions.supabase.co/send-booking-sms'
```

## Смена провайдера

Провайдер-специфична только функция `sendSms()` (endpoint, авторизация, тело
запроса). Для Telnyx / Vonage / smsapi поправить только её. Все — тоже
pay-as-you-go без месячной платы; Twilio дороже за штуку, но проще и с лучшей
докой.

## Текст SMS

Шаблоны — в `renderSms()` (`index.ts`), по одному на язык. Названия услуг
берутся из CRM как есть (в базе они на русском), а подписи полей
(Когда/Millal/When и т.д.) — на языке брони. Если нужно переводить и названия
услуг — добавить в функцию карту из `catalog-i18n.js`.
