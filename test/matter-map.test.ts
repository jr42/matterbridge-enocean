import { describe, expect, it } from '@jest/globals';

import { lookupMatterMapping } from '../src/eep/matter-map.js';

describe('lookupMatterMapping', () => {
  it('resolves exact entries', () => {
    expect(lookupMatterMapping('d5-00-01')?.endpoints[0].kind).toBe('contact');
    expect(lookupMatterMapping('a5-09-04')?.endpoints.map((e) => e.kind)).toEqual(['co2', 'temperature', 'humidity']);
  });

  it('resolves func wildcards (a5-02-* etc.)', () => {
    expect(lookupMatterMapping('a5-02-05')?.endpoints[0].kind).toBe('temperature');
    expect(lookupMatterMapping('a5-04-03')?.endpoints.map((e) => e.kind)).toEqual(['temperature', 'humidity']);
    expect(lookupMatterMapping('a5-08-02')?.endpoints.map((e) => e.kind)).toEqual(['illuminance', 'temperature', 'occupancy']);
  });

  it('returns undefined for unmapped EEPs', () => {
    expect(lookupMatterMapping('f6-02-01')).toBeUndefined(); // handled by the rocker profile, not the sensor map
    expect(lookupMatterMapping('zz-zz-zz')).toBeUndefined();
  });
});
