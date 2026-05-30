import { describe, expect, it } from '@jest/globals';

import { crc8 } from '../src/esp3/crc8.js';

describe('crc8 (EnOcean ESP3, poly 0x07)', () => {
  it('matches known single-byte CRC values', () => {
    // Hand-verifiable anchors for the 0x07 polynomial, MSB-first.
    expect(crc8([0x00])).toBe(0x00);
    expect(crc8([0x01])).toBe(0x07);
    expect(crc8([0x80])).toBe(0x89);
  });

  it('is order-dependent', () => {
    expect(crc8([0x01, 0x02])).not.toBe(crc8([0x02, 0x01]));
  });

  it('accepts a Uint8Array', () => {
    expect(crc8(Uint8Array.from([0x01]))).toBe(0x07);
  });

  it('honours the init value', () => {
    expect(crc8([0x02], crc8([0x01]))).toBe(crc8([0x01, 0x02]));
  });
});
