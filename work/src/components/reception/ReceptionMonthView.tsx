import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  addDays,
  eachDayOfInterval,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type { AppointmentRow, StaffMember } from "../../types/database";
import { buildStaffHueMap } from "../../lib/staffHue";
import { googleStaffColor } from "./receptionColors";

const WEEKDAY_KEYS = [1, 2, 3, 4, 5, 6, 0] as const; // Mon→1 … Sun→0

type Props = {
  cursor: Date;
  staff: StaffMember[];
  appointments: AppointmentRow[];
  visibleStaffIds: Set<string>;
  onDayClick: (day: Date) => void;
  onApptClick: (appt: AppointmentRow, x: number, y: number) => void;
};

export function ReceptionMonthView({
  cursor,
  staff,
  appointments,
  visibleStaffIds,
  onDayClick,
  onApptClick,
}: Props) {
  const { t } = useTranslation();
  const today = new Date();
  const staffHueMap = useMemo(() => buildStaffHueMap(staff.map((m) => m.id)), [staff]);

  const staffMap = useMemo(() => {
    const m = new Map<string, StaffMember>();
    for (const s of staff) m.set(s.id, s);
    return m;
  }, [staff]);

  const monthStart = startOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridDays = eachDayOfInterval({ start: gridStart, end: addDays(gridStart, 41) });

  const apptsByDay = useMemo(() => {
    const map = new Map<string, AppointmentRow[]>();
    for (const appt of appointments) {
      if (!visibleStaffIds.has(appt.staff_id)) continue;
      try {
        const dt = parseISO(appt.start_time);
        const key = format(dt, "yyyy-MM-dd");
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(appt);
      } catch { /* skip */ }
    }
    for (const [, appts] of map) {
      appts.sort((a, b) => a.start_time.localeCompare(b.start_time));
    }
    return map;
  }, [appointments, visibleStaffIds]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
      {/* Column headers */}
      <div className="grid shrink-0 grid-cols-7 border-b border-[#dadce0] bg-white">
        {WEEKDAY_KEYS.map((k) => (
          <div
            key={k}
            className="py-2 text-center text-[11px] font-medium uppercase tracking-wide text-[#70757a]"
          >
            {t(`weekday.${k}`)}
          </div>
        ))}
      </div>

      {/* Month grid */}
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 overflow-hidden bg-white">
        {gridDays.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const dayAppts = apptsByDay.get(key) ?? [];
          const isToday = isSameDay(day, today);
          const isCurrentMonth = isSameMonth(day, cursor);
          const MAX_VISIBLE = 3;
          const visibleAppts = dayAppts.slice(0, MAX_VISIBLE);
          const hiddenCount = dayAppts.length - MAX_VISIBLE;

          return (
            <div
              key={key}
              className={[
                "relative flex min-h-0 flex-col overflow-hidden border-b border-r border-[#e8eaed] p-1",
                !isCurrentMonth ? "bg-[#f8f9fa]" : "",
              ].join(" ")}
            >
              <button
                onClick={() => onDayClick(day)}
                className={[
                  "mb-0.5 flex h-6 w-6 shrink-0 items-center justify-center self-start rounded-full text-xs font-medium transition-colors",
                  isToday
                    ? "bg-[#1a73e8] text-white"
                    : isCurrentMonth
                    ? "text-[#3c4043] hover:bg-[#f1f3f4]"
                    : "text-[#bdc1c6] hover:bg-[#f1f3f4]",
                ].join(" ")}
              >
                {format(day, "d")}
              </button>

              <div className="flex min-h-0 flex-col gap-0.5 overflow-hidden">
                {visibleAppts.map((appt) => {
                  const member = staffMap.get(appt.staff_id);
                  const c = member
                    ? googleStaffColor(member, staffHueMap)
                    : { bg: "#7986cb", fg: "#ffffff", border: "#5c6bc0" };
                  const startTime = (() => {
                    try { return format(parseISO(appt.start_time), "HH:mm"); } catch { return ""; }
                  })();
                  return (
                    <button
                      key={appt.id}
                      onClick={(e) => { e.stopPropagation(); onApptClick(appt, e.clientX, e.clientY); }}
                      className="w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-medium hover:brightness-95"
                      style={{ backgroundColor: c.bg, color: c.fg }}
                    >
                      {startTime} {appt.client_name}
                    </button>
                  );
                })}
                {hiddenCount > 0 && (
                  <button
                    onClick={() => onDayClick(day)}
                    className="text-left text-[10px] text-[#70757a] hover:text-[#3c4043]"
                  >
                    {t("reception.moreAppts", { count: hiddenCount })}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
