/**
 * Pure EEP decoders. These contain no Matter dependencies so they can be unit-tested in
 * isolation, and they are the place to add support for new EnOcean Equipment Profiles.
 *
 * @file decode.ts
 */

/** A decoded rocker action from an F6-02 (RPS) telegram. */
export interface RockerAction {
  /** Button index: 0 = AI, 1 = AO, 2 = BI, 3 = BO. */
  button: number;
  /** True for a press (energy bow engaged), false for a release. */
  pressed: boolean;
}

/**
 * Decode an EEP F6-02-0x rocker switch telegram (e.g. Eltako FT55, PTM21x).
 *
 * RPS encoding when the status N-message bit (NU) is set:
 *   DB0 bits 7..5 = R1 button (0=AI, 1=AO, 2=BI, 3=BO)
 *   DB0 bit 4     = energy bow (1 = pressed, 0 = released)
 *
 * Release telegrams (NU cleared, "U-message") and multi-button telegrams are ignored for
 * the MVP — a single momentary press per button is emitted on press.
 *
 * @param {number} db0 - The single RPS data byte.
 * @param {number} status - The telegram status byte.
 * @returns {RockerAction | null} The action, or null if it should be ignored.
 */
export function decodeRocker(db0: number, status: number): RockerAction | null {
  const nu = (status & 0x10) !== 0; // NU bit: 1 = normal rocker action
  if (!nu) {
    return null;
  }
  const button = (db0 >> 5) & 0x07;
  const pressed = (db0 & 0x10) !== 0;
  if (button > 3) {
    return null;
  }
  return { button, pressed };
}

/** The three positions of a window handle. */
export type WindowHandleState = 'closed' | 'open' | 'tilted';

/**
 * Decode an EEP F6-10-00 mechanical window handle telegram (e.g. Hoppe SecuSignal).
 *
 * Only the upper nibble of the data byte is meaningful (the lower nibble is unpredictable):
 *   0xF0 → handle down  → closed
 *   0xD0 → handle up     → tilted
 *   0xC0 / 0xE0 → handle horizontal → open
 *
 * Note: Eltako FPE contact sensors reuse F6-10-00 with different byte values and must not
 * share this decoder.
 *
 * @param {number} db0 - The single RPS data byte.
 * @returns {WindowHandleState} The decoded handle position.
 */
export function decodeWindowHandle(db0: number): WindowHandleState {
  switch (db0 & 0xf0) {
    case 0xf0:
      return 'closed';
    case 0xd0:
      return 'tilted';
    default:
      return 'open'; // 0xC0 / 0xE0
  }
}
