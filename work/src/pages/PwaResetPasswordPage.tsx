import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabaseAuth } from "../lib/supabaseAuth";

export function PwaResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase puts tokens in the URL hash after redirect; getSession() processes them.
    supabaseAuth.auth.getSession().then(({ data: { session } }) => {
      setReady(!!session);
      if (!session) setError("Ссылка недействительна или устарела. Запросите сброс пароля заново.");
    });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 6) { setError("Минимум 6 символов."); return; }
    if (password !== confirm) { setError("Пароли не совпадают."); return; }
    setPending(true);
    const { error: err } = await supabaseAuth.auth.updateUser({ password });
    setPending(false);
    if (err) { setError(err.message); return; }
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4">
      <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-950 p-8">
        <h1 className="text-xl font-semibold text-white">Новый пароль</h1>
        <p className="mt-1 text-sm text-zinc-500">Придумайте пароль для входа в приложение.</p>

        {error && <p className="mt-4 rounded-lg bg-rose-950/50 px-3 py-2 text-sm text-rose-300">{error}</p>}

        {ready && (
          <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Новый пароль</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
                autoFocus
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-zinc-500"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Подтвердите пароль</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-zinc-500"
              />
            </div>
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              {pending ? "Сохраняем…" : "Сохранить пароль"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
