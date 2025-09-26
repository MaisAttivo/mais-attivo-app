// lib/ymd.ts
export function ymdLisbon(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

export function addDaysYMD(ymd: string, days: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return ymdLisbon(dt);
}

export function diffDays(aYMD: string, bYMD: string) {
  const [ya, ma, da] = aYMD.split("-").map(Number);
  const [yb, mb, db] = bYMD.split("-").map(Number);
  const a = Date.UTC(ya, ma - 1, da);
  const b = Date.UTC(yb, mb - 1, db);
  return Math.round((a - b) / 86400000);
}

export function startOfISOWeekYMD(d = new Date()) {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (dt.getUTCDay() || 7) - 1; // 0..6 (Mon..Sun-1)
  dt.setUTCDate(dt.getUTCDate() - day);
  return ymdLisbon(dt);
}

export function endOfISOWeekYMD(d = new Date()) {
  const start = startOfISOWeekYMD(d);
  return addDaysYMD(start, 6);
}
