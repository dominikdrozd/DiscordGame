import {
  closeBattleThread,
  deleteThreadNow,
  postBattleSummary,
  THREAD_DELETE_DELAY_MS,
} from '../../src/modules/game/engine/battle-helpers.js';

interface FakeThread {
  send: jest.Mock;
  setArchived: jest.Mock;
  delete: jest.Mock;
  parent: { send: jest.Mock } | null;
}

function makeThread(opts: { parent?: boolean } = {}): FakeThread {
  return {
    send: jest.fn().mockResolvedValue({ id: 'm' }),
    setArchived: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    parent: opts.parent ? { send: jest.fn().mockResolvedValue({ id: 'p' }) } : null,
  };
}

describe('closeBattleThread', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('wysyła postscript z info o usunięciu, archiwizuje, planuje delete za 120s', async () => {
    const thread = makeThread();
    await closeBattleThread(thread, '🏁 Test koniec.');
    expect(thread.send).toHaveBeenCalledTimes(1);
    expect(thread.send.mock.calls[0][0]).toContain('🏁 Test koniec.');
    expect(thread.send.mock.calls[0][0]).toContain('120s');
    expect(thread.setArchived).toHaveBeenCalledWith(true);
    expect(thread.delete).not.toHaveBeenCalled();

    jest.advanceTimersByTime(THREAD_DELETE_DELAY_MS);
    await Promise.resolve(); // flush microtasks

    expect(thread.delete).toHaveBeenCalledTimes(1);
  });

  test('pomija nie-thread (object bez send/setArchived)', async () => {
    await expect(closeBattleThread(null, '...')).resolves.toBeUndefined();
    await expect(closeBattleThread({}, '...')).resolves.toBeUndefined();
    await expect(closeBattleThread({ send: 'not a fn' }, '...')).resolves.toBeUndefined();
  });

  test('THREAD_DELETE_DELAY_MS to 120_000 (120s)', () => {
    expect(THREAD_DELETE_DELAY_MS).toBe(120_000);
  });
});

describe('deleteThreadNow', () => {
  test('wysyła postscript i usuwa wątek od razu (bez archiwizacji + delay)', async () => {
    const thread = makeThread();
    await deleteThreadNow(thread, '🛒 User zamknął.');
    expect(thread.send).toHaveBeenCalledWith('🛒 User zamknął.');
    expect(thread.delete).toHaveBeenCalledTimes(1);
    expect(thread.setArchived).not.toHaveBeenCalled();
  });

  test('fallback do archive+postscript gdy thread nie ma .delete', async () => {
    const thread = makeThread();
    const partial: { send: jest.Mock; setArchived: jest.Mock } = {
      send: thread.send,
      setArchived: thread.setArchived,
    };
    await deleteThreadNow(partial, 'Bez delete API');
    expect(partial.send).toHaveBeenCalledWith('Bez delete API');
    expect(partial.setArchived).toHaveBeenCalledWith(true);
  });

  test('milczy gdy thread w ogóle nie pasuje', async () => {
    await expect(deleteThreadNow(null, '...')).resolves.toBeUndefined();
    await expect(deleteThreadNow({}, '...')).resolves.toBeUndefined();
  });
});

describe('postBattleSummary', () => {
  test('wysyła do parent channel gdy thread.parent istnieje', async () => {
    const thread = makeThread({ parent: true });
    await postBattleSummary(thread, 'Win summary');
    expect(thread.parent?.send).toHaveBeenCalledWith('Win summary');
    expect(thread.send).not.toHaveBeenCalled();
  });

  test('fallback do thread.send gdy parent niedostępny', async () => {
    const thread = makeThread({ parent: false });
    await postBattleSummary(thread, 'Solo summary');
    expect(thread.send).toHaveBeenCalledWith('Solo summary');
  });

  test('milczy gdy ani parent ani thread.send nie pasuje', async () => {
    await expect(postBattleSummary(null, '...')).resolves.toBeUndefined();
    await expect(postBattleSummary({}, '...')).resolves.toBeUndefined();
  });
});
