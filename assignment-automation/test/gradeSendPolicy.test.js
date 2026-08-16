const { shouldSendGrade, buildChangeLogEntry } = require('../src/logic/gradeSendPolicy');
const assert = require('./assert');

module.exports = [
  {
    name: 'sends when never sent before (null)',
    fn: () => assert.assertTrue(shouldSendGrade(null, 85)),
  },
  {
    name: 'sends when never sent before (undefined)',
    fn: () => assert.assertTrue(shouldSendGrade(undefined, 85)),
  },
  {
    name: 'skips when the new score equals the last sent score',
    fn: () => assert.assertFalse(shouldSendGrade(85, 85)),
  },
  {
    name: 'sends when the score actually changed',
    fn: () => assert.assertTrue(shouldSendGrade(85, 90)),
  },
  {
    name: 'sends when the new score is 0 and previous was null (first-time zero grade)',
    fn: () => assert.assertTrue(shouldSendGrade(null, 0)),
  },
  {
    name: 'skips when both previous and new are 0',
    fn: () => assert.assertFalse(shouldSendGrade(0, 0)),
  },
  {
    name: 'buildChangeLogEntry returns null when nothing changed (no log write)',
    fn: () => assert.assertEqual(buildChangeLogEntry('2026-07-28T00:00:00.000Z', 'A1·2021001', 85, 85), null),
  },
  {
    name: 'buildChangeLogEntry returns a full entry when the score changed',
    fn: () => {
      const entry = buildChangeLogEntry('2026-07-28T00:00:00.000Z', 'A1·2021001', 70, 85);
      assert.assertDeepEqual(entry, {
        시각: '2026-07-28T00:00:00.000Z',
        대상: 'A1·2021001',
        이전값: 70,
        이후값: 85,
      });
    },
  },
  {
    name: 'buildChangeLogEntry uses empty string for 이전값 on first-time send',
    fn: () => {
      const entry = buildChangeLogEntry('2026-07-28T00:00:00.000Z', 'A1·2021001', null, 85);
      assert.assertEqual(entry.이전값, '');
    },
  },
];
