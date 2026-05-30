/**
 * ESP3 frame reader and ERP1 telegram parser.
 *
 * ESP3 packet layout:
 *   0x55 | DataLen (2 bytes BE) | OptLen (1 byte) | PacketType (1 byte) | CRC8H |
 *   Data[DataLen] | OptionalData[OptLen] | CRC8D
 *
 * The reader is fed arbitrary byte chunks (from a serial port or TCP socket) and emits
 * complete, CRC-validated packets. It resynchronises on the 0x55 sync byte and tolerates
 * frames split across chunk boundaries.
 *
 * @file reader.ts
 */

import { crc8 } from './crc8.js';

/** ESP3 sync byte that prefixes every packet. */
export const ESP3_SYNC = 0x55;

/** ESP3 packet types (subset that we care about). */
export const PacketType = {
  // ERP1 radio telegrams (what a USB300 emits for incoming radio) are packet type 0x01.
  // 0x0A is RADIO_ERP2, a different framing not used here.
  RADIO_ERP1: 0x01,
  RESPONSE: 0x02,
  RADIO_SUB_TEL: 0x03,
  EVENT: 0x04,
  COMMON_COMMAND: 0x05,
  RADIO_ERP2: 0x0a,
} as const;

/** EnOcean radio telegram types (RORG). */
export const Rorg = {
  RPS: 0xf6,
  ONE_BS: 0xd5,
  FOUR_BS: 0xa5,
  VLD: 0xd2,
} as const;

/** A decoded ESP3 packet (CRCs already validated and stripped). */
export interface Esp3Packet {
  /** ESP3 packet type byte. */
  packetType: number;
  /** Payload data field. */
  data: Uint8Array;
  /** Optional data field (may be empty). */
  optional: Uint8Array;
}

/** A parsed ERP1 radio telegram. */
export interface Erp1Telegram {
  /** Radio telegram type (RORG), e.g. 0xF6 for RPS. */
  rorg: number;
  /** User payload bytes (the bytes between RORG and the sender id). For RPS this is a single byte. */
  payload: Uint8Array;
  /** Sender id formatted as a colon-separated uppercase hex string, e.g. "01:23:45:67". */
  senderId: string;
  /** Status byte of the telegram. */
  status: number;
}

/**
 * Stateful ESP3 frame parser. Feed it raw byte chunks; it returns any complete packets.
 */
export class Esp3Parser {
  private buf: number[] = [];

  /**
   * Feed a chunk of bytes and return any complete, CRC-valid packets discovered.
   *
   * @param {Uint8Array} chunk - Raw bytes received from the transport.
   * @returns {Esp3Packet[]} Zero or more decoded packets.
   */
  feed(chunk: Uint8Array): Esp3Packet[] {
    const out: Esp3Packet[] = [];
    for (const byte of chunk) {
      this.buf.push(byte);
    }

    for (;;) {
      // Resynchronise: drop everything before the next sync byte.
      while (this.buf.length > 0 && this.buf[0] !== ESP3_SYNC) {
        this.buf.shift();
      }
      // Need at least sync (1) + header (4) + CRC8H (1).
      if (this.buf.length < 6) {
        break;
      }

      const dataLen = (this.buf[1] << 8) | this.buf[2];
      const optLen = this.buf[3];
      const packetType = this.buf[4];
      const crc8h = this.buf[5];

      // Validate header CRC; if it fails this 0x55 was not a real frame start.
      if (crc8(this.buf.slice(1, 5)) !== crc8h) {
        this.buf.shift();
        continue;
      }

      const total = 6 + dataLen + optLen + 1;
      if (this.buf.length < total) {
        break; // wait for the rest of the frame
      }

      const body = this.buf.slice(6, 6 + dataLen + optLen);
      const crc8d = this.buf[total - 1];
      if (crc8(body) !== crc8d) {
        this.buf.shift();
        continue;
      }

      out.push({
        packetType,
        data: Uint8Array.from(this.buf.slice(6, 6 + dataLen)),
        optional: Uint8Array.from(this.buf.slice(6 + dataLen, 6 + dataLen + optLen)),
      });
      this.buf.splice(0, total);
    }

    return out;
  }

  /** Discard any buffered partial frame. */
  reset(): void {
    this.buf = [];
  }
}

/**
 * Parse an ESP3 RADIO_ERP1 packet into an ERP1 telegram.
 *
 * ERP1 data layout: RORG | payload... | SenderId (4 bytes) | Status (1 byte).
 *
 * @param {Esp3Packet} pkt - The ESP3 packet to interpret.
 * @returns {Erp1Telegram | null} The telegram, or null if the packet is not an ERP1 radio telegram.
 */
export function parseErp1(pkt: Esp3Packet): Erp1Telegram | null {
  if (pkt.packetType !== PacketType.RADIO_ERP1) {
    return null;
  }
  // Minimum: RORG + senderId(4) + status(1) = 6 bytes.
  if (pkt.data.length < 6) {
    return null;
  }
  const len = pkt.data.length;
  const rorg = pkt.data[0];
  const status = pkt.data[len - 1];
  const senderBytes = pkt.data.slice(len - 5, len - 1);
  const payload = pkt.data.slice(1, len - 5);
  return { rorg, payload, senderId: formatId(senderBytes), status };
}

/**
 * Format EnOcean id bytes as a colon-separated uppercase hex string.
 *
 * @param {Uint8Array | readonly number[]} bytes - The id bytes.
 * @returns {string} e.g. "01:23:45:67".
 */
export function formatId(bytes: Uint8Array | readonly number[]): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0').toUpperCase()).join(':');
}
