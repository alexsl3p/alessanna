import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { supabase } from "../lib/supabase";
import { isStaffRowAdmin, normalizeStaffMember } from "../lib/roles";
import type { SalonHolidayRow, StaffMember, StaffWorkDateRow } from "../types/database";
import { AdminDaySchedulePopup } from "../components/reception/AdminDaySchedulePopup";
import { googleStaffColor } from "../components/reception/receptionColors";
import { buildStaffHueMap } from "../lib/staffHue";

const RU_WEEK = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MON_FIRST_DOW = [1, 2, 3, 4, 5, 6, 0] as const;

const RU_MONTHS_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function formatHolidayDate(dateStr: string): string {
  try {
    const d = parseISO(dateStr);
    return `${d.getDate()} ${RU_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return dateStr;
  }
}

/** Parse "DD.MM", "DD.MM.YY", "DD.MM.YYYY" into "YYYY-MM-DD". Returns null on bad input. */
function parseDatePart(part: string): string | null {
  const s = part.trim();
  const currentYear = new Date().getFullYear();

  const m2 = s.match(/^(\d{1,2})\.(\d{1,2})$/);
  if (m2) {
    const d = parseInt(m2[1]!), mo = parseInt(m2[2]!) - 1;
    if (mo < 0 || mo > 11 || d < 1 || d > 31) return null;
    return format(new Date(currentYear, mo, d), "yyyy-MM-dd");
  }
  const m3 = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2})$/);
  if (m3) {
    const d = parseInt(m3[1]!), mo = parseInt(m3[2]!) - 1, yr = 2000 + parseInt(m3[3]!);
    if (mo < 0 || mo > 11 || d < 1 || d > 31) return null;
    return format(new Date(yr, mo, d), "yyyy-MM-dd");
  }
  const m4 = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m4) {
    const d = parseInt(m4[1]!), mo = parseInt(m4[2]!) - 1, yr = parseInt(m4[3]!);
    if (mo < 0 || mo > 11 || d < 1 || d > 31) return null;
    return format(new Date(yr, mo, d), "yyyy-MM-dd");
  }
  return null;
}


export function AdminSchedulePage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [workDates, setWorkDates] = useState<StaffWorkDateRow[]>([]);
  const [holidays, setHolidays] = useState<SalonHolidayRow[]>([]);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [loading, setLoading] = useState(true);
  const [dayPopup, setDayPopup] = useState<{ day: Date; x: number; y: number } | null>(null);

  // Holiday input state
  const [holidayStart, setHolidayStart] = useState("");
  const [holidayEnd, setHolidayEnd] = useState("");
  const [holidayError, setHolidayError] = useState("");
  const [holidaySaving, setHolidaySaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const startRef = useRef<HTMLInputElement>(null);

  const hueMap = useMemo(() => buildStaffHueMap(staff.map((m) => m.id)), [staff]);

  const load = useCallback(async () => {
    const monthStart = format(startOfMonth(viewMonth), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(viewMonth), "yyyy-MM-dd");
    const [staffRes, workRes, holRes] = await Promise.all([
      supabase.from("staff").select("*").eq("is_active", true).order("name"),
      supabase.from("staff_work_dates").select("*").gte("work_date", monthStart).lte("work_date", monthEnd),
      supabase.from("salon_holidays").select("*").order("holiday_date"),
    ]);
    if (staffRes.data) {
      setStaff(
        (staffRes.data as Record<string, unknown>[])
          .filter((r) => !isStaffRowAdmin(r))
          .map((r) => normalizeStaffMember(r as StaffMember)),
      );
    }
    setWorkDates((workRes.data ?? []) as StaffWorkDateRow[]);
    setHolidays((holRes.data ?? []) as SalonHolidayRow[]);
    setLoading(false);
  }, [viewMonth]);

  useEffect(() => { void load(); }, [load]);

  const holidaySet = useMemo(() => new Set(holidays.map((h) => h.holiday_date)), [holidays]);

  const calendarDays = useMemo(() => {
    const from = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 });
    const to = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start: from, end: to });
  }, [viewMonth]);

  const today = useMemo(() => new Date(), []);
  const monthLabel = viewMonth.toLocaleString("ru-RU", { month: "long", year: "numeric" });

  function staffForDay(day: Date): StaffMember[] {
    const dateStr = format(day, "yyyy-MM-dd");
    const ids = new Set(workDates.filter((r) => r.work_date === dateStr).map((r) => r.staff_id));
    return staff.filter((m) => ids.has(m.id));
  }

  async function addHoliday() {
    const start = parseDatePart(holidayStart);
    if (!start) {
      setHolidayError("Неверный формат начала. Пример: 03.06 или 03.06.26");
      return;
    }
    let dates: string[];
    if (holidayEnd.trim()) {
      const end = parseDatePart(holidayEnd);
      if (!end) {
        setHolidayError("Неверный формат конца. Пример: 09.06 или 09.06.26");
        return;
      }
      const s = parseISO(start), e = parseISO(end);
      if (e < s) { setHolidayError("Дата конца раньше начала"); return; }
      if (eachDayOfInterval({ start: s, end: e }).length > 60) { setHolidayError("Диапазон не может быть больше 60 дней"); return; }
      dates = eachDayOfInterval({ start: s, end: e }).map((d) => format(d, "yyyy-MM-dd"));
    } else {
      dates = [start];
    }
    const newDates = dates.filter((d) => !holidaySet.has(d));
    if (!newDates.length) { setHolidayError("Эти даты уже добавлены"); return; }
    setHolidaySaving(true);
    setHolidayError("");
    const { error } = await supabase.from("salon_holidays").insert(newDates.map((d) => ({ holiday_date: d })));
    setHolidaySaving(false);
    if (error) { setHolidayError(error.message); return; }
    setHolidayStart("");
    setHolidayEnd("");
    startRef.current?.focus();
    void load();
  }

  async function deleteHoliday(id: string) {
    setDeletingId(id);
    await supabase.from("salon_holidays").delete().eq("id", id);
    setDeletingId(null);
    void load();
  }

  if (loading) return <p className="text-muted">Загрузка…</p>;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-fg">График</h1>
        <p className="mt-1 text-sm text-muted">Нажмите на день чтобы назначить мастеров на эту дату.</p>
      </header>

      {/* Month navigation */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setViewMonth((m) => subMonths(m, 1))}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-line/20 text-fg hover:bg-surface">←</button>
        <span className="min-w-[160px] text-center text-base font-medium capitalize text-fg">{monthLabel}</span>
        <button type="button" onClick={() => setViewMonth((m) => addMonths(m, 1))}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-line/20 text-fg hover:bg-surface">→</button>
        <button type="button" onClick={() => setViewMonth(startOfMonth(new Date()))}
          className="rounded-lg border border-line/20 px-3 py-1.5 text-sm text-fg hover:bg-surface">Сегодня</button>
      </div>

      {/* Calendar grid */}
      <div className="overflow-hidden rounded-xl border border-line/15">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 border-b border-line/15 bg-surface">
          {MON_FIRST_DOW.map((dow, i) => (
            <div key={dow} className={["py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted", i < 6 ? "border-r border-line/15" : ""].join(" ")}>
              {RU_WEEK[i]}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {calendarDays.map((day, idx) => {
            const inMonth = isSameMonth(day, viewMonth);
            const isToday = isSameDay(day, today);
            const dateStr = format(day, "yyyy-MM-dd");
            const isHoliday = holidaySet.has(dateStr);
            const working = isHoliday ? [] : staffForDay(day);
            const colPos = idx % 7;

            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={(e) => setDayPopup({ day, x: e.clientX, y: e.clientY })}
                className={[
                  "group relative flex min-h-[90px] flex-col gap-1 p-2 text-left transition",
                  colPos < 6 ? "border-r border-line/15" : "",
                  idx < calendarDays.length - 7 ? "border-b border-line/15" : "",
                  isHoliday ? "bg-rose-500/[0.07] hover:bg-rose-500/[0.12]" : "hover:bg-surface",
                  !inMonth ? "opacity-35" : "",
                ].join(" ")}
              >
                <span className={[
                  "flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold",
                  isHoliday ? "bg-rose-500 text-white" : isToday ? "bg-gold text-canvas" : "text-fg group-hover:bg-surface",
                ].join(" ")}>
                  {format(day, "d")}
                </span>

                {isHoliday && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-rose-400">закрыто</span>
                )}

                {!isHoliday && (
                  <div className="flex flex-col gap-0.5">
                    {working.map((m) => {
                      const c = googleStaffColor(m, hueMap);
                      return (
                        <span key={m.id} className="truncate rounded px-1.5 py-0.5 text-[11px] font-medium leading-tight"
                          style={{ backgroundColor: c.bg, color: c.fg }}>
                          {m.name.split(" ")[0]}
                        </span>
                      );
                    })}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Праздничные дни ── */}
      <section className="space-y-3 rounded-xl border border-line/15 p-4">
        <div className="flex items-center gap-2">
          <span className="text-base">🔴</span>
          <h2 className="text-sm font-semibold text-fg">Праздничные и закрытые дни</h2>
        </div>

        {/* Existing holidays */}
        {holidays.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {holidays.map((h) => (
              <span key={h.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-sm font-medium text-rose-400">
                {formatHolidayDate(h.holiday_date)}
                <button
                  type="button"
                  disabled={deletingId === h.id}
                  onClick={() => { void deleteHoliday(h.id); }}
                  className="flex h-4 w-4 items-center justify-center rounded-full text-rose-400/60 transition-colors hover:bg-rose-500/20 hover:text-rose-400 disabled:opacity-40"
                  aria-label="Удалить"
                >
                  <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="1" y1="1" x2="9" y2="9" /><line x1="9" y1="1" x2="1" y2="9" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">Нет закрытых дней</p>
        )}

        {/* Add form */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-start gap-2">
            {/* Start field */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium uppercase tracking-wide text-muted">Начало</label>
              <input
                ref={startRef}
                type="text"
                inputMode="numeric"
                value={holidayStart}
                onChange={(e) => { setHolidayStart(e.target.value); setHolidayError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") { void addHoliday(); } }}
                placeholder="03.06"
                className={[
                  "w-28 rounded-lg border bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted/50 focus:outline-none focus:ring-1",
                  holidayError && !holidayStart.trim() ? "border-rose-400 focus:ring-rose-400/30" : "border-line/20 focus:border-gold focus:ring-gold/30",
                ].join(" ")}
              />
            </div>

            {/* Arrow separator */}
            <span className="mt-7 text-muted">→</span>

            {/* End field */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium uppercase tracking-wide text-muted">Конец <span className="normal-case text-muted/60">(необязательно)</span></label>
              <input
                type="text"
                inputMode="numeric"
                value={holidayEnd}
                onChange={(e) => { setHolidayEnd(e.target.value); setHolidayError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") { void addHoliday(); } }}
                placeholder="09.06"
                className="w-28 rounded-lg border border-line/20 bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted/50 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold/30"
              />
            </div>

            <button
              type="button"
              disabled={!holidayStart.trim() || holidaySaving}
              onClick={() => { void addHoliday(); }}
              className="mt-6 shrink-0 rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-600 disabled:opacity-40"
            >
              {holidaySaving ? "…" : "+ Добавить"}
            </button>
          </div>

          {holidayError && <p className="text-xs text-rose-400">{holidayError}</p>}
          <p className="text-xs text-muted">Формат: <span className="font-mono">03.06</span> или <span className="font-mono">03.06.26</span></p>
        </div>
      </section>

      {dayPopup && (
        <AdminDaySchedulePopup
          day={dayPopup.day}
          anchorX={dayPopup.x}
          anchorY={dayPopup.y}
          allStaff={staff}
          workDates={workDates}
          holidays={[...holidaySet]}
          onClose={() => setDayPopup(null)}
          onSaved={() => { void load(); }}
        />
      )}
    </div>
  );
}
