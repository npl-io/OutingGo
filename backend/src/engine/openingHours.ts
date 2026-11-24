// Vietnam is UTC+7 all year, no daylight saving.
export const VN_UTC_OFFSET_MINUTES = 420;

const MINUTES_PER_DAY = 1440;
const TIME_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Converts 'HH:MM' or 'HH:MM:SS' to the minute of day (seconds are ignored).
 * @throws RangeError for any other format or out-of-range values.
 */
export function parseTimeToMinute(value: string): number {
  const match = TIME_PATTERN.exec(value);
  if (match === null) {
    throw new RangeError(`parseTimeToMinute: invalid time "${value}"`);
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] === undefined ? 0 : Number(match[3]);
  if (hours > 23 || minutes > 59 || seconds > 59) {
    throw new RangeError(`parseTimeToMinute: time out of range "${value}"`);
  }
  return hours * 60 + minutes;
}

/**
 * Whether a venue is open at a minute of day. Same rule as the SQL openAt
 * filter: opening < closing is [opening, closing); opening > closing crosses
 * midnight; opening == closing is closed.
 */
export function isOpenAt(openingMinute: number, closingMinute: number, minuteOfDay: number): boolean {
  if (openingMinute < closingMinute) {
    return minuteOfDay >= openingMinute && minuteOfDay < closingMinute;
  }
  if (openingMinute > closingMinute) {
    return minuteOfDay >= openingMinute || minuteOfDay < closingMinute;
  }
  return false;
}

/** Minute of day (0-1439) in Vietnam local time for a UTC instant. */
export function minuteOfDayVN(date: Date): number {
  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  return (((utcMinutes + VN_UTC_OFFSET_MINUTES) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}
