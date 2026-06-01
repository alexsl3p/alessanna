/** Палитра календаря: уникальный цвет среди мастеров в текущем диапазоне (сортировка по id). */

import type { CSSProperties } from "react";
import { staffHueFromMap } from "./staffHue";

/**
 * Канонические цвета мастеров — источник истины в коде.
 * Синхронизированы с полем calendar_color_hex в таблице staff.
 */
export const CANONICAL_STAFF_HEX_COLORS: Record<string, string> = {
  Aleksander: "#7b1fa2",
  Alesja:     "#bfc501",
  Aljona:     "#ba0968",
  Anne:       "#e99715",
  Galina:     "#3f4dc7",
  Irina:      "#cb8ba5",
  Liza:       "#b11956",
  Natalja:    "#1565c0",
  Viktoria:   "#7cb338",
};

export const STAFF_CALENDAR_PALETTE = [
  { dot: "bg-rose-700",    strip: "border-l-4 border-rose-700",    bar: "bg-rose-700/85",    border: "border-rose-700/60",    text: "text-rose-50",    soft: "bg-rose-700/25" },
  { dot: "bg-amber-600",   strip: "border-l-4 border-amber-600",   bar: "bg-amber-600/85",   border: "border-amber-600/60",   text: "text-amber-50",   soft: "bg-amber-600/25" },
  { dot: "bg-indigo-600",  strip: "border-l-4 border-indigo-600",  bar: "bg-indigo-600/85",  border: "border-indigo-600/60",  text: "text-indigo-50",  soft: "bg-indigo-600/25" },
  { dot: "bg-lime-700",    strip: "border-l-4 border-lime-700",    bar: "bg-lime-700/85",    border: "border-lime-700/60",    text: "text-lime-50",    soft: "bg-lime-700/25" },
  { dot: "bg-pink-700",    strip: "border-l-4 border-pink-700",    bar: "bg-pink-700/85",    border: "border-pink-700/60",    text: "text-pink-50",    soft: "bg-pink-700/25" },
  { dot: "bg-purple-700",  strip: "border-l-4 border-purple-700",  bar: "bg-purple-700/85",  border: "border-purple-700/60",  text: "text-purple-50",  soft: "bg-purple-700/25" },
  { dot: "bg-yellow-600",  strip: "border-l-4 border-yellow-600",  bar: "bg-yellow-600/85",  border: "border-yellow-600/60",  text: "text-yellow-50",  soft: "bg-yellow-600/25" },
  { dot: "bg-blue-700",    strip: "border-l-4 border-blue-700",    bar: "bg-blue-700/85",    border: "border-blue-700/60",    text: "text-blue-50",    soft: "bg-blue-700/25" },
  { dot: "bg-teal-700",    strip: "border-l-4 border-teal-700",    bar: "bg-teal-700/85",    border: "border-teal-700/60",    text: "text-teal-50",    soft: "bg-teal-700/25" },
  { dot: "bg-orange-700",  strip: "border-l-4 border-orange-700",  bar: "bg-orange-700/85",  border: "border-orange-700/60",  text: "text-orange-50",  soft: "bg-orange-700/25" },
  { dot: "bg-violet-700",  strip: "border-l-4 border-violet-700",  bar: "bg-violet-700/85",  border: "border-violet-700/60",  text: "text-violet-50",  soft: "bg-violet-700/25" },
  { dot: "bg-cyan-700",    strip: "border-l-4 border-cyan-700",    bar: "bg-cyan-700/85",    border: "border-cyan-700/60",    text: "text-cyan-50",    soft: "bg-cyan-700/25" },
  { dot: "bg-emerald-700", strip: "border-l-4 border-emerald-700", bar: "bg-emerald-700/85", border: "border-emerald-700/60", text: "text-emerald-50", soft: "bg-emerald-700/25" },
  { dot: "bg-fuchsia-700", strip: "border-l-4 border-fuchsia-700", bar: "bg-fuchsia-700/85", border: "border-fuchsia-700/60", text: "text-fuchsia-50", soft: "bg-fuchsia-700/25" },
  { dot: "bg-sky-700",     strip: "border-l-4 border-sky-700",     bar: "bg-sky-700/85",     border: "border-sky-700/60",     text: "text-sky-50",     soft: "bg-sky-700/25" },
  { dot: "bg-red-700",     strip: "border-l-4 border-red-700",     bar: "bg-red-700/85",     border: "border-red-700/60",     text: "text-red-50",     soft: "bg-red-700/25" },
] as const;

