import { join } from 'node:path'
import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'

import { check, execFileAsync, fileExists, section } from './harness'
import { backupsDir, instanceDir, serverDir, slugify, systemTarPath } from '../../src/main/core/paths'
import * as network from '../../src/main/core/net/network'
import { evaluateRestart, RESTART_LIMIT, RESTART_WINDOW_MS } from '../../src/main/core/runtime/restartPolicy'
import { migrateManifest } from '../../src/main/core/instances/migrations'
import { listInstances, readManifest } from '../../src/main/core/instances/manager'
import { listBackups } from '../../src/main/core/backup/manager'
import { registerGame } from '../../src/main/core/games/registry'
import type { GameAdapter } from '../../src/main/core/games/types'
import { service } from '../../src/main/core/service'
import type { CreateInstanceRequest, InstanceManifest, ServerStatus } from '../../src/shared/types'

/**
 * Prueba de humo de lo común a cualquier juego: utilidades, migraciones,
 * política de reinicio, red y, sobre todo, el contrato de juego con un juego
 * falso que no tiene nada de Minecraft.
 */

/** Manifiesto v1 tal como lo escribía la app antes de la fase 0 (sacado de uno real). */
const MANIFEST_V1 = {
  schemaVersion: 1,
  id: 'hc-lobby',
  name: 'HC Lobby',
  distribution: 'paper',
  minecraftVersion: '26.2',
  javaMajor: 25,
  expectedPlayers: 8,
  memoryMb: 2560,
  jvmArgs: ['-Xms2560M', '-Xmx2560M', '-XX:+UseG1GC'],
  port: 25565,
  autoRestart: false,
  backup: { enabled: true, intervalHours: 6, keep: 10 },
  createdAt: '2026-09-12T09:31:56.484Z',
  eulaAccepted: true,
  build: '123',
  exposure: { mode: 'router' }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const started = Date.now()
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer)
        resolve(true)
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer)
        resolve(false)
      }
    }, 50)
  })
}

/**
 * Ficheros de código del proyecto, para revisarlos enteros.
 */
async function sourceFiles(dir: string, out: string[] = []): Promise<string[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) await sourceFiles(path, out)
    else if (/\.(ts|tsx|mjs)$/.test(entry.name)) out.push(path)
  }
  return out
}

