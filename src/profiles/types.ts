/**
 * Profile interfaces. A profile turns one EnOcean device into one (or more) Matter endpoints
 * and knows how to apply incoming telegrams to them.
 *
 * @file types.ts
 */

import type { MatterbridgeEndpoint } from 'matterbridge';
import type { AnsiLogger } from 'matterbridge/logger';

import type { EnoceanDeviceConfig } from '../config.js';
import type { Erp1Telegram } from '../esp3/reader.js';

/** Dependencies handed to every profile factory. */
export interface ProfileDeps {
  /** Vendor id to stamp on the bridged device basic information cluster. */
  vendorId: number;
  /** Logger to use for endpoint updates. */
  log: AnsiLogger;
}

/** A built device: its (root) Matter endpoint plus the logic to apply telegrams to it. */
export interface DeviceHandler {
  /** The endpoint to register with Matterbridge. */
  readonly endpoint: MatterbridgeEndpoint;
  /** Optional hook to push persisted/initial attribute values once the node is online. */
  onConfigure?(): Promise<void>;
  /**
   * Apply an incoming telegram (already matched to this device's sender id).
   *
   * @param {Erp1Telegram} telegram - The decoded telegram for this device.
   */
  handle(telegram: Erp1Telegram): Promise<void>;
}

/** Factory that builds a {@link DeviceHandler} for a configured device. */
export type ProfileFactory = (device: EnoceanDeviceConfig, deps: ProfileDeps) => DeviceHandler;
