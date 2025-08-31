import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ====== Portugal (Europe/Lisbon) timezone helpers ======
const LISBON_TZ = "Europe/Lisbon" as const;

function fmtParts(date: Date) {
  const parts = new Intl.DateTimeFormat("pt-PT", {
    timeZone: LISBON_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  return map as { year: string; month: string; day: string };
}

export function lisbonYMD(date: Date): string {
  const p = fmtParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

export function lisbonTodayYMD(): string {
  return lisbonYMD(new Date());
}

export function formatLisbonDate(date: Date, opts?: Intl.DateTimeFormatOptions): string {
  const fmt = new Intl.DateTimeFormat("pt-PT", { timeZone: LISBON_TZ, ...(opts || {}) });
  return fmt.format(date);
}

export function daysBetweenLisbon(a: Date, b: Date): number {
  const [ay, am, ad] = lisbonYMD(a).split("-").map((x) => +x);
  const [by, bm, bd] = lisbonYMD(b).split("-").map((x) => +x);
  const aUTC = Date.UTC(ay, am - 1, ad);
  const bUTC = Date.UTC(by, bm - 1, bd);
  return Math.floor(Math.abs(aUTC - bUTC) / 86400000);
}

export function compareLisbonYMD(a: string | null | undefined, b: string | null | undefined): number {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isDueTodayLisbon(target: string | null | undefined): boolean {
  if (!target) return false;
  return target === lisbonTodayYMD();
}

export function isOverdueLisbon(target: string | null | undefined): boolean {
  if (!target) return false;
  return target < lisbonTodayYMD();
}
