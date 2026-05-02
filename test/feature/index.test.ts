import { Client, GatewayIntentBits } from 'discord.js';
import * as indexModule from '../../src/index.js';
import * as ollamaModule from '../../src/ollama.js';

jest.mock('../../src/ollama.js');
jest.mock('../../src/tools.js');

describe('Discord Bot Integration', () => {
  let client: Client;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new Client({
      intents: [GatewayIntentBits.Guilds],
    });
  });

  test('handleMessage should reply with usage if no prompt', async () => {
    const mockMsg = {
      author: { bot: false, id: 'u1', username: 'user1' },
      content: '.ask ',
      channel: { isThread: () => false },
      reply: jest.fn().mockResolvedValue({}),
      react: jest.fn().mockResolvedValue({}),
    };

    await indexModule.handleMessage(client, mockMsg);
    expect(mockMsg.reply).toHaveBeenCalledWith('Użycie: `.ask <pytanie>`');
  });

  test('handleMessage should ignore bots', async () => {
    const mockMsg = {
      author: { bot: true, id: 'bot1', username: 'bot' },
      content: '.ask Hello',
      channel: { isThread: () => false },
      reply: jest.fn(),
    };

    await indexModule.handleMessage(client, mockMsg);
    expect(mockMsg.reply).not.toHaveBeenCalled();
  });

  test('handleMessage should ignore messages without prefix', async () => {
    const mockMsg = {
      author: { bot: false, id: 'u1', username: 'user1' },
      content: 'Hello there!',
      channel: { isThread: () => false },
      reply: jest.fn(),
    };

    await indexModule.handleMessage(client, mockMsg);
    expect(mockMsg.reply).not.toHaveBeenCalled();
  });

  test('handleMessage should start thread and answer in new thread', async () => {
    const mockThread = {
      sendTyping: jest.fn().mockResolvedValue({}),
      send: jest.fn().mockResolvedValue({ edit: jest.fn().mockResolvedValue({}) }),
      fetchStarterMessage: jest.fn().mockResolvedValue(null),
      messages: { fetch: jest.fn().mockResolvedValue(new Map()) },
    };

    const mockMsg = {
      author: { bot: false, id: 'u1', username: 'user1' },
      content: '.ask What is AI?',
      channel: { isThread: () => false },
      reply: jest.fn(),
      startThread: jest.fn().mockResolvedValue(mockThread),
      react: jest.fn().mockResolvedValue({}),
    };

    jest.mocked(ollamaModule.streamQwen).mockResolvedValue({
      content: 'AI is artificial intelligence.',
      toolCalls: [],
    });

    await indexModule.handleMessage(client, mockMsg);

    await new Promise((r) => setTimeout(r, 50)); // wait for async queue

    expect(mockMsg.startThread).toHaveBeenCalled();
    expect(mockThread.send).toHaveBeenCalledWith('…');
    expect(ollamaModule.streamQwen).toHaveBeenCalled();
  });
});
