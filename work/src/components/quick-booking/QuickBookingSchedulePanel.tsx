import { useMemo, useState, type ReactNode } from "react";
import type { TFunction } from "i18next";
import { format } from "date-fns";
import {
  compareSalonYmd,
  gregorianAddDays,
  salonCalendarYmd,
  salonDayStartUtc,
  salonWeekdaySun0,
} from "../../lib/bookingSalonTz";
import {
  firstFreeSlotOnDay,
  markQuickBookSalonDay,
  quickBookSlotStatsForMasterDay,
  slotsForQuickBookSalonDay,
} from "../../lib/quickBookingSchedule";
import { useQuickBookingPanelData } from "../../hooks/useQuickBookingPanelData";
import {
  buildStaffColorAssignments,
  staffQuickPanelAvatarStyle,
  type StaffCalendarColorFields,
} from "../../lib/staffCalendarColors";
import { buildStaffHueMap } from "../../lib/staffHue";
import type { StaffMember, StaffScheduleRow } from "../../types/database";

const ANY_TOKEN = "__panel_any__";

export type QuickPanelScope = "day" | "3d" | "7d" | "month" | "quarter";

function panelRange(scope: QuickPanelScope, anchorYmd: string): { fromYmd: string; toYmd: string } {
  const [y, m] = anchorYmd.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");

  switch (scope) {
    case "day":
      return { fromYmd: anchorYmd, toYmd: anchorYmd };
    case "3d":
      return { fromYmd: anchorYmd, toYmd: gregorianAddDays(anchorYmd, 2) };
    case "7d":
      return { fromYmd: anchorYmd, toYmd: gregorianAddDays(anchorYmd, 6) };
    case "month": {
      const lastDay = new Date(y, m, 0).getDate();
      return { fromYmd: `${y}-${pad(m)}-01`, toYmd: `${y}-${pad(m)}-${pad(lastDay)}` };
    }
    case "quarter": {
      const q0 = Math.floor((m - 1) / 3) * 3 + 1;
      const lastMo = q0 + 2;
      const lastDay = new Date(y, lastMo, 0).getDate();
      return { fromYmd: `${y}-${pad(q0)}-01`, toYmd: `${y}-${pad(lastMo)}-${pad(lastDay)}` };
    }
    default:
      return { fromYmd: anchorYmd, toYmd: gregorianAddDays(anchorYmd, 6) };
  }
}

function eachYmdInclusive(fromYmd: string, toYmd: string): string[] {
  const out: string[] = [];
  let cur = fromYmd;
  while (compareSalonYmd(cur, toYmd) <= 0) {
    out.push(cur);
    cur = gregorianAddDays(cur, 1);
  }
  return out;
}

type CellTone = "off" | "full" | "low" | "ok";

function cellTone(stats: {
  freeFuture: number;
  freeMinutesUnion: number;
  isClosed: boolean;
  workingSlots: number;
}): CellTone {
  if (stats.isClosed || stats.workingSlots === 0) return "off";
  if (stats.freeFuture === 0) return "full";
  if (stats.freeFuture <= 2 || stats.freeMinutesUnion < 60) return "low";
  return "ok";
}

function formatApproxFreeMinutes(totalMin: number, t: TFunction): string {
  if (totalMin <= 0) return "—";
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return t("quickBook.panelApproxMinutes", { n: m });
  if (m === 0) return t("quickBook.panelApproxHours", { n: h });
  return t("quickBook.panelApproxHoursMinutes", { h, m });
}

const toneCls: Record<CellTone, string> = {
  off: "border-zinc-700 bg-zinc-800/70 text-zinc-500",
  full: "border-rose-800/60 bg-rose-950/45 text-rose-100",
  low: "border-amber-700/55 bg-amber-950/40 text-amber-50",
  ok: "border-emerald-700/50 bg-emerald-950/35 text-emerald-50",
};

type Props = {
  t: TFunction;
  schedules: StaffScheduleRow[];
  nowTick: number;
  firstBookableYmd: string;
  rowStaff: StaffMember[];
  durationMin: number;
  canApplySlot: boolean;
  /** Подсветка колонки текущего дня визарда. */
  highlightYmd: string | null;
  onPickSlot: (p: { ymd: string; staffId: string; start: Date }) => void;
  onNeedServiceFirst: () => void;
};

