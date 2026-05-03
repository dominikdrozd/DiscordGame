/**
 * Cron-style scheduling helper — zwraca timestamp najbliższego "slotu"
 * (godzina + minuta) po danym `now`. Jeśli wszystkie sloty na dzisiaj
 * minęły, zwraca pierwszy z `hours` jutra.
 *
 * Używane przez ArenaService (1 slot, 18:10) i WorldBossService
 * (5 slotów: 10/13/16/19/22 z minute=0).
 */
export function nextSlotAfter(now: number, hours: readonly number[], minute = 0): number {
  if (hours.length === 0) throw new Error('nextSlotAfter: hours array empty');
  const d = new Date(now);
  for (const h of hours) {
    const candidate = new Date(d);
    candidate.setHours(h, minute, 0, 0);
    if (candidate.getTime() > now) return candidate.getTime();
  }
  const tomorrow = new Date(d);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(hours[0], minute, 0, 0);
  return tomorrow.getTime();
}
