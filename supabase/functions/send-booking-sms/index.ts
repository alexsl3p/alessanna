// supabase/functions/send-booking-sms/index.ts
// ----------------------------------------------------------------------------
// Edge function: отправка SMS-подтверждения записи с сайта.
//
// Каждый вызов:
//   1. Берёт до BATCH_SIZE строк notifications_outbox где kind='sms',
//      status='pending'.
//   2. Рендерит локализованный текст (payload.lang: ru | et | en).
//   3. Отправляет через Twilio Messages API.
//   4. Помечает sent / error (с last_error и attempts++).
//   5. После MAX_ATTEMPTS неудач строка уходит в status='error' навсегда.
//
// Провайдер: Twilio (pay-as-you-go, без месячной платы и без минимума).
// Alphanumeric sender 'AlesSanna' в Эстонию — без предрегистрации, но аккаунт
// должен быть НЕ trial (привязать карту / пополнить).
//
// Деплой:
//   supabase functions deploy send-booking-sms --no-verify-jwt
//   supabase secrets set TWILIO_ACCOUNT_SID=ACxxxxxxxx
//   supabase secrets set TWILIO_AUTH_TOKEN=xxxxxxxx
//   supabase secrets set SMS_SENDER='AlesSanna'   # буквенный sender ID (в EE)
//                                                 # или купленный Twilio-номер +1.../+372...
//
// Расписание (pg_cron, каждую минуту):
//   select cron.schedule('send-booking-sms-tick', '* * * * *', $$
//     select net.http_post(
//       url := 'https://<project-ref>.functions.supabase.co/send-booking-sms',
//       headers := jsonb_build_object('Content-Type','application/json')
//     );
//   $$);
//
// Сменить провайдера (Telnyx, Vonage, smsapi) — правьте только sendSms().
// ----------------------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type OutboxRow = {
  id: string;
  appointment_id: string | null;
  kind: string;
  payload: {
    lang?: string;
    phone?: string;
    client_name?: string;
    start_at?: string;
    start_local?: string;
    items?: Array<{ service_name?: string; staff_name?: string }>;
    salon_phone?: string;
  } | null;
  status: string;
  attempts: number;
};

const BATCH_SIZE = 25;
const MAX_ATTEMPTS = 5;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const SMS_SENDER = Deno.env.get("SMS_SENDER") ?? "AlesSanna";

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type Lang = "ru" | "et" | "en";

function normLang(raw: string | undefined): Lang {
  const l = String(raw ?? "et").toLowerCase().slice(0, 2);
  return l === "ru" || l === "en" ? l : "et";
}

// Localized confirmation text. Kept short — SMS is billed per 160 chars
// (70 for non-GSM/Cyrillic), so the Russian variant is deliberately compact.
function renderSms(payload: NonNullable<OutboxRow["payload"]>): string {
  const lang = normLang(payload.lang);
  const name = (payload.client_name ?? "").trim();
  const when = payload.start_local ?? "";
  const items = Array.isArray(payload.items) ? payload.items : [];
  const service = items.map((i) => i?.service_name).filter(Boolean).join(", ");
  const master = items.map((i) => i?.staff_name).filter(Boolean).filter((v, idx, a) => a.indexOf(v) === idx).join(", ");
  const phone = payload.salon_phone ?? "+372 529 8225";
  // Short date without the year, e.g. "21.07.2026 12:00" -> "21.07 12:00".
  const shortWhen = when.replace(/\.\d{4}/, "");

  if (lang === "ru") {
    // Cyrillic is UCS-2: one SMS segment = 70 chars. Keep the whole message
    // within one segment (all chars are BMP, so .length == UCS-2 units).
    const full = `AlesSanna: запись ${shortWhen}${master ? ", " + master : ""} подтверждена`;
    return full.length <= 70 ? full : `AlesSanna: запись ${shortWhen} подтверждена`;
  }
  if (lang === "en") {
    const lines = [
      `${name ? name + ", y" : "Y"}our AlesSanna booking is confirmed.`,
      when ? `When: ${when}` : "",
      service ? `Service: ${service}` : "",
      master ? `Master: ${master}` : "",
      `Tel: ${phone}`,
    ];
    return lines.filter(Boolean).join("\n");
  }
  // et (default)
  const lines = [
    `${name ? name + ", s" : "S"}inu broneering AlesSannas on kinnitatud.`,
    when ? `Millal: ${when}` : "",
    service ? `Teenus: ${service}` : "",
    master ? `Meister: ${master}` : "",
    `Tel: ${phone}`,
  ];
  return lines.filter(Boolean).join("\n");
}

// Normalize to E.164 for Twilio. Estonian numbers are 8 digits; the site
// stores them variously (with/without +372). Best-effort only.
function toE164(raw: string): string {
  let s = String(raw ?? "").replace(/[^\d+]/g, "");
  if (!s) return "";
  if (s.startsWith("+")) return s;
  if (s.startsWith("00")) return "+" + s.slice(2);
  if (s.startsWith("372")) return "+" + s;
  // bare Estonian mobile (starts with 5, 7-8 digits) → prefix +372
  if (/^5\d{6,7}$/.test(s)) return "+372" + s;
  return "+" + s;
}

async function sendSms(to: string, text: string): Promise<{ ok: boolean; ref?: string; error?: string }> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    return { ok: false, error: "TWILIO_ACCOUNT_SID/AUTH_TOKEN not set" };
  }
  const e164 = toE164(to);
  if (!e164) return { ok: false, error: "empty phone" };

  const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
  const form = new URLSearchParams({ To: e164, From: SMS_SENDER, Body: text });
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    },
  );

  const bodyText = await res.text();
  if (!res.ok) {
    return { ok: false, error: `Twilio ${res.status}: ${bodyText.slice(0, 500)}` };
  }
  let ref: string | undefined;
  try {
    ref = JSON.parse(bodyText)?.sid;
  } catch {
    ref = undefined;
  }
  return { ok: true, ref };
}

async function processOnce(): Promise<{ processed: number; sent: number; failed: number }> {
  const { data: jobs, error } = await sb
    .from("notifications_outbox")
    .select("id, appointment_id, kind, payload, status, attempts")
    .eq("kind", "sms")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error("[send-booking-sms] load jobs failed", error);
    return { processed: 0, sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;
  for (const job of (jobs ?? []) as OutboxRow[]) {
    const payload = job.payload ?? {};
    const phone = payload.phone ?? "";
    if (!phone) {
      await sb
        .from("notifications_outbox")
        .update({ status: "skipped", last_error: "no phone", last_attempt_at: new Date().toISOString() })
        .eq("id", job.id);
      continue;
    }
    const text = renderSms(payload);
    const r = await sendSms(phone, text);
    if (r.ok) {
      await sb
        .from("notifications_outbox")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          last_attempt_at: new Date().toISOString(),
          attempts: job.attempts + 1,
          external_ref: r.ref ?? null,
        })
        .eq("id", job.id);
      sent++;
    } else {
      const nextAttempts = job.attempts + 1;
      const finalStatus = nextAttempts >= MAX_ATTEMPTS ? "error" : "pending";
      await sb
        .from("notifications_outbox")
        .update({
          status: finalStatus,
          attempts: nextAttempts,
          last_error: r.error ?? "",
          last_attempt_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      failed++;
    }
  }
  return { processed: (jobs ?? []).length, sent, failed };
}

Deno.serve(async (_req: Request) => {
  try {
    const result = await processOnce();
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    console.error("[send-booking-sms] fatal", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});
