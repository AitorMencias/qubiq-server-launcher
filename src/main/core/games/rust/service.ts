import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { RustManifest } from '@shared/types'
import type { UpdateCheck } from '@shared/games'
import type { ModEntry, ModInstallResult, ModRef, ModsView } from '@shared/games/mods'
import {
  DEFAULT_WIPE_PLAN,
  MAX_PLAYERS,
  MAX_SEED,
  MAX_WORLD_SIZE,
  MIN_WORLD_SIZE,
  RUST_APP_ID,
  RUST_SETTINGS,
  consoleQuote,
  monthKey,
  nextForcedWipe,
  randomSeed,
  settingInfo,
  validSteamId,
  wipeMoment,
  type RustAdmin,
  type RustBan,
  type RustConfigChanges,
  type RustConfigView,
  type RustMapOnDisk,
  type RustMapView,
  type RustPlayer,
  type RustSettings,
  type RustWipeOptions,
  type RustWipePlan
} from '@shared/games/rust/types'
import type { GameHost } from '../minecraft/service'
import { dropStash, pathsSize, stashPaths, unstashPaths } from '../modFiles'
import { serverDir } from '../../paths'
import { appUpdate, DEFAULT_BRANCH, ensureSteamCmd, installedBuildId } from '../../tools/steamcmd'
import { WebRconSilenceError } from '../../net/webrcon'
import {
  readAdmins,
  readBansCfg,
  parseBans,
  writeAdmins,
  writeBansCfg
} from './config'
import { parsePlayerList, rustRcon } from './rcon'
import { currentMap, mapsOnDisk, wipeFiles, wipeTargets } from './wipe'
import * as mods from './mods'

/**
 * Operaciones exclusivas de Rust.
 *
 * Al revés que Enshrouded o Valheim, casi todo se puede hacer **con el servidor
 * en marcha**: la moderación va por su consola remota y surte efecto al
 * momento, y Oxide carga y descarga plugins en caliente. Lo que exige pararlo
 * es lo que toca los ficheros del juego: poner o quitar Oxide, y borrar el mapa.
 */

/** Lo que necesita este servicio del núcleo, además de lo de cualquier juego. */
export interface RustHost extends GameHost {
  emitProgress(id: string, phase: string, detail: string): void
  isRunning(id: string): boolean
  start(id: string): Promise<void>
  stop(id: string): Promise<void>
  install(id: string, options?: { skipBackup?: boolean }): Promise<void>
  checkForUpdate(id: string): Promise<UpdateCheck | null>
  listInstanceIds(): Promise<string[]>
  logSystem(id: string, text: string): void
}

export type { RustConfigChanges, RustConfigView, RustMapView, RustWipeOptions }

/** Cada cuánto mira el vigilante si toca el borrado programado. */
const WATCH_EVERY_MS = 10 * 60_000

