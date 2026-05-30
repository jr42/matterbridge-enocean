import { describe, expect, it } from '@jest/globals';
import { NumberTag, PositionTag } from 'matterbridge/matter';

import { buttonTagList, defaultButtonName, isStyle2 } from '../src/profiles/rocker.js';

describe('isStyle2 (F6-02-01 vs F6-02-02)', () => {
  it('detects F6-02-02 in any notation', () => {
    expect(isStyle2('F6-02-02')).toBe(true);
    expect(isStyle2('f60202')).toBe(true);
  });

  it('treats F6-02-01 (and anything else) as style 1', () => {
    expect(isStyle2('F6-02-01')).toBe(false);
    expect(isStyle2(undefined)).toBe(false);
    expect(isStyle2('A5-02-05')).toBe(false);
  });
});

describe('defaultButtonName (EEP-derived names)', () => {
  it('names the 4 buttons from the spec for style 1 (I = bottom, O = top)', () => {
    expect(defaultButtonName(0, false)).toBe('Rocker A Bottom'); // AI
    expect(defaultButtonName(1, false)).toBe('Rocker A Top'); // AO
    expect(defaultButtonName(2, false)).toBe('Rocker B Bottom'); // BI
    expect(defaultButtonName(3, false)).toBe('Rocker B Top'); // BO
  });

  it('flips top/bottom for style 2 (I = top, O = bottom)', () => {
    expect(defaultButtonName(0, true)).toBe('Rocker A Top'); // AI
    expect(defaultButtonName(1, true)).toBe('Rocker A Bottom'); // AO
    expect(defaultButtonName(2, true)).toBe('Rocker B Top'); // BI
    expect(defaultButtonName(3, true)).toBe('Rocker B Bottom'); // BO
  });

  it('returns undefined beyond the 2-rocker layout', () => {
    expect(defaultButtonName(4, false)).toBeUndefined();
  });
});

describe('buttonTagList (F6-02 rocker semantic tags)', () => {
  it('maps the 4-button rocker layout to NumberTag + PositionTag (style 1)', () => {
    expect(buttonTagList(0, 4)).toEqual([NumberTag.One, PositionTag.Left, PositionTag.Bottom]);
    expect(buttonTagList(1, 4)).toEqual([NumberTag.Two, PositionTag.Left, PositionTag.Top]);
    expect(buttonTagList(2, 4)).toEqual([NumberTag.Three, PositionTag.Right, PositionTag.Bottom]);
    expect(buttonTagList(3, 4)).toEqual([NumberTag.Four, PositionTag.Right, PositionTag.Top]);
  });

  it('flips top/bottom position tags for style 2', () => {
    expect(buttonTagList(0, 4, true)).toEqual([NumberTag.One, PositionTag.Left, PositionTag.Top]);
    expect(buttonTagList(1, 4, true)).toEqual([NumberTag.Two, PositionTag.Left, PositionTag.Bottom]);
    expect(buttonTagList(3, 4, true)).toEqual([NumberTag.Four, PositionTag.Right, PositionTag.Bottom]);
  });

  it('applies only the NumberTag when the button count is not the canonical 4', () => {
    expect(buttonTagList(0, 2)).toEqual([NumberTag.One]);
    expect(buttonTagList(1, 2)).toEqual([NumberTag.Two]);
    expect(buttonTagList(5, 6)).toEqual([NumberTag.Six]);
  });

  it('returns an empty tag list for indexes beyond the NumberTag table', () => {
    expect(buttonTagList(8, 9)).toEqual([]);
  });
});
