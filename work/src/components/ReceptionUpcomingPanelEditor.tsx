import { useTranslation } from "react-i18next";
import type {
  ReceptionUpcomingDensity,
  ReceptionUpcomingPanelConfig,
  ReceptionUpcomingContentWidth,
} from "../lib/receptionLayout";

export function ReceptionUpcomingPanelEditor({
  config,
  onChange,
  disabled,
}: {
  config: ReceptionUpcomingPanelConfig;
  onChange: (next: ReceptionUpcomingPanelConfig) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4 rounded-xl border border-zinc-700/80 bg-zinc-950/40 p-3 md:p-4">
      <div>
        <p className="text-sm font-medium text-zinc-200">{t("reception.layout.upcoming.title")}</p>
        <p className="mt-1 text-xs text-zinc-500">{t("reception.layout.upcoming.subtitle")}</p>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-zinc-400">{t("reception.layout.upcoming.pairColumn")}</p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["narrow", t("reception.layout.upcoming.pairNarrow")] as const,
              ["medium", t("reception.layout.upcoming.pairMedium")] as const,
              ["full", t("reception.layout.upcoming.pairFull")] as const,
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ ...config, pairColumn: key as ReceptionUpcomingContentWidth })}
              className={
                `rounded-lg border px-2.5 py-1 text-xs md:text-sm ` +
                (config.pairColumn === key
                  ? "border-amber-500/50 bg-amber-950/35 text-amber-100"
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200")
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-zinc-400">{t("reception.layout.upcoming.density")}</p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["comfortable", t("reception.layout.masters.densityComfortable")] as const,
              ["compact", t("reception.layout.masters.densityCompact")] as const,
              ["dense", t("reception.layout.masters.densityDense")] as const,
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => onChange({ ...config, density: key as ReceptionUpcomingDensity })}
              className={
                `rounded-lg border px-2.5 py-1 text-xs ` +
                (config.density === key
                  ? "border-sky-500/50 bg-sky-950/30 text-sky-100"
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-500")
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
