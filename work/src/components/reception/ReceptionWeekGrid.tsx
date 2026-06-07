import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  addMinutes,
  format,
  isSameDay,
  parseISO,
  setHours,
  startOfDay,
} from "date-fns";
import type {
  AppointmentRow,
  ServiceRow,
  StaffMember,
  StaffTimeOffRow,
  StaffWorkDateRow,
} from "../../types/database";
import { buildStaffHueMap } from "../../lib/staffHue";
import { appointmentInterval, intervalsOverlap } from "../../lib/slots";
import { googleStaffColor } from "./receptionColors";
import { useTheme } from "../../context/ThemeContext";

const START_HOUR = 0;
const END_HOUR = 24;
const PX_PER_HOUR = 64;
const TOTAL_PX = (END_HOUR - START_HOUR) * PX_PER_HOUR;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

// Mon=1..Sat=6, Sun=0 — maps array index (0=Mon…6=Sun) to weekday key
const WEEKDAY_KEYS = [1, 2, 3, 4, 5, 6, 0] as const;

function timeToPx(date: Date, dayAnchor: Date): number {
  const diffMs = date.getTime() - dayAnchor.getTime();
  return (diffMs / 3_600_000) * PX_PER_HOUR;
}

type ApptLayout = {
  appt: AppointmentRow;
  col: number;
  totalCols: number;
};

function computeOverlapLayout(appts: AppointmentRow[]): ApptLayout[] {
  const sorted = [...appts].sort(
    (a, b) => parseISO(a.start_time).getTime() - parseISO(b.start_time).getTime(),
  );
  const colEnds: Date[] = [];
  const colAssignments: number[] = [];

  for (const appt of sorted) {
    const iv = appointmentInterval(appt);
    if (!iv) { colAssignments.push(0); continue; }
    let assignedCol = colEnds.findIndex((end) => end.getTime() <= iv.start.getTime());
    if (assignedCol === -1) assignedCol = colEnds.length;
    colEnds[assignedCol] = iv.end;
    colAssignments.push(assignedCol);
  }

  return sorted.map((appt, i) => {
    const iv = appointmentInterval(appt);
    if (!iv) return { appt, col: 0, totalCols: 1 };
    let maxCol = colAssignments[i] ?? 0;
    for (let j = 0; j < sorted.length; j++) {
      if (i === j) continue;
      const otherIv = appointmentInterval(sorted[j]!);
      if (!otherIv) continue;
      if (intervalsOverlap(iv.start, iv.end, otherIv.start, otherIv.end)) {
        maxCol = Math.max(maxCol, colAssignments[j] ?? 0);
      }
    }
    return { appt, col: colAssignments[i] ?? 0, totalCols: maxCol + 1 };
  });
}

type Props = {
  days: Date[];
  staff: StaffMember[];
  appointments: AppointmentRow[];
  services: ServiceRow[];
  timeOff: StaffTimeOffRow[];
  workDates: StaffWorkDateRow[];
  visibleStaffIds: Set<string>;
  onSlotClick: (start: Date, anchorX: number, anchorY: number) => void;
  onApptClick: (appt: AppointmentRow, x: number, y: number) => void;
  onApptResize?: (appt: AppointmentRow, newStart: Date, newEnd: Date) => void;
  onDayHeaderClick?: (day: Date, x: number, y: number) => void;
  dark?: boolean;
};