export type StaffCalendarColor = (typeof STAFF_CALENDAR_PALETTE)[number];

function hashStaffId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Один цвет на мастера среди переданных id: без коллизий хеша, пока мастеров не больше длины палитры.
 * Порядок — лексикографически по id (стабильно между сеансами).
 */
export function buildStaffColorAssignments(staffIds: Iterable<string>): Map<string, StaffCalendarColor> {
  const sorted = [...new Set(staffIds)].sort((a, b) => a.localeCompare(b));
  const map = new Map<string, StaffCalendarColor>();
  const n = STAFF_CALENDAR_PALETTE.length;
  sorted.forEach((id, idx) => {
    map.set(id, STAFF_CALENDAR_PALETTE[idx % n]!);
  });
  return map;
}

export function getStaffCalendarColor(
  staffId: string,
  assignments?: ReadonlyMap<string, StaffCalendarColor>,
): StaffCalendarColor {
  const fromMap = assignments?.get(staffId);
  if (fromMap) return fromMap;
  const i = hashStaffId(staffId) % STAFF_CALENDAR_PALETTE.length;
  return STAFF_CALENDAR_PALETTE[i]!;
}

const HEX6 = /^#[0-9a-f]{6}$/i;

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return `rgba(128,128,128,${alpha})`;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function relativeLuminanceHex(hex: string): number {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return 0.5;
  const lin = (x: number) => {
    const u = x / 255;
    return u <= 0.03928 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4);
  };
  const R = lin(parseInt(m[1], 16));
  const G = lin(parseInt(m[2], 16));
  const B = lin(parseInt(m[3], 16));
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function googleHexToCrmBlockStyle(bgHex: string, fgHex: string | null | undefined): CSSProperties {
  const fg =
    fgHex && HEX6.test(fgHex)
      ? hexToRgba(fgHex, 0.95)
      : relativeLuminanceHex(bgHex) > 0.55
        ? "rgba(17,24,39,0.92)"
        : "rgba(250,250,252,0.95)";
  return {
    borderColor: hexToRgba(bgHex, 0.55),
    backgroundColor: hexToRgba(bgHex, 0.4),
    color: fg,
  };
}

export type StaffCalendarColorFields = {
  calendar_color_hex?: string | null;
  calendar_foreground_hex?: string | null;
};

/** Карточки записей в CRM (неделя / месяц): цвет из Google или fallback по hue-карте. */
export function staffCrmAppointmentBlockStyle(
  staffId: string,
  staffList: Array<{ id: string } & StaffCalendarColorFields>,
  hueMap: ReadonlyMap<string, number>,
): CSSProperties {
  const member = staffList.find((s) => s.id === staffId);
  const hex = member?.calendar_color_hex?.trim();
  if (hex && HEX6.test(hex)) {
    return googleHexToCrmBlockStyle(hex, member?.calendar_foreground_hex);
  }
  const hue = staffHueFromMap(staffId, hueMap);
  return {
    borderColor: `hsl(${hue} 75% 50% / 0.55)`,
    backgroundColor: `hsl(${hue} 70% 24% / 0.58)`,
    color: `hsl(${hue} 85% 92%)`,
  };
}

export type StaffPublicCalendarLook =
  | { kind: "google"; bg: string; fg: string; soft: string; border: string }
  | { kind: "palette"; palette: StaffCalendarColor };

/** Публичный календарь / легенда: Google-hex или палитра Tailwind. */
export function resolveStaffPublicCalendarLook(
  staffId: string,
  staffById: Map<string, { calendar_color_hex?: string | null; calendar_foreground_hex?: string | null }>,
  assignments?: ReadonlyMap<string, StaffCalendarColor>,
): StaffPublicCalendarLook {
  const m = staffById.get(staffId);
  const hex = m?.calendar_color_hex?.trim();
  if (hex && HEX6.test(hex)) {
    const fgHex = m?.calendar_foreground_hex?.trim();
    const fg =
      fgHex && HEX6.test(fgHex)
        ? fgHex
        : relativeLuminanceHex(hex) > 0.55
          ? "#111827"
          : "#f4f4f5";
    return {
      kind: "google",
      bg: hex,
      fg,
      /* Чуть плотнее фон в публичной сетке — лучше читается со светлым текстом */
      soft: hexToRgba(hex, 0.38),
      border: hexToRgba(hex, 0.55),
    };
  }
  return { kind: "palette", palette: getStaffCalendarColor(staffId, assignments) };
}

