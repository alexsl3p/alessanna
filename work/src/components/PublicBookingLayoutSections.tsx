import {
  addMonths,
  addYears,
  eachDayOfInterval,
  eachMonthOfInterval,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";
import type { TFunction } from "i18next";
import type { i18n } from "i18next";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { formatSlotRange, type Slot } from "../lib/slots";
import type { AppointmentRow, StaffMember } from "../types/database";

type PublicServiceMini = { id: string; name: string; active: boolean };

const WEEKDAY_MON_FIRST = ["1", "2", "3", "4", "5", "6", "0"] as const;

export type MasterDayRow = {
  id: string;
  name: string;
  workTime: string;
  freeSlots: number;
  busyItems: number;
  timeOffItems: number;
  status: "free" | "busy" | "off";
};

type CalendarProps = {
  t: TFunction;
  calendarScope: "month" | "year";
  setCalendarScope: Dispatch<SetStateAction<"month" | "year">>;
  viewMonth: Date;
  setViewMonth: Dispatch<SetStateAction<Date>>;
  monthLabel: string;
  monthStart: Date;
  calendarDays: Date[];
  renderDayButtons: (gridDays: Date[], anchorMonth: Date, compact: boolean) => ReactNode;
};

export function PublicBookingCalendarSection({
  t,
  calendarScope,
  setCalendarScope,
  viewMonth,
  setViewMonth,
  monthLabel,
  monthStart,
  calendarDays,
  renderDayButtons,
}: CalendarProps) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-black/30 p-4 md:p-5">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-zinc-200">{t("publicBook.day")}</p>
          {calendarScope === "year" && (
            <p className="mt-1 text-xs text-zinc-500">{t("publicBook.yearHint")}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-zinc-800 p-0.5">
            <button
              type="button"
              onClick={() => setCalendarScope("month")}
              className={`rounded-md px-2.5 py-1 text-xs ${
                calendarScope === "month" ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t("publicBook.monthView")}
            </button>
            <button
              type="button"
              onClick={() => {
                setCalendarScope("year");
                setViewMonth((v) => startOfYear(v));
              }}
              className={`rounded-md px-2.5 py-1 text-xs ${
                calendarScope === "year" ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t("publicBook.yearView")}
            </button>
          </div>
          {calendarScope === "month" ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setViewMonth((prev) => addMonths(prev, -1))}
                className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white"
              >
                ←
              </button>
              <span className="min-w-[120px] text-center text-xs text-zinc-400">{monthLabel}</span>
              <button
                type="button"
                onClick={() => setViewMonth((prev) => addMonths(prev, 1))}
                className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white"
              >
                →
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setViewMonth((prev) => addYears(prev, -1))}
                className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white"
              >
                ←
              </button>
              <span className="min-w-[4rem] text-center text-xs font-medium text-zinc-300">
                {format(startOfYear(viewMonth), "yyyy")}
              </span>
              <button
                type="button"
                onClick={() => setViewMonth((prev) => addYears(prev, 1))}
                className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white"
              >
                →
              </button>
            </div>
          )}
        </div>
      </div>
      {calendarScope === "month" ? (
        <>
          <div className="mb-2 grid grid-cols-7 gap-1.5 text-center text-[10px] uppercase tracking-wide text-zinc-600 md:gap-2 md:text-xs">
            {WEEKDAY_MON_FIRST.map((wd) => (
              <span key={wd}>{t(`weekday.${wd}`)}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5 md:gap-2">{renderDayButtons(calendarDays, monthStart, false)}</div>
        </>
      ) : (
        <div className="grid max-h-[min(70vh,52rem)] gap-5 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
          {eachMonthOfInterval({
            start: startOfYear(viewMonth),
            end: endOfYear(viewMonth),
          }).map((mStart) => {
            const mAnchor = startOfMonth(mStart);
            const from = startOfWeek(mAnchor, { weekStartsOn: 1 });
            const to = endOfWeek(endOfMonth(mAnchor), { weekStartsOn: 1 });
            const days = eachDayOfInterval({ start: from, end: to });
            return (
              <div
                key={mAnchor.toISOString()}
                className="rounded-lg border border-zinc-800/80 bg-black/25 p-2.5 md:p-3"
              >
                <p className="mb-2 text-center text-xs font-semibold capitalize text-zinc-200">
                  {format(mAnchor, "LLLL")}
                </p>
                <div className="mb-1.5 grid grid-cols-7 gap-0.5 text-center text-[9px] text-zinc-600 md:gap-1 md:text-[10px]">
                  {WEEKDAY_MON_FIRST.map((wd) => (
                    <span key={wd}>{t(`weekday.${wd}`)}</span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-0.5 md:gap-1">{renderDayButtons(days, mAnchor, true)}</div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

type UpcomingProps = {
  receptionUpcoming: AppointmentRow[];
  staff: StaffMember[];
  services: PublicServiceMini[];
  i18n: i18n;
};

export function PublicBookingUpcomingSection({ receptionUpcoming, staff, services, i18n }: UpcomingProps) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-black/30 p-4 md:p-5">
      <h2 className="text-sm font-semibold text-white">Ближайшие работы</h2>
      <p className="mt-1 text-xs text-zinc-500">Следующие записи по салону.</p>
      <div className="mt-3 space-y-2">
        {receptionUpcoming.length > 0 ? (
          receptionUpcoming.map((ap) => {
            const master = staff.find((s) => s.id === ap.staff_id);
            const svcName = services.find((s) => String(s.id) === String(ap.service_id))?.name || "—";
            return (
              <div
                key={ap.id}
                className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-xs text-zinc-300"
              >
                <div className="font-medium text-zinc-100">
                  {ap.start_time
                    ? new Date(ap.start_time).toLocaleString(i18n.language, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })
                    : "—"}
                </div>
                <div className="mt-0.5 text-zinc-400">
                  {master?.name || "—"} · {svcName}
                </div>
                <div className="mt-0.5 text-zinc-500">{ap.client_name || "—"}</div>
              </div>
            );
          })
        ) : (
          <p className="text-xs text-zinc-600">Ближайших записей пока нет.</p>
        )}
      </div>
    </section>
  );
}

type MastersProps = {
  masterDayLoad: MasterDayRow[];
  setStaffId: Dispatch<SetStateAction<string | null>>;
  setPickedStart: Dispatch<SetStateAction<Date | null>>;
};

export function PublicBookingMastersSection({ masterDayLoad, setStaffId, setPickedStart }: MastersProps) {
  return (
    <div className="grid gap-4 md:grid-cols-[1.45fr_1fr] md:gap-5">
      <section className="rounded-xl border border-zinc-800 bg-black/30 p-4 md:p-5">
        <h2 className="text-sm font-semibold text-white">Свободные мастера</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Нажмите на мастера, чтобы сразу смотреть его доступные слоты.
        </p>
        <div className="mt-3 space-y-2">
          {masterDayLoad.length > 0 ? (
            masterDayLoad.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setStaffId(m.id);
                  setPickedStart(null);
                }}
                className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-left text-xs text-zinc-300 transition hover:border-sky-700/70 hover:text-white md:px-4 md:py-2.5 md:text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-zinc-100">{m.name}</span>
                  <span
                    className={
                      "rounded-full border px-2 py-0.5 text-[10px] " +
                      (m.status === "free"
                        ? "border-emerald-700/60 bg-emerald-950/40 text-emerald-200"
                        : m.status === "off"
                          ? "border-zinc-700 bg-zinc-900 text-zinc-400"
                          : "border-amber-700/60 bg-amber-950/40 text-amber-200")
                    }
                  >
                    {m.status === "free" ? "Есть окна" : m.status === "off" ? "Выходной" : "Занят"}
                  </span>
                </div>
                <div className="mt-1 text-zinc-500">
                  {m.workTime} · свободных: {m.freeSlots}
                </div>
              </button>
            ))
          ) : (
            <p className="text-xs text-zinc-600">Нет мастеров для выбранной услуги.</p>
          )}
        </div>
      </section>
    </div>
  );
}

type BookingProps = {
  t: TFunction;
  i18n: i18n;
  isReceptionMode: boolean;
  serviceId: string;
  setServiceId: Dispatch<SetStateAction<string | null>>;
  setStaffId: Dispatch<SetStateAction<string | null>>;
  services: PublicServiceMini[];
  staffId: string | null;
  ANY_MASTER_ID: string;
  slots: Slot[];
  slotCoverage: Map<string, number>;
  pickedStart: Date | null;
  setPickedStart: Dispatch<SetStateAction<Date | null>>;
  clientName: string;
  setClientName: Dispatch<SetStateAction<string>>;
  clientPhone: string;
  setClientPhone: Dispatch<SetStateAction<string>>;
  booking: boolean;
  confirmBook: () => void;
  eligibleStaff: StaffMember[];
};

export function PublicBookingBookingSection({
  t,
  i18n,
  isReceptionMode,
  serviceId,
  setServiceId,
  setStaffId,
  services,
  staffId,
  ANY_MASTER_ID,
  slots,
  slotCoverage,
  pickedStart,
  setPickedStart,
  clientName,
  setClientName,
  clientPhone,
  setClientPhone,
  booking,
  confirmBook,
  eligibleStaff,
}: BookingProps) {
  return (
    <div className="space-y-4">
      <label className="block text-sm">
        <span className="text-zinc-400">{t("modal.service")}</span>
        <select
          value={serviceId}
          onChange={(e) => {
            setServiceId(e.target.value ? String(e.target.value) : null);
            setStaffId(ANY_MASTER_ID);
            setPickedStart(null);
          }}
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white md:py-2.5"
        >
          <option value="">{t("modal.pickService")}</option>
          {services.filter((s) => s.active).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <div>
        <p className="text-sm text-zinc-400">{t("publicBook.slots")}</p>
        {staffId === ANY_MASTER_ID && (
          <p className="mt-1 text-xs text-zinc-500">
            Показаны слоты, где есть хотя бы один свободный мастер.
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          {slots.map((s) => {
            const key = s.start.toISOString();
            const freeCount = slotCoverage.get(key) || 0;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setPickedStart(s.start)}
                className={`rounded-lg border px-3 py-2 text-sm md:px-4 md:py-2.5 ${
                  pickedStart?.getTime() === s.start.getTime()
                    ? "border-sky-500 bg-sky-950/50 text-white"
                    : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
                }`}
              >
                {formatSlotRange(s)}
                {staffId === ANY_MASTER_ID && freeCount > 0 ? ` · свободно: ${freeCount}` : ""}
              </button>
            );
          })}
        </div>
        {slots.length === 0 && <p className="mt-2 text-xs text-zinc-600">{t("publicBook.noSlots")}</p>}
      </div>

      <label className="block text-sm">
        <span className="text-zinc-400">Мастер (по желанию)</span>
        <select
          value={staffId ?? ANY_MASTER_ID}
          onChange={(e) => {
            setStaffId(e.target.value || ANY_MASTER_ID);
            setPickedStart(null);
          }}
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white md:py-2.5"
        >
          <option value={ANY_MASTER_ID}>Любой свободный мастер</option>
          {eligibleStaff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      {pickedStart && (
        <div className="space-y-3 rounded-xl border border-zinc-800 bg-black/40 p-4">
          <p className="text-sm text-zinc-400">
            {pickedStart.toLocaleString(i18n.language, { dateStyle: "medium", timeStyle: "short" })}
          </p>
          <input
            placeholder={isReceptionMode ? "Имя клиента (необязательно)" : (t("modal.client") as string)}
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm"
          />
          <input
            placeholder={isReceptionMode ? "Телефон (необязательно)" : (t("modal.phone") as string)}
            value={clientPhone}
            onChange={(e) => setClientPhone(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={booking}
            onClick={() => void confirmBook()}
            className="w-full rounded-lg bg-sky-600 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {t("publicBook.confirm")}
          </button>
        </div>
      )}
    </div>
  );
}
