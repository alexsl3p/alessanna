import { Fragment, type ReactNode } from "react";
import type {
  ReceptionRows,
  ReceptionSectionId,
  ReceptionUpcomingPanelConfig,
} from "./receptionLayout";

/** Сетка двух блоков в строке; для пары «ближайшие + мастера» — узкая колонка списка. */
function pairGridClass(
  a: ReceptionSectionId,
  b: ReceptionSectionId,
  upcoming?: ReceptionUpcomingPanelConfig,
): string {
  const calUp =
    (a === "calendar" && b === "upcoming") || (a === "upcoming" && b === "calendar");
  if (calUp) {
    return "grid gap-4 md:grid-cols-[1.45fr_1fr] md:gap-5 md:items-start";
  }

  const upMast =
    (a === "upcoming" && b === "masters") || (a === "masters" && b === "upcoming");
  if (upMast) {
    const w = upcoming?.pairColumn ?? "narrow";
    if (w === "full") {
      return "grid gap-4 md:grid-cols-2 md:gap-5 md:items-start";
    }
    const upcomingFirst = a === "upcoming";
    if (upcomingFirst) {
      return w === "medium"
        ? "grid gap-4 md:grid-cols-[minmax(0,26rem)_1fr] md:gap-5 md:items-start"
        : "grid gap-4 md:grid-cols-[minmax(0,18rem)_1fr] md:gap-5 md:items-start";
    }
    return w === "medium"
      ? "grid gap-4 md:grid-cols-[1fr_minmax(0,26rem)] md:gap-5 md:items-start"
      : "grid gap-4 md:grid-cols-[1fr_minmax(0,18rem)] md:gap-5 md:items-start";
  }

  return "grid gap-4 md:grid-cols-2 md:gap-5 md:items-start";
}

export function renderReceptionRows(
  rows: ReceptionRows,
  sections: Record<ReceptionSectionId, ReactNode | null>,
  layout?: { upcoming: ReceptionUpcomingPanelConfig },
): ReactNode {
  const chunks: ReactNode[] = [];
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i]!;
    if (cells.length === 2) {
      const [a, b] = cells;
      const left = sections[a];
      const right = sections[b];
      if (left != null || right != null) {
        chunks.push(
          <div key={`${a}|${b}-${i}`} className={pairGridClass(a, b, layout?.upcoming)}>
            {left}
            {right}
          </div>,
        );
      }
    } else {
      const id = cells[0]!;
      const one = sections[id];
      if (one != null) chunks.push(<Fragment key={`${id}-${i}`}>{one}</Fragment>);
    }
  }
  return <>{chunks}</>;
}
