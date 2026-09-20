import { readFile, writeFile } from 'node:fs/promises'
import type { ZomboidManifest } from '@shared/types'
import type { ConfigChange, EditableConfig } from '@shared/editableConfig'
import {
  MANAGED_INI_KEYS,
  ROLES,
  ZOMBOID_WORKSHOP_APP_ID,
  presetInfo,
  workshopIdFrom,
  type ZomboidAccount,
  type ZomboidBannedIp,
  type ZomboidModEntry,
  type ZomboidModRef,
  type ZomboidRole
} from '@shared/games/zomboid/types'
import type { GameHost } from '../minecraft/service'
import { parseEditable } from '../../formats/editable'
import {
  applyPreset,
  databasePathFor,
  iniPathFor,
  parsePlayers,
  rcon,
  sandboxPathFor
} from './adapter'
import {
  installWorkshopItem,
  installedEntries,
  removeWorkshopItem,
  workshopDetails
} from './mods'

/**
 * Operaciones exclusivas de Project Zomboid: ajustes, reglas de la partida y
 * moderación.
 *
 * Tres reglas que salen de cómo funciona el juego, comprobadas contra el
 * servidor real (ANALISIS.md §19.22):
 *
 * 1. **Los ajustes del `.ini` se cambian en caliente por RCON** (`changeoption`
 *    contesta «Option : MaxPlayers is now : 9» y el servidor lo guarda él
 *    mismo). Con el servidor parado se edita el fichero. Nunca las dos cosas:
 *    el servidor tiene los ajustes en memoria y los vuelca, así que escribir el
 *    fichero con él arrancado sería perder el cambio sin avisar.
 * 2. **Las reglas de la partida exigen el servidor parado.** El
 *    `SandboxVars.lua` se lee al cargar el mundo y no se vuelve a mirar.
 * 3. **Moderar exige el servidor arrancado.** No hay listas de texto como en
 *    Valheim ni ficheros JSON como en Factorio: las cuentas viven en una base
 *    de datos SQLite que el servidor tiene abierta, y la única vía honesta de
 *    tocarla es pedírselo a él. Leerla sí se puede siempre, así que la pantalla
 *    enseña quién es quién aunque esté parado y explica por qué no deja cambiarlo.
 */

/**
 * Las claves del `.ini` que gestiona la app desde el manifiesto y el asistente.
 * Se enseñan, pero no se editan aquí: se reescriben en cada arranque y el
 * cambio se perdería.
 */
const MANAGED = new Set<string>(MANAGED_INI_KEYS)

/** Claves cuyo valor no se enseña nunca. */
const SECRET = new Set(['RCONPassword'])