export function createRustService(host: RustHost) {
  async function requireManifest(id: string): Promise<RustManifest> {
    const manifest = await host.readManifest(id)
    if (!manifest) throw new Error(`No existe la instancia ${id}.`)
    if (manifest.game !== 'rust') throw new Error('Esta operación solo existe para servidores de Rust.')
    return manifest
  }

  async function save(id: string, data: Partial<RustManifest['data']>): Promise<RustManifest> {
    const manifest = await requireManifest(id)
    return (await host.updateInstance(id, { data: { ...manifest.data, ...data } })) as RustManifest
  }

  function configView(manifest: RustManifest): RustConfigView {
    const settings: RustSettings = {}
    for (const info of RUST_SETTINGS) settings[info.key] = manifest.data.settings[info.key] ?? info.default
    return {
      description: manifest.data.description,
      maxPlayers: manifest.data.maxPlayers,
      rustPlus: manifest.data.rustPlus,
      settings
    }
  }

  async function mapView(manifest: RustManifest): Promise<RustMapView> {
    const now = new Date()
    const wipe = nextForcedWipe(now)
    const plan = { ...DEFAULT_WIPE_PLAN, ...manifest.data.wipe }
    const maps = await mapsOnDisk(manifest.id)
    return {
      worldSize: manifest.data.worldSize,
      seed: manifest.data.seed,
      plan,
      nextForcedWipe: wipe.toISOString(),
      moment: wipeMoment(now, wipe),
      doneThisMonth: plan.doneMonth === monthKey(wipe),
      dismissed: plan.dismissed === monthKey(wipe),
      lastWipeAt: manifest.data.lastWipeAt ?? null,
      current: currentMap(maps, manifest.data.worldSize, manifest.data.seed) ?? null,
      maps
    }
  }

  /** Quién está dentro, con su SteamID, preguntándoselo al servidor. */
  async function players(manifest: RustManifest): Promise<RustPlayer[]> {
    return parsePlayerList(await rustRcon(manifest, 'playerlist'))
  }

  /** El SteamID de quien sale en la lista con ese nombre. */
  async function steamIdOf(manifest: RustManifest, player: string): Promise<{ steamId: string; name: string }> {
    if (validSteamId(player)) return { steamId: player, name: player }
    const found = (await players(manifest)).find((p) => p.name === player)
    if (!found) throw new Error(`«${player}» ya no está en el servidor.`)
    return found
  }

  /**
   * Una orden de moderación por la consola, y los ficheros al día después.
   *
   * `server.writecfg` es lo que vuelca administradores y vetados a `users.cfg`
   * y `bans.cfg` (grabado: contesta «Config Saved»). Sin él, un veto puesto en
   * caliente se perdería si el servidor se cae antes de su próximo guardado.
   */
  async function moderate(manifest: RustManifest, command: string): Promise<string> {
    const answer = await rustRcon(manifest, command)
    await rustRcon(manifest, 'server.writecfg').catch(() => undefined)
    return answer
  }

  // --- Oxide y plugins ----------------------------------------------------------

  function pluginsOf(manifest: RustManifest): ModRef[] {
    return manifest.data.plugins ?? []
  }

  async function pluginsView(manifest: RustManifest): Promise<ModsView> {
    const id = manifest.id
    const oxide = manifest.data.oxide
    const onDisk = await mods.oxideInstalled(id)

    const entries: ModEntry[] = []
    for (const ref of pluginsOf(manifest)) {
      const sizeBytes = await pathsSize(id, ref.id, ref.paths, ref.enabled)
      const problem =
        ref.enabled && sizeBytes === 0
          ? 'No está en la carpeta de plugins. ¿Se ha borrado a mano?'
          : undefined
      entries.push({ ...ref, sizeBytes, ...(problem ? { problem } : {}) })
    }

    for (const name of await mods.strayPlugins(id, pluginsOf(manifest).map((p) => p.id))) {
      entries.push({
        id: name,
        name,
        // La que dice su propia cabecera, si la tiene.
        version: (await mods.installedPluginVersion(id, name)) ?? 'desconocida',
        enabled: true,
        dependency: false,
        paths: [mods.pluginPath(name)],
        addedAt: '',
        sizeBytes: await mods.fileSize(join(serverDir(id), ...mods.pluginPath(name).split('/'))),
        problem:
          'Lo has puesto tú en la carpeta, no desde uMod. Oxide lo carga igual y se puede apagar o ' +
          'quitar desde aquí, pero la app no sabe de dónde viene y no puede avisar de versiones nuevas.'
      })
    }

    return {
      loader: {
        name: mods.LOADER_NAME,
        installed: onDisk && oxide !== undefined && !oxide.pending,
        version: oxide?.version ?? null,
        ...(oxide?.pending
          ? {
              problem:
                'La última actualización de Rust ha quitado Oxide y todavía no ha salido la versión ' +
                'para este mes. Mientras tanto el servidor funciona, pero sin plugins. Vuelve a mirar ' +
                'en unas horas: en cuanto salga, se pone de un botón.'
            }
          : {})
      },
      mods: entries
    }
  }

  async function putOxide(id: string, onProgress?: (detail: string) => void): Promise<void> {
    const manifest = await requireManifest(id)
    host.assertStopped(id, 'poner Oxide')
    if ((manifest.data.branch ?? DEFAULT_BRANCH) !== DEFAULT_BRANCH) {
      throw new Error('Oxide solo se instala sobre la versión de siempre de Rust, no sobre ramas de prueba.')
    }
    onProgress?.('Buscando la Oxide de esta versión de Rust')
    const release = await mods.latestOxide()
    const fits = mods.oxideFits(
      release,
      await installedBuildId(serverDir(id), RUST_APP_ID),
      await mods.publicBranch().catch(() => null)
    )
    if (!fits.ok) throw new Error(fits.reason)

    const added = await mods.installOxide(id, release, onProgress)
    const previous = manifest.data.oxide?.added ?? []
    await save(id, {
      oxide: {
        version: release.version,
        added: [...new Set([...previous, ...added])],
        ...(manifest.data.buildId ? { buildId: manifest.data.buildId } : {})
      }
    })
  }

  /**
   * Instala un plugin y lo que pida con `// Requires:`. Devuelve los nombres de
   * lo que entró de paso, para poder decirlo.
   */
  async function addPluginTree(
    id: string,
    name: string,
    dependency: boolean,
    seen: Set<string>,
    added: string[],
    onProgress?: (detail: string) => void
  ): Promise<void> {
    if (seen.has(name.toLowerCase())) return
    seen.add(name.toLowerCase())

    const manifest = await requireManifest(id)
    if (pluginsOf(manifest).some((p) => p.id.toLowerCase() === name.toLowerCase())) return

    onProgress?.(`Descargando ${name} de uMod`)
    const plugin = await mods.downloadPlugin(id, name)
    const ref: ModRef = {
      id: plugin.name,
      name: plugin.title,
      version: plugin.version,
      enabled: true,
      dependency,
      paths: [mods.pluginPath(plugin.name)],
      addedAt: new Date().toISOString()
    }
    const actual = await requireManifest(id)
    await save(id, { plugins: [...pluginsOf(actual), ref] })
    if (dependency) added.push(plugin.title)

    for (const required of plugin.requires) {
      await addPluginTree(id, required, true, seen, added, onProgress)
    }
  }

  /**
   * Un plugin que alguien dejó a mano en `oxide/plugins`, visto como si lo
   * hubiera puesto la app, para poder apagarlo o quitarlo igual.
   */
  async function strayRef(id: string, name: string): Promise<ModRef | undefined> {
    const manifest = await requireManifest(id)
    const sueltos = await mods.strayPlugins(id, pluginsOf(manifest).map((p) => p.id))
    if (!sueltos.includes(name)) return undefined
    return {
      id: name,
      name,
      version: (await mods.installedPluginVersion(id, name)) ?? 'puesto a mano',
      enabled: true,
      dependency: false,
      paths: [mods.pluginPath(name)],
      addedAt: new Date().toISOString()
    }
  }

  // --- El borrado --------------------------------------------------------------

  const wiping = new Set<string>()

  async function wipe(id: string, options: RustWipeOptions): Promise<RustMapView> {
    if (wiping.has(id)) throw new Error('Ya hay un borrado en marcha en este servidor.')
    wiping.add(id)
    const progress = (detail: string): void => host.emitProgress(id, 'wipe', detail)
    try {
      let manifest = await requireManifest(id)
      const plan = { ...DEFAULT_WIPE_PLAN, ...manifest.data.wipe }
      const blueprints = options.blueprints ?? plan.blueprints
      const newSeed = options.newSeed ?? plan.newSeed

      if (options.worldSize !== undefined) {
        if (options.worldSize < MIN_WORLD_SIZE || options.worldSize > MAX_WORLD_SIZE) {
          throw new Error(`El tamaño del mapa tiene que estar entre ${MIN_WORLD_SIZE} y ${MAX_WORLD_SIZE} metros.`)
        }
      }
      if (options.seed !== undefined && (!Number.isInteger(options.seed) || options.seed < 1 || options.seed > MAX_SEED)) {
        throw new Error(`La semilla tiene que ser un número entre 1 y ${MAX_SEED}.`)
      }

      const wasRunning = host.isRunning(id)
      if (wasRunning) {
        // Quien esté jugando se entera antes de que se le corte.
        await rustRcon(manifest, `global.say ${consoleQuote('El servidor se reinicia ahora para empezar un mapa nuevo.')}`).catch(
          () => undefined
        )
        progress('Parando el servidor')
        host.logSystem(id, 'Borrado del mapa: parando el servidor.')
        await host.stop(id)
      }

      // La copia es lo primero: un borrado no tiene vuelta atrás (§12).
      progress('Guardando una copia del mapa actual')
      await host.createBackup(id, 'Copia previa al borrado del mapa', true).catch(() => undefined)

      if (options.update) {
        progress('Mirando si hay versión nueva de Rust')
        const check = await host.checkForUpdate(id).catch(() => null)
        if (check?.available) {
          progress('Actualizando Rust')
          host.logSystem(id, 'Borrado del mapa: actualizando Rust.')
          await host.install(id, { skipBackup: true })
        }
      }

      progress('Borrando el mapa')
      const borrados = await wipeFiles(id, blueprints)
      host.logSystem(
        id,
        `Borrado del mapa hecho (${borrados.length} ficheros${blueprints ? ', planos incluidos' : ''}).`
      )

      manifest = await requireManifest(id)
      const forced = nextForcedWipe(new Date())
      const esteMes = Date.now() >= forced.getTime()
      await save(id, {
        seed: options.seed ?? (newSeed ? randomSeed() : manifest.data.seed),
        ...(options.worldSize !== undefined ? { worldSize: Math.round(options.worldSize) } : {}),
        lastWipeAt: new Date().toISOString(),
        wipe: {
          ...plan,
          // Hecho después de la hora del parche, cuenta como el de este mes.
          ...(esteMes ? { doneMonth: monthKey(forced) } : {})
        }
      })

      if (wasRunning) {
        progress('Arrancando con el mapa nuevo')
        await host.start(id)
      }
      return mapView(await requireManifest(id))
    } finally {
      wiping.delete(id)
    }
  }

  /**
   * Lo que hace el vigilante cada diez minutos: si un servidor tiene el
   * borrado programado, ya es la hora del parche y Facepunch lo ha publicado,
   * actualiza y borra. Si el parche aún no está, vuelve a mirar más tarde.
   */
  async function watchTick(): Promise<void> {
    const now = new Date()
    const forced = nextForcedWipe(now)
    if (now.getTime() < forced.getTime()) return

    for (const id of await host.listInstanceIds().catch((): string[] => [])) {
      const manifest = await host.readManifest(id).catch(() => null)
      if (!manifest || manifest.game !== 'rust') continue
      const plan = { ...DEFAULT_WIPE_PLAN, ...manifest.data.wipe }
      if (!plan.auto || plan.doneMonth === monthKey(forced) || wiping.has(id)) continue

      const check = await host.checkForUpdate(id).catch(() => null)
      if (!check?.available) continue

      host.logSystem(id, 'Ha salido el parche del mes: empieza el borrado programado.')
      await wipe(id, { update: true }).catch((err: unknown) => {
        host.logSystem(
          id,
          `El borrado programado ha fallado: ${err instanceof Error ? err.message : String(err)}`
        )
      })
    }
  }

  let watcher: NodeJS.Timeout | null = null

  return {
    // --- Configuración --------------------------------------------------------

    async getConfig(id: string): Promise<RustConfigView> {
      return configView(await requireManifest(id))
    },

    /**
     * Guarda los ajustes. Se puede con el servidor en marcha: van en la línea
     * de órdenes, así que valen desde el siguiente arranque y nada que escriba
     * el servidor mientras tanto los pisa.
     */
    async setConfig(id: string, changes: RustConfigChanges): Promise<RustConfigView> {
      const manifest = await requireManifest(id)
      const settings = { ...manifest.data.settings }
      for (const [key, value] of Object.entries(changes.settings ?? {})) {
        const info = settingInfo(key)
        if (!info) throw new Error(`Rust no tiene ningún ajuste que se llame «${key}».`)
        if (info.kind.type === 'number' || info.kind.type === 'minutes') {
          const n = Number(value)
          const min = info.kind.type === 'minutes' ? info.kind.min * 60 : info.kind.min
          const max = info.kind.type === 'minutes' ? info.kind.max * 60 : info.kind.max
          if (!Number.isFinite(n) || n < min || n > max) {
            throw new Error(`«${info.label}» tiene que estar entre ${info.kind.min} y ${info.kind.max}.`)
          }
          settings[key] = n
        } else if (info.kind.type === 'switch') {
          settings[key] = Boolean(value)
        } else {
          settings[key] = String(value).trim()
        }
        if (settings[key] === info.default) delete settings[key]
      }
      const maxPlayers =
        changes.maxPlayers === undefined
          ? manifest.data.maxPlayers
          : Math.min(Math.max(Math.round(changes.maxPlayers), 1), MAX_PLAYERS)

      const actualizado = (await host.updateInstance(id, {
        expectedPlayers: maxPlayers,
        data: {
          ...manifest.data,
          settings,
          maxPlayers,
          ...(changes.description !== undefined ? { description: changes.description.trim() } : {}),
          ...(changes.rustPlus !== undefined ? { rustPlus: changes.rustPlus } : {})
        }
      })) as RustManifest
      return configView(actualizado)
    },

    // --- El mapa y el borrado ------------------------------------------------

    async getMap(id: string): Promise<RustMapView> {
      return mapView(await requireManifest(id))
    },

    /** Qué borraría un borrado ahora mismo, para enseñarlo antes. */
    async wipePreview(id: string, blueprints: boolean): Promise<string[]> {
      await requireManifest(id)
      return wipeTargets(id, blueprints)
    },

    async setWipePlan(id: string, plan: Partial<RustWipePlan>): Promise<RustMapView> {
      const manifest = await requireManifest(id)
      const actual = { ...DEFAULT_WIPE_PLAN, ...manifest.data.wipe }
      const nuevo: RustWipePlan = {
        ...actual,
        ...(plan.auto !== undefined ? { auto: plan.auto } : {}),
        ...(plan.newSeed !== undefined ? { newSeed: plan.newSeed } : {}),
        ...(plan.blueprints !== undefined ? { blueprints: plan.blueprints } : {})
      }
      return mapView(await save(id, { wipe: nuevo }))
    },

    /** «Ahora no»: el aviso de este mes deja de salir. */
    async dismissWipeNotice(id: string): Promise<RustMapView> {
      const manifest = await requireManifest(id)
      const plan = { ...DEFAULT_WIPE_PLAN, ...manifest.data.wipe }
      return mapView(
        await save(id, { wipe: { ...plan, dismissed: monthKey(nextForcedWipe(new Date())) } })
      )
    },

    wipe,

    /** Arranca el vigilante del borrado programado. Una sola vez, al arrancar la app. */
    startWatcher(): void {
      if (watcher) return
      watcher = setInterval(() => void watchTick(), WATCH_EVERY_MS)
      watcher.unref?.()
      // Y una primera vez al poco de abrir la app: si estaba cerrada a la hora
      // del parche, que no haya que esperar diez minutos.
      setTimeout(() => void watchTick(), 60_000).unref?.()
    },

    stopWatcher(): void {
      if (watcher) clearInterval(watcher)
      watcher = null
    },

    /** Para las pruebas: una vuelta del vigilante, sin esperar al reloj. */
    watchTick,

    // --- Jugadores y moderación ----------------------------------------------

    async listPlayers(id: string): Promise<RustPlayer[]> {
      const manifest = await requireManifest(id)
      if (!host.isRunning(id)) return []
      return players(manifest)
    },

    async listAdmins(id: string): Promise<RustAdmin[]> {
      await requireManifest(id)
      return readAdmins(id)
    },

    async setAdmin(id: string, steamId: string, name: string, level: RustAdmin['level']): Promise<RustAdmin[]> {
      const manifest = await requireManifest(id)
      if (!validSteamId(steamId)) {
        throw new Error('Eso no es un identificador de Steam: son 17 cifras que empiezan por 7656.')
      }
      if (host.isRunning(id)) {
        await moderate(
          manifest,
          `${level === 'owner' ? 'ownerid' : 'moderatorid'} ${steamId} ${consoleQuote(name || steamId)} ${consoleQuote('QubiQ')}`
        )
      } else {
        const admins = (await readAdmins(id)).filter((a) => a.steamId !== steamId)
        admins.push({ steamId, name: name || steamId, level })
        await writeAdmins(id, admins)
      }
      host.journal(id, {
        kind: 'moderation',
        ...(level === 'owner' ? { action: 'admin' } : { action: 'role', role: level }),
        player: name || steamId
      })
      return readAdmins(id)
    },

    async removeAdmin(id: string, steamId: string): Promise<RustAdmin[]> {
      const manifest = await requireManifest(id)
      const admin = (await readAdmins(id)).find((a) => a.steamId === steamId)
      if (!admin) return readAdmins(id)
      if (host.isRunning(id)) {
        await moderate(manifest, `${admin.level === 'owner' ? 'removeowner' : 'removemoderator'} ${steamId}`)
      } else {
        await writeAdmins(
          id,
          (await readAdmins(id)).filter((a) => a.steamId !== steamId)
        )
      }
      host.journal(id, { kind: 'moderation', action: 'unadmin', player: admin.name || steamId })
      return readAdmins(id)
    },

    async listBans(id: string): Promise<RustBan[]> {
      const manifest = await requireManifest(id)
      if (host.isRunning(id)) {
        try {
          return parseBans(await rustRcon(manifest, 'banlistex'))
        } catch (err) {
          // Con la lista vacía el servidor contesta con un mensaje vacío, que es
          // una respuesta; el silencio es que aún no atiende (generando el mapa).
          if (!(err instanceof WebRconSilenceError)) throw err
        }
      }
      return readBansCfg(id)
    },

    async ban(id: string, player: string, reason: string): Promise<RustBan[]> {
      const manifest = await requireManifest(id)
      const motivo = reason.trim() || 'Vetado desde QubiQ'
      let apuntado = player
      if (host.isRunning(id)) {
        const { steamId, name } = await steamIdOf(manifest, player)
        apuntado = name || steamId
        await moderate(manifest, `banid ${steamId} ${consoleQuote(name)} ${consoleQuote(motivo)}`)
        // Y fuera, si está dentro. Si no está, contesta «Player not found».
        await rustRcon(manifest, `kick ${steamId} ${consoleQuote(motivo)}`).catch(() => undefined)
      } else {
        if (!validSteamId(player)) {
          throw new Error('Con el servidor parado se veta por identificador de Steam: 17 cifras que empiezan por 7656.')
        }
        const bans = (await readBansCfg(id)).filter((b) => b.steamId !== player)
        bans.push({ steamId: player, name: player, reason: motivo })
        await writeBansCfg(id, bans)
        apuntado = player
      }
      host.journal(id, { kind: 'moderation', action: 'ban', player: apuntado, reason: motivo })
      return this.listBans(id)
    },

    async unban(id: string, steamId: string): Promise<RustBan[]> {
      const manifest = await requireManifest(id)
      if (host.isRunning(id)) {
        await moderate(manifest, `unban ${steamId}`)
      } else {
        await writeBansCfg(
          id,
          (await readBansCfg(id)).filter((b) => b.steamId !== steamId)
        )
      }
      host.journal(id, { kind: 'moderation', action: 'unban', player: steamId })
      return this.listBans(id)
    },

    async kick(id: string, player: string, reason = ''): Promise<void> {
      const manifest = await requireManifest(id)
      if (!host.isRunning(id)) throw new Error('Para echar a alguien el servidor tiene que estar en marcha.')
      const { steamId, name } = await steamIdOf(manifest, player)
      const answer = await rustRcon(manifest, `kick ${steamId} ${consoleQuote(reason.trim() || 'Expulsado')}`)
      if (/Player not found/i.test(answer)) throw new Error('Ya no está en el servidor.')
      host.journal(id, {
        kind: 'moderation',
        action: 'kick',
        player: name || steamId,
        ...(reason.trim() ? { reason: reason.trim() } : {})
      })
    },

    /** «Hacer administrador» desde la lista de quien está dentro. */
    async makeAdmin(id: string, player: string): Promise<RustAdmin[]> {
      const manifest = await requireManifest(id)
      const { steamId, name } = await steamIdOf(manifest, player)
      return this.setAdmin(id, steamId, name, 'owner')
    },

    // --- Oxide y plugins -------------------------------------------------------

    async listPlugins(id: string): Promise<ModsView> {
      return pluginsView(await requireManifest(id))
    },

    searchPlugins(_id: string, text: string) {
      return mods.searchPlugins(text)
    },

    async installOxide(id: string, onProgress?: (detail: string) => void): Promise<ModsView> {
      await putOxide(id, onProgress)
      return pluginsView(await requireManifest(id))
    },

    /**
     * Quita Oxide y deja el servidor como vino de Steam: se borra lo que añadió
     * y SteamCMD devuelve los DLL que sustituyó (medido: 14 s).
     */
    async removeOxide(id: string, onProgress?: (detail: string) => void): Promise<ModsView> {
      const manifest = await requireManifest(id)
      host.assertStopped(id, 'quitar Oxide')
      if (pluginsOf(manifest).length > 0) {
        throw new Error('Quita antes los plugins: sin Oxide no se cargaría ninguno.')
      }
      onProgress?.('Borrando los ficheros de Oxide')
      await mods.removeOxideFiles(id, manifest.data.oxide?.added ?? [])
      onProgress?.('Devolviendo los ficheros originales del juego')
      await ensureSteamCmd()
      await appUpdate({
        appId: RUST_APP_ID,
        installDir: serverDir(id),
        branch: manifest.data.branch ?? DEFAULT_BRANCH,
        validate: true
      })
      await dropStash(id, mods.LOADER_ID)
      return pluginsView(await save(id, { oxide: undefined }))
    },

    /**
     * Instala un plugin de uMod, y Oxide antes si no estaba.
     *
     * Con Oxide ya puesto se puede con el servidor en marcha: Oxide lo compila
     * y lo carga en cuanto aparece el fichero. Poner Oxide sí exige pararlo.
     */
    async addPlugin(
      id: string,
      name: string,
      onProgress?: (detail: string) => void
    ): Promise<ModInstallResult> {
      const manifest = await requireManifest(id)
      if (!manifest.data.oxide || !(await mods.oxideInstalled(id))) {
        await putOxide(id, onProgress)
      } else if (manifest.data.oxide.pending) {
        throw new Error(
          'Oxide está esperando a su versión de este mes: hasta que salga no se cargaría ningún plugin.'
        )
      }
      const added: string[] = []
      await addPluginTree(id, name, false, new Set(), added, onProgress)
      return { view: await pluginsView(await requireManifest(id)), dependencies: added }
    },

    /** Quita un plugin. En caliente vale: Oxide lo descarga al desaparecer el fichero. */
    async removePlugin(id: string, name: string): Promise<ModsView> {
      const manifest = await requireManifest(id)
      const ref = pluginsOf(manifest).find((p) => p.id === name) ?? (await strayRef(id, name))
      if (!ref) throw new Error('Ese plugin no está en este servidor.')
      for (const path of ref.paths) {
        await rm(join(serverDir(id), ...path.split('/')), { force: true })
      }
      await dropStash(id, ref.id)
      return pluginsView(await save(id, { plugins: pluginsOf(manifest).filter((p) => p.id !== name) }))
    },

    /** Apagar es sacar el `.cs` de la carpeta: Oxide lo descarga al momento. */
    async setPluginEnabled(id: string, name: string, enabled: boolean): Promise<ModsView> {
      const manifest = await requireManifest(id)
      let plugins = pluginsOf(manifest)
      let ref = plugins.find((p) => p.id === name)
      if (!ref) {
        // Uno puesto a mano: apagarlo es la forma de que la app lo conozca, y
        // desde ahí se gobierna como los demás.
        ref = await strayRef(id, name)
        if (!ref) throw new Error('Ese plugin no está en este servidor.')
        plugins = [...plugins, ref]
      }
      if (enabled) await unstashPaths(id, ref.id, ref.paths)
      else await stashPaths(id, ref.id, ref.paths)
      return pluginsView(
        await save(id, {
          plugins: plugins.map((p) => (p.id === name ? { ...p, enabled } : p))
        })
      )
    },

    /**
     * Versiones nuevas: de cada plugin y de Oxide (con la clave del cargador).
     * No se actualiza nada solo: un plugin nuevo puede cambiar la partida.
     */
    async pluginUpdates(id: string): Promise<Record<string, string>> {
      const manifest = await requireManifest(id)
      const nuevas: Record<string, string> = {}
      for (const ref of pluginsOf(manifest)) {
        const info = await mods.pluginInfo(ref.id).catch(() => null)
        const ultima = info?.latest_release_version
        if (ultima && mods.compareVersions(ultima, ref.version) > 0) nuevas[ref.id] = ultima
      }
      const oxide = manifest.data.oxide
      if (oxide) {
        const release = await mods.latestOxide().catch(() => null)
        if (release && (oxide.pending || mods.compareVersions(release.version, oxide.version) > 0)) {
          const fits = mods.oxideFits(
            release,
            await installedBuildId(serverDir(id), RUST_APP_ID),
            await mods.publicBranch().catch(() => null)
          )
          if (fits.ok) nuevas[mods.LOADER_ID] = release.version
        }
      }
      return nuevas
    },

    async updatePlugin(id: string, name: string, onProgress?: (detail: string) => void): Promise<ModsView> {
      if (name === mods.LOADER_ID) {
        await putOxide(id, onProgress)
        return pluginsView(await requireManifest(id))
      }
      const manifest = await requireManifest(id)
      const ref = pluginsOf(manifest).find((p) => p.id === name)
      if (!ref) throw new Error('Ese plugin no está en este servidor.')
      await host.createBackup(id, `Copia previa a actualizar ${ref.name}`, true).catch(() => undefined)
      if (!ref.enabled) await unstashPaths(id, ref.id, ref.paths)
      const plugin = await mods.downloadPlugin(id, name)
      if (!ref.enabled) await stashPaths(id, ref.id, ref.paths)
      return pluginsView(
        await save(id, {
          plugins: pluginsOf(await requireManifest(id)).map((p) =>
            p.id === name ? { ...p, version: plugin.version, name: plugin.title } : p
          )
        })
      )
    },

    /** Lo que ocupa cada mapa, para el aviso de disco. */
    async mapSizes(id: string): Promise<RustMapOnDisk[]> {
      await requireManifest(id)
      return mapsOnDisk(id)
    }
  }
}
