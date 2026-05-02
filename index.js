import { Client, GatewayIntentBits, Events } from 'discord.js';
import http from 'node:http';
import 'dotenv/config';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434/api/generate';
const CHAT_URL = OLLAMA_URL.replace(/\/api\/generate\/?$/, '/api/chat');
const MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:7b';
const PREFIX = '!ask ';
const HISTORY_LIMIT = 50;
const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const MAX_TOOL_ROUNDS = 3;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_movie',
      description:
        'Wyszukuje film w TMDB po tytule. Zwraca listę dopasowań (id, tytuł, rok, opis, ocena). Wywołaj jako PIERWSZY krok zawsze, gdy pytanie dotyczy filmu.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Tytuł filmu (po polsku lub w oryginale).',
          },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_movie_details',
      description:
        'Pobiera szczegóły filmu z TMDB po jego id: reżyser, najważniejsi aktorzy, ocena, rok, gatunki, czas trwania, opis. Wywołaj ZAWSZE po search_movie, żeby uzyskać reżysera i obsadę przed prezentacją filmu.',
      parameters: {
        type: 'object',
        properties: {
          movie_id: {
            type: 'integer',
            description: 'Identyfikator filmu zwrócony przez search_movie (pole id).',
          },
        },
        required: ['movie_id'],
      },
    },
  },
];

async function searchMovie(title) {
  if (!TMDB_API_KEY) return { error: 'TMDB_API_KEY nie jest ustawiony w .env' };
  const url = `${TMDB_BASE}/search/movie?api_key=${encodeURIComponent(TMDB_API_KEY)}&language=pl-PL&query=${encodeURIComponent(title)}`;
  const res = await fetch(url);
  if (!res.ok) return { error: `TMDB ${res.status}: ${await res.text()}` };
  const data = await res.json();
  const results = (data.results || []).slice(0, 5).map((m) => ({
    id: m.id,
    title: m.title,
    original_title: m.original_title,
    release_date: m.release_date,
    overview: m.overview,
    vote_average: m.vote_average,
    popularity: m.popularity,
  }));
  return { query: title, results };
}

async function getMovieDetails(movieId) {
  if (!TMDB_API_KEY) return { error: 'TMDB_API_KEY nie jest ustawiony w .env' };
  const url = `${TMDB_BASE}/movie/${encodeURIComponent(movieId)}?api_key=${encodeURIComponent(TMDB_API_KEY)}&language=pl-PL&append_to_response=credits`;
  const res = await fetch(url);
  if (!res.ok) return { error: `TMDB ${res.status}: ${await res.text()}` };
  const data = await res.json();
  const directors = (data.credits?.crew || [])
    .filter((c) => c.job === 'Director')
    .map((c) => c.name);
  const cast = (data.credits?.cast || [])
    .slice(0, 5)
    .map((c) => ({ name: c.name, character: c.character }));

  const year = data.release_date ? data.release_date.slice(0, 4) : 'rok nieznany';
  const directorStr = directors.length ? directors.join(', ') : 'reżyser nieznany';
  const castStr = cast.length
    ? cast.map((c) => c.name).join(', ')
    : 'obsada nieznana';
  const rating =
    typeof data.vote_average === 'number' && data.vote_count
      ? `${data.vote_average.toFixed(1)}/10 (TMDB, ${data.vote_count} głosów)`
      : 'brak oceny';
  const genres = (data.genres || []).map((g) => g.name).join(', ');
  const titleLine =
    data.original_title && data.original_title !== data.title
      ? `„${data.title}" (oryg. „${data.original_title}", ${year})`
      : `„${data.title}" (${year})`;

  const formatted =
    `${titleLine} — reżyseria: ${directorStr}; w obsadzie m.in. ${castStr}. ` +
    `Gatunek: ${genres || 'nieznany'}. Ocena: ${rating}. ` +
    `${data.overview || 'Brak opisu w TMDB.'}`;

  return {
    formatted,
    id: data.id,
    title: data.title,
    original_title: data.original_title,
    release_date: data.release_date,
    runtime_min: data.runtime,
    genres: (data.genres || []).map((g) => g.name),
    overview: data.overview,
    vote_average: data.vote_average,
    vote_count: data.vote_count,
    directors,
    cast,
  };
}

