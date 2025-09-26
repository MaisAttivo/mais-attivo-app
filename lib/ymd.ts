// lib/ymd.ts
export function ymdLisbon(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}
