// node --experimental-strip-types src/screens/world/mentions.check.mjs
import assert from 'node:assert'
import { mentions } from './mentions.ts'
assert.equal(mentions('Nell Avery met Nellie. Nell! nell', ['Nell Avery', 'Nell']), 2)
assert.equal(mentions('Nell Avery smiled', ['Nell Avery', 'Nell']), 1)
assert.equal(mentions('Ann and Annie', ['Ann']), 1)
console.log('mentions ok')
