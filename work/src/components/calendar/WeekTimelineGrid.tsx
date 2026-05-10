import { memo, useEffect, useMemo, useState } from "react";
import {
  addMinutes,
  format,
  isSameDay,
  parseISO,
  setHours,
  setMinutes,
  startOfDay,
} from "date-fns";
import { useTranslation } from "react-i18next";
import { appointmentInterval } from "../../lib/slots";
import {
  busyIntervalsForStaffOnDay,
  freeIntervalsFromWorking,
  mergeDateIntervals,
  scheduleRowsForStaff,
  timeOffIntervalsForStaffOnDay,
  workingDateIntervalsForDay,
  type DateInterval,
} from "../../lib/weekTimeline";
import { staffCrmAppointmentBlockStyle } from "../../lib/staffCalendarColors";
import type { AppointmentRow, ServiceRow, StaffMember, StaffScheduleRow, StaffTimeOffRow } from "../../types/database";

const SOON_BUSY_MIN = 30;

function timelineAnchor(day: Date, startHour: number): Date {
  return addMinutes(startOfDay(day), startHour * 60);
}

function clipIntervalToVisible(iv: DateInterval, anchor: Date, visibleEnd: Date): DateInterval | null {
  const sT = Math.max(iv.start.getTime(), anchor.getTime());
  const eT = Math.min(iv.end.getTime(), visibleEnd.getTime());
  if (eT <= sT) return null;
  return { start: new Date(sT), end: new Date(eT) };
}

function offsetPx(d: Date, anchor: Date, pxPerHour: number): number {
  return ((d.getTime() - anchor.getTime()) / 60_000 / 60) * pxPerHour;
}

function snapStartDown(d: Date, stepMin: number): Date {
  const total = d.getHours() * 60 + d.getMinutes();
  const snapped = Math.floor(total / stepMin) * stepMin;
  return setMinutes(setHours(d, Math.floor(snapped / 60)), snapped % 60);
}

function hasSoonBookingAfter(
  freeEnd: Date,
  appointments: AppointmentRow[],
  staffId: string,
): boolean {
  let next: Date | null = null;
  for (const b of appointments) {
    if (b.staff_id !== staffId || b.status === "cancelled") continue;
    const iv = appointmentInterval(b);
    if (!iv) continue;
    if (iv.start.getTime() <= freeEnd.getTime()) continue;
    if (next == null || iv.start.getTime() < next.getTime()) {
      next = iv.start;
    }
  }
  if (!next) return false;
  return next.getTime() - freeEnd.getTime() <= SOON_BUSY_MIN * 60 * 1000;
}

type ColumnProps = {
  day: Date;
  staffId: string;
  schedules: StaffScheduleRow[];
  timeOff: StaffTimeOffRow[];
  appointments: AppointmentRow[];
  services: ServiceRow[];
  staff: StaffMember[];
  staffHueMap: Map<string, number>;
  workingStaff: StaffMember[];
  startHour: number;
  endHour: number;
  pxPerHour: number;
  onFreeClick: (start: Date) => void;
  canClick: boolean;
  now: Date;
};

