export function stripPrefix(s: string, prefix: string): string {
  return s.startsWith(prefix) ? s.slice(prefix.length).trim() : s.trim();
}

interface MessageAuthor {
  username: string;
  globalName?: string | null;
}

interface Member {
  displayName?: string | null;
}

interface Message {
  author: MessageAuthor;
  member?: Member | null;
}

export function displayName(m: Message): string {
  return m.member?.displayName || m.author.globalName || m.author.username;
}

/**
 * Bezpieczne wyciąganie message z error-like object bez `as Error` castu.
 * Użycie: `catch (e) { console.error(errMsg(e)); }`.
 */
export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return String(e);
}
