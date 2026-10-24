import assert from 'node:assert/strict'
import { isDeepStrictEqual } from 'node:util'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const source = JSON.parse(readFileSync('public/data/snapshot.json', 'utf8'))
const published = JSON.parse(readFileSync('dist/data/snapshot.json', 'utf8'))
assert.match(published.archiveUrl, /^archive-[a-f0-9]{12}\.json$/)
const bytes = readFileSync(`dist/data/${published.archiveUrl}`)
const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 12)
assert.equal(published.archiveUrl, `archive-${digest}.json`)
const archive = JSON.parse(bytes.toString('utf8'))
for (const key of ['history', 'cotHistory', 'cryptoHistory']) {
  assert.ok(isDeepStrictEqual(archive[key], source[key] ?? []), `${key} changed during packaging`)
  assert.deepEqual(published[key], [], `${key} must load on demand`)
  assert.equal(published.archiveCounts[key], archive[key].length)
}
for (const key of ['pairs', 'currencies', 'cryptoFundamentals', 'analysis']) {
  assert.ok(isDeepStrictEqual(published[key], source[key]), `${key} must remain immediately available`)
}
console.log('Verified production snapshot and content-addressed research archive.')
