import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../context/ThemeContext";
import type { AppointmentRow, ServiceRow, StaffMember } from "../../types/database";

type Props = {
  appt: AppointmentRow;
  anchorX: number;
  anchorY: number;
  staff: StaffMember[];
  services: ServiceRow[];
  canManage: boolean;
  onClose: () => void;
  onEdit: () => void;
  onSaved: () => void;
};

const POPUP_W = 340;
const POPUP_H = 480;

export function ReceptionApptInfoPopup({
  appt,
  anchorX,
  anchorY,
  staff,
  services,
  canManage,
  onClose,
  onEdit,
  onSaved,
}: Props) {
  const { theme } = useTheme();
  const useGold = theme !== "white";
  const [cancelling, setCancelling] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isBlock = !appt.service_id || appt.note === "block_time" || appt.note === "block_personal";
  const isPersonal = appt.note === "block_personal";
  const noteText = appt.note && !["block_time", "block_personal"].includes(appt.note) ? appt.note : null;

  const member = staff.find((s) => s.id === appt.staff_id);
  const svc = services.find((s) => String(s.id) === String(appt.service_id));
  const start = parseISO(appt.start_time);
  const end = parseISO(appt.end_time);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }

    document.addEventListener("keydown", onKey);
    const timerId = setTimeout(() => document.addEventListener("mousedown", onMouseDown), 250);
    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(timerId);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [onClose]);

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
  const labelCls = useGold ? "text-gold/75" : "text-[#a47a3f]";
  const cancelBtnCls = "border-rose-400/25 bg-rose-400/10 text-rose-300 hover:bg-rose-400/15";
  const left = Math.min(anchorX + 8, window.innerWidth - POPUP_W - 8);
  // POPUP_H — лишь оценка для первого рендера; реальную высоту меряем ниже,
  // иначе при заполненных полях (телефон, email, комментарий) низ уезжает за экран
  const [top, setTop] = useState(() => Math.max(8, Math.min(anchorY - 8, window.innerHeight - POPUP_H - 8)));

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = el.offsetHeight;
    setTop((prev) => Math.max(8, Math.min(prev, window.innerHeight - h - 8)));
  }, []);

  return (
    <div
      ref={ref}
      style={{ left, top, width: POPUP_W, maxHeight: "calc(100dvh - 16px)" }}
      className="fixed z-50 overflow-y-auto rounded-2xl border border-line/15 bg-panel shadow-[0_12px_40px_rgba(0,0,0,0.4)]"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex items-center justify-between border-b border-line/15 px-4 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          Информация о записи
        </span>
        <button onClick={onClose} className="rounded-full p-1 text-muted hover:bg-surface" aria-label="Закрыть">
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 3l10 10M13 3L3 13" />
          </svg>
        </button>
      </div>

      <div className="space-y-2.5 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-muted">
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor">
              <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className={`text-[10px] font-semibold uppercase tracking-widest ${labelCls}`}>Клиент</p>
            <p className="mt-0.5 text-base font-semibold leading-tight text-fg">
              {isBlock
                ? (isPersonal ? "Личные дела" : "— Закрыто —")
                : (appt.client_name || "—")}
            </p>
          </div>
        </div>

        {!isBlock && (appt.client_phone || appt.client_email) && (
          <div className="space-y-2 border-t border-line/10 pt-2.5">
            {appt.client_phone && (
              <div className="flex items-start gap-3">
                <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0 text-muted" fill="currentColor">
                  <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                </svg>
                <div className="min-w-0">
                  <p className={`text-[10px] font-semibold uppercase tracking-widest ${labelCls}`}>Телефон</p>
                  <p className="mt-0.5 text-sm text-fg">{appt.client_phone}</p>
                </div>
              </div>
            )}
            {appt.client_email && (
              <div className="flex items-start gap-3">
                <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0 text-muted" fill="currentColor">
                  <path d="M2.94 6.34A2 2 0 014.76 5h10.48a2 2 0 011.82 1.34L10 10.58 2.94 6.34z" />
                  <path d="M2.76 7.92V14a2 2 0 002 2h10.48a2 2 0 002-2V7.92l-6.73 4.04a1 1 0 01-1.02 0L2.76 7.92z" />
                </svg>
                <div className="min-w-0">
                  <p className={`text-[10px] font-semibold uppercase tracking-widest ${labelCls}`}>Email</p>
                  <p className="mt-0.5 truncate text-sm text-fg">{appt.client_email}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {!isBlock && (
          <div className="flex items-start gap-3 border-t border-line/10 pt-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-muted">
              <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor">
                <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className={`text-[10px] font-semibold uppercase tracking-widest ${labelCls}`}>Услуга</p>
              <p className="mt-0.5 text-sm leading-snug text-fg">
                {svc ? `${svc.name_et} (${svc.duration_min} мин)` : "—"}
              </p>
            </div>
          </div>
        )}

        <div className="flex items-start gap-3 border-t border-line/10 pt-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-muted">
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor">
              <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className={`text-[10px] font-semibold uppercase tracking-widest ${labelCls}`}>Мастер</p>
            <p className="mt-0.5 text-sm text-fg">{member?.name ?? "—"}</p>
          </div>
        </div>

        <div className="flex items-start gap-3 border-t border-line/10 pt-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-muted">
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className={`text-[10px] font-semibold uppercase tracking-widest ${labelCls}`}>Время</p>
            <p className="mt-0.5 text-sm text-fg">
              {format(start, "HH:mm")} - {format(end, "HH:mm")}
            </p>
          </div>
        </div>

        {!isBlock && noteText && (
          <div className="flex items-start gap-3 border-t border-line/10 pt-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-muted">
              <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor">
                <path fillRule="evenodd" d="M18 5v8a2 2 0 01-2 2h-5l-5 4v-4H4a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2zM7 8H5v2h2V8zm2 0h2v2H9V8zm6 0h-2v2h2V8z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className={`text-[10px] font-semibold uppercase tracking-widest ${labelCls}`}>Комментарий</p>
              <p className="mt-0.5 text-sm leading-relaxed text-fg">{noteText}</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-line/15 px-4 py-3">
        <button
          type="button"
          onClick={onEdit}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${editBtnCls}`}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-5" />
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          <span>Редактировать</span>
        </button>

        {canManage && (
          <button
            type="button"
            onClick={() => void handleCancel()}
            disabled={cancelling}
            className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40 ${cancelBtnCls}`}
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" fill="currentColor">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {cancelling ? "Отмена..." : "Отменить"}
          </button>
        )}
      </div>
    </div>
  );
}
