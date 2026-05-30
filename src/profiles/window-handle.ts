/**
 * Profile: EnOcean F6-10-00 mechanical window handle (e.g. Hoppe SecuSignal) → two Contact
 * Sensor endpoints ("Closed" and "Tilted"), which together encode the three handle states:
 *   closed  → Closed=true,  Tilted=false
 *   tilted  → Closed=false, Tilted=true
 *   open    → Closed=false, Tilted=false
 *
 * @file window-handle.ts
 */

import { bridgedNode, contactSensor, MatterbridgeEndpoint } from 'matterbridge';
import { BooleanState } from 'matterbridge/matter/clusters';

import type { EnoceanDeviceConfig } from '../config.js';
import { normalizeId } from '../config.js';
import type { Erp1Telegram } from '../esp3/reader.js';
import { decodeWindowHandle } from './decode.js';
import type { DeviceHandler, ProfileDeps } from './types.js';

/**
 * Build a window-handle device handler.
 *
 * @param {EnoceanDeviceConfig} device - The device configuration.
 * @param {ProfileDeps} deps - Shared profile dependencies.
 * @returns {DeviceHandler} The built handler.
 */
export function createWindowHandle(device: EnoceanDeviceConfig, deps: ProfileDeps): DeviceHandler {
  const id = normalizeId(device.id);
  const serial = `EO-${id.replace(/:/g, '')}`;

  const endpoint = new MatterbridgeEndpoint([bridgedNode], { id: `enocean_${serial}` }, false).createDefaultBridgedDeviceBasicInformationClusterServer(
    device.name,
    serial,
    deps.vendorId,
    'Hoppe',
    device.eep ?? 'F6-10-00',
  );

  const closedEp = endpoint
    .addChildDeviceType('Closed', [contactSensor])
    .createDefaultIdentifyClusterServer()
    .createDefaultBooleanStateClusterServer(true)
    .addRequiredClusterServers();
  const tiltedEp = endpoint
    .addChildDeviceType('Tilted', [contactSensor])
    .createDefaultIdentifyClusterServer()
    .createDefaultBooleanStateClusterServer(false)
    .addRequiredClusterServers();

  return {
    endpoint,
    handle: async (telegram: Erp1Telegram): Promise<void> => {
      if (telegram.payload.length < 1) {
        return;
      }
      const state = decodeWindowHandle(telegram.payload[0]);
      await closedEp.setAttribute(BooleanState.Cluster.id, 'stateValue', state === 'closed', deps.log);
      await tiltedEp.setAttribute(BooleanState.Cluster.id, 'stateValue', state === 'tilted', deps.log);
    },
  };
}
