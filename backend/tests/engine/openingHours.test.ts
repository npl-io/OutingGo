import { describe, it, expect } from 'vitest';
import { isOpenAt, minuteOfDayVN, parseTimeToMinute } from '../../src/engine/openingHours';

const m = parseTimeToMinute;

describe('isOpenAt', () => {
  const table: Array<[string, string, string, boolean]> = [
    ['08:00', '22:00', '12:00', true],
    ['08:00', '22:00', '07:59', false],
    ['08:00', '22:00', '23:00', false],
    ['08:00', '22:00', '08:00', true],
    ['08:00', '22:00', '22:00', false],
    ['08:00', '22:00', '21:59', true],
    ['18:00', '02:00', '23:30', true],
    ['18:00', '02:00', '01:00', true],
    ['18:00', '02:00', '12:00', false],
    ['18:00', '02:00', '18:00', true],
    ['18:00', '02:00', '17:59', false],
    ['18:00', '02:00', '02:00', false],
    ['18:00', '02:00', '01:59', true],
    ['18:00', '02:00', '00:00', true],
    ['10:00', '10:00', '10:00', false],
    ['10:00', '10:00', '03:00', false],
    ['00:00', '23:59', '00:00', true],
    ['00:00', '23:59', '12:00', true],
    ['00:00', '23:59', '23:58', true],
    ['00:00', '23:59', '23:59', false],
  ];

  it.each(table)('open %s close %s at %s -> %s', (opening, closing, at, expected) => {
    expect(isOpenAt(m(opening), m(closing), m(at))).toBe(expected);
  });
});

describe('parseTimeToMinute', () => {
  it('parses HH:MM and HH:MM:SS', () => {
    expect(parseTimeToMinute('00:00')).toBe(0);
    expect(parseTimeToMinute('08:30')).toBe(510);
    expect(parseTimeToMinute('23:59')).toBe(1439);
    expect(parseTimeToMinute('18:05:59')).toBe(1085);
  });

  it('throws RangeError for invalid input', () => {
    for (const bad of ['', '8:00', '24:00', '12:60', '12:00:60', '12-00', '12:00:00:00', 'abc', ' 12:00']) {
      expect(() => parseTimeToMinute(bad)).toThrow(RangeError);
    }
  });
});

describe('minuteOfDayVN', () => {
  it('converts UTC instants to Vietnam local minutes', () => {
    expect(minuteOfDayVN(new Date('2026-11-24T16:30:00Z'))).toBe(1410);
    expect(minuteOfDayVN(new Date('2026-11-24T17:30:00Z'))).toBe(30);
    expect(minuteOfDayVN(new Date('2026-11-24T00:00:00Z'))).toBe(420);
  });
});