const WeekDayTimelineColumn = memo(function WeekDayTimelineColumn({
  day,
  staffId,
  schedules,
  timeOff,
  appointments,
  services,
  staff,
  staffHueMap,
  workingStaff,
  startHour,
  endHour,
  pxPerHour,
  onFreeClick,
  canClick,
  now,
}: ColumnProps) {
  const { t } = useTranslation();
  const wd = String(day.getDay()) as "0" | "1" | "2" | "3" | "4" | "5" | "6";
  const sched = useMemo(() => scheduleRowsForStaff(staffId, schedules), [staffId, schedules]);

  const anchor = useMemo(() => timelineAnchor(day, startHour), [day, startHour]);
  const visibleEnd = useMemo(
    () => addMinutes(anchor, (endHour - startHour) * 60),
    [anchor, endHour, startHour],
  );
  const totalPx = (endHour - startHour) * pxPerHour;

  const model = useMemo(() => {
    const working = workingDateIntervalsForDay(day, sched);
    const workingMerged = mergeDateIntervals(working);
    const busy = busyIntervalsForStaffOnDay(appointments, timeOff, staffId, day);
    const free = freeIntervalsFromWorking(workingMerged, busy);
    const timeOffIv = timeOffIntervalsForStaffOnDay(timeOff, staffId, day);
    const blocks = appointments.filter((b) => {
      if (b.staff_id !== staffId || b.status === "cancelled") return false;
      try {
        return isSameDay(parseISO(b.start_time), day);
      } catch {
        return false;
      }
    });
    return { workingMerged, free, timeOffIv, blocks };
  }, [appointments, day, sched, staffId, timeOff]);

  const hours = useMemo(
    () => Array.from({ length: endHour - startHour }, (_, i) => startHour + i),
    [startHour, endHour],
  );

  const isToday = isSameDay(day, now);

  return (
    <div className="flex min-w-[100px] flex-1 flex-col overflow-hidden rounded-xl border border-line/12 bg-panel/50 shadow-sm">
      <div className="flex min-h-[4.5rem] flex-col justify-center border-b border-line/10 px-2 py-2 text-center">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted">{t(`weekday.${wd}`)}</p>
        <p className={`text-base font-semibold ${isToday ? "text-gold" : "text-fg"}`}>{format(day, "d")}</p>
        {workingStaff.length > 0 && (
          <div className="mt-1.5 flex flex-wrap justify-center gap-0.5">
            {workingStaff.map((m) => {
              const style = staffCrmAppointmentBlockStyle(m.id, staff, staffHueMap);
              const short = m.name?.trim().split(/\s+/)[0] || "—";
              return (
                <span
                  key={m.id}
                  title={m.name}
                  className="inline-flex max-w-[4.5rem] items-center truncate rounded border px-1 py-px text-[9px] font-semibold"
                  style={style}
                >
                  {short}
                </span>
              );
            })}
          </div>
        )}
      </div>

      <div className="relative" style={{ height: totalPx }}>
        {/* Outside working hours (within visible range) */}
        <div
          className="pointer-events-none absolute inset-0 rounded-b-lg bg-line/[0.06]"
          aria-hidden="true"
        />

        {model.workingMerged.map((w, i) => {
          const clipped = clipIntervalToVisible(w, anchor, visibleEnd);
          if (!clipped) return null;
          const top = offsetPx(clipped.start, anchor, pxPerHour);
          const h = offsetPx(clipped.end, anchor, pxPerHour) - top;
          return (
            <div
              key={`w-${i}`}
              className="pointer-events-none absolute left-0 right-0 rounded-sm bg-emerald-500/[0.08] dark:bg-emerald-500/[0.12]"
              style={{ top, height: Math.max(h, 1) }}
              aria-hidden="true"
            />
          );
        })}

        {model.timeOffIv.map((b, i) => {
          const clipped = clipIntervalToVisible(b, anchor, visibleEnd);
          if (!clipped) return null;
          const top = offsetPx(clipped.start, anchor, pxPerHour);
          const h = offsetPx(clipped.end, anchor, pxPerHour) - top;
          return (
            <div
              key={`off-${i}`}
              className="pointer-events-none absolute left-0 right-0 bg-rose-500/[0.08] opacity-95"
              style={{
                top,
                height: Math.max(h, 1),
                backgroundImage:
                  "repeating-linear-gradient(-45deg, rgba(244,63,94,0.14), rgba(244,63,94,0.14) 3px, transparent 3px, transparent 6px)",
              }}
              aria-hidden="true"
            />
          );
        })}

        {hours.map((h) => {
          const y = (h - startHour) * pxPerHour;
          return (
            <div
              key={h}
              className="pointer-events-none absolute left-0 right-0 border-b border-line/[0.08]"
              style={{ top: y, height: pxPerHour }}
              aria-hidden="true"
            />
          );
        })}

        {model.free.map((f, i) => {
          const clipped = clipIntervalToVisible(f, anchor, visibleEnd);
          if (!clipped) return null;
          const top = offsetPx(clipped.start, anchor, pxPerHour);
          const h = offsetPx(clipped.end, anchor, pxPerHour) - top;
          if (h < 2) return null;
          const soon = hasSoonBookingAfter(clipped.end, appointments, staffId);
          return (
            <button
              key={`free-${i}`}
              type="button"
              disabled={!canClick}
              title={t("calendar.weekTimelineFreeHint", {
                defaultValue: "Свободно · нажмите, чтобы создать запись",
              })}
              aria-label={t("calendar.weekTimelineFreeAria", {
                defaultValue: "Создать запись с {{time}}",
                time: format(snapStartDown(clipped.start, 15), "HH:mm"),
              })}
              className={`absolute left-0.5 right-0.5 z-[1] rounded-md border border-transparent transition ${
                canClick
                  ? soon
                    ? "cursor-pointer border-amber-400/25 bg-amber-400/[0.07] hover:border-amber-400/40 hover:bg-amber-400/12"
                    : "cursor-pointer border-emerald-500/15 bg-emerald-500/[0.04] hover:border-emerald-500/35 hover:bg-emerald-500/10"
                  : "cursor-not-allowed opacity-50"
              }`}
              style={{ top, height: h }}
              onClick={() => {
                if (!canClick) return;
                onFreeClick(snapStartDown(clipped.start, 15));
              }}
            />
          );
        })}

        {model.blocks.map((b) => {
          const iv = appointmentInterval(b);
          if (!iv) return null;
          const clipped = clipIntervalToVisible(iv, anchor, visibleEnd);
          if (!clipped) return null;
          const top = offsetPx(clipped.start, anchor, pxPerHour);
          const h = Math.max(offsetPx(clipped.end, anchor, pxPerHour) - top, 18);
          const svc = services.find((s) => s.id === b.service_id);
          const blockStyle = staffCrmAppointmentBlockStyle(b.staff_id, staff, staffHueMap);
          return (
            <div
              key={b.id}
              className="absolute left-0.5 right-0.5 z-[2] overflow-hidden rounded-lg border px-1.5 py-1 shadow-md backdrop-blur-[2px]"
              style={{ ...blockStyle, top, height: h }}
            >
              <p className="truncate text-[11px] font-semibold leading-tight text-fg">{b.client_name}</p>
              <p className="truncate text-[10px] text-muted opacity-90">
                {format(iv.start, "HH:mm")} · {svc?.name_et ?? t("common.service")}
              </p>
            </div>
          );
        })}

        {isToday && now.getTime() >= anchor.getTime() && now.getTime() <= visibleEnd.getTime() && (
          <div
            className="pointer-events-none absolute left-0 right-0 z-[4]"
            style={{ top: offsetPx(now, anchor, pxPerHour) }}
            aria-hidden="true"
          >
            <div className="h-0.5 bg-rose-500/90 shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
          </div>
        )}
      </div>
    </div>
  );
});

