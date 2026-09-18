/**
 * Prueba de humo de NeoForge y de los servidores a medida (§19.x): su
 * catálogo, reconocer una carpeta, decidir si se puede traer, moverla sin
 * perder nada y preparar su arranque con su propio run.bat.
 *
 * Las carpetas de servidor son de mentira y viven en un temporal APARTE de la
 * raíz de datos: traer una carpeta que ya está dentro de QubiQ está prohibido,
 * y eso también se comprueba.
 */

import { homedir, tmpdir } from 'node:os'
import { join, parse } from 'node:path'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'

import { check, fileExists, section } from './harness'
import * as neoforge from '../../src/main/core/games/minecraft/versions/neoforge'
import * as catalog from '../../src/main/core/games/minecraft/versions/catalog'
import {
  analyzeScript,
  describeStartFile,
  detectServer,
  folderProblems,
  inspectFolder,
  memoryControlFor
} from '../../src/main/core/games/minecraft/custom/inspect'
import { copyThenRemove, moveServerFolder } from '../../src/main/core/games/minecraft/custom/move'
import { customLaunch, javaEnv, withMemory, withoutPauses } from '../../src/main/core/games/minecraft/custom/launch'
import { minecraftAdapter } from '../../src/main/core/games/minecraft/adapter'
import { capabilitiesFor } from '../../src/shared/games'
import { dataRoot } from '../../src/main/core/paths'
import type { MinecraftManifest } from '../../src/shared/types'

/** El run.bat que genera el instalador de NeoForge, tal cual (21.1.x). */
const NEOFORGE_RUN_BAT = [
  '@echo off',
  'REM Forge requires a configured set of both JVM and program arguments.',
  'REM Add custom JVM arguments to the user_jvm_args.txt',
  'REM Add custom program arguments {such as nogui} to this file in the next line before the %* or',
  'REM  pass them to this script directly',
  'java @user_jvm_args.txt @libraries/net/neoforged/neoforge/21.1.77/win_args.txt %*',
  'pause'
].join('\r\n')

/** Un script de pack con reinicio automático y memoria propia. */
const LOOP_BAT = [
  '@echo off',
  ':: Reinicio automatico',
  ':start',
  'java -Xmx6G -jar server.jar nogui',
  'echo Reiniciando en 10 segundos...',
  'timeout /t 10',
  'goto start'
].join('\r\n')

const USER_JVM_ARGS = [
  '# Xmx and Xms set the maximum and minimum RAM usage, respectively.',
  '# -Xmx4G',
  '-XX:+UseZGC -XX:+ZGenerational',
  '-Xms2G -Xmx4G',
  ''
].join('\r\n')

async function fakeNeoForgePack(root: string): Promise<string> {
  const dir = join(root, 'Mi Pack (NeoForge)')
  await mkdir(join(dir, 'libraries', 'net', 'neoforged', 'neoforge', '21.1.77'), { recursive: true })
  await writeFile(join(dir, 'libraries', 'net', 'neoforged', 'neoforge', '21.1.77', 'win_args.txt'), '-p x')
  await mkdir(join(dir, 'mods'), { recursive: true })
  await writeFile(join(dir, 'mods', 'a.jar'), 'a')
  await writeFile(join(dir, 'mods', 'b.jar'), 'bb')
  await mkdir(join(dir, 'config'), { recursive: true })
  await writeFile(join(dir, 'config', 'algo.toml'), 'x = 1')
  await writeFile(join(dir, 'run.bat'), NEOFORGE_RUN_BAT)
  await writeFile(join(dir, 'bucle.bat'), LOOP_BAT)
  await writeFile(join(dir, 'user_jvm_args.txt'), USER_JVM_ARGS)
  await writeFile(join(dir, 'neoforge-21.1.77-installer.jar'), 'no es un jar')
  await writeFile(join(dir, 'server.properties'), 'server-port=25611\r\nmax-players=12\r\nlevel-name=mundo\r\n')
  await mkdir(join(dir, 'mundo'), { recursive: true })
  await writeFile(join(dir, 'mundo', 'level.dat'), 'nbt')
  return dir
}