export async function commonSmoke(): Promise<void> {
  /**
   * Caracteres de control invisibles en el código.
   *
   * Parece una manía, pero costó una tarde: editando desde Git Bash se coló un
   * **retroceso de verdad** (0x08) dentro de una expresión regular, donde tenía
   * que haber un `\b`. El fichero se veía perfecto, TypeScript compilaba y la
   * regla no casaba nunca. Es justo la trampa que avisa el README, y esto es lo
   * único que la caza.
   */
  await section('Código sin caracteres invisibles', async () => {
    const ficheros = [
      ...(await sourceFiles(join(process.cwd(), 'src'))),
      ...(await sourceFiles(join(process.cwd(), 'scripts')))
    ]
    const sospechosos: string[] = []
    for (const fichero of ficheros) {
      const texto = await readFile(fichero, 'utf8')
      // Tabulador, salto de línea y retorno de carro son los únicos legítimos.
      const malo = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.exec(texto)
      if (malo) {
        const linea = texto.slice(0, malo.index).split('\n').length
        sospechosos.push(`${fichero.replace(process.cwd(), '')}:${linea}`)
      }
    }
    check(
      `${ficheros.length} ficheros de código, ninguno con caracteres de control`,
      sospechosos.length === 0,
      sospechosos.join(', ')
    )
  })

  await section('Lógica común', async () => {
    check('slugify quita tildes', slugify('Añoranza Ñoña') === 'anoranza-nona', slugify('Añoranza Ñoña'))
    check('slugify evita nombres reservados de Windows', slugify('CON') === 'con-1')
    check('slugify no deja cadena vacía', slugify('***') === 'servidor')

    // El tar de Windows, por ruta absoluta. Si se llamara por el PATH podría
    // ganar el tar de GNU que instalan Git o MSYS2, que no entiende rutas con
    // letra de unidad y rompe copias y descarga de Java con un error sin
    // relación aparente ("Cannot connect to C: resolve failed").
    const tarPath = systemTarPath()
    check('el tar del sistema existe', await fileExists(tarPath), tarPath)
    const tarVersion = await execFileAsync(tarPath, ['--version'])
      .then((r) => r.stdout.trim())
      .catch(() => '')
    check('y es bsdtar, no el de GNU', tarVersion.startsWith('bsdtar'), tarVersion.slice(0, 40))
  })

  // --- Manifiesto v1 -> v2 ---------------------------------------------------

  await section('Migración del manifiesto', async () => {
    const { manifest, fromSchema } = migrateManifest(MANIFEST_V1)
    check('detecta que venía de la v1', fromSchema === 1)
    check('lo marca como juego Minecraft', manifest.game === 'minecraft')
    check('pasa a la v2', manifest.schemaVersion === 2)
    check(
      'mueve lo de Minecraft a data',
      manifest.data.distribution === 'paper' &&
        manifest.data.minecraftVersion === '26.2' &&
        manifest.data.javaMajor === 25 &&
        manifest.data.memoryMb === 2560 &&
        manifest.data.build === '123' &&
        manifest.data.jvmArgs.length === 3
    )
    check('conserva lo común', manifest.port === 25565 && manifest.exposure?.mode === 'router')
    check('el EULA aceptado pasa a agreements', manifest.agreements.includes('minecraft-eula'))
    check(
      'sin campos sueltos de la v1',
      !('minecraftVersion' in manifest) && !('eulaAccepted' in manifest) && !('distribution' in manifest)
    )

    const again = migrateManifest(manifest)
    check('es idempotente', again.fromSchema === 2 && JSON.stringify(again.manifest) === JSON.stringify(manifest))

    // El EULA nunca se da por aceptado.
    const sinEula = migrateManifest({ ...MANIFEST_V1, eulaAccepted: false }).manifest
    check('un EULA no aceptado sigue sin aceptar', sinEula.agreements.length === 0)

    let futuro = ''
    try {
      migrateManifest({ ...manifest, schemaVersion: 99 })
    } catch (err) {
      futuro = (err as Error).message
    }
    check('rechaza un esquema más nuevo sin tocarlo', futuro.includes('más nueva'), futuro)

    // En disco: se migra al leer y se deja copia del original.
    const dir = instanceDir(MANIFEST_V1.id)
    await mkdir(dir, { recursive: true })
    const original = JSON.stringify(MANIFEST_V1, null, 2)
    await writeFile(join(dir, 'instance.json'), original, 'utf8')

    const read = await readManifest(MANIFEST_V1.id)
    check('se lee migrado', read?.schemaVersion === 2 && read.game === 'minecraft')
    check(
      'deja copia del original en instance.v1.json',
      (await readFile(join(dir, 'instance.v1.json'), 'utf8')) === original
    )
    const onDisk = JSON.parse(await readFile(join(dir, 'instance.json'), 'utf8')) as InstanceManifest
    check('y guarda la v2 en instance.json', onDisk.schemaVersion === 2)

    // Una segunda lectura no debe pisar la copia del original con uno migrado.
    await readManifest(MANIFEST_V1.id)
    check(
      'una segunda lectura no pisa la copia',
      (await readFile(join(dir, 'instance.v1.json'), 'utf8')) === original
    )

    // Copias hechas antes de la v2: su sidecar guardaba minecraftVersion/distribution.
    const backups = backupsDir(MANIFEST_V1.id)
    await mkdir(backups, { recursive: true })
    await writeFile(join(backups, '2026-09-10_18-00-00.zip'), '', 'utf8')
    await writeFile(
      join(backups, '2026-09-10_18-00-00.json'),
      JSON.stringify({
        fileName: '2026-09-10_18-00-00.zip',
        createdAt: '2026-09-10T16:00:00.000Z',
        sizeBytes: 1234,
        minecraftVersion: '26.2',
        distribution: 'paper',
        automatic: false
      }),
      'utf8'
    )
    const [legacy] = await listBackups(MANIFEST_V1.id)
    check(
      'las copias antiguas se siguen leyendo',
      legacy?.version === '26.2' && legacy.variant === 'paper' && legacy.game === 'minecraft',
      `${legacy?.version} · ${legacy?.variant}`
    )

    await service.remove(MANIFEST_V1.id)

    // Un servidor de un juego que esta versión no conoce: fuera de la lista
    // (la interfaz no sabría pintarlo), pero intacto en disco.
    const futureDir = instanceDir('de-otro-juego')
    await mkdir(futureDir, { recursive: true })
    const futureText = JSON.stringify({ ...manifest, id: 'de-otro-juego', game: 'juego-del-futuro', data: {} })
    await writeFile(join(futureDir, 'instance.json'), futureText, 'utf8')
    check(
      'un juego desconocido no sale en la lista',
      !(await service.list()).some((s) => s.manifest.id === 'de-otro-juego')
    )
    check(
      'y su servidor queda intacto',
      (await readFile(join(futureDir, 'instance.json'), 'utf8')) === futureText
    )
    await service.remove('de-otro-juego')
  })

  // --- El contrato de juego, sin Minecraft -----------------------------------

  await section('Juego falso', async () => {
    // Un "servidor" en Node que imprime LISTO, avisa de entradas de jugador y,
    // al recibir su orden de parada (`salir`, no `stop`), guarda y termina.
    const script = [
      "const fs = require('fs')",
      "process.stdout.write('LISTO\\n')",
      "process.stdout.write('ENTRA Ana\\n')",
      "process.stdin.on('data', (d) => {",
      "  if (String(d).includes('salir')) { fs.writeFileSync('guardado.txt', 'ok'); process.exit(0) }",
      '})'
    ].join('\n')

    const dummy: GameAdapter = {
      id: 'falso' as InstanceManifest['game'],
      async prepareCreate() {
        return {} as InstanceManifest['data']
      },
      async writeInitialFiles(manifest) {
        await writeFile(join(serverDir(manifest.id), 'partida.txt'), 'partida falsa', 'utf8')
      },
      async install(_manifest, onProgress) {
        onProgress('falso', 1, 'Nada que descargar')
      },
      async launch(manifest) {
        return { command: process.execPath, args: ['-e', script], cwd: serverDir(manifest.id) }
      },
      stop: () => ({ kind: 'stdin', command: 'salir' }),
      parseLine(raw) {
        return {
          level: 'info',
          text: raw,
          ready: raw === 'LISTO',
          playerJoined: raw.startsWith('ENTRA ') ? raw.slice(6) : undefined
        }
      },
      diagnoseExit(code) {
        return { code: 'unknown-exit', title: 'Se cerró', detail: `Código ${code}` }
      },
      async backupEntries() {
        return ['partida.txt']
      },
      async restoreTargets() {
        return ['partida.txt']
      },
      backupMeta() {
        return { version: '1.0' }
      },
      async ping() {
        return { ok: true }
      },
      async checkFromInternet() {
        return { reachable: false }
      }
    }
    registerGame(dummy)

    const phases: string[] = []
    const statuses: ServerStatus[] = []
    let players: string[] = []
    const onProgress = (update: { phase: string }): void => void phases.push(update.phase)
    const onStatus = (_id: string, status: ServerStatus): void => void statuses.push(status)
    const onPlayers = (_id: string, list: string[]): void => {
      players = list
    }
    service.on('progress', onProgress)
    service.on('status', onStatus)
    service.on('players', onPlayers)

    try {
      const manifest = await service.create({
        game: 'falso',
        name: 'Juego falso',
        port: 1,
        agreements: []
      } as unknown as CreateInstanceRequest)

      check('crea la instancia de otro juego', manifest.game === ('falso' as InstanceManifest['game']))
      check('usa el instalador del juego', phases.includes('falso'))
      check('escribe los ficheros iniciales del juego', await exists(join(serverDir(manifest.id), 'partida.txt')))
      check(
        'aparece en la lista junto a los demás',
        (await listInstances()).some((m) => m.id === manifest.id)
      )

      await service.start(manifest.id)
      check('detecta "listo" con el registro del juego', await waitFor(() => statuses.includes('running'), 10_000))
      check('detecta jugadores con el registro del juego', await waitFor(() => players.includes('Ana'), 5_000))

      await service.stop(manifest.id)
      check('para con la orden propia del juego', await exists(join(serverDir(manifest.id), 'guardado.txt')))
      check('queda parado', (await service.get(manifest.id)).status === 'stopped')

      const backup = await service.createBackup(manifest.id, 'Prueba del juego falso')
      check('la copia usa las rutas del juego', backup.sizeBytes > 0, `${backup.sizeBytes} bytes`)
      check('y anota su juego y versión', backup.game === ('falso' as InstanceManifest['game']) && backup.version === '1.0')

      await service.remove(manifest.id)
      check('se borra igual que cualquier otro', !(await exists(instanceDir(manifest.id))))
    } finally {
      service.off('progress', onProgress)
      service.off('status', onStatus)
      service.off('players', onPlayers)
    }
  })

  // --- Política de reinicio bajo petición -----------------------------------

  await section('Política de reinicio', async () => {
    const t0 = Date.now()

    check('permite el primer reinicio', evaluateRestart([], t0).allowed)

    // Se agota el cupo dentro de la ventana, uno por segundo.
    let seguidos: number[] = []
    for (let i = 0; i < RESTART_LIMIT; i++) {
      seguidos = evaluateRestart(seguidos, t0 + i * 1_000).recent
    }
    check(
      `acumula ${RESTART_LIMIT} marcas dentro de la ventana`,
      seguidos.length === RESTART_LIMIT,
      `${seguidos.length}`
    )
    check(
      `bloquea el reinicio ${RESTART_LIMIT + 1} dentro de la ventana`,
      !evaluateRestart(seguidos, t0 + RESTART_LIMIT * 1_000).allowed
    )

    // Repartidos en 20 minutos, las marcas viejas caducan y no se bloquea
    // nunca: la ventana es deslizante, no un contador absoluto.
    const paso = 4 * 60_000
    let repartidos: number[] = []
    let todosPermitidos = true
    for (let i = 0; i < RESTART_LIMIT + 1; i++) {
      const decision = evaluateRestart(repartidos, t0 + i * paso)
      if (!decision.allowed) todosPermitidos = false
      repartidos = decision.recent
    }
    check(
      `${RESTART_LIMIT + 1} reinicios repartidos en 20 minutos se permiten todos`,
      todosPermitidos
    )
    check(
      'solo conserva las marcas de la ventana',
      repartidos.every((ts) => t0 + RESTART_LIMIT * paso - ts < RESTART_WINDOW_MS),
      `${repartidos.length} marcas vivas`
    )
  })

  // --- Red (§10) ------------------------------------------------------------

  await section('Red', async () => {
    const addresses = network.localAddresses()
    check(
      'detecta alguna IP local',
      addresses.length > 0,
      addresses.map((a) => `${a.address} (${a.label})`).join(', ')
    )
    check(
      'descarta loopback y adaptadores virtuales',
      addresses.every((a) => !a.address.startsWith('127.')),
      'ninguna 127.x'
    )

    // Un puerto altísimo y sin uso no debe dar falso positivo.
    const free = await network.isPortInUse(59999)
    check('puerto libre se reporta como libre', free === false)

    const suggestion = await network.findFreePort(59990)
    check('sugiere un puerto libre', suggestion >= 59990, String(suggestion))

    // Puerta de enlace: se saca de `route print`, cuya salida está traducida.
    // El patrón es numérico para no depender del idioma de Windows.
    const gateway = await network.defaultGateway()
    check(
      'detecta la puerta de enlace',
      gateway !== null && /^\d+\.\d+\.\d+\.\d+$/.test(gateway),
      gateway ?? 'no detectada'
    )
  })

  await section('IP pública', async () => {
    const ip = await network.publicIp()
    check(
      'consulta la IP pública',
      ip !== null && /^\d+\.\d+\.\d+\.\d+$/.test(ip),
      ip ? 'obtenida' : 'no disponible' // no se imprime: es un dato personal
    )
  })
}
