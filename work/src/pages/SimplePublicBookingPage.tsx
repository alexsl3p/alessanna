import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import {
  compareSalonYmd,
  gregorianAddDays,
  normalizePublicBookingDayStr,
  salonDayStartUtc,
  salonFirstBookableYmd,
  salonWeekdaySun0,
} from "../lib/bookingSalonTz";
import { generateAvailableSlots, type Slot } from "../lib/slots";
import {
  applyPublicStaffVisibility,
  isStaffRowAdmin,
  normalizeStaffMember,
  staffEligibleForService,
} from "../lib/roles";
import type { AppointmentRow, SalonHolidayRow, StaffMember, StaffScheduleRow, StaffServiceRow } from "../types/database";
import { fetchPublicBookingPanelEnabled } from "../lib/salonSettingsParse";
import { PublicBookingPanelDisabled } from "../components/PublicBookingPanelDisabled";

type PublicService = {
  id: string;
  name: string;
  duration_min: number;
  buffer_after_min: number;
  active: boolean;
};

function nextOpenBookableYmd(startYmd: string, holidays: Set<string>): string {
  let cur = startYmd;
  for (let i = 0; i < 180; i++) {
    if (!holidays.has(cur)) return cur;
    cur = gregorianAddDays(cur, 1);
  }
  return startYmd;
}

function publicSiteBookingNote(): string {
  return "*** Онлайн запись ***";
}

/**
 * Минимальная онлайн-запись: услуга → мастер → дата → слот → контакты → запись в CRM-календарь.
 * Без reception-панели и тяжёлого календаря.
 */
