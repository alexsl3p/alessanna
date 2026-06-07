export function SetupGuidePage() {
  return (
    <div style={{ background: "#fbfaf6", minHeight: "100vh", padding: "40px 16px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <img src="/alessanna-logo.png" alt="AlesSanna" style={{ height: 56, objectFit: "contain", marginBottom: 20 }} />
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#1c1a17", margin: "0 0 8px" }}>
            Инструкция для мастеров
          </h1>
          <p style={{ fontSize: 15, color: "#6e6962", margin: 0 }}>
            Как скачать приложение и войти в систему
          </p>
        </div>

        {/* Step 1 */}
        <Step num={1} title="Установите приложение">
          <p style={pStyle}>Откройте в браузере вашего телефона страницу установки:</p>
          <a
            href="https://work.alessannailu.com/install"
            target="_blank"
            rel="noopener noreferrer"
            style={linkBoxStyle}
          >
            work.alessannailu.com/install
          </a>
          <p style={pStyle}>
            Страница автоматически определит ваш браузер и покажет пошаговую инструкцию со стрелкой — куда именно нажать.
          </p>
          <Note>
            <strong>Не получается установить?</strong> Ничего страшного — просто откройте{" "}
            <a href="https://work.alessannailu.com" target="_blank" rel="noopener noreferrer" style={inlineLinkStyle}>
              work.alessannailu.com
            </a>{" "}
            в браузере Chrome или Safari и сохраните в закладки.
          </Note>
        </Step>

        {/* Step 2 */}
        <Step num={2} title="Откройте приложение и выберите «Мастера»">
          <p style={pStyle}>На главном экране нажмите кнопку:</p>
          <div style={{ background: "#f4f1eb", border: "1px solid #d6c9b6", borderRadius: 10, padding: "12px 16px", fontWeight: 700, fontSize: 15, color: "#6d593f", textAlign: "center" as const, margin: "8px 0" }}>
            3. Мастера — Личный вход по email
          </div>
        </Step>

        {/* Step 3 */}
        <Step num={3} title="Войдите в систему">

          {/* Option A */}
          <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 10, padding: "14px 16px", marginBottom: 12 }}>
            <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: 14, color: "#15803d" }}>✓ Вариант А — через Gmail (быстро и просто)</p>
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              <li style={liStyle}>Нажмите кнопку <strong>«Войти через Google»</strong></li>
              <li style={liStyle}>Выберите ваш Gmail-аккаунт</li>
              <li style={liStyle}>Готово — вы в приложении!</li>
            </ol>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "12px 0", color: "#a3855e", fontSize: 13 }}>
            <div style={{ flex: 1, height: 1, background: "#e0d9cf" }} />
            <span>или</span>
            <div style={{ flex: 1, height: 1, background: "#e0d9cf" }} />
          </div>

          {/* Option B */}
          <div style={{ background: "#eff6ff", border: "1px solid #93c5fd", borderRadius: 10, padding: "14px 16px" }}>
            <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: 14, color: "#1d4ed8" }}>✓ Вариант Б — по email и паролю</p>
            <p style={{ ...liStyle, fontWeight: 600, marginBottom: 6 }}>Если входите первый раз — нужна регистрация:</p>
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              <li style={liStyle}>Нажмите <strong>«Нет аккаунта? Зарегистрироваться»</strong></li>
              <li style={liStyle}>Введите ваш email и придумайте пароль</li>
              <li style={liStyle}>Нажмите <strong>«Зарегистрироваться»</strong></li>
              <li style={liStyle}>Проверьте почту — придёт письмо <em>«Confirm Your Signup»</em></li>
              <li style={liStyle}>Нажмите <strong>«Confirm your mail»</strong> в письме</li>
              <li style={liStyle}>Вернитесь в приложение → нажмите <strong>«Войти»</strong> → введите email и пароль</li>
            </ol>
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #bfdbfe" }}>
              <p style={{ ...liStyle, fontWeight: 600, margin: "0 0 4px" }}>Уже есть аккаунт:</p>
              <p style={liStyle}>Введите email и пароль → нажмите <strong>«Войти»</strong></p>
            </div>
          </div>

          <Note>
            <strong>⚠️ Важно:</strong> ваш email должен быть добавлен администратором заранее.
            Если появилось сообщение «Доступ не настроен» — напишите администратору.
          </Note>
        </Step>

        {/* Footer */}
        <div style={{ textAlign: "center", marginTop: 40, paddingTop: 24, borderTop: "1px solid #e0d9cf" }}>
          <p style={{ fontSize: 13, color: "#a3855e", margin: 0 }}>
            AlesSanna ·{" "}
            <a href="https://work.alessannailu.com" target="_blank" rel="noopener noreferrer" style={{ color: "#a3855e" }}>
              work.alessannailu.com
            </a>
          </p>
        </div>

      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Step({ num, title, children }: { num: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#ffffff", border: "1px solid #e0d9cf", borderRadius: 14, padding: "24px", marginBottom: 16, boxShadow: "0 1px 4px rgba(163,133,94,0.08)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 16 }}>
        <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: "50%", background: "#a3855e", color: "#fff", fontSize: 17, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {num}
        </div>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: "#1c1a17", margin: "6px 0 0" }}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#92400e", marginTop: 12, lineHeight: 1.6 }}>
      {children}
    </div>
  );
}

const pStyle: React.CSSProperties = { fontSize: 14, color: "#444", margin: "0 0 8px", lineHeight: 1.6 };
const liStyle: React.CSSProperties = { fontSize: 13, color: "#444", lineHeight: 1.6, marginBottom: 4 };
const linkBoxStyle: React.CSSProperties = {
  display: "block", background: "#f4f1eb", border: "1px solid #c4b098",
  borderRadius: 10, padding: "12px 16px", fontWeight: 700, fontSize: 16,
  color: "#6d593f", textAlign: "center", margin: "8px 0 12px",
  textDecoration: "none",
};
const inlineLinkStyle: React.CSSProperties = { color: "#a3855e", fontWeight: 600 };
