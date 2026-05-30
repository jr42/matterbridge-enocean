import { describe, expect, it } from '@jest/globals';

import { crc8 } from '../src/esp3/crc8.js';
import { Esp3Parser, formatId, PacketType, parseErp1 } from '../src/esp3/reader.js';

/** Build a valid ESP3 RADIO_ERP1 frame from an ERP1 data field. */
function buildFrame(data: number[], optional: number[] = []): Uint8Array {
  const header = [(data.length >> 8) & 0xff, data.length & 0xff, optional.length & 0xff, PacketType.RADIO_ERP1];
  const crc8h = crc8(header);
  const body = [...data, ...optional];
  const crc8d = crc8(body);
  return Uint8Array.from([0x55, ...header, crc8h, ...body, crc8d]);
}

// RPS telegram from sender 01:23:45:67, db0=0x10 (button AI pressed), status 0x30.
const RPS_DATA = [0xf6, 0x10, 0x01, 0x23, 0x45, 0x67, 0x30];

describe('PacketType', () => {
  it('uses 0x01 for ERP1 radio telegrams (what a USB300 emits)', () => {
    // Hardware ground truth: an Eltako FT55 press arrives as ESP3 packet type 0x01.
    // (0x0A is RADIO_ERP2 and must not be used for incoming radio.)
    expect(PacketType.RADIO_ERP1).toBe(0x01);
  });
});

describe('real USB300 frame shape (F6-02 rocker, ERP1 packet type 0x01)', () => {
  // Regression test for the on-the-wire framing a USB300 emits for an F6-02 rocker press:
  // ESP3 packet type 0x01, RORG 0xF6, single data byte (0x10 = button AI pressed).
  it('parses an ERP1 RPS frame', () => {
    const parser = new Esp3Parser();
    const packets = parser.feed(buildFrame(RPS_DATA));
    expect(packets).toHaveLength(1);
    const tg = parseErp1(packets[0]);
    expect(tg?.senderId).toBe('01:23:45:67');
    expect(tg?.rorg).toBe(0xf6);
    expect(Array.from(tg?.payload ?? [])).toEqual([0x10]);
  });
});

describe('Esp3Parser', () => {
  it('parses a complete frame', () => {
    const parser = new Esp3Parser();
    const packets = parser.feed(buildFrame(RPS_DATA));
    expect(packets).toHaveLength(1);
    expect(packets[0].packetType).toBe(PacketType.RADIO_ERP1);
    expect(Array.from(packets[0].data)).toEqual(RPS_DATA);
    expect(packets[0].optional).toHaveLength(0);
  });

  it('reassembles a frame split across chunks', () => {
    const parser = new Esp3Parser();
    const frame = buildFrame(RPS_DATA);
    expect(parser.feed(frame.slice(0, 3))).toHaveLength(0);
    expect(parser.feed(frame.slice(3, 8))).toHaveLength(0);
    const packets = parser.feed(frame.slice(8));
    expect(packets).toHaveLength(1);
    expect(Array.from(packets[0].data)).toEqual(RPS_DATA);
  });

  it('resynchronises after leading garbage', () => {
    const parser = new Esp3Parser();
    const frame = buildFrame(RPS_DATA);
    const packets = parser.feed(Uint8Array.from([0x00, 0xff, 0x55, 0x12, ...frame]));
    expect(packets).toHaveLength(1);
    expect(Array.from(packets[0].data)).toEqual(RPS_DATA);
  });

  it('parses two back-to-back frames', () => {
    const parser = new Esp3Parser();
    const buf = Uint8Array.from([...buildFrame(RPS_DATA), ...buildFrame(RPS_DATA)]);
    expect(parser.feed(buf)).toHaveLength(2);
  });

  it('drops a frame with a bad data CRC', () => {
    const parser = new Esp3Parser();
    const frame = Array.from(buildFrame(RPS_DATA));
    frame[frame.length - 1] ^= 0xff; // corrupt CRC8D
    expect(parser.feed(Uint8Array.from(frame))).toHaveLength(0);
  });
});

describe('parseErp1', () => {
  it('extracts rorg, payload, sender id and status from an RPS telegram', () => {
    const parser = new Esp3Parser();
    const [pkt] = parser.feed(buildFrame(RPS_DATA));
    const telegram = parseErp1(pkt);
    expect(telegram).not.toBeNull();
    expect(telegram?.rorg).toBe(0xf6);
    expect(Array.from(telegram?.payload ?? [])).toEqual([0x10]);
    expect(telegram?.senderId).toBe('01:23:45:67');
    expect(telegram?.status).toBe(0x30);
  });
});

describe('formatId', () => {
  it('formats bytes as colon-separated uppercase hex', () => {
    expect(formatId([0x01, 0x23, 0x45, 0x67])).toBe('01:23:45:67');
    expect(formatId(Uint8Array.from([0x00, 0x01]))).toBe('00:01');
  });
});
