import { format, isSameDay } from "date-fns";
import type { i18n } from "i18next";
import { getStaffCalendarColor } from "../lib/staffCalendarColors";
import type { AppointmentRow, StaffMember } from "../types/database";

type MiniSvc = { id: string; name: string };

function apptsForDay(appointments: AppointmentRow[], day: Date): AppointmentRow[] {
  return appointments
    .filter((ap) => ap.status !== "cancelled" && isSameDay(new Date(ap.start_time), day))
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
}

export function PublicCalendarDayAgenda({
  day,
  appointments,
  staffById,
  services,
  i18n,
}: {
  day: Date;
  appointments: AppointmentRow[];
  staffById: Map<string, StaffMember>;
  services: MiniSvc[];
  i18n: i18n;
}) {
  const list = apptsForDay(appointments, day);
  const svcName = (id: string) => services.find((s) => String(s.id) === String(id))?.name || "—";

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-zinc-400">
        {format(day, "EEEE, d MMMM yyyy", { locale: undefined })}
      </p>
      {list.length === 0 ? (
        <p className="text-xs text-zinc-600">Нет записей на этот день.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((ap) => {
            const col = getStaffCalendarColor(ap.staff_id);
            const master = staffById.get(ap.staff_id);
            const start = new Date(ap.start_time);
            const end = new Date(ap.end_time);
            return (
              <li
                key={ap.id}
                className={`rounded-lg border border-zinc-800 bg-zinc-950/70 pl-0 ${col.strip} py-2 pr-3`}
              >
                <div className="pl-3">
                  <div className="text-xs font-medium text-zinc-100">
                    {start.toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" })} –{" "}
                    {end.toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-300">
                    <span className={col.text}>{master?.name || "—"}</span>
                    <span className="text-zinc-500"> · </span>
                    <span>{svcName(String(ap.service_id))}</span>
                  </div>
                  {ap.client_name && (
                    <div className="mt-0.5 text-[11px] text-zinc-500">{ap.client_name}</div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function PublicCalendarWeekAgenda({
  weekDays,
  appointments,
  staffById,
  services,
  i18n,
  selectedDay,
  onSelectDay,
}: {
  weekDays: Date[];
  appointments: AppointmentRow[];
  staffById: Map<string, StaffMember>;
  services: MiniSvc[];
  i18n: i18n;
  selectedDay: Date;
  onSelectDay: (d: Date) => void;
}) {
  const svcName = (id: string) => services.find((s) => String(s.id) === String(id))?.name || "—";

  return (
    <div className="grid grid-cols-7 gap-1.5 md:gap-2">
      {weekDays.map((d) => {
        const list = apptsForDay(appointments, d);
        const sel = isSameDay(d, selectedDay);
        return (
          <div
            key={d.toISOString()}
            className={`flex min-h-[8rem] flex-col rounded-lg border p-1.5 md:min-h-[10rem] md:p-2 ${
              sel ? "border-sky-500/70 bg-sky-950/20" : "border-zinc-800 bg-zinc-950/40"
            }`}
          >
            <button
              type="button"
              onClick={() => onSelectDay(d)}
              className={`mb-1.5 w-full rounded px-1 py-0.5 text-left text-[10px] font-semibold md:text-xs ${
                sel ? "text-sky-200" : "text-zinc-300 hover:bg-zinc-800/80"
              }`}
            >
              {format(d, "EEE d", { locale: undefined })}
            </button>
            <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
              {list.map((ap) => {
                const col = getStaffCalendarColor(ap.staff_id);
                const master = staffById.get(ap.staff_id);
                const start = new Date(ap.start_time);
                return (
                  <div
                    key={ap.id}
                    title={`${master?.name} · ${svcName(String(ap.service_id))}`}
                    className={`truncate rounded border border-zinc-800/80 px-1 py-0.5 text-[9px] md:text-[10px] ${col.soft} ${col.text}`}
                  >
                    <span className="opacity-90">
                      {start.toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" })}
                    </span>{" "}
                    {master?.name?.split(" ")[0] || "—"}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CalendarStaffLegend({
  appointmentStaffIds,
  staffById,
}: {
  appointmentStaffIds: string[];
  staffById: Map<string, StaffMember>;
}) {
  const uniq = [...new Set(appointmentStaffIds)];
  if (uniq.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-zinc-800/80 pt-3">
      <span className="text-[10px] uppercase tracking-wide text-zinc-600">Мастера</span>
      {uniq.map((id) => {
        const m = staffById.get(id);
        const col = getStaffCalendarColor(id);
        return (
          <span key={id} className="flex items-center gap-1.5 text-[11px] text-zinc-400">
            <span className={`h-2 w-2 shrink-0 rounded-full ${col.dot}`} />
            {m?.name || id.slice(0, 6)}
          </span>
        );
      })}
    </div>
  );
}
