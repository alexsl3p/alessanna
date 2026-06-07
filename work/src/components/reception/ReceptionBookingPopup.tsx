import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { addMinutes, format, setHours, setMinutes, startOfDay } from "date-fns";
import { supabase } from "../../lib/supabase";
import { servicesEligibleForStaff } from "../../lib/roles";
import { useTheme } from "../../context/ThemeContext";
import type { AppointmentRow, ServiceRow, StaffMember, StaffServiceRow } from "../../types/database";
import { ClientAutocompleteInput } from "../ClientAutocompleteInput";
import { clientDisplayName, resolveClientIdForVisit, type ClientSuggestion } from "../../lib/clientLink";
import { useAuth } from "../../context/AuthContext";

type Props = {
  anchorX: number;
  anchorY: number;
  initialStart: Date;
  defaultStaffId: string | null;
  staff: StaffMember[];
  services: ServiceRow[];
  links: StaffServiceRow[];
  onSave: () => void;
  onClose: () => void;
  editAppt?: AppointmentRow | null;
};

const POPUP_W = 340;
const POPUP_H = 480;

const BLOCK_DURATIONS = [15, 30, 45, 60, 90, 120];

function timeToStr(date: Date): string {
  return format(date, "HH:mm");
}

// Auto-inserts colon so typing "1030" yields "10:30" (numeric keyboard friendly)
function formatTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function isValidTime(str: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(str)) return false;
  const [h, m] = str.split(":").map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

