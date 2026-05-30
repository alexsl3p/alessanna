import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { TFunction } from "i18next";

export type ServicePickRow = {
  id: string;
  name: string;
  durationMin: number;
  priceEur: number | null;
  priceMaxEur?: number | null;
  categoryName?: string | null;
  /** Публичный URL картинки услуги (если появится в каталоге). */
  thumbUrl?: string | null;
  /** Запасной «значок» слева (эмодзи), если нет thumbUrl. */
  thumbEmoji?: string | null;
};

type Props = {
  items: ServicePickRow[];
  selectedId: string;
  onSelect: (id: string) => void;
  t: TFunction;
  /** Уникальный ключ для localStorage (не смешивать разные экраны). */
  storageKey: string;
  /** Подсветка «подходит мастеру» — звёздочка в карточке. */
  markedIds?: Set<string>;
  /** Показать заголовки групп по categoryName. */
  groupByCategory?: boolean;
  priceUnknownLabel: string;
  minLabel: string;
  /** Ограничение высоты скролла (tailwind-класс). */
  listMaxClassName?: string;
  /** Более плотный вид (модалка). */
  compact?: boolean;
  /**
   * Компактные ряды с миниатюрой слева (эмодзи или thumbUrl) — быстрая запись / планшет.
   */
  tileThumbnails?: boolean;
  /** Не показывать цену в карточке (публичная онлайн-запись). */
  hidePrices?: boolean;
};

