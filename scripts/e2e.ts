/**
 * Prueba de extremo a extremo: crea un servidor real, lo arranca y lo para bien.
 *
 * Recorre el eje vertical completo (§18.3):
 *   catálogo -> JavaManager -> Installer -> ProcessSupervisor -> consola
 *
 * Descarga de verdad (Java ~200 MB + servidor ~60 MB), así que tarda unos
 * minutos la primera vez. Ejecutar con:  npm run e2e
 */

import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtemp, rm, access, readdir, writeFile } from 'node:fs/promises'

import { setDataRoot, serverDir } from '../src/main/core/paths'
import { service } from '../src/main/core/service'
import * as catalog from '../src/main/core/versions/catalog'
import type { Distribution } from '../src/shared/types'

const DISTRIBUTION: Distribution = (process.argv[2] as Distribution) ?? 'paper'
const PORT = 25599

let failed = 0

function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`  OK   ${name}${detail ? ` — ${detail}` : ''}`)
  } else {
    failed++
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/** true si la promesa rechaza: se usa para comprobar que algo está prohibido. */
async function rejects(action: () => Promise<unknown>): Promise<boolean> {
  try {
    await action()
    return false
  } catch {
    return true
  }
}

function waitFor(
  predicate: () => boolean,
  timeoutMs: number,
  description: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer)
        resolve()
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer)
        reject(new Error(`Tiempo agotado esperando: ${description}`))
      }
    }, 250)
  })
}

