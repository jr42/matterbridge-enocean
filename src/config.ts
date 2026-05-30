/**
 * Plugin configuration types and helpers.
 *
 * @file config.ts
 */

/** Per-device configuration entry from the plugin config. */
export interface EnoceanDeviceConfig {
  /** EnOcean id, e.g. "01:23:45:67" (also accepts "01234567" or "01-23-45-67"). */
  id: string;
  /** Friendly name shown in Matter controllers. */
  name: string;
  /** EnOcean Equipment Profile, e.g. "F6-02-01" or "F6-10-00". Used to infer the profile. */
  eep?: string;
  /** Explicit profile name, overriding the one inferred from the EEP. */
  profile?: string;
  /** Number of buttons to expose (rocker profile; default 4, max 8). */
  buttons?: number;
  /** Optional friendly names per button, in index order (rocker profile). */
  buttonNames?: string[];
  /** Profile-specific options (e.g. number of rocker buttons). */
  [key: string]: unknown;
}

/** The plugin configuration as provided by Matterbridge. */
export interface EnoceanPluginConfig {
  /** Device path or URL: a serial path ("/dev/ttyUSB0") or a TCP socket ("tcp://host:port"). */
  device?: string;
  /** Serial baud rate (EnOcean USB300 uses 57600). */
  baud?: number;
  /** The list of devices to expose. */
  devices?: EnoceanDeviceConfig[];
  /** When true, log unknown sender ids and raw telegrams to help discover device ids. */
  teachIn?: boolean;
}

/**
 * Normalise an EnOcean id to the canonical colon-separated uppercase form ("01:23:45:67").
 * Accepts ids with colons, dashes, spaces, or none, and ignores any non-hex characters.
 *
 * @param {string} id - The id in any common notation.
 * @returns {string} The canonical id, or the original (uppercased) string if it has no hex digits.
 */
export function normalizeId(id: string): string {
  const hex = id.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  if (hex.length === 0) {
    return id.toUpperCase();
  }
  const pairs = hex.match(/.{1,2}/g);
  return pairs ? pairs.join(':') : hex;
}
