/**
 * Generic, data-driven sensor profile. For any EEP present in the {@link EEP_MATTER_MAP},
 * this builds the mapped Matter sensor endpoint(s) and, on each telegram, decodes the payload
 * via the {@link decodeTelegram} engine and pushes the mapped fields to their attributes.
 *
 * This is what lets the plugin support many sensor EEPs (temperature, humidity, illuminance,
 * occupancy, contact, CO2, …) without per-profile code — only a row in the mapping table.
 *
 * @file sensor.ts
 */

import { airQualitySensor, bridgedNode, contactSensor, humiditySensor, lightSensor, MatterbridgeEndpoint, occupancySensor, temperatureSensor } from 'matterbridge';
import {
  BooleanState,
  CarbonDioxideConcentrationMeasurement,
  IlluminanceMeasurement,
  OccupancySensing,
  RelativeHumidityMeasurement,
  TemperatureMeasurement,
} from 'matterbridge/matter/clusters';

import type { EnoceanDeviceConfig } from '../config.js';
import { normalizeId } from '../config.js';
import { decodeTelegram, normalizeEep } from '../eep/engine.js';
import { lookupMatterMapping, type SensorEndpointSpec } from '../eep/matter-map.js';
import type { Erp1Telegram } from '../esp3/reader.js';
import type { DeviceHandler, ProfileDeps } from './types.js';

/**
 * Convert lux to the Matter IlluminanceMeasurement integer encoding.
 *
 * @param {number} lux - The illuminance in lux.
 * @returns {number} The Matter measuredValue encoding.
 */
function luxToMatter(lux: number): number {
  if (!Number.isFinite(lux) || lux <= 0) {
    return 0;
  }
  return Math.round(Math.min(10000 * Math.log10(lux), 0xfffe));
}

/** A built child endpoint plus the function that applies a decoded telegram to it. */
interface SensorChild {
  endpoint: MatterbridgeEndpoint;
  update(fields: ReturnType<typeof decodeTelegram>, log: ProfileDeps['log']): Promise<void>;
}

/**
 * Build one sensor child endpoint and its update function from a spec.
 *
 * @param {MatterbridgeEndpoint} parent - The bridged-node parent endpoint.
 * @param {SensorEndpointSpec} spec - The sensor endpoint specification.
 * @returns {SensorChild} The child endpoint and its update function.
 */
