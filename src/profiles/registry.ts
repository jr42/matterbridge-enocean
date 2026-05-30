/**
 * Profile registry. Maps a profile name (explicit, or inferred from the EEP) to a factory.
 * Add new EEP support by writing a profile module and registering it here.
 *
 * @file registry.ts
 */

import type { EnoceanDeviceConfig } from '../config.js';
import { createRocker } from './rocker.js';
import { createSensor, hasSensorMapping } from './sensor.js';
import type { ProfileFactory } from './types.js';
import { createWindowHandle } from './window-handle.js';

/** Registered profiles by name. */
const PROFILES: Record<string, ProfileFactory> = {
  'rocker': createRocker,
  'window-handle': createWindowHandle,
  'sensor': createSensor,
};

/**
 * Infer a profile name from an EEP string.
 *
 * @param {string | undefined} eep - The EEP, e.g. "F6-02-01".
 * @returns {string | undefined} The profile name, or undefined if unknown.
 */
export function eepToProfile(eep: string | undefined): string | undefined {
  if (!eep) {
    return undefined;
  }
  const e = eep.toUpperCase();
  if (e.startsWith('F6-02')) {
    return 'rocker';
  }
  if (e === 'F6-10-00') {
    return 'window-handle';
  }
  // Any sensor EEP with a Matter mapping is handled by the generic data-driven profile.
  if (hasSensorMapping(eep)) {
    return 'sensor';
  }
  return undefined;
}

/**
 * Resolve the profile factory for a configured device.
 *
 * @param {EnoceanDeviceConfig} device - The device configuration.
 * @returns {ProfileFactory | undefined} The factory, or undefined if no profile matches.
 */
export function resolveProfile(device: EnoceanDeviceConfig): ProfileFactory | undefined {
  const name = device.profile ?? eepToProfile(device.eep);
  return name ? PROFILES[name] : undefined;
}

/**
 * List the names of all registered profiles.
 *
 * @returns {string[]} The registered profile names.
 */
export function registeredProfiles(): string[] {
  return Object.keys(PROFILES);
}
