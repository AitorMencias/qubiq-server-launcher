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
import { mkdtemp, rm, access, readdir, writeFile, readFile } from 'node:fs/promises'

import { setDataRoot, setResourcesRoot, serverDir } from '../../src/main/core/paths'
import { service } from '../../src/main/core/service'
import * as catalog from '../../src/main/core/games/minecraft/versions/catalog'
import type { Distribution } from '../../src/shared/games/minecraft/types'
import { minecraftOf } from '../../src/shared/games/minecraft/types'

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
  // Los jars de los plugins oficiales viven en el repositorio; empaquetados irían
  // junto al ejecutable. Fuera de Electron hay que decírselo a mano.
  setResourcesRoot(join(process.cwd(), 'resources'))
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
    game: 'minecraft',
    name: 'Prueba E2E',
    expectedPlayers: 12,
    port: PORT,
    agreements: ['minecraft-eula'],
    exposure: { mode: 'router' },
    options: {
      distribution: DISTRIBUTION,
      minecraftVersion: version,
      memoryMb: 2048,
      // Lo mismo que manda el asistente básico al terminar el recorrido. Modo
      // extremo: `hardcore` es una clave aparte, no un valor de `gamemode`, y la
      // dificultad pedida (normal) debe quedar forzada a Difícil.
      properties: {
        gamemode: 'survival',
        hardcore: 'true',
        difficulty: 'normal',
        'level-type': 'minecraft:normal',
        pvp: 'false'
      }
    }
  })

  const installSeconds = Math.round((Date.now() - started) / 1000)
  console.log(`\n== Instalación terminada en ${installSeconds} s`)
  check('la instancia existe', manifest.id.length > 0, manifest.id)
  check('detectó el Java correcto', manifest.data.javaMajor >= 8, `Java ${manifest.data.javaMajor}`)

  const dir = serverDir(manifest.id)
  check('creó eula.txt', await exists(join(dir, 'eula.txt')))
  check('creó server.properties', await exists(join(dir, 'server.properties')))
  check('fijó max-players con los jugadores esperados', manifest.expectedPlayers === 12)

  // Lo elegido en el asistente tiene que estar ya en disco antes del primer
  // arranque: la idea es no tener que pasar por Ajustes después.
  const chosen = await service.minecraft.getProperties(manifest.id)
  check('aplica el modo elegido al crear', chosen['hardcore'] === 'true', chosen['hardcore'])
  check('el modo extremo fuerza Difícil', chosen['difficulty'] === 'hard', chosen['difficulty'])
  check('aplica las peleas entre jugadores', chosen['pvp'] === 'false', chosen['pvp'])
  check('guarda cómo se conectarán', manifest.exposure?.mode === 'router', manifest.exposure?.mode)

  let rejected = ''
  try {
    await service.create({
      game: 'minecraft',
      name: 'No debe existir',
      port: PORT + 1,
      agreements: ['minecraft-eula'],
      options: {
        distribution: DISTRIBUTION,
        minecraftVersion: version,
        memoryMb: 2048,
        properties: { 'server-port': '1' }
      }
    })
  } catch (err) {
    rejected = err instanceof Error ? err.message : String(err)
  }
  check('rechaza ajustes que no son del catálogo', rejected.includes('server-port'), rejected)
  check(
    'y no deja un servidor a medio crear',
    (await service.list()).every((i) => i.manifest.name !== 'No debe existir')
  )

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
  const applied = await service.minecraft.getProperties(manifest.id)
  check('el servidor acepta la clave hardcore', applied['hardcore'] === 'true', applied['hardcore'])
  check('y mantiene gamemode como supervivencia', applied['gamemode'] === 'survival')
  check('respeta las peleas desactivadas', applied['pvp'] === 'false', applied['pvp'])
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
  check('registra la versión', backup.version === version, backup.version)
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

  const initial = await service.minecraft.listWorlds(manifest.id)
  check('detecta el mundo inicial', initial.length === 1, initial.map((w) => w.name).join(', '))
  check('está marcado como activo', initial[0]?.active === true)
  check('sabe que está generado', initial[0]?.generated === true)
  check('calcula su tamaño', (initial[0]?.sizeBytes ?? 0) > 0,
    `${((initial[0]?.sizeBytes ?? 0) / 1024 / 1024).toFixed(1)} MB`)

  // Crear uno nuevo solo cambia level-name: lo genera el servidor al arrancar.
  const afterCreate = await service.minecraft.createWorld(manifest.id, {
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

  const propsAfterCreate = await service.minecraft.getProperties(manifest.id)
  check('escribe level-name', propsAfterCreate['level-name'] === 'segundo-mundo')
  check('aplica el tipo de mundo', propsAfterCreate['level-type'] === 'minecraft:flat')
  check('limpia la semilla del mundo anterior', propsAfterCreate['level-seed'] === '')

  check(
    'no deja crear dos mundos con el mismo nombre',
    await rejects(() => service.minecraft.createWorld(manifest.id, { name: 'world' }))
  )

  // El servidor debe generar de verdad el mundo nuevo al arrancar.
  ready = false
  await service.start(manifest.id)
  await waitFor(() => ready, 5 * 60_000, 'que se genere el segundo mundo')
  await service.stop(manifest.id)

  const generated = await service.minecraft.listWorlds(manifest.id)
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
    await rejects(() => service.minecraft.deleteWorld(manifest.id, 'segundo-mundo'))
  )

  await service.minecraft.activateWorld(manifest.id, 'world')
  const reactivated = await service.minecraft.listWorlds(manifest.id)
  check('vuelve al mundo original', reactivated.find((w) => w.name === 'world')?.active === true)

  const afterDelete = await service.minecraft.deleteWorld(manifest.id, 'segundo-mundo')
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

  // --- Plugins y mods (§4.8) ------------------------------------------------

  console.log('\n== Plugins y mods')

  const content0 = await service.minecraft.listContent(manifest.id)
  const expectedKind = DISTRIBUTION === 'paper' ? 'plugins' : DISTRIBUTION === 'vanilla' ? null : 'mods'
  check('detecta el tipo de contenido', content0.kind === expectedKind, String(content0.kind))

  if (expectedKind !== null) {
    // La carpeta debe crearse aunque el servidor no la haya generado aún: si
    // no, el botón "abrir carpeta" no llevaría a ninguna parte.
    const folder = await service.minecraft.contentFolder(manifest.id)
    check('la carpeta existe tras pedirla', folder !== null && (await exists(folder)), folder ?? '')

    // Se simula que el usuario pega un .jar en la carpeta.
    const fake = join(folder!, 'plugin-de-prueba.jar')
    await writeFile(fake, 'no es un jar de verdad, solo para la prueba', 'utf8')

    const listed = await service.minecraft.listContent(manifest.id)
    const item = listed.items.find((i) => i.fileName === 'plugin-de-prueba.jar')
    check('aparece el fichero pegado', item !== undefined, `${listed.items.length} elementos`)
    check('se marca como activo', item?.enabled === true)

    // Desactivar renombra a .jar.disabled: el servidor deja de cargarlo pero
    // el fichero no se pierde, que es la salida cuando un mod rompe el arranque.
    const afterOff = await service.minecraft.setContentEnabled(manifest.id, 'plugin-de-prueba.jar', false)
    const off = afterOff.items[0]
    check('desactivar lo renombra', off?.fileName === 'plugin-de-prueba.jar.disabled', off?.fileName)
    check('y queda marcado como inactivo', off?.enabled === false)
    check('el .jar original ya no existe', !(await exists(fake)))

    const afterOn = await service.minecraft.setContentEnabled(
      manifest.id,
      'plugin-de-prueba.jar.disabled',
      true
    )
    check('reactivar lo devuelve a .jar', afterOn.items[0]?.fileName === 'plugin-de-prueba.jar')

    // No debe poder salirse de su carpeta.
    check(
      'rechaza nombres con ruta',
      await rejects(() => service.minecraft.removeContent(manifest.id, '../../server.properties'))
    )
    check(
      'server.properties sigue intacto',
      await exists(join(dir, 'server.properties'))
    )

    const afterRemove = await service.minecraft.removeContent(manifest.id, 'plugin-de-prueba.jar')
    check('borrar lo elimina', afterRemove.items.length === 0)
  }

  // --- Plugins oficiales (§4.8) ---------------------------------------------

  if (DISTRIBUTION === 'paper') {
    console.log('\n== Plugins oficiales')

    const before = await service.minecraft.listOfficialPlugins(manifest.id)
    check('hay catálogo para Paper', before.length > 0, `${before.length}`)
    check('todavía no está instalado', before[0]?.installed === false)

    // Se comprueba el punto de partida: si ya estuviera en true, el "true" de
    // después no probaría nada.
    const antes = await service.minecraft.getProperties(manifest.id)
    check(
      'de fábrica no acepta transferencias',
      antes['accepts-transfers'] === 'false',
      antes['accepts-transfers']
    )

    // Instalar con el papel de "partida" tiene que activar el modo extremo:
    // la interfaz lo promete en el aviso y aquí se comprueba que se cumple.
    const after = await service.minecraft.installOfficialPlugin(manifest.id, 'hardcore-utility', 'game')
    const hu = after.find((p) => p.id === 'hardcore-utility')
    check('queda instalado y activo', hu?.installed === true && hu?.enabled === true)
    check('con su configuración ya creada', hu?.hasConfig === true)
    check('y con el papel elegido', hu?.role === 'game', hu?.role ?? '')

    const jarPath = join(dir, 'plugins', 'HardcoreUtility-0.1.0.jar')
    check('el jar está en plugins/', await exists(jarPath))

    const props = await service.minecraft.getProperties(manifest.id)
    check('activa el modo extremo', props['hardcore'] === 'true', props['hardcore'])
    check('y pone la dificultad en difícil', props['difficulty'] === 'hard', props['difficulty'])
    check(
      'y acepta transferencias desde el lobby',
      props['accepts-transfers'] === 'true',
      props['accepts-transfers']
    )

    // Configurar desde la app, sin abrir el YAML.
    const saved = await service.minecraft.setOfficialPluginConfig(manifest.id, 'hardcore-utility', {
      'api-token': 'clave-de-prueba',
      'game.lobby-port': 25565,
      'game.pregeneration.enabled': false
    })
    const savedHu = saved.find((p) => p.id === 'hardcore-utility')
    check('guarda una cadena', savedHu?.config['api-token'] === 'clave-de-prueba')
    check('guarda un número', savedHu?.config['game.lobby-port'] === '25565')
    check('guarda un booleano', savedHu?.config['game.pregeneration.enabled'] === 'false')

    const configPath = join(dir, 'plugins', 'HardcoreUtility', 'config.yml')
    const rawConfig = await readFile(configPath, 'utf8')
    check('conserva los comentarios del plugin', rawConfig.includes('Clave compartida'))

    // Las direcciones locales (el problema del NAT: desde casa no se entra por
    // la IP pública) son opciones nuevas del plugin.
    const conLocal = await service.minecraft.setOfficialPluginConfig(manifest.id, 'hardcore-utility', {
      'game.lobby-local-host': '192.168.1.50',
      'game.lobby-local-port': 25565
    })
    const localHu = conLocal.find((p) => p.id === 'hardcore-utility')
    check('guarda la dirección local del lobby', localHu?.config['game.lobby-local-host'] === '192.168.1.50')
    check('y su puerto', localHu?.config['game.lobby-local-port'] === '25565')

    // El caso de quien ya tenía el plugin de antes: se le pone una
    // configuración sin las opciones nuevas y se comprueba que "Actualizar" se
    // las añade sin tocar lo que él tenía puesto.
    const antigua = (await readFile(configPath, 'utf8'))
      .split(/\r?\n/)
      .filter((line) => !line.includes('-local-host') && !line.includes('-local-port'))
      .join('\r\n')
    await writeFile(configPath, antigua, 'utf8')

    const sinOpciones = await service.minecraft.listOfficialPlugins(manifest.id)
    check(
      'una configuración antigua no tiene las opciones nuevas',
      sinOpciones.find((p) => p.id === 'hardcore-utility')?.config['game.lobby-local-host'] ===
        undefined
    )

    // El fallo que se coló: guardar sobre una configuración antigua no daba
    // error y tampoco escribía nada, así que el campo se vaciaba al recargar.
    const rescatado = await service.minecraft.setOfficialPluginConfig(manifest.id, 'hardcore-utility', {
      'game.lobby-local-host': '10.0.0.7'
    })
    const rescatadoHu = rescatado.find((p) => p.id === 'hardcore-utility')
    check(
      'guardar sobre una configuración antigua funciona igual',
      rescatadoHu?.config['game.lobby-local-host'] === '10.0.0.7',
      rescatadoHu?.config['game.lobby-local-host']
    )
    check(
      'y no se pierde lo que ya había',
      rescatadoHu?.config['api-token'] === 'clave-de-prueba'
    )

    // Un jar distinto del que trae la app tiene que detectarse por contenido:
    // el plugin cambia sin cambiar de número de versión, así que la versión no
    // sirve para distinguirlos.
    check('con el jar de la app está al día', rescatadoHu?.upToDate === true)
    await writeFile(jarPath, 'no soy el jar de verdad', 'utf8')
    const desfasado = await service.minecraft.listOfficialPlugins(manifest.id)
    check(
      'detecta que el jar instalado es otro',
      desfasado.find((p) => p.id === 'hardcore-utility')?.upToDate === false
    )

    const actualizado = await service.minecraft.installOfficialPlugin(manifest.id, 'hardcore-utility', 'game')
    check(
      'actualizar devuelve el jar de la aplicación',
      actualizado.find((p) => p.id === 'hardcore-utility')?.upToDate === true
    )
    const actualizadoHu = actualizado.find((p) => p.id === 'hardcore-utility')
    check(
      'actualizar mantiene las opciones nuevas',
      actualizadoHu?.config['game.lobby-local-host'] === '10.0.0.7',
      actualizadoHu?.config['game.lobby-local-host']
    )
    check(
      'y conserva lo que el usuario tenía configurado',
      actualizadoHu?.config['api-token'] === 'clave-de-prueba',
      actualizadoHu?.config['api-token']
    )
    const trasActualizar = await readFile(configPath, 'utf8')
    check('con el comentario que las explica', trasActualizar.includes('casi ningun router'))
    check('y sin duplicar nada', trasActualizar.split('lobby-local-host:').length - 1 === 1)

    // Quitar conserva la configuración: rehacer la clave y las direcciones es
    // lo más molesto de montar esto.
    const removed = await service.minecraft.uninstallOfficialPlugin(manifest.id, 'hardcore-utility', false)
    const removedHu = removed.find((p) => p.id === 'hardcore-utility')
    check('se puede quitar', removedHu?.installed === false)
    check('el jar desaparece', !(await exists(jarPath)))
    check('pero su configuración se conserva', removedHu?.hasConfig === true)

    // El otro papel también recibe jugadores (la partida los devuelve al
    // acabar), así que también tiene que aceptar transferencias. Se vuelve al
    // punto de partida para que la comprobación signifique algo.
    await service.minecraft.setProperties(manifest.id, { 'accepts-transfers': 'false', hardcore: 'false' })
    await service.minecraft.installOfficialPlugin(manifest.id, 'hardcore-utility', 'lobby')
    const lobbyProps = await service.minecraft.getProperties(manifest.id)
    check(
      'el lobby también acepta transferencias',
      lobbyProps['accepts-transfers'] === 'true',
      lobbyProps['accepts-transfers']
    )
    check(
      'pero el lobby no se pone en modo extremo',
      lobbyProps['hardcore'] === 'false',
      lobbyProps['hardcore']
    )
  }

  // --- Cambio de versión -----------------------------------------------------

  // El caso que pide esto de verdad: el servidor ya existe y hay que llevarlo a
  // otra versión sin volver a crearlo, hacia delante o hacia atrás (§19.18).
  console.log('\n== Cambiar de versión')
  const disponibles = await service.listVersions(manifest.id)
  check('ofrece versiones a las que cambiar', disponibles.length > 1, `${disponibles.length}`)
  check('y marca la que tiene puesta', disponibles.find((v) => v.installed)?.id === version, version)

  // Se baja a una anterior, que es lo delicado: además del jar cambia el Java
  // que pide la versión, y equivocarlo deja el servidor sin arrancar.
  const anterior = disponibles.find((v) => v.relation === 'older' && !v.experimental)
  if (!anterior) {
    console.log('  (no hay ninguna versión anterior disponible: nada que probar)')
  } else {
    // Por nombre, no por cantidad: la retención va borrando las viejas, así que
    // contar no dice si se ha guardado una nueva.
    const copiasAntes = new Set((await service.listBackups(manifest.id)).map((b) => b.fileName))
    const t0 = Date.now()
    await service.changeVersion(manifest.id, anterior.id)
    const despues = minecraftOf((await service.get(manifest.id)).manifest).data

    check(
      `baja a la ${anterior.id}`,
      despues.minecraftVersion === anterior.id,
      `${((Date.now() - t0) / 1000).toFixed(0)} s`
    )
    check(
      'con el Java que pide esa versión',
      despues.javaMajor === (await catalog.javaMajorFor(anterior.id)),
      `Java ${despues.javaMajor}`
    )
    check('y con un build suyo, no el de antes', Boolean(despues.build), despues.build)
    // Forge y NeoForge no dejan server.jar: arrancan con el argfile que genera
    // su instalador, en una carpeta por versión.
    const argfile: Partial<Record<Distribution, string>> = {
      forge: join(dir, 'libraries', 'net', 'minecraftforge', 'forge', `${anterior.id}-${despues.build}`, 'win_args.txt'),
      neoforge: join(dir, 'libraries', 'net', 'neoforged', 'neoforge', `${despues.build}`, 'win_args.txt')
    }
    const launcher = argfile[DISTRIBUTION]
    if (launcher) {
      check('está el argfile de la versión nueva', await exists(launcher), despues.build)
    } else if (DISTRIBUTION === 'fabric') {
      check('el lanzador de Fabric sigue en su sitio', await exists(join(dir, 'fabric-server-launch.jar')))
    } else {
      check('el jar del servidor sigue en su sitio', await exists(join(dir, 'server.jar')))
    }

    // Bajar de versión puede costar el mundo, así que la copia previa no es un
    // detalle: es la única vuelta atrás que hay.
    const nuevas = (await service.listBackups(manifest.id)).filter(
      (b) => !copiasAntes.has(b.fileName)
    )
    check('guardó una copia antes de tocar nada', nuevas.length === 1, nuevas[0]?.fileName)
    check(
      'y la copia lleva la versión de la que se venía',
      nuevas[0]?.version === version,
      `${nuevas[0]?.version}`
    )

    // Y arranca de verdad: es lo único que prueba que el Java y el jar se
    // corresponden.
    ready = false
    await service.start(manifest.id)
    const arranca = await waitFor(() => ready, 5 * 60_000, 'el arranque con la versión nueva')
      .then(() => true)
      .catch(() => false)
    check('arranca con la versión nueva', arranca, arranca ? undefined : errors.at(-1))
    await service.stop(manifest.id)

    // Y se vuelve a la de antes, que es el otro sentido del viaje.
    await service.changeVersion(manifest.id, version)
    check(
      'y se puede volver a la de antes',
      minecraftOf((await service.get(manifest.id)).manifest).data.minecraftVersion === version,
      version
    )
  }

  // --- Borrado de la instancia ----------------------------------------------

  console.log('\n== Borrar el servidor')

  const instanceRoot = join(root, 'instances', manifest.id)
  check('la carpeta de la instancia existe antes', await exists(instanceRoot))

  await service.remove(manifest.id)

  check('la carpeta desaparece por completo', !(await exists(instanceRoot)))
  const remaining = await service.list()
  check(
    'ya no aparece en la lista',
    !remaining.some((i) => i.manifest.id === manifest.id),
    `${remaining.length} instancias`
  )
  check(
    'consultarla después falla limpiamente',
    await rejects(() => service.get(manifest.id))
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
