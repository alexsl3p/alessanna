import { useEffect, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../context/ThemeContext";
import type { AppointmentRow, ServiceRow, StaffMember } from "../../types/database";

type Props = {
  appt: AppointmentRow;
  staff: StaffMember[];
  services: ServiceRow[];
  canManage: boolean;
  onClose: () => void;
  onEdit: () => void;
  onSaved: () => void;
};

export function ReceptionApptInfoPopup({ appt, staff, services, canManage, onClose, onEdit, onSaved }: Props) {
  const { theme } = useTheme();
  const useGold = theme !== "white";
  const [cancelling, setCancelling] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isBlock = !appt.service_id || appt.note === "block_time" || appt.note === "block_personal";
  const isPersonal = appt.note === "block_personal";
  const initialNote = appt.note && !["block_time", "block_personal"].includes(appt.note) ? appt.note : "";
  const [staffNote, setStaffNote] = useState(initialNote);
  const [savingNote, setSavingNote] = useState(false);
  const noteDirty = staffNote !== initialNote;

  const member = staff.find((s) => s.id === appt.staff_id);
  const svc = services.find((s) => String(s.id) === String(appt.service_id));
  const start = parseISO(appt.start_time);
  const end = parseISO(appt.end_time);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSaveNote() {
    setSavingNote(true);
    await supabase.from("appointments").update({ note: staffNote || null }).eq("id", appt.id);
    setSavingNote(false);
  }

  async function handleCancel() {
    if (!window.confirm("Отменить эту запись?")) return;
    setCancelling(true);
    await supabase.from("appointments").update({ status: "cancelled" }).eq("id", appt.id);
    setCancelling(false);
    onSaved();
  }

  const editBtnCls = useGold
    ? "bg-gold/10 border-gold/30 hover:bg-gold/20 text-gold"
    : "bg-[#e8f0fe] border-[#4285f4]/30 hover:bg-[#d2e3fc] text-[#1a73e8]";

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[55] bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div
        ref={ref}
        className="fixed left-1/2 top-1/2 z-[60] w-[calc(100%-24px)] max-w-[680px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-line/15 bg-panel shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line/15 px-5 py-3.5">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted">
            Информация о записи
          </span>
          <button onClick={onClose} className="rounded-full p-1 text-muted hover:bg-surface" aria-label="Закрыть">
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col sm:flex-row">
          {/* Left: info rows */}
          <div className="flex flex-1 flex-col divide-y divide-line/10 px-5 py-4">

            {/* Client */}
            <div className="flex items-center gap-3 pb-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-muted">
                <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">Клиент</p>
                <p className="mt-0.5 text-xl font-semibold text-fg">
                  {isBlock
                    ? (isPersonal ? "Личные дела" : "— Закрыто —")
                    : (appt.client_name || "—")}
                </p>
              </div>
            </div>

            {/* Phone + Email */}
            {!isBlock && (appt.client_phone || appt.client_email) && (
              <div className="flex flex-wrap gap-6 py-4">
                {appt.client_phone && (
                  <div className="flex items-start gap-2">
                    <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0 text-muted" fill="currentColor">
                      <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                    </svg>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">Телефон</p>
                      <p className="mt-0.5 text-sm text-fg">{appt.client_phone}</p>
                    </div>
                  </div>
                )}
                {appt.client_email && (
                  <div className="flex items-start gap-2">
                    <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0 text-muted" fill="currentColor">
                      <path d="M2.94 6.34A2 2 0 014.76 5h10.48a2 2 0 011.82 1.34L10 10.58 2.94 6.34z" />
                      <path d="M2.76 7.92V14a2 2 0 002 2h10.48a2 2 0 002-2V7.92l-6.73 4.04a1 1 0 01-1.02 0L2.76 7.92z" />
                    </svg>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">Email</p>
                      <p className="mt-0.5 text-sm text-fg">{appt.client_email}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Service */}
            {!isBlock && (
              <div className="flex items-center gap-3 py-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-muted">
                  <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor">
                    <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">Услуга</p>
                  <p className="mt-0.5 text-sm text-fg">
                    {svc ? `${svc.name_et} (${svc.duration_min} мин)` : "—"}
                  </p>
                </div>
              </div>
            )}

            {/* Staff */}
            <div className="flex items-center gap-3 py-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-muted">
                <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">Мастер</p>
                <p className="mt-0.5 text-sm text-fg">{member?.name ?? "—"}</p>
              </div>
            </div>

            {/* Time */}
            <div className="flex items-center gap-3 py-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-muted">
                <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">Время</p>
                <p className="mt-0.5 text-sm text-fg">
                  {format(start, "HH:mm")} – {format(end, "HH:mm")}
                </p>
              </div>
            </div>

            {/* Note / master comment */}
            {!isBlock && (
              <div className="flex items-start gap-3 pt-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-muted">
                  <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor">
                    <path fillRule="evenodd" d="M18 5v8a2 2 0 01-2 2h-5l-5 4v-4H4a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2zM7 8H5v2h2V8zm2 0h2v2H9V8zm6 0h-2v2h2V8z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">Комментарий</p>
                  <textarea
                    value={staffNote}
                    onChange={(e) => setStaffNote(e.target.value)}
                    rows={3}
                    placeholder="Заметка мастера…"
                    className="mt-1.5 w-full resize-none rounded-lg border border-line/20 bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted/50 focus:border-line/40 focus:outline-none focus:ring-1 focus:ring-line/20"
                  />
                  {noteDirty && (
                    <button
                      type="button"
                      onClick={() => void handleSaveNote()}
                      disabled={savingNote}
                      className="mt-1.5 rounded-lg bg-surface px-3 py-1 text-xs font-medium text-fg hover:bg-surface/80 disabled:opacity-40 border border-line/20"
                    >
                      {savingNote ? "Сохраняю…" : "Сохранить заметку"}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right: actions */}
          <div className="flex shrink-0 flex-row items-center justify-around gap-4 border-t border-line/10 px-5 py-5 sm:w-48 sm:flex-col sm:items-stretch sm:justify-start sm:border-l sm:border-t-0 sm:py-6">
            {/* Edit card button */}
            <button
              onClick={onEdit}
              className={`flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border px-4 py-6 text-center transition-colors sm:flex-none ${editBtnCls}`}
            >
              <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-5" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              <span className="text-sm font-semibold leading-tight">
                Редактировать<br />бронь
              </span>
            </button>

            {/* Cancel */}
            {canManage && (
              <button
                onClick={() => void handleCancel()}
                disabled={cancelling}
                className="flex items-center justify-center gap-2 text-sm text-rose-400 hover:text-rose-300 disabled:opacity-40"
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" fill="currentColor">
                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {cancelling ? "Отмена…" : "Отменить запись"}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
