/**
 * Data-driven EnOcean Equipment Profile (EEP) decoder.
 *
 * The plugin ships a vendored copy of the community EEP database (`data/eep.json` from
 * enocean-js/eep-spec, MIT licensed — see THIRD_PARTY_LICENSES.md). This module loads that
 * database and decodes a raw telegram (data payload + status byte) into named, scaled values
 * purely from the profile definition, so adding support for a new profile is a matter of
 * mapping it to Matter (see matter-map.ts) rather than hand-coding its bit layout.
 *
 * @file engine.ts
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** A single datafield definition from the EEP database (raw, string-typed). */
interface RawDatafield {
  reserved?: unknown;
  shortcut?: unknown;
  data?: unknown;
  description?: unknown;
  bitoffs?: string;
  bitsize?: string;
  unit?: unknown;
  enum?: { item?: RawEnumItem | RawEnumItem[] };
  range?: { min?: string; max?: string };
  scale?: { min?: string; max?: string };
}

/** A single enum item: either a discrete value or an inclusive range, each with a description. */
interface RawEnumItem {
  value?: string;
  min?: string;
  max?: string;
  description?: string;
}

/** A status-bit field used in a case condition (RPS telegrams). */
interface RawStatusfield {
  bitoffs?: string;
  bitsize?: string;
  value?: string;
}

/** A decoding case: optionally guarded by a status-bit condition. */
interface RawCase {
  condition?: { statusfield?: RawStatusfield | RawStatusfield[] };
  datafield?: RawDatafield | RawDatafield[];
}

/** A profile entry, or a reference stub that points at another entry. */
interface RawProfile {
  case?: RawCase[];
  ref?: { rorg?: string; func?: string; type?: string };
}

/** The whole database, keyed by lowercase EEP code (e.g. "a5-04-01"). */
type RawDatabase = Record<string, RawProfile>;

/** A decoded field value. */
export interface DecodedField {
  /** The raw integer extracted from the telegram. */
  raw: number;
  /** The decoded value: a scaled number for analog fields, or the enum description string. */
  value: number | string;
  /** The engineering unit, if the field is analog. */
  unit?: string;
}

/** All decoded fields of a telegram, keyed by EEP shortcut (e.g. "TMP", "HUM", "CO"). */
export type DecodedTelegram = Record<string, DecodedField>;

let cachedDb: RawDatabase | undefined;

/**
 * Load (and cache) the vendored EEP database.
 *
 * @returns {RawDatabase} The parsed database.
 */
function loadDatabase(): RawDatabase {
  if (cachedDb) {
    return cachedDb;
  }
  // Resolve data/eep.json relative to this module: dist/eep/engine.js or src/eep/engine.ts
  // both sit two levels below the package root, where data/ lives.
  const path = fileURLToPath(new URL('../../data/eep.json', import.meta.url));
  cachedDb = JSON.parse(readFileSync(path, 'utf8')) as RawDatabase;
  return cachedDb;
}

/**
 * Normalise a value that may be a single object or an array into an array.
 *
 * @param {T | T[] | undefined} v - The value to normalise.
 * @returns {T[]} The value as an array (empty if undefined).
 */
function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) {
    return [];
  }
  return Array.isArray(v) ? v : [v];
}

/**
 * Canonicalise an EEP code to the lowercase dashed form used as database keys.
 *
 * @param {string} eep - The EEP code in any notation (e.g. "A5-04-01" or "a50401").
 * @returns {string} The canonical key (e.g. "a5-04-01").
 */
export function normalizeEep(eep: string): string {
  const hex = eep.toLowerCase().replace(/[^0-9a-f]/g, '');
  if (hex.length === 6) {
    return `${hex.slice(0, 2)}-${hex.slice(2, 4)}-${hex.slice(4, 6)}`;
  }
  return eep.toLowerCase();
}

/**
 * Look up a profile, resolving reference stubs to their base definition.
 *
 * @param {string} eep - The EEP code in any notation.
 * @returns {RawProfile | undefined} The resolved profile, or undefined if unknown.
 */
function lookupProfile(eep: string): RawProfile | undefined {
  const db = loadDatabase();
  const key = normalizeEep(eep);
  const profile = db[key];
  if (!profile) {
    return undefined;
  }
  if (profile.ref && !profile.case) {
    const { rorg, func, type } = profile.ref;
    if (rorg && func && type) {
      return db[`${rorg}-${func}-${type}`.toLowerCase()];
    }
  }
  return profile;
}

/**
 * Whether the database knows the given EEP.
 *
 * @param {string} eep - The EEP code in any notation.
 * @returns {boolean} True if a profile is defined for it.
 */
export function hasProfile(eep: string): boolean {
  return lookupProfile(eep) !== undefined;
}

/**
 * Extract a big-endian (MSB-first) bit field from a byte array.
 *
 * EnOcean numbers data bits from the most significant bit of the first byte: bit offset 0 is
 * the MSB of byte 0. A field of `size` bits starting at `offset` is read MSB-first.
 *
 * @param {number[]} bytes - The data bytes.
 * @param {number} offset - The starting bit offset (0 = MSB of byte 0).
 * @param {number} size - The field width in bits.
 * @returns {number} The extracted unsigned integer.
 */
export function extractBits(bytes: number[], offset: number, size: number): number {
  let value = 0;
  for (let i = 0; i < size; i++) {
    const bit = offset + i;
    const byte = bytes[bit >> 3] ?? 0;
    const b = (byte >> (7 - (bit & 7))) & 1;
    value = (value << 1) | b;
  }
  return value >>> 0;
}

