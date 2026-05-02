import fs from 'node:fs';
import path from 'node:path';

export interface Party {
  id: string;
  leaderId: string;
  members: string[];
  pendingInvites: string[];
  createdAt: number;
}

export const MAX_PARTY = 4;

let counter = 0;
function newPartyId(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter.toString(36)}`;
}

export class PartyService {
  private readonly file: string;
  private readonly parties: Map<string, Party> = new Map();

  constructor(file = path.resolve('data/parties.json')) {
    this.file = file;
    this.load();
  }

  private load(): void {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const arr = JSON.parse(raw) as Party[];
      for (const p of arr) {
        if (p?.id) this.parties.set(p.id, p);
      }
    } catch {
      // brak pliku — ok
    }
  }

  save(): void {
    const dir = path.dirname(this.file);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify([...this.parties.values()], null, 2), 'utf8');
  }

  list(): Party[] {
    return [...this.parties.values()];
  }

  get(id: string): Party | undefined {
    return this.parties.get(id);
  }

  getByMember(userId: string): Party | undefined {
    for (const p of this.parties.values()) {
      if (p.members.includes(userId)) return p;
    }
    return undefined;
  }

  getByPendingInvite(userId: string): Party | undefined {
    for (const p of this.parties.values()) {
      if (p.pendingInvites.includes(userId)) return p;
    }
    return undefined;
  }

  create(leaderId: string): Party {
    const existing = this.getByMember(leaderId);
    if (existing) return existing;
    const party: Party = {
      id: newPartyId(),
      leaderId,
      members: [leaderId],
      pendingInvites: [],
      createdAt: Date.now(),
    };
    this.parties.set(party.id, party);
    this.save();
    return party;
  }

  invite(
    partyId: string,
    leaderId: string,
    targetId: string,
  ): { ok: boolean; reason?: string; party?: Party } {
    const party = this.parties.get(partyId);
    if (!party) return { ok: false, reason: 'Party nie istnieje.' };
    if (party.leaderId !== leaderId) return { ok: false, reason: 'Tylko lider może zapraszać.' };
    if (party.members.includes(targetId))
      return { ok: false, reason: 'Ten user już jest w party.' };
    if (party.pendingInvites.includes(targetId))
      return { ok: false, reason: 'Zaproszenie już wysłane.' };
    if (party.members.length + party.pendingInvites.length >= MAX_PARTY)
      return { ok: false, reason: `Party pełne (max ${MAX_PARTY}).` };
    if (this.getByMember(targetId))
      return { ok: false, reason: 'Ten user jest już w innym party.' };
    party.pendingInvites.push(targetId);
    this.save();
    return { ok: true, party };
  }

  accept(partyId: string, userId: string): { ok: boolean; reason?: string; party?: Party } {
    const party = this.parties.get(partyId);
    if (!party) return { ok: false, reason: 'Party już nie istnieje.' };
    if (!party.pendingInvites.includes(userId))
      return { ok: false, reason: 'Nie masz tu zaproszenia.' };
    if (this.getByMember(userId)) return { ok: false, reason: 'Jesteś już w innym party.' };
    party.pendingInvites = party.pendingInvites.filter((id) => id !== userId);
    party.members.push(userId);
    this.save();
    return { ok: true, party };
  }

  decline(partyId: string, userId: string): { ok: boolean; party?: Party } {
    const party = this.parties.get(partyId);
    if (!party) return { ok: false };
    party.pendingInvites = party.pendingInvites.filter((id) => id !== userId);
    this.save();
    return { ok: true, party };
  }

  leave(userId: string): {
    ok: boolean;
    reason?: string;
    partyDisbanded?: boolean;
  } {
    const party = this.getByMember(userId);
    if (!party) return { ok: false, reason: 'Nie jesteś w żadnym party.' };
    party.members = party.members.filter((id) => id !== userId);
    if (party.members.length === 0) {
      this.parties.delete(party.id);
      this.save();
      return { ok: true, partyDisbanded: true };
    }
    if (party.leaderId === userId) {
      party.leaderId = party.members[0];
    }
    this.save();
    return { ok: true };
  }

  kick(partyId: string, leaderId: string, targetId: string): { ok: boolean; reason?: string } {
    const party = this.parties.get(partyId);
    if (!party) return { ok: false, reason: 'Party nie istnieje.' };
    if (party.leaderId !== leaderId) return { ok: false, reason: 'Tylko lider może wyrzucać.' };
    if (targetId === leaderId)
      return {
        ok: false,
        reason: 'Nie wyrzucisz sam siebie — użyj `.party leave`.',
      };
    if (!party.members.includes(targetId))
      return { ok: false, reason: 'Tego usera nie ma w party.' };
    party.members = party.members.filter((id) => id !== targetId);
    this.save();
    return { ok: true };
  }

  disband(partyId: string, leaderId: string): { ok: boolean; reason?: string } {
    const party = this.parties.get(partyId);
    if (!party) return { ok: false, reason: 'Party nie istnieje.' };
    if (party.leaderId !== leaderId)
      return { ok: false, reason: 'Tylko lider może rozwiązać party.' };
    this.parties.delete(partyId);
    this.save();
    return { ok: true };
  }
}
