import type { AppointmentRow } from "../types/database";

const CLOSED_PLACEHOLDER = "— Закрыто —";

export function receptionBlockTitle(appt: AppointmentRow): string {
  const fallback = appt.note === "block_personal" ? "Личные дела" : CLOSED_PLACEHOLDER;
  const name = appt.client_name?.trim();
  return name && name !== CLOSED_PLACEHOLDER ? name : fallback;
}
