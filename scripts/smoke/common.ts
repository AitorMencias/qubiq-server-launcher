import { join } from 'node:path'
import { hostname, userInfo } from 'node:os'
import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'

import { check, execFileAsync, fileExists, section } from './harness'
import { backupsDir, childPath, instanceDir, serverDir, slugify, systemTarPath } from '../../src/main/core/paths'
import * as network from '../../src/main/core/net/network'
import { evaluateRestart, RESTART_LIMIT, RESTART_WINDOW_MS } from '../../src/main/core/runtime/restartPolicy'
import { migrateManifest } from '../../src/main/core/instances/migrations'
import { listInstances, readManifest } from '../../src/main/core/instances/manager'
import { deleteBackup, listBackups } from '../../src/main/core/backup/manager'
import { registerGame } from '../../src/main/core/games/registry'
import type { GameAdapter } from '../../src/main/core/games/types'
import { service } from '../../src/main/core/service'
import type { CreateInstanceRequest, InstanceManifest, ServerStatus } from '../../src/shared/types'
import {
  formatMinutes,
  intervalMinutes,
  intervalProblem,
  keepForRecommendedHistory,
  recommendedInterval
} from '../../src/shared/backup'

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

/** Ficheros de texto de una carpeta (las grabaciones), sin los binarios. */
async function textFiles(dir: string, out: string[] = []): Promise<string[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) await textFiles(path, out)
    else if (/\.(txt|json|md|yml|yaml|log|ini|lua|cfg|acf|vdf|uplugin)$/i.test(entry.name)) out.push(path)
  }
  return out
}

/** Bucle, red privada, CGNAT, enlace local o los rangos de documentación (RFC 5737). */
function privateOrDocumentation(ip: string): boolean {
  const [a, b, c] = ip.split('.').map(Number) as [number, number, number]
  return (
    a === 0 || a === 10 || a === 127 || a === 255 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  )
}

