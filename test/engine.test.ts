import { describe, expect, it } from '@jest/globals';

import { decodeTelegram, extractBits, hasProfile, normalizeEep } from '../src/eep/engine.js';

describe('extractBits (MSB-first)', () => {
  it('extracts the top three bits of a byte', () => {
    expect(extractBits([0x70], 0, 3)).toBe(3); // 0b011 at offset 0
    expect(extractBits([0xe0], 0, 3)).toBe(7);
  });

  it('extracts a single low bit', () => {
    expect(extractBits([0x01], 7, 1)).toBe(1);
    expect(extractBits([0x01], 6, 1)).toBe(0);
  });

  it('spans byte boundaries', () => {
    expect(extractBits([0x00, 0xff], 8, 8)).toBe(255);
    expect(extractBits([0x0f, 0xf0], 4, 8)).toBe(0xff);
  });
});

describe('normalizeEep', () => {
  it('canonicalises EEP notation', () => {
    expect(normalizeEep('A5-04-01')).toBe('a5-04-01');
    expect(normalizeEep('a50401')).toBe('a5-04-01');
  });
});

describe('decodeTelegram (data-driven from eep.json)', () => {
  it('knows the bundled profiles', () => {
    expect(hasProfile('a5-04-01')).toBe(true);
    expect(hasProfile('zz-zz-zz')).toBe(false);
  });

  it('decodes A5-04-01 temperature + humidity with linear scaling', () => {
    // DB2 (offset 8) = 125 -> 50% ; DB1 (offset 16) = 125 -> 20°C ; DB0 bit3 LRNB=1 (data)
    const d = decodeTelegram('A5-04-01', [0x00, 125, 125, 0x08], 0x00);
    expect(d?.HUM?.value).toBeCloseTo(50, 5);
    expect(d?.HUM?.unit).toBe('%');
    expect(d?.TMP?.value).toBeCloseTo(20, 5);
    expect(d?.TMP?.unit).toBe('°C');
  });

  it('handles the inverted range of A5-02-05 temperature', () => {
    // range 255..0 -> scale 0..40 ; raw 128 -> ~19.92°C
    const d = decodeTelegram('A5-02-05', [0x00, 0x00, 128, 0x08], 0x00);
    expect(typeof d?.TMP?.value).toBe('number');
    expect(d?.TMP?.value as number).toBeGreaterThan(19);
    expect(d?.TMP?.value as number).toBeLessThan(21);
  });

  it('decodes D5-00-01 single contact enum', () => {
    expect(decodeTelegram('D5-00-01', [0x01], 0x00)?.CO?.value).toBe('closed');
    expect(decodeTelegram('D5-00-01', [0x00], 0x00)?.CO?.value).toBe('open');
  });

  it('selects an F6-02-01 case by status bits and decodes the rocker action', () => {
    // R1=3 (Button B0) + energy bow, status NU|T21 = 0x30
    const d = decodeTelegram('F6-02-01', [0x70], 0x30);
    expect(String(d?.R1?.value)).toContain('Button B');
    expect(d?.EB?.value).toBe('pressed');
  });

  it('returns undefined for an unknown EEP', () => {
    expect(decodeTelegram('zz-zz-zz', [0x00], 0x00)).toBeUndefined();
  });
});
