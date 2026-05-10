import {
  type ReceptionLayoutFilePayload,
  parseReceptionLayoutFile,
} from "./receptionLayout";
import { supabase } from "./supabase";

export const RECEPTION_SECTION_ORDER_SETTING_KEY = "reception_section_order";

export async function fetchReceptionLayoutFromServer(): Promise<ReceptionLayoutFilePayload | null> {
  const { data, error } = await supabase
    .from("salon_settings")
    .select("value")
    .eq("key", RECEPTION_SECTION_ORDER_SETTING_KEY)
    .maybeSingle();
  if (error || !data || data.value == null || String(data.value).trim() === "") return null;
  try {
    return parseReceptionLayoutFile(JSON.parse(String(data.value)) as unknown);
  } catch {
    return null;
  }
}

export async function saveReceptionLayoutToServer(
  payload: ReceptionLayoutFilePayload,
): Promise<{ error: string | null }> {
  const value = JSON.stringify({
    rows: payload.rows,
    masters: payload.masters,
    upcoming: payload.upcoming,
  });
  const { error } = await supabase.from("salon_settings").upsert(
    { key: RECEPTION_SECTION_ORDER_SETTING_KEY, value },
    { onConflict: "key" },
  );
  return { error: error?.message ?? null };
}
