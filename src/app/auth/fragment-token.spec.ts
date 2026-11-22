import { readFragmentToken } from './fragment-token';

describe('readFragmentToken', () => {
  it('reads the token from a mail-link fragment', () => {
    expect(readFragmentToken('token=abc_DEF-123')).toBe('abc_DEF-123');
  });

  it('returns null for a missing, empty or unrelated fragment', () => {
    expect(readFragmentToken(null)).toBeNull();
    expect(readFragmentToken('')).toBeNull();
    expect(readFragmentToken('token=')).toBeNull();
    expect(readFragmentToken('other=abc')).toBeNull();
  });

  it('refuses an implausibly long token', () => {
    expect(readFragmentToken(`token=${'a'.repeat(201)}`)).toBeNull();
    expect(readFragmentToken(`token=${'a'.repeat(200)}`)).toHaveLength(200);
  });
});
