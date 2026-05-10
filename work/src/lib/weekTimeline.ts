import { addDays, addMinutes, parseISO, startOfDay, isSameDay } from "date-fns";
import {
  appointmentInterval,
  intervalsOverlap,
  workingWindowsForWeekday,
  type WeeklyScheduleLike,
} from "./slots";
import type { AppointmentRow, StaffScheduleRow, StaffTimeOffRow } from "../types/database";

export type DateInterval = { start: Date; end: Date };

export function mergeDateIntervals(ivs: DateInterval[]): DateInterval[] {
  if (!ivs.length) return [];
  const sorted = [...ivs].sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: DateInterval[] = [];
  let cur = { ...sorted[0]! };
  for (let i = 1; i < sorted.length; i++) {
    const n = sorted[i]!;
    if (n.start.getTime() <= cur.end.getTime()) {
      cur.end = n.end.getTime() > cur.end.getTime() ? n.end : cur.end;
    } else {
      out.push(cur);
      cur = { ...n };
    }
  }
  out.push(cur);
  return out;
}

function subtractFromInterval(w: DateInterval, busySorted: DateInterval[]): DateInterval[] {
  const free: DateInterval[] = [];
  let cursor = w.start.getTime();
  const wEnd = w.end.getTime();
  for (const b of busySorted) {
    if (b.end.getTime() <= cursor) continue;
    if (b.start.getTime() >= wEnd) break;
    const bs = Math.max(b.start.getTime(), cursor);
    const be = Math.min(b.end.getTime(), wEnd);
    if (bs > cursor) {
      free.push({ start: new Date(cursor), end: new Date(bs) });
    }
    cursor = Math.max(cursor, be);
    if (cursor >= wEnd) return free;
  }
  if (cursor < wEnd) {
    free.push({ start: new Date(cursor), end: new Date(wEnd) });
  }
  return free;
}

export function freeIntervalsFromWorking(
  working: DateInterval[],
  busy: DateInterval[],
  minGapMs = 5 * 60 * 1000,
): DateInterval[] {
  const mergedBusy = mergeDateIntervals(busy);
  const out: DateInterval[] = [];
  for (const w of working) {
    out.push(...subtractFromInterval(w, mergedBusy));
  }
  return out.filter((x) => x.end.getTime() - x.start.getTime() >= minGapMs);
}

export function workingDateIntervalsForDay(
  day: Date,
  schedule: WeeklyScheduleLike[],
): DateInterval[] {
  const weekday = day.getDay();
  const windows = workingWindowsForWeekday(schedule, weekday);
  const base = startOfDay(day);
  return windows.map((w) => ({
    start: addMinutes(base, w.start),
    end: addMinutes(base, w.end),
  }));
}

export function appointmentIntervalsForStaffOnDay(
  appointments: AppointmentRow[],
  staffId: string,
  day: Date,
): DateInterval[] {
  const d0 = startOfDay(day);
  const d1 = addDays(d0, 1);
  return appointments
    .filter((b) => b.staff_id === staffId && b.status !== "cancelled")
    .map((b) => appointmentInterval(b))
    .filter((x): x is DateInterval => x !== null)
    .filter(({ start }) => isSameDay(start, day))
    .map(({ start, end }) => ({
      start: start < d0 ? d0 : start,
      end: end > d1 ? d1 : end,
    }));
}

export function timeOffIntervalsForStaffOnDay(
  timeOff: StaffTimeOffRow[],
  staffId: string,
  day: Date,
): DateInterval[] {
  const d0 = startOfDay(day);
  const d1 = addDays(d0, 1);
  const raw: DateInterval[] = [];
  for (const t of timeOff) {
    if (t.staff_id !== staffId) continue;
    const iv = appointmentInterval({ start_time: t.start_time, end_time: t.end_time });
    if (!iv) continue;
    if (!intervalsOverlap(iv.start, iv.end, d0, d1)) continue;
    const start = iv.start < d0 ? d0 : iv.start;
    const end = iv.end > d1 ? d1 : iv.end;
    raw.push({ start, end });
  }
  return mergeDateIntervals(raw);
}

export function busyIntervalsForStaffOnDay(
  appointments: AppointmentRow[],
  timeOff: StaffTimeOffRow[],
  staffId: string,
  day: Date,
): DateInterval[] {
  return mergeDateIntervals([
    ...appointmentIntervalsForStaffOnDay(appointments, staffId, day),
    ...timeOffIntervalsForStaffOnDay(timeOff, staffId, day),
  ]);
}

export function scheduleRowsForStaff(staffId: string, schedules: StaffScheduleRow[]): WeeklyScheduleLike[] {
  return schedules
    .filter((s) => s.staff_id === staffId)
    .map((s) => ({
      day_of_week: s.day_of_week,
      start_time: s.start_time,
      end_time: s.end_time,
    }));
}

export function countFreeWindowsForDay(
  day: Date,
  staffId: string,
  schedules: StaffScheduleRow[],
  appointments: AppointmentRow[],
  timeOff: StaffTimeOffRow[],
  minDurationMin: number,
): number {
  const sched = scheduleRowsForStaff(staffId, schedules);
  const working = workingDateIntervalsForDay(day, sched);
  if (!working.length) return 0;
  const busy = busyIntervalsForStaffOnDay(appointments, timeOff, staffId, day);
  const free = freeIntervalsFromWorking(working, busy);
  const needMs = minDurationMin * 60 * 1000;
  return free.filter((f) => f.end.getTime() - f.start.getTime() >= needMs).length;
}

export function nextAppointmentForStaffFrom(
  appointments: AppointmentRow[],
  staffId: string,
  from: Date,
): AppointmentRow | null {
  let best: AppointmentRow | null = null;
  let bestT = Infinity;
  for (const a of appointments) {
    if (a.staff_id !== staffId || a.status === "cancelled") continue;
    try {
      const st = parseISO(a.start_time).getTime();
      if (st < from.getTime()) continue;
      if (st < bestT) {
        bestT = st;
        best = a;
      }
    } catch {
      /* skip */
    }
  }
  return best;
}