export function SimplePublicBookingPage() {
  const { t } = useTranslation();
  const [services, setServices] = useState<PublicService[]>([]);
  const [staffDirectory, setStaffDirectory] = useState<StaffMember[]>([]);
  const [links, setLinks] = useState<StaffServiceRow[]>([]);
  const [schedules, setSchedules] = useState<StaffScheduleRow[]>([]);
  const [holidays, setHolidays] = useState<SalonHolidayRow[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [timeOff, setTimeOff] = useState<
    Array<{ staff_id: string; start_time: string; end_time: string }>
  >([]);

  const [serviceId, setServiceId] = useState<string | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [dayStr, setDayStr] = useState(() => salonFirstBookableYmd());
  const bookYmd = useMemo(() => normalizePublicBookingDayStr(dayStr), [dayStr]);
  const [pickedStart, setPickedStart] = useState<Date | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientNote, setClientNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [msgIsSuccess, setMsgIsSuccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [bookingPanelDisabledByAdmin, setBookingPanelDisabledByAdmin] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const loadBase = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }
    const panelOn = await fetchPublicBookingPanelEnabled(supabase);
    if (!panelOn) {
      setBookingPanelDisabledByAdmin(true);
      setLoading(false);
      return;
    }
    setBookingPanelDisabledByAdmin(false);
    const [st, lk, sc, hol] = await Promise.all([
      supabase.from("staff").select("*").eq("is_active", true).order("name"),
      supabase.from("staff_services").select("*"),
      supabase.from("staff_schedule").select("*"),
      supabase.from("salon_holidays").select("*"),
    ]);
    let sv = await supabase
      .from("service_listings")
      .select("id,name,duration,buffer_after_min,is_active")
      .order("name");
    if (sv.error) {
      sv = (await supabase.from("service_listings").select("id,name,duration,is_active").order("name")) as typeof sv;
    }
    if (sv.data) {
      setServices(
        (sv.data as Array<Record<string, unknown>>).map((s) => ({
          id: String(s.id),
          name: String(s.name || "").trim(),
          duration_min: Number(s.duration || 0),
          buffer_after_min: 0,
          active: s.is_active !== false,
        })),
      );
    }
    if (st.data) {
      const directory = (st.data as Record<string, unknown>[])
        .filter((row) => !isStaffRowAdmin(row))
        .map((r) => normalizeStaffMember(r as StaffMember));
      setStaffDirectory(directory);
    }
    if (lk.data) setLinks(lk.data as StaffServiceRow[]);
    if (sc.data) setSchedules(sc.data as StaffScheduleRow[]);
    if (hol.data) setHolidays(hol.data as SalonHolidayRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  useEffect(() => {
    if (serviceId != null || services.length === 0) return;
    const first = services.find((s) => s.active);
    if (first) setServiceId(first.id);
  }, [services, serviceId]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const firstBookableYmd = useMemo(() => salonFirstBookableYmd(new Date(nowTick)), [nowTick]);
  const holidaySet = useMemo(() => new Set(holidays.map((h) => h.holiday_date)), [holidays]);
  const firstOpenBookableYmd = useMemo(
    () => nextOpenBookableYmd(firstBookableYmd, holidaySet),
    [firstBookableYmd, holidaySet],
  );

  useEffect(() => {
    if (compareSalonYmd(bookYmd, firstOpenBookableYmd) < 0 || holidaySet.has(bookYmd)) {
      setDayStr(firstOpenBookableYmd);
      setPickedStart(null);
    }
  }, [bookYmd, firstOpenBookableYmd, holidaySet]);

  const eligibleStaff = useMemo(() => {
    if (serviceId == null) return [];
    const base = staffEligibleForService(staffDirectory, links, serviceId);
    return applyPublicStaffVisibility(base, links, serviceId);
  }, [staffDirectory, links, serviceId]);

  const salonDayStart = useMemo(() => salonDayStartUtc(bookYmd), [bookYmd]);

  const loadDayData = useCallback(async () => {
    if (!isSupabaseConfigured() || serviceId == null) return;
    const eligibleIds = eligibleStaff.map((s) => s.id);
    if (!eligibleIds.length) {
      setAppointments([]);
      setTimeOff([]);
      return;
    }
    const start = salonDayStartUtc(bookYmd);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const [ap, to] = await Promise.all([
      supabase
        .from("appointments")
        .select("*")
        .in("staff_id", eligibleIds)
        .gte("start_time", start.toISOString())
        .lt("start_time", end.toISOString())
        .neq("status", "cancelled"),
      supabase
        .from("staff_time_off")
        .select("*")
        .in("staff_id", eligibleIds)
        .lte("start_time", end.toISOString())
        .gte("end_time", start.toISOString()),
    ]);
    if (ap.data) setAppointments(ap.data as AppointmentRow[]);
    if (to.data) {
      setTimeOff(
        (to.data as { staff_id: string; start_time: string; end_time: string }[]).map((r) => ({
          staff_id: r.staff_id,
          start_time: r.start_time,
          end_time: r.end_time,
        })),
      );
    }
  }, [bookYmd, eligibleStaff, serviceId]);

  useEffect(() => {
    void loadDayData();
  }, [loadDayData]);

  const svc = services.find((s) => s.id === serviceId);
  const durationMin = svc ? svc.duration_min : 60;

  const slots: Slot[] = useMemo(() => {
    if (!svc || !staffId) return [];
    if (holidaySet.has(bookYmd)) return [];
    const member = eligibleStaff.find((m) => m.id === staffId);
    if (!member) return [];
    const memberSchedule = schedules
      .filter((s) => s.staff_id === member.id)
      .map((s) => ({
        day_of_week: s.day_of_week,
        start_time: s.start_time,
        end_time: s.end_time,
      }));
    const raw = generateAvailableSlots({
      schedule: memberSchedule,
      appointments,
      timeOff,
      duration: durationMin,
      day: salonDayStart,
      salonDayStartUtc: salonDayStart,
      salonWeekdaySun0: salonWeekdaySun0(bookYmd),
      stepMinutes: 30,
      staffId: member.id,
    });
    return raw.filter((s) => s.start.getTime() >= nowTick).sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [appointments, bookYmd, durationMin, eligibleStaff, holidaySet, schedules, salonDayStart, svc, staffId, timeOff, nowTick]);

  async function confirmBook() {
    const name = clientName.trim();
    if (!svc || !staffId || !pickedStart || !name) {
      setMsgIsSuccess(false);
      setMsg(t("publicBook.fillAll", { defaultValue: "Заполните все поля" }));
      return;
    }
    if (holidaySet.has(bookYmd)) {
      setMsgIsSuccess(false);
      setMsg(t("publicBook.salonClosedDay", { defaultValue: "Salon is closed on this day." }));
      return;
    }
    if (pickedStart.getTime() < Date.now()) {
      setMsgIsSuccess(false);
      setMsg("Выберите актуальное время.");
      return;
    }
    setBooking(true);
    setMsg(null);
    setMsgIsSuccess(false);
    try {
      const { data, error: rpcError } = await supabase.rpc("public_book_chain", {
        p_client_name: name,
        p_client_phone: clientPhone.trim() || "",
        p_client_email: clientEmail.trim() || "",
        p_client_note: publicSiteBookingNote(),
        p_start_at: pickedStart.toISOString(),
        p_items: [{ service_id: svc.id, staff_id: staffId }],
        p_source: "public_site",
        p_created_by_staff_id: null,
      });
      setBooking(false);
      if (rpcError) {
        setMsgIsSuccess(false);
        setMsg(rpcError.message || "Ошибка сервера");
        return;
      }
      const payload = data ?? {};
      if ((payload as { ok?: boolean }).ok !== true) {
        setMsgIsSuccess(false);
        const errText =
          String((payload as { message?: unknown }).message || (payload as { error?: unknown }).error || "") ||
          "Запись не создана.";
        setMsg(errText);
        if (/slot|занят|no longer available/i.test(errText)) void loadDayData();
        return;
      }
      setMsgIsSuccess(true);
      setMsg(t("publicBook.success", { defaultValue: "Готово! Ждём вас." }));
      setPickedStart(null);
      setClientName("");
      setClientPhone("");
      setClientEmail("");
      setClientNote("");
      void loadDayData();
    } catch {
      setBooking(false);
      setMsgIsSuccess(false);
      setMsg("Ошибка сети.");
    }
  }

  if (!isSupabaseConfigured()) {
    return (
      <div className="min-h-screen bg-zinc-950 p-8 text-zinc-300">
        <p>{t("login.configLine")}</p>
        <Link className="mt-4 block text-sky-400" to="/login">
          Staff login
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        {t("common.loading")}
      </div>
    );
  }

  if (bookingPanelDisabledByAdmin) {
    return <PublicBookingPanelDisabled />;
  }

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-200">
      <div className="mx-auto max-w-lg space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-white">
            {t("publicBook.title", { defaultValue: "Онлайн-запись" })}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {t("simpleBook.subtitle", {
              defaultValue: "Короткая форма: сразу в календарь мастера.",
            })}
          </p>
          <Link to="/book" className="mt-2 inline-block text-xs text-zinc-500 hover:text-sky-400">
            {t("simpleBook.fullUiLink", { defaultValue: "Расширенная запись с календарём →" })}
          </Link>
        </header>

        {msg && (
          <div
            className={
              "rounded-lg border px-3 py-2 text-sm " +
              (msgIsSuccess
                ? "border-emerald-800/60 bg-emerald-950/40 text-emerald-200"
                : "border-rose-800/50 bg-rose-950/30 text-rose-100")
            }
          >
            <p className={msgIsSuccess ? "" : "whitespace-pre-wrap break-words"}>{msg}</p>
          </div>
        )}

        <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <label className="block text-sm">
            <span className="text-zinc-400">{t("modal.service", { defaultValue: "Услуга" })}</span>
            <select
              value={serviceId ?? ""}
              onChange={(e) => {
                const v = e.target.value || null;
                setServiceId(v);
                setStaffId(null);
                setPickedStart(null);
              }}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white"
            >
              <option value="">{t("simpleBook.pickService", { defaultValue: "Выберите услугу" })}</option>
              {services.filter((s) => s.active).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="text-zinc-400">
              {t("simpleBook.masterRequired", { defaultValue: "Мастер" })}
            </span>
            <select
              value={staffId ?? ""}
              disabled={!serviceId}
              onChange={(e) => {
                setStaffId(e.target.value || null);
                setPickedStart(null);
              }}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white disabled:opacity-50"
            >
              <option value="">{t("simpleBook.pickMaster", { defaultValue: "Выберите мастера" })}</option>
              {eligibleStaff.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="text-zinc-400">{t("simpleBook.date", { defaultValue: "Дата" })}</span>
            <input
              type="date"
              min={firstOpenBookableYmd}
              value={bookYmd}
              onChange={(e) => {
                const v = e.target.value;
                if (v) {
                  const next = normalizePublicBookingDayStr(v);
                  if (holidaySet.has(next)) {
                    setMsgIsSuccess(false);
                    setMsg(t("publicBook.salonClosedDay", { defaultValue: "Salon is closed on this day." }));
                    setDayStr(firstOpenBookableYmd);
                  } else {
                    setDayStr(next);
                  }
                  setPickedStart(null);
                }
              }}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white"
            />
          </label>

          {staffId && (
            <div>
              <p className="text-sm text-zinc-400">{t("publicBook.slots", { defaultValue: "Время" })}</p>
              <div className="mt-2 flex max-h-48 flex-wrap gap-2 overflow-y-auto">
                {slots.map((s) => (
                  <button
                    key={s.start.toISOString()}
                    type="button"
                    onClick={() => setPickedStart(s.start)}
                    className={
                      "rounded-lg border px-3 py-2 text-sm " +
                      (pickedStart?.getTime() === s.start.getTime()
                        ? "border-sky-500 bg-sky-950/50 text-white"
                        : "border-zinc-700 text-zinc-300 hover:border-zinc-500")
                    }
                  >
                    {format(s.start, "HH:mm")}
                  </button>
                ))}
              </div>
              {slots.length === 0 && (
                <p className="mt-2 text-xs text-zinc-600">{t("publicBook.noSlots", { defaultValue: "Нет слотов" })}</p>
              )}
            </div>
          )}

          {pickedStart && (
            <div className="space-y-3 border-t border-zinc-800 pt-4">
              <input
                placeholder={t("modal.client", { defaultValue: "Имя" }) as string}
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm"
              />
              <input
                placeholder={t("modal.phone", { defaultValue: "Телефон" }) as string}
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm"
              />
              <input
                placeholder={t("modal.email", { defaultValue: "Email" }) as string}
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                type="email"
                className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm"
              />
              <textarea
                placeholder={t("simpleBook.comment", { defaultValue: "Комментарий (необязательно)" })}
                value={clientNote}
                onChange={(e) => setClientNote(e.target.value)}
                rows={2}
                className="w-full resize-y rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm placeholder:text-zinc-600"
              />
              <button
                type="button"
                disabled={booking}
                onClick={() => void confirmBook()}
                className="w-full rounded-lg bg-sky-600 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {booking ? t("common.loading") : t("simpleBook.submit", { defaultValue: "Записаться" })}
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-zinc-600">
          <Link to="/login" className="text-zinc-500 hover:text-sky-400">
            {t("simpleBook.staffLogin", { defaultValue: "Вход для персонала" })}
          </Link>
        </p>
      </div>
    </div>
  );
}
