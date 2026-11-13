import type { AppointmentRow } from "../types/database";

/** Эти строки лежат в БД (appointments.client_name) у block_time-записей —
 *  это данные, а не UI-текст, поэтому они остаются русскими. Для показа
 *  подставляем переведённые подписи через `labels`. */
export const CLOSED_PLACEHOLDER = "— Закрыто —";
export const PERSONAL_PLACEHOLDER = "Личные дела";

export type BlockTitleLabels = { closed?: string; personal?: string };

export function receptionBlockTitle(appt: AppointmentRow, labels?: BlockTitleLabels): string {
  const closed = labels?.closed ?? CLOSED_PLACEHOLDER;
  const personal = labels?.personal ?? PERSONAL_PLACEHOLDER;
  const fallback = appt.note === "block_personal" ? personal : closed;
  const name = appt.client_name?.trim();
  if (!name || name === CLOSED_PLACEHOLDER || name === PERSONAL_PLACEHOLDER) return fallback;
  return name;
}
