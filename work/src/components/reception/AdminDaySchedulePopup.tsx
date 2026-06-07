import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { supabase } from "../../lib/supabase";
import type { StaffMember, StaffWorkDateRow } from "../../types/database";
import { googleStaffColor } from "./receptionColors";
import { buildStaffHueMap } from "../../lib/staffHue";

type Props = {
  day: Date;
  anchorX: number;
  anchorY: number;
  allStaff: StaffMember[];
  workDates: StaffWorkDateRow[];
  holidays: string[]; // "YYYY-MM-DD"
  onClose: () => void;
  onSaved: () => void;
};

export function AdminDaySchedulePopup({ day, anchorX, anchorY, allStaff, workDates, holidays, onClose, onSaved }: Props) {
  const { t, i18n } = useTranslation();
  const [saving, setSaving] = useState<string | null>(null);
  const [savingHoliday, setSavingHoliday] = useState(false);
  const hueMap = buildStaffHueMap(allStaff.map((m) => m.id));

  const popupW = 272;
  const x = Math.max(8, Math.min(anchorX + 8, window.innerWidth - popupW - 8));
  const y = Math.min(anchorY, window.innerHeight - 460);
  const dateStr = format(day, "yyyy-MM-dd");
  const uiLocale = i18n.language === "et" ? "et-EE" : "ru-RU";
  const dayLabel = day.toLocaleString(uiLocale, { weekday: "long", day: "numeric", month: "long" });

  const isHoliday = holidays.includes(dateStr);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function toggleHoliday() {
    setSavingHoliday(true);
    if (isHoliday) {
      await supabase.from("salon_holidays").delete().eq("holiday_date", dateStr);
    } else {
      await supabase.from("salon_holidays").insert({ holiday_date: dateStr, reason: null });
    }
    setSavingHoliday(false);
    onSaved();
  }

  async function toggle(staffId: string, isWorking: boolean) {
    setSaving(staffId);
    if (isWorking) {
      const row = workDates.find((r) => r.staff_id === staffId && r.work_date === dateStr);
      if (row) await supabase.from("staff_work_dates").delete().eq("id", row.id);
    } else {
      await supabase.from("staff_work_dates").insert({ staff_id: staffId, work_date: dateStr });
    }
    setSaving(null);
    onSaved();
  }

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 overflow-hidden rounded-xl bg-panel shadow-2xl ring-1 ring-line/15"
        style={{ left: x, top: y, width: popupW }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line/15 px-4 py-3">
          <span className="text-sm font-medium capitalize text-fg">{dayLabel}</span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-surface"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Holiday toggle */}
        <div className={`border-b border-line/15 px-4 py-3 ${isHoliday ? "bg-rose-500/10" : ""}`}>
          <button
            type="button"
            disabled={savingHoliday}
            onClick={() => { void toggleHoliday(); }}
            className={[
              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
              isHoliday
                ? "bg-rose-500/15 text-rose-400 hover:bg-rose-500/20"
                : "text-fg hover:bg-surface",
            ].join(" ")}
          >
            {/* Toggle switch */}
            <div className={[
              "relative flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
              isHoliday ? "bg-rose-500" : "bg-line/30",
            ].join(" ")}>
              <span className={[
                "absolute h-3.5 w-3.5 rounded-full bg-white shadow transition-transform",
                isHoliday ? "translate-x-[18px]" : "translate-x-[3px]",
              ].join(" ")} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">
                {isHoliday ? "🔴 Салон закрыт" : "Закрыть день (праздник)"}
              </p>
              {isHoliday && (
                <p className="mt-0.5 text-xs text-rose-400/80">Весь день отмечен как выходной</p>
              )}
            </div>
            {savingHoliday && <span className="text-[10px] text-muted">…</span>}
          </button>
        </div>

        {/* Staff list */}
        <div className="px-1 py-2">
          <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted">
            {t("reception.worksOn")} {day.toLocaleString(uiLocale, { day: "numeric", month: "long" })}
          </p>
          {allStaff.map((m) => {
            const isWorking = workDates.some((r) => r.staff_id === m.id && r.work_date === dateStr);
            const isLoading = saving === m.id;
            const c = googleStaffColor(m, hueMap);
            return (
              <label
                key={m.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-surface"
              >
                <input
                  type="checkbox"
                  checked={isWorking}
                  disabled={isLoading}
                  onChange={() => { void toggle(m.id, isWorking); }}
                  className="h-4 w-4 accent-[#1a73e8]"
                />
                <span
                  className="truncate rounded px-2 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: c.bg, color: c.fg }}
                >
                  {m.name.split(" ")[0]}
                </span>
                <span className="flex-1 text-sm text-fg">{m.name}</span>
                {isLoading && <span className="text-[10px] text-muted">…</span>}
              </label>
            );
          })}
        </div>
      </div>
    </>
  );
}
