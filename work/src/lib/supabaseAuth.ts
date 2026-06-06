import { createClient } from "@supabase/supabase-js";

/**
 * Отдельный Supabase-клиент с persistSession: true — для email-входа в PWA.
 * Основной клиент (lib/supabase.ts) использует persistSession: false, чтобы
 * телефонный PIN-логин не конфликтовал с Supabase Auth сессией.
 */
export const supabaseAuth = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!,
  {
    auth: {
      persistSession: true,
      storageKey: "alessanna_pwa_session",
      autoRefreshToken: true,
    },
  }
);
