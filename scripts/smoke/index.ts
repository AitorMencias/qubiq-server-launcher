/**
 * Prueba de humo del núcleo (§16): lo común a cualquier juego y, después, cada
 * juego con su lógica y el contrato con sus APIs.
 *
 * Es el "test de contrato" que avisa cuando una fuente externa cambia: la v2 de
 * Paper murió de un día para otro, y sin esto la app se rompe en silencio.
 *
 * Ejecutar con:  npm run smoke
 */

import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'

import { finish } from './harness'
import { commonSmoke } from './common'
import { minecraftSmoke } from './minecraft'
import { satisfactorySmoke } from './satisfactory'
import { valheimSmoke } from './valheim'
import { factorioSmoke } from './factorio'
import { zomboidSmoke } from './zomboid'
import { enshroudedSmoke } from './enshrouded'
import { rustSmoke } from './rust'
import { i18nSmoke } from './i18n'
import { steamSmoke } from './steam'
import { remoteSmoke } from './remote'
import { journalSmoke } from './journal'
import { setDataRoot, setResourcesRoot, ensureBaseDirs } from '../../src/main/core/paths'

async function main(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'qubiq-smoke-'))
  setDataRoot(root)
  setResourcesRoot(join(process.cwd(), 'resources'))
  await ensureBaseDirs()
  console.log(`Datos temporales en ${root}`)

  await commonSmoke()
  await journalSmoke()
  await i18nSmoke()
  await remoteSmoke()
  await steamSmoke()
  await satisfactorySmoke()
  await valheimSmoke()
  await factorioSmoke()
  await zomboidSmoke()
  await enshroudedSmoke()
  await rustSmoke()
  await minecraftSmoke()

  await rm(root, { recursive: true, force: true })
  finish()
}

void main()
