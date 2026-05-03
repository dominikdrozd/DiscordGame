import type { PrimaryStats } from '../services/player-stats.js';

export type Role = 'DPS' | 'Tank' | 'Healer';

export interface SubclassDef {
  id: string;
  name: string;
  description: string;
  primaryBonus: PrimaryStats;
  bonusSkills: string[];
  subclasses2?: SubclassDef[];
}

export interface ClassDef {
  id: string;
  name: string;
  role: Role;
  description: string;
  primaryBonus: PrimaryStats;
  /**
   * Bazowa inicjatywa klasy — niezależna od AGI. Sumuje się z AGI
   * i bonusami z ekwipunku w `effectiveSpeed`. Gracz bez klasy ma 0.
   */
  baseSpeed: number;
  startingSkills: string[];
  subclasses: SubclassDef[];
}

export const SUBCLASS_UNLOCK_LEVEL = 20;
export const SUBCLASS2_UNLOCK_LEVEL = 40;

export const CLASSES: Record<string, ClassDef> = {
  wojownik: {
    id: 'wojownik',
    name: 'Wojownik',
    role: 'Tank',
    description: 'Mur i tarcza — ściąga aggro, redukuje obrażenia, dużo HP.',
    primaryBonus: { str: 2, agi: 0, wit: 1, int: 0 },
    baseSpeed: 2,
    startingSkills: ['taunt', 'tarcza_jelita'],
    subclasses: [
      {
        id: 'berserker',
        name: 'Berserker',
        description: 'DPS-Tank — więcej dmg kosztem obrony.',
        primaryBonus: { str: 3, agi: 1, wit: -1, int: 0 },
        bonusSkills: ['szal'],
        subclasses2: [
          {
            id: 'krwawnik',
            name: 'Krwawnik',
            description: 'Pure damage — buff dmg na 3 tury, ryzyko vs nagroda.',
            primaryBonus: { str: 4, agi: 0, wit: -1, int: 0 },
            bonusSkills: ['furia'],
          },
          {
            id: 'wodzowy_rzeznik',
            name: 'Wodzowy Rzeźnik',
            description: 'Berserker-Tank — taunt + def, ściąga uwagę całej drużyny wroga.',
            primaryBonus: { str: 2, agi: 0, wit: 2, int: 0 },
            bonusSkills: ['pohuk'],
          },
        ],
      },
      {
        id: 'krzyzowiec',
        name: 'Krzyżowiec',
        description: 'Czysty Tank — taunt na całą drużynę, reflect części dmg.',
        primaryBonus: { str: 1, agi: 0, wit: 3, int: 0 },
        bonusSkills: ['krzyk_bojowy', 'odbicie'],
        subclasses2: [
          {
            id: 'swiety_strazak',
            name: 'Święty Strażak',
            description: 'Tank-Healer — burst heal sojusznika, dual purpose.',
            primaryBonus: { str: 0, agi: 0, wit: 3, int: 1 },
            bonusSkills: ['bizmut'],
          },
          {
            id: 'gniew_bozy',
            name: 'Gniew Boży',
            description: 'Tank-DPS — święty młot z 50% piercing, kara na heretyków.',
            primaryBonus: { str: 3, agi: 0, wit: 1, int: 0 },
            bonusSkills: ['mlot_swiety'],
          },
        ],
      },
    ],
  },
  lotrzyk: {
    id: 'lotrzyk',
    name: 'Łotrzyk',
    role: 'DPS',
    description: 'Sztylety, trucizny, krity z cienia.',
    primaryBonus: { str: 1, agi: 2, wit: 0, int: 0 },
    baseSpeed: 7,
    startingSkills: ['cios_w_plecy', 'trucizna'],
    subclasses: [
      {
        id: 'cien',
        name: 'Cień',
        description: 'Burst DPS — duży krit dmg, słabszy DoT.',
        primaryBonus: { str: 1, agi: 3, wit: 0, int: 0 },
        bonusSkills: ['skok_z_cienia'],
        subclasses2: [
          {
            id: 'assassyn',
            name: 'Assassyn',
            description: 'Mistrz egzekucji — gwarantowany krit ×3 dmg.',
            primaryBonus: { str: 1, agi: 4, wit: 0, int: 0 },
            bonusSkills: ['sztylet_smierci'],
          },
          {
            id: 'szpieg',
            name: 'Szpieg',
            description: 'Sabotaż — debuffy i kontrola, slow + dmg-amp.',
            primaryBonus: { str: 0, agi: 3, wit: 1, int: 1 },
            bonusSkills: ['oslepienie'],
          },
        ],
      },
      {
        id: 'trujacy',
        name: 'Trujący',
        description: 'DoT specialist — bleed, poison, slow.',
        primaryBonus: { str: 0, agi: 2, wit: 1, int: 1 },
        bonusSkills: ['mgla_trucizn'],
        subclasses2: [
          {
            id: 'mistrz_jadow',
            name: 'Mistrz Jadów',
            description: 'Najsilniejsze trucizny — paraliż 8 dmg/turę 3 tury + slow.',
            primaryBonus: { str: 0, agi: 1, wit: 1, int: 3 },
            bonusSkills: ['paraliz'],
          },
          {
            id: 'sluga_smietli',
            name: 'Sługa Śmietli',
            description: 'Mgła Lodu — AoE slow + DoT na całą drużynę wroga.',
            primaryBonus: { str: 0, agi: 3, wit: 1, int: 1 },
            bonusSkills: ['mgla_lodu'],
          },
        ],
      },
    ],
  },
  mag: {
    id: 'mag',
    name: 'Mag',
    role: 'DPS',
    description: 'AoE i kontrola — żywioły dzikie, mózg jeszcze dzikszy.',
    primaryBonus: { str: 0, agi: 0, wit: 0, int: 3 },
    baseSpeed: 4,
    startingSkills: ['kula_ognia', 'lodowy_grad'],
    subclasses: [
      {
        id: 'pirokineta',
        name: 'Pirokineta',
        description: 'AoE specialist — meteory, kolumny ognia.',
        primaryBonus: { str: 0, agi: 0, wit: 0, int: 4 },
        bonusSkills: ['meteor'],
        subclasses2: [
          {
            id: 'wladca_phoenixa',
            name: 'Władca Phoenixa',
            description: 'Hybryda dmg + survival — self heal +60 HP.',
            primaryBonus: { str: 0, agi: 0, wit: 2, int: 4 },
            bonusSkills: ['odrodzenie'],
          },
          {
            id: 'inferno',
            name: 'Inferno',
            description: 'Pure AoE — Piekło 100% dmg + DoT na wszystkich.',
            primaryBonus: { str: 0, agi: 0, wit: 0, int: 5 },
            bonusSkills: ['pieklo'],
          },
        ],
      },
      {
        id: 'mroziciel',
        name: 'Mroziciel',
        description: 'Single + freeze/control — przeciwnicy tracą tury.',
        primaryBonus: { str: 0, agi: 1, wit: 1, int: 3 },
        bonusSkills: ['mrozny_strzal'],
        subclasses2: [
          {
            id: 'arktoman',
            name: 'Arktoman',
            description: 'AoE freeze — Lodowa Burza zamraża całą drużynę wroga.',
            primaryBonus: { str: 0, agi: 1, wit: 1, int: 4 },
            bonusSkills: ['lodowa_burza'],
          },
          {
            id: 'krystaliczny',
            name: 'Krystaliczny',
            description: 'Mage-Tank — kryształowe tarcze 50 dmg na ally.',
            primaryBonus: { str: 0, agi: 0, wit: 3, int: 3 },
            bonusSkills: ['krysztal_obrony'],
          },
        ],
      },
    ],
  },
  druid: {
    id: 'druid',
    name: 'Druid',
    role: 'Healer',
    description: 'Natura, regeneracja, hybryda heal+def.',
    primaryBonus: { str: 0, agi: 1, wit: 1, int: 1 },
    baseSpeed: 5,
    startingSkills: ['splot_korzeni', 'kora_debu'],
    subclasses: [
      {
        id: 'korzennik',
        name: 'Korzennik',
        description: 'HoT specialist — heal-over-time z ogromnym totalem.',
        primaryBonus: { str: 0, agi: 0, wit: 1, int: 3 },
        bonusSkills: ['gaj_zycia'],
        subclasses2: [
          {
            id: 'drzewo_przodek',
            name: 'Drzewo Przodek',
            description: 'Pure HoT — Skarbnica Życia 10/turę 4 tury wszystkim.',
            primaryBonus: { str: 0, agi: 0, wit: 1, int: 4 },
            bonusSkills: ['skarbnica_zycia'],
          },
          {
            id: 'sloneczny',
            name: 'Słoneczny',
            description: 'Burst heal + cleanse — Promień Słońca leczy i czyści debuffy.',
            primaryBonus: { str: 0, agi: 0, wit: 2, int: 3 },
            bonusSkills: ['promien_slonca'],
          },
        ],
      },
      {
        id: 'burza',
        name: 'Burza',
        description: 'Hybrid heal+dmg — leczy i razi piorunami.',
        primaryBonus: { str: 0, agi: 2, wit: 0, int: 2 },
        bonusSkills: ['piorun'],
        subclasses2: [
          {
            id: 'grzmot',
            name: 'Grzmot',
            description: 'AoE dmg + slow — Tornado dla pełnego CC.',
            primaryBonus: { str: 0, agi: 1, wit: 0, int: 4 },
            bonusSkills: ['tornado'],
          },
          {
            id: 'zywiol',
            name: 'Żywioł',
            description: 'Multi-hit — Wir Żywiołów ze szansą na drugi cios.',
            primaryBonus: { str: 0, agi: 3, wit: 0, int: 2 },
            bonusSkills: ['wir'],
          },
        ],
      },
    ],
  },
  klecha: {
    id: 'klecha',
    name: 'Klecha',
    role: 'Healer',
    description: 'Wiara, burst heal, tarcze. Może wskrzesić raz na dungeon.',
    primaryBonus: { str: 0, agi: 0, wit: 1, int: 2 },
    baseSpeed: 3,
    startingSkills: ['swiate_uzdrowienie', 'tarcza_wiary'],
    subclasses: [
      {
        id: 'inkwizytor',
        name: 'Inkwizytor',
        description: 'Heal+Buff/debuff — nakłada osłabienia na wrogów.',
        primaryBonus: { str: 1, agi: 0, wit: 1, int: 2 },
        bonusSkills: ['osad_kacerza'],
        subclasses2: [
          {
            id: 'mlot_kacerski',
            name: 'Młot Kacerski',
            description: 'Smite-tier dmg + osłabienie -5 dmg 3 tury.',
            primaryBonus: { str: 1, agi: 0, wit: 1, int: 3 },
            bonusSkills: ['swiety_mlot'],
          },
          {
            id: 'kazn',
            name: 'Kaźń',
            description: 'AoE debuff master — -3 dmg + DoT na wszystkich wrogów.',
            primaryBonus: { str: 0, agi: 0, wit: 2, int: 3 },
            bonusSkills: ['osad'],
          },
        ],
      },
      {
        id: 'swietomat',
        name: 'Świętomat',
        description: 'Burst heal + revive 1× per dungeon.',
        primaryBonus: { str: 0, agi: 0, wit: 1, int: 3 },
        bonusSkills: ['ozyw'],
        subclasses2: [
          {
            id: 'arcyeasey',
            name: 'Arcyeasey',
            description: 'AoE HoT — Gloria 8/turę 3 tury wszystkim ally.',
            primaryBonus: { str: 0, agi: 0, wit: 1, int: 4 },
            bonusSkills: ['gloria'],
          },
          {
            id: 'slugi_swietosci',
            name: 'Słudzy Świętości',
            description: 'AoE heal + def — Chór Aniołów leczy i +5 def wszystkim ally.',
            primaryBonus: { str: 0, agi: 0, wit: 3, int: 2 },
            bonusSkills: ['chor_aniolow'],
          },
        ],
      },
    ],
  },
};

export function getClass(id: string): ClassDef | undefined {
  return CLASSES[id];
}

export function listClasses(): ClassDef[] {
  return Object.values(CLASSES);
}

export function findSubclass(parentId: string, subclassId: string): SubclassDef | undefined {
  return CLASSES[parentId]?.subclasses.find((s) => s.id === subclassId);
}

export function findSubclass2(
  parentClassId: string,
  parentSubId: string,
  sub2Id: string,
): SubclassDef | undefined {
  return findSubclass(parentClassId, parentSubId)?.subclasses2?.find((s) => s.id === sub2Id);
}

export function fmtPrimary(p: PrimaryStats): string {
  const parts: string[] = [];
  for (const k of ['str', 'agi', 'wit', 'int'] as const) {
    const v = p[k];
    if (v !== 0) parts.push(`${v >= 0 ? '+' : ''}${v} ${k.toUpperCase()}`);
  }
  return parts.length ? parts.join(', ') : '—';
}
