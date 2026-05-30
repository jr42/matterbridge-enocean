/**
 * Profile: EnOcean F6-02-0x rocker switch (e.g. Eltako FT55, PTM21x) → N momentary
 * Generic Switch endpoints. Each button press emits a single-press Switch event.
 *
 * Buttons are pre-named and tagged straight from the EnOcean Equipment Profile, so a
 * standard 2-rocker switch needs no per-button configuration. The EEP spec names the four
 * buttons of an F6-02 switch AI / AO / BI / BO — Rocker A/B, I-contact (bottom, solid arrow)
 * / O-contact (top, empty arrow). The application style flips which physical half is top:
 *   - F6-02-01 ("Style 1", 0-state up, common in the EU):  I = bottom, O = top
 *   - F6-02-02 ("Style 2", I-state up, common in the US):  I = top,    O = bottom
 * The two styles are otherwise byte-identical; choosing the EEP is the single "rotation"
 * setting. Each child Generic Switch also carries semantic tags (a NumberTag for "which
 * button" and PositionTag left/right + top/bottom) that stricter Matter hubs such as the
 * Aqara M200 use to enumerate and label the buttons. The optional `buttonNames` config
 * overrides the derived names (e.g. "Kitchen Light").
 *
 * @file rocker.ts
 */

import { bridgedNode, genericSwitch, MatterbridgeEndpoint } from 'matterbridge';
import { NumberTag, PositionTag } from 'matterbridge/matter';

import type { EnoceanDeviceConfig } from '../config.js';
import { normalizeId } from '../config.js';
import type { Erp1Telegram } from '../esp3/reader.js';
import { decodeRocker } from './decode.js';
import type { DeviceHandler, ProfileDeps } from './types.js';

/** A Matter semantic tag, derived from the tag values rather than the matter package's globals. */
type Semtag = typeof NumberTag.One;

/** Default number of buttons for a 2-rocker EnOcean switch. */
const DEFAULT_BUTTONS = 4;
/** Maximum number of buttons we will expose. */
const MAX_BUTTONS = 8;

/** NumberTag entries indexed 0..7, used to identify "which button". */
const NUMBER_TAGS = [NumberTag.One, NumberTag.Two, NumberTag.Three, NumberTag.Four, NumberTag.Five, NumberTag.Six, NumberTag.Seven, NumberTag.Eight];

/**
 * The EnOcean F6-02 rocker actions, in telegram order (AI, AO, BI, BO). `rocker` is the
 * rocker half (A = left, B = right); `contact` is the I/O contact of that rocker.
 */
const ROCKER_ACTIONS = [
  { rocker: 'A', contact: 'I' },
  { rocker: 'A', contact: 'O' },
  { rocker: 'B', contact: 'I' },
  { rocker: 'B', contact: 'O' },
] as const;

/**
 * Whether the given EEP is application style 2 (F6-02-02, "I-state up"), which flips the
 * physical top/bottom assignment of the I/O contacts relative to style 1 (F6-02-01).
 *
 * @param {string | undefined} eep - The device EEP, e.g. "F6-02-01" or "F6-02-02".
 * @returns {boolean} True for F6-02-02, false otherwise (style 1 is the default).
 */
export function isStyle2(eep: string | undefined): boolean {
  return typeof eep === 'string' && eep.toUpperCase().replace(/[^0-9A-F]/g, '') === 'F60202';
}

/**
 * The default, EEP-derived name for a rocker button (e.g. "Rocker A Bottom").
 *
 * @param {number} index - Zero-based button index (0..3 for a 2-rocker switch).
 * @param {boolean} style2 - True for F6-02-02 (flips top/bottom).
 * @returns {string | undefined} The derived name, or undefined for indexes outside the 2-rocker layout.
 */
export function defaultButtonName(index: number, style2: boolean): string | undefined {
  const action = ROCKER_ACTIONS[index];
  if (!action) {
    return undefined;
  }
  const top = style2 ? action.contact === 'I' : action.contact === 'O';
  return `Rocker ${action.rocker} ${top ? 'Top' : 'Bottom'}`;
}

