"use strict";

function pad2(n) {
  return (n < 10 ? "0" : "") + n;
}

/** Понедельник = 1 … суббота = 6; воскресенье = null (закрыто в seed) */
function salonWeekday(date) {
  const d = date.getDay();
  if (d === 0) return null;
  return d;
}

function toIso(dateStr, minutesFromMidnight) {
  const h = Math.floor(minutesFromMidnight / 60);
  const m = minutesFromMidnight % 60;
  return `${dateStr}T${pad2(h)}:${pad2(m)}:00`;
}

function overlaps(s1, e1, s2, e2) {
  return s1 < e2 && e1 > s2;
}

function salonNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Tallinn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .formatToParts(new Date())
    .reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function getSlots(db, { employeeId, dateStr, serviceId }) {
  const service = db.prepare("SELECT duration_min, buffer_after_min FROM services WHERE id = ? AND active = 1").get(serviceId);
  if (!service) return [];

  const now = salonNow();
  if (dateStr < now.dateKey) return [];

  const d = new Date(dateStr + "T12:00:00");
  const wd = salonWeekday(d);
  if (wd == null) return [];

  // Per-employee schedule: if no schedule rows exist for this employee → not working
  const schedCount = db.prepare(
    "SELECT COUNT(*) AS c FROM employee_schedule WHERE employee_id = ?"
  ).get(employeeId);
  if (!schedCount || schedCount.c === 0) return []; // no schedule defined → no slots
  const empSched = db.prepare(
    "SELECT open_min, close_min FROM employee_schedule WHERE employee_id = ? AND weekday = ?"
  ).get(employeeId, wd);
  if (!empSched) return []; // employee doesn't work this weekday

  const hours = db.prepare("SELECT open_min, close_min FROM salon_hours WHERE weekday = ?").get(wd);
  if (!hours) return [];

  const duration = service.duration_min;
  const buffer = service.buffer_after_min;
  const step = 30;
  const openMin = Math.max(Number(hours.open_min), Number(empSched.open_min));
  const closeMin = Math.min(Number(hours.close_min), Number(empSched.close_min));
  if (!Number.isFinite(openMin) || !Number.isFinite(closeMin) || openMin >= closeMin) return [];

  const existing = db
    .prepare(
      `SELECT start_at, end_at FROM bookings
       WHERE employee_id = ? AND status != 'cancelled' AND substr(start_at, 1, 10) = ?`
    )
    .all(employeeId, dateStr);

  const slots = [];
  for (let t = openMin; t + duration <= closeMin; t += step) {
    if (dateStr === now.dateKey && t <= now.minutes) continue;
    const startAt = toIso(dateStr, t);
    const endMin = t + duration + buffer;
    const endAt = toIso(dateStr, endMin);
    let ok = true;
    for (const b of existing) {
      if (overlaps(startAt, endAt, b.start_at, b.end_at)) {
        ok = false;
        break;
      }
    }
    if (ok) {
      const hh = Math.floor(t / 60);
      const mm = t % 60;
      slots.push(`${pad2(hh)}:${pad2(mm)}`);
    }
  }
  return slots;
}

function bookingEndAt(dateStr, timeHHMM, durationMin, bufferMin) {
  const [hh, mm] = timeHHMM.split(":").map(Number);
  const startMin = hh * 60 + mm;
  const endMin = startMin + durationMin + bufferMin;
  return { startAt: toIso(dateStr, startMin), endAt: toIso(dateStr, endMin) };
}

module.exports = { getSlots, bookingEndAt, salonWeekday, toIso, overlaps, salonNow };
