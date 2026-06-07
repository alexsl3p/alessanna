import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { supabase } from "../lib/supabase";
import { useBookingsRealtime } from "../hooks/useSalonRealtime";
import type { ClientRow } from "../types/database";
import { clientDisplayName, fetchClientAutocompleteEnabled } from "../lib/clientLink";

type VisitRow = {
  id: string;
  created_at: string | null;
  status: string;
  client_name: string;
  appointment_services: Array<{
    id: string;
    start_time: string;
    end_time: string;
    staff: { name: string } | null;
    service_listings: { name: string } | null;
  }> | null;
};

type MetricMode = "visits" | "spent";
type PeriodKey = "all" | "year" | "month" | "custom";

type MetricLine = {
  appointmentId: string;
  startTime: string | null;
  services: Array<{ name: string; price: number | null }>;
};

function digitsOnly(phone: string | null | undefined): string {
  return String(phone ?? "").replace(/\D/g, "");
}

function firstRecord<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T | undefined) ?? null;
  if (value && typeof value === "object") return value as T;
  return null;
}

function ymd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function eur(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value);
}

function periodBounds(period: PeriodKey, customFrom: string, customTo: string) {
  const now = new Date();
  if (period === "year") {
    const from = new Date(now);
    from.setFullYear(from.getFullYear() - 1);
    return { from: from.toISOString(), to: now.toISOString() };
  }
  if (period === "month") {
    const from = new Date(now);
    from.setMonth(from.getMonth() - 1);
    return { from: from.toISOString(), to: now.toISOString() };
  }
  if (period === "custom") {
    const from = customFrom ? new Date(`${customFrom}T00:00:00`) : null;
    const to = customTo ? new Date(`${customTo}T23:59:59.999`) : null;
    return {
      from: from && Number.isFinite(from.getTime()) ? from.toISOString() : null,
      to: to && Number.isFinite(to.getTime()) ? to.toISOString() : null,
    };
  }
  return { from: null, to: null };
}