async function runTool(call) {
  const name = call.function?.name;
  let args = call.function?.arguments ?? {};
  if (typeof args === 'string') {
    try { args = JSON.parse(args); } catch { args = {}; }
  }
  console.log(`[tool] -> ${name}(${JSON.stringify(args)})`);
  let result;
  if (name === 'search_movie') result = await searchMovie(args.title || '');
  else if (name === 'get_movie_details') result = await getMovieDetails(args.movie_id);
  else result = { error: `nieznane narzędzie: ${name}` };
  console.log(`[tool] <- ${JSON.stringify(result).slice(0, 200)}${JSON.stringify(result).length > 200 ? '…' : ''}`);
  return result;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

let queueTail = Promise.resolve();
function enqueue(task) {
  const run = queueTail.then(task, task);
  queueTail = run.catch(() => {});
  return run;
}

const SYSTEM_PROMPT =
  'Odpowiadasz jak naukowiec — rzeczowo, precyzyjnie, w oparciu o fakty — ale tłumaczysz tak, żeby zrozumiał Cię każdy laik, bez żargonu albo z natychmiastowym wyjaśnieniem terminu. Zachowuj poważny, uprzejmy ton; nie używaj wulgaryzmów, slangu ani emotikonów. W rozmowie może uczestniczyć kilka osób; każda wiadomość użytkownika jest poprzedzona "[Nick]:" — używaj tych nicków, żeby wiedzieć kto co napisał, i zwracaj się do nich po imieniu, gdy to pasuje. Twoje odpowiedzi NIE zaczynaj od "[Nick]:". OBOWIĄZKOWE NARZĘDZIA: gdy pytanie dotyczy jakiegokolwiek filmu — fabuły, roku, obsady, oceny, gatunku, reżysera, polecenia, rekomendacji, opisu — MUSISZ najpierw wywołać `search_movie` z tytułem, potem `get_movie_details` z `id` najlepszego wyniku, i dopiero wtedy odpowiedzieć. Nie odpowiadaj o filmach z pamięci, nie wymyślaj tytułów, reżyserów ani aktorów — wszystko musi pochodzić z wyników narzędzi. Wynik `get_movie_details` zawiera pole `formatted` — to jest gotowa, autorytatywna prezentacja filmu (tytuł, rok, reżyser, obsada, gatunek, ocena, opis). Użyj tego pola dosłownie jako trzonu odpowiedzi; możesz dopisać maksymalnie jedno krótkie zdanie kontekstu odpowiadającego na pytanie użytkownika (np. dlaczego polecasz). Nie używaj list, nagłówków ani bloków kodu; w odpowiedziach niezwiązanych z filmami trzymaj się maksymalnie trzech zdań.';

function displayName(m) {
  return m.member?.displayName || m.author.globalName || m.author.username;
}

function stripPrefix(s) {
  return s.startsWith(PREFIX) ? s.slice(PREFIX.length).trim() : s.trim();
}

function streamQwen(messages, onUpdate, tools) {
  return new Promise((resolve, reject) => {
    const u = new URL(CHAT_URL);
    const body = JSON.stringify({
      model: MODEL,
      messages,
      tools: tools && tools.length ? tools : undefined,
      stream: true,
      options: {
        temperature: 0,
        num_ctx: 4096,
        num_predict: 500,
      },
    });
    console.log('[stream] POST', CHAT_URL);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port || 80,
        path: u.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        console.log('[stream] status', res.statusCode);
        if (res.statusCode !== 200) {
          let err = '';
          res.on('data', (d) => (err += d));
          res.on('end', () => reject(new Error(`Ollama ${res.statusCode}: ${err}`)));
          return;
        }
        res.setEncoding('utf8');
        let buffer = '';
        let full = '';
        let chunkCount = 0;
        let evalCount = 0;
        let promptEvalCount = 0;
        let toolCalls = [];
        res.on('data', (chunk) => {
          buffer += chunk;
          let nl;
          while ((nl = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line) continue;
            let obj;
            try { obj = JSON.parse(line); } catch {
              console.error('[stream] parse fail:', line);
              continue;
            }
            const part = obj.message?.content ?? '';
            if (part) {
              full += part;
              chunkCount++;
              console.log(`[stream] chunk #${chunkCount} (+1 token, ${part.length} chars): ${JSON.stringify(part)}`);
              onUpdate(full);
            }
            const tc = obj.message?.tool_calls;
            if (Array.isArray(tc) && tc.length) {
              toolCalls = toolCalls.concat(tc);
            }
            if (obj.done) {
              evalCount = obj.eval_count ?? 0;
              promptEvalCount = obj.prompt_eval_count ?? 0;
            }
          }
        });
        res.on('end', () => {
          console.log(`[stream] done: ${chunkCount} chunks, ${full.length} chars, prompt=${promptEvalCount} tok, generated=${evalCount} tok, tool_calls=${toolCalls.length}`);
          resolve({ content: full.trim(), toolCalls });
        });
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function buildHistory(thread, currentMsg) {
  const out = [];
  try {
    const starter = await thread.fetchStarterMessage();
    if (starter && starter.id !== currentMsg.id && starter.content) {
      const content = stripPrefix(starter.content);
      if (content) {
        const isBot = starter.author.id === client.user.id;
        out.push({
          role: isBot ? 'assistant' : 'user',
          content: isBot ? content : `[${displayName(starter)}]: ${content}`,
        });
      }
    }
  } catch {}

  const fetched = await thread.messages.fetch({ limit: HISTORY_LIMIT });
  const ordered = [...fetched.values()]
    .filter((m) => m.id !== currentMsg.id && m.content)
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  for (const m of ordered) {
    const content = stripPrefix(m.content);
    if (!content) continue;
    const isBot = m.author.id === client.user.id;
    out.push({
      role: isBot ? 'assistant' : 'user',
      content: isBot ? content : `[${displayName(m)}]: ${content}`,
    });
  }
  return out;
}

client.once(Events.ClientReady, (c) => {
  console.log(`Zalogowano jako ${c.user.tag}`);
});

client.on(Events.MessageCreate, async (msg) => {
  if (msg.author.bot) return;

  const inOurThread =
    msg.channel.isThread?.() && msg.channel.ownerId === client.user.id;

  let prompt;
  if (inOurThread) {
    prompt = stripPrefix(msg.content);
    if (!prompt) return;
  } else {
    if (!msg.content.startsWith(PREFIX)) return;
    prompt = msg.content.slice(PREFIX.length).trim();
    if (!prompt) {
      await msg.reply('Użycie: `!ask <pytanie>`');
      return;
    }
  }

  await enqueue(async () => {
    let target;
    try {
      target = inOurThread
        ? msg.channel
        : await msg.startThread({
            name: prompt.slice(0, 90) || 'qwen',
            autoArchiveDuration: 60,
          });

      const messages = [{ role: 'system', content: SYSTEM_PROMPT }];
      if (inOurThread) {
        messages.push(...(await buildHistory(target, msg)));
      }
      messages.push({ role: 'user', content: `[${displayName(msg)}]: ${prompt}` });

      await target.sendTyping();
      const placeholder = await target.send('…');

      let latest = '';
      let lastSent = '…';
      let timer = null;

      const pushEdit = async () => {
        timer = null;
        const text = latest.length > 1900 ? latest.slice(0, 1900) + '…' : latest;
        const next = text || '…';
        if (next === lastSent) return;
        lastSent = next;
        try {
          await placeholder.edit(next);
        } catch (e) {
          console.error('edit fail:', e?.message);
        }
      };
      const schedule = () => {
        if (timer) return;
        timer = setTimeout(pushEdit, 1000);
      };

      let answer = '';
      for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        const { content, toolCalls } = await streamQwen(
          messages,
          (full) => {
            latest = full;
            schedule();
          },
          TOOLS,
        );

        if (toolCalls.length === 0) {
          answer = content || '(pusta odpowiedź)';
          break;
        }

        const names = toolCalls
          .map((c) => `${c.function?.name}(${JSON.stringify(c.function?.arguments ?? {})})`)
          .join(', ');
        console.log(`[round ${round}] tool_calls: ${names}`);

        if (timer) { clearTimeout(timer); timer = null; }
        latest = `🔎 Sprawdzam: ${names}…`;
        await pushEdit();

        messages.push({ role: 'assistant', content, tool_calls: toolCalls });
        for (const call of toolCalls) {
          const result = await runTool(call);
          messages.push({
            role: 'tool',
            name: call.function?.name,
            content: JSON.stringify(result),
          });
        }
        latest = '';
        lastSent = latest;
      }

      if (timer) { clearTimeout(timer); timer = null; }
      latest = answer;
      await pushEdit();
      await msg.react('✅').catch(() => {});
    } catch (err) {
      console.error(err);
      await (target ?? msg).send(`Błąd: ${err.message}`).catch(() => {});
      await msg.react('❌').catch(() => {});
    }
  });
});

client.login(process.env.DISCORD_TOKEN);
