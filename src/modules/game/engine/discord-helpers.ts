import type { Client } from 'discord.js';

/**
 * Type guards i helpery dla Discord channel/thread API. Wcześniej każdy
 * service definiował własne kopie (`hasThreadCreateLocal`,
 * `hasPublicThreadCreate`, `hasThreadCreate`) — teraz jedno miejsce.
 */

export interface SendableChannel {
  send: (payload: unknown) => Promise<unknown>;
}

export interface ThreadCreatableChannel {
  threads: {
    create: (opts: unknown) => Promise<unknown>;
  };
}

export interface SendableThread {
  id: string;
  send: (payload: unknown) => Promise<{ id: string } | unknown>;
  setArchived?: (state: boolean) => Promise<unknown>;
  messages?: {
    fetch: (id: string) => Promise<{ edit: (payload: unknown) => Promise<unknown> } | null>;
  };
}

export function hasSendable(c: unknown): c is SendableChannel {
  if (!c || typeof c !== 'object') return false;
  if (!('send' in c)) return false;
  return typeof (c as { send: unknown }).send === 'function';
}

export function hasThreadCreate(c: unknown): c is ThreadCreatableChannel {
  if (!c || typeof c !== 'object') return false;
  if (!('threads' in c)) return false;
  const t = (c as { threads: unknown }).threads;
  if (!t || typeof t !== 'object') return false;
  if (!('create' in t)) return false;
  return typeof (t as { create: unknown }).create === 'function';
}

export function isSendableThread(t: unknown): t is SendableThread {
  if (!t || typeof t !== 'object') return false;
  if (!('id' in t) || typeof (t as { id: unknown }).id !== 'string') return false;
  if (!('send' in t) || typeof (t as { send: unknown }).send !== 'function') return false;
  return true;
}

/**
 * Edytuje wiadomość żeby usunąć components (np. po zamknięciu rejestracji
 * eventu). Tolerancyjne na brakujące API — silent fail-safe.
 */
export async function disableMessageComponents(
  client: Client,
  channelId: string,
  messageId: string,
): Promise<void> {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !('messages' in channel)) return;
  const msgs = (channel as { messages?: { fetch?: (id: string) => Promise<unknown> } }).messages;
  if (!msgs?.fetch) return;
  const msg = await msgs.fetch(messageId).catch(() => null);
  if (!msg || typeof msg !== 'object' || !('edit' in msg)) return;
  const edit = (msg as { edit?: (payload: unknown) => Promise<unknown> }).edit;
  if (!edit) return;
  await edit.call(msg, { components: [] }).catch(() => {});
}

/**
 * Wysyła kolejne batche `mentions` jako oddzielne wiadomości — używane
 * przy event announcements gdy chcemy pingnąć N graczy ale Discord ma
 * 2000 char limit per message. Pierwsza wiadomość zostaje pominięta
 * (caller już ją wysłał z headerem); ten helper dorzuca tylko nadmiar.
 */
export async function sendMentionBatches(
  channel: SendableChannel,
  mentions: string[],
  startFrom: number,
  batchSize = 50,
): Promise<void> {
  for (let i = startFrom; i < mentions.length; i += batchSize) {
    await channel
      .send({ content: mentions.slice(i, i + batchSize).join(' ').slice(0, 1900) })
      .catch(() => {});
  }
}
