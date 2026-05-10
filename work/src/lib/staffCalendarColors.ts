/** Палитра как в календарях: стабильный цвет на id мастера. */

export const STAFF_CALENDAR_PALETTE = [
  { dot: "bg-sky-400", strip: "border-l-4 border-sky-400", bar: "bg-sky-500/85", border: "border-sky-400/60", text: "text-sky-100", soft: "bg-sky-500/25" },
  { dot: "bg-violet-400", strip: "border-l-4 border-violet-400", bar: "bg-violet-500/85", border: "border-violet-400/60", text: "text-violet-100", soft: "bg-violet-500/25" },
  { dot: "bg-amber-400", strip: "border-l-4 border-amber-400", bar: "bg-amber-500/85", border: "border-amber-400/60", text: "text-amber-100", soft: "bg-amber-500/25" },
  { dot: "bg-emerald-400", strip: "border-l-4 border-emerald-400", bar: "bg-emerald-500/85", border: "border-emerald-400/60", text: "text-emerald-100", soft: "bg-emerald-500/25" },
  { dot: "bg-rose-400", strip: "border-l-4 border-rose-400", bar: "bg-rose-500/85", border: "border-rose-400/60", text: "text-rose-100", soft: "bg-rose-500/25" },
  { dot: "bg-cyan-400", strip: "border-l-4 border-cyan-400", bar: "bg-cyan-500/85", border: "border-cyan-400/60", text: "text-cyan-100", soft: "bg-cyan-500/25" },
  { dot: "bg-fuchsia-400", strip: "border-l-4 border-fuchsia-400", bar: "bg-fuchsia-500/85", border: "border-fuchsia-400/60", text: "text-fuchsia-100", soft: "bg-fuchsia-500/25" },
  { dot: "bg-lime-400", strip: "border-l-4 border-lime-400", bar: "bg-lime-500/85", border: "border-lime-400/60", text: "text-lime-950", soft: "bg-lime-500/25" },
  { dot: "bg-orange-400", strip: "border-l-4 border-orange-400", bar: "bg-orange-500/85", border: "border-orange-400/60", text: "text-orange-100", soft: "bg-orange-500/25" },
  { dot: "bg-teal-400", strip: "border-l-4 border-teal-400", bar: "bg-teal-500/85", border: "border-teal-400/60", text: "text-teal-100", soft: "bg-teal-500/25" },
] as const;

export type StaffCalendarColor = (typeof STAFF_CALENDAR_PALETTE)[number];

function hashStaffId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function getStaffCalendarColor(staffId: string): StaffCalendarColor {
  const i = hashStaffId(staffId) % STAFF_CALENDAR_PALETTE.length;
  return STAFF_CALENDAR_PALETTE[i]!;
}
