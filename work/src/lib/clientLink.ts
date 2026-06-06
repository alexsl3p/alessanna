import { supabase } from "./supabase";
import type { ClientRow } from "../types/database";

export type ClientSuggestion = Pick<ClientRow, "id" | "name" | "last_name" | "phone" | "email">;

function digitsOnly(phone: string | null | undefined): string {
  return String(phone ?? "").replace(/\D/g, "");
}

export function clientDisplayName(client: Pick<ClientRow, "name" | "last_name">): string {
  return [client.name, client.last_name].map((x) => String(x ?? "").trim()).filter(Boolean).join(" ").trim();
}

export async function fetchClientAutocompleteEnabled(): Promise<boolean> {
  const { data, error } = await supabase
    .from("salon_settings")
    .select("value")
    .eq("key", "crm_client_autocomplete_enabled")
    .maybeSingle();
  if (error) return true;
  const value = String((data as { value?: unknown } | null)?.value ?? "true").trim().toLowerCase();
  return value !== "false" && value !== "0" && value !== "off";
}

export async function searchClients(term: string): Promise<ClientSuggestion[]> {
  const q = term.trim();
  if (q.length < 2) return [];
  const digits = digitsOnly(q);
  const parts = [`name.ilike.%${q}%`, `last_name.ilike.%${q}%`, `email.ilike.%${q}%`];
  if (digits.length >= 2) parts.push(`phone.ilike.%${digits}%`);
  const { data, error } = await supabase
    .from("clients")
    .select("id,name,last_name,phone,email")
    .or(parts.join(","))
    .order("created_at", { ascending: false })
    .limit(8);
  if (error || !data) return [];
  return data as ClientSuggestion[];
}

/**
 * Find or create `clients` row by normalized phone (≥5 digits). Returns null if phone unusable.
 */
export async function resolveClientIdForVisit(
  clientName: string,
  clientPhone: string | null | undefined,
  clientEmail?: string | null | undefined
): Promise<string | null> {
  const name = clientName.trim();
  if (!name) return null;
  const digits = digitsOnly(clientPhone);
  const email = String(clientEmail ?? "").trim().toLowerCase();
  if (digits.length < 5 && !email) return null;

  let existing: { id: string } | null = null;
  if (digits.length >= 5) {
    const { data, error: findErr } = await supabase
      .from("clients")
      .select("id")
      .eq("phone", digits)
      .maybeSingle();
    if (findErr) return null;
    existing = data as { id: string } | null;
  } else if (email) {
    const { data, error: findErr } = await supabase
      .from("clients")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (findErr) return null;
    existing = data as { id: string } | null;
  }

  if (existing?.id) {
    const updatePayload: Partial<ClientRow> = { name };
    if (digits.length >= 5) updatePayload.phone = digits;
    if (email) updatePayload.email = email;
    await supabase
      .from("clients")
      .update(updatePayload)
      .eq("id", existing.id);
    return existing.id as string;
  }

  const { data: ins, error: insErr } = await supabase
    .from("clients")
    .insert({ name, phone: digits.length >= 5 ? digits : null, email: email || null })
    .select("id")
    .single();
  if (insErr || !ins?.id) return null;
  return ins.id as string;
}

/** @deprecated Prefer `resolveClientIdForVisit` + insert `appointments.client_id` in one step. */
export async function linkClientToAppointment(params: {
  appointmentId: string;
  clientName: string;
  clientPhone: string | null | undefined;
}): Promise<void> {
  const clientId = await resolveClientIdForVisit(params.clientName, params.clientPhone);
  if (!clientId) return;
  await supabase.from("appointments").update({ client_id: clientId }).eq("id", params.appointmentId);
}
