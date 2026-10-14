import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";
import { supabaseAuth } from "../lib/supabaseAuth";
import { useVisiblePolling } from "../lib/useVisiblePolling";

type Status = "pending" | "approved" | "rejected";
type Review = { id: string; author_name: string; author_email: string | null;
  rating: number; body: string; status: Status; created_at: string; moderated_at: string | null };
type Queue = { rows: Review[]; counts: Record<Status, number> };
const statuses: Status[] = ["pending", "approved", "rejected"];
const tokenKey = "alessanna_crm_device_token";
function deviceToken() { try { return localStorage.getItem(tokenKey); } catch { return null; } }

export function AdminReviewsPage() {
  const { t, i18n } = useTranslation();
  const { staffMember } = useAuth();
  const staffId = staffMember?.id;
  const [filter, setFilter] = useState<Status>("pending");
  const [page, setPage] = useState(0);
  const [queue, setQueue] = useState<Queue>({ rows: [], counts: { pending: 0, approved: 0, rejected: 0 } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [needsAuth, setNeedsAuth] = useState(false);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);

  // Email auth uses the actual JWT. Phone auth uses a verified personal device.
  const call = useCallback(async (name: string, args: Record<string, unknown>) => {
    const { data: { session } } = await supabaseAuth.auth.getSession();
    return (session ? supabaseAuth : supabase).rpc(name, {
      ...args, p_staff_id: staffId, p_device_token: deviceToken(),
    });
  }, [staffId]);

  const fail = useCallback((message: string) => {
    if (message.includes("review_auth_required")) {
      setNeedsAuth(true);
      setQueue({ rows: [], counts: { pending: 0, approved: 0, rejected: 0 } });
      setError("");
    } else setError(t(message.includes("access_denied") ? "reviews.denied" : "reviews.failed"));
  }, [t]);

  const reload = useCallback(async () => {
    if (!staffId) return;
    const request = ++generation.current;
    try {
      const { data, error: rpcError } = await call("review_admin_list", { p_status: filter, p_offset: page * 50 });
      if (request !== generation.current) return;
      if (rpcError) { fail(rpcError.message); return; }
      const next = data as Queue;
      if (page > 0 && !next.rows.length) { setPage(page - 1); return; }
      setQueue(next);
      setNeedsAuth(false);
      setError("");
    } catch { if (request === generation.current) setError(t("reviews.failed")); }
    finally { if (request === generation.current) setLoading(false); }
  }, [call, fail, filter, page, staffId, t]);
  useEffect(() => { void reload(); return () => { ++generation.current; }; }, [reload]);
  useVisiblePolling(() => { void reload(); }, 15000, !needsAuth && !busy);

  async function unlock(event: React.FormEvent) {
    event.preventDefault();
    if (!staffMember?.phone || busy) return;
    setBusy(true); setError("");
    try {
      // Force PIN verification; a shared kiosk token must not authorize approval.
      const { data, error: rpcError } = await supabase.rpc("staff_login", {
        phone_input: staffMember.phone, pin_input: pin, device_token: null,
        trust_this_device: true, device_label: "CRM reviews", user_agent_input: navigator.userAgent.slice(0, 240),
      });
      if (rpcError || data?.status !== "ok" || !data.new_device_token || data.staff?.id !== staffId) {
        setError(t(data?.status === "pin_locked" ? "reviews.pinLocked" : "reviews.pinInvalid")); return;
      }
      localStorage.setItem(tokenKey, data.new_device_token);
      setPin(""); setNeedsAuth(false);
      await reload();
    } catch { setError(t("reviews.failed")); }
    finally { setBusy(false); }
  }
  async function moderate(row: Review, status: Status) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    ++generation.current; // Ignore any list response that started before this update.
    try {
      const { error: rpcError } = await call("review_moderate", { p_review_id: row.id, p_status: status });
      if (rpcError) { fail(rpcError.message); return; }
      setNotice(t(status === "approved" ? "reviews.published" : "reviews.hidden"));
      await reload();
    } catch { setError(t("reviews.failed")); }
    finally { setBusy(false); }
  }
  const totalPages = Math.max(1, Math.ceil(queue.counts[filter] / 50));
  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-semibold text-fg">{t("reviews.title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("reviews.subtitle")}</p></div>
        <button type="button" disabled={busy || needsAuth} onClick={() => void reload()}
          className="rounded-lg border border-line/20 px-3 py-2 text-sm text-fg disabled:opacity-50">{t("common.refresh", { defaultValue: "Обновить" })}</button>
      </header>
      {error && <p role="alert" className="rounded-lg border border-red-800 p-3 text-sm text-red-400">{error}</p>}
      {notice && <p role="status" className="text-sm text-emerald-500">{notice}</p>}
      {needsAuth ? <form onSubmit={unlock} className="max-w-md space-y-3 rounded-xl border border-line/20 bg-surface p-5">
        <p className="text-sm text-muted">{t("reviews.unlockHint")}</p>
        <label className="block text-sm text-fg">{t("reviews.pin")}<input type="password" inputMode="numeric" autoComplete="current-password"
          required maxLength={12} value={pin} onChange={e => setPin(e.target.value)} className="mt-1 block w-full rounded-lg border border-line/20 bg-transparent p-2" /></label>
        <button type="submit" disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-black disabled:opacity-50">{t("reviews.unlock")}</button>
      </form> : <>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("reviews.filters")}>
          {statuses.map(status => <button key={status} type="button" disabled={busy} aria-pressed={filter === status}
            onClick={() => { ++generation.current; setFilter(status); setPage(0); setLoading(true); setNotice(""); }}
            className={`rounded-lg border px-4 py-2 text-sm ${filter === status ? "border-accent bg-accent/10 text-fg" : "border-line/20 text-muted"}`}>
            {t(`reviews.${status}`)} <span className="ml-1">{queue.counts[status]}</span></button>)}
        </div>
        {loading ? <p className="text-muted">{t("common.loading")}</p> : queue.rows.length === 0 ?
          <p className="rounded-xl border border-line/15 p-6 text-muted">{t("reviews.empty")}</p> :
          <div className="space-y-3" aria-busy={busy}>
            {queue.rows.map(row => <article key={row.id} className="space-y-3 rounded-xl border border-line/15 bg-surface p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><h2 className="break-words font-semibold text-fg">{row.author_name}</h2>
                  <p className="text-xs text-muted">{new Date(row.created_at).toLocaleString(i18n.language === "et" ? "et-EE" : "ru-RU", { timeZone: "Europe/Tallinn" })}</p></div>
                <span role="img" aria-label={`${row.rating}/5`} className="text-accent">{"★".repeat(row.rating)}{"☆".repeat(5 - row.rating)}</span>
              </div>
              <p className="whitespace-pre-wrap break-words text-fg">{row.body}</p>
              {row.author_email && <p className="break-all text-sm text-muted">{row.author_email}</p>}
              <div className="flex flex-wrap gap-2">
                {row.status !== "approved" && <button type="button" disabled={busy} onClick={() => void moderate(row, "approved")}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-50">{t("reviews.approve")}</button>}
                {row.status !== "rejected" && <button type="button" disabled={busy} onClick={() => void moderate(row, "rejected")}
                  className="rounded-lg border border-line/20 px-4 py-2 text-sm text-fg disabled:opacity-50">{t(row.status === "approved" ? "reviews.unpublish" : "reviews.reject")}</button>}
              </div>
            </article>)}
          </div>}
        {totalPages > 1 && <div className="flex items-center gap-3 text-sm text-fg">
          <button type="button" disabled={busy || page === 0} onClick={() => { setLoading(true); setPage(p => p - 1); }}>{t("reviews.previous")}</button>
          <span>{page + 1} / {totalPages}</span>
          <button type="button" disabled={busy || page + 1 >= totalPages} onClick={() => { setLoading(true); setPage(p => p + 1); }}>{t("reviews.next")}</button>
        </div>}
      </>}
    </div>
  );
}