export async function commonSmoke(): Promise<void> {
  /**
   * Caracteres de control invisibles en el código.
   *
   * Parece una manía, pero costó una tarde: editando desde Git Bash se coló un
   * **retroceso de verdad** (0x08) dentro de una expresión regular, donde tenía
   * que haber un `\b`. El fichero se veía perfecto, TypeScript compilaba y la
   * regla no casaba nunca. Es justo la trampa que avisa docs/DESARROLLO.md, y esto es lo
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

  /**
   * Las grabaciones reales van al repositorio, que es público: no pueden
   * llevar el usuario ni el nombre del equipo de quien las grabó, ni una IP
   * pública. Ya se coló una vez: el volcado de hardware de Rust escribe el
   * nombre del equipo, y no pasó por el script que quita las rutas.
   */
  await section('Grabaciones sin datos personales', async () => {
    const dir = join(process.cwd(), 'scripts', 'smoke', 'fixtures')
    const ficheros = await textFiles(dir)
    // Los de serie (o de la máquina virtual de alguien) no dicen nada de nadie.
    const genericos = new Set(['usuario', 'user', 'admin', 'administrador', 'runner', 'localhost'])
    const propios = [userInfo().username, hostname(), process.env.COMPUTERNAME ?? '']
      .map((nombre) => nombre.trim().toLowerCase())
      .filter((nombre) => nombre.length >= 3 && !genericos.has(nombre))

    const hallazgos: string[] = []
    for (const fichero of ficheros) {
      const texto = await readFile(fichero, 'utf8')
      const corto = fichero.replace(dir, '')
      const bajo = texto.toLowerCase()
      for (const nombre of new Set(propios)) {
        if (bajo.includes(nombre)) hallazgos.push(`${corto}: «${nombre}»`)
      }
      // Solo lo que se presenta como dirección (ip=, /IP:puerto, "IP x"): los
      // números de versión de cuatro partes son legítimos y abundan.
      for (const m of texto.matchAll(/(?:ip[=: ]+|\/|address[=: ]+)((?:\d{1,3}\.){3}\d{1,3})|((?:\d{1,3}\.){3}\d{1,3}):\d{2,5}\b/gi)) {
        const ip = m[1] ?? m[2]!
        if (!privateOrDocumentation(ip)) hallazgos.push(`${corto}: IP ${ip}`)
      }
    }
    check(
      `${ficheros.length} grabaciones sin el usuario, el equipo ni IPs públicas`,
      hallazgos.length === 0,
      hallazgos.slice(0, 10).join(', ')
    )
  })

  /**
   * Lo que llega de la interfaz no puede salirse de la carpeta de datos (§19.36).
   * Antes, `instances.remove('..')` borraba la carpeta de datos entera y borrar
   * el mundo `..` borraba la carpeta del servidor.
   */
  await section('Rutas que llegan de la interfaz', async () => {
    const lanza = (fn: () => unknown): boolean => {
      try {
        fn()
        return false
      } catch {
        return true
      }
    }
    const malos = ['..', '../otro', '..\\otro', 'C:\\Windows', '/etc', 'a/b', 'a\\b', '', 'Mayúsculas', '.oculto', 'con espacio']
    const pasan = malos.filter((id) => !lanza(() => instanceDir(id)))
    check('instanceDir rechaza identificadores que no son de slugify', pasan.length === 0, pasan.join(' | '))
    const buenos = ['hc-lobby', 'mi-servidor-2', 'demo', slugify('Añoranza Ñoña'), `${slugify('x'.repeat(60))}-1a2b3c4d`]
    const rechazados = buenos.filter((id) => lanza(() => instanceDir(id)))
    check('y acepta los de verdad', rechazados.length === 0, rechazados.join(' | '))

    const nombresMalos = ['..', '.', '../fuera', 'a\\b', 'a/b', 'C:x', '', '   ', 'nul\u0000']
    const cuelan = nombresMalos.filter((n) => !lanza(() => childPath('C:\\datos', n)))
    check('childPath rechaza todo lo que no es un nombre suelto', cuelan.length === 0, cuelan.map((n) => JSON.stringify(n)).join(' '))
    check('y deja los nombres normales', !lanza(() => childPath('C:\\datos', 'Mundo de prueba')) && !lanza(() => childPath('C:\\datos', 'world_nether')))

    let copiaRara = false
    await deleteBackup('demo', '..\\..\\instance.json').catch(() => (copiaRara = true))
    check('borrar una copia con ruta se rechaza', copiaRara)
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
      "process.stdout.write('ENTRA Luis\\n')",
      "process.stdout.write('GUARDADO\\n')",
      "process.stdout.write('GUARDADO\\n')",
      "process.stdin.on('data', (d) => {",
      "  if (String(d).includes('echar')) process.stdout.write('ECHADO Luis\\nSALE Luis\\n')",
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
          playerJoined: raw.startsWith('ENTRA ') ? raw.slice(6) : undefined,
          playerLeft: raw.startsWith('SALE ') ? raw.slice(5) : undefined,
          saved: raw === 'GUARDADO',
          moderation: raw.startsWith('ECHADO ') ? { action: 'kick', player: raw.slice(7) } : undefined
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

      await waitFor(() => players.includes('Luis'), 5_000)
      // Una orden escrita en la consola, otra mandada por un botón (no va al
      // historial) y una desde el control remoto, con su dispositivo.
      await service.sendCommand(manifest.id, 'decir hola')
      await service.sendCommand(manifest.id, 'echar Luis', { journal: false })
      check('lo que cuenta el registro llega', await waitFor(() => !players.includes('Luis'), 5_000))
      await service.sendCommand(manifest.id, 'decir adiós', { by: 'Móvil de prueba' })

      await service.stop(manifest.id)
      check('para con la orden propia del juego', await exists(join(serverDir(manifest.id), 'guardado.txt')))
      check('queda parado', (await service.get(manifest.id)).status === 'stopped')

      // Desde el arranque: antes está la copia previa a instalar, que este
      // juego sí hace porque crea su partida en `writeInitialFiles`.
      const todo = (await service.listJournal(manifest.id, 100)).reverse()
      const historial = todo.slice(todo.findIndex((e) => e.kind === 'start'))
      const resumen = historial.map((e) => {
        switch (e.kind) {
          case 'join':
          case 'leave':
            return `${e.kind}:${e.player}:${e.online}`
          case 'moderation':
            return `moderation:${e.action}:${e.player}`
          case 'command':
            return `command:${e.command}${e.by ? `@${e.by}` : ''}`
          default:
            return e.kind
        }
      })
      check(
        'el historial apunta lo que ha pasado, en orden',
        resumen.join(' | ') ===
          [
            'start',
            'join:Ana:1',
            'join:Luis:2',
            'save',
            'command:decir hola',
            'moderation:kick:Luis',
            'leave:Luis:1',
            'command:decir adiós@Móvil de prueba',
            'stop'
          ].join(' | '),
        resumen.join(' | ')
      )
      check(
        'al parar no apunta que se va cada uno',
        !historial.some((e) => e.kind === 'leave' && e.player === 'Ana')
      )

      const backup = await service.createBackup(manifest.id, 'Prueba del juego falso')
      check(
        'y apunta las copias',
        (await service.listJournal(manifest.id, 1))[0]?.kind === 'backup'
      )
      check('la copia usa las rutas del juego', backup.sizeBytes > 0, `${backup.sizeBytes} bytes`)
      check('y anota su juego y versión', backup.game === ('falso' as InstanceManifest['game']) && backup.version === '1.0')

      // El nombre solo llega al segundo. Pedir una copia y cambiar de versión
      // justo después caía en el mismo segundo y la segunda se comía a la
      // primera, que es justo la que alguien había pedido a mano.
      const seguida = await service.createBackup(manifest.id, 'Y otra en el mismo segundo')
      check('dos copias seguidas no comparten nombre', seguida.fileName !== backup.fileName, seguida.fileName)
      const guardadas = (await listBackups(manifest.id)).map((b) => b.fileName)
      check(
        'y las dos siguen en la lista',
        guardadas.includes(backup.fileName) && guardadas.includes(seguida.fileName),
        guardadas.join(', ')
      )

      const cada5 = await service.updateInstance(manifest.id, {
        backup: { enabled: true, intervalHours: 5 / 60, keep: 36 }
      })
      check('acepta copias cada 5 minutos', intervalMinutes(cada5.backup) === 5)
      const rechaza = async (backup: InstanceManifest['backup']): Promise<boolean> =>
        service.updateInstance(manifest.id, { backup }).then(
          () => false,
          () => true
        )
      check('rechaza menos de 5 minutos', await rechaza({ enabled: true, intervalHours: 4 / 60, keep: 10 }))
      check('rechaza conservar 0 copias', await rechaza({ enabled: true, intervalHours: 1, keep: 0 }))
      check(
        'y no guarda lo rechazado',
        intervalMinutes((await service.get(manifest.id)).manifest.backup) === 5
      )

      await service.remove(manifest.id)
      check('se borra igual que cualquier otro', !(await exists(instanceDir(manifest.id))))
    } finally {
      service.off('progress', onProgress)
      service.off('status', onStatus)
      service.off('players', onPlayers)
    }
  })

  // --- Frecuencia de las copias automáticas ---------------------------------

  await section('Frecuencia de copias', async () => {
    const MB = 1024 * 1024
    const minecraft = { game: 'minecraft' } as InstanceManifest
    const valheim = (segundos: number): InstanceManifest =>
      ({ game: 'valheim', data: { saveIntervalSeconds: segundos } }) as InstanceManifest

    check('un mundo pequeño, a menudo', recommendedInterval(minecraft, 50 * MB).minutes === 15)
    check('uno grande, más espaciado', recommendedInterval(minecraft, 8 * 1024 * MB).minutes === 180)
    check(
      'nunca por debajo del guardado del propio juego',
      recommendedInterval(valheim(1800), 50 * MB).minutes === 30
    )
    check('Valheim guardando a menudo sigue el tamaño', recommendedInterval(valheim(300), 50 * MB).minutes === 15)
    check('5 minutos valen', intervalProblem(5) === null)
    check('4 no', intervalProblem(4) !== null)
    check('ni un intervalo con decimales', intervalProblem(7.5) !== null)
    check('para 3 horas cada 5 minutos hacen falta 36', keepForRecommendedHistory(5) === 36)
    check('1 h 30 min se lee bien', formatMinutes(90) === '1 h 30 min')
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
