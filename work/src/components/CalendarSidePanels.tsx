import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { format, parseISO, startOfDay, endOfDay, isSameDay, isAfter } from "date-fns";
import { countFreeWindowsForDay, nextAppointmentForStaffFrom } from "../lib/weekTimeline";
import type {
  AppointmentRow,
  ServiceRow,
  StaffMember,
  StaffScheduleRow,
  StaffTimeOffRow,
} from "../types/database";

type Props = {
  /** Дата, которую сейчас просматривает пользователь календаря (анкер для расчёта загрузки). */
  cursor: Date;
  /** Только активные мастера, релевантные для текущего фильтра по услуге. */
  staff: StaffMember[];
  appointments: AppointmentRow[];
  services: ServiceRow[];
  schedules: StaffScheduleRow[];
  timeOff: StaffTimeOffRow[];
  /** Сколько ближайших записей показать. По умолчанию 5. */
  upcomingLimit?: number;
  /** Мастер недельного таймлайна — для снимка «сегодня» и быстрых действий. */
  focusStaffId?: string | null;
  /** Длина брони из выбранной услуги (для подсчёта окон). */
  serviceDurationMin?: number;
  onNearestSlot?: () => void;
  onCreateBooking?: () => void;
};

function staffInitials(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (!n) return "?";
  const parts = n.split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
  return (parts[0]![0] + parts[1]![0]).toUpperCase();
}

function clientInitials(name: string | null | undefined): string {
  return staffInitials(name);
}

function parseHmToMinutes(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
  return h * 60 + mm;
}

/** Считаем загрузку конкретного мастера на конкретный день в минутах работы и минутах занятости. */
function workloadFor(
  staffId: string,
  day: Date,
  schedules: StaffScheduleRow[],
  timeOff: StaffTimeOffRow[],
  appointments: AppointmentRow[],
): { workingMin: number; busyMin: number; isWorking: boolean; isOff: boolean } {
  const wd = day.getDay();
  const memberSchedule = schedules.filter((s) => s.staff_id === staffId && s.day_of_week === wd);
  if (memberSchedule.length === 0) {
    return { workingMin: 0, busyMin: 0, isWorking: false, isOff: false };
  }
  let workingMin = 0;
  for (const s of memberSchedule) {
    const a = parseHmToMinutes(String(s.start_time));
    const b = parseHmToMinutes(String(s.end_time));
    if (a == null || b == null || b <= a) continue;
    workingMin += b - a;
  }
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);

  const offHit = timeOff.some((t) => {
    if (t.staff_id !== staffId) return false;
    try {
      const ta = parseISO(String(t.start_time));
      const tb = parseISO(String(t.end_time));
      return ta <= dayEnd && tb >= dayStart;
    } catch {
      return false;
    }
  });
  if (offHit) {
    return { workingMin, busyMin: 0, isWorking: workingMin > 0, isOff: true };
  }

  let busyMin = 0;
  for (const a of appointments) {
    if (a.staff_id !== staffId) continue;
    if (a.status === "cancelled") continue;
    try {
      const aStart = parseISO(a.start_time);
      const aEnd = parseISO(a.end_time);
      if (!isSameDay(aStart, day) && !isSameDay(aEnd, day) && !(aStart <= dayStart && aEnd >= dayEnd)) {
        continue;
      }
      const startMs = Math.max(aStart.getTime(), dayStart.getTime());
      const endMs = Math.min(aEnd.getTime(), dayEnd.getTime());
      const min = Math.max(0, Math.round((endMs - startMs) / 60_000));
      busyMin += min;
    } catch {
      /* ignore parse errors */
    }
  }
  return { workingMin, busyMin, isWorking: workingMin > 0, isOff: false };
}

/* ================================================================
 * CalendarSidePanels — две карточки сбоку от календаря:
 *   1) «Ближайшие записи» (ближайшие N будущих записей; кликабельны).
 *   2) «Загрузка мастеров» (на сегодня/выбранный день: статус
 *      Свободна/Занята/Выходной + золотая прогресс-полоса
 *      busy/working).
 *
 * Не дёргает Supabase сама — все данные приходят пропсами уже
 * собранными в CalendarPage, чтобы переиспользовать realtime-стейт.
 * ================================================================ */
