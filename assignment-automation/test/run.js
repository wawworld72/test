#!/usr/bin/env node
/**
 * 자체 테스트 러너. `test/` 안의 모든 *.test.js 파일을 읽어 실행한다.
 * 각 *.test.js는 `module.exports = [{ name, fn }, ...]` 형태의 배열을 내보내야 한다.
 * 외부 테스트 프레임워크(Jest 등) 없이 node로 직접 실행한다: `node test/run.js`
 */

const fs = require('fs');
const path = require('path');

const testDir = __dirname;
const testFiles = fs
  .readdirSync(testDir)
  .filter((f) => f.endsWith('.test.js'))
  .sort();

let total = 0;
let failed = 0;
const failures = [];

for (const file of testFiles) {
  const cases = require(path.join(testDir, file));
  for (const { name, fn } of cases) {
    total += 1;
    try {
      fn();
      process.stdout.write(`  ok  ${file} > ${name}\n`);
    } catch (err) {
      failed += 1;
      failures.push({ file, name, err });
      process.stdout.write(`FAIL  ${file} > ${name}\n`);
      process.stdout.write(`      ${err.message}\n`);
    }
  }
}

process.stdout.write('\n');
if (failed > 0) {
  process.stdout.write(`${total - failed}/${total} passed, ${failed} failed\n`);
  process.exit(1);
} else {
  process.stdout.write(`${total}/${total} passed\n`);
  process.exit(0);
}
