import os from 'node:os';
import path from 'node:path';
import type { PlayerStats } from '../../src/modules/game/services/player-stats.js';
import type { Combatant } from '../../src/modules/game/engine/combat.js';
import type {
  BattleCombatant,
  BattleState,
  Controller,
} from '../../src/modules/game/engine/battle-state.js';

let counter = 0;

export function tmpPlayerFile(): string {
  counter += 1;
  return path.join(os.tmpdir(), `players-${Date.now()}-${counter}.json`);
}

export function makePlayer(overrides: Partial<PlayerStats> = {}): PlayerStats {
  const base: PlayerStats = {
    id: 'p1',
    name: 'Tester',
    xp: 0,
    level: 1,
    gold: 100,
    wins: 0,
    losses: 0,
    duels: 0,
    inventory: { resources: {}, items: [] },
    equipped: {},
    skills: {
      mining: { level: 1, xp: 0 },
      fishing: { level: 1, xp: 0 },
      woodcutting: { level: 1, xp: 0 },
      crafting: { level: 1, xp: 0 },
      combat: { level: 1, xp: 0 },
    },
    unspentPoints: 0,
    attribute: { attack: 0, defense: 0, hp: 0, crit: 0 },
    primary: { str: 0, agi: 0, wit: 0, int: 0 },
    learnedSkills: [],
    unlearnedBooks: [],
    quests: { active: [], completed: [], abandoned: [] },
    activeExpedition: null,
    cooldowns: {},
  };
  return {
    ...base,
    ...overrides,
    inventory: {
      resources: { ...base.inventory.resources, ...(overrides.inventory?.resources ?? {}) },
      items: overrides.inventory?.items ?? [...base.inventory.items],
    },
    skills: { ...base.skills, ...(overrides.skills ?? {}) },
    attribute: { ...base.attribute, ...(overrides.attribute ?? {}) },
    primary: { ...base.primary, ...(overrides.primary ?? {}) },
    equipped: { ...base.equipped, ...(overrides.equipped ?? {}) },
    cooldowns: { ...base.cooldowns, ...(overrides.cooldowns ?? {}) },
  };
}

export function makeCombatant(overrides: Partial<Combatant> = {}): Combatant {
  return {
    id: 'c1',
    name: 'Fighter',
    hp: 100,
    maxHp: 100,
    damageBonus: 0,
    defending: false,
    potionsLeft: 0,
    ...overrides,
  };
}

export function makeBattleCombatant(overrides: Partial<BattleCombatant> = {}): BattleCombatant {
  const team: number = overrides.team ?? 0;
  const controller: Controller = overrides.controller ?? 'human';
  return {
    ...makeCombatant(overrides),
    id: overrides.id ?? 'bc1',
    team,
    controller,
    threatBias: overrides.threatBias,
  };
}

export function makeBattleState(combatants: BattleCombatant[]): BattleState {
  return {
    id: 'bs1',
    thread: null,
    combatants,
    pending: new Map(),
    promptMessageIds: new Map(),
    roundNumber: 1,
    finished: false,
  };
}

/**
 * Mockuje `Math.random()` żeby zwracało kolejne wartości z listy.
 * Po wyczerpaniu wszystkie kolejne wywołania rzucą — chroni przed cichym fallbackiem.
 */
export function mockRandom(values: number[]): jest.SpyInstance<number, []> {
  let i = 0;
  const spy = jest.spyOn(Math, 'random').mockImplementation(() => {
    if (i >= values.length) {
      throw new Error(`mockRandom exhausted after ${values.length} calls`);
    }
    return values[i++];
  });
  return spy;
}
