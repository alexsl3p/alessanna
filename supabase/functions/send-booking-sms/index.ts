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

type Lang = "et" | "en";

// Salon policy: RU and ET pages → Estonian SMS; EN page → English SMS.
function normLang(raw: string | undefined): Lang {
  const l = String(raw ?? "et").toLowerCase().slice(0, 2);
  return l === "en" ? "en" : "et";
}

// RU → et/en service names (mirror of catalog-i18n.js). CRM stores names in
// Russian; the SMS localizes them to the booking language.
const SERVICE_I18N: Record<string, { et: string; en: string }> = {
  "Коррекция бровей": { et: "Kulmude korrigeerimine", en: "Eyebrow shaping" },
  "Окрашивание бровей": { et: "Kulmude värvimine", en: "Eyebrow tinting" },
  "Окрашивание ресниц": { et: "Ripsmete värvimine", en: "Eyelash tinting" },
  "Окрашивание бровей и ресниц + коррекция": { et: "Kulmude ja ripsmete värvimine + korrigeerimine", en: "Brow & lash tinting + shaping" },
  "Классический маникюр": { et: "Klassikaline maniküür", en: "Classic manicure" },
  "Маникюр + гель-лак": { et: "Maniküür geellakiga", en: "Manicure + gel polish" },
  "Покрытие лаком": { et: "Küünte lakkimine", en: "Nail polish application" },
  "Снятие гель-лака (с классическим маникюром)": { et: "Geellaki eemaldus (koos klassikalise manikuuriga)", en: "Gel polish removal (with classic manicure)" },
  "Снятие гель-лака": { et: "Geellaki eemaldus", en: "Gel polish removal" },
  "Наращивание ногтей (гель)": { et: "Geelküünte paigaldus", en: "Gel nail extensions" },
  "Коррекция гель-ногтей": { et: "Geelküünte hooldus", en: "Gel nail infill" },
  "Снятие наращенных ногтей": { et: "Kunstküünte eemaldamine", en: "Extension removal" },
  "Ремонт одного ногтя": { et: "Ühe küüne parandus", en: "Single nail repair" },
  "Классический педикюр": { et: "Klassikaline pediküür", en: "Classic pedicure" },
  "Педикюр + гель-лак": { et: "Pediküür geellakiga", en: "Pedicure + gel polish" },
  "Снятие гель-лака (с классическим педикюром)": { et: "Geellaki eemaldus (koos klassikalise pediküüriga)", en: "Gel polish removal (with classic pedicure)" },
  "Мужской педикюр": { et: "Meeste pediküür", en: "Men's pedicure" },
  "Педикюр": { et: "Pediküür", en: "Pedicure" },
  "Детская стрижка": { et: "Laste juukselõikus (kuni 12 a.)", en: "Children's haircut (up to 12)" },
  "Детская стрижка (девочки)": { et: "Laste juukselõikus (tüdrukud)", en: "Children's haircut (girls)" },
  "Детская стрижка (мальчики)": { et: "Laste juukselõikus (poisid)", en: "Children's haircut (boys)" },
  "Мужская стрижка": { et: "Meeste juukselõikus", en: "Men's haircut" },
  "Женская стрижка": { et: "Naiste juukselõikus", en: "Women's haircut" },
  "Мужская стрижка машинкой": { et: "Masinalõikus", en: "Men's clipper cut" },
  "Стрижка бороды и усов": { et: "Habeme, vuntside piiramine", en: "Beard & moustache trim" },
  "Мытьё головы": { et: "Pesu", en: "Hair wash" },
  "Подравнивание кончиков": { et: "Juuste otste tasandamine", en: "Trim ends" },
  "Стрижка чёлки": { et: "Tuka lõikus", en: "Bangs trim" },
  "Мужская стрижка + мытьё": { et: "Meeste juukselõikus + pesu", en: "Men's haircut + wash" },
  "Мужская стрижка + мытьё головы": { et: "Meeste juukselõikus + pesu", en: "Men's haircut + hair wash" },
  "Мужская стрижка машинкой + мытьё головы": { et: "Masinalõikus + pesu", en: "Men's clipper cut + hair wash" },
  "Мытьё + дневная укладка": { et: "Pesu + päeva soeng", en: "Wash + day styling" },
  "Дневная укладка": { et: "Päeva soeng", en: "Day styling" },
  "Выпрямление волос": { et: "Sirgendamine", en: "Hair straightening" },
  "Укладка локонами": { et: "Loki soeng", en: "Curls styling" },
  "Праздничная укладка": { et: "Pidulik soeng", en: "Party styling" },
  "Свадебная укладка": { et: "Pruudi soeng", en: "Wedding styling" },
  "Окрашивание корней": { et: "Juurte värvimine", en: "Root touch-up" },
  "Полное окрашивание": { et: "Täisvärvimine", en: "Full color" },
  "Тонирование": { et: "Toonimine", en: "Toning" },
  "Окрашивание (короткие волосы)": { et: "Värvimine (lühikesed juuksed)", en: "Color (short hair)" },
  "Окрашивание (средние волосы)": { et: "Värvimine (keskmised juuksed)", en: "Color (medium hair)" },
  "Окрашивание (длинные волосы)": { et: "Värvimine (pikad juuksed)", en: "Color (long hair)" },
  "Окрашивание (очень длинные волосы)": { et: "Värvimine (väga pikad juuksed)", en: "Color (very long hair)" },
  "Окрашивание своим красителем": { et: "Juuste värvimine oma värviga", en: "Color with client's dye" },
  "Мелирование (короткие волосы)": { et: "Triibutamine (lühikesed)", en: "Highlights (short)" },
  "Мелирование (средние волосы)": { et: "Triibutamine (keskmised)", en: "Highlights (medium)" },
  "Мелирование (длинные волосы)": { et: "Triibutamine (pikad)", en: "Highlights (long)" },
  "Мелирование (очень длинные волосы)": { et: "Triibutamine (väga pikad)", en: "Highlights (very long)" },
  "Хим. завивка (короткие)": { et: "Keemiline lokk (lühikesed)", en: "Perm (short)" },
  "Хим. завивка (длинные)": { et: "Keemiline lokk (pikad)", en: "Perm (long)" },
  "Химическая завивка (средние)": { et: "Keemiline lokk (poolpikad)", en: "Perm (medium)" },
  "Химическая завивка (длинные)": { et: "Keemiline lokk (pikad)", en: "Perm (long)" },
  "Химическая завивка (короткие)": { et: "Keemiline lokk (lühikesed)", en: "Perm (short)" },
  "Консультация + тест прядь": { et: "Konsultatsioon + testlokk", en: "Consultation + test strand" },
  "Консультация + тест-прядь": { et: "Konsultatsioon + testlokk", en: "Consultation + test strand" },
  "Снятие гелевых ногтей с маникюром": { et: "Geelküünte eemaldamine maniküüriga", en: "Gel nail removal with manicure" },
  "Снятие гель-лака с маникюром": { et: "Geellaki eemaldus maniküüriga", en: "Gel polish removal with manicure" },
  "Тату хной": { et: "Hennamaaling", en: "Henna tattoo" },
  "Блонд ( Осветление пудрой + тонирования+ уход )": { et: "Blond (pulbriga valgendamine + toonimine + hooldus)", en: "Blonde (powder bleach + toning + care)" },
  "Выход из темного": { et: "Väljumine tumedast", en: "Dark-to-light transformation" },
  "Техники ( Мелирование, шатуш, омбре, airtouch, балаяж, комбинация техник )": { et: "Tehnikad (triibutamine, shatush, ombre, airtouch, balayage, kombinatsioon)", en: "Techniques (highlights, shatush, ombre, airtouch, balayage, combo)" },
  "Холодное восстановление": { et: "Külm taastamine", en: "Cold restoration treatment" },
  "Снятие гелевых ногтей (без маникюра)": { et: "Geelküünte eemaldamine (ilma maniküürita)", en: "Gel nail removal (without manicure)" },
  "Снятие гелевых ногтей (с маникюром)": { et: "Geelküünte eemaldamine maniküüriga", en: "Gel nail removal with manicure" },
  "Снятие гель-лака (без маникюра)": { et: "Geellaki eemaldus (ilma maniküürita)", en: "Gel polish removal (without manicure)" },
  "Снятие гель-лака (с маникюром)": { et: "Geellaki eemaldus maniküüriga", en: "Gel polish removal with manicure" },
  "Снятие гель-лака (с педикюром)": { et: "Geellaki eemaldus pediküüriga", en: "Gel polish removal with pedicure" },
};

