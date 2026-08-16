const {
  PUBLISH_STATUS,
  PROGRESS_STATUS,
  isValidPublishTransition,
  isValidProgressTransition,
  transitionPublish,
  transitionProgress,
} = require('../src/logic/stateTransition');
const assert = require('./assert');

module.exports = [
  {
    name: 'publish: 대기 -> 게시 is valid',
    fn: () => assert.assertEqual(transitionPublish(PUBLISH_STATUS.PENDING, PUBLISH_STATUS.PUBLISHED), '게시'),
  },
  {
    name: 'publish: 대기 -> 오류 is valid',
    fn: () => assert.assertEqual(transitionPublish(PUBLISH_STATUS.PENDING, PUBLISH_STATUS.ERROR), '오류'),
  },
  {
    name: 'publish: 게시 -> 오류 is valid, 게시 -> 대기 is not',
    fn: () => {
      assert.assertTrue(isValidPublishTransition('게시', '오류'));
      assert.assertFalse(isValidPublishTransition('게시', '대기'));
    },
  },
  {
    name: 'publish: 오류 recovers to 대기 or 게시',
    fn: () => {
      assert.assertTrue(isValidPublishTransition('오류', '대기'));
      assert.assertTrue(isValidPublishTransition('오류', '게시'));
    },
  },
  {
    name: 'publish: invalid transition throws',
    fn: () => assert.assertThrows(() => transitionPublish('게시', '대기')),
  },
  {
    name: 'progress: full happy path 대기->수집중->채점중->평가완료->반환완료',
    fn: () => {
      assert.assertEqual(transitionProgress('대기', '수집중'), '수집중');
      assert.assertEqual(transitionProgress('수집중', '채점중'), '채점중');
      assert.assertEqual(transitionProgress('채점중', '평가완료'), '평가완료');
      assert.assertEqual(transitionProgress('평가완료', '반환완료'), '반환완료');
    },
  },
  {
    name: 'progress: any state can transition to 오류',
    fn: () => {
      ['대기', '수집중', '채점중', '평가완료', '반환완료'].forEach((s) => {
        assert.assertTrue(isValidProgressTransition(s, '오류'));
      });
    },
  },
  {
    name: 'progress: 오류 can recover to any prior state',
    fn: () => {
      ['대기', '수집중', '채점중', '평가완료', '반환완료'].forEach((s) => {
        assert.assertTrue(isValidProgressTransition('오류', s));
      });
    },
  },
  {
    name: 'progress: 반환완료 is terminal except for error',
    fn: () => {
      assert.assertFalse(isValidProgressTransition('반환완료', '대기'));
      assert.assertFalse(isValidProgressTransition('반환완료', '수집중'));
      assert.assertTrue(isValidProgressTransition('반환완료', '오류'));
    },
  },
  {
    name: 'progress: skipping a stage is rejected',
    fn: () => {
      assert.assertFalse(isValidProgressTransition('대기', '채점중'));
      assert.assertFalse(isValidProgressTransition('수집중', '평가완료'));
      assert.assertFalse(isValidProgressTransition('채점중', '반환완료'));
    },
  },
  {
    name: 'progress: invalid transition throws with a clear message',
    fn: () => assert.assertThrows(() => transitionProgress('대기', '채점중')),
  },
  {
    name: 'unknown state name is rejected, not treated as valid',
    fn: () => {
      assert.assertFalse(isValidProgressTransition('알수없음', '수집중'));
      assert.assertFalse(isValidPublishTransition('알수없음', '게시'));
    },
  },
];
