export const portTimeZones: Readonly<Record<string, string>> = {
  "PRT-1001": "Europe/Berlin",
  "PRT-1002": "Europe/Amsterdam",
  "PRT-1003": "Europe/Stockholm",
  "PRT-1004": "Europe/London",
};

export function formatPortLocal(instant: string | number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  const milliseconds = new Date(instant).getUTCMilliseconds();
    return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}${milliseconds ? `.${String(milliseconds).padStart(3, "0")}` : ""}`;
}

// Enumerate nearby offsets so DST gaps and overlaps cannot silently select an instant.
export function portLocalToEpoch(local: string, timeZone: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/.test(local)) throw new Error("Invalid local time");
  const withSeconds = local.length === 16 ? `${local}:00` : local;
  const [seconds, fraction = ""] = withSeconds.split(".");
  const milliseconds = Number(fraction.padEnd(3, "0"));
  const normalized = `${seconds}${milliseconds ? `.${String(milliseconds).padStart(3, "0")}` : ""}`;
  const wall = Date.parse(`${normalized}Z`);
  if (!Number.isFinite(wall)) throw new Error("Invalid local time");
  const candidates = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 6) {
    const sample = wall + hours * 3_600_000;
    const offset = Date.parse(`${formatPortLocal(sample, timeZone)}Z`) - sample;
    const candidate = wall - offset;
    if (formatPortLocal(candidate, timeZone) === normalized) candidates.add(candidate);
  }
  if (candidates.size !== 1) throw new Error("Local time is invalid or ambiguous");
  return [...candidates][0]!;
}
