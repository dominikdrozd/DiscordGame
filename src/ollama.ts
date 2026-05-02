import http from 'node:http';

const OLLAMA_URL =
  process.env.OLLAMA_URL || 'http://localhost:11434/api/generate';
const CHAT_URL = OLLAMA_URL.replace(/\/api\/generate\/?$/, '/api/chat');

export function streamQwen(
  model: string,
  messages: any[],
  onUpdate: (full: string) => void,
  tools: any[],
) {
  return new Promise((resolve, reject) => {
    const u = new URL(CHAT_URL);
    const body = JSON.stringify({
      model,
      messages,
      tools: tools && tools.length ? tools : undefined,
      stream: true,
      options: {
        temperature: 0,
        num_ctx: 4096,
        num_predict: 500,
      },
    });
    console.log('[stream] POST', CHAT_URL, 'model:', model);
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
          res.on('end', () =>
            reject(new Error(`Ollama ${res.statusCode}: ${err}`)),
          );
          return;
        }
        res.setEncoding('utf8');
        let buffer = '';
        let full = '';
        let chunkCount = 0;
        let evalCount = 0;
        let promptEvalCount = 0;
        let toolCalls: any[] = [];
        res.on('data', (chunk) => {
          buffer += chunk;
          let nl;
          while ((nl = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line) continue;
            let obj;
            try {
              obj = JSON.parse(line);
            } catch {
              console.error('[stream] parse fail:', line);
              continue;
            }
            const part = obj.message?.content ?? '';
            if (part) {
              full += part;
              chunkCount++;
              console.log(
                `[stream] chunk #${chunkCount} (+1 token, ${part.length} chars): ${JSON.stringify(part)}`,
              );
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
          console.log(
            `[stream] done: ${chunkCount} chunks, ${full.length} chars, prompt=${promptEvalCount} tok, generated=${evalCount} tok, tool_calls=${toolCalls.length}`,
          );
          resolve({ content: full.trim(), toolCalls });
        });
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