function scopeBtn(active: boolean): string {
  return [
    "min-h-[48px] shrink-0 rounded-2xl border px-4 text-lg font-semibold transition",
    active
      ? "border-sky-400/70 bg-sky-500/20 text-white shadow-[0_0_24px_rgba(56,189,248,0.12)]"
      : "border-white/10 bg-white/5 text-zinc-300 hover:border-white/20",
  ].join(" ");
}

export function QuickBookingSchedulePanel({
  t,
  schedules,
  nowTick,
  firstBookableYmd,
  rowStaff,
  durationMin,
  canApplySlot,
  highlightYmd,
  onPickSlot,
  onNeedServiceFirst,
}: Props) {
  const [scope, setScope] = useState<QuickPanelScope>("7d");
  const [anchorYmd, setAnchorYmd] = useState(() => firstBookableYmd);

  const { fromYmd, toYmd } = useMemo(() => panelRange(scope, anchorYmd), [scope, anchorYmd]);

  const staffIds = useMemo(() => rowStaff.map((m) => m.id), [rowStaff]);
  const staffByIdForColors = useMemo(() => {
    const map = new Map<string, StaffCalendarColorFields>();
    for (const m of rowStaff) {
      map.set(m.id, {
        calendar_color_hex: m.calendar_color_hex,
        calendar_foreground_hex: m.calendar_foreground_hex,
      });
    }
    return map;
  }, [rowStaff]);
  const staffColorAssignments = useMemo(() => buildStaffColorAssignments(staffIds), [staffIds]);
  const staffHueMap = useMemo(() => buildStaffHueMap(staffIds), [staffIds]);

  const { appointments, timeOff, ready, error, bumpReload } = useQuickBookingPanelData(
    staffIds,
    fromYmd,
    toYmd,
  );

  const days = useMemo(() => eachYmdInclusive(fromYmd, toYmd), [fromYmd, toYmd]);

  const scheduleBase = useMemo(
    () => ({
      eligibleStaff: rowStaff,
      schedules,
      durationMin,
      staffId: null as string | null,
      anyMasterToken: ANY_TOKEN,
    }),
    [rowStaff, schedules, durationMin],
  );

  const shiftAnchor = (deltaDays: number) => {
    setAnchorYmd((a) => gregorianAddDays(a, deltaDays));
  };

  const shiftAnchorWeek = (weeks: number) => {
    setAnchorYmd((a) => gregorianAddDays(a, weeks * 7));
  };

  const shiftMonth = (delta: number) => {
    const [y, m, d] = anchorYmd.split("-").map(Number);
    const nm = m + delta;
    const ny = y + Math.floor((nm - 1) / 12);
    const mm = ((nm - 1) % 12) + 1;
    const last = new Date(ny, mm, 0).getDate();
    const dd = Math.min(d, last);
    const pad = (n: number) => String(n).padStart(2, "0");
    setAnchorYmd(`${ny}-${pad(mm)}-${pad(dd)}`);
  };

  const jumpTodayBookable = () => setAnchorYmd(firstBookableYmd);

  const onMasterCellClick = (ymd: string, master: StaffMember) => {
    if (!canApplySlot) {
      onNeedServiceFirst();
      return;
    }
    const slots = slotsForQuickBookSalonDay({
      ymd,
      eligibleStaff: [master],
      schedules,
      appointments,
      timeOff,
      durationMin,
      staffId: master.id,
      anyMasterToken: ANY_TOKEN,
    });
    const slot = firstFreeSlotOnDay(slots, nowTick);
    if (!slot) return;
    onPickSlot({ ymd, staffId: master.id, start: slot.start });
  };

  let body: ReactNode = null;

  if (!ready) {
    body = (
      <p className="py-10 text-center text-xl text-zinc-500">{t("common.loading")}</p>
    );
  } else if (error) {
    body = <p className="py-6 text-center text-lg text-rose-300">{error}</p>;
  } else if (rowStaff.length === 0) {
    body = (
      <p className="py-6 text-center text-lg text-zinc-500">{t("quickBook.panelNoStaff")}</p>
    );
  } else if (scope === "day") {
    const ymd = fromYmd;
    const hours = Array.from({ length: 13 }, (_, i) => i + 8);
    body = (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-1 text-left">
          <thead>
            <tr>
              <th className="w-20 p-2 text-lg font-semibold text-zinc-400">{t("quickBook.panelHour")}</th>
              {rowStaff.map((m) => (
                <th key={m.id} className="p-2 text-lg font-semibold text-white">
                  <span className="flex items-center gap-2">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-bold"
                      style={staffQuickPanelAvatarStyle(
                        m.id,
                        staffByIdForColors,
                        staffHueMap,
                        staffColorAssignments,
                      )}
                    >
                      {m.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="truncate">{m.name}</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hours.map((h) => (
              <tr key={h}>
                <td className="p-2 text-lg tabular-nums text-zinc-400">
                  {String(h).padStart(2, "0")}:00
                </td>
                {rowStaff.map((m) => {
                  const slots = slotsForQuickBookSalonDay({
                    ymd,
                    eligibleStaff: [m],
                    schedules,
                    appointments,
                    timeOff,
                    durationMin,
                    staffId: m.id,
                    anyMasterToken: ANY_TOKEN,
                  });
                  const hourSlots = slots.filter((s) => s.start.getHours() === h);
                  const free = hourSlots.find(
                    (s) => s.available && s.start.getTime() >= nowTick,
                  );
                  const busy = hourSlots.some((s) => !s.available);
                  const hasShift = hourSlots.length > 0;
                  const tone: CellTone = !hasShift ? "off" : free ? "ok" : busy ? "full" : "off";
                  return (
                    <td key={m.id} className="p-0.5">
                      <button
                        type="button"
                        disabled={!free || !canApplySlot}
                        onClick={() => free && onMasterCellClick(ymd, m)}
                        className={[
                          "flex min-h-[52px] w-full flex-col items-center justify-center rounded-xl border-2 px-1 text-base font-semibold transition",
                          toneCls[tone],
                          free && canApplySlot ? "active:scale-[0.98]" : "opacity-80",
                        ].join(" ")}
                      >
                        {free ? t("quickBook.panelFreeShort") : hasShift ? t("quickBook.panelBusyShort") : "—"}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  } else if (scope === "month") {
    const weekStarts: string[][] = [];
    let cur = fromYmd;
    let row: string[] = [];
    const padStart = (salonWeekdaySun0(fromYmd) + 6) % 7;
    for (let i = 0; i < padStart; i++) row.push("");
    while (compareSalonYmd(cur, toYmd) <= 0) {
      row.push(cur);
      if (row.length === 7) {
        weekStarts.push(row);
        row = [];
      }
      cur = gregorianAddDays(cur, 1);
    }
    if (row.length) {
      while (row.length < 7) row.push("");
      weekStarts.push(row);
    }
    body = (
      <div className="space-y-2">
        {weekStarts.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-2">
            {week.map((ymd, di) => {
              if (!ymd) {
                return <div key={`e-${di}`} className="min-h-[72px]" />;
              }
              const mark = markQuickBookSalonDay({
                ymd,
                firstBookableYmd,
                nowTick,
                appointments,
                timeOff,
                ...scheduleBase,
                staffId: null,
              });
              const sel = highlightYmd === ymd;
              const tone =
                mark === "past"
                  ? "off"
                  : mark === "closed"
                    ? "off"
                    : mark === "free"
                      ? "ok"
                      : mark === "busy"
                        ? "full"
                        : "off";
              return (
                <button
                  key={ymd}
                  type="button"
                  onClick={() => {
                    if (mark !== "free" || !canApplySlot) {
                      if (mark === "free" && !canApplySlot) onNeedServiceFirst();
                      return;
                    }
                    const merged = slotsForQuickBookSalonDay({
                      ymd,
                      appointments,
                      timeOff,
                      ...scheduleBase,
                      staffId: null,
                    });
                    const slot = firstFreeSlotOnDay(merged, nowTick);
                    if (!slot) return;
                    const owners = rowStaff.filter((m) => {
                      const sl = slotsForQuickBookSalonDay({
                        ymd,
                        eligibleStaff: [m],
                        schedules,
                        appointments,
                        timeOff,
                        durationMin,
                        staffId: m.id,
                        anyMasterToken: ANY_TOKEN,
                      });
                      return sl.some((s) => s.start.getTime() === slot.start.getTime() && s.available);
                    });
                    const pick = owners[0];
                    if (pick) onPickSlot({ ymd, staffId: pick.id, start: slot.start });
                  }}
                  className={[
                    "flex min-h-[72px] flex-col items-center justify-center rounded-2xl border-2 p-2 text-xl font-bold transition",
                    toneCls[tone as CellTone],
                    sel ? "ring-2 ring-sky-400 ring-offset-2 ring-offset-zinc-950" : "",
                  ].join(" ")}
                >
                  <span>{format(salonDayStartUtc(ymd), "d")}</span>
                  <span className="mt-1 text-xs font-normal opacity-90">
                    {mark === "free"
                      ? t("quickBook.panelMarkFree")
                      : mark === "busy"
                        ? t("quickBook.panelMarkBusy")
                        : mark === "closed"
                          ? t("quickBook.panelMarkOff")
                          : ""}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    );
  } else if (scope === "quarter") {
    const [y0] = fromYmd.split("-").map(Number);
    const qStartMo = Math.floor((parseInt(fromYmd.split("-")[1], 10) - 1) / 3) * 3 + 1;
    const months = [qStartMo, qStartMo + 1, qStartMo + 2];
    body = (
      <div className="grid gap-4 sm:grid-cols-3">
        {months.map((mo) => {
          const lastD = new Date(y0, mo, 0).getDate();
          const pad = (n: number) => String(n).padStart(2, "0");
          const mFrom = `${y0}-${pad(mo)}-01`;
          const mTo = `${y0}-${pad(mo)}-${pad(lastD)}`;
          let freeDays = 0;
          let busyDays = 0;
          let d = mFrom;
          while (compareSalonYmd(d, mTo) <= 0) {
            const mark = markQuickBookSalonDay({
              ymd: d,
              firstBookableYmd,
              nowTick,
              appointments,
              timeOff,
              ...scheduleBase,
              staffId: null,
            });
            if (mark === "free") freeDays++;
            else if (mark === "busy") busyDays++;
            d = gregorianAddDays(d, 1);
          }
          return (
            <div
              key={mo}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-center"
            >
              <p className="text-xl font-semibold text-white">
                {format(new Date(y0, mo - 1, 1), "LLLL", { locale: undefined })}
              </p>
              <p className="mt-3 text-lg text-emerald-200">
                {t("quickBook.panelQuarterFreeDays", { count: freeDays })}
              </p>
              <p className="mt-1 text-base text-zinc-500">
                {t("quickBook.panelQuarterBusyDays", { count: busyDays })}
              </p>
            </div>
          );
        })}
      </div>
    );
  } else {
    body = (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-separate border-spacing-2 text-left">
          <thead>
            <tr>
              <th className="min-w-[140px] p-3 text-lg font-semibold text-zinc-400">
                {t("quickBook.panelMaster")}
              </th>
              {days.map((ymd) => {
                const sel = highlightYmd === ymd;
                const d = salonDayStartUtc(ymd);
                return (
                  <th
                    key={ymd}
                    className={[
                      "p-2 text-center text-base font-semibold text-white",
                      sel ? "rounded-xl bg-sky-500/20 ring-1 ring-sky-400/50" : "",
                    ].join(" ")}
                  >
                    <div>{format(d, "EEE", { locale: undefined })}</div>
                    <div className="text-xl">{format(d, "d.MM", { locale: undefined })}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rowStaff.map((m) => (
              <tr key={m.id}>
                <td className="p-2 align-middle">
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl font-bold"
                      style={staffQuickPanelAvatarStyle(
                        m.id,
                        staffByIdForColors,
                        staffHueMap,
                        staffColorAssignments,
                      )}
                    >
                      {m.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="text-lg font-medium text-white">{m.name}</span>
                  </div>
                </td>
                {days.map((ymd) => {
                  const stats = quickBookSlotStatsForMasterDay({
                    ymd,
                    master: m,
                    schedules,
                    appointments,
                    timeOff,
                    durationMin,
                    nowTick,
                    anyMasterToken: ANY_TOKEN,
                  });
                  const tone = cellTone(stats);
                  const timeLabel =
                    stats.isClosed || stats.workingSlots === 0
                      ? "—"
                      : formatApproxFreeMinutes(stats.freeMinutesUnion, t);
                  const titleDetail =
                    stats.isClosed || stats.workingSlots === 0
                      ? t("quickBook.panelCellDetailOff")
                      : stats.freeFuture === 0
                        ? t("quickBook.panelCellDetailFull")
                        : t("quickBook.panelCellDetailFree", {
                            time: formatApproxFreeMinutes(stats.freeMinutesUnion, t),
                          });
                  return (
                    <td key={ymd} className="p-1 align-middle">
                      <button
                        type="button"
                        disabled={stats.freeFuture === 0 || !canApplySlot}
                        onClick={() => onMasterCellClick(ymd, m)}
                        title={t("quickBook.panelCellTitle", {
                          name: m.name,
                          detail: titleDetail,
                        })}
                        className={[
                          "flex min-h-[64px] w-full flex-col items-center justify-center rounded-2xl border-2 px-1.5 py-2 text-center text-sm font-bold leading-snug transition sm:px-2 sm:text-base",
                          toneCls[tone],
                          stats.freeFuture > 0 && canApplySlot
                            ? "cursor-pointer hover:brightness-110 active:scale-[0.98]"
                            : "cursor-default",
                        ].join(" ")}
                      >
                        {timeLabel}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <section className="mt-10 border-t border-white/10 pt-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white sm:text-3xl">{t("quickBook.panelTitle")}</h2>
          <p className="mt-2 max-w-3xl text-lg text-zinc-400">{t("quickBook.panelSubtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={scopeBtn(scope === "day")} onClick={() => setScope("day")}>
            {t("quickBook.panelScopeDay")}
          </button>
          <button type="button" className={scopeBtn(scope === "3d")} onClick={() => setScope("3d")}>
            {t("quickBook.panelScope3d")}
          </button>
          <button type="button" className={scopeBtn(scope === "7d")} onClick={() => setScope("7d")}>
            {t("quickBook.panelScope7d")}
          </button>
          <button type="button" className={scopeBtn(scope === "month")} onClick={() => setScope("month")}>
            {t("quickBook.panelScopeMonth")}
          </button>
          <button
            type="button"
            className={scopeBtn(scope === "quarter")}
            onClick={() => setScope("quarter")}
          >
            {t("quickBook.panelScopeQuarter")}
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-lg">
        <button
          type="button"
          onClick={() => {
            if (scope === "month" || scope === "quarter") shiftMonth(-1);
            else if (scope === "7d" || scope === "3d") shiftAnchorWeek(-1);
            else shiftAnchor(-1);
          }}
          className="min-h-[48px] rounded-xl border border-white/15 bg-white/5 px-4 font-semibold text-zinc-200"
        >
          ←
        </button>
        <button
          type="button"
          onClick={jumpTodayBookable}
          className="min-h-[48px] rounded-xl border border-emerald-500/40 bg-emerald-950/30 px-4 font-semibold text-emerald-100"
        >
          {t("quickBook.panelJumpBookable")}
        </button>
        <button
          type="button"
          onClick={() => {
            if (scope === "month" || scope === "quarter") shiftMonth(1);
            else if (scope === "7d" || scope === "3d") shiftAnchorWeek(1);
            else shiftAnchor(1);
          }}
          className="min-h-[48px] rounded-xl border border-white/15 bg-white/5 px-4 font-semibold text-zinc-200"
        >
          →
        </button>
        <span className="ml-2 text-zinc-500">
          {t("quickBook.panelRangeLabel")}: {fromYmd} — {toYmd}
        </span>
      </div>

      {!canApplySlot ? (
        <p className="mb-4 rounded-2xl border border-amber-500/35 bg-amber-950/25 px-4 py-3 text-lg text-amber-100">
          {t("quickBook.panelServiceHint")}
        </p>
      ) : null}

      <div className="rounded-3xl border border-white/10 bg-black/35 p-4 shadow-inner backdrop-blur-md sm:p-6">
        {body}
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-base text-zinc-500">
        <span className="inline-flex items-center gap-2">
          <span className="h-4 w-4 rounded-md bg-emerald-600/80" aria-hidden />
          {t("quickBook.panelLegendFree")}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-4 w-4 rounded-md bg-amber-600/80" aria-hidden />
          {t("quickBook.panelLegendLow")}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-4 w-4 rounded-md bg-rose-700/80" aria-hidden />
          {t("quickBook.panelLegendFull")}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-4 w-4 rounded-md bg-zinc-700" aria-hidden />
          {t("quickBook.panelLegendOff")}
        </span>
      </div>

      {import.meta.env.DEV ? (
        <details className="mt-6 rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 p-4 text-sm text-zinc-400">
          <summary className="cursor-pointer text-zinc-300">{t("quickBook.panelDevTools")}</summary>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-zinc-600 px-3 py-2 text-zinc-200"
              onClick={() => bumpReload()}
            >
              {t("quickBook.panelDevReload")}
            </button>
            <span className="self-center text-xs">
              {t("quickBook.panelDevSalonToday")}: {salonCalendarYmd(new Date(nowTick))}
            </span>
          </div>
        </details>
      ) : null}
    </section>
  );
}
