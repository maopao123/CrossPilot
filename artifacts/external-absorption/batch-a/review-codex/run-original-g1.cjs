// Run the unchanged original probes, redirecting only report files to this review folder.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../../..');
const write = fs.writeFileSync.bind(fs);
const round = process.argv[2];
if (!['1', '2'].includes(round)) throw new Error('Expected round 1 or 2');
const original = path.join(root, round === '1'
  ? 'artifacts/automation-v1/g1-review/review-probes.cjs'
  : 'artifacts/automation-v1/g1-review-round2/remaining-probes.cjs');
fs.writeFileSync = (file, ...args) => {
  if (!String(file).endsWith('-results.json')) throw new Error('Unexpected probe write: ' + file);
  return write(path.join(__dirname, 'g1-round-' + round + '-results.json'), ...args);
};
require(original);