function lsRecent(key: string): string[] {
  try {
    const raw = localStorage.getItem(`${key}:recent`);
    if (!raw) return [];
    const a = JSON.parse(raw) as unknown;
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveRecent(key: string, ids: string[]) {
  try {
    localStorage.setItem(`${key}:recent`, JSON.stringify(ids.slice(0, 18)));
  } catch {
    /* ignore */
  }
}

function lsPop(key: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(`${key}:pop`);
    if (!raw) return {};
    const o = JSON.parse(raw) as unknown;
    return o && typeof o === "object" ? (o as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function savePop(key: string, o: Record<string, number>) {
  try {
    localStorage.setItem(`${key}:pop`, JSON.stringify(o));
  } catch {
    /* ignore */
  }
}

function bumpUsage(storageKey: string, id: string) {
  const prev = lsRecent(storageKey).filter((x) => x !== id);
  saveRecent(storageKey, [id, ...prev]);
  const pop = lsPop(storageKey);
  pop[id] = (pop[id] ?? 0) + 1;
  savePop(storageKey, pop);
}

function ServiceTileThumb({
  thumbUrl,
  emoji,
  selected,
  checkIcon,
}: {
  thumbUrl?: string | null;
  emoji: string;
  selected: boolean;
  checkIcon: ReactNode;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const url = thumbUrl?.trim() ?? "";
  const showImg = url.length > 0 && !imgFailed;

  return (
    <div className="relative h-[52px] w-[52px] shrink-0 overflow-hidden rounded-xl border border-white/12 bg-gradient-to-br from-white/[0.12] to-black/25">
      {showImg ? (
        <img
          src={url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setImgFailed(true)}
        />
      ) : null}
      <span
        className={`absolute inset-0 flex items-center justify-center text-2xl leading-none ${showImg ? "sr-only" : ""}`}
        aria-hidden={showImg}
      >
        {emoji}
      </span>
      {selected ? (
        <span
          className="absolute bottom-0.5 right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-sky-500 text-white shadow-md"
          aria-hidden
        >
          {checkIcon}
        </span>
      ) : null}
    </div>
  );
}

export function ServiceListPicker({
  items,
  selectedId,
  onSelect,
  t,
  storageKey,
  markedIds,
  groupByCategory = false,
  priceUnknownLabel,
  minLabel,
  listMaxClassName = "max-h-[min(58vh,560px)]",
  compact = false,
  tileThumbnails = false,
  hidePrices = false,
}: Props) {
  const [query, setQuery] = useState("");
  const [tick, setTick] = useState(0);

  const recent = useMemo(() => lsRecent(storageKey), [storageKey, tick]);
  const pop = useMemo(() => lsPop(storageKey), [storageKey, tick]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((s) => {
      const blob = `${s.name} ${s.categoryName ?? ""}`.toLowerCase();
      return blob.includes(q);
    });
  }, [items, query]);

  const sorted = useMemo(() => {
    const recentIdx = (id: string) => {
      const i = recent.indexOf(id);
      return i === -1 ? 9999 : i;
    };
    return [...filtered].sort((a, b) => {
      const ra = recentIdx(a.id);
      const rb = recentIdx(b.id);
      if (ra !== rb) return ra - rb;
      const pa = pop[a.id] ?? 0;
      const pb = pop[b.id] ?? 0;
      if (pb !== pa) return pb - pa;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  }, [filtered, recent, pop]);

  const grouped = useMemo(() => {
    if (!groupByCategory) return null;
    const map = new Map<string, ServicePickRow[]>();
    for (const s of sorted) {
      const g = (s.categoryName?.trim() || t("servicePicker.groupOther")).trim();
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(s);
    }
    return Array.from(map.entries()).sort((a, b) =>
      a[0].localeCompare(b[0], undefined, { sensitivity: "base" }),
    );
  }, [sorted, groupByCategory, t]);

  const pick = useCallback(
    (id: string) => {
      bumpUsage(storageKey, id);
      setTick((x) => x + 1);
      onSelect(id);
    },
    [onSelect, storageKey],
  );

  const cardCls = (sel: boolean) =>
    [
      "flex w-full min-h-[76px] items-stretch gap-3 rounded-xl border-2 px-4 py-3 text-left transition",
      compact ? "min-h-[68px] px-3 py-2.5" : "",
      sel
        ? "border-sky-400 bg-sky-500/[0.14] shadow-[0_0_28px_rgba(56,189,248,0.18)] ring-1 ring-sky-400/35"
        : "border-white/10 bg-white/[0.04] hover:border-violet-400/45 hover:bg-white/[0.07] hover:shadow-[0_0_26px_rgba(139,92,246,0.12)] active:scale-[0.99]",
    ].join(" ");

  const tileCardCls = (sel: boolean) =>
    [
      "flex w-full min-h-[56px] items-center gap-2.5 rounded-xl border-2 px-2.5 py-2 text-left transition",
      sel
        ? "border-sky-400 bg-sky-500/[0.12] shadow-[0_0_20px_rgba(56,189,248,0.14)] ring-1 ring-sky-400/30"
        : "border-white/10 bg-white/[0.05] hover:border-violet-400/40 hover:bg-white/[0.08] active:scale-[0.99]",
    ].join(" ");

  const chevronWrapCls = tileThumbnails
    ? "rounded-full border border-white/10 bg-white/[0.06] p-1.5 text-zinc-400"
    : `rounded-xl border border-white/10 bg-white/[0.06] text-zinc-400 ${compact ? "p-1.5" : "p-2.5"}`;
  const chevronSize = tileThumbnails ? 18 : compact ? 18 : 22;

  const renderCard = (s: ServicePickRow) => {
    const sel = s.id === selectedId;
    const mark = markedIds?.has(s.id);
    const fmtEur = (v: number) =>
      Number.isInteger(v) ? `${v}` : v.toFixed(2).replace(".", ",");
    const priceStr = hidePrices
      ? ""
      : s.priceEur != null
        ? s.priceMaxEur && s.priceMaxEur > s.priceEur
          ? `${fmtEur(s.priceEur)}–${fmtEur(s.priceMaxEur)} €`
          : `${fmtEur(s.priceEur)} €`
        : priceUnknownLabel;
    const emoji = (s.thumbEmoji?.trim() || "📋").slice(0, 4);

    const metaStandard =
      hidePrices && s.durationMin <= 0 ? null : (
        <p className={`mt-0.5 text-zinc-400 ${compact ? "text-xs" : "text-sm"}`}>
          {hidePrices ? (
            s.durationMin > 0 ? (
              <>
                {s.durationMin} {minLabel}
              </>
            ) : null
          ) : (
            <>
              {s.durationMin > 0 ? (
                <>
                  {s.durationMin} {minLabel}
                  <span className="text-zinc-600"> · </span>
                </>
              ) : null}
              {priceStr}
            </>
          )}
        </p>
      );

    const metaTile =
      hidePrices && s.durationMin <= 0 ? null : (
        <p className="mt-0.5 text-xs leading-snug text-zinc-400">
          {hidePrices ? (
            s.durationMin > 0 ? (
              <>
                {s.durationMin} {minLabel}
              </>
            ) : null
          ) : (
            <>
              {s.durationMin > 0 ? (
                <>
                  {s.durationMin} {minLabel}
                  <span className="text-zinc-600"> · </span>
                </>
              ) : null}
              {priceStr}
            </>
          )}
        </p>
      );

    if (tileThumbnails) {
      const check = (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
          <path
            d="M20 6L9 17l-5-5"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
      return (
        <button key={s.id} type="button" onClick={() => pick(s.id)} className={tileCardCls(sel)}>
          <ServiceTileThumb thumbUrl={s.thumbUrl} emoji={emoji} selected={sel} checkIcon={check} />
          <div className="min-w-0 flex-1 py-0.5">
            <p className="text-base font-semibold leading-snug text-white">
              {mark ? <span className="mr-1 text-amber-300" aria-hidden>★</span> : null}
              {s.name}
            </p>
            {metaTile}
          </div>
          <div className="flex shrink-0 items-center">
            <span className={chevronWrapCls} aria-hidden>
              <svg width={chevronSize} height={chevronSize} viewBox="0 0 24 24" fill="none">
                <path
                  d="M9 18l6-6-6-6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </div>
        </button>
      );
    }

    return (
      <button key={s.id} type="button" onClick={() => pick(s.id)} className={cardCls(sel)}>
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <div className="flex items-start gap-2">
            {sel ? (
              <span
                className="mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-500/90 text-white shadow-[0_0_12px_rgba(56,189,248,0.5)]"
                aria-hidden
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M20 6L9 17l-5-5"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            ) : (
              <span className="mt-1.5 h-6 w-6 shrink-0 rounded-full border border-white/15 bg-white/[0.06]" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <p className={`font-semibold leading-snug text-white ${compact ? "text-base" : "text-lg"}`}>
                {mark ? <span className="mr-1 text-amber-300" aria-hidden>★</span> : null}
                {s.name}
              </p>
              {metaStandard}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center">
          <span className={chevronWrapCls} aria-hidden>
            <svg width={chevronSize} height={chevronSize} viewBox="0 0 24 24" fill="none">
              <path
                d="M9 18l6-6-6-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-3">
      <div
        className={`sticky top-0 z-20 space-y-3 bg-zinc-950/95 pb-2 pt-1 backdrop-blur-md ${compact ? "" : "-mx-1 px-1"}`}
      >
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("servicePicker.searchPlaceholder")}
          autoComplete="off"
          className={`w-full rounded-2xl border border-white/15 bg-black/50 text-white placeholder:text-zinc-600 focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/25 ${
            compact ? "h-11 px-3 text-sm" : "h-14 px-4 text-lg"
          }`}
        />
      </div>

      <div className={`${tileThumbnails ? "space-y-1.5" : "space-y-2"} overflow-y-auto scroll-smooth ${listMaxClassName}`}>
        {sorted.length === 0 ? (
          <p className="py-10 text-center text-zinc-500">{t("servicePicker.noMatch")}</p>
        ) : grouped ? (
          grouped.map(([title, rows]) => (
            <div key={title} className={tileThumbnails ? "space-y-1.5" : "space-y-2"}>
              <p className={`sticky top-0 z-10 bg-zinc-950/90 py-1 text-zinc-500 backdrop-blur ${compact ? "text-xs" : "text-sm"}`}>
                {title}
              </p>
              <div className={tileThumbnails ? "space-y-1.5" : "space-y-2"}>{rows.map(renderCard)}</div>
            </div>
          ))
        ) : (
          <div className={tileThumbnails ? "space-y-1.5" : "space-y-2"}>{sorted.map(renderCard)}</div>
        )}
      </div>
    </div>
  );
}
