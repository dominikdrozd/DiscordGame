import { stripPrefix, displayName, errMsg } from '../../src/utils.js';

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
      expect(
        displayName({
          author: { username: 'u1', globalName: null },
          member: { displayName: 'Nick1' },
        }),
      ).toBe('Nick1');
    });

    test('falls back to author.globalName', () => {
      expect(
        displayName({
          author: { username: 'u1', globalName: 'Global1' },
          member: null,
        }),
      ).toBe('Global1');
    });

    test('falls back to author.username', () => {
      expect(
        displayName({
          author: { username: 'u1', globalName: null },
          member: null,
        }),
      ).toBe('u1');
    });
  });

  describe('errMsg', () => {
    test('returns Error.message', () => {
      expect(errMsg(new Error('boom'))).toBe('boom');
    });

    test('returns plain string as-is', () => {
      expect(errMsg('hello')).toBe('hello');
    });

    test('coerces non-error values via String()', () => {
      expect(errMsg(42)).toBe('42');
      expect(errMsg(null)).toBe('null');
      expect(errMsg(undefined)).toBe('undefined');
    });
  });
});