export function ClientsPage() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingVisits, setLoadingVisits] = useState(false);
  const [listErr, setListErr] = useState<string | null>(null);
  const [autocompleteEnabled, setAutocompleteEnabled] = useState(true);
  const [savingSetting, setSavingSetting] = useState(false);

  const [metricClient, setMetricClient] = useState<ClientRow | null>(null);
  const [metricMode, setMetricMode] = useState<MetricMode>("visits");
  const [metricPeriod, setMetricPeriod] = useState<PeriodKey>("all");
  const [metricLines, setMetricLines] = useState<MetricLine[]>([]);
  const [metricLoading, setMetricLoading] = useState(false);
  const [metricErr, setMetricErr] = useState<string | null>(null);
  const [customFrom, setCustomFrom] = useState(() => ymd(new Date()));
  const [customTo, setCustomTo] = useState(() => ymd(new Date()));

  const metricSummary = useMemo(() => {
    const visitsCount = metricLines.length;
    const spent = metricLines.reduce(
      (sum, line) => sum + line.services.reduce((serviceSum, service) => serviceSum + (service.price ?? 0), 0),
      0,
    );
    return { visitsCount, spent };
  }, [metricLines]);

  const loadClients = useCallback(async () => {
    setLoading(true);
    setListErr(null);
    const { data, error } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
    if (error) setListErr(error.message);
    else if (data) setClients(data as ClientRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadClients();
    void fetchClientAutocompleteEnabled().then(setAutocompleteEnabled);
  }, [loadClients]);

  useBookingsRealtime(loadClients);

  const loadClientMetrics = useCallback(async () => {
    if (!metricClient) return;
    setMetricLoading(true);
    setMetricErr(null);
    const digits = digitsOnly(metricClient.phone);
    const bounds = periodBounds(metricPeriod, customFrom, customTo);
    let q = supabase
      .from("appointments")
      .select(
        `
        id, start_time, status, client_phone,
        appointment_services (
          id,
          start_time,
          service_listings ( name, price )
        )
      `,
      )
      .neq("status", "cancelled")
      .order("start_time", { ascending: false })
      .limit(1000);
    if (digits.length >= 5) {
      q = q.or(`client_id.eq.${metricClient.id},client_phone.eq.${digits}`);
    } else {
      q = q.eq("client_id", metricClient.id);
    }
    if (bounds.from) q = q.gte("start_time", bounds.from);
    if (bounds.to) q = q.lte("start_time", bounds.to);
    const { data, error } = await q;
    setMetricLoading(false);
    if (error) {
      setMetricErr(error.message);
      setMetricLines([]);
      return;
    }
    const seen = new Set<string>();
    const nextLines: MetricLine[] = ((data ?? []) as Array<Record<string, unknown>>)
      .map((row) => {
        const services = Array.isArray(row.appointment_services)
          ? (row.appointment_services as Array<Record<string, unknown>>).map((svc) => {
              const listing = firstRecord<{ name?: unknown; price?: unknown }>(svc.service_listings);
              const priceRaw = listing?.price;
              const price = typeof priceRaw === "number" ? priceRaw : priceRaw == null ? null : Number(priceRaw);
              return {
                name: String(listing?.name ?? "Услуга"),
                price: Number.isFinite(price) ? price : null,
              };
            })
          : [];
        return {
          appointmentId: String(row.id ?? ""),
          startTime: row.start_time == null ? null : String(row.start_time),
          services,
        };
      })
      .filter((line) => {
        if (!line.appointmentId || seen.has(line.appointmentId)) return false;
        seen.add(line.appointmentId);
        return true;
      });
    setMetricLines(nextLines);
  }, [customFrom, customTo, metricClient, metricPeriod]);

  useEffect(() => {
    void loadClientMetrics();
  }, [loadClientMetrics]);

  async function loadVisits(clientId: string, clientPhone: string | null) {
    setLoadingVisits(true);
    const digits = digitsOnly(clientPhone);
    let q = supabase
      .from("appointments")
      .select(
        `
        id, created_at, status, client_name,
        appointment_services (
          id, start_time, end_time,
          staff ( name ),
          service_listings ( name )
        )
      `,
      )
      .order("created_at", { ascending: false });
    if (digits.length >= 5) {
      q = q.or(`client_id.eq.${clientId},client_phone.eq.${digits}`);
    } else {
      q = q.eq("client_id", clientId);
    }
    const { data, error } = await q;
    if (!error && data) {
      const seen = new Set<string>();
      const normalized: VisitRow[] = (data as Array<Record<string, unknown>>).map((row) => {
        const services = Array.isArray(row.appointment_services)
          ? (row.appointment_services as Array<Record<string, unknown>>).map((svc) => {
              const staff = firstRecord<{ name?: unknown }>(svc.staff);
              const listing = firstRecord<{ name?: unknown }>(svc.service_listings);
              return {
                id: String(svc.id ?? ""),
                start_time: String(svc.start_time ?? ""),
                end_time: String(svc.end_time ?? ""),
                staff: staff ? { name: String(staff.name ?? "") } : null,
                service_listings: listing ? { name: String(listing.name ?? "") } : null,
              };
            })
          : null;
        return {
          id: String(row.id ?? ""),
          created_at: row.created_at == null ? null : String(row.created_at),
          status: String(row.status ?? ""),
          client_name: String(row.client_name ?? ""),
          appointment_services: services,
        };
      });
      setVisits(
        normalized.filter((row) => {
          if (seen.has(row.id)) return false;
          seen.add(row.id);
          return true;
        }),
      );
    } else {
      setVisits([]);
    }
    setLoadingVisits(false);
  }

  function toggle(client: ClientRow) {
    if (expanded === client.id) {
      setExpanded(null);
      setVisits([]);
      return;
    }
    setExpanded(client.id);
    void loadVisits(client.id, client.phone);
  }

  async function saveAutocompleteEnabled(nextEnabled: boolean) {
    setSavingSetting(true);
    const { error } = await supabase
      .from("salon_settings")
      .upsert(
        { key: "crm_client_autocomplete_enabled", value: nextEnabled ? "true" : "false" },
        { onConflict: "key" },
      );
    setSavingSetting(false);
    if (error) {
      setListErr(error.message);
      return;
    }
    setAutocompleteEnabled(nextEnabled);
  }

  function openMetric(client: ClientRow, mode: MetricMode) {
    setMetricClient(client);
    setMetricMode(mode);
    setMetricPeriod("all");
    setMetricErr(null);
  }

  if (loading) return <p className="text-muted">Загрузка...</p>;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-fg">Клиенты</h1>
          <p className="text-sm text-muted">Наши клиенты</p>
        </div>
        <label className="flex max-w-md items-start justify-between gap-4 rounded-lg border border-line/15 bg-panel/60 p-3">
          <span>
            <span className="block text-sm font-medium text-fg">Подключить к календарю</span>
            <span className="mt-1 block text-xs text-muted">
              В форме записи будет выпадать список клиентов по имени, телефону или email.
            </span>
          </span>
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 accent-emerald-500"
            checked={autocompleteEnabled}
            disabled={savingSetting}
            onChange={(e) => void saveAutocompleteEnabled(e.target.checked)}
          />
        </label>
      </header>

      {listErr && (
        <p className="rounded border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-200">{listErr}</p>
      )}

      <ul className="divide-y divide-line/15 rounded-xl border border-line/15">
        {clients.length === 0 && <li className="px-4 py-6 text-sm text-muted">Клиентов пока нет.</li>}
        {clients.map((client) => (
          <li key={client.id} className="bg-panel/50">
            <button
              type="button"
              onClick={() => toggle(client)}
              className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-surface/80"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-fg">{clientDisplayName(client) || client.name}</span>
                {client.email && <span className="mt-0.5 block truncate text-xs text-muted">{client.email}</span>}
              </span>
              <span className="font-mono text-xs text-muted">{client.phone ?? "—"}</span>
            </button>
            <div className="flex flex-wrap gap-2 border-t border-line/10 px-4 py-3">
              <button
                type="button"
                onClick={() => openMetric(client, "visits")}
                className="rounded-lg border border-line/20 bg-canvas/40 px-3 py-2 text-sm text-fg hover:bg-surface"
              >
                История посещений
              </button>
              <button
                type="button"
                onClick={() => openMetric(client, "spent")}
                className="rounded-lg border border-line/20 bg-canvas/40 px-3 py-2 text-sm text-fg hover:bg-surface"
              >
                Потраченная сумма
              </button>
            </div>
            {expanded === client.id && (
              <div className="border-t border-line/15 bg-canvas/40 px-4 py-3">
                {loadingVisits ? (
                  <p className="text-sm text-muted">Загрузка...</p>
                ) : visits.length === 0 ? (
                  <p className="text-sm text-muted">Посещений пока нет.</p>
                ) : (
                  <ul className="space-y-3 text-sm">
                    {visits.map((visit) => (
                      <li key={visit.id} className="rounded-lg border border-line/15 p-3">
                        <p className="text-xs text-muted">
                          {visit.created_at ? format(parseISO(visit.created_at), "d MMM yyyy HH:mm") : "—"} ·{" "}
                          {visit.status}
                        </p>
                        <ul className="mt-2 space-y-1 text-fg">
                          {(visit.appointment_services ?? []).map((line) => (
                            <li key={line.id}>
                              {line.service_listings?.name ?? "—"} · {line.staff?.name ?? "—"} ·{" "}
                              {format(parseISO(line.start_time), "HH:mm")}-
                              {format(parseISO(line.end_time), "HH:mm")}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {metricClient && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={() => setMetricClient(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-line/15 bg-panel p-5 shadow-2xl"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-fg">
                  {metricMode === "visits" ? "История посещений" : "Потраченная сумма"}
                </h2>
                <p className="mt-1 text-sm text-muted">{clientDisplayName(metricClient) || metricClient.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setMetricClient(null)}
                className="rounded-lg border border-line/15 px-3 py-1.5 text-sm text-muted hover:bg-surface hover:text-fg"
              >
                Закрыть
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {(
                [
                  ["all", "За все время"],
                  ["year", "За год"],
                  ["month", "За месяц"],
                  ["custom", "Свой период"],
                ] as Array<[PeriodKey, string]>
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMetricPeriod(key)}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${
                    metricPeriod === key
                      ? "border-gold/50 bg-gold/15 text-gold"
                      : "border-line/15 text-muted hover:bg-surface hover:text-fg"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {metricPeriod === "custom" && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-muted">
                  С
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-line/15 bg-canvas px-3 py-2 text-sm text-fg"
                  />
                </label>
                <label className="text-xs text-muted">
                  По
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-line/15 bg-canvas px-3 py-2 text-sm text-fg"
                  />
                </label>
              </div>
            )}

            <div className="mt-4 rounded-lg border border-line/15 bg-canvas/40 p-4">
              <p className="text-xs uppercase tracking-wide text-muted">
                {metricMode === "visits" ? "Количество посещений" : "Сумма в евро"}
              </p>
              <p className="mt-1 text-3xl font-semibold text-fg">
                {metricLoading ? "..." : metricMode === "visits" ? metricSummary.visitsCount : eur(metricSummary.spent)}
              </p>
            </div>

            {metricErr && <p className="mt-3 text-sm text-red-300">{metricErr}</p>}

            <ul className="mt-4 space-y-2">
              {!metricLoading && metricLines.length === 0 && (
                <li className="rounded-lg border border-line/15 px-3 py-4 text-sm text-muted">
                  Нет записей за выбранный период.
                </li>
              )}
              {metricLines.map((line) => {
                const total = line.services.reduce((sum, service) => sum + (service.price ?? 0), 0);
                return (
                  <li key={line.appointmentId} className="rounded-lg border border-line/15 p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-fg">
                        {line.startTime ? format(parseISO(line.startTime), "d MMM yyyy HH:mm") : "—"}
                      </span>
                      <span className="font-medium text-fg">{eur(total)}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {line.services.map((service) => service.name).join(", ") || "Услуга"}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
