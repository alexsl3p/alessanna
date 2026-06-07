import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { supabaseAuth } from "../lib/supabaseAuth";
import { hasStaffRole, isWorkerOnlyView, normalizeStaffMember } from "../lib/roles";
import type { StaffMember } from "../types/database";

const STORAGE_KEY = "alessanna_crm_staff";
const DEVICE_TOKEN_KEY = "alessanna_crm_device_token";

/**
 * Результат login. Кроме привычного { ok: true } теперь может быть состояние
 * `requires_pin` — фронт показывает поле PIN и повторно вызывает login(phone, pin).
 */
export type LoginResult =
  | { ok: true; mode?: string }
  | { ok: false; status: "requires_pin"; staffName?: string }
  | { ok: false; status: "invalid_pin" }
  | { ok: false; status: "pin_locked"; lockedUntil?: string }
  | { ok: false; status: "access_denied" }
  | { ok: false; errorKey?: string; message?: string; displayError?: string };

export type LoginInput = {
  phone: string;
  pin?: string;
  trustThisDevice?: boolean;
  deviceLabel?: string;
};

type AuthState = {
  staffMember: StaffMember | null;
  loading: boolean;
  login: (input: LoginInput | string) => Promise<LoginResult>;
  loginWithEmail: (email: string, password: string) => Promise<LoginResult>;
  registerWithEmail: (email: string, password: string) => Promise<LoginResult>;
  sendPasswordReset: (email: string) => Promise<{ error?: string }>;
  loginWithGoogle: () => Promise<void>;
  logout: () => void;
  /** Удалить device_token с этого устройства (без revoke в БД). */
  forgetThisDevice: () => void;
  /** Есть ли локально сохранённый device_token. */
  hasDeviceToken: boolean;
  canManage: boolean;
  isAdmin: boolean;
  /** True when real (non-preview) role is worker-only. */
  isWorkerOnly: boolean;
  isReceptionMode: boolean;
  setReceptionMode: (on: boolean) => void;
};

const AuthContext = createContext<AuthState | null>(null);

function parseStored(): StaffMember | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeStaffMember(JSON.parse(raw) as StaffMember);
  } catch {
    return null;
  }
}

function staffTableRowToMember(raw: Record<string, unknown>): StaffMember {
  return normalizeStaffMember({
    id: String(raw.id),
    name: String(raw.name ?? ""),
    phone: raw.phone != null ? String(raw.phone) : null,
    is_active: raw.is_active,
    role: raw.role ?? raw.roles,
  } as unknown as StaffMember);
}

