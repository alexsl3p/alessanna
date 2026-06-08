import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabase";
import { useBookingsRealtime } from "../hooks/useSalonRealtime";
import { useAuth } from "../context/AuthContext";
import { useEffectiveRole } from "../context/EffectiveRoleContext";
import type { AppointmentRow } from "../types/database";

/* ============================================================
 * BookingsPage — список всех записей.
 *
 * UX-прокачка:
 *   • Поиск по имени клиента / телефону / услуге / мастеру / заметке.
 *   • Сегментированный фильтр статуса: Все / Активные / Ожидают /
 *     Подтверждены / Отменены. По умолчанию «Активные» (= не cancelled),
 *     потому что 99% времени отменённые не нужны и зашумляют список.
 *   • Empty/Filtered-empty/Error состояния — раньше на пустой ответ или
 *     сетевую ошибку показывалась пустая таблица без объяснения.
 *   • Счётчик «X из N» — сразу видно, отрезала фильтрация половину или
 *     вообще ничего не нашлось.
 * ============================================================ */

type StaffName = { id: string; name: string };
type ServiceName = { id: string; name: string };

type StatusFilter = "all_active" | "client" | "block" | "all" | "pending" | "confirmed" | "cancelled";
type SourceSort = "none" | "asc" | "desc";
type CreatedSort = "none" | "asc" | "desc";

const STATUS_FILTERS: StatusFilter[] = [
  "all_active",
  "client",
  "block",
  "pending",
  "confirmed",
  "cancelled",
  "all",
];

function passesFilter(filter: StatusFilter, row: AppointmentRow): boolean {
  const isBlock = row.note === "block_time" || row.note === "block_personal";
  if (filter === "all") return true;
  if (filter === "all_active") return row.status !== "cancelled";
  if (filter === "client") return row.status !== "cancelled" && !isBlock;
  if (filter === "block") return isBlock && row.status !== "cancelled";
  return row.status === filter;
}

