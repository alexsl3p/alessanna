import { useEffect, useState } from "react";

function detect() {
  if (typeof navigator === "undefined") return { os: "other", browser: "other" } as const;
  const ua = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  const isAndroid = /android/i.test(ua);
  const isSamsung = /samsungbrowser/i.test(ua);
  const isFirefox = /firefox/i.test(ua);
  const isChromium = /chrome|chromium|crios/i.test(ua) && !/edg\//i.test(ua);
  const isEdge = /edg\//i.test(ua);
  const isSafari = /safari/i.test(ua) && !isChromium && !isEdge && !isSamsung && !isFirefox;
  const os = isIOS ? "ios" : isAndroid ? "android" : "desktop";
  const browser = isSamsung ? "samsung" : isFirefox ? "firefox" : isEdge ? "edge" : isChromium ? "chrome" : isSafari ? "safari" : "other";
  return { os, browser } as const;
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

type Step = { icon: string; text: string };

function getSteps(os: string, browser: string): Step[] | null {
  if (os === "ios" && browser === "safari") {
    return [
      { icon: "safari-share", text: "Нажмите кнопку «Поделиться» внизу экрана (прямоугольник со стрелкой вверх)" },
      { icon: "add-home", text: "Прокрутите вниз и выберите «На экран «Домой»»" },
      { icon: "confirm", text: "Нажмите «Добавить» в правом верхнем углу" },
    ];
  }
  if (os === "ios") {
    return [
      { icon: "info", text: "Для установки на iPhone/iPad нужен браузер Safari — другие браузеры не поддерживают установку" },
      { icon: "safari-share", text: "Откройте эту страницу в Safari, нажмите «Поделиться» и выберите «На экран «Домой»»" },
    ];
  }
  if (browser === "samsung") {
    return [
      { icon: "menu", text: "Нажмите кнопку «⋮» (меню) в правом верхнем углу" },
      { icon: "add-home", text: "Выберите «Добавить страницу на...» → «Экран Apps»" },
    ];
  }
  if (browser === "firefox" && os === "android") {
    return [
      { icon: "menu", text: "Нажмите кнопку «⋮» (меню) в правом верхнем углу" },
      { icon: "add-home", text: "Выберите «Установить»" },
    ];
  }
  if (os === "android") {
    return [
      { icon: "menu", text: "Нажмите кнопку «⋮» (три точки) в правом верхнем углу браузера" },
      { icon: "add-home", text: "Выберите «Добавить на главный экран» или «Установить приложение»" },
      { icon: "confirm", text: "Нажмите «Добавить» или «Установить»" },
    ];
  }
  if (os === "desktop") {
    return [
      { icon: "address-bar", text: "Нажмите на значок установки в адресной строке (справа)" },
      { icon: "confirm", text: "Нажмите «Установить» в появившемся окне" },
    ];
  }
  return null;
}

// ── Browser mockups ──────────────────────────────────────────────────

function BrowserHintIOS() {
  return (
    <div className="mb-5 overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900">
      <p className="pt-3 text-center text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        Safari · нижняя панель
      </p>
      <div className="flex items-end justify-around px-5 pb-4 pt-3">
        <svg viewBox="0 0 24 24" className="h-6 w-6 text-zinc-600" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
        <svg viewBox="0 0 24 24" className="h-6 w-6 text-zinc-600" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
        {/* Share — highlighted */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="rounded-xl bg-sky-600 p-2.5 ring-4 ring-sky-500/30">
            <svg viewBox="0 0 24 24" className="h-7 w-7 text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/>
            </svg>
          </div>
          <span className="text-xs font-bold text-sky-400">Эта кнопка</span>
        </div>
        <svg viewBox="0 0 24 24" className="h-6 w-6 text-zinc-600" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
        <svg viewBox="0 0 24 24" className="h-6 w-6 text-zinc-600" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/></svg>
      </div>
    </div>
  );
}

function BrowserHintAndroid() {
  return (
    <div className="mb-5 overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900">
      <p className="pt-3 text-center text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        Chrome / Android · верхняя панель
      </p>
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="flex-1 rounded-lg bg-zinc-800 px-3 py-2.5 text-xs text-zinc-500">
          work.alessannailu.com
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="rounded-lg bg-sky-600 px-2.5 py-2 ring-4 ring-sky-500/30">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="currentColor">
              <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
            </svg>
          </div>
          <span className="text-[11px] font-bold text-sky-400">Сюда!</span>
        </div>
      </div>
    </div>
  );
}

function BrowserHintSamsung() {
  return (
    <div className="mb-5 overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900">
      <p className="pt-3 text-center text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        Samsung Internet · верхняя панель
      </p>
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="flex-1 rounded-lg bg-zinc-800 px-3 py-2.5 text-xs text-zinc-500">
          work.alessannailu.com
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="rounded-lg bg-sky-600 px-2.5 py-2 ring-4 ring-sky-500/30">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="currentColor">
              <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
            </svg>
          </div>
          <span className="text-[11px] font-bold text-sky-400">Сюда!</span>
        </div>
      </div>
    </div>
  );
}

function BrowserHintDesktop() {
  return (
    <div className="mb-5 overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900">
      <p className="pt-3 text-center text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        Chrome / Edge · адресная строка
      </p>
      <div className="flex items-center gap-1.5 px-4 py-4">
        <div className="flex-1 rounded-lg bg-zinc-800 px-3 py-2 text-xs text-zinc-500">
          work.alessannailu.com
        </div>
        {/* Install icon in address bar */}
        <div className="flex flex-col items-center gap-1">
          <div className="rounded-lg bg-sky-600 px-2 py-1.5 ring-4 ring-sky-500/30">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v13M5 9l7 7 7-7"/><path d="M3 21h18"/>
            </svg>
          </div>
          <span className="text-[11px] font-bold text-sky-400">Этот значок</span>
        </div>
      </div>
    </div>
  );
}

function BrowserHintIOSNotSafari() {
  return (
    <div className="mb-5 rounded-2xl border border-amber-800/50 bg-amber-950/30 p-4 text-center">
      <div className="mb-2 flex justify-center">
        <svg viewBox="0 0 24 24" className="h-10 w-10 text-amber-400" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
        </svg>
      </div>
      <p className="text-sm font-semibold text-amber-300">Только через Safari</p>
      <p className="mt-1 text-xs leading-relaxed text-amber-200/70">
        На iPhone/iPad установка работает только в браузере Safari. Скопируйте ссылку и откройте в Safari.
      </p>
      <div className="mt-3 rounded-lg bg-amber-900/40 px-3 py-2 font-mono text-xs text-amber-300">
        {window.location.host}/install
      </div>
    </div>
  );
}

function BrowserHint({ os, browser }: { os: string; browser: string }) {
  if (os === "ios" && browser === "safari") return <BrowserHintIOS />;
  if (os === "ios") return <BrowserHintIOSNotSafari />;
  if (browser === "samsung") return <BrowserHintSamsung />;
  if (os === "android") return <BrowserHintAndroid />;
  if (os === "desktop") return <BrowserHintDesktop />;
  return null;
}

// ── Icons ────────────────────────────────────────────────────────────

const ICON: Record<string, React.ReactNode> = {
  "safari-share": (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/>
    </svg>
  ),
  "add-home": (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M12 13v6M9 16h6"/>
    </svg>
  ),
  "confirm": (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  "menu": (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor">
      <circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/>
    </svg>
  ),
  "address-bar": (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
    </svg>
  ),
  "info": (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
    </svg>
  ),
};

// ── Page ─────────────────────────────────────────────────────────────

export function InstallPage() {
  const { os, browser } = detect();
  const [installed, setInstalled] = useState(() => isStandalone());
  const [prompted, setPrompted] = useState(false);
  const [installing, setInstalling] = useState(false);
  const canPrompt = !!(window as { _pwaPrompt?: unknown })._pwaPrompt;

  useEffect(() => {
    const mq = window.matchMedia("(display-mode: standalone)");
    const handler = (e: MediaQueryListEvent) => { if (e.matches) setInstalled(true); };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  async function handleInstall() {
    const prompt = (window as { _pwaPrompt?: { prompt: () => void; userChoice: Promise<{ outcome: string }> } })._pwaPrompt;
    if (!prompt) return;
    setInstalling(true);
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") setInstalled(true);
    (window as { _pwaPrompt?: null })._pwaPrompt = null;
    setInstalling(false);
    setPrompted(true);
  }

  const steps = getSteps(os, browser);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4 py-10">
      <div className="w-full max-w-sm">
        <img src="/alessanna-logo.png" alt="AlesSanna" className="mx-auto mb-8 h-16 object-contain" />

        {installed ? (
          <div className="rounded-2xl border border-emerald-800/50 bg-emerald-950/30 p-6 text-center">
            <div className="mb-3 flex justify-center text-emerald-400">
              <svg viewBox="0 0 24 24" className="h-12 w-12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <p className="text-lg font-semibold text-emerald-300">Приложение установлено!</p>
            <p className="mt-1 text-sm text-emerald-200/70">Найдите значок AlesSanna на экране и откройте приложение.</p>
          </div>
        ) : (
          <>
            <h1 className="mb-1 text-center text-xl font-semibold text-white">Установить приложение</h1>
            <p className="mb-6 text-center text-sm text-zinc-400">
              Добавьте AlesSanna на экран — работает как обычное приложение, без браузера.
            </p>

            {/* One-tap install button for Chrome/Edge when prompt available */}
            {canPrompt && !prompted && (
              <button
                onClick={() => void handleInstall()}
                disabled={installing}
                className="mb-6 flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 py-3.5 text-base font-semibold text-white shadow-lg hover:bg-sky-500 disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v13M5 9l7 7 7-7"/><path d="M3 21h18"/>
                </svg>
                {installing ? "Установка…" : "Установить одним нажатием"}
              </button>
            )}

            {/* Visual browser mockup */}
            <BrowserHint os={os} browser={browser} />

            {/* Step-by-step instructions */}
            {steps && (
              <div className="space-y-3">
                {steps.map((step, i) => (
                  <div key={i} className="flex gap-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-zinc-300">
                      {ICON[step.icon] ?? <span className="text-lg font-bold">{i + 1}</span>}
                    </div>
                    <div className="flex flex-col justify-center">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Шаг {i + 1}</span>
                      <p className="mt-0.5 text-sm leading-snug text-zinc-200">{step.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="mt-6 text-center text-xs text-zinc-600">
              Ссылка для установки: <span className="text-zinc-400">{window.location.host}/install</span>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
