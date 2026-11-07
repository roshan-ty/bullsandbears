import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
const snapshot = JSON.parse(readFileSync('dist/data/snapshot.json', 'utf8'))
for (const key of ['history', 'cot', 'cotHistory', 'cryptoHistory', 'cryptoFundamentals', 'positioning', 'positioningHistory', 'scoreHistory', 'news', 'setups']) assert.equal((snapshot[key] ?? []).length, 0, `${key} must not ship in the free dataset`)
assert.ok(snapshot.pairs.length > 0)
assert.match(readFileSync('dist/index.html', 'utf8'), /\/bullsandbears\/assets\//)
assert.ok(existsSync('dist/404.html') && existsSync('dist/.nojekyll'))
assert.ok(!readdirSync('dist').includes('desktop'))
assert.ok(!readdirSync('dist/assets').some(name => name.endsWith('.map')))
for (const name of ['charts', 'macro', 'positioning', 'retail']) assert.ok(existsSync(`dist/screenshots/desktop-${name}.png`), `Missing desktop preview: ${name}`)
console.log(`Verified free Pages artifact: ${snapshot.pairs.length} markets, no premium datasets.`)
