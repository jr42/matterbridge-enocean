import { describe, expect, it } from '@jest/globals';

import { normalizeId } from '../src/config.js';
import { decodeRocker, decodeWindowHandle } from '../src/profiles/decode.js';
import { eepToProfile, resolveProfile } from '../src/profiles/registry.js';

describe('decodeRocker (F6-02)', () => {
  const STATUS_NU = 0x30; // T21 + NU set

  it('decodes each button on press', () => {
    expect(decodeRocker(0x00 | 0x10, STATUS_NU)).toEqual({ button: 0, pressed: true }); // AI
    expect(decodeRocker(0x20 | 0x10, STATUS_NU)).toEqual({ button: 1, pressed: true }); // AO
    expect(decodeRocker(0x40 | 0x10, STATUS_NU)).toEqual({ button: 2, pressed: true }); // BI
    expect(decodeRocker(0x60 | 0x10, STATUS_NU)).toEqual({ button: 3, pressed: true }); // BO
  });

  it('marks releases (energy bow clear) as not pressed', () => {
    expect(decodeRocker(0x00, STATUS_NU)).toEqual({ button: 0, pressed: false });
  });

  it('ignores U-messages (NU bit clear)', () => {
    expect(decodeRocker(0x10, 0x20)).toBeNull();
  });

  it('ignores buttons above index 3', () => {
    expect(decodeRocker(0x80 | 0x10, STATUS_NU)).toBeNull();
  });
});

describe('decodeWindowHandle (F6-10-00)', () => {
  it('maps the three handle positions from the upper nibble', () => {
    expect(decodeWindowHandle(0xf0)).toBe('closed');
    expect(decodeWindowHandle(0xd0)).toBe('tilted');
    expect(decodeWindowHandle(0xc0)).toBe('open');
    expect(decodeWindowHandle(0xe0)).toBe('open');
  });

  it('ignores the unpredictable lower nibble', () => {
    expect(decodeWindowHandle(0xf5)).toBe('closed');
    expect(decodeWindowHandle(0xda)).toBe('tilted');
  });
});

describe('profile registry', () => {
  it('infers profiles from EEP', () => {
    expect(eepToProfile('F6-02-01')).toBe('rocker');
    expect(eepToProfile('F6-02-02')).toBe('rocker');
    expect(eepToProfile('F6-10-00')).toBe('window-handle');
    expect(eepToProfile('A5-02-05')).toBe('sensor'); // mapped sensor EEPs resolve to the generic profile
    expect(eepToProfile('ZZ-ZZ-ZZ')).toBeUndefined();
    expect(eepToProfile(undefined)).toBeUndefined();
  });

  it('resolves via explicit profile, then EEP', () => {
    expect(resolveProfile({ id: '1', name: 'x', profile: 'rocker' })).toBeDefined();
    expect(resolveProfile({ id: '1', name: 'x', eep: 'F6-10-00' })).toBeDefined();
    expect(resolveProfile({ id: '1', name: 'x' })).toBeUndefined();
  });
});

describe('normalizeId', () => {
  it('canonicalises various notations', () => {
    expect(normalizeId('01:23:45:67')).toBe('01:23:45:67');
    expect(normalizeId('01234567')).toBe('01:23:45:67');
    expect(normalizeId('01-23-45-67')).toBe('01:23:45:67');
    expect(normalizeId('01 23 45 67')).toBe('01:23:45:67');
  });
});
