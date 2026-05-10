import { useMemo } from "react";
import {
  Calendar,
  dateFnsLocalizer,
  type SlotInfo,
  Views,
} from "react-big-calendar";
import withDragAndDrop, {
  type EventInteractionArgs,
} from "react-big-calendar/lib/addons/dragAndDrop";
import { format as dfFormat, getDay, parse as dfParse, parseISO, startOfWeek } from "date-fns";
import { useTranslation } from "react-i18next";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import "./ReceptionBigCalendar.css";
import type { AppointmentRow, StaffMember } from "../../types/database";

type ReceptionBigCalendarProps = {
  view: "day" | "week" | "month";
  cursor: Date;
  staff: StaffMember[];
  appointments: AppointmentRow[];
  canEdit: boolean;
  onNavigate: (next: Date) => void;
  onViewChange: (next: "day" | "week" | "month") => void;
  onCreateFromSlot: (start: Date, staffId: string) => void;
  onMoveOrResize: (args: {
    bookingId: string;
    start: Date;
    end: Date;
    staffId: string;
  }) => Promise<void>;
};

type CalendarEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resourceId: string;
  status: AppointmentRow["status"];
};

const locales = { "en-US": "en-US" };

const localizer = dateFnsLocalizer({
  format: dfFormat,
  parse: (value: string, fmt: string) => dfParse(value, fmt, new Date()),
  startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 1 }),
  getDay,
  locales,
});

const DnDCalendar = withDragAndDrop<CalendarEvent, { resourceId: string; resourceTitle: string }>(Calendar);

export function ReceptionBigCalendar({
  view,
  cursor,
  staff,
  appointments,
  canEdit,
  onNavigate,
  onViewChange,
  onCreateFromSlot,
  onMoveOrResize,
}: ReceptionBigCalendarProps) {
  const { t } = useTranslation();
  const resources = useMemo(
    () =>
      staff.map((s) => ({
        resourceId: s.id,
        resourceTitle: s.name,
      })),
    [staff],
  );

  const events = useMemo<CalendarEvent[]>(
    () =>
      appointments
        .filter((a) => a.status !== "cancelled")
        .map((a) => ({
          id: String(a.id),
          title: a.client_name || t("modal.client", { defaultValue: "Клиент" }),
          start: parseISO(a.start_time),
          end: parseISO(a.end_time),
          resourceId: a.staff_id,
          status: a.status,
        })),
    [appointments, t],
  );

  const onSelectSlot = (slot: SlotInfo) => {
    if (!canEdit) return;
    const sid =
      (typeof slot.resourceId === "string" ? slot.resourceId : null) ??
      staff[0]?.id ??
      null;
    if (!sid) return;
    onCreateFromSlot(slot.start, sid);
  };

  const onDropOrResize = async ({
    event,
    start,
    end,
    resourceId,
  }: EventInteractionArgs<CalendarEvent>) => {
    if (!canEdit) return;
    const sid = (typeof resourceId === "string" && resourceId) || event.resourceId;
    const nextStart = start instanceof Date ? start : new Date(start);
    const nextEnd = end instanceof Date ? end : new Date(end);
    await onMoveOrResize({ bookingId: event.id, start: nextStart, end: nextEnd, staffId: sid });
  };

  return (
    <div className="reception-big-calendar h-[76vh] min-h-[640px] rounded-xl border border-line/12 bg-panel/70 p-2">
      <DnDCalendar
        localizer={localizer}
        date={cursor}
        events={events}
        resources={resources}
        resourceIdAccessor="resourceId"
        resourceTitleAccessor="resourceTitle"
        defaultView={Views.WEEK}
        view={view}
        views={[Views.DAY, Views.WEEK, Views.MONTH]}
        onNavigate={onNavigate}
        onView={(v) => onViewChange(v as "day" | "week" | "month")}
        selectable={canEdit}
        onSelectSlot={onSelectSlot}
        onEventDrop={onDropOrResize}
        onEventResize={onDropOrResize}
        resizable={canEdit}
        popup
        step={15}
        timeslots={2}
        min={new Date(1970, 1, 1, 8, 0, 0)}
        max={new Date(1970, 1, 1, 21, 0, 0)}
        eventPropGetter={(event) => {
          const member = staff.find((s) => s.id === event.resourceId);
          const bg = member?.calendar_color_hex ?? "#7ea38d";
          const fg = member?.calendar_foreground_hex ?? "#1f1f1f";
          return {
            style: {
              backgroundColor: bg,
              borderColor: bg,
              color: fg,
              borderRadius: "10px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
            },
          };
        }}
        messages={{
          today: t("calendar.today"),
          next: "→",
          previous: "←",
          month: t("calendar.month", { defaultValue: "Месяц" }),
          week: t("calendar.week"),
          day: t("calendar.day"),
          agenda: "Agenda",
          date: t("calendar.day", { defaultValue: "День" }),
          time: "Time",
          event: t("common.booking", { defaultValue: "Запись" }),
          noEventsInRange: t("calendar.upcomingEmpty", { defaultValue: "Нет записей." }),
          showMore: (count) => `+${count}`,
        }}
      />
    </div>
  );
}