export function createZomboidService(host: GameHost) {
  async function requireManifest(id: string): Promise<ZomboidManifest> {
    const manifest = await host.readManifest(id)
    if (!manifest) throw new Error(`No existe la instancia ${id}.`)
    if (manifest.game !== 'zomboid') {
      throw new Error('Esta operación solo existe para servidores de Project Zomboid.')
    }
    return manifest
  }

  /** ¿Contesta el servidor a la consola remota? Es la señal de que está vivo. */
  async function isLive(manifest: ZomboidManifest): Promise<boolean> {
    try {
      await rcon(manifest, 'players')
      return true
    } catch {
      return false
    }
  }

  /**
   * Lee la base de datos de cuentas del servidor.
   *
   * Se abre en solo lectura a propósito: el servidor la tiene abierta mientras
   * está en marcha y escribir por detrás sería pelearse con él. Si no se puede
   * leer, se devuelve null y quien llame lo dice en vez de enseñar una lista
   * vacía que parecería «no hay nadie».
   */
  async function readDatabase<T>(id: string, query: (db: Database) => T): Promise<T | null> {
    try {
      const { DatabaseSync } = await import('node:sqlite')
      const db = new DatabaseSync(databasePathFor(id), { readOnly: true })
      try {
        return query(db as unknown as Database)
      } finally {
        db.close()
      }
    } catch {
      return null
    }
  }

  return {
    // --- Ajustes del servidor (`servertest.ini`) --------------------------------

    /**
     * Los ajustes tal como están en el fichero, con su explicación.
     *
     * Las explicaciones las escribe el propio servidor, en el idioma con el que
     * se arrancó: no hay que traducir nada ni mantener un catálogo al día.
     */
    async getSettings(id: string): Promise<EditableConfig> {
      await requireManifest(id)
      const raw = await readFile(iniPathFor(id), 'utf8').catch(() => null)
      if (raw === null) {
        throw new Error(
          'El servidor todavía no ha escrito su configuración. Arráncalo una vez y vuelve aquí.'
        )
      }

      const config = parseEditable('properties', raw).config
      for (const option of config.options) {
        const key = option.path[0]!
        if (SECRET.has(key)) {
          option.value = '(oculta)'
          option.editable = false
          option.readOnlyReason = 'es la contraseña de la consola remota, que gestiona la app'
          continue
        }
        if (MANAGED.has(key)) {
          option.editable = false
          option.readOnlyReason = 'lo lleva la app y lo reescribe en cada arranque'
        }
      }
      return config
    },

    /**
     * Cambia ajustes del servidor.
     *
     * Con el servidor en marcha va por su consola remota, que es lo que el
     * propio juego ofrece (`changeoption`) y tiene efecto al momento. Con el
     * servidor parado se edita el fichero, respetando sus comentarios.
     */
    async setSettings(id: string, changes: ConfigChange[]): Promise<EditableConfig> {
      const manifest = await requireManifest(id)
      if (changes.length === 0) return this.getSettings(id)

      for (const change of changes) {
        const key = change.path[0]!
        if (MANAGED.has(key) || SECRET.has(key)) {
          throw new Error(
            `«${key}» lo lleva la app: cámbialo en Configuración, no aquí, o se perderá en el ` +
              'siguiente arranque.'
          )
        }
      }

      if (await isLive(manifest)) {
        for (const change of changes) {
          const key = change.path[0]!
          const answer = await rcon(manifest, `changeoption ${key} ${String(change.value)}`)
          // El servidor contesta «Option : X is now : Y» cuando lo acepta, y
          // dice lo que pasa cuando no.
          if (!/is now/i.test(answer)) {
            throw new Error(`El servidor no ha aceptado «${key}»: ${answer.trim() || 'sin respuesta'}`)
          }
        }
        return this.getSettings(id)
      }

      const path = iniPathFor(id)
      const doc = parseEditable('properties', await readFile(path, 'utf8'))
      doc.apply(changes)
      await writeFile(path, doc.serialize(), 'utf8')
      return this.getSettings(id)
    },

    // --- Reglas de la partida (`servertest_SandboxVars.lua`) --------------------

    /**
     * Las reglas de la partida: más de 300 opciones, cada una con el texto que
     * el juego escribe encima y, las de lista, con sus valores nombrados.
     */
    async getSandbox(id: string): Promise<EditableConfig> {
      await requireManifest(id)
      const raw = await readFile(sandboxPathFor(id), 'utf8').catch(() => null)
      if (raw === null) {
        throw new Error(
          'El servidor todavía no ha escrito las reglas de la partida. Arráncalo una vez y vuelve aquí.'
        )
      }
      const config = parseEditable('lua', raw).config
      // La versión del formato la pone el juego: tocarla es pedir problemas.
      for (const option of config.options) {
        if (option.path.length === 1 && /^VERSION$/i.test(option.path[0]!)) {
          option.editable = false
          option.readOnlyReason = 'es la versión del formato, la pone el juego'
        }
      }
      return config
    },

    async setSandbox(id: string, changes: ConfigChange[]): Promise<EditableConfig> {
      await requireManifest(id)
      host.assertStopped(id, 'cambiar las reglas de la partida')
      if (changes.length === 0) return this.getSandbox(id)

      const path = sandboxPathFor(id)
      const doc = parseEditable('lua', await readFile(path, 'utf8'))
      doc.apply(changes)
      await writeFile(path, doc.serialize(), 'utf8')
      return this.getSandbox(id)
    },

    /**
     * Vuelve a poner las reglas de un preajuste de dificultad del juego.
     *
     * Es destructivo: pisa las reglas que hubiera. Se hace una copia antes,
     * como en todo lo que no tiene vuelta atrás (§12).
     */
    async applyPreset(id: string): Promise<EditableConfig> {
      const manifest = await requireManifest(id)
      host.assertStopped(id, 'cambiar la dificultad')
      const preset = presetInfo(manifest.data.preset)
      await host.createBackup(id, `Antes de poner la dificultad ${preset.name}`, true)
      // Con lo que se eligió al crear el servidor encima, igual que entonces:
      // volver al preajuste no debería deshacer lo que el usuario pidió aparte.
      await applyPreset(id, preset.file ?? '', manifest.data.sandbox)
      return this.getSandbox(id)
    },

    // --- Moderación --------------------------------------------------------------

    /**
     * Las cuentas del servidor, con su nivel de acceso y quién está dentro.
     *
     * Las cuentas salen de la base de datos (se puede leer esté como esté el
     * servidor) y quién está conectado, de la consola remota.
     */
    async listAccounts(id: string): Promise<ZomboidAccount[]> {
      const manifest = await requireManifest(id)

      const rows = await readDatabase(id, (db) =>
        db
          .prepare(
            'select w.username as username, r.name as role, w.lastConnection as lastConnection ' +
              'from whitelist w left join role r on r.id = w.role order by w.username'
          )
          .all()
      )
      if (rows === null) return []

      let online: string[] = []
      try {
        online = parsePlayers(await rcon(manifest, 'players')).players ?? []
      } catch {
        // Parado: no hay nadie dentro que contar.
      }
      const dentro = new Set(online.map((n) => n.toLowerCase()))

      return rows.map((row) => ({
        username: String(row.username ?? ''),
        role: normalizeRole(row.role),
        lastConnection: row.lastConnection ? String(row.lastConnection) : null,
        online: dentro.has(String(row.username ?? '').toLowerCase())
      }))
    },

    /** Las direcciones vetadas, que van por su cuenta en la base de datos. */
    async listBannedIps(id: string): Promise<ZomboidBannedIp[]> {
      await requireManifest(id)
      const rows = await readDatabase(id, (db) =>
        db.prepare('select ip, username, reason from bannedip').all()
      )
      return (rows ?? []).map((row) => ({
        ip: String(row.ip ?? ''),
        username: row.username ? String(row.username) : null,
        reason: row.reason ? String(row.reason) : null
      }))
    },

    /**
     * Cambia el nivel de acceso de una cuenta.
     *
     * Vetar no es un nivel más: el juego tiene su propia orden (`banuser`), que
     * además echa a quien esté dentro. Lo contrario es `unbanuser`, que
     * devuelve la cuenta a jugador normal.
     */
    async setRole(
      id: string,
      username: string,
      role: ZomboidRole,
      reason?: string
    ): Promise<ZomboidAccount[]> {
      const manifest = await requireManifest(id)
      const user = plainName(username)
      await requireLive(manifest)

      if (role === 'banned') {
        const motivo = oneWord(reason)
        checkAnswer(await rcon(manifest, `banuser ${user}${motivo ? ` -r ${motivo}` : ''}`), 'vetar')
      } else {
        // Quien estuviera vetado tiene que dejar de estarlo antes de que un
        // nivel nuevo signifique algo. Si no lo estaba, el servidor contesta
        // «This user can't be banned», que aquí no es un problema.
        await rcon(manifest, `unbanuser ${user}`).catch(() => undefined)
        checkAnswer(
          await rcon(manifest, `setaccesslevel ${user} ${role}`),
          'cambiar el nivel de acceso'
        )
      }
      return this.listAccounts(id)
    },

    /** Echa a alguien sin vetarlo: puede volver a entrar cuando quiera. */
    async kick(id: string, username: string, reason?: string): Promise<void> {
      const manifest = await requireManifest(id)
      await requireLive(manifest)
      const motivo = oneWord(reason)
      const user = plainName(username)
      const answer = await rcon(manifest, `kickuser ${user}${motivo ? ` -r ${motivo}` : ''}`)
      // Lo que contesta cuando esa persona no está dentro.
      if (/doesn't exist|no existe|not found/i.test(answer)) {
        throw new Error(`${username} no está conectado.`)
      }
      checkAnswer(answer, 'expulsar')
    },

    /**
     * Da de alta una cuenta a mano.
     *
     * Es lo que hace falta con el servidor cerrado a nuevos jugadores (`Open`
     * en false): ahí nadie puede crearse la suya al entrar, y la lista de
     * cuentas es la lista blanca.
     */
    async addAccount(id: string, username: string, password: string): Promise<ZomboidAccount[]> {
      const manifest = await requireManifest(id)
      await requireLive(manifest)
      const user = username.trim()
      if (user.length === 0 || password.trim().length === 0) {
        throw new Error('Hacen falta el nombre de usuario y su contraseña.')
      }
      // Ni el nombre ni la contraseña pueden llevar espacios: el servidor parte
      // la orden por ellos y **entrecomillar no vale** (con comillas contesta
      // «This user can't be banned», comprobado).
      if (/\s/.test(user)) throw new Error('El nombre de usuario no puede llevar espacios.')
      if (/\s|"/.test(password.trim())) {
        throw new Error('La contraseña no puede llevar espacios ni comillas.')
      }
      const answer = await rcon(manifest, `adduser ${user} ${password.trim()}`)
      if (/already|ya existe/i.test(answer)) throw new Error(`Ya hay una cuenta «${user}».`)
      checkAnswer(answer, 'crear la cuenta')
      return this.listAccounts(id)
    },

    /** Le pone otra contraseña a una cuenta, para cuando alguien la pierde. */
    async setPassword(id: string, username: string, password: string): Promise<void> {
      const manifest = await requireManifest(id)
      await requireLive(manifest)
      if (password.trim().length === 0) throw new Error('La contraseña no puede quedar vacía.')
      if (/\s|"/.test(password.trim())) {
        throw new Error('La contraseña no puede llevar espacios ni comillas.')
      }
      checkAnswer(
        await rcon(manifest, `setpassword ${plainName(username)} ${password.trim()}`),
        'cambiar la contraseña'
      )
    },

    /** Levanta el veto a una dirección. */
    async unbanIp(id: string, ip: string): Promise<ZomboidBannedIp[]> {
      const manifest = await requireManifest(id)
      await requireLive(manifest)
      await rcon(manifest, `unbanip ${ip.trim()}`)
      return this.listBannedIps(id)
    },

    /** Manda un aviso a todo el mundo que esté dentro. */
    async broadcast(id: string, message: string): Promise<void> {
      const manifest = await requireManifest(id)
      await requireLive(manifest)
      const texto = message.trim()
      if (texto.length === 0) return
      await rcon(manifest, `servermsg ${texto}`)
    },

    /** Guarda la partida sin parar el servidor. */
    async saveNow(id: string): Promise<void> {
      const manifest = await requireManifest(id)
      await requireLive(manifest)
      await rcon(manifest, 'save')
    },

    // --- Mods del taller de Steam -------------------------------------------------

    /**
     * Los mods del servidor: lo que el usuario pidió y lo que hay en disco.
     *
     * Mirarlos se puede con el servidor arrancado; cambiarlos no, porque el
     * juego los lee al cargar el mundo y no los vuelve a mirar.
     */
    async listMods(id: string): Promise<ZomboidModEntry[]> {
      const manifest = await requireManifest(id)
      return installedEntries(id, modsOf(manifest), manifest.data.gameVersion)
    },

    /**
     * Añade un mod del taller: acepta su enlace o su número.
     *
     * Antes de descargar nada se le piden sus datos a Steam, que los da sin
     * clave de API: así se puede rechazar con sentido un mod de otro juego en
     * vez de bajar 70 MB para descubrirlo luego.
     */
    async addMod(
      id: string,
      text: string,
      onProgress?: (detail: string) => void
    ): Promise<ZomboidModEntry[]> {
      const manifest = await requireManifest(id)
      host.assertStopped(id, 'añadir un mod')

      const workshopId = workshopIdFrom(text)
      if (!workshopId) {
        throw new Error(
          'Eso no es un mod del taller. Pega su enlace (el de la barra del navegador) o su número.'
        )
      }
      if (modsOf(manifest).some((mod) => mod.workshopId === workshopId)) {
        throw new Error('Ese mod ya está en este servidor.')
      }

      const [details] = await workshopDetails([workshopId])
      if (details && details.appId !== 0 && details.appId !== ZOMBOID_WORKSHOP_APP_ID) {
        throw new Error('Ese objeto del taller es de otro juego, no de Project Zomboid.')
      }

      const folders = await installWorkshopItem(id, workshopId, onProgress)
      const ref: ZomboidModRef = {
        workshopId,
        title: details?.title ?? `Mod ${workshopId}`,
        folders,
        enabled: true,
        ...(details?.updatedAt ? { updatedAt: details.updatedAt } : {}),
        addedAt: new Date().toISOString()
      }
      await host.updateInstance(id, {
        data: { ...manifest.data, mods: [...modsOf(manifest), ref] }
      })
      return this.listMods(id)
    },

    /** Quita un mod: del disco y de la lista. */
    async removeMod(id: string, workshopId: string): Promise<ZomboidModEntry[]> {
      const manifest = await requireManifest(id)
      host.assertStopped(id, 'quitar un mod')
      const ref = modsOf(manifest).find((mod) => mod.workshopId === workshopId)
      if (!ref) throw new Error('Ese mod no está en este servidor.')

      await removeWorkshopItem(id, ref.folders)
      await host.updateInstance(id, {
        data: {
          ...manifest.data,
          mods: modsOf(manifest).filter((mod) => mod.workshopId !== workshopId)
        }
      })
      return this.listMods(id)
    },

    /**
     * Enciende o apaga un mod sin borrarlo.
     *
     * Apagado sigue en disco pero no entra en `Mods=`, así que volver a
     * encenderlo no cuesta otra descarga.
     */
    async setModEnabled(
      id: string,
      workshopId: string,
      enabled: boolean
    ): Promise<ZomboidModEntry[]> {
      const manifest = await requireManifest(id)
      host.assertStopped(id, 'encender o apagar un mod')
      const mods = modsOf(manifest).map((mod) =>
        mod.workshopId === workshopId ? { ...mod, enabled } : mod
      )
      await host.updateInstance(id, { data: { ...manifest.data, mods } })
      return this.listMods(id)
    },

    /**
     * Sube o baja un mod en la lista.
     *
     * El orden no es cosmético: es el orden de carga, y decide quién gana
     * cuando dos mods tocan lo mismo. Manda el último.
     */
    async moveMod(id: string, workshopId: string, delta: number): Promise<ZomboidModEntry[]> {
      const manifest = await requireManifest(id)
      host.assertStopped(id, 'cambiar el orden de los mods')
      const mods = [...modsOf(manifest)]
      const desde = mods.findIndex((mod) => mod.workshopId === workshopId)
      if (desde === -1) throw new Error('Ese mod no está en este servidor.')
      const hasta = Math.min(Math.max(desde + delta, 0), mods.length - 1)
      if (hasta === desde) return this.listMods(id)

      const [movido] = mods.splice(desde, 1)
      mods.splice(hasta, 0, movido!)
      await host.updateInstance(id, { data: { ...manifest.data, mods } })
      return this.listMods(id)
    },

    /**
     * ¿Ha tocado algún autor su mod desde que se instaló?
     *
     * Se compara la fecha que da Steam con la que se guardó al añadirlo. No se
     * actualiza nada solo: un mod que cambia a mitad de partida puede dejarla
     * inservible, así que actualizar es siempre decisión del usuario.
     */
    async modUpdates(id: string): Promise<string[]> {
      const manifest = await requireManifest(id)
      if (modsOf(manifest).length === 0) return []
      const detalles = await workshopDetails(modsOf(manifest).map((mod) => mod.workshopId))
      const porId = new Map(detalles.map((d) => [d.workshopId, d]))
      return modsOf(manifest)
        .filter((mod) => {
          const fecha = porId.get(mod.workshopId)?.updatedAt
          return Boolean(fecha) && Boolean(mod.updatedAt) && fecha! > mod.updatedAt!
        })
        .map((mod) => mod.workshopId)
    },

    /** Vuelve a descargar un mod, con la copia de seguridad de rigor. */
    async updateMod(
      id: string,
      workshopId: string,
      onProgress?: (detail: string) => void
    ): Promise<ZomboidModEntry[]> {
      const manifest = await requireManifest(id)
      host.assertStopped(id, 'actualizar un mod')
      const ref = modsOf(manifest).find((mod) => mod.workshopId === workshopId)
      if (!ref) throw new Error('Ese mod no está en este servidor.')

      // Actualizar un mod puede romper una partida que ya lo usaba.
      await host.createBackup(id, `Antes de actualizar ${ref.title}`, true)
      const folders = await installWorkshopItem(id, workshopId, onProgress)
      const [details] = await workshopDetails([workshopId])
      const mods = modsOf(manifest).map((mod) =>
        mod.workshopId === workshopId
          ? { ...mod, folders, ...(details?.updatedAt ? { updatedAt: details.updatedAt } : {}) }
          : mod
      )
      await host.updateInstance(id, { data: { ...manifest.data, mods } })
      return this.listMods(id)
    }
  }
}

