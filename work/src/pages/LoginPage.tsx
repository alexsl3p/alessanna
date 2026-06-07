import { FormEvent, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth, type LoginResult } from "../context/AuthContext";
import { isSupabaseConfigured } from "../lib/supabase";
import { LanguageSwitcher } from "../components/LanguageSwitcher";

type Step = "phone" | "pin";
type EmailMode = "login" | "register" | "forgot";
type LoginMode = "phone" | "email";

function publicSiteUrl(): string {
  const fromEnv = (import.meta as unknown as { env?: { VITE_PUBLIC_SITE_URL?: string } }).env
    ?.VITE_PUBLIC_SITE_URL;
  return (fromEnv || "https://alessannailu.com").replace(/\/+$/, "");
}

/** Разрешаем только относительные пути приложения (без open-redirect). */
function safePostLoginPath(nextParam: string | null): string {
  if (!nextParam) return "/";
  const raw = nextParam.trim();
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  const pathOnly = raw.split(/[?#]/)[0] ?? "";
  if (!pathOnly.startsWith("/") || pathOnly.startsWith("//")) return "/";
  if (/[\s\\]/.test(pathOnly)) return "/";
  return raw;
}

export function LoginPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const nextAfterLogin = safePostLoginPath(searchParams.get("next"));
  const { staffMember, login, loginWithEmail, registerWithEmail, sendPasswordReset, hasDeviceToken, loading } = useAuth();
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [showWorkLoginForm, setShowWorkLoginForm] = useState(false);
  const [showTrustedHint, setShowTrustedHint] = useState(false);
  const [step, setStep] = useState<Step>("phone");
  const [staffName, setStaffName] = useState<string>("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [redirectAfterLogin, setRedirectAfterLogin] = useState(nextAfterLogin);
  const [loginMode, setLoginMode] = useState<LoginMode>("phone");
  const [emailMode, setEmailMode] = useState<EmailMode>("login");
  const [email, setEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailConfirm, setEmailConfirm] = useState("");
  const [forgotSent, setForgotSent] = useState(false);

  if (staffMember) return <Navigate to={redirectAfterLogin} replace />;
  /* Пока AuthContext пробует автологин по device_token — не показываем форму,
   * чтобы не моргала. Успешный автологин сам редиректнет выше по условию. */
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-zinc-500">
        {t("common.loading")}
      </div>
    );
  }

  function applyResult(r: LoginResult) {
    if (r.ok) return;
    if ("status" in r) {
      if (r.status === "requires_pin") {
        setStaffName(r.staffName ?? "");
        setStep("pin");
        setError("");
        return;
      }
      if (r.status === "invalid_pin") {
        setError(t("auth.error.invalidPin", { defaultValue: "Неверный PIN" }));
        return;
      }
      if (r.status === "pin_locked") {
        setError(
          t("auth.error.pinLocked", {
            defaultValue: "Слишком много неудач. Попробуйте через 15 минут.",
          })
        );
        return;
      }
      if (r.status === "access_denied") {
        setError(t("auth.error.accessDenied", { defaultValue: "Доступ запрещён" }));
        return;
      }
    }
    if ("displayError" in r && r.displayError) {
      setError(r.displayError);
      return;
    }
    if ("errorKey" in r && r.errorKey) {
      setError(
        "message" in r && r.message
          ? t(r.errorKey, { message: r.message })
          : t(r.errorKey)
      );
      return;
    }
    setError(t("auth.error.accessDenied", { defaultValue: "Доступ запрещён" }));
  }

  async function onSubmitPhone(e: FormEvent) {
    e.preventDefault();
    setError("");
    setPending(true);
    const r = await login({ phone });
    setPending(false);
    applyResult(r);
  }

  async function onSubmitPin(e: FormEvent) {
    e.preventDefault();
    setError("");
    setPending(true);
    /* Каждый успешный логин по PIN = новое доверенное устройство.
     * Это убирает занудный шаг «поставь галочку, если хочешь без PIN»:
     * админ может в любой момент отозвать в /profile/security или вообще
     * перевести устройство в статус «салонного». См. 047_salon_devices.sql. */
    const deviceLabel =
      typeof navigator !== "undefined"
        ? navigator.userAgent.split(" ").slice(-2).join(" ").slice(0, 60)
        : "Браузер CRM";
    const r = await login({
      phone,
      pin,
      trustThisDevice: true,
      deviceLabel,
    });
    setPending(false);
    applyResult(r);
  }

  async function onEmailLogin(e: FormEvent) {
    e.preventDefault();
    setError("");
    setPending(true);
    const r = await loginWithEmail(email.trim(), emailPassword);
    setPending(false);
    if (!r.ok) applyResult(r);
  }

  async function onEmailRegister(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (emailPassword.length < 6) {
      setError("Минимум 6 символов.");
      return;
    }
    if (emailPassword !== emailConfirm) {
      setError("Пароли не совпадают.");
      return;
    }
    setPending(true);
    const r = await registerWithEmail(email.trim(), emailPassword);
    setPending(false);
    if (!r.ok) applyResult(r);
  }

  async function onForgot(e: FormEvent) {
    e.preventDefault();
    setError("");
    setPending(true);
    const { error: err } = await sendPasswordReset(email.trim());
    setPending(false);
    if (err) {
      setError(err);
    } else {
      setForgotSent(true);
    }
  }

  function backToPhone() {
    setStep("phone");
    setPin("");
    setError("");
  }

  function focusPhoneInput() {
    setShowWorkLoginForm(true);
    setShowTrustedHint(true);
    const el = document.getElementById("phone");
    if (el && "focus" in el) {
      (el as HTMLInputElement).focus();
    }
  }

  function switchToEmail(prefillEmail?: string, redirect?: string) {
    setLoginMode("email");
    setEmailMode("login");
    setRedirectAfterLogin(redirect ?? nextAfterLogin);
    setEmail(prefillEmail ?? "");
    setError("");
    setForgotSent(false);
  }

  function switchToPhone() {
    setLoginMode("phone");
    setError("");
    setForgotSent(false);
  }

  const emailSubtitle =
    emailMode === "forgot"
      ? "Сброс пароля"
      : emailMode === "register"
        ? "Регистрация"
        : "Вход для мастеров";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black px-4">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-950 p-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{t("brand")}</p>
        <h1 className="mt-2 text-xl font-semibold text-white">{t("login.title")}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {step === "phone" && loginMode === "email"
            ? emailSubtitle
            : step === "phone"
              ? t("login.subtitle")
              : t("login.pinSubtitle", {
                  defaultValue: "Введите PIN для доступа",
                  name: staffName,
                })}
        </p>

        {/* ── Кнопки выбора режима ── */}
        {step === "phone" && loginMode === "phone" && (
          <div className="mt-4 grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={focusPhoneInput}
              className="rounded-lg border border-sky-700/60 bg-sky-950/30 px-3 py-2 text-left text-sm text-sky-100 hover:bg-sky-900/40"
            >
              1. CRM / Рабочая панель
              <span className="mt-0.5 block text-xs text-sky-200/70">
                Стандартный вход по телефону ниже
              </span>
            </button>
            <button
              type="button"
              onClick={() => switchToEmail("alessanna.ilusalong@gmail.com", "/reception")}
              className="rounded-lg border border-emerald-700/50 bg-emerald-950/30 px-3 py-2 text-left text-sm text-emerald-100 hover:bg-emerald-900/40"
            >
              2. Ресепшен
              <span className="mt-0.5 block text-xs text-emerald-200/60">
                Общий аккаунт для сотрудников ресепшена
              </span>
            </button>
            <button
              type="button"
              onClick={() => switchToEmail("", "/")}
              className="rounded-lg border border-violet-700/50 bg-violet-950/30 px-3 py-2 text-left text-sm text-violet-100 hover:bg-violet-900/40"
            >
              3. Мастера
              <span className="mt-0.5 block text-xs text-violet-200/60">
                Личный вход по email для мастеров
              </span>
            </button>
            <a
              href={publicSiteUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-zinc-700 bg-zinc-900/40 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800/60"
            >
              4. Сайт
              <span className="mt-0.5 block text-xs text-zinc-400">
                Открыть публичный сайт в новой вкладке
              </span>
            </a>
          </div>
        )}

        {!isSupabaseConfigured() && (
          <p className="mt-4 rounded-lg border border-amber-900/50 bg-amber-950/30 p-3 text-sm text-amber-200/90">
            {t("login.configLine")}
          </p>
        )}

        {step === "phone" && loginMode === "phone" && showWorkLoginForm && hasDeviceToken && showTrustedHint && (
          <p className="mt-4 rounded-lg border border-emerald-900/40 bg-emerald-950/20 p-2.5 text-xs text-emerald-200/80">
            {t("login.trustedDeviceHint", {
              defaultValue: "Это устройство добавлено в доверенные — войдёте без PIN",
            })}
          </p>
        )}

        {/* ── Форма телефон → (PIN) ── */}
        {step === "phone" && loginMode === "phone" && showWorkLoginForm && (
          <form onSubmit={onSubmitPhone} className="mt-6 space-y-4">
            <div>
              <label htmlFor="phone" className="block text-xs font-medium text-zinc-500">
                {t("login.phone")}
              </label>
              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                placeholder={t("login.placeholder")}
                aria-describedby="phone-hint"
                required
              />
              <p id="phone-hint" className="mt-1 text-xs text-zinc-600">
                {t("login.hint")}
              </p>
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-lg bg-sky-600 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
            >
              {pending ? t("login.signingIn") : t("login.button")}
            </button>
          </form>
        )}

        {step === "pin" && (
          <form onSubmit={onSubmitPin} className="mt-6 space-y-4">
            <div>
              <label htmlFor="pin" className="block text-xs font-medium text-zinc-500">
                {t("login.pin", { defaultValue: "PIN" })}
                {staffName && <span className="ml-2 text-zinc-600">· {staffName}</span>}
              </label>
              <input
                id="pin"
                type="password"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 12))}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-center text-lg tracking-[0.5em] text-white focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                placeholder="••••"
                minLength={4}
                maxLength={12}
                autoFocus
                required
              />
            </div>

            <p className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-xs text-zinc-400">
              {t("login.deviceWillBeRemembered", {
                defaultValue:
                  "Это устройство автоматически запомнится — в следующий раз войдёте без PIN. Отозвать можно в Профиле → Безопасность.",
              })}
            </p>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={backToPhone}
                className="flex-1 rounded-lg border border-zinc-700 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-900"
              >
                {t("common.back", { defaultValue: "Назад" })}
              </button>
              <button
                type="submit"
                disabled={pending || pin.length < 4}
                className="flex-[2] rounded-lg bg-sky-600 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
              >
                {pending ? t("login.signingIn") : t("login.button")}
              </button>
            </div>
          </form>
        )}

        {/* ── Email login / register / forgot ── */}
        {step === "phone" && loginMode === "email" && (
          <div className="mt-6">
            {forgotSent ? (
              <div className="space-y-4">
                <p className="rounded-lg border border-emerald-800/50 bg-emerald-950/30 p-3 text-sm text-emerald-200">
                  Письмо со ссылкой для сброса пароля отправлено на {email}. Проверьте почту.
                </p>
                <button
                  type="button"
                  onClick={() => { setForgotSent(false); setEmailMode("login"); }}
                  className="w-full rounded-lg border border-zinc-700 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-900"
                >
                  Назад ко входу
                </button>
              </div>
            ) : emailMode === "forgot" ? (
              <form onSubmit={(e) => void onForgot(e)} className="space-y-4">
                <div>
                  <label htmlFor="email-forgot" className="block text-xs font-medium text-zinc-500">
                    Email
                  </label>
                  <input
                    id="email-forgot"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    placeholder="master@example.com"
                    required
                  />
                </div>
                {error && <p className="text-sm text-red-400">{error}</p>}
                <button
                  type="submit"
                  disabled={pending}
                  className="w-full rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
                >
                  {pending ? "Отправляем…" : "Отправить ссылку"}
                </button>
                <button
                  type="button"
                  onClick={() => setEmailMode("login")}
                  className="w-full rounded-lg border border-zinc-700 py-2 text-sm text-zinc-400 hover:bg-zinc-900"
                >
                  Назад ко входу
                </button>
              </form>
            ) : (
              <form
                onSubmit={(e) => void (emailMode === "login" ? onEmailLogin(e) : onEmailRegister(e))}
                className="space-y-4"
              >
                <div>
                  <label htmlFor="email-input" className="block text-xs font-medium text-zinc-500">
                    Email
                  </label>
                  <input
                    id="email-input"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    placeholder="master@example.com"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="email-password" className="block text-xs font-medium text-zinc-500">
                    Пароль
                  </label>
                  <input
                    id="email-password"
                    type="password"
                    autoComplete={emailMode === "login" ? "current-password" : "new-password"}
                    value={emailPassword}
                    onChange={(e) => setEmailPassword(e.target.value)}
                    minLength={6}
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    placeholder="••••••"
                    required
                  />
                </div>
                {emailMode === "register" && (
                  <div>
                    <label htmlFor="email-confirm" className="block text-xs font-medium text-zinc-500">
                      Повторите пароль
                    </label>
                    <input
                      id="email-confirm"
                      type="password"
                      autoComplete="new-password"
                      value={emailConfirm}
                      onChange={(e) => setEmailConfirm(e.target.value)}
                      minLength={6}
                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                      placeholder="••••••"
                      required
                    />
                  </div>
                )}

                {error && <p className="text-sm text-red-400">{error}</p>}

                <button
                  type="submit"
                  disabled={pending}
                  className="w-full rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
                >
                  {pending
                    ? "Подождите…"
                    : emailMode === "login"
                      ? "Войти"
                      : "Зарегистрироваться"}
                </button>

                <div className="flex items-center justify-between text-xs text-zinc-500">
                  {emailMode === "login" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => { setEmailMode("register"); setError(""); }}
                        className="hover:text-zinc-300"
                      >
                        Нет аккаунта? Зарегистрироваться
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEmailMode("forgot"); setError(""); }}
                        className="hover:text-zinc-300"
                      >
                        Забыли пароль?
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setEmailMode("login"); setError(""); }}
                      className="hover:text-zinc-300"
                    >
                      Уже есть аккаунт? Войти
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={switchToPhone}
                  className="w-full rounded-lg border border-zinc-800 py-2 text-xs text-zinc-600 hover:text-zinc-400"
                >
                  ← Назад к выбору режима
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