async function main(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'qubiq-e2e-'))
  setDataRoot(root)
  await service.initialize()
  console.log(`Distribución: ${DISTRIBUTION}`)
  console.log(`Datos temporales en ${root}\n`)

  let ready = false
  let lastPhase = ''
  const errors: string[] = []

  service.on('progress', (update: { phase: string; detail?: string }) => {
    if (update.detail && update.phase !== lastPhase) {
      lastPhase = update.phase
      console.log(`  ... ${update.detail}`)
    }
  })

  const rawSamples: string[] = []
  service.on('log', (_id: string, line: { level: string; text: string }) => {
    if (rawSamples.length < 6 && line.text.startsWith('[')) rawSamples.push(line.text)
    if (/Done \(/.test(line.text)) ready = true
    if (line.level === 'error') errors.push(line.text)
  })

  service.on('diagnosis', (_id: string, d: { title: string; detail: string }) => {
    errors.push(`${d.title}: ${d.detail}`)
  })

  const version = await catalog.defaultVersionFor(DISTRIBUTION)
  console.log(`== Instalando ${DISTRIBUTION} ${version} (esto tarda unos minutos)`)

  const started = Date.now()
  const manifest = await service.create({
    name: 'Prueba E2E',
    distribution: DISTRIBUTION,
    minecraftVersion: version,
    memoryMb: 2048,
    expectedPlayers: 12,
    port: PORT,
    eulaAccepted: true
  })

  const installSeconds = Math.round((Date.now() - started) / 1000)
  console.log(`\n== Instalación terminada en ${installSeconds} s`)
  check('la instancia existe', manifest.id.length > 0, manifest.id)
  check('detectó el Java correcto', manifest.javaMajor >= 8, `Java ${manifest.javaMajor}`)

  const dir = serverDir(manifest.id)
  check('creó eula.txt', await exists(join(dir, 'eula.txt')))
  check('creó server.properties', await exists(join(dir, 'server.properties')))
  check('fijó max-players con los jugadores esperados', manifest.expectedPlayers === 12)

  // Modo extremo: `hardcore` es una clave aparte, no un valor de `gamemode`.
  // Se escribe antes de arrancar para comprobar que el servidor la acepta.
  await service.setProperties(manifest.id, {
    hardcore: 'true',
    gamemode: 'survival',
    difficulty: 'hard'
  })

  console.log('\n== Arrancando el servidor')
  await service.start(manifest.id)

  try {
    await waitFor(() => ready, 5 * 60_000, 'que el servidor termine de arrancar')
  } catch (err) {
    console.error(`\n  Últimos errores:\n${errors.slice(-8).join('\n')}`)
    throw err
  }

  console.log('\n  Formato real del log de esta distribución:')
  for (const sample of rawSamples) console.log(`    ${sample}`)
  console.log('')

  const state = await service.get(manifest.id)
  check('el estado es "running"', state.status === 'running', state.status)
  check('el mundo se ha generado', await exists(join(dir, 'world')))

  // El servidor reescribe server.properties al arrancar con TODAS sus claves.
  // Si `hardcore` no fuera válida la habría descartado, así que esto confirma
  // que el modo extremo se aplica de verdad y no solo en nuestro fichero.
  const applied = await service.getProperties(manifest.id)
  check('el servidor acepta la clave hardcore', applied['hardcore'] === 'true', applied['hardcore'])
  check('y mantiene gamemode como supervivencia', applied['gamemode'] === 'survival')
  check('conserva max-players', applied['max-players'] === '12', applied['max-players'])

  // --- Red: Server List Ping real (§10) ------------------------------------

  console.log('\n== Conectividad (Server List Ping)')
  const conn = await service.connectionInfo(manifest.id)
  check('el servidor responde al ping del juego', conn.ping.state === 'ok', conn.ping.state)
  check('devuelve el MOTD', (conn.ping.motd ?? '').length > 0, conn.ping.motd)
  check(
    'informa de jugadores',
    conn.ping.playersOnline === 0 && (conn.ping.playersMax ?? 0) > 0,
    `${conn.ping.playersOnline}/${conn.ping.playersMax}`
  )
  check('detecta direcciones de red local', conn.localAddresses.length > 0,
    conn.localAddresses.map((a) => a.address).join(', '))

  // --- Copia en caliente (§12) ---------------------------------------------

  console.log('\n== Copia de seguridad con el servidor arrancado')
  const backup = await service.createBackup(manifest.id, 'Prueba E2E')
  check('crea el ZIP', backup.sizeBytes > 0, `${(backup.sizeBytes / 1024).toFixed(0)} KB`)
  check('registra la versión', backup.minecraftVersion === version, backup.minecraftVersion)
  check('el fichero existe', await exists(join(root, 'instances', manifest.id, 'backups', backup.fileName)))

  const list = await service.listBackups(manifest.id)
  check('aparece en el historial', list.some((b) => b.fileName === backup.fileName), `${list.length} copias`)
  // Una instancia recién creada no debe acumular copias automáticas vacías.
  check('no se crean copias sin mundo', list.length === 1, `${list.length} copias`)

  // Estimación de espacio: con copias reales debe medir, no adivinar.
  const est = await service.backupEstimate(manifest.id)
  check('mide sobre copias reales', est.sampleCount === 1, `${est.sampleCount} muestras`)
  check('el tamaño por copia coincide', est.perBackupBytes === backup.sizeBytes)
  check('calcula el tamaño del mundo', est.worldBytes > 0, `${(est.worldBytes / 1024 / 1024).toFixed(1)} MB`)
  check(
    'consulta el espacio libre en disco',
    est.freeDiskBytes !== null && est.freeDiskBytes > 0,
    est.freeDiskBytes ? `${(est.freeDiskBytes / 1024 ** 3).toFixed(1)} GB libres` : 'no disponible'
  )

  // El servidor debe seguir funcionando: si save-on no se hubiera reanudado,
  // el mundo dejaría de guardarse en silencio, que es el peor fallo posible.
  const afterBackup = await service.get(manifest.id)
  check('el servidor sigue en marcha tras la copia', afterBackup.status === 'running')
  const pingAfter = await service.connectionInfo(manifest.id)
  check('y sigue aceptando conexiones', pingAfter.ping.state === 'ok')

  console.log('\n== Parada limpia (stop por stdin, sin matar el proceso)')
  const stopStarted = Date.now()
  await service.stop(manifest.id)
  const stopSeconds = ((Date.now() - stopStarted) / 1000).toFixed(1)

  const finalState = await service.get(manifest.id)
  check('el estado vuelve a "stopped"', finalState.status === 'stopped', `en ${stopSeconds} s`)
  check('no quedaron errores sin diagnosticar', errors.length === 0, errors.slice(0, 2).join(' | '))

  // Si el cierre fue limpio, el servidor habrá guardado la sesión.
  const worldFiles = await readdir(join(dir, 'world')).catch(() => [] as string[])
  check('el mundo tiene datos guardados', worldFiles.includes('level.dat'), worldFiles.join(', '))

  // --- Mundos (§8) ----------------------------------------------------------

  console.log('\n== Gestión de mundos')

  const initial = await service.listWorlds(manifest.id)
  check('detecta el mundo inicial', initial.length === 1, initial.map((w) => w.name).join(', '))
  check('está marcado como activo', initial[0]?.active === true)
  check('sabe que está generado', initial[0]?.generated === true)
  check('calcula su tamaño', (initial[0]?.sizeBytes ?? 0) > 0,
    `${((initial[0]?.sizeBytes ?? 0) / 1024 / 1024).toFixed(1)} MB`)

  // Crear uno nuevo solo cambia level-name: lo genera el servidor al arrancar.
  const afterCreate = await service.createWorld(manifest.id, {
    name: 'segundo-mundo',
    levelType: 'minecraft:flat'
  })
  check('el mundo nuevo aparece en la lista', afterCreate.some((w) => w.name === 'segundo-mundo'))
  check(
    'el nuevo queda activo pero sin generar',
    afterCreate.find((w) => w.name === 'segundo-mundo')?.generated === false
  )
  check(
    'el mundo anterior sigue ahí',
    afterCreate.some((w) => w.name === 'world' && !w.active),
    afterCreate.map((w) => `${w.name}${w.active ? '*' : ''}`).join(', ')
  )

  const propsAfterCreate = await service.getProperties(manifest.id)
  check('escribe level-name', propsAfterCreate['level-name'] === 'segundo-mundo')
  check('aplica el tipo de mundo', propsAfterCreate['level-type'] === 'minecraft:flat')
  check('limpia la semilla del mundo anterior', propsAfterCreate['level-seed'] === '')

  check(
    'no deja crear dos mundos con el mismo nombre',
    await rejects(() => service.createWorld(manifest.id, { name: 'world' }))
  )

  // El servidor debe generar de verdad el mundo nuevo al arrancar.
  ready = false
  await service.start(manifest.id)
  await waitFor(() => ready, 5 * 60_000, 'que se genere el segundo mundo')
  await service.stop(manifest.id)

  const generated = await service.listWorlds(manifest.id)
  const second = generated.find((w) => w.name === 'segundo-mundo')
  check('el servidor genera el mundo nuevo', second?.generated === true)
  check('y ocupa espacio real', (second?.sizeBytes ?? 0) > 0,
    `${((second?.sizeBytes ?? 0) / 1024 / 1024).toFixed(1)} MB`)
  check('ahora hay dos mundos', generated.length === 2, generated.map((w) => w.name).join(', '))

  // ⚠ Regresión: las copias tenían el nombre "world" fijo. Con otro mundo
  // activo guardarían el equivocado o fallarían.
  const backupOther = await service.createBackup(manifest.id, 'Con otro mundo activo')
  check('la copia funciona con un mundo distinto de "world"', backupOther.sizeBytes > 0,
    `${(backupOther.sizeBytes / 1024).toFixed(0)} KB`)

  check(
    'no deja borrar el mundo activo',
    await rejects(() => service.deleteWorld(manifest.id, 'segundo-mundo'))
  )

  await service.activateWorld(manifest.id, 'world')
  const reactivated = await service.listWorlds(manifest.id)
  check('vuelve al mundo original', reactivated.find((w) => w.name === 'world')?.active === true)

  const afterDelete = await service.deleteWorld(manifest.id, 'segundo-mundo')
  check('borra el mundo inactivo', afterDelete.length === 1, afterDelete.map((w) => w.name).join(', '))
  check('la carpeta desaparece', !(await exists(join(dir, 'segundo-mundo'))))

  // --- Restauración (§12) ---------------------------------------------------

  console.log('\n== Restauración con el servidor parado')

  // Se ensucia el mundo para comprobar que la restauración lo revierte de verdad.
  const marker = join(dir, 'world', 'marca-de-prueba.txt')
  await writeFile(marker, 'esto no debe sobrevivir a la restauracion', 'utf8')
  check('marca creada antes de restaurar', await exists(marker))

  await service.restoreBackup(manifest.id, backup.fileName)
  check('la restauración elimina lo posterior a la copia', !(await exists(marker)))
  check('y deja el mundo en su sitio', await exists(join(dir, 'world', 'level.dat')))

  const afterRestore = await service.listBackups(manifest.id)
  check(
    'guarda copia de seguridad del estado previo antes de sobrescribir',
    afterRestore.length > list.length,
    `${afterRestore.length} copias`
  )

  await rm(root, { recursive: true, force: true })

  console.log(failed === 0 ? '\nTodo correcto.' : `\n${failed} comprobaciones fallidas.`)
  if (failed > 0) process.exitCode = 1
  process.exit(failed === 0 ? 0 : 1)
}

void main().catch((err: Error) => {
  console.error(`\nERROR: ${err.message}`)
  process.exit(1)
})
