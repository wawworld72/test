const { formatLogRow, rowsToTrim, LOG_HEADER, MAX_LOG_ROWS } = require('./logging');

describe('formatLogRow', () => {
  test('serializes details to JSON text', () => {
    const row = formatLogRow('2026-07-26T00:00:00.000Z', 'INFO', 'doPost', 'ok', { rowCount: 3 });
    expect(row).toEqual(['2026-07-26T00:00:00.000Z', 'INFO', 'doPost', 'ok', '{"rowCount":3}']);
  });

  test('uses an empty string when details is missing', () => {
    const row = formatLogRow('t', 'ERROR', 'dispatchWorkflow', 'boom', undefined);
    expect(row[4]).toBe('');
    expect(row).toHaveLength(LOG_HEADER.length);
  });

  test('coerces a non-string message', () => {
    const row = formatLogRow('t', 'ERROR', 'src', 42, null);
    expect(row[3]).toBe('42');
  });
});

describe('rowsToTrim', () => {
  test('returns 0 when under the limit', () => {
    expect(rowsToTrim(10, 500)).toBe(0);
    expect(rowsToTrim(MAX_LOG_ROWS, MAX_LOG_ROWS)).toBe(0);
  });

  test('returns the overflow amount when over the limit', () => {
    expect(rowsToTrim(550, 500)).toBe(50);
  });

  test('falls back to the default MAX_LOG_ROWS when maxRows is falsy', () => {
    expect(rowsToTrim(MAX_LOG_ROWS + 1, 0)).toBe(1);
  });
});
