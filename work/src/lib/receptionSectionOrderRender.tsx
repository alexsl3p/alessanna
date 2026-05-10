import { Fragment, type ReactNode } from "react";
import type { ReceptionSectionId } from "./receptionLayout";

/** Склеивает подряд идущие «календарь» и «ближайшие» в одну строку из двух колонок на md+. */
export function renderReceptionSectionOrder(
  order: ReceptionSectionId[],
  sections: Record<ReceptionSectionId, ReactNode | null>,
): ReactNode {
  const chunks: ReactNode[] = [];
  let i = 0;
  while (i < order.length) {
    const id = order[i]!;
    const next = order[i + 1];
    const paired =
      (id === "calendar" && next === "upcoming") || (id === "upcoming" && next === "calendar");
    if (paired) {
      const left = sections[id];
      const right = sections[next!];
      if (left != null || right != null) {
        chunks.push(
          <div key={`cal-up-${i}`} className="grid gap-4 md:grid-cols-[1.45fr_1fr] md:gap-5">
            {left}
            {right}
          </div>,
        );
      }
      i += 2;
      continue;
    }
    const one = sections[id];
    if (one != null) chunks.push(<Fragment key={id}>{one}</Fragment>);
    i += 1;
  }
  return <>{chunks}</>;
}
