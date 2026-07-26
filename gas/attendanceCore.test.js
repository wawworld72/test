const { isAuthorized, normalizeSheetName, validateRows } = require('./attendanceCore');

describe('isAuthorized', () => {
  test('rejects when token missing, blank expectation, or mismatched', () => {
    expect(isAuthorized({ token: 'a' }, 'b')).toBe(false);
    expect(isAuthorized({}, 'b')).toBe(false);
    expect(isAuthorized({ token: 'b' }, '')).toBe(false);
    expect(isAuthorized(null, 'b')).toBe(false);
  });

  test('accepts a matching token', () => {
    expect(isAuthorized({ token: 'secret' }, 'secret')).toBe(true);
  });
});

describe('normalizeSheetName', () => {
  test('falls back to default when missing or blank', () => {
    expect(normalizeSheetName({}, 'Default')).toBe('Default');
    expect(normalizeSheetName({ sheetName: '   ' }, 'Default')).toBe('Default');
  });

  test('trims a provided name', () => {
    expect(normalizeSheetName({ sheetName: ' Hoseo ' }, 'Default')).toBe('Hoseo');
  });
});

describe('validateRows', () => {
  test('throws on a non-array payload', () => {
    expect(() => validateRows('nope')).toThrow();
  });

  test('throws on inconsistent row length', () => {
    expect(() => validateRows([['a', 'b'], ['c']])).toThrow();
  });

  test('passes through consistent rows unchanged', () => {
    const rows = [['a', 'b'], ['c', 'd']];
    expect(validateRows(rows)).toBe(rows);
  });

  test('accepts an empty row set', () => {
    expect(validateRows([])).toEqual([]);
  });
});