export type WeekTimelineGridProps = {
  days: Date[];
  staffId: string;
  schedules: StaffScheduleRow[];
  timeOff: StaffTimeOffRow[];
  appointments: AppointmentRow[];
  services: ServiceRow[];
  staff: StaffMember[];
  staffHueMap: Map<string, number>;
  getWorkingStaffForDay: (day: Date) => StaffMember[];
  startHour?: number;
  endHour?: number;
  pxPerHour?: number;
  onFreeClick: (start: Date) => void;
  canClick: boolean;
};

export function WeekTimelineGrid({
  days,
  staffId,
  schedules,
  timeOff,
  appointments,
  services,
  staff,
  staffHueMap,
  getWorkingStaffForDay,
  startHour = 9,
  endHour = 18,
  pxPerHour = 52,
  onFreeClick,
  canClick,
}: WeekTimelineGridProps) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const hours = useMemo(
    () => Array.from({ length: endHour - startHour }, (_, i) => startHour + i),
    [startHour, endHour],
  );
  const gutterH = (endHour - startHour) * pxPerHour;

  return (
    <div className="w-full overflow-x-auto pb-2">
      <div className="inline-flex min-w-full gap-1.5">
        <div className="sticky left-0 z-10 w-11 shrink-0 bg-canvas/95 backdrop-blur-sm">
          <div className="min-h-[4.5rem] border-b border-transparent" aria-hidden="true" />
          <div className="relative" style={{ height: gutterH }}>
            {hours.map((h) => (
              <div
                key={h}
                className="absolute right-1 text-right text-[10px] tabular-nums text-muted"
                style={{ top: (h - startHour) * pxPerHour - 6 }}
              >
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>
        </div>

        <div className="grid min-w-[720px] flex-1 grid-cols-7 gap-1.5">
          {days.map((day) => (
            <WeekDayTimelineColumn
              key={day.toISOString()}
              day={day}
              staffId={staffId}
              schedules={schedules}
              timeOff={timeOff}
              appointments={appointments}
              services={services}
              staff={staff}
              staffHueMap={staffHueMap}
              workingStaff={getWorkingStaffForDay(day)}
              startHour={startHour}
              endHour={endHour}
              pxPerHour={pxPerHour}
              onFreeClick={onFreeClick}
              canClick={canClick}
              now={now}
            />
          ))}
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-muted">
        {t("calendar.weekTimelineHint", {
          defaultValue: "Пустые зелёные области — свободное время (нажмите для новой записи). Карточки — записи.",
        })}
      </p>
    </div>
  );
}