function readDeviceToken(): string | null {
  try {
    return localStorage.getItem(DEVICE_TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeDeviceToken(token: string | null) {
  try {
    if (token) localStorage.setItem(DEVICE_TOKEN_KEY, token);
    else localStorage.removeItem(DEVICE_TOKEN_KEY);
  } catch {
    /* swallow */
  }
}

function summarizeUserAgent(): string {
  if (typeof navigator === "undefined") return "";
  // Не пишем весь UA — секретов нет, но без необходимости тащить fingerprint.
  // Ограничим длиной, чтобы не раздувать БД.
  return String(navigator.userAgent || "").slice(0, 240);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [staffMember, setStaffMember] = useState<StaffMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasDeviceToken, setHasDeviceToken] = useState(false);
  const [receptionMode, setReceptionMode] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const stored = parseStored();
      const token = readDeviceToken();
      setHasDeviceToken(Boolean(token));

      /* Если уже есть сохранённый staffMember — значит прошлую сессию завершали
       * корректно (например, пользователь свернул и открыл вкладку заново).
       * Не лезем в сеть, показываем мгновенно. */
      if (stored) {
        if (!cancelled) {
          setStaffMember(stored);
          setLoading(false);
        }
        return;
      }

      /* staffMember нет, но есть доверенное устройство → пробуем автологин.
       * Для персональных устройств backend вернёт ok+staff и мы сразу
       * попадём в CRM без формы. Для салонных — requires_phone (нужно
       * выбрать сотрудника по телефону), для инвалидированных — invalid_token
       * (затираем локальный токен, чтобы пользователь увидел нормальную форму). */
      if (token && isSupabaseConfigured()) {
        try {
          const { data, error } = await supabase.rpc("staff_login_by_device", {
            device_token: token,
            user_agent_input: summarizeUserAgent(),
          });
          if (!cancelled) {
            if (!error && data && typeof data === "object") {
              const payload = data as Record<string, unknown>;
              const status = String(payload.status ?? "");
              if (status === "ok" && payload.staff && typeof payload.staff === "object") {
                const row = staffTableRowToMember(payload.staff as Record<string, unknown>);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(row));
                setStaffMember(row);
              } else if (status === "invalid_token") {
                /* Токен уже не действителен (устройство отозвано, сотрудник
                 * деактивирован и т.п.) — чистим локально, чтобы не спамить
                 * RPC при каждом открытии вкладки. */
                writeDeviceToken(null);
                setHasDeviceToken(false);
              }
              /* requires_phone (салонное) и access_denied — оставляем всё как
               * есть: пользователь увидит форму, подпись про доверенное
               * устройство корректна (для салонных мы не теряем токен). */
            }
          }
        } catch {
          /* Сеть отвалилась — не блокируем, пользователь введёт номер руками. */
        }
      }

      /* 3) Нет ни staffMember, ни device_token — проверяем Supabase Auth сессию
       * (email-логин через PWA). Если сессия жива, получаем staff по email. */
      if (!cancelled && isSupabaseConfigured()) {
        try {
          const { data: { session } } = await supabaseAuth.auth.getSession();
          if (session) {
            const { data: staffData } = await supabaseAuth.rpc("staff_get_by_auth_email");
            const payload = (staffData ?? {}) as { status?: string; staff?: Record<string, unknown> };
            if (payload.status === "ok" && payload.staff) {
              const row = staffTableRowToMember(payload.staff);
              localStorage.setItem(STORAGE_KEY, JSON.stringify(row));
              if (!cancelled) setStaffMember(row);
            } else {
              // Supabase session exists but no matching staff row — sign out and flag error
              await supabaseAuth.auth.signOut();
              sessionStorage.setItem("google_auth_error", "no_staff");
            }
          }
        } catch {
          /* Сеть недоступна — пропускаем, пользователь войдёт вручную. */
        }
      }

      if (!cancelled) setLoading(false);
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (input: LoginInput | string): Promise<LoginResult> => {
    const normalized: LoginInput = typeof input === "string" ? { phone: input } : input;

    if (!isSupabaseConfigured()) {
      return { ok: false, errorKey: "auth.error.notConfigured" };
    }
    const cleanPhone = normalized.phone.replace(/\D/g, "");
    if (!cleanPhone) {
      return { ok: false, errorKey: "auth.error.phoneRequired" };
    }

    const deviceToken = readDeviceToken();

    const { data, error } = await supabase.rpc("staff_login", {
      phone_input: cleanPhone,
      pin_input: normalized.pin ?? null,
      device_token: deviceToken,
      trust_this_device: Boolean(normalized.trustThisDevice),
      device_label: normalized.deviceLabel ?? null,
      user_agent_input: summarizeUserAgent(),
    });

    if (error) {
      // Fallback на старый RPC для случая если миграция 041 ещё не применена
      // на каком-то окружении (dev/staging). На проде после деплоя его можно
      // удалить через несколько релизов.
      if (/staff_login.*does not exist/i.test(error.message || "")) {
        const legacy = await supabase.rpc("verify_staff_phone", { phone_input: cleanPhone });
        if (legacy.error) {
          return { ok: false, errorKey: "auth.error.rpcFailed", message: legacy.error.message };
        }
        const legacyRow = legacy.data && typeof legacy.data === "object" && "id" in legacy.data
          ? staffTableRowToMember(legacy.data as Record<string, unknown>)
          : null;
        if (!legacyRow) return { ok: false, status: "access_denied" };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyRow));
        setStaffMember(legacyRow);
        return { ok: true, mode: "legacy_verify_staff_phone" };
      }
      console.error(error);
      return { ok: false, errorKey: "auth.error.rpcFailed", message: error.message };
    }

    const payload = (data ?? {}) as Record<string, unknown>;
    const status = String(payload.status ?? "");

    if (status === "requires_pin") {
      return {
        ok: false,
        status: "requires_pin",
        staffName: typeof payload.staff_name === "string" ? payload.staff_name : undefined,
      };
    }
    if (status === "invalid_pin") return { ok: false, status: "invalid_pin" };
    if (status === "pin_locked") {
      return {
        ok: false,
        status: "pin_locked",
        lockedUntil: typeof payload.locked_until === "string" ? payload.locked_until : undefined,
      };
    }
    if (status === "access_denied") return { ok: false, status: "access_denied" };

    if (status !== "ok") {
      return { ok: false, errorKey: "auth.error.accessDenied" };
    }

    const staffRaw = payload.staff;
    if (!staffRaw || typeof staffRaw !== "object") {
      return { ok: false, errorKey: "auth.error.accessDenied" };
    }
    const row = staffTableRowToMember(staffRaw as Record<string, unknown>);

    if (typeof payload.new_device_token === "string" && payload.new_device_token) {
      writeDeviceToken(payload.new_device_token);
      setHasDeviceToken(true);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(row));
    setStaffMember(row);
    return { ok: true, mode: typeof payload.mode === "string" ? payload.mode : undefined };
  }, []);

  const loginWithEmail = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    if (!isSupabaseConfigured()) return { ok: false, errorKey: "auth.error.notConfigured" };
    const { error: authErr } = await supabaseAuth.auth.signInWithPassword({ email, password });
    if (authErr) return { ok: false, message: authErr.message, displayError: authErr.message };
    const { data: staffData, error: rpcErr } = await supabaseAuth.rpc("staff_get_by_auth_email");
    if (rpcErr) {
      await supabaseAuth.auth.signOut();
      return { ok: false, message: rpcErr.message };
    }
    const payload = (staffData ?? {}) as { status?: string; staff?: Record<string, unknown> };
    if (payload.status !== "ok" || !payload.staff) {
      await supabaseAuth.auth.signOut();
      return { ok: false, status: "access_denied" };
    }
    const row = staffTableRowToMember(payload.staff);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(row));
    setStaffMember(row);
    return { ok: true };
  }, []);

  const registerWithEmail = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    if (!isSupabaseConfigured()) return { ok: false, errorKey: "auth.error.notConfigured" };
    const { error: signUpErr } = await supabaseAuth.auth.signUp({ email, password });
    if (signUpErr) return { ok: false, message: signUpErr.message, displayError: signUpErr.message };
    /* Если подтверждение email включено в Supabase — пользователь получит письмо.
     * Пробуем сразу войти: если email не подтверждён, signInWithPassword вернёт ошибку. */
    const { error: loginErr } = await supabaseAuth.auth.signInWithPassword({ email, password });
    if (loginErr) {
      return { ok: false, displayError: "Проверьте почту — вам отправлено письмо с подтверждением." };
    }
    const { data: staffData } = await supabaseAuth.rpc("staff_get_by_auth_email");
    const payload = (staffData ?? {}) as { status?: string; staff?: Record<string, unknown> };
    if (payload.status !== "ok" || !payload.staff) {
      await supabaseAuth.auth.signOut();
      return { ok: false, displayError: "Доступ не настроен. Обратитесь к администратору." };
    }
    const row = staffTableRowToMember(payload.staff);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(row));
    setStaffMember(row);
    return { ok: true };
  }, []);

  const loginWithGoogle = useCallback(async () => {
    await supabaseAuth.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/login` },
    });
  }, []);

  const sendPasswordReset = useCallback(async (email: string): Promise<{ error?: string }> => {
    const redirectTo = `${window.location.origin}/auth/reset-password`;
    const { error } = await supabaseAuth.auth.resetPasswordForEmail(email, { redirectTo });
    return error ? { error: error.message } : {};
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    // Внимание: device_token НЕ удаляем — это смысл «доверенного устройства».
    // Чтобы устройство «забыть», есть отдельный forgetThisDevice().
    void supabaseAuth.auth.signOut();
    setReceptionMode(false);
    setStaffMember(null);
  }, []);

  const forgetThisDevice = useCallback(() => {
    writeDeviceToken(null);
    setHasDeviceToken(false);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      staffMember,
      loading,
      login,
      loginWithEmail,
      registerWithEmail,
      sendPasswordReset,
      loginWithGoogle,
      logout,
      forgetThisDevice,
      hasDeviceToken,
      canManage: hasStaffRole(staffMember, "admin") || hasStaffRole(staffMember, "manager"),
      isAdmin: hasStaffRole(staffMember, "admin"),
      isWorkerOnly: isWorkerOnlyView(staffMember?.roles),
      isReceptionMode: receptionMode,
      setReceptionMode,
    }),
    [staffMember, loading, login, loginWithEmail, registerWithEmail, sendPasswordReset, loginWithGoogle, logout, forgetThisDevice, hasDeviceToken, receptionMode, setReceptionMode]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