function localizeService(ruName: string | undefined, lang: Lang): string {
  const ru = String(ruName ?? "").trim();
  if (!ru) return ru;
  const row = SERVICE_I18N[ru];
  return row && row[lang] ? row[lang] : ru;
}

// Localized confirmation text.
function renderSms(payload: NonNullable<OutboxRow["payload"]>): string {
  const lang = normLang(payload.lang);
  const name = (payload.client_name ?? "").trim();
  const when = payload.start_local ?? "";       // "DD.MM.YYYY HH:MM"
  const [date, time] = when.split(" ");
  const items = Array.isArray(payload.items) ? payload.items : [];
  const service = items.map((i) => localizeService(i?.service_name, lang)).filter(Boolean).join(", ");
  const master = items.map((i) => i?.staff_name).filter(Boolean).filter((v, idx, a) => a.indexOf(v) === idx).join(", ");
  const phone = payload.salon_phone ?? "+372 529 8225";

  if (lang === "en") {
    return [
      name ? `Hello, ${name}!` : "Hello!",
      `Welcome to Alessanna Ilusalong on ${date}, at ${time}.`,
      `Service: ${service}`,
      `Master: ${master}`,
      `Tel: ${phone}`,
      "",
      "See you soon!",
    ].join("\n");
  }
  // et (default)
  return [
    name ? `Tere, ${name}!` : "Tere!",
    `Olete oodatud Alessanna Ilusalongi ${date}, kell ${time}.`,
    `Teenus: ${service}`,
    `Meister: ${master}`,
    `Tel: ${phone}`,
    "",
    "Kohtumiseni!",
  ].join("\n");
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
