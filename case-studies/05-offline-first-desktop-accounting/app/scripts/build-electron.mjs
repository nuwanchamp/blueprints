// Bundles the Electron main process and preload script (TypeScript, plus the shared src/db code) into dist-electron/.
// DAYBOOK_ADMIN_PIN (a secret on the release build) becomes a salted hash in main.cjs; the PIN itself never ships.
import { randomBytes, scryptSync } from 'node:crypto'
import { build } from 'rolldown'

const pin = process.env.DAYBOOK_ADMIN_PIN
let pinHash = null
if (pin) {
  const salt = randomBytes(16).toString('hex')
  pinHash = { salt, hash: scryptSync(pin, salt, 64).toString('hex') }
}

for (const entry of ['main', 'preload']) {
  await build({
    input: `electron/${entry}.ts`,
    platform: 'node',
    external: ['electron', /^node:/],
    transform: { define: { __DAYBOOK_ADMIN_PIN__: JSON.stringify(pinHash) } },
    output: { file: `dist-electron/${entry}.cjs`, format: 'cjs' },
    logLevel: 'warn',
  })
}
console.log(`built dist-electron/main.cjs and preload.cjs (${pinHash ? 'with' : 'without'} an admin PIN for updates)`)