/**
 * Parse a numeric string that may be decimal, hex ("0x..") or signed ("+40").
 *
 * @param {string | undefined} s - The string to parse.
 * @returns {number} The parsed number, or NaN if it cannot be parsed.
 */
function parseNum(s: string | undefined): number {
  if (s === undefined) {
    return NaN;
  }
  const t = s.trim().replace(/^\+/, '');
  if (/^0x/i.test(t)) {
    return parseInt(t, 16);
  }
  return parseFloat(t);
}

/**
 * Whether a raw integer matches an enum item's value spec, which may be decimal ("3"),
 * hex ("0x01"), or binary with don't-care bits ("0b11X0XXXX").
 *
 * @param {number} raw - The extracted integer.
 * @param {number} size - The field width in bits (for binary mask alignment).
 * @param {string} spec - The enum item value spec.
 * @returns {boolean} True if the raw value matches.
 */
function matchEnumValue(raw: number, size: number, spec: string): boolean {
  const t = spec.trim();
  if (/^0b/i.test(t)) {
    const bits = t.slice(2);
    let mask = 0;
    let pattern = 0;
    for (const ch of bits) {
      mask <<= 1;
      pattern <<= 1;
      if (ch === '0' || ch === '1') {
        mask |= 1;
        pattern |= ch === '1' ? 1 : 0;
      }
    }
    // Left-align the binary spec within the field width if it is shorter.
    const shift = size - bits.length;
    if (shift > 0) {
      mask <<= shift;
      pattern <<= shift;
    }
    return (raw & mask) === pattern;
  }
  return raw === parseNum(t);
}

/**
 * Decode a single datafield's raw integer into a DecodedField.
 *
 * @param {RawDatafield} field - The datafield definition.
 * @param {number} raw - The raw integer extracted from the telegram.
 * @param {number} size - The field width in bits.
 * @returns {DecodedField} The decoded field.
 */
function decodeField(field: RawDatafield, raw: number, size: number): DecodedField {
  const unit = typeof field.unit === 'string' ? field.unit : undefined;

  // Analog field: linear map from the raw range to the engineering scale.
  if (field.range && field.scale) {
    const rMin = parseNum(field.range.min);
    const rMax = parseNum(field.range.max);
    const sMin = parseNum(field.scale.min);
    const sMax = parseNum(field.scale.max);
    if (Number.isFinite(rMin) && Number.isFinite(rMax) && Number.isFinite(sMin) && Number.isFinite(sMax) && rMax !== rMin) {
      const value = sMin + ((raw - rMin) * (sMax - sMin)) / (rMax - rMin);
      return { raw, value, unit };
    }
  }

  // Enum field: find the matching discrete value or range item.
  if (field.enum) {
    for (const item of asArray(field.enum.item)) {
      if (item.value !== undefined && matchEnumValue(raw, size, item.value)) {
        return { raw, value: item.description ?? String(raw), unit };
      }
      if (item.min !== undefined && item.max !== undefined) {
        const min = parseNum(item.min);
        const max = parseNum(item.max);
        if (raw >= min && raw <= max) {
          return { raw, value: item.description ?? String(raw), unit };
        }
      }
    }
  }

  return { raw, value: raw, unit };
}

/**
 * Whether a status condition matches the telegram status byte.
 *
 * @param {RawCase} c - The decoding case (optionally carrying a status condition).
 * @param {number} status - The telegram status byte.
 * @returns {boolean} True if the case applies.
 */
function conditionMatches(c: RawCase, status: number): boolean {
  const fields = asArray(c.condition?.statusfield);
  if (fields.length === 0) {
    return true;
  }
  return fields.every((f) => {
    const offset = parseNum(f.bitoffs);
    const size = parseNum(f.bitsize);
    const expected = parseNum(f.value);
    if (!Number.isFinite(offset) || !Number.isFinite(size) || !Number.isFinite(expected)) {
      return true;
    }
    return extractBits([status], offset, size) === expected;
  });
}

/**
 * Decode a telegram's data payload (and status byte) for the given EEP.
 *
 * @param {string} eep - The EEP code, e.g. "A5-04-01".
 * @param {number[]} payload - The RORG-specific data bytes (excluding sender id and status).
 * @param {number} status - The status byte.
 * @returns {DecodedTelegram | undefined} The decoded fields, or undefined if the EEP is unknown.
 */
export function decodeTelegram(eep: string, payload: number[], status: number): DecodedTelegram | undefined {
  const profile = lookupProfile(eep);
  if (!profile?.case) {
    return undefined;
  }
  const chosen = profile.case.find((c) => conditionMatches(c, status)) ?? profile.case[0];
  if (!chosen) {
    return undefined;
  }
  const result: DecodedTelegram = {};
  for (const field of asArray(chosen.datafield)) {
    const shortcut = typeof field.shortcut === 'string' ? field.shortcut : undefined;
    if (!shortcut || field.reserved !== undefined) {
      continue;
    }
    const offset = parseNum(field.bitoffs);
    const size = parseNum(field.bitsize);
    if (!Number.isFinite(offset) || !Number.isFinite(size)) {
      continue;
    }
    const raw = extractBits(payload, offset, size);
    result[shortcut] = decodeField(field, raw, size);
  }
  return result;
}
