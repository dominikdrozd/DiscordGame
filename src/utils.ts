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
  return (m.member?.displayName as string) || (m.author.globalName as string) || m.author.username;
}