export function ReceptionWeekGrid({
  days,
  staff,
  appointments,
  services,
  timeOff,
  workDates,
  visibleStaffIds,
  onSlotClick,
  onApptClick,
  onApptResize,
  onDayHeaderClick,
  dark,
}: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const useGold = theme !== "white";
  const bg = dark ? "bg-panel" : "bg-canvas";
  const borderCls = "border-line/15";
  const mutedCls = "text-muted";
  const textCls = "text-fg";
  const hoverCls = dark ? "hover:bg-white/5" : "hover:bg-surface";
  const hrLine = "border-line/10";
  const todayBg = useGold ? "bg-gold/[0.05]" : "bg-[#1a73e8]/[0.04]";
  const stripes = dark
    ? "repeating-linear-gradient(-45deg, rgba(255,255,255,0.12) 0, rgba(255,255,255,0.12) 1px, transparent 0, transparent 50%)"
    : "repeating-linear-gradient(-45deg, #c0c4cc 0, #c0c4cc 1px, transparent 0, transparent 50%)";
  const [now, setNow] = useState(() => new Date());
  const [scrollbarWidth, setScrollbarWidth] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Measure scrollbar width so the header columns align with the body columns
  useLayoutEffect(() => {
    if (bodyRef.current) {
      setScrollbarWidth(bodyRef.current.offsetWidth - bodyRef.current.clientWidth);
      // Scroll to 9:30 on initial load
      bodyRef.current.scrollTop = 9.5 * PX_PER_HOUR;
    }
  }, []);
  const staffHueMap = useMemo(() => buildStaffHueMap(staff.map((m) => m.id)), [staff]);

  // Resize mode: press and hold a booking for 1 s to put THAT booking into
  // resize mode. It then shows top/bottom drag handles you can grab (you may
  // lift your finger first) to change the start/end time in 30-min steps.
  // Tapping empty calendar space exits resize mode. A quick tap (no hold)
  // opens the edit popup as usual.
  const RESIZE_STEP_MIN = 30;
  const LONG_PRESS_MS = 1000;

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const pointerDownY = useRef(0);
  const [resizeModeId, setResizeModeId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ id: string; start: Date; end: Date } | null>(null);
  const [birthdayPopup, setBirthdayPopup] = useState<{ x: number; y: number; names: string[] } | null>(null);

  // Active handle drag (only while a booking is in resize mode)
  const handleDragRef = useRef<{
    appt: AppointmentRow;
    edge: "top" | "bottom";
    origStart: Date;
    origEnd: Date;
    startClientY: number;
    curStart: Date;
    curEnd: Date;
  } | null>(null);

  function clearLongPress() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }

  // ---- Mouse: card click opens popup (handle zones stop propagation, so this
  //      only fires for clicks in the middle area of the card) ----
  function handleCardPointerDown(e: React.PointerEvent<HTMLDivElement>, appt: AppointmentRow) {
    if (e.button !== 0 && e.pointerType === "mouse") return;

    if (e.pointerType === "mouse") {
      pointerDownY.current = e.clientY;
      return; // resize handled by always-visible handle strips
    }

    // Touch: long-press to enter resize mode
    if (resizeModeId === appt.id) return;
    longPressFired.current = false;
    pointerDownY.current = e.clientY;
    clearLongPress();
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      setResizeModeId(appt.id);
    }, LONG_PRESS_MS);
  }

  function handleCardPointerUp(e: React.PointerEvent<HTMLDivElement>, appt: AppointmentRow) {
    clearLongPress();

    if (e.pointerType === "mouse") {
      if (Math.abs(e.clientY - pointerDownY.current) <= 4) {
        onApptClick(appt, e.clientX, e.clientY);
      }
      return;
    }

    // Touch path
    if (longPressFired.current) { longPressFired.current = false; return; }
    if (resizeModeId === appt.id) return;
    // If finger moved > 8 px it was a scroll attempt — don't open popup
    if (Math.abs(e.clientY - pointerDownY.current) > 8) return;
    onApptClick(appt, e.clientX, e.clientY);
  }

  function handleCardPointerCancel() {
    // Browser fired pointercancel — it took over the gesture for scrolling.
    clearLongPress();
  }

  // ---- Mouse: immediate drag from always-visible handle strips ----
  function handleMouseHandlePointerDown(
    e: React.PointerEvent<HTMLDivElement>,
    appt: AppointmentRow,
    edge: "top" | "bottom",
    start: Date,
    end: Date,
  ) {
    if (e.pointerType !== "mouse") return;
    e.stopPropagation();
    handleDragRef.current = {
      appt, edge, origStart: start, origEnd: end,
      startClientY: e.clientY, curStart: start, curEnd: end,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleMouseHandlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse") return;
    e.stopPropagation();
    const d = handleDragRef.current;
    handleDragRef.current = null;
    setPreview(null);
    if (!d) return;
    const changed =
      d.curStart.getTime() !== d.origStart.getTime() ||
      d.curEnd.getTime() !== d.origEnd.getTime();
    if (!changed) {
      // No drag — treat as a regular click to open the appointment
      onApptClick(d.appt, e.clientX, e.clientY);
      return;
    }
    if (onApptResize) onApptResize(d.appt, d.curStart, d.curEnd);
  }

  // ---- Touch: dragging a resize handle (only when card is in resize mode) ----
  function handleHandlePointerDown(
    e: React.PointerEvent<HTMLDivElement>,
    appt: AppointmentRow,
    edge: "top" | "bottom",
    start: Date,
    end: Date,
  ) {
    e.stopPropagation();
    clearLongPress();
    handleDragRef.current = {
      appt, edge, origStart: start, origEnd: end,
      startClientY: e.clientY, curStart: start, curEnd: end,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleHandlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = handleDragRef.current;
    if (!d) return;
    const deltaY = e.clientY - d.startClientY;
    const stepPx = (RESIZE_STEP_MIN / 60) * PX_PER_HOUR;
    const steps = Math.round(deltaY / stepPx);
    const deltaMin = steps * RESIZE_STEP_MIN;
    let start = d.origStart;
    let end = d.origEnd;
    if (d.edge === "top") {
      start = addMinutes(d.origStart, deltaMin);
      if (start.getTime() >= end.getTime()) start = addMinutes(end, -RESIZE_STEP_MIN);
    } else {
      end = addMinutes(d.origEnd, deltaMin);
      if (end.getTime() <= start.getTime()) end = addMinutes(start, RESIZE_STEP_MIN);
    }
    d.curStart = start;
    d.curEnd = end;
    setPreview({ id: d.appt.id, start, end });
  }

  function handleHandlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    const d = handleDragRef.current;
    handleDragRef.current = null;
    setPreview(null);
    if (!d) return;
    const changed =
      d.curStart.getTime() !== d.origStart.getTime() ||
      d.curEnd.getTime() !== d.origEnd.getTime();
    if (changed && onApptResize) onApptResize(d.appt, d.curStart, d.curEnd);
  }

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);


  function handleBodyClick(e: React.MouseEvent<HTMLDivElement>, day: Date) {
    if ((e.target as HTMLElement).closest("[data-appt]")) return;
    // Tapping empty calendar space exits resize mode (does not also open the
    // new-booking popup, so it's an easy way to "deactivate" stretching).
    if (resizeModeId) { setResizeModeId(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    // rect.top is already in viewport coords (accounts for scroll), no need to add scrollTop
    const yOffset = e.clientY - rect.top;
    const minutesFromStart = Math.floor((yOffset / PX_PER_HOUR) * 60);
    const snappedMinutes = Math.max(0, Math.floor(minutesFromStart / 30) * 30);
    const dayAnchor = setHours(startOfDay(day), START_HOUR);
    const clickedTime = addMinutes(dayAnchor, snappedMinutes);
    onSlotClick(clickedTime, e.clientX, e.clientY);
  }

  const serviceMap = useMemo(() => {
    const m = new Map<string, ServiceRow>();
    for (const s of services) m.set(String(s.id), s);
    return m;
  }, [services]);

  return (
    <>
    <div className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${bg}`}>
      {/* Day header row — right-pad by scrollbar width so columns align with body */}
      <div className={`flex shrink-0 border-b ${borderCls} ${bg}`} style={{ paddingRight: scrollbarWidth }}>
        <div className={`flex w-10 shrink-0 items-end justify-center pb-1 text-[10px] md:w-14 ${mutedCls}`}>
          GMT+3
        </div>
        {days.map((day, i) => {
          const isToday = isSameDay(day, now);
          const dateStr = format(day, "yyyy-MM-dd");
          const dayMMDD = format(day, "MM-dd");
          const workingIds = new Set(
            workDates.filter((r) => r.work_date === dateStr).map((r) => r.staff_id),
          );
          const workingStaff = staff
            .filter((m) => workingIds.has(m.id) && visibleStaffIds.has(m.id))
            .sort((a, b) => a.name.localeCompare(b.name, "et", { sensitivity: "base" }));
          const birthdayStaff = staff.filter(
            (m) => m.birthday === dayMMDD && visibleStaffIds.has(m.id),
          );
          const ruDay = t(`weekday.${WEEKDAY_KEYS[i] ?? 1}`);
          return (
            <div
              key={day.toISOString()}
              className={[
                `flex min-w-0 flex-1 flex-col items-center border-l ${borderCls} py-1`,
                onDayHeaderClick ? `cursor-pointer ${hoverCls}` : "",
              ].join(" ")}
              onClick={onDayHeaderClick ? (e) => onDayHeaderClick(day, e.clientX, e.clientY) : undefined}
            >
              <span className={`text-[11px] font-medium uppercase tracking-wide ${mutedCls}`}>
                {ruDay}
              </span>
              <div className="flex items-center justify-center gap-1">
                <span
                  className={[
                    "flex h-7 w-7 items-center justify-center rounded-full text-base font-medium md:h-8 md:w-8 md:text-lg",
                    isToday
                      ? useGold ? "bg-gold text-canvas" : "bg-[#1a73e8] text-white"
                      : textCls,
                  ].join(" ")}
                >
                  {format(day, "d")}
                </span>
                {birthdayStaff.length > 0 && (
                  <button
                    type="button"
                    className="text-base leading-none transition-transform hover:scale-125 active:scale-110"
                    title="День рождения!"
                    onClick={(e) => {
                      e.stopPropagation();
                      setBirthdayPopup({ x: e.clientX, y: e.clientY, names: birthdayStaff.map((m) => m.name) });
                    }}
                  >
                    🎂
                  </button>
                )}
              </div>
              {workingStaff.length > 0 && (
                <div className="mt-0.5 flex flex-wrap justify-center gap-0.5 px-0.5">
                  {workingStaff.map((m) => {
                    const c = googleStaffColor(m, staffHueMap);
                    return (
                      <span
                        key={m.id}
                        className="max-w-[48px] truncate rounded px-1 py-0.5 text-[9px] font-medium md:max-w-[56px] md:px-1.5 md:text-[10px]"
                        style={{ backgroundColor: c.bg, color: c.fg }}
                      >
                        {m.name.split(" ")[0]}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Scrollable time body */}
      <div ref={bodyRef} className={`flex min-h-0 flex-1 overflow-y-scroll ${bg}`}>
        {/* Time gutter */}
        <div className={`relative w-10 shrink-0 md:w-14 ${bg}`} style={{ height: TOTAL_PX }}>
          {HOURS.map((h) => (
            <div
              key={h}
              className={`absolute right-0.5 text-[9px] md:right-2 md:text-[10px] ${mutedCls}`}
              style={{ top: (h - START_HOUR) * PX_PER_HOUR - 6 }}
            >
              {h.toString().padStart(2, "0")}:00
            </div>
          ))}
          {days.some((d) => isSameDay(d, now)) && (
            <div
              className="absolute right-0 h-2.5 w-2.5 rounded-full bg-[#ea4335]"
              style={{
                top:
                  (now.getHours() - START_HOUR) * PX_PER_HOUR +
                  (now.getMinutes() / 60) * PX_PER_HOUR - 5,
              }}
            />
          )}
        </div>

        {/* Day columns */}
        <div className="flex flex-1">
          {days.map((day) => {
            const dayAnchor = setHours(startOfDay(day), START_HOUR);
            const isToday = isSameDay(day, now);

            const dayMMDD2 = format(day, "MM-dd");
            const birthdayMembersForDay = staff.filter(
              (m) => m.birthday === dayMMDD2 && visibleStaffIds.has(m.id),
            );
            const FLOWER_EMOJIS = ["🌸", "🌷", "🌺", "🌼", "💐"];

            const dayAppts = appointments.filter((a) => {
              if (!visibleStaffIds.has(a.staff_id)) return false;
              const iv = appointmentInterval(a);
              if (!iv) return false;
              // Hide legacy all-day "work-day" blocks (≥16h) — they're schedule
              // markers, not real bookings, and would fill the whole column.
              if (iv.end.getTime() - iv.start.getTime() >= 16 * 3_600_000) return false;
              return isSameDay(iv.start, day);
            });

            const dayTimeOff = timeOff.filter((to) => {
              if (!visibleStaffIds.has(to.staff_id)) return false;
              const iv = appointmentInterval({ start_time: to.start_time, end_time: to.end_time });
              if (!iv) return false;
              return isSameDay(iv.start, day);
            });

            const layouts = computeOverlapLayout(dayAppts);

            return (
              <div
                key={day.toISOString()}
                className={[
                  `relative min-w-0 flex-1 cursor-pointer select-none border-l ${borderCls}`,
                  isToday ? todayBg : "",
                ].join(" ")}
                style={{ height: TOTAL_PX }}
                onClick={(e) => handleBodyClick(e, day)}
              >
                {/* Hour lines + half-hour marks */}
                {HOURS.map((h) => (
                  <React.Fragment key={h}>
                    <div
                      className={`pointer-events-none absolute inset-x-0 border-t ${hrLine}`}
                      style={{ top: (h - START_HOUR) * PX_PER_HOUR }}
                    />
                    <div
                      className="pointer-events-none absolute inset-x-0 border-t border-line/[0.04]"
                      style={{ top: (h - START_HOUR) * PX_PER_HOUR + PX_PER_HOUR / 2 }}
                    />
                  </React.Fragment>
                ))}

                {/* Time-off zones */}
                {dayTimeOff.map((to) => {
                  const iv = appointmentInterval({ start_time: to.start_time, end_time: to.end_time });
                  if (!iv) return null;
                  const topPx = timeToPx(iv.start, dayAnchor);
                  const heightPx = Math.max(timeToPx(iv.end, dayAnchor) - topPx, 8);
                  if (topPx < 0 || topPx > TOTAL_PX) return null;
                  return (
                    <div
                      key={to.id}
                      className="pointer-events-none absolute inset-x-0 opacity-30"
                      style={{
                        top: topPx,
                        height: heightPx,
                        backgroundImage: stripes,
                        backgroundSize: "6px 6px",
                      }}
                    />
                  );
                })}

                {/* Current time line */}
                {isToday && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-10 h-[2px] bg-[#ea4335]"
                    style={{
                      top:
                        (now.getHours() - START_HOUR) * PX_PER_HOUR +
                        (now.getMinutes() / 60) * PX_PER_HOUR,
                    }}
                  />
                )}

                {/* Appointment cards */}
                {/* Birthday flowers in free 30-min slots (9:00–20:00) */}
                {birthdayMembersForDay.flatMap((member) => {
                  const FLOWER_START_H = 9;
                  const FLOWER_END_H = 20;
                  const slotStart = setHours(startOfDay(day), FLOWER_START_H);
                  const totalSlots = (FLOWER_END_H - FLOWER_START_H) * 2;
                  return Array.from({ length: totalSlots }, (_, si) => {
                    const cur = addMinutes(slotStart, si * 30);
                    const slotEnd = addMinutes(cur, 30);
                    /* Slot is occupied if ANY visible appointment covers it */
                    const occupied = dayAppts.some((a) => {
                      const iv = appointmentInterval(a);
                      if (!iv) return false;
                      return intervalsOverlap(cur, slotEnd, iv.start, iv.end);
                    });
                    if (occupied) return null;
                    const topPx = timeToPx(cur, dayAnchor);
                    const emoji = FLOWER_EMOJIS[si % FLOWER_EMOJIS.length]!;
                    return (
                      <div
                        key={`flower-${member.id}-${si}`}
                        className="pointer-events-none absolute inset-x-0 flex items-center justify-center text-base opacity-70"
                        style={{ top: topPx, height: PX_PER_HOUR / 2, zIndex: 1 }}
                      >
                        {emoji}
                      </div>
                    );
                  });
                })}

                {layouts.map(({ appt, col, totalCols }) => {
                  const iv = appointmentInterval(appt);
                  if (!iv) return null;
                  const isResizing = preview?.id === appt.id;
                  const inResizeMode = resizeModeId === appt.id;
                  const effStart = isResizing ? preview!.start : iv.start;
                  const effEnd = isResizing ? preview!.end : iv.end;
                  const topPx = timeToPx(effStart, dayAnchor);
                  const heightPx = Math.max(timeToPx(effEnd, dayAnchor) - topPx, 20);
                  if (topPx < -20 || topPx > TOTAL_PX) return null;

                  const widthPct = 100 / totalCols;
                  const leftPct = (col / totalCols) * 100;
                  const member = staff.find((s) => s.id === appt.staff_id);
                  const c = member
                    ? googleStaffColor(member, staffHueMap)
                    : { bg: "#7986cb", fg: "#ffffff", border: "#5c6bc0" };
                  const isBlockTime = !appt.service_id || appt.note === "block_time";
                  const svc = appt.service_id ? serviceMap.get(String(appt.service_id)) : undefined;
                  const isPast = effEnd.getTime() < now.getTime();

                  return (
                    <div
                      key={appt.id}
                      data-appt="1"
                      className={[
                        "absolute overflow-hidden rounded-md px-1.5 py-0.5 text-left shadow-sm transition-all",
                        inResizeMode ? "touch-none shadow-lg ring-2 ring-white/70" : "hover:shadow-md",
                        isResizing ? "touch-none" : "",
                        "group",
                      ].join(" ")}
                      style={{
                        top: topPx + 1,
                        height: heightPx - 2,
                        left: `calc(${leftPct}% + 1px)`,
                        width: `calc(${widthPct}% - 2px)`,
                        backgroundColor: c.bg,
                        backgroundImage: isBlockTime ? "repeating-linear-gradient(45deg,transparent,transparent 5px,rgba(0,0,0,0.12) 5px,rgba(0,0,0,0.12) 10px)" : undefined,
                        color: c.fg,
                        opacity: isPast && !inResizeMode ? 0.45 : 1,
                        cursor: "pointer",
                        zIndex: isResizing || inResizeMode ? 20 : undefined,
                      }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        handleCardPointerDown(e, appt);
                      }}
                      onPointerUp={(e) => {
                        e.stopPropagation();
                        handleCardPointerUp(e, appt);
                      }}
                      onPointerCancel={handleCardPointerCancel}
                    >
                      <p className="truncate text-[11px] font-semibold leading-tight">
                        {isBlockTime ? (
                          <span className="inline-flex items-center gap-0.5">
                            <svg viewBox="0 0 16 16" className="h-2.5 w-2.5 shrink-0" fill="currentColor">
                              <path d="M11 7V5a3 3 0 1 0-6 0v2H4a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-1ZM6 5a2 2 0 1 1 4 0v2H6V5Z"/>
                            </svg>
                            {appt.client_name && appt.client_name !== "— Закрыто —" ? appt.client_name : "Закрыто"}
                          </span>
                        ) : appt.client_name}
                      </p>
                      {heightPx > 28 && (
                        <p className="truncate text-[10px] leading-tight opacity-90">
                          {format(effStart, "HH:mm")}–{format(effEnd, "HH:mm")}
                          {svc ? ` · ${svc.name_et}` : ""}
                        </p>
                      )}
                      {/* Top resize handle: mouse = always draggable, touch = only in resize mode */}
                      <div
                        className={[
                          "absolute inset-x-0 top-0 z-30 flex h-5 cursor-ns-resize items-start justify-center",
                          inResizeMode ? "touch-none" : "",
                        ].join(" ")}
                        onPointerDown={(e) => {
                          if (e.pointerType === "mouse") {
                            handleMouseHandlePointerDown(e, appt, "top", iv.start, iv.end);
                          } else if (inResizeMode) {
                            handleHandlePointerDown(e, appt, "top", iv.start, iv.end);
                          }
                        }}
                        onPointerMove={handleHandlePointerMove}
                        onPointerUp={(e) => {
                          if (e.pointerType === "mouse") {
                            handleMouseHandlePointerUp(e);
                          } else if (inResizeMode) {
                            handleHandlePointerUp(e);
                          }
                        }}
                      >
                        {inResizeMode && <div className="mt-0.5 h-1.5 w-8 rounded-full bg-white shadow" />}
                      </div>
                      {/* Bottom resize handle */}
                      <div
                        className={[
                          "absolute inset-x-0 bottom-0 z-30 flex h-5 cursor-ns-resize items-end justify-center",
                          inResizeMode ? "touch-none" : "",
                        ].join(" ")}
                        onPointerDown={(e) => {
                          if (e.pointerType === "mouse") {
                            handleMouseHandlePointerDown(e, appt, "bottom", iv.start, iv.end);
                          } else if (inResizeMode) {
                            handleHandlePointerDown(e, appt, "bottom", iv.start, iv.end);
                          }
                        }}
                        onPointerMove={handleHandlePointerMove}
                        onPointerUp={(e) => {
                          if (e.pointerType === "mouse") {
                            handleMouseHandlePointerUp(e);
                          } else if (inResizeMode) {
                            handleHandlePointerUp(e);
                          }
                        }}
                      >
                        {inResizeMode && <div className="mb-0.5 h-1.5 w-8 rounded-full bg-white shadow" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>

    {/* Birthday popup */}
    {birthdayPopup && (
      <>
        <div className="fixed inset-0 z-[49]" onClick={() => setBirthdayPopup(null)} />
        <div
          className="fixed z-50 w-64 rounded-2xl border border-pink-400/30 bg-surface px-5 py-5 text-center shadow-2xl"
          style={{
            left: Math.min(birthdayPopup.x - 128, (typeof window !== "undefined" ? window.innerWidth : 800) - 272),
            top: Math.min(birthdayPopup.y + 12, (typeof window !== "undefined" ? window.innerHeight : 600) - 200),
          }}
        >
          <div className="mb-2 text-4xl">🎂🎉🌸</div>
          {birthdayPopup.names.map((name) => (
            <div key={name}>
              <p className="font-semibold text-fg">Сегодня день рождения у {name}!</p>
              <p className="mt-1 text-sm text-pink-300">С днем рождения, {name}! 💐🥂✨</p>
            </div>
          ))}
        </div>
      </>
    )}
    </>
  );
}
