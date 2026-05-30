/**
 * EnOcean Serial Protocol 3 (ESP3) CRC8.
 *
 * ESP3 uses a CRC8 with polynomial 0x07 (x^8 + x^2 + x + 1), MSB-first, no input/output
 * reflection and no final XOR. The same routine is used for the header CRC (CRC8H, over the
 * 4 header bytes) and the data CRC (CRC8D, over data + optional data).
 *
 * @file crc8.ts
 */

/** Precomputed CRC8 lookup table (polynomial 0x07, MSB-first). */
const CRC8_TABLE: Uint8Array = (() => {
  const table = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x80) !== 0 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
    }
    table[i] = crc;
  }
  return table;
})();

/**
 * Compute the ESP3 CRC8 over a byte range.
 *
 * @param {Uint8Array | readonly number[]} data - The bytes to checksum.
 * @param {number} [init] - The initial CRC value (defaults to 0).
 * @returns {number} The CRC8 value (0-255).
 */
export function crc8(data: Uint8Array | readonly number[], init = 0): number {
  let crc = init & 0xff;
  for (const byte of data) {
    crc = CRC8_TABLE[(crc ^ byte) & 0xff];
  }
  return crc & 0xff;
}