function buildChild(parent: MatterbridgeEndpoint, spec: SensorEndpointSpec): SensorChild {
  switch (spec.kind) {
    case 'temperature': {
      const ep = parent
        .addChildDeviceType(spec.name, [temperatureSensor])
        .createDefaultIdentifyClusterServer()
        .createDefaultTemperatureMeasurementClusterServer()
        .addRequiredClusterServers();
      return {
        endpoint: ep,
        update: async (fields, log) => {
          const f = fields?.[spec.shortcut];
          if (f && typeof f.value === 'number') {
            await ep.setAttribute(TemperatureMeasurement.Cluster.id, 'measuredValue', Math.round(f.value * 100), log);
          }
        },
      };
    }
    case 'humidity': {
      const ep = parent
        .addChildDeviceType(spec.name, [humiditySensor])
        .createDefaultIdentifyClusterServer()
        .createDefaultRelativeHumidityMeasurementClusterServer()
        .addRequiredClusterServers();
      return {
        endpoint: ep,
        update: async (fields, log) => {
          const f = fields?.[spec.shortcut];
          if (f && typeof f.value === 'number') {
            await ep.setAttribute(RelativeHumidityMeasurement.Cluster.id, 'measuredValue', Math.round(f.value * 100), log);
          }
        },
      };
    }
    case 'illuminance': {
      const ep = parent
        .addChildDeviceType(spec.name, [lightSensor])
        .createDefaultIdentifyClusterServer()
        .createDefaultIlluminanceMeasurementClusterServer()
        .addRequiredClusterServers();
      return {
        endpoint: ep,
        update: async (fields, log) => {
          const f = fields?.[spec.shortcut];
          if (f && typeof f.value === 'number') {
            await ep.setAttribute(IlluminanceMeasurement.Cluster.id, 'measuredValue', luxToMatter(f.value), log);
          }
        },
      };
    }
    case 'occupancy': {
      const ep = parent
        .addChildDeviceType(spec.name, [occupancySensor])
        .createDefaultIdentifyClusterServer()
        .createDefaultOccupancySensingClusterServer(false)
        .addRequiredClusterServers();
      return {
        endpoint: ep,
        update: async (fields, log) => {
          const f = fields?.[spec.shortcut];
          if (f) {
            const occupied = spec.trueWhen ? spec.trueWhen(f) : f.raw !== 0;
            await ep.setAttribute(OccupancySensing.Cluster.id, 'occupancy', { occupied }, log);
          }
        },
      };
    }
    case 'contact': {
      const ep = parent
        .addChildDeviceType(spec.name, [contactSensor])
        .createDefaultIdentifyClusterServer()
        .createDefaultBooleanStateClusterServer(true)
        .addRequiredClusterServers();
      return {
        endpoint: ep,
        update: async (fields, log) => {
          const f = fields?.[spec.shortcut];
          if (f) {
            const closed = spec.trueWhen ? spec.trueWhen(f) : f.raw === 1;
            await ep.setAttribute(BooleanState.Cluster.id, 'stateValue', closed, log);
          }
        },
      };
    }
    case 'co2': {
      const ep = parent
        .addChildDeviceType(spec.name, [airQualitySensor])
        .createDefaultIdentifyClusterServer()
        .createDefaultAirQualityClusterServer()
        .createDefaultCarbonDioxideConcentrationMeasurementClusterServer()
        .addRequiredClusterServers();
      return {
        endpoint: ep,
        update: async (fields, log) => {
          const f = fields?.[spec.shortcut];
          if (f && typeof f.value === 'number') {
            await ep.setAttribute(CarbonDioxideConcentrationMeasurement.Cluster.id, 'measuredValue', f.value, log);
          }
        },
      };
    }
  }
}

/**
 * Build a generic sensor device handler for an EEP that has a Matter mapping.
 *
 * @param {EnoceanDeviceConfig} device - The device configuration (must have a mapped `eep`).
 * @param {ProfileDeps} deps - Shared profile dependencies.
 * @returns {DeviceHandler} The built handler.
 */
export function createSensor(device: EnoceanDeviceConfig, deps: ProfileDeps): DeviceHandler {
  const eep = normalizeEep(device.eep ?? '');
  const mapping = lookupMatterMapping(eep);
  if (!mapping) {
    throw new Error(`No Matter mapping for EEP "${device.eep ?? 'none'}"`);
  }
  const id = normalizeId(device.id);
  const serial = `EO-${id.replace(/:/g, '')}`;

  const endpoint = new MatterbridgeEndpoint([bridgedNode], { id: `enocean_${serial}` }, false).createDefaultBridgedDeviceBasicInformationClusterServer(
    device.name,
    serial,
    deps.vendorId,
    mapping.vendor ?? 'EnOcean',
    device.eep ?? eep,
  );

  const children = mapping.endpoints.map((spec) => buildChild(endpoint, spec));

  return {
    endpoint,
    handle: async (telegram: Erp1Telegram): Promise<void> => {
      const fields = decodeTelegram(eep, Array.from(telegram.payload), telegram.status);
      if (!fields) {
        return;
      }
      for (const child of children) {
        await child.update(fields, deps.log);
      }
    },
  };
}

/**
 * Whether the given EEP can be handled by the generic sensor profile.
 *
 * @param {string | undefined} eep - The EEP code.
 * @returns {boolean} True if a Matter mapping exists for it.
 */
export function hasSensorMapping(eep: string | undefined): boolean {
  return eep !== undefined && lookupMatterMapping(normalizeEep(eep)) !== undefined;
}
