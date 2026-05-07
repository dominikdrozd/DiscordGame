import { MessageFlags } from 'discord.js';
import { chat } from '../../src/managers/chat.manager.js';

interface FakeInteraction {
  replied: boolean;
  deferred: boolean;
  reply: jest.Mock;
  followUp: jest.Mock;
  update: jest.Mock;
  editReply: jest.Mock;
  deferReply: jest.Mock;
}

function makeInteraction(overrides: Partial<FakeInteraction> = {}): FakeInteraction {
  return {
    replied: false,
    deferred: false,
    reply: jest.fn().mockResolvedValue(undefined),
    followUp: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    deferReply: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('ChatManager', () => {
  describe('reply', () => {
    test('fresh interaction → wywołuje reply z content', async () => {
      const i = makeInteraction();
      await chat.reply(i as never, 'hello');
      expect(i.reply).toHaveBeenCalledWith({ content: 'hello' });
      expect(i.followUp).not.toHaveBeenCalled();
    });

    test('ephemeral=true ustawia flags MessageFlags.Ephemeral', async () => {
      const i = makeInteraction();
      await chat.reply(i as never, 'pst', { ephemeral: true });
      expect(i.reply).toHaveBeenCalledWith({
        content: 'pst',
        flags: MessageFlags.Ephemeral,
      });
    });

    test('replied=true → fallback do followUp', async () => {
      const i = makeInteraction({ replied: true });
      await chat.reply(i as never, 'after');
      expect(i.reply).not.toHaveBeenCalled();
      expect(i.followUp).toHaveBeenCalledWith({ content: 'after' });
    });

    test('deferred=true → fallback do followUp', async () => {
      const i = makeInteraction({ deferred: true });
      await chat.reply(i as never, 'late');
      expect(i.followUp).toHaveBeenCalledWith({ content: 'late' });
    });

    test('content > 1900 chars → slice + truncate suffix', async () => {
      const i = makeInteraction();
      const long = 'A'.repeat(2500);
      await chat.reply(i as never, long);
      const call = i.reply.mock.calls[0][0] as { content: string };
      expect(call.content.length).toBeLessThanOrEqual(1900);
      expect(call.content.endsWith('… [obcięte]')).toBe(true);
    });
  });

  describe('update', () => {
    test('fresh button → wywołuje interaction.update', async () => {
      const i = makeInteraction();
      await chat.update(i as never, 'edited');
      expect(i.update).toHaveBeenCalledWith({ content: 'edited' });
      expect(i.editReply).not.toHaveBeenCalled();
    });

    test('replied=true → fallback do editReply', async () => {
      const i = makeInteraction({ replied: true });
      await chat.update(i as never, 'after');
      expect(i.update).not.toHaveBeenCalled();
      expect(i.editReply).toHaveBeenCalledWith({ content: 'after' });
    });

    test('przekazuje components', async () => {
      const i = makeInteraction();
      const components: never[] = [];
      await chat.update(i as never, 'with rows', { components });
      expect(i.update).toHaveBeenCalledWith({ content: 'with rows', components });
    });
  });

  describe('followUp', () => {
    test('default ephemeral=true', async () => {
      const i = makeInteraction();
      await chat.followUp(i as never, 'side');
      expect(i.followUp).toHaveBeenCalledWith({
        content: 'side',
        flags: MessageFlags.Ephemeral,
      });
    });

    test('explicit ephemeral=false → bez flags', async () => {
      const i = makeInteraction();
      await chat.followUp(i as never, 'public', { ephemeral: false });
      expect(i.followUp).toHaveBeenCalledWith({ content: 'public' });
    });
  });

  describe('send', () => {
    test('wywołuje target.send z content', async () => {
      const send = jest.fn().mockResolvedValue({ id: 'msg-1' });
      const target = { id: 'ch-1', send };
      await chat.send(target, 'hello channel');
      expect(send).toHaveBeenCalledWith({ content: 'hello channel' });
    });

    test('content > 1900 → slice', async () => {
      const send = jest.fn().mockResolvedValue({ id: 'msg-1' });
      const target = { id: 'ch-clip', send };
      await chat.send(target, 'B'.repeat(2500));
      const call = send.mock.calls[0][0] as { content: string };
      expect(call.content.length).toBeLessThanOrEqual(1900);
    });

    test('per-channel queue: drugi send do tego samego id czeka na pierwszy', async () => {
      const order: string[] = [];
      let firstResolve: (v: unknown) => void = () => {};
      const send = jest.fn().mockImplementation((p: { content: string }) => {
        order.push(`start:${p.content}`);
        if (p.content === 'first') {
          return new Promise((resolve) => {
            firstResolve = (v) => {
              order.push(`done:${p.content}`);
              resolve(v);
            };
          });
        }
        order.push(`done:${p.content}`);
        return Promise.resolve({ id: p.content });
      });
      const target = { id: 'ch-queue', send };

      const p1 = chat.send(target, 'first');
      const p2 = chat.send(target, 'second');

      await Promise.resolve();
      await Promise.resolve();
      // Drugi NIE ruszył jeszcze — czeka w kolejce
      expect(order).toEqual(['start:first']);

      firstResolve({ id: 'first' });
      await Promise.all([p1, p2]);
      expect(order).toEqual(['start:first', 'done:first', 'start:second', 'done:second']);
    });

    test('różne channelId — concurrentne send (każdy ma swoją kolejkę)', async () => {
      const sendA = jest.fn().mockResolvedValue({ id: 'msg-A' });
      const sendB = jest.fn().mockResolvedValue({ id: 'msg-B' });
      await Promise.all([
        chat.send({ id: 'ch-A', send: sendA }, 'a'),
        chat.send({ id: 'ch-B', send: sendB }, 'b'),
      ]);
      expect(sendA).toHaveBeenCalledTimes(1);
      expect(sendB).toHaveBeenCalledTimes(1);
    });
  });

  describe('edit', () => {
    test('wywołuje message.edit z content + components', async () => {
      const edit = jest.fn().mockResolvedValue(undefined);
      const msg = { edit };
      const components: never[] = [];
      await chat.edit(msg, { content: 'updated', components });
      expect(edit).toHaveBeenCalledWith({ content: 'updated', components });
    });

    test('tylko components (bez content)', async () => {
      const edit = jest.fn().mockResolvedValue(undefined);
      const msg = { edit };
      await chat.edit(msg, { components: [] });
      expect(edit).toHaveBeenCalledWith({ components: [] });
    });
  });

  describe('retry behavior', () => {
    let consoleWarnSpy: jest.SpyInstance;
    let consoleDebugSpy: jest.SpyInstance;
    beforeEach(() => {
      consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
    });
    afterEach(() => {
      consoleWarnSpy.mockRestore();
      consoleDebugSpy.mockRestore();
    });

    test('transient 503 → retry i sukces na 2nd próbie', async () => {
      const send = jest
        .fn()
        .mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 503 }))
        .mockResolvedValueOnce({ id: 'msg-recovered' });
      const target = { id: 'ch-retry', send };
      const result = await chat.send(target, 'retried');
      expect(send).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ id: 'msg-recovered' });
    });

    test('429 (rate limit) → retryable', async () => {
      const send = jest
        .fn()
        .mockRejectedValueOnce(Object.assign(new Error('rate'), { status: 429 }))
        .mockResolvedValueOnce({ id: 'm' });
      const target = { id: 'ch-rate', send };
      await chat.send(target, 'x');
      expect(send).toHaveBeenCalledTimes(2);
    });

    test('non-retryable (400) → 1 attempt + null + warn log', async () => {
      const send = jest
        .fn()
        .mockRejectedValue(Object.assign(new Error('bad'), { status: 400 }));
      const target = { id: 'ch-400', send };
      const result = await chat.send(target, 'bad request');
      expect(send).toHaveBeenCalledTimes(1);
      expect(result).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    test('404 → 1 attempt + null + DEBUG log (nie warn)', async () => {
      const send = jest
        .fn()
        .mockRejectedValue(Object.assign(new Error('gone'), { status: 404 }));
      const target = { id: 'ch-404', send };
      const result = await chat.send(target, 'lost');
      expect(send).toHaveBeenCalledTimes(1);
      expect(result).toBeNull();
      expect(consoleDebugSpy).toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    test('ECONNRESET → retryable', async () => {
      const send = jest
        .fn()
        .mockRejectedValueOnce(Object.assign(new Error('reset'), { code: 'ECONNRESET' }))
        .mockResolvedValueOnce({ id: 'ok' });
      const target = { id: 'ch-econn', send };
      await chat.send(target, 'x');
      expect(send).toHaveBeenCalledTimes(2);
    });

    test('persistent 503 → 4 attempts (1 + 3 retries) → null', async () => {
      const send = jest
        .fn()
        .mockRejectedValue(Object.assign(new Error('down'), { status: 503 }));
      const target = { id: 'ch-down', send };
      const result = await chat.send(target, 'never works');
      expect(send).toHaveBeenCalledTimes(4);
      expect(result).toBeNull();
    });
  });

  describe('deferReply', () => {
    test('fresh interaction → deferReply', async () => {
      const i = makeInteraction();
      await chat.deferReply(i as never);
      expect(i.deferReply).toHaveBeenCalled();
    });

    test('replied=true → no-op', async () => {
      const i = makeInteraction({ replied: true });
      await chat.deferReply(i as never);
      expect(i.deferReply).not.toHaveBeenCalled();
    });

    test('ephemeral=true → flags Ephemeral', async () => {
      const i = makeInteraction();
      await chat.deferReply(i as never, true);
      expect(i.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    });
  });
});
