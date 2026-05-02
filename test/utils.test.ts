import { stripPrefix, displayName } from '../src/utils.js';

describe('utils', () => {
  describe('stripPrefix', () => {
    test('removes prefix and trims', () => {
      expect(stripPrefix('!ask Hello', '!ask ')).toBe('Hello');
      expect(stripPrefix('!ask   trim me  ', '!ask ')).toBe('trim me');
    });

    test('returns trimmed string if no prefix', () => {
      expect(stripPrefix('no prefix here', '!ask ')).toBe('no prefix here');
      expect(stripPrefix('  leading spaces  ', '!ask ')).toBe('leading spaces');
    });

    test('handles empty string', () => {
      expect(stripPrefix('', '!ask ')).toBe('');
      expect(stripPrefix('!ask ', '!ask ')).toBe('');
    });
  });

  describe('displayName', () => {
    test('uses member.displayName if available', () => {
      const msg = {
        author: { username: 'u1', globalName: null },
        member: { displayName: 'Nick1' },
      };
      expect(displayName(msg as any)).toBe('Nick1');
    });

    test('falls back to author.globalName', () => {
      const msg = { author: { username: 'u1', globalName: 'Global1' }, member: null };
      expect(displayName(msg as any)).toBe('Global1');
    });

    test('falls back to author.username', () => {
      const msg = { author: { username: 'u1', globalName: null }, member: null };
      expect(displayName(msg as any)).toBe('u1');
    });
  });
});