export function BookingsPage() {
  const { t } = useTranslation();
  const { staffMember, isAdmin } = useAuth();
  const { canManage, isWorkerOnlyEffective } = useEffectiveRole();

  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [staffNames, setStaffNames] = useState<StaffName[]>([]);
  const [services, setServices] = useState<ServiceName[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  /* фильтры/поиск */
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all_active");
  const [sourceSort, setSourceSort] = useState<SourceSort>("none");
  const [createdSort, setCreatedSort] = useState<CreatedSort>("desc");
  const [siteAlerts, setSiteAlerts] = useState<
    Array<{ id: string; client: string; when: string; staffId: string }>
  >([]);

  const load = useCallback(async () => {
    setLoadError(null);
    let q = supabase.from("appointments").select("*").order("start_time", { ascending: false });
    if (isWorkerOnlyEffective && staffMember) {
      q = q.eq("staff_id", staffMember.id);
    }
    /* `appointments.service_id` мог быть записан из двух каталогов: legacy `services`
     * (bigint) и актуальный `service_listings` (uuid). Грузим оба источника и мёржим
     * по стринговому id — иначе в колонке «Услуга» у новых записей всегда прочерк. */
    try {
      const [b, e, legacySvc, listingSvc] = await Promise.all([
        q,
        supabase.from("staff").select("id,name"),
        supabase.from("services").select("id,name_et"),
        supabase.from("service_listings").select("id,name"),
      ]);
      if (b.error) throw b.error;
      if (b.data) setRows(b.data as AppointmentRow[]);
      if (e.data) setStaffNames(e.data as StaffName[]);
      const merged: ServiceName[] = [];
      if (legacySvc.data) {
        for (const r of legacySvc.data as Array<{ id: unknown; name_et: string | null }>) {
          merged.push({ id: String(r.id), name: r.name_et ?? "" });
        }
      }
      if (listingSvc.data) {
        for (const r of listingSvc.data as Array<{ id: unknown; name: string | null }>) {
          merged.push({ id: String(r.id), name: r.name ?? "" });
        }
      }
      setServices(merged);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : t("bookings.loadError"));
    } finally {
      setLoading(false);
    }
  }, [isWorkerOnlyEffective, staffMember, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useBookingsRealtime(load);

  useEffect(() => {
    const channel = supabase
      .channel("crm-bookings-site-alerts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "appointments" },
        (payload) => {
          const row = payload.new as Partial<AppointmentRow>;
          const source = String(row.source ?? "").toLowerCase();
          if (source !== "public_site") return;
          const id = String(row.id ?? "");
          if (!id) return;
          const client = String(row.client_name ?? "Новый клиент");
          const when = String(row.start_time ?? "");
          const staffId = String(row.staff_id ?? "");
          setSiteAlerts((prev) => [{ id, client, when, staffId }, ...prev].slice(0, 5));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  /* Подготовка отфильтрованного списка. */
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = rows.filter((b) => {
      if (!passesFilter(statusFilter, b)) return false;
      if (!q) return true;
      const em = staffNames.find((x) => x.id === b.staff_id);
      const sv = services.find((x) => x.id === String(b.service_id));
      const haystack = [
        b.client_name,
        b.client_phone,
        em?.name,
        sv?.name,
        b.note,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
    const rank = (source: string | null | undefined): number => {
      const s = String(source ?? "").toLowerCase();
      if (s === "public_site") return 0;
      if (s === "reception") return 1;
      if (s === "crm") return 2;
      return 3;
    };
    let sorted = [...filtered];
    if (sourceSort !== "none") {
      sorted = sorted.sort((a, b) => {
        const diff = rank(a.source) - rank(b.source);
        return sourceSort === "asc" ? diff : -diff;
      });
    }
    if (createdSort !== "none") {
      sorted = sorted.sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return createdSort === "desc" ? tb - ta : ta - tb;
      });
    }
    return sorted;
  }, [rows, search, statusFilter, staffNames, services, sourceSort, createdSort]);

  const filtersActive = statusFilter !== "all_active" || search.trim().length > 0;

  async function cancelBooking(id: string) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    if (canManage) {
      /* ok */
    } else if (isWorkerOnlyEffective && staffMember && row.staff_id === staffMember.id) {
      /* ok */
    } else {
      return;
    }
    let q = supabase.from("appointments").update({ status: "cancelled" }).eq("id", id);
    if (!canManage && isWorkerOnlyEffective && staffMember) {
      q = q.eq("staff_id", staffMember.id);
    }
    await q;
    load();
  }

  async function deleteBooking(id: string) {
    if (!isAdmin) return;
    const ok = window.confirm(
      t("bookings.deleteConfirm", {
        defaultValue: "Удалить запись безвозвратно? Это действие нельзя отменить.",
      })
    );
    if (!ok) return;
    const { error } = await supabase.from("appointments").delete().eq("id", id);
    if (error) {
      window.alert(
        t("bookings.deleteFailed", {
          defaultValue: "Не удалось удалить запись. Проверьте права и попробуйте снова.",
        })
      );
      return;
    }
    await load();
  }

  async function updateBookingSource(id: string, source: "public_site" | "reception" | "crm") {
    let q = supabase.from("appointments").update({ source }).eq("id", id);
    if (!canManage && isWorkerOnlyEffective && staffMember) {
      q = q.eq("staff_id", staffMember.id);
    }
    const { error } = await q;
    if (error) {
      window.alert(
        t("bookings.sourceUpdateFailed", {
          defaultValue: "Не удалось изменить источник записи. Проверьте права и попробуйте снова.",
        }),
      );
      return;
    }
    await load();
  }

  function statusLabel(status: string) {
    if (status === "pending") return t("bookings.statusPending");
    if (status === "confirmed") return t("bookings.statusConfirmed");
    if (status === "cancelled") return t("bookings.statusCancelled");
    return status;
  }

  function statusTone(status: string) {
    if (status === "pending") return "border-amber-700/60 bg-amber-950/40 text-amber-200";
    if (status === "confirmed") return "border-emerald-700/60 bg-emerald-950/40 text-emerald-200";
    if (status === "cancelled") return "border-line/20 bg-surface text-muted";
    return "border-line/20 bg-surface text-fg";
  }

  /* Источник записи (миграция 053). Цветовая схема выбрана так, чтобы
   * сразу отличать «пришёл сам через сайт» (нейтральный голубой) от
   * «принял сотрудник» (фиолетовый/изумрудный — подчёркивает участие
   * персонала). Legacy-значения отображаем серым «прочерком», чтобы не
   * путать аналитику. */
  function sourceMeta(source: string | null | undefined): {
    label: string;
    tone: string;
  } | null {
    const s = (source ?? "").toLowerCase();
    if (s === "public_site") {
      return {
        label: t("bookings.sourceSite", { defaultValue: "Сайт" }),
        tone: "border-sky-800/60 bg-sky-950/40 text-sky-200",
      };
    }
    if (s === "reception") {
      return {
        label: t("bookings.sourceReception", { defaultValue: "Ресепшен" }),
        tone: "border-violet-800/60 bg-violet-950/40 text-violet-200",
      };
    }
    if (s === "crm") {
      return {
        label: t("bookings.sourceCrm", { defaultValue: "CRM" }),
        tone: "border-emerald-800/60 bg-emerald-950/40 text-emerald-200",
      };
    }
    // Не отображаем бейдж для пустого/неизвестного — чтобы legacy-записи
    // (старая `online`/`manual`) не вводили в заблуждение.
    return null;
  }

  function filterLabel(f: StatusFilter): string {
    if (f === "all_active") return "Все активные";
    if (f === "client") return "Активные";
    if (f === "block") return "Закрытые";
    if (f === "all") return t("bookings.filterAll");
    if (f === "pending") return t("bookings.filterPending");
    if (f === "confirmed") return t("bookings.filterConfirmed");
    return t("bookings.filterCancelled");
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-fg">{t("bookings.title")}</h1>
          <p className="mt-0.5 text-sm text-muted">{t("bookings.subtitle")}</p>
        </div>
        <p className="text-xs text-muted">
          {t("bookings.counter", { shown: visible.length, total: rows.length })}
        </p>
      </header>

      {/* ── Фильтр-bar: поиск + segmented status ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("bookings.search")}
            className="w-full rounded-lg border border-line/15 bg-canvas/40 py-2 pl-9 pr-3 text-sm text-fg placeholder:text-muted focus:border-emerald-600/60 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
          />
        </div>
        <div
          role="tablist"
          aria-label={t("bookings.status")}
          className="flex flex-wrap items-center gap-1 rounded-lg border border-line/15 bg-black/30 p-1"
        >
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={statusFilter === f}
              onClick={() => setStatusFilter(f)}
              className={
                "rounded-md px-2.5 py-1 text-xs font-medium transition " +
                (statusFilter === f
                  ? "bg-zinc-200 text-black"
                  : "text-muted hover:bg-surface hover:text-fg")
              }
            >
              {filterLabel(f)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Состояния ── */}
      {siteAlerts.length > 0 && (
        <div className="space-y-2">
          {siteAlerts.map((a) => {
            const staff = staffNames.find((s) => s.id === a.staffId);
            const whenLabel = a.when ? format(parseISO(a.when), "yyyy-MM-dd HH:mm") : t("common.dash");
            return (
              <div
                key={a.id}
                className="rounded-lg border border-sky-800/50 bg-sky-950/30 px-3 py-2 text-sm text-sky-100"
              >
                {t("bookings.siteBookingAlert", {
                  defaultValue:
                    "Новая запись с сайта: {{client}}, {{when}}{{staff}}.",
                  client: a.client,
                  when: whenLabel,
                  staff: staff ? `, ${staff.name}` : "",
                })}
              </div>
            );
          })}
        </div>
      )}

      {loadError ? (
        <div className="rounded-lg border border-red-900/50 bg-red-950/40 p-4 text-sm text-red-200">
          <p className="font-medium">{t("bookings.loadError")}</p>
          <p className="mt-1 text-xs text-red-300/80">{loadError}</p>
        </div>
      ) : loading ? (
        <p className="text-muted">{t("common.loading")}</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line/15 bg-panel/40 p-10 text-center text-sm text-muted">
          {t("bookings.empty")}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line/15 bg-panel/40 p-10 text-center text-sm text-muted">
          <p>{t("bookings.emptyFiltered")}</p>
          {filtersActive && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setStatusFilter("all_active");
              }}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-line/20 bg-surface px-3 py-1.5 text-xs text-fg transition hover:border-line/25 hover:text-fg"
            >
              {t("bookings.resetFilters")}
            </button>
          )}
        </div>
      ) : statusFilter === "block" ? (
        /* block_time rows — show «Закрыто» instead of service name */
        <div className="overflow-x-auto rounded-xl border border-line/15">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="border-b border-line/15 bg-panel text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">{t("bookings.when")}</th>
                <th className="px-4 py-3">{t("bookings.staff")}</th>
                <th className="px-4 py-3">Причина / название</th>
                <th className="px-4 py-3">Длительность</th>
                {canManage && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-line/15">
              {visible.map((b) => {
                const em = staffNames.find((x) => x.id === b.staff_id);
                const start = b.start_time ? parseISO(b.start_time) : null;
                const end = b.end_time ? parseISO(b.end_time) : null;
                const durMin = start && end ? Math.round((end.getTime() - start.getTime()) / 60000) : null;
                return (
                  <tr key={b.id} className="bg-panel/80">
                    <td className="px-4 py-3 text-fg">
                      {start ? format(start, "yyyy-MM-dd HH:mm") : t("common.dash")}
                    </td>
                    <td className="px-4 py-3 text-muted">{em?.name ?? t("common.dash")}</td>
                    <td className="px-4 py-3 text-fg">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${b.note === "block_personal" ? "border-violet-700/50 bg-violet-950/40 text-violet-300" : "border-rose-700/50 bg-rose-950/40 text-rose-300"}`}>
                          {b.note === "block_personal" ? "Личные дела" : "Закрыто"}
                        </span>
                        {b.client_name && b.client_name !== "— Закрыто —" && (
                          <span className="text-sm text-muted">{b.client_name}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {durMin != null ? `${durMin} мин` : t("common.dash")}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => void cancelBooking(b.id)}
                          className="text-xs text-red-400 hover:text-red-300">
                          {t("bookings.cancel")}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line/15">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line/15 bg-panel text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">{t("bookings.when")}</th>
                <th className="px-4 py-3">{t("bookings.client")}</th>
                <th className="px-4 py-3">{t("bookings.staff")}</th>
                <th className="px-4 py-3">{t("bookings.service")}</th>
                <th className="px-4 py-3">{t("bookings.status")}</th>
                <th className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() =>
                      setCreatedSort((prev) =>
                        prev === "none" ? "desc" : prev === "desc" ? "asc" : "none",
                      )
                    }
                    className="inline-flex items-center gap-1 text-xs uppercase tracking-wide text-muted hover:text-fg"
                    title="Сортировать по дате добавления"
                  >
                    Добавлена
                    <span className="text-[10px] text-muted">
                      {createdSort === "asc" ? "↑" : createdSort === "desc" ? "↓" : "↕"}
                    </span>
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() =>
                      setSourceSort((prev) =>
                        prev === "none" ? "asc" : prev === "asc" ? "desc" : "none",
                      )
                    }
                    className="inline-flex items-center gap-1 text-xs uppercase tracking-wide text-muted hover:text-fg"
                    title={t("bookings.sortSource", { defaultValue: "Сортировать по источнику" })}
                  >
                    {t("bookings.source", { defaultValue: "Источник" })}
                    <span className="text-[10px] text-muted">
                      {sourceSort === "asc" ? "↑" : sourceSort === "desc" ? "↓" : "↕"}
                    </span>
                  </button>
                </th>
                {(canManage || (isWorkerOnlyEffective && staffMember)) && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-line/15">
              {visible.map((b) => {
                const when = b.start_time;
                const em = staffNames.find((x) => x.id === b.staff_id);
                const sv = services.find((x) => x.id === String(b.service_id));
                const src = sourceMeta(b.source);
                const acceptedBy = b.created_by_staff_id
                  ? staffNames.find((x) => x.id === b.created_by_staff_id)
                  : null;
                return (
                  <tr key={b.id} className="bg-panel/80">
                    <td className="px-4 py-3 text-fg">
                      {when ? format(parseISO(when), "yyyy-MM-dd HH:mm") : t("common.dash")}
                    </td>
                    <td className="px-4 py-3 text-fg">
                      <div>{b.client_name}</div>
                      {b.client_phone && (
                        <div className="mt-0.5 text-[11px] text-muted">{b.client_phone}</div>
                      )}
                      {b.note && (
                        <div className="mt-0.5 text-xs italic text-muted" title={b.note}>
                          &laquo;{b.note.length > 80 ? b.note.slice(0, 80) + "…" : b.note}&raquo;
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">{em?.name ?? t("common.dash")}</td>
                    <td className="px-4 py-3 text-muted">{sv?.name || t("common.dash")}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide " +
                          statusTone(b.status)
                        }
                      >
                        {statusLabel(b.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted text-xs">
                      {b.created_at ? format(parseISO(b.created_at), "yyyy-MM-dd HH:mm") : t("common.dash")}
                    </td>
                    <td className="px-4 py-3">
                      {canManage ? (
                        <select
                          value={String((b.source ?? "crm").toLowerCase())}
                          onChange={(e) =>
                            void updateBookingSource(
                              b.id,
                              e.target.value as "public_site" | "reception" | "crm",
                            )
                          }
                          className="rounded-md border border-line/20 bg-surface px-2 py-1 text-xs text-fg focus:border-emerald-600/60 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
                        >
                          <option value="public_site">
                            {t("bookings.sourceSite", { defaultValue: "Сайт" })}
                          </option>
                          <option value="reception">
                            {t("bookings.sourceReception", { defaultValue: "Ресепшен" })}
                          </option>
                          <option value="crm">{t("bookings.sourceCrm", { defaultValue: "CRM" })}</option>
                        </select>
                      ) : src ? (
                        <span
                          className={
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide " +
                            src.tone
                          }
                          title={
                            acceptedBy
                              ? t("bookings.acceptedBy", {
                                  defaultValue: "Принял: {{name}}",
                                  name: acceptedBy.name,
                                })
                              : undefined
                          }
                        >
                          {src.label}
                        </span>
                      ) : (
                        <span className="text-muted">{t("common.dash")}</span>
                      )}
                      {acceptedBy && (
                        <div className="mt-0.5 text-[10px] text-muted">
                          {t("bookings.acceptedBy", {
                            defaultValue: "Принял: {{name}}",
                            name: acceptedBy.name,
                          })}
                        </div>
                      )}
                    </td>
                    {(canManage || (isWorkerOnlyEffective && staffMember)) && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {b.status !== "cancelled" && (
                            <button
                              type="button"
                              onClick={() => void cancelBooking(b.id)}
                              className="text-xs text-red-400 hover:text-red-300"
                            >
                              {t("bookings.cancel")}
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => void deleteBooking(b.id)}
                              className="text-xs text-muted hover:text-red-300"
                            >
                              {t("bookings.delete", { defaultValue: "Удалить" })}
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
