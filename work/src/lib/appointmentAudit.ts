import { supabase } from "./supabase";
import { supabaseAuth } from "./supabaseAuth";
import type { StaffMember } from "../types/database";

const SESSION_KEY = "alessanna_appointment_audit_session";

type AuditSession = { staffId: string; token: string };

function readAuditSession(): AuditSession | null {
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null");
    return typeof value?.staffId === "string" && typeof value?.token === "string" ? value : null;
  } catch { return null; }
}

export function saveAppointmentAuditSession(payload: Record<string, unknown>) {
  const staff = payload.staff as { id?: string } | undefined;
  try {
    if (typeof payload.audit_session_token === "string" && staff?.id) {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ staffId: staff.id, token: payload.audit_session_token }));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  } catch { /* Cancellation will require a fresh authenticated session. */ }
}

export function clearAppointmentAuditSession() {
  const session = readAuditSession();
  try { localStorage.removeItem(SESSION_KEY); } catch { /* storage unavailable */ }
  if (session) void (async () => {
    try { await supabase.rpc("appointment_audit_logout", { p_session_token: session.token }); }
    catch { /* Local sign-out still completes if the network is unavailable. */ }
  })();
}

async function cancellationCredentials(staff: StaffMember) {
  const cached = readAuditSession();
  if (cached?.staffId === staff.id) return { client: supabase, token: cached.token };
  const { data: { session } } = await supabaseAuth.auth.getSession();
  if (session) return { client: supabaseAuth, token: null };

  // Upgrade an already-open pre-migration tab using the existing login rules.
  // The server issues the actor token; never use a local staff ID as proof.
  let deviceToken: string | null = null;
  try { deviceToken = localStorage.getItem("alessanna_crm_device_token"); } catch { /* unavailable */ }
  const { data, error } = await supabase.rpc("staff_login", {
    phone_input: staff.phone ?? "",
    device_token: deviceToken,
  });
  if (error || data?.status !== "ok" || data?.staff?.id !== staff.id || !data?.audit_session_token) {
    throw new Error("appointment_auth_required");
  }
  saveAppointmentAuditSession(data);
  return { client: supabase, token: String(data.audit_session_token) };
}

export async function cancelAppointment(appointmentId: string, staff: StaffMember | null): Promise<void> {
  if (!staff) throw new Error("appointment_auth_required");
  for (let attempt = 0; attempt < 2; attempt++) {
    const { client, token } = await cancellationCredentials(staff);
    const { data, error } = await client.rpc("appointment_cancel", {
      p_appointment_id: appointmentId,
      p_staff_id: staff.id,
      p_session_token: token,
    });
    if (error?.message.includes("appointment_auth_required") && token && attempt === 0) {
      clearAppointmentAuditSession();
      continue;
    }
    if (error) throw new Error(error.message.includes("appointment_auth_required")
      ? "appointment_auth_required" : "appointment_cancel_failed");
    if (data?.status !== "ok" && data?.status !== "already_cancelled") {
      throw new Error("appointment_cancel_failed");
    }
    return;
  }
  throw new Error("appointment_auth_required");
}
