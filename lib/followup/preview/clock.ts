/** Avança somente o relógio de negócio do ensaio. */
export function advanceVirtualClock(nowMs: number, elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return nowMs;
  const next = nowMs + elapsedMs;
  return Number.isFinite(new Date(next).getTime()) ? next : nowMs;
}

export function nextVirtualDeadline(nowMs: number, deadlineMs: number | null): number | null {
  return deadlineMs === null ? null : Math.max(nowMs, deadlineMs);
}
