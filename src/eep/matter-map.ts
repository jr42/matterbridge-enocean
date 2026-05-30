/**
 * EEP → Matter device-type mapping.
 *
 * The {@link engine} decodes a telegram into named fields (TMP, HUM, ILL, …); this table says
 * which Matter endpoint(s) each EEP becomes and which decoded field drives which sensor. It is
 * the one hand-authored layer the EEP database cannot provide (the database describes bit
 * layouts, not Matter semantics). Add a row here to support another sensor EEP with no new code.
 *
 * Stateful/event EEPs (F6-02 rocker, F6-10 window handle) are intentionally NOT here — they
 * have dedicated profile modules because momentary switches map to Matter *events*, not
 * attributes, and the handle needs a custom multi-contact representation.
 *
 * @file matter-map.ts
 */

import type { DecodedField } from './engine.js';

/** The kinds of Matter sensor endpoint the generic profile can build. */
export type SensorKind = 'temperature' | 'humidity' | 'illuminance' | 'occupancy' | 'contact' | 'co2';

/** One Matter sensor endpoint derived from one decoded EEP field. */
export interface SensorEndpointSpec {
  /** The kind of Matter endpoint to create. */
  kind: SensorKind;
  /** Child endpoint name shown in controllers (e.g. "Temperature"). */
  name: string;
  /** The EEP field shortcut that drives this endpoint (e.g. "TMP"). */
  shortcut: string;
  /** For boolean kinds (contact/occupancy), how to derive the boolean from the decoded field. */
  trueWhen?: (field: DecodedField) => boolean;
}

/** A full EEP → Matter mapping. */
export interface EepMapping {
  /** Vendor name stamped on the bridged device basic information. */
  vendor?: string;
  /** The sensor endpoints to expose. */
  endpoints: SensorEndpointSpec[];
}

/**
 * True when an occupancy/PIR field indicates presence.
 *
 * @param {DecodedField} f - The decoded occupancy field.
 * @returns {boolean} True if presence is detected.
 */
function pirOn(f: DecodedField): boolean {
  // A5-07: raw 0..127 = "PIR off", 128..255 = "PIR on". A5-08 OCC enum: description carries "on"/"occupied".
  if (typeof f.value === 'string') {
    const v = f.value.toLowerCase();
    if (v.includes('off') || v.includes('uninhabited') || v.includes('not')) {
      return false;
    }
    if (v.includes('on') || v.includes('occupied') || v.includes('motion')) {
      return true;
    }
  }
  return f.raw >= 128;
}

/**
 * True when a contact field indicates the contact is closed.
 *
 * @param {DecodedField} f - The decoded contact field.
 * @returns {boolean} True if the contact is closed.
 */
function contactClosed(f: DecodedField): boolean {
  return typeof f.value === 'string' ? f.value.toLowerCase().includes('closed') : f.raw === 1;
}

/**
 * The EEP → Matter mapping table. Keys are canonical lowercase EEP codes; a trailing "*"
 * matches any type byte within a func (e.g. "a5-02-*" matches a5-02-01 … a5-02-30).
 */
export const EEP_MATTER_MAP: Record<string, EepMapping> = {
  // Single input contact (window/door reed).
  'd5-00-01': { endpoints: [{ kind: 'contact', name: 'Contact', shortcut: 'CO', trueWhen: contactClosed }] },

  // Temperature sensors (all A5-02 variants share the TMP field).
  'a5-02-*': { endpoints: [{ kind: 'temperature', name: 'Temperature', shortcut: 'TMP' }] },

  // Temperature + humidity.
  'a5-04-*': {
    endpoints: [
      { kind: 'temperature', name: 'Temperature', shortcut: 'TMP' },
      { kind: 'humidity', name: 'Humidity', shortcut: 'HUM' },
    ],
  },

  // Light (illuminance). ILL1 is the field populated in the common single-range case.
  'a5-06-*': { endpoints: [{ kind: 'illuminance', name: 'Illuminance', shortcut: 'ILL1' }] },

  // Occupancy (PIR) with supply voltage.
  'a5-07-*': { endpoints: [{ kind: 'occupancy', name: 'Occupancy', shortcut: 'PIRS', trueWhen: pirOn }] },

  // Light + temperature + occupancy.
  'a5-08-*': {
    endpoints: [
      { kind: 'illuminance', name: 'Illuminance', shortcut: 'ILL' },
      { kind: 'temperature', name: 'Temperature', shortcut: 'TMP' },
      { kind: 'occupancy', name: 'Occupancy', shortcut: 'PIRS', trueWhen: pirOn },
    ],
  },

  // CO2 (+ temperature + humidity) — gas sensor.
  'a5-09-04': {
    endpoints: [
      { kind: 'co2', name: 'CO2', shortcut: 'Conc' },
      { kind: 'temperature', name: 'Temperature', shortcut: 'TMP' },
      { kind: 'humidity', name: 'Humidity', shortcut: 'HUM' },
    ],
  },

  // Room operating panel — expose the measured temperature (read-only; setpoint/fan need a thermostat).
  'a5-10-*': { endpoints: [{ kind: 'temperature', name: 'Temperature', shortcut: 'TMP' }] },
};

/**
 * Look up the Matter mapping for an EEP, honouring "func wildcard" entries.
 *
 * @param {string} eep - The canonical lowercase EEP code (e.g. "a5-02-05").
 * @returns {EepMapping | undefined} The mapping, or undefined if the EEP has no sensor mapping.
 */
export function lookupMatterMapping(eep: string): EepMapping | undefined {
  if (EEP_MATTER_MAP[eep]) {
    return EEP_MATTER_MAP[eep];
  }
  const wildcard = eep.replace(/-[0-9a-f]{2}$/, '-*');
  return EEP_MATTER_MAP[wildcard];
}
