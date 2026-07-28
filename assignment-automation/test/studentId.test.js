const { normalizeStudentId, studentIdsEqual } = require('../src/logic/studentId');

module.exports = [
  {
    name: 'null/undefined normalize to empty string',
    fn: () => {
      const assert = require('./assert');
      assert.assertEqual(normalizeStudentId(null), '');
      assert.assertEqual(normalizeStudentId(undefined), '');
    },
  },
  {
    name: 'trims whitespace and removes internal separators',
    fn: () => {
      const assert = require('./assert');
      assert.assertEqual(normalizeStudentId('  2021-001 '), '2021001');
      assert.assertEqual(normalizeStudentId('2021_001'), '2021001');
    },
  },
  {
    name: 'strips leading zeros from purely numeric ids',
    fn: () => {
      const assert = require('./assert');
      assert.assertEqual(normalizeStudentId('0021001'), '21001');
      assert.assertEqual(normalizeStudentId('021001'), '21001');
    },
  },
  {
    name: 'keeps a single zero as zero (does not strip the only digit)',
    fn: () => {
      const assert = require('./assert');
      assert.assertEqual(normalizeStudentId('0'), '0');
      assert.assertEqual(normalizeStudentId('00'), '0');
    },
  },
  {
    name: 'uppercases alphanumeric ids without touching digit grouping',
    fn: () => {
      const assert = require('./assert');
      assert.assertEqual(normalizeStudentId('a2021b'), 'A2021B');
    },
  },
  {
    name: 'studentIdsEqual treats differently formatted ids as equal',
    fn: () => {
      const assert = require('./assert');
      assert.assertTrue(studentIdsEqual('021-001', '21001'));
      assert.assertTrue(studentIdsEqual(' 2021_001 ', '2021001'));
    },
  },
  {
    name: 'studentIdsEqual rejects genuinely different ids',
    fn: () => {
      const assert = require('./assert');
      assert.assertFalse(studentIdsEqual('21001', '21002'));
    },
  },
];
