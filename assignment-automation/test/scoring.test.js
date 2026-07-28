const { parseGradeBands, scoreToGrade, validateGradeBands } = require('../src/logic/scoring');
const assert = require('./assert');

const BANDS = parseGradeBands('90:A;70:B;60:C;0:D');

module.exports = [
  {
    name: 'parseGradeBands parses lowerBound:value pairs in given order',
    fn: () => {
      assert.assertDeepEqual(BANDS, [
        { lowerBound: 90, value: 'A' },
        { lowerBound: 70, value: 'B' },
        { lowerBound: 60, value: 'C' },
        { lowerBound: 0, value: 'D' },
      ]);
    },
  },
  {
    name: 'parseGradeBands returns empty array for falsy input',
    fn: () => {
      assert.assertDeepEqual(parseGradeBands(''), []);
      assert.assertDeepEqual(parseGradeBands(null), []);
    },
  },
  {
    name: 'scoreToGrade picks the exact boundary band',
    fn: () => {
      assert.assertEqual(scoreToGrade(90, BANDS), 'A');
      assert.assertEqual(scoreToGrade(70, BANDS), 'B');
      assert.assertEqual(scoreToGrade(60, BANDS), 'C');
      assert.assertEqual(scoreToGrade(0, BANDS), 'D');
    },
  },
  {
    name: 'scoreToGrade picks the band strictly between boundaries',
    fn: () => {
      assert.assertEqual(scoreToGrade(85, BANDS), 'B');
      assert.assertEqual(scoreToGrade(65, BANDS), 'C');
      assert.assertEqual(scoreToGrade(30, BANDS), 'D');
    },
  },
  {
    name: 'scoreToGrade applies the top band when score exceeds the highest lower bound',
    fn: () => {
      assert.assertEqual(scoreToGrade(150, BANDS), 'A');
    },
  },
  {
    name: 'scoreToGrade throws when no band matches (e.g. negative score, last bound not 0)',
    fn: () => {
      const bandsWithoutZero = parseGradeBands('50:PASS');
      assert.assertThrows(() => scoreToGrade(-1, bandsWithoutZero));
    },
  },
  {
    name: 'validateGradeBands passes for a correct descending set ending at 0',
    fn: () => {
      assert.assertDeepEqual(validateGradeBands(BANDS, 100), []);
    },
  },
  {
    name: 'validateGradeBands flags empty band list',
    fn: () => {
      const issues = validateGradeBands([], 100);
      assert.assertEqual(issues.length, 1);
    },
  },
  {
    name: 'validateGradeBands flags non-descending order',
    fn: () => {
      const bad = parseGradeBands('60:C;70:B;0:D');
      const issues = validateGradeBands(bad, 100);
      assert.assertTrue(issues.some((i) => i.indexOf('내림차순') !== -1));
    },
  },
  {
    name: 'validateGradeBands flags last lower bound not 0',
    fn: () => {
      const bad = parseGradeBands('90:A;70:B');
      const issues = validateGradeBands(bad, 100);
      assert.assertTrue(issues.some((i) => i.indexOf('마지막 하한') !== -1));
    },
  },
  {
    name: 'validateGradeBands flags duplicate lower bounds',
    fn: () => {
      const bad = parseGradeBands('70:A;70:B;0:C');
      const issues = validateGradeBands(bad, 100);
      assert.assertTrue(issues.some((i) => i.indexOf('중복') !== -1));
    },
  },
  {
    name: 'validateGradeBands flags highest lower bound exceeding max score',
    fn: () => {
      const issues = validateGradeBands(BANDS, 80);
      assert.assertTrue(issues.some((i) => i.indexOf('만점') !== -1));
    },
  },
  {
    name: 'validateGradeBands skips the max-score check when maxScore is not a number',
    fn: () => {
      assert.assertDeepEqual(validateGradeBands(BANDS, undefined), []);
    },
  },
];