/**
 * Los mods del manifiesto.
 *
 * Un servidor creado antes de que la app supiera de mods no tiene la lista, y
 * leerla a pelo dejaría su pestaña rota en vez de vacía.
 */
function modsOf(manifest: ZomboidManifest): ZomboidModRef[] {
  return manifest.data.mods ?? []
}

async function requireLive(manifest: ZomboidManifest): Promise<void> {
  try {
    await rcon(manifest, 'players')
  } catch {
    throw new Error(
      'Hay que tener el servidor arrancado: en Zomboid las cuentas viven en la base de datos del ' +
        'propio servidor y solo él puede tocarlas.'
    )
  }
}

/**
 * El nombre de una cuenta, tal cual se le manda al servidor.
 *
 * ⚠ **Nada de comillas.** Su ayuda las documenta (`/addkey "usuario" "clave"`),
 * pero por RCON no funcionan: `banuser "invitado" -r motivo` contesta «This
 * user can't be banned» y no hace nada, mientras que sin comillas veta
 * (comprobado). Los nombres de usuario de Zomboid no llevan espacios, así que
 * no hacen falta.
 */
function plainName(username: string): string {
  const user = username.trim().replace(/["\s]/g, '')
  if (user.length === 0) throw new Error('Hay que decir a quién.')
  return user
}

/**
 * La razón de un veto o de una expulsión, en **una sola palabra**.
 *
 * Su propia ayuda pone de ejemplo una razón de dos palabras («dupear items»),
 * pero por RCON eso no funciona: el servidor contesta con la ayuda del comando
 * y **no veta a nadie** (comprobado). Con una palabra sí. Vale más un motivo
 * con guiones que un veto que no ocurre.
 */
function oneWord(reason?: string): string {
  return (reason ?? '').trim().replace(/["\s]+/g, '-')
}

/**
 * El servidor no falla cuando no entiende una orden: **contesta con la ayuda
 * del comando** y se queda tan ancho. Sin esto, la app diría que ha vetado a
 * alguien que sigue jugando.
 */
function checkAnswer(answer: string, action: string): void {
  if (/Usa \/|Utilice:|Uso: |Usage:/i.test(answer)) {
    throw new Error(
      `El servidor no ha entendido la orden de ${action}, así que no ha hecho nada. ` +
        `Contestó: ${answer.trim().slice(0, 160)}`
    )
  }
}

/** Los niveles que no conocemos se tratan como jugador normal, no se inventan. */
function normalizeRole(raw: unknown): ZomboidRole {
  const name = String(raw ?? '').toLowerCase()
  return (ROLES.find((r) => r.id === name)?.id ?? 'user') as ZomboidRole
}

/** Lo justo de `node:sqlite` que se usa aquí, para no depender de sus tipos. */
interface Database {
  prepare(sql: string): { all(): Record<string, unknown>[] }
}

export { normalizeRole, oneWord, plainName }
