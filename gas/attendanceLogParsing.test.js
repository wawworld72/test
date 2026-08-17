const { extractAttendanceSection, extractForumExportSection, authHeaders } = require('./attendanceLogParsing');

describe('extractAttendanceSection', () => {
  test('slices out the ATTENDANCE_LONG block', () => {
    const logText =
      'some noise\n' +
      '=== ATTENDANCE_LONG (2 rows) ===\n' +
      '학번,이름,주차,출결상태\n' +
      '1,홍길동,1,O\n' +
      '=== END ATTENDANCE_LONG ===\n' +
      'more noise';

    expect(extractAttendanceSection(logText)).toBe(
      '=== ATTENDANCE_LONG (2 rows) ===\n' +
        '학번,이름,주차,출결상태\n' +
        '1,홍길동,1,O\n' +
        '=== END ATTENDANCE_LONG ==='
    );
  });

  test('falls back to a tail preview when markers are missing', () => {
    const result = extractAttendanceSection('no markers here');
    expect(result).toContain('출결 결과 구간을 로그에서 찾지 못했습니다');
    expect(result).toContain('no markers here');
  });
});

describe('extractForumExportSection', () => {
  test('slices out the FORUM_EXPORT block', () => {
    const logText =
      'some noise\n' +
      '=== FORUM_EXPORT (1 rows) ===\n' +
      '주차,토론방,id,discussion,created,userfullname,message\n' +
      '1주차,자기소개토론방,1,111,1700000010,홍길동,안녕하세요\n' +
      '=== END FORUM_EXPORT ===\n' +
      'more noise';

    expect(extractForumExportSection(logText)).toBe(
      '=== FORUM_EXPORT (1 rows) ===\n' +
        '주차,토론방,id,discussion,created,userfullname,message\n' +
        '1주차,자기소개토론방,1,111,1700000010,홍길동,안녕하세요\n' +
        '=== END FORUM_EXPORT ==='
    );
  });

  test('falls back to a tail preview when markers are missing', () => {
    const result = extractForumExportSection('no markers here');
    expect(result).toContain('토론방 결과 구간을 로그에서 찾지 못했습니다');
    expect(result).toContain('no markers here');
  });
});

describe('authHeaders', () => {
  test('builds a Bearer authorization header', () => {
    expect(authHeaders('ghp_secret')).toEqual({
      Authorization: 'Bearer ghp_secret',
      Accept: 'application/vnd.github+json',
    });
  });
});