/**
 * Build the semantic tag list for a button: a NumberTag ("which button") plus, for the
 * canonical 4-button rocker, the left/right + top/bottom PositionTags.
 *
 * @param {number} index - Zero-based button index.
 * @param {number} count - Total number of buttons on the device.
 * @param {boolean} [style2] - True for F6-02-02 (flips top/bottom). Defaults to style 1.
 * @returns {Semtag[]} The tag list.
 */
export function buttonTagList(index: number, count: number, style2 = false): Semtag[] {
  const tags: Semtag[] = [];
  const number = NUMBER_TAGS[index];
  if (number) {
    tags.push(number);
  }
  // Only apply the rocker position layout for the canonical 4-button device.
  const action = ROCKER_ACTIONS[index];
  if (count === DEFAULT_BUTTONS && action) {
    tags.push(action.rocker === 'A' ? PositionTag.Left : PositionTag.Right);
    const top = style2 ? action.contact === 'I' : action.contact === 'O';
    tags.push(top ? PositionTag.Top : PositionTag.Bottom);
  }
  return tags;
}

/**
 * Build a rocker-switch device handler.
 *
 * @param {EnoceanDeviceConfig} device - The device configuration.
 * @param {ProfileDeps} deps - Shared profile dependencies.
 * @returns {DeviceHandler} The built handler.
 */
export function createRocker(device: EnoceanDeviceConfig, deps: ProfileDeps): DeviceHandler {
  const id = normalizeId(device.id);
  const serial = `EO-${id.replace(/:/g, '')}`;
  const count = typeof device.buttons === 'number' && device.buttons > 0 && device.buttons <= MAX_BUTTONS ? device.buttons : DEFAULT_BUTTONS;
  const buttonNames = Array.isArray(device.buttonNames) ? device.buttonNames : [];
  const style2 = isStyle2(device.eep);

  const eep = device.eep ?? 'F6-02-01';
  // Use a human-readable product name; some controllers (e.g. Aqara) show the Matter
  // productName as the device title, where the bare EEP string ("F6-02-01") is meaningless.
  const productName = `EnOcean Rocker (${eep})`;
  const endpoint = new MatterbridgeEndpoint([bridgedNode], { id: `enocean_${serial}` }, false).createDefaultBridgedDeviceBasicInformationClusterServer(
    device.name,
    serial,
    deps.vendorId,
    'EnOcean',
    productName,
  );

  const buttons: MatterbridgeEndpoint[] = [];
  for (let i = 0; i < count; i++) {
    const override = buttonNames[i];
    const name = typeof override === 'string' && override.length > 0 ? override : (defaultButtonName(i, style2) ?? `Button ${i + 1}`);
    const tagList = buttonTagList(i, count, style2);
    const child = endpoint
      .addChildDeviceType(name, [genericSwitch], tagList.length > 0 ? { tagList } : undefined)
      .createDefaultIdentifyClusterServer()
      .createDefaultMomentarySwitchClusterServer();
    // Apple Home and SmartThings read the semantic tagList for button labels, but stricter
    // hubs (e.g. Aqara) ignore it and show generic "Wireless Switch N". A FixedLabel is the
    // standards-compliant fallback those hubs are more likely to surface. addFixedLabel is
    // declared async but its only work (requiring the FixedLabel behavior) runs synchronously
    // before the first await, so the cluster is present before the endpoint is registered;
    // there is nothing to await here.
    void child.addFixedLabel('name', name);
    buttons.push(child);
  }

  return {
    endpoint,
    handle: async (telegram: Erp1Telegram): Promise<void> => {
      if (telegram.payload.length < 1) {
        return;
      }
      const action = decodeRocker(telegram.payload[0], telegram.status);
      if (!action || !action.pressed) {
        return;
      }
      const button = buttons[action.button];
      if (button) {
        await button.triggerSwitchEvent('Single', deps.log);
      }
    },
  };
}
