/**
 * matterbridge-enocean — a Matterbridge dynamic platform plugin that exposes EnOcean devices
 * (battery-free switches and sensors) as Matter bridged devices.
 *
 * The plugin reads ESP3 telegrams from a local serial dongle or a ser2net TCP socket, decodes
 * them per the EnOcean Equipment Profile (EEP) declared in the config, and maps each device to
 * one or more Matter endpoints. New devices of an already-supported EEP need configuration only.
 *
 * @file module.ts
 * @author jr42
 * @license Apache-2.0
 */

import { MatterbridgeDynamicPlatform, type PlatformConfig, type PlatformMatterbridge } from 'matterbridge';
import { type AnsiLogger, type LogLevel } from 'matterbridge/logger';
import { isValidString } from 'matterbridge/utils';

import { type EnoceanPluginConfig, normalizeId } from './config.js';
import { type Erp1Telegram, Esp3Parser, formatId, parseErp1 } from './esp3/reader.js';
import { resolveProfile } from './profiles/registry.js';
import type { DeviceHandler, ProfileDeps } from './profiles/types.js';
import { openTransport, type Transport } from './transport.js';

/**
 * Plugin entry point. Matterbridge calls this to instantiate the platform.
 *
 * @param {PlatformMatterbridge} matterbridge - The Matterbridge instance.
 * @param {AnsiLogger} log - The plugin logger.
 * @param {PlatformConfig} config - The plugin configuration.
 * @returns {EnoceanPlatform} The platform instance.
 */
export default function initializePlugin(matterbridge: PlatformMatterbridge, log: AnsiLogger, config: PlatformConfig): EnoceanPlatform {
  return new EnoceanPlatform(matterbridge, log, config);
}

/** Default EnOcean USB300 serial baud rate. */
const DEFAULT_BAUD = 57600;
/** Default TCP reconnect delay. */
const DEFAULT_RECONNECT_MS = 5000;

/** The EnOcean dynamic platform. */
export class EnoceanPlatform extends MatterbridgeDynamicPlatform {
  /** Device handlers keyed by canonical EnOcean sender id. */
  private readonly handlers = new Map<string, DeviceHandler[]>();
  /** The active transport, if connected. */
  private transport?: Transport;
  /** Whether unknown ids should be logged for teach-in. */
  private teachIn = false;

  constructor(matterbridge: PlatformMatterbridge, log: AnsiLogger, config: PlatformConfig) {
    super(matterbridge, log, config);

    if (typeof this.verifyMatterbridgeVersion !== 'function' || !this.verifyMatterbridgeVersion('3.7.2')) {
      throw new Error(
        `This plugin requires Matterbridge version >= "3.7.2". Please update Matterbridge from ${this.matterbridge.matterbridgeVersion} to the latest version in the frontend.`,
      );
    }

    this.log.info('Initializing matterbridge-enocean platform...');
  }

  override async onStart(reason?: string): Promise<void> {
    this.log.info(`onStart called with reason: ${reason ?? 'none'}`);
    await this.ready;
    await this.clearSelect();

    const config = this.config as unknown as EnoceanPluginConfig;
    const baud = config.baud ?? DEFAULT_BAUD;
    this.teachIn = config.teachIn ?? false;
    const devices = Array.isArray(config.devices) ? config.devices : [];
    const deps: ProfileDeps = { vendorId: this.matterbridge.aggregatorVendorId, log: this.log };

    for (const device of devices) {
      if (!isValidString(device.id) || !isValidString(device.name)) {
        this.log.error('Skipping device with missing "id" or "name".');
        continue;
      }
      const factory = resolveProfile(device);
      if (!factory) {
        this.log.error(`No profile found for device "${device.name}" (eep=${device.eep ?? 'none'}, profile=${device.profile ?? 'none'}). Skipping.`);
        continue;
      }
      const handler = factory(device, deps);
      await this.registerDevice(handler.endpoint);

      const key = normalizeId(device.id);
      const list = this.handlers.get(key) ?? [];
      list.push(handler);
      this.handlers.set(key, list);
      this.log.info(`Registered EnOcean device "${device.name}" with id ${key}`);
    }

    if (!isValidString(config.device)) {
      this.log.warn('No "device" configured; the plugin will not connect to an EnOcean gateway. Set a serial path or tcp:// URL.');
      return;
    }
    this.startTransport(config.device, baud);
  }

  /**
   * Open the configured transport and wire received bytes through the ESP3 parser.
   *
   * @param {string} url - The serial path or tcp:// URL.
   * @param {number} baud - The serial baud rate.
   */
  private startTransport(url: string, baud: number): void {
    const parser = new Esp3Parser();
    this.log.info(`Connecting to EnOcean gateway at ${url}`);
    this.transport = openTransport(
      url,
      { baud, reconnectMs: DEFAULT_RECONNECT_MS, log: this.log },
      {
        onOpen: () => this.log.info(`EnOcean transport open: ${url}`),
        onClose: () => this.log.info('EnOcean transport closed.'),
        onError: (err) => this.log.error(`EnOcean transport error: ${err.message}`),
        onData: (chunk) => {
          for (const pkt of parser.feed(chunk)) {
            const telegram = parseErp1(pkt);
            if (telegram) {
              void this.dispatch(telegram);
            }
          }
        },
      },
    );
  }

  /**
   * Route a telegram to the handler(s) registered for its sender id.
   *
   * @param {Erp1Telegram} telegram - The decoded telegram.
   */
  private async dispatch(telegram: Erp1Telegram): Promise<void> {
    const handlers = this.handlers.get(telegram.senderId);
    if (!handlers || handlers.length === 0) {
      if (this.teachIn) {
        this.log.info(
          `EnOcean teach-in: unknown id ${telegram.senderId} rorg=0x${telegram.rorg.toString(16)} payload=[${formatId(telegram.payload)}] status=0x${telegram.status.toString(16)}`,
        );
      }
      return;
    }
    for (const handler of handlers) {
      try {
        await handler.handle(telegram);
      } catch (err) {
        this.log.error(`Error handling telegram for ${telegram.senderId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  override async onConfigure(): Promise<void> {
    await super.onConfigure();
    this.log.info('onConfigure called');
    for (const list of this.handlers.values()) {
      for (const handler of list) {
        if (handler.onConfigure) {
          await handler.onConfigure();
        }
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  override async onChangeLoggerLevel(logLevel: LogLevel): Promise<void> {
    this.log.info(`onChangeLoggerLevel called with: ${logLevel}`);
  }

  override async onShutdown(reason?: string): Promise<void> {
    await super.onShutdown(reason);
    this.log.info(`onShutdown called with reason: ${reason ?? 'none'}`);
    this.transport?.close();
    this.transport = undefined;
    if (this.config.unregisterOnShutdown === true) {
      await this.unregisterAllDevices();
    }
  }
}