/** Смешивание hex с белым — пастель как в классических салонных программах. */
function pastelMixFromHex(hex: string, withWhite: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return "#f4f4f5";
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  const R = Math.round(r + (255 - r) * withWhite);
  const G = Math.round(g + (255 - g) * withWhite);
  const B = Math.round(b + (255 - b) * withWhite);
  return `rgb(${R},${G},${B})`;
}

/** Пастель под светлую сетку дня (колонки мастеров). */
const PASTEL_BY_PALETTE_INDEX: ReadonlyArray<{ bg: string; border: string }> = [
  { bg: "hsl(204 90% 92%)", border: "hsl(204 55% 78%)" },
  { bg: "hsl(265 90% 94%)", border: "hsl(265 50% 80%)" },
  { bg: "hsl(43 96% 90%)", border: "hsl(43 70% 76%)" },
  { bg: "hsl(152 76% 90%)", border: "hsl(152 55% 74%)" },
  { bg: "hsl(350 85% 93%)", border: "hsl(350 55% 80%)" },
  { bg: "hsl(189 85% 91%)", border: "hsl(189 50% 76%)" },
  { bg: "hsl(292 85% 93%)", border: "hsl(292 50% 80%)" },
  { bg: "hsl(88 70% 90%)", border: "hsl(88 50% 72%)" },
  { bg: "hsl(28 95% 91%)", border: "hsl(28 65% 76%)" },
  { bg: "hsl(173 72% 90%)", border: "hsl(173 48% 74%)" },
  { bg: "hsl(234 82% 93%)", border: "hsl(234 48% 78%)" },
  { bg: "hsl(330 85% 93%)", border: "hsl(330 50% 80%)" },
  { bg: "hsl(0 85% 93%)", border: "hsl(0 55% 80%)" },
  { bg: "hsl(54 92% 90%)", border: "hsl(54 70% 76%)" },
  { bg: "hsl(217 88% 91%)", border: "hsl(217 55% 76%)" },
  { bg: "hsl(271 80% 93%)", border: "hsl(271 48% 78%)" },
];

export type StaffPublicPastelCard = {
  backgroundColor: string;
  borderColor: string;
  color: string;
};

/**
 * Круг с инициалом мастера в тёмной панели (быстрая запись): цвет фона из Google Calendar или fallback HSL.
 */
export function staffQuickPanelAvatarStyle(
  staffId: string,
  staffById: Map<string, StaffCalendarColorFields>,
  hueMap: ReadonlyMap<string, number>,
  assignments?: ReadonlyMap<string, StaffCalendarColor>,
): CSSProperties {
  const look = resolveStaffPublicCalendarLook(staffId, staffById, assignments);
  if (look.kind === "google") {
    return {
      backgroundColor: look.bg,
      color: look.fg,
      boxShadow: `inset 0 0 0 1px ${look.border}`,
    };
  }
  const hue = staffHueFromMap(staffId, hueMap);
  return {
    backgroundColor: `hsl(${hue} 58% 38%)`,
    color: `hsl(${hue} 90% 94%)`,
    boxShadow: `inset 0 0 0 1px hsl(${hue} 70% 50% / 0.45)`,
  };
}

export function resolveStaffPublicPastelCard(
  staffId: string,
  staffById: Map<string, { calendar_color_hex?: string | null; calendar_foreground_hex?: string | null }>,
  assignments?: ReadonlyMap<string, StaffCalendarColor>,
): StaffPublicPastelCard {
  const look = resolveStaffPublicCalendarLook(staffId, staffById, assignments);
  if (look.kind === "google") {
    return {
      backgroundColor: pastelMixFromHex(look.bg, 0.62),
      borderColor: pastelMixFromHex(look.bg, 0.35),
      color: "#18181b",
    };
  }
  const idx = STAFF_CALENDAR_PALETTE.indexOf(look.palette);
  const safe = idx >= 0 ? idx : hashStaffId(staffId) % PASTEL_BY_PALETTE_INDEX.length;
  const p = PASTEL_BY_PALETTE_INDEX[safe] ?? PASTEL_BY_PALETTE_INDEX[0]!;
  return { backgroundColor: p.bg, borderColor: p.border, color: "#18181b" };
}