export function CalendarSidePanels({
  cursor,
  staff,
  appointments,
  services,
  schedules,
  timeOff,
  upcomingLimit = 5,
  focusStaffId = null,
  serviceDurationMin = 60,
  onNearestSlot,
  onCreateBooking,
}: Props) {
  const { t } = useTranslation();

  const todaySnapshot = useMemo(() => {
    if (!focusStaffId) return null;
    const now = new Date();
    const day = startOfDay(now);
    const freeWindows = countFreeWindowsForDay(
      day,
      focusStaffId,
      schedules,
      appointments,
      timeOff,
      serviceDurationMin,
    );
    const w = workloadFor(focusStaffId, day, schedules, timeOff, appointments);
    const pct =
      w.workingMin > 0 ? Math.min(100, Math.round((w.busyMin / w.workingMin) * 100)) : 0;
    const next = nextAppointmentForStaffFrom(appointments, focusStaffId, now);
    const focusMember = staff.find((s) => s.id === focusStaffId);
    return { freeWindows, loadPct: pct, next, focusMember, workload: w };
  }, [appointments, focusStaffId, schedules, serviceDurationMin, staff, timeOff]);

  const upcoming = useMemo(() => {
    const now = Date.now();
    const future = appointments
      .filter((a) => a.status !== "cancelled")
      .filter((a) => {
        try {
          return parseISO(a.start_time).getTime() >= now;
        } catch {
          return false;
        }
      })
      .sort((a, b) => {
        try {
          return parseISO(a.start_time).getTime() - parseISO(b.start_time).getTime();
        } catch {
          return 0;
        }
      })
      .slice(0, upcomingLimit);
    return future;
  }, [appointments, upcomingLimit]);

  const workload = useMemo(() => {
    return staff.map((member) => {
      const w = workloadFor(member.id, cursor, schedules, timeOff, appointments);
      const pct =
        w.workingMin > 0 ? Math.min(100, Math.round((w.busyMin / w.workingMin) * 100)) : 0;
      return { member, ...w, pct };
    });
  }, [staff, cursor, schedules, timeOff, appointments]);

  const showQuick = Boolean(onNearestSlot || onCreateBooking);

  return (
    <aside className="flex flex-col gap-4">
      {todaySnapshot && (
        <section className="rounded-xl border border-line/10 bg-panel/80 p-4 shadow-sm">
          <header className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-fg">
              {t("calendar.todaySnapshotTitle", { defaultValue: "Сегодня" })}
            </h3>
            <span className="text-[11px] text-muted">
              {todaySnapshot.focusMember?.name ?? ""}
            </span>
          </header>
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between gap-2 border-b border-line/10 pb-2">
              <span className="text-muted">
                {t("calendar.todayFreeWindows", { defaultValue: "Свободных окон" })}
              </span>
              <span className="font-medium tabular-nums text-fg">{todaySnapshot.freeWindows}</span>
            </li>
            <li className="flex justify-between gap-2 border-b border-line/10 pb-2">
              <span className="text-muted">
                {t("calendar.todayLoad", { defaultValue: "Загрузка" })}
              </span>
              <span className="font-medium tabular-nums text-fg">
                {todaySnapshot.workload.isOff || !todaySnapshot.workload.isWorking
                  ? "—"
                  : `${todaySnapshot.loadPct}%`}
              </span>
            </li>
            <li className="flex flex-col gap-0.5">
              <span className="text-muted">
                {t("calendar.todayNextAppt", { defaultValue: "Ближайшая запись" })}
              </span>
              {todaySnapshot.next ? (
                <span className="font-medium text-fg">
                  {format(parseISO(todaySnapshot.next.start_time), "HH:mm")} ·{" "}
                  {todaySnapshot.next.client_name || t("modal.client", { defaultValue: "Клиент" })}
                </span>
              ) : (
                <span className="text-xs text-muted">
                  {t("calendar.todayNextNone", { defaultValue: "Нет записей впереди" })}
                </span>
              )}
            </li>
          </ul>
        </section>
      )}

      {showQuick && (
        <section className="rounded-xl border border-line/10 bg-panel/80 p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-fg">
            {t("calendar.quickActions", { defaultValue: "Быстрые действия" })}
          </h3>
          <div className="flex flex-col gap-2">
            {onNearestSlot && (
              <button
                type="button"
                onClick={onNearestSlot}
                className="rounded-lg border border-gold/35 bg-gold/10 px-3 py-2.5 text-left text-sm font-medium text-fg transition hover:bg-gold/15"
              >
                {t("calendar.nearestSlot", { defaultValue: "Ближайшее свободное время" })}
              </button>
            )}
            {onCreateBooking && (
              <button
                type="button"
                onClick={onCreateBooking}
                className="rounded-lg border border-line/15 bg-surface/80 px-3 py-2.5 text-left text-sm font-medium text-fg transition hover:border-gold/30"
              >
                {t("calendar.createBooking", { defaultValue: "Сделать запись" })}
              </button>
            )}
          </div>
        </section>
      )}

      {/* ── Ближайшие записи ─────────────────────────────────── */}
      <section className="rounded-xl border border-line/10 bg-panel/80 p-4 shadow-sm">
        <header className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-fg">
            {t("calendar.upcomingTitle", { defaultValue: "Ближайшие записи" })}
          </h3>
          <span className="text-[11px] uppercase tracking-wide text-muted">
            {format(new Date(), "d MMM")}
          </span>
        </header>
        {upcoming.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line/15 px-3 py-6 text-center text-xs text-muted">
            {t("calendar.upcomingEmpty", { defaultValue: "Нет ближайших записей." })}
          </p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((a) => {
              const member = staff.find((s) => s.id === a.staff_id);
              const svc = services.find((s) => String(s.id) === String(a.service_id));
              const time = (() => {
                try {
                  return format(parseISO(a.start_time), "HH:mm");
                } catch {
                  return "—";
                }
              })();
              const today = isSameDay(parseISO(a.start_time), new Date());
              return (
                <li
                  key={a.id}
                  className="flex items-center gap-3 rounded-lg border border-line/10 bg-canvas/40 px-3 py-2 transition hover:border-gold/30"
                >
                  <span
                    aria-hidden="true"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-surface text-[11px] font-semibold text-gold"
                  >
                    {clientInitials(a.client_name)}
                  </span>
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="truncate text-sm">
                      <span className="font-display text-base text-gold">{time}</span>
                      <span className="ml-2 truncate text-fg">{a.client_name || t("modal.client", { defaultValue: "Клиент" })}</span>
                    </p>
                    <p className="truncate text-[11px] text-muted">
                      {member?.name ?? t("calendar.staff", { defaultValue: "Мастер" })}
                      {svc ? ` · ${svc.name_et ?? ""}` : ""}
                    </p>
                  </div>
                  <span
                    aria-hidden="true"
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                      today
                        ? "border-gold/40 text-gold"
                        : "border-line/15 text-muted"
                    }`}
                  >
                    {today
                      ? t("calendar.today", { defaultValue: "Сегодня" })
                      : (() => {
                          try {
                            return format(parseISO(a.start_time), "d MMM");
                          } catch {
                            return "";
                          }
                        })()}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Загрузка мастеров ────────────────────────────────── */}
      <section className="rounded-xl border border-line/10 bg-panel/80 p-4 shadow-sm">
        <header className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-fg">
            {t("calendar.workloadTitle", { defaultValue: "Загрузка мастеров" })}
          </h3>
          <span className="text-[11px] uppercase tracking-wide text-muted">
            {format(cursor, "d MMM")}
          </span>
        </header>
        {workload.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line/15 px-3 py-6 text-center text-xs text-muted">
            {t("calendar.workloadEmpty", { defaultValue: "Нет мастеров." })}
          </p>
        ) : (
          <ul className="space-y-2">
            {workload.map(({ member, isWorking, isOff, busyMin, workingMin, pct }) => {
              const dotClass = isOff
                ? "bg-rose-400"
                : !isWorking
                  ? "bg-zinc-500"
                  : pct >= 90
                    ? "bg-rose-400"
                    : pct >= 60
                      ? "bg-amber-400"
                      : "bg-emerald-400";
              const statusText = isOff
                ? t("calendar.workloadOff", { defaultValue: "Выходной" })
                : !isWorking
                  ? t("calendar.workloadDayOff", { defaultValue: "Не работает" })
                  : pct >= 90
                    ? t("calendar.workloadFull", { defaultValue: "Занята" })
                    : pct >= 60
                      ? t("calendar.workloadSoon", { defaultValue: "Почти занят" })
                      : t("calendar.workloadFree", { defaultValue: "Свободно" });
              const showAfter = !isOff && isWorking;
              return (
                <li
                  key={member.id}
                  className="flex items-center gap-3 rounded-lg border border-line/10 bg-canvas/40 px-3 py-2"
                >
                  <span
                    aria-hidden="true"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-surface text-[11px] font-semibold text-gold"
                  >
                    {staffInitials(member.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-fg">{member.name}</p>
                      <p className="shrink-0 text-[11px] text-muted">{showAfter ? `${pct}%` : ""}</p>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} aria-hidden="true" />
                      <p className="truncate text-[11px] text-muted">
                        {statusText}
                        {showAfter && workingMin > 0 ? ` · ${Math.round(busyMin / 60 * 10) / 10}/${Math.round(workingMin / 60 * 10) / 10} ${t("common.hShort", { defaultValue: "ч" })}` : ""}
                      </p>
                    </div>
                    {showAfter && (
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-canvas/70">
                        <div
                          className="h-full bg-gold/70"
                          style={{ width: `${pct}%` }}
                          aria-hidden="true"
                        />
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </aside>
  );
}

/** Вспомогательно: обертка проверки «есть ли запись после сейчас», чтобы импорт не светился неиспользованным. */
export function hasFutureAppointments(appointments: AppointmentRow[]): boolean {
  const now = new Date();
  return appointments.some((a) => {
    try {
      return a.status !== "cancelled" && isAfter(parseISO(a.start_time), now);
    } catch {
      return false;
    }
  });
}
