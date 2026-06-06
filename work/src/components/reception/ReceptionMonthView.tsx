import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  addDays,
  eachDayOfInterval,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type { StaffMember, StaffWorkDateRow } from "../../types/database";
import { buildStaffHueMap } from "../../lib/staffHue";
import { googleStaffColor } from "./receptionColors";

const WEEKDAY_KEYS = [1, 2, 3, 4, 5, 6, 0] as const; // Mon→1 … Sun→0

type Props = {
  cursor: Date;
  staff: StaffMember[];
  workDates: StaffWorkDateRow[];
  visibleStaffIds: Set<string>;
  onDayClick: (day: Date) => void;
  dark?: boolean;
};

export function ReceptionMonthView({
  cursor,
  staff,
  workDates,
  visibleStaffIds,
  onDayClick,
  dark,
}: Props) {
  const { t } = useTranslation();
  const today = new Date();
  const staffHueMap = useMemo(() => buildStaffHueMap(staff.map((m) => m.id)), [staff]);

  const hoverCls = dark ? "hover:bg-white/5" : "hover:bg-surface/60";
  const inactiveDay = dark ? "text-fg/30" : "text-fg/30";
  const offMonthBg = dark ? "bg-canvas/50" : "bg-line/5";

  const staffMap = useMemo(() => {
    const m = new Map<string, StaffMember>();
    for (const s of staff) m.set(s.id, s);
    return m;
  }, [staff]);

  const monthStart = startOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridDays = eachDayOfInterval({ start: gridStart, end: addDays(gridStart, 41) });

  const workingByDay = useMemo(() => {
    const map = new Map<string, StaffMember[]>();
    for (const wd of workDates) {
      if (!visibleStaffIds.has(wd.staff_id)) continue;
      const member = staffMap.get(wd.staff_id);
      if (!member) continue;
      if (!map.has(wd.work_date)) map.set(wd.work_date, []);
      map.get(wd.work_date)!.push(member);
    }
    return map;
  }, [workDates, visibleStaffIds, staffMap]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-canvas">
      {/* Column headers */}
      <div className="grid shrink-0 grid-cols-7 border-b border-line/15 bg-canvas">
        {WEEKDAY_KEYS.map((k) => (
          <div
            key={k}
            className="py-2 text-center text-[11px] font-medium uppercase tracking-wide text-muted"
          >
            {t(`weekday.${k}`)}
          </div>
        ))}
      </div>

      {/* Month grid — rows auto-size so all staff chips are visible */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-canvas">
        <div className="grid grid-cols-7 bg-canvas">
          {gridDays.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const workingStaff = workingByDay.get(key) ?? [];
            const isToday = isSameDay(day, today);
            const isCurrentMonth = isSameMonth(day, cursor);

            return (
              <button
                key={key}
                onClick={() => onDayClick(day)}
                className={[
                  "flex flex-col border-b border-r border-line/10 p-1 text-left transition-colors",
                  !isCurrentMonth ? offMonthBg : hoverCls,
                ].join(" ")}
                style={{ minHeight: "4.5rem" }}
              >
                <span
                  className={[
                    "mb-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                    isToday
                      ? "bg-[#1a73e8] text-white"
                      : isCurrentMonth
                      ? "text-fg"
                      : inactiveDay,
                  ].join(" ")}
                >
                  {format(day, "d")}
                </span>

                {workingStaff.length > 0 && (
                  <div className="flex flex-wrap gap-0.5">
                    {workingStaff.map((m) => {
                      const c = googleStaffColor(m, staffHueMap);
                      return (
                        <span
                          key={m.id}
                          className="max-w-full truncate rounded px-1 py-0 text-[9px] font-medium leading-4"
                          style={{ backgroundColor: c.bg, color: c.fg }}
                        >
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
    </div>
  );
}
