import type { Combatant } from './combat.js';

export type Controller = 'human' | 'ai';

export interface BattleCombatant extends Combatant {
  id: string;
  team: number;
  controller: Controller;
  threatBias?: number;
}

export interface BattleAction {
  kind: 'attack' | 'defend' | 'skill' | 'item';
  targetId?: string;
  skillId?: string;
  itemId?: string;
}

export interface BattleState {
  id: string;
  thread: any;
  combatants: BattleCombatant[];
  pending: Map<string, BattleAction>;
  promptMessageIds: Map<string, string>;
  roundNumber: number;
  finished: boolean;
  winnerTeam?: number;
  draw?: boolean;
}

export function alive(state: BattleState): BattleCombatant[] {
  return state.combatants.filter((c) => c.hp > 0);
}

export function aliveOnTeam(state: BattleState, team: number): BattleCombatant[] {
  return state.combatants.filter((c) => c.team === team && c.hp > 0);
}

export function aliveAllies(state: BattleState, c: BattleCombatant): BattleCombatant[] {
  return state.combatants.filter((x) => x.team === c.team && x.hp > 0);
}

export function aliveEnemies(state: BattleState, c: BattleCombatant): BattleCombatant[] {
  return state.combatants.filter((x) => x.team !== c.team && x.hp > 0);
}

export function findCombatant(state: BattleState, id: string): BattleCombatant | undefined {
  return state.combatants.find((c) => c.id === id);
}

export function humansAlive(state: BattleState): BattleCombatant[] {
  return state.combatants.filter((c) => c.controller === 'human' && c.hp > 0);
}

export function checkFinish(state: BattleState): {
  finished: boolean;
  winnerTeam?: number;
  draw?: boolean;
} {
  const aliveTeams = new Set<number>();
  for (const c of state.combatants) if (c.hp > 0) aliveTeams.add(c.team);
  if (aliveTeams.size === 0) return { finished: true, draw: true };
  if (aliveTeams.size === 1) return { finished: true, winnerTeam: [...aliveTeams][0] };
  return { finished: false };
}