function applyTimeStr(base: Date, timeStr: string): Date {
  const [hStr, mStr] = timeStr.split(":");
  const h = parseInt(hStr ?? "0", 10);
  const m = parseInt(mStr ?? "0", 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return base;
  return setMinutes(setHours(startOfDay(base), h), m);
}

export function ReceptionBookingPopup({
  anchorX,
  anchorY,
  initialStart,
  defaultStaffId,
  staff,
  services,
  links,
  onSave,
  onClose,
  editAppt = null,
}: Props) {
  const { t, i18n } = useTranslation();
  const { staffMember } = useAuth();
  const { theme } = useTheme();
  const useGold = theme !== "white";
  const popupRef = useRef<HTMLDivElement>(null);
  const isEdit = editAppt != null;

  const isExistingBlock = isEdit && !editAppt!.service_id;
  const [isBlock, setIsBlock] = useState(() => isExistingBlock);
  const [blockDuration, setBlockDuration] = useState(30);
  const [clientName, setClientName] = useState(() => editAppt?.client_name ?? "");
  const [clientPhone, setClientPhone] = useState(() => editAppt?.client_phone ?? "");
  const [clientEmail, setClientEmail] = useState(() => editAppt?.client_email ?? "");
  const [pickedClientId, setPickedClientId] = useState<string | null>(() => editAppt?.client_id ?? null);
  const [staffId, setStaffId] = useState<string>(() => editAppt?.staff_id ?? defaultStaffId ?? "");
  const [serviceId, setServiceId] = useState<string>(() => (editAppt && !isExistingBlock ? String(editAppt.service_id) : ""));
  const [startStr, setStartStr] = useState(() => timeToStr(editAppt ? new Date(editAppt.start_time) : initialStart));
  const [endStr, setEndStr] = useState(() =>
    timeToStr(editAppt ? new Date(editAppt.end_time) : addMinutes(initialStart, 60)),
  );
  const lastValidStartRef = useRef(startStr);
  const lastValidEndRef = useRef(endStr);
  const [endManual, setEndManual] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showServicePicker, setShowServicePicker] = useState(false);

  const left = Math.min(anchorX + 8, window.innerWidth - POPUP_W - 8);
  const top = Math.max(8, Math.min(anchorY - 8, window.innerHeight - POPUP_H - 8));

  const selectedStaff = useMemo(() => staff.find((s) => s.id === staffId) ?? null, [staff, staffId]);
  const eligibleServices = useMemo(
    () => servicesEligibleForStaff(services, links, staffId, selectedStaff, { implicitAll: false, privilegedCanDoAll: false }),
    [services, links, staffId, selectedStaff],
  );
  const svc = useMemo(() => eligibleServices.find((s) => String(s.id) === serviceId) ?? null, [eligibleServices, serviceId]);

  const groupedServices = useMemo(() => {
    const groups = new Map<string, typeof eligibleServices>();
    const ungrouped: typeof eligibleServices = [];
    for (const s of eligibleServices) {
      const cat = s.category?.trim() || "";
      if (!cat) { ungrouped.push(s); continue; }
      const arr = groups.get(cat) ?? [];
      arr.push(s);
      groups.set(cat, arr);
    }
    const sorted = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "ru"));
    return { sorted, ungrouped };
  }, [eligibleServices]);

  useEffect(() => {
    if (!isBlock && serviceId && !eligibleServices.some((s) => String(s.id) === serviceId)) {
      setServiceId("");
    }
  }, [staffId, eligibleServices, serviceId, isBlock]);

  useEffect(() => {
    if (endManual) return;
    if (isBlock) setEndStr(timeToStr(addMinutes(applyTimeStr(initialStart, startStr), blockDuration)));
    else if (svc) setEndStr(timeToStr(addMinutes(applyTimeStr(initialStart, startStr), svc.duration_min)));
  }, [svc, startStr, initialStart, endManual, isBlock, blockDuration]);

  function handleStartChange(val: string) {
    setStartStr(val);
    if (isValidTime(val)) lastValidStartRef.current = val;
    if (!endManual) {
      const dur = isBlock ? blockDuration : (svc ? svc.duration_min : 60);
      setEndStr(timeToStr(addMinutes(applyTimeStr(initialStart, val), dur)));
    }
  }

  function handleStartBlur() {
    if (!isValidTime(startStr)) handleStartChange(lastValidStartRef.current);
  }

  function handleEndChange(val: string) {
    setEndStr(val);
    if (isValidTime(val)) lastValidEndRef.current = val;
    setEndManual(true);
  }

  function handleEndBlur() {
    if (!isValidTime(endStr)) setEndStr(lastValidEndRef.current);
  }
  function handleModeToggle(block: boolean) { setIsBlock(block); setEndManual(false); setError(""); }

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    function onMouseDown(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("keydown", onKey);
    const timerId = setTimeout(() => document.addEventListener("mousedown", onMouseDown), 250);
    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(timerId);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [onClose]);

  const uiLocale = i18n.language === "et" ? "et-EE" : "ru-RU";
  const dateLabel = initialStart.toLocaleString(uiLocale, { weekday: "long", day: "numeric", month: "long" });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isBlock && !svc) { setError(t("modal.pickService")); return; }
    if (!staffId) { setError(t("modal.selectStaff")); return; }
    const start = applyTimeStr(initialStart, startStr);
    const end = applyTimeStr(initialStart, endStr);
    if (end <= start) { setError(t("modal.endAfterStart")); return; }
    setSaving(true); setError("");
    const normalizedClientName = clientName.trim() || t("modal.defaultClient");
    const resolvedClientId = isBlock
      ? null
      : pickedClientId ?? (await resolveClientIdForVisit(normalizedClientName, clientPhone, clientEmail));
    const payload = isBlock
      ? { client_name: clientName.trim() || "— Закрыто —", client_phone: null as null, note: "block_time", staff_id: staffId, service_id: null as null, start_time: start.toISOString(), end_time: end.toISOString(), status: "confirmed" as const }
      : { client_id: resolvedClientId, client_name: normalizedClientName, client_phone: clientPhone.trim() || null, client_email: clientEmail.trim() || null, note: null as null, source: "reception", created_by_staff_id: staffMember?.id ?? null, staff_id: staffId, service_id: svc!.id, start_time: start.toISOString(), end_time: end.toISOString(), status: "confirmed" as const };
    const { error: writeErr } = isEdit
      ? await supabase.from("appointments").update(payload).eq("id", editAppt!.id)
      : await supabase.from("appointments").insert(payload);
    setSaving(false);
    if (writeErr) { setError(writeErr.message); return; }
    onSave();
  }

  async function handleDelete() {
    if (!editAppt) return;
    if (!window.confirm(t("modal.deleteConfirm"))) return;
    setSaving(true);
    const { error: delErr } = await supabase.from("appointments").delete().eq("id", editAppt.id);
    setSaving(false);
    if (delErr) { setError(delErr.message); return; }
    onSave();
  }

  // Theme-aware style helpers
  const accentTabActive = useGold ? "bg-gold/15 text-gold" : "bg-[#e8f0fe] text-[#1a73e8]";
  const accentTabIdle = "text-muted hover:bg-surface";
  const accentFocus = useGold
    ? "focus:border-gold focus:ring-gold/30"
    : "focus:border-[#1a73e8] focus:ring-[#1a73e8]/20";
  const accentUnderline = useGold ? "focus:border-gold" : "focus:border-[#1a73e8]";
  const accentSaveBg = useGold ? "bg-gold hover:bg-gold/80 text-canvas" : "bg-[#1a73e8] hover:bg-[#1765cc] text-white";
  const accentCancelText = useGold ? "text-gold hover:bg-gold/10" : "text-[#1a73e8] hover:bg-surface";
  const accentResetBtn = useGold ? "text-gold" : "text-[#1a73e8]";

  const inputCls = `flex-1 min-w-0 h-9 rounded-lg border border-line/20 bg-surface px-2 text-sm text-fg focus:outline-none focus:ring-1 ${accentFocus}`;
  const timeCls = `w-24 rounded-lg border border-line/20 bg-surface px-2 py-1 text-sm text-fg focus:outline-none focus:ring-1 ${accentFocus}`;

  return (
    <div
      ref={popupRef}
      style={{ left, top, width: POPUP_W }}
      className="fixed z-50 overflow-hidden rounded-2xl border border-line/15 bg-panel shadow-[0_12px_40px_rgba(0,0,0,0.4)]"
      role="dialog"
      aria-modal="true"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line/15 px-4 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          {isEdit ? t("modal.editBooking") : t("modal.newBooking")}
        </span>
        <button onClick={onClose} className="rounded-full p-1 text-muted hover:bg-surface" aria-label={t("common.cancel")}>
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 3l10 10M13 3L3 13" />
          </svg>
        </button>
      </div>

      {/* Mode toggle */}
      {!isEdit && (
        <div className="flex border-b border-line/15">
          <button type="button" onClick={() => handleModeToggle(false)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${!isBlock ? accentTabActive : accentTabIdle}`}>
            Запись клиента
          </button>
          <button type="button" onClick={() => handleModeToggle(true)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${isBlock ? "bg-rose-500/10 text-rose-400" : accentTabIdle}`}>
            <span className="inline-flex items-center gap-1">
              <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0" fill="currentColor">
                <path d="M11 7V5a3 3 0 1 0-6 0v2H4a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-1ZM6 5a2 2 0 1 1 4 0v2H6V5Z"/>
              </svg>
              Закрыть время
            </span>
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3 p-4">
        {/* Client name */}
        {!isBlock ? (
          <ClientAutocompleteInput autoFocus value={clientName} onChange={(value) => { setClientName(value); setPickedClientId(null); }}
            onPick={(client: ClientSuggestion) => {
              setPickedClientId(client.id);
              setClientName(clientDisplayName(client) || client.name);
              setClientPhone(client.phone ?? "");
              setClientEmail(client.email ?? "");
            }}
            placeholder={t("modal.addClient")}
            className={`w-full border-0 border-b border-line/20 bg-transparent pb-1 text-base font-medium text-fg placeholder:text-muted/50 focus:outline-none ${accentUnderline}`} />
        ) : (
          <input value={clientName} onChange={(e) => setClientName(e.target.value)}
            placeholder="Причина (необязательно)"
            className="w-full border-0 border-b border-line/20 bg-transparent pb-1 text-base font-medium text-fg placeholder:text-muted/50 focus:border-rose-400 focus:outline-none" />
        )}

        {/* Date + time */}
        <div className="flex items-start gap-3">
          <svg viewBox="0 0 20 20" className="mt-2 h-4 w-4 shrink-0 text-muted" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
          </svg>
          <div className="flex-1">
            <p className="mb-1.5 text-sm font-medium capitalize text-fg">{dateLabel}</p>
            <div className="flex items-center gap-2">
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] text-muted">{t("modal.start")}</label>
                <input type="text" inputMode="numeric" maxLength={5} placeholder="00:00" value={startStr} onFocus={(e) => e.target.select()} onChange={(e) => handleStartChange(formatTimeInput(e.target.value))} onBlur={handleStartBlur} className={`${timeCls} text-center`} />
              </div>
              <span className="mt-4 text-muted">—</span>
              <div className="flex flex-col gap-0.5">
                <label className="flex items-center gap-1 text-[10px] text-muted">
                  {t("modal.end")}
                  {endManual && (
                    <button type="button" onClick={() => setEndManual(false)} className={`text-[10px] hover:underline ${accentResetBtn}`} title={t("modal.resetAuto")}>↺</button>
                  )}
                </label>
                <input type="text" inputMode="numeric" maxLength={5} placeholder="00:00" value={endStr} onFocus={(e) => e.target.select()} onChange={(e) => handleEndChange(formatTimeInput(e.target.value))} onBlur={handleEndBlur}
                  className={[`${timeCls} text-center`, endManual ? (useGold ? "border-gold bg-gold/10" : "border-[#1a73e8] bg-[#e8f0fe]/20") : ""].join(" ")} />
              </div>
            </div>
          </div>
        </div>

        {/* Staff */}
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-muted" fill="currentColor">
            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
          </svg>
          <select value={staffId} onChange={(e) => { setStaffId(e.target.value); setServiceId(""); setEndManual(false); }} className={inputCls}>
            <option value="" disabled>— мастер —</option>
            {staff.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {/* Service or block duration */}
        {isBlock ? (
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-rose-400" fill="currentColor">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            <select value={blockDuration} onChange={(e) => { setBlockDuration(Number(e.target.value)); setEndManual(false); }}
              className="flex-1 rounded-lg border border-line/20 bg-surface px-2 py-1.5 text-sm text-fg focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400/20">
              {BLOCK_DURATIONS.map((d) => <option key={d} value={d}>{d} мин</option>)}
            </select>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-muted" fill="currentColor">
              <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
            </svg>
            <button
              type="button"
              onClick={() => setShowServicePicker(true)}
              className={`${inputCls} flex items-center justify-between gap-1`}
            >
              <span className={`truncate ${svc ? "text-fg" : "text-muted/60"}`}>
                {svc ? `${svc.name_et} (${svc.duration_min} ${t("common.min")})` : t("modal.selectService")}
              </span>
              <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-muted" fill="currentColor">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        )}

        {/* Phone */}
        {!isBlock && (
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-muted" fill="currentColor">
              <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
            </svg>
            <input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)}
              placeholder={t("modal.phoneOptional")} type="tel"
              className={inputCls + " placeholder:text-muted/50"} />
          </div>
        )}

        {!isBlock && (
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-muted" fill="currentColor">
              <path d="M2.94 6.34A2 2 0 014.76 5h10.48a2 2 0 011.82 1.34L10 10.58 2.94 6.34z" />
              <path d="M2.76 7.92V14a2 2 0 002 2h10.48a2 2 0 002-2V7.92l-6.73 4.04a1 1 0 01-1.02 0L2.76 7.92z" />
            </svg>
            <input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)}
              placeholder="Email (необязательно)" type="email"
              className={inputCls + " placeholder:text-muted/50"} />
          </div>
        )}

        {error && <p className="text-xs text-rose-400">{error}</p>}

        <div className="flex items-center justify-end gap-2 pt-1">
          {isEdit && (
            <button type="button" onClick={handleDelete} disabled={saving}
              className="mr-auto rounded-lg px-3 py-1.5 text-sm font-medium text-rose-400 hover:bg-rose-400/10 disabled:opacity-40">
              {t("modal.delete")}
            </button>
          )}
          <button type="button" onClick={onClose}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${accentCancelText}`}>
            {t("common.cancel")}
          </button>
          <button type="submit" disabled={saving || (!isBlock && (!serviceId || !clientName.trim())) || !staffId}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium disabled:opacity-40 ${isBlock ? "bg-rose-500 hover:bg-rose-600 text-white" : accentSaveBg}`}>
            {saving ? t("modal.saving") : (isBlock ? "Закрыть время" : t("common.save"))}
          </button>
        </div>
      </form>

      {/* Service picker overlay */}
      {showServicePicker && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/50" onClick={() => setShowServicePicker(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-[70] flex max-h-[65vh] flex-col overflow-hidden rounded-t-2xl border-t border-line/15 bg-panel shadow-2xl sm:bottom-auto sm:left-1/2 sm:right-auto sm:top-1/2 sm:w-[420px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border">
            {/* Sheet header */}
            <div className="flex shrink-0 items-center justify-between border-b border-line/15 px-4 py-3">
              <span className="text-sm font-semibold text-fg">{t("modal.selectService")}</span>
              <button type="button" onClick={() => setShowServicePicker(false)} className="rounded-full p-1 text-muted hover:bg-surface">
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 3l10 10M13 3L3 13" />
                </svg>
              </button>
            </div>
            {/* Service list */}
            <div className="overflow-y-auto">
              {groupedServices.ungrouped.map((s) => (
                <button key={String(s.id)} type="button"
                  onClick={() => { setServiceId(String(s.id)); setEndManual(false); setShowServicePicker(false); }}
                  className={`w-full px-4 py-3 text-left text-sm transition-colors ${String(s.id) === serviceId ? (useGold ? "bg-gold/10 text-gold" : "bg-[#e8f0fe] text-[#1a73e8]") : "text-fg hover:bg-surface"}`}>
                  {s.name_et} ({s.duration_min} {t("common.min")})
                </button>
              ))}
              {groupedServices.sorted.map(([cat, svcs]) => (
                <div key={cat}>
                  <div className={`border-t border-line/10 bg-white/[0.04] px-4 pb-1.5 pt-2.5 text-[11px] font-bold uppercase tracking-widest ${useGold ? "text-gold" : "text-[#1a73e8]"}`}>{cat}</div>
                  {svcs.map((s) => (
                    <button key={String(s.id)} type="button"
                      onClick={() => { setServiceId(String(s.id)); setEndManual(false); setShowServicePicker(false); }}
                      className={`w-full px-4 py-2.5 pl-6 text-left text-sm transition-colors ${String(s.id) === serviceId ? (useGold ? "bg-gold/10 text-gold" : "bg-[#e8f0fe] text-[#1a73e8]") : "text-fg hover:bg-surface"}`}>
                      {s.name_et} ({s.duration_min} {t("common.min")})
                    </button>
                  ))}
                </div>
              ))}
              <div className="h-4" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
