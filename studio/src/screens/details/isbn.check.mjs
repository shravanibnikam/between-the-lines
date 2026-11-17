// node --experimental-strip-types src/screens/details/isbn.check.mjs
import assert from 'node:assert'
import { isbnValid } from './isbn.ts'
assert(isbnValid('978-0-306-40615-7')); assert(!isbnValid('978-0-306-40615-8')); assert(isbnValid('0-306-40615-2'))
assert(isbnValid('0-8044-2957-X')); assert(!isbnValid('X-306-40615-2')); assert(!isbnValid(''))
console.log('isbn ok')