function manifestFor(custom: MinecraftManifest['data']['custom']): MinecraftManifest {
  return {
    schemaVersion: 2,
    id: 'a-medida',
    name: 'A medida',
    game: 'minecraft',
    port: 25565,
    autoRestart: false,
    backup: { enabled: true, intervalHours: 6, keep: 10 },
    createdAt: new Date().toISOString(),
    agreements: ['minecraft-eula'],
    data: {
      distribution: 'neoforge',
      minecraftVersion: '1.21.1',
      javaMajor: 21,
      memoryMb: 4096,
      jvmArgs: [],
      ...(custom ? { custom } : {})
    }
  }
}

export async function minecraftCustomSmoke(): Promise<void> {
  // --- NeoForge ----------------------------------------------------------------

  await section('NeoForge (lógica)', async () => {
    const cases: [string, string | null, boolean][] = [
      ['21.1.77', '1.21.1', false],
      ['21.0.167', '1.21', false],
      ['20.4.251', '1.20.4', false],
      ['20.2.3-beta', '1.20.2', true],
      ['26.1.2.109', '26.1.2', false],
      ['26.2.0.88', '26.2', false],
      ['26.3.0.6-beta', '26.3', true],
      ['0.25w14craftmine.3-beta', null, true]
    ]
    for (const [version, mc, experimental] of cases) {
      const parsed = neoforge.parseVersion(version)
      check(
        `${version} es de Minecraft ${mc ?? '(ninguna)'}`,
        (parsed?.minecraftVersion ?? null) === mc && (parsed === null || parsed.experimental === experimental),
        parsed ? `${parsed.minecraftVersion}${parsed.experimental ? ' (en pruebas)' : ''}` : 'descartada'
      )
    }
    const build = neoforge.buildFor('21.1.77', false)
    check(
      'URL del instalador de NeoForge',
      build.installerUrl ===
        'https://maven.neoforged.net/releases/net/neoforged/neoforge/21.1.77/neoforge-21.1.77-installer.jar',
      build.installerFileName
    )
  })

  await section('NeoForge (API)', async () => {
    const builds = await neoforge.listAllBuilds()
    check('el catálogo devuelve versiones', builds.length > 100, `${builds.length}`)
    // Si NeoForge cambiara otra vez su numeración, esto es lo primero que cae.
    const newest = builds[builds.length - 1]!
    const mojangNewest = (await catalog.versionsFor('vanilla'))[0]?.minecraftVersion
    check(
      'la más nueva es de una versión de Minecraft que existe',
      (await catalog.versionsFor('vanilla', { includeUnstable: true })).some(
        (v) => v.minecraftVersion === newest.minecraftVersion
      ),
      `${newest.version} → ${newest.minecraftVersion} (Mojang: ${mojangNewest})`
    )

    // 1.21.1 es la versión de NeoForge de referencia de los modpacks.
    const stable = await neoforge.resolveBuild('1.21.1')
    check('resuelve una estable para 1.21.1', !stable.experimental, stable.version)
    const head = await fetch(stable.installerUrl, { method: 'HEAD' })
    check('el instalador existe de verdad', head.ok, `${head.status}`)

    const offered = await catalog.versionsFor('neoforge')
    const recommended = offered.find((v) => v.recommended)
    check('el catálogo ofrece NeoForge', offered.length > 5, `${offered.length} versiones`)
    check(
      'la recomendada tiene NeoForge estable',
      recommended !== undefined && !recommended.experimental,
      recommended?.minecraftVersion
    )
    check(
      'las que solo tienen betas salen marcadas',
      offered.filter((v) => v.experimental).every((v) => v.minecraftVersion !== recommended?.minecraftVersion)
    )
  })

  // --- Scripts de inicio -----------------------------------------------------------

  await section('Servidores a medida: scripts de inicio', async () => {
    const neo = analyzeScript(NEOFORGE_RUN_BAT)
    check('el run.bat de NeoForge tiene pausa', neo.pauses)
    check('usa user_jvm_args.txt', neo.usesJvmArgsFile)
    check('no fija la memoria (el -Xmx de los REM no cuenta)', !neo.setsMemory)
    check('no tiene bucle', !neo.restartLoop)
    check('la memoria la pondría la app en user_jvm_args', memoryControlFor('script', neo, true) === 'jvm-args')
    check('sin user_jvm_args.txt, la decide el script', memoryControlFor('script', neo, false) === 'script')

    const loop = analyzeScript(LOOP_BAT)
    check('detecta el bucle de reinicio', loop.restartLoop)
    check('detecta que fija la memoria', loop.setsMemory)
    check('ahí la memoria la decide el script', memoryControlFor('script', loop, true) === 'script')
    check('goto :eof no es un bucle', !analyzeScript(':a\r\necho x\r\ngoto :eof').restartLoop)
    check('saltar hacia delante no es un bucle', !analyzeScript('goto fin\r\necho x\r\n:fin').restartLoop)
    check('un jar lo arranca la app con su memoria', memoryControlFor('jar', null, true) === 'app')

    const stripped = withoutPauses(NEOFORGE_RUN_BAT + '\r\njava -jar x.jar || pause\r\nREM pause', 'run.bat')
    check('quita la línea de pause', !/^pause$/im.test(stripped))
    check('quita el «|| pause»', stripped.includes('java -jar x.jar') && !/\|\|\s*pause/i.test(stripped))
    check('respeta los comentarios', stripped.includes('REM pause'))
    check('ya no pausa', !analyzeScript(stripped).pauses)
    check('conserva la orden de arranque', stripped.includes('java @user_jvm_args.txt'))
    check('conserva los finales de línea de Windows', stripped.includes('\r\n'))

    const memory = withMemory(USER_JVM_ARGS, 6144)
    check('pone la memoria elegida', memory.includes('-Xms6144M') && memory.includes('-Xmx6144M'))
    check('quita la memoria que tenía', !/^[^#]*-Xm[sx][24]G/m.test(memory))
    check('y deja el comentario que la nombra', memory.includes('# -Xmx4G'))
    check('conserva el resto de opciones', memory.includes('-XX:+UseZGC -XX:+ZGenerational'))
    check('conserva los comentarios', memory.includes('# Xmx and Xms set'))
    check('aplicarlo dos veces no cambia nada', withMemory(memory, 6144) === memory)
    check('ni acumula líneas', withMemory(withMemory(memory, 2048), 6144) === memory)

    const env = javaEnv('C:\\Java\\jdk-21\\bin\\java.exe')
    const pathKeys = Object.keys(env).filter((k) => k.toUpperCase() === 'PATH')
    check('una sola clave de PATH', pathKeys.length === 1, pathKeys.join(','))
    check('el Java de la app va primero', env[pathKeys[0]!]!.startsWith('C:\\Java\\jdk-21\\bin;'))
    check('JAVA_HOME apunta a su carpeta', env['JAVA_HOME'] === 'C:\\Java\\jdk-21')
  })

  // --- Reconocer carpetas ------------------------------------------------------

  // Aquí se mueven y se borran carpetas dentro de la raíz de datos: si alguna
  // sección anterior la hubiera dejado apuntando fuera del temporal, se para.
  if (!dataRoot().toLowerCase().startsWith(tmpdir().toLowerCase())) {
    check('la raíz de datos es la temporal de la prueba', false, dataRoot())
    return
  }
  const outside = await mkdtemp(join(tmpdir(), 'qubiq-smoke-traer-'))
  try {
    await section('Servidores a medida: reconocer la carpeta', async () => {
      const pack = await fakeNeoForgePack(outside)
      const found = await inspectFolder(pack)
      check('se puede traer', found.problems.length === 0, found.problems.join(' | '))
      check('reconoce NeoForge', found.distribution === 'neoforge', found.distribution ?? 'nada')
      check('y su versión de Minecraft', found.minecraftVersion === '1.21.1', found.minecraftVersion ?? '')
      check('y la de NeoForge', found.build === '21.1.77', found.build ?? '')
      check('propone run.bat', found.suggestedStartFile === 'run.bat', found.suggestedStartFile ?? '')
      check(
        'no ofrece el instalador como inicio',
        !found.startFiles.some((f) => f.path.includes('installer'))
      )
      check('lee el puerto de server.properties', found.port === 25611, `${found.port}`)
      check('y los jugadores', found.maxPlayers === 12)
      check('cuenta los mods', found.contentCount === 2, `${found.contentCount}`)
      check('ve el mundo aunque no se llame world', found.hasWorld)
      check('mismo disco que los datos', found.sameDrive === (parse(pack).root === parse(dataRoot()).root))
      const loop = found.startFiles.find((f) => f.path === 'bucle.bat')
      check('marca el script con bucle', loop?.restartLoop === true && loop.memory === 'script')

      let rejected = ''
      try {
        await describeStartFile(pack, '..\\fuera.bat')
      } catch (err) {
        rejected = (err as Error).message
      }
      check('no deja un inicio fuera de la carpeta', rejected.includes('dentro'), rejected)

      // Otros tipos, por lo que dejan en disco.
      const forge = join(outside, 'forge')
      await mkdir(join(forge, 'libraries', 'net', 'minecraftforge', 'forge', '1.20.1-47.4.0'), { recursive: true })
      await writeFile(join(forge, 'libraries', 'net', 'minecraftforge', 'forge', '1.20.1-47.4.0', 'win_args.txt'), '')
      const f = await detectServer(forge)
      check('reconoce Forge', f.distribution === 'forge' && f.minecraftVersion === '1.20.1' && f.build === '47.4.0')

      const paper = join(outside, 'paper')
      await mkdir(paper, { recursive: true })
      await writeFile(join(paper, 'paper-1.21.4-232.jar'), '')
      const p = await detectServer(paper)
      check('reconoce Paper', p.distribution === 'paper' && p.minecraftVersion === '1.21.4' && p.build === '232')

      const fabric = join(outside, 'fabric')
      await mkdir(fabric, { recursive: true })
      await writeFile(join(fabric, 'fabric-server-mc.1.21.1-loader.0.16.10-launcher.1.0.1.jar'), '')
      const fa = await detectServer(fabric)
      check('reconoce Fabric', fa.distribution === 'fabric' && fa.minecraftVersion === '1.21.1')

      const pack2 = join(outside, 'pack-sin-instalar')
      await mkdir(join(pack2, 'mods'), { recursive: true })
      await writeFile(join(pack2, 'neoforge-26.1.2.109-installer.jar'), '')
      const n2 = await detectServer(pack2)
      check('un pack sin instalar se reconoce por su instalador', n2.distribution === 'neoforge' && n2.minecraftVersion === '26.1.2')

      const logged = join(outside, 'con-registro')
      await mkdir(join(logged, 'logs'), { recursive: true })
      await mkdir(join(logged, 'mods'), { recursive: true })
      await writeFile(join(logged, 'logs', 'latest.log'), '[12:00:00] [Server thread/INFO]: Starting minecraft server version 1.20.1\n')
      check('si no, la versión sale del registro', (await detectServer(logged)).minecraftVersion === '1.20.1')
    })

    await section('Servidores a medida: carpetas prohibidas', async () => {
      check('la carpeta del usuario', (await folderProblems(homedir())).length > 0)
      check('un disco entero', (await folderProblems(parse(outside).root)).length > 0)
      check('los datos de QubiQ', (await folderProblems(dataRoot())).length > 0)
      check('algo dentro de QubiQ', (await folderProblems(join(dataRoot(), 'instances'))).length > 0)
      check('una que contiene QubiQ', (await folderProblems(join(dataRoot(), '..'))).length > 0)
      const desktop = join(outside, 'Escritorio')
      await mkdir(desktop, { recursive: true })
      check('una que se llama como el Escritorio', (await folderProblems(desktop)).length > 0)
      check('una que no existe', (await folderProblems(join(outside, 'no-existe'))).length > 0)
      check('una ruta relativa', (await folderProblems('servidor')).length > 0)

      const random = join(outside, 'fotos')
      await mkdir(random, { recursive: true })
      await writeFile(join(random, 'hacer-algo.bat'), 'echo hola')
      const r = await inspectFolder(random)
      check('una carpeta cualquiera con un .bat no se trae', r.problems.length > 0, r.problems[0])

      let rejected = ''
      try {
        await minecraftAdapter.prepareCreate(
          {
            game: 'minecraft',
            name: 'x',
            port: 25565,
            agreements: ['minecraft-eula'],
            options: {
              distribution: 'paper',
              minecraftVersion: '1.21.1',
              memoryMb: 2048,
              import: { folder: homedir(), startFile: 'run.bat' }
            }
          },
          'x'
        )
      } catch (err) {
        rejected = (err as Error).message
      }
      check('el núcleo lo vuelve a comprobar aunque la interfaz fallara', rejected.length > 0, rejected.slice(0, 60))
    })

    // --- Moverla -----------------------------------------------------------------

    await section('Servidores a medida: mover la carpeta', async () => {
      const pack = await fakeNeoForgePack(join(outside, 'mover'))
      const before = (await inspectFolder(pack)).fileCount
      const target = join(dataRoot(), 'instances', 'traido', 'server')
      await mkdir(target, { recursive: true }) // La vacía que deja la instancia.

      const moved = await moveServerFolder(pack, target)
      check('en el mismo disco se renombra, sin copiar', !moved.copied && !moved.leftovers)
      check('la original ya no está', !(await fileExists(join(pack, 'run.bat'))))
      check('está entera en su sitio', (await inspectFolder(target).catch(() => null)) !== null)
      const after = (await readdir(target, { recursive: true })).length
      check('con todo lo que tenía', after >= before, `${after} entradas`)

      // Entre discos: se prueba el camino de copia directamente.
      const pack2 = await fakeNeoForgePack(join(outside, 'copiar'))
      const target2 = join(dataRoot(), 'instances', 'traido-2', 'server')
      const progress: number[] = []
      const copied = await copyThenRemove(pack2, target2, (f) => {
        if (f !== null) progress.push(f)
      })
      check('copia y borra la original', copied.copied && !copied.leftovers && !(await fileExists(join(pack2, 'run.bat'))))
      check('la copia es idéntica', (await readFile(join(target2, 'run.bat'), 'utf8')) === NEOFORGE_RUN_BAT)
      check('no deja la carpeta temporal', !(await fileExists(join(`${target2}.importando`, 'run.bat'))))

      // Nunca encima de un servidor que ya está.
      const pack3 = await fakeNeoForgePack(join(outside, 'encima'))
      let refused = ''
      try {
        await moveServerFolder(pack3, target)
      } catch (err) {
        refused = (err as Error).message
      }
      check('no mueve encima de una carpeta con cosas', refused.length > 0, refused.slice(0, 50))
      check('y la original sigue intacta', await fileExists(join(pack3, 'run.bat')))
      check('y el servidor de antes también', await fileExists(join(target, 'run.bat')))

      let missing = ''
      const empty = join(dataRoot(), 'instances', 'traido-3', 'server')
      await mkdir(empty, { recursive: true })
      try {
        await moveServerFolder(join(outside, 'no-existe'), empty)
      } catch (err) {
        missing = (err as Error).message
      }
      check('si la original ya no existe, lo dice', missing.includes('ya no existe'), missing)
      check('y deja la carpeta de la instancia como estaba', (await readdir(empty)).length === 0)
    })

    // --- Arranque ----------------------------------------------------------------

    await section('Servidores a medida: arranque', async () => {
      const dir = join(dataRoot(), 'instances', 'traido', 'server')
      const java = 'C:\\Java\\jdk-21\\bin\\java.exe'

      const script = await customLaunch(dir, { startFile: 'run.bat', memory: 'jvm-args' }, java, 3072)
      check('un .bat se lanza con cmd', /cmd\.exe$/i.test(script.command), script.command)
      check(
      'con /s, todo entrecomillado y .\\ delante',
      script.args.join(' ') === '/d /s /c "".\\qubiq-run.bat" nogui"',
      script.args.join(' ')
    )
      check('sin tocar las comillas', script.verbatimArguments === true)
      check('matando el árbol entero al forzar', script.killTree === true)
      check('arranca la copia sin pausas', await fileExists(join(dir, 'qubiq-run.bat')))
      check('el original no se toca', (await readFile(join(dir, 'run.bat'), 'utf8')) === NEOFORGE_RUN_BAT)
      const jvm = await readFile(join(dir, 'user_jvm_args.txt'), 'utf8')
      check('pone la memoria en user_jvm_args.txt', jvm.includes('-Xmx3072M') && jvm.includes('-XX:+UseZGC'))

      const loop = await customLaunch(dir, { startFile: 'bucle.bat', memory: 'script' }, java, 3072)
      check('un script sin pausas se lanza tal cual', loop.args.join(' ').includes('".\\bucle.bat"'), loop.args.join(' '))

      const startFiles = await describeStartFile(dir, 'run.bat')
      check('la copia no se ofrece como inicio', startFiles.path === 'run.bat')
      let refused = ''
      try {
        await describeStartFile(dir, 'qubiq-run.bat')
      } catch (err) {
        refused = (err as Error).message
      }
      check('ni se deja elegir', refused.includes('original'), refused)

      await writeFile(join(dir, 'server.jar'), 'jar')
      const jar = await customLaunch(dir, { startFile: 'server.jar', memory: 'app' }, java, 3072)
      check('un .jar se lanza con el Java de la app', jar.command === java && jar.args.includes('-Xmx3072M'))
      check('y sin matar árboles', !jar.killTree)

      let missing = ''
      try {
        await customLaunch(dir, { startFile: 'no-existe.bat', memory: 'script' }, java, 3072)
      } catch (err) {
        missing = (err as Error).message
      }
      check('si falta el archivo de inicio, dice dónde cambiarlo', missing.includes('Archivo de inicio'), missing)

      const caps = capabilitiesFor(manifestFor({ startFile: 'run.bat', memory: 'script' }))
      check('uno a medida no gestiona versiones', !caps.versions)
      check('ni enseña la memoria si la fija el script', !caps.memory)
      check('ni se reinstala', !caps.reinstall)
      check('pero sí tiene mods', caps.content)
      const pending = capabilitiesFor(manifestFor({ startFile: 'run.bat', memory: 'jvm-args', importFrom: 'C:\\x' }))
      check('a medio traer sí se puede reintentar', pending.reinstall && pending.memory)
      check('los demás siguen igual', capabilitiesFor(manifestFor(undefined)).versions)

      const update = await minecraftAdapter.checkUpdate!(manifestFor({ startFile: 'run.bat', memory: 'script' }))
      check('no avisa de versiones nuevas', !update.available)
      check('ni ofrece cambiarla', (await minecraftAdapter.listVersions!(manifestFor({ startFile: 'run.bat', memory: 'script' }))).length === 0)
    })
  } finally {
    await rm(outside, { recursive: true, force: true })
  }
}
