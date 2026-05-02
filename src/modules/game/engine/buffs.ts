import type { Combatant } from './combat.js';

export type BuffKind = 'dot' | 'hot' | 'shield' | 'defense_amp' | 'damage_amp' | 'taunt' | 'slow';

export interface Buff {
  id: string;
  kind: BuffKind;
  source: string;
  ttl: number;
  amount?: number;
  casterId?: string;
}

export function applyBuffsAtRoundEnd(c: Combatant): string[] {
  if (!c.buffs || c.buffs.length === 0) return [];
  const lines: string[] = [];
  for (const b of c.buffs) {
    if (b.kind === 'dot' && b.amount && c.hp > 0) {
      c.hp = Math.max(0, c.hp - b.amount);
      lines.push(`☠️ **${c.name}** traci **${b.amount}** HP od **${b.source}**.`);
    }
    if (b.kind === 'hot' && b.amount && c.hp > 0) {
      const before = c.hp;
      c.hp = Math.min(c.maxHp, c.hp + b.amount);
      const restored = c.hp - before;
      if (restored > 0)
        lines.push(`🌿 **${c.name}** odzyskuje **${restored}** HP od **${b.source}**.`);
    }
    b.ttl -= 1;
  }
  c.buffs = c.buffs.filter((b) => b.ttl > 0);
  return lines;
}

export function getDefenseAmp(c: Combatant): number {
  if (!c.buffs) return 0;
  return c.buffs.filter((b) => b.kind === 'defense_amp').reduce((s, b) => s + (b.amount ?? 0), 0);
}

export function getDamageAmp(c: Combatant): number {
  if (!c.buffs) return 0;
  return c.buffs.filter((b) => b.kind === 'damage_amp').reduce((s, b) => s + (b.amount ?? 0), 0);
}

export function consumeShield(c: Combatant, dmg: number): { absorbed: number; remaining: number } {
  if (!c.buffs) return { absorbed: 0, remaining: dmg };
  const shield = c.buffs.find((b) => b.kind === 'shield' && (b.amount ?? 0) > 0);
  if (!shield) return { absorbed: 0, remaining: dmg };
  const absorbed = Math.min(shield.amount ?? 0, dmg);
  shield.amount = (shield.amount ?? 0) - absorbed;
  if ((shield.amount ?? 0) <= 0) {
    c.buffs = c.buffs.filter((b) => b !== shield);
  }
  return { absorbed, remaining: dmg - absorbed };
}

export function isControlled(c: Combatant): boolean {
  if (!c.buffs) return false;
  return c.buffs.some((b) => b.kind === 'slow');
}

export function getTauntCasterId(c: Combatant): string | undefined {
  if (!c.buffs) return undefined;
  return c.buffs.find((b) => b.kind === 'taunt')?.casterId;
}

export function addBuff(c: Combatant, buff: Buff): void {
  if (!c.buffs) c.buffs = [];
  // jeśli buff o tym samym id istnieje — refresh ttl/amount
  const existing = c.buffs.find((b) => b.id === buff.id);
  if (existing) {
    existing.ttl = Math.max(existing.ttl, buff.ttl);
    if (buff.amount !== undefined) existing.amount = buff.amount;
    return;
  }
  c.buffs.push(buff);
}

export function decrementCooldowns(c: Combatant): void {
  if (!c.skillCooldowns) return;
  for (const id of Object.keys(c.skillCooldowns)) {
    c.skillCooldowns[id] = Math.max(0, c.skillCooldowns[id] - 1);
    if (c.skillCooldowns[id] === 0) delete c.skillCooldowns[id];
  }
}
