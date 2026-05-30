import { useState } from "react";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  format,
  isSameDay,
  isSameMonth,
  isSameWeek,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import type { StaffMember } from "../../types/database";
import { buildStaffHueMap } from "../../lib/staffHue";

type Props = {
  cursor: Date;
  onDateSelect: (date: Date) => void;
  staff: StaffMember[];
  visibleStaffIds: Set<string>;
  onToggleStaff: (id: string) => void;
};

const DAY_NAMES = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export function ReceptionSidebar({
  cursor,
  onDateSelect,
  staff,
  visibleStaffIds,
  onToggleStaff,
}: Props) {
  const [miniCursor, setMiniCursor] = useState(() => new Date());
  const today = new Date();
  const staffHueMap = buildStaffHueMap(staff.map((m) => m.id));

  const monthStart = startOfMonth(miniCursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const miniDays = eachDayOfInterval({ start: gridStart, end: addDays(gridStart, 41) });

  function staffColor(member: StaffMember, idx: number): string {
    const hex = member.calendar_color_hex?.trim();
    if (hex && /^#[0-9a-f]{6}$/i.test(hex)) return hex;
    const hue = staffHueMap.get(member.id) ?? (idx * 37) % 360;
    return `hsl(${hue}, 65%, 45%)`;
  }

  return (
    <div className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-line/15 bg-panel py-3">
      {/* Mini calendar */}
      <div className="px-3">
        <div className="mb-1 flex items-center justify-between">
          <button
            onClick={() => setMiniCursor((d) => subMonths(d, 1))}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-fg"
            aria-label="Предыдущий месяц"
          >
            ‹
          </button>
          <span className="text-xs font-medium capitalize text-fg/70">
            {miniCursor.toLocaleString("ru-RU", { month: "long", year: "numeric" })}
          </span>
          <button
            onClick={() => setMiniCursor((d) => addMonths(d, 1))}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-fg"
            aria-label="Следующий месяц"
          >
            ›
          </button>
        </div>

        {/* Day name headers */}
        <div className="grid grid-cols-7 text-center">
          {DAY_NAMES.map((d) => (
            <div key={d} className="py-0.5 text-[10px] font-medium text-muted/60">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 text-center">
          {miniDays.map((day) => {
            const isToday = isSameDay(day, today);
            const isSelected = isSameWeek(day, cursor, { weekStartsOn: 1 });
            const isCurrentMonth = isSameMonth(day, miniCursor);
            return (
              <button
                key={day.toISOString()}
                onClick={() => onDateSelect(day)}
                className={[
                  "mx-auto flex h-7 w-7 items-center justify-center rounded-full text-[11px] transition-colors",
                  isToday
                    ? "bg-gold font-bold text-canvas"
                    : isSelected && !isToday
                    ? "bg-surface text-fg"
                    : isCurrentMonth
                    ? "text-fg/70 hover:bg-surface/60"
                    : "text-muted/40 hover:bg-surface/40",
                ].join(" ")}
              >
                {format(day, "d")}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mx-3 my-3 border-t border-line/15" />

      {/* Staff list */}
      <div className="px-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted/60">
          Мастера
        </p>
        <div className="space-y-0.5">
          {staff.map((member, idx) => (
            <label
              key={member.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface/50"
            >
              <input
                type="checkbox"
                checked={visibleStaffIds.has(member.id)}
                onChange={() => onToggleStaff(member.id)}
                className="sr-only"
              />
              <span
                className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm transition-colors"
                style={{
                  backgroundColor: visibleStaffIds.has(member.id)
                    ? staffColor(member, idx)
                    : "transparent",
                  border: `2px solid ${staffColor(member, idx)}`,
                }}
              >
                {visibleStaffIds.has(member.id) && (
                  <svg viewBox="0 0 10 10" className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="1.5,5 4,7.5 8.5,2.5" />
                  </svg>
                )}
              </span>
              <span className="truncate text-sm text-fg/80">{member.name}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
