import { join } from 'node:path'
import type { BackupInfo, InstanceManifest, ManifestChanges, MinecraftManifest } from '@shared/types'
import type {
  ContentConfigDocument,
  ContentConfigInfo,
  ContentConfigSaveResult,
  ContentInfo,
  CreateWorldRequest,
  StartFileInfo,
  WorldInfo
} from '@shared/games/minecraft/types'
import type { ConfigChange } from '@shared/editableConfig'
import { officialPluginById, serverPropertiesFor } from '@shared/games/minecraft/officialPlugins'
import type { OfficialPluginStatus } from '@shared/games/minecraft/officialPlugins'
import { serverDir } from '../../paths'
import { PropertiesFile } from './config/properties'
import * as content from './content/manager'
import * as contentConfig from './content/config'
import * as official from './content/official'
import * as worlds from './worlds/manager'
import { describeStartFile, startFilesIn } from './custom/inspect'

/**
 * Operaciones exclusivas de Minecraft: `server.properties`, plugins y mods,
 * plugins oficiales y mundos.
 *
 * Necesitan cosas del orquestador común (saber si el servidor está arrancado,
 * hacer una copia antes de algo destructivo, actualizar el manifiesto), así que
 * las reciben a través de `GameHost` en vez de importar el servicio y crear un
 * ciclo de dependencias.
 */

export interface GameHost {
  readManifest(id: string): Promise<InstanceManifest | null>
  updateInstance(id: string, changes: ManifestChanges): Promise<InstanceManifest>
  /** Lanza un error legible si el servidor está en marcha. */
  assertStopped(id: string, action: string): void
  createBackup(id: string, reason?: string, automatic?: boolean): Promise<BackupInfo>
}

function propertiesPath(id: string): string {
  return join(serverDir(id), 'server.properties')
}

export function createMinecraftService(host: GameHost) {
  async function requireManifest(id: string): Promise<MinecraftManifest> {
    const manifest = await host.readManifest(id)
    if (!manifest) throw new Error(`No existe la instancia ${id}.`)
    if (manifest.game !== 'minecraft') {
      throw new Error('Esta operación solo existe para servidores de Minecraft.')
    }
    return manifest
  }

  /**
   * Escribe server.properties preservando claves desconocidas y comentarios (§8).
   * El servidor debe estar parado: si está arrancado, reescribe el fichero al
   * cerrarse y machacaría estos cambios.
   */
  async function writeProperties(
    id: string,
    values: Record<string, string>
  ): Promise<Record<string, string>> {
    const path = propertiesPath(id)
    const props = await PropertiesFile.load(path)
    props.setAll(values)
    await props.save(path)

    // El puerto vive en dos sitios; mantenemos el manifiesto sincronizado.
    const port = values['server-port']
    if (port && Number.isFinite(Number(port))) {
      await host.updateInstance(id, { port: Number(port) })
    }

    return props.entries()
  }

  return {
    // --- Configuración -------------------------------------------------------

    async getProperties(id: string): Promise<Record<string, string>> {
      await requireManifest(id)
      const props = await PropertiesFile.load(propertiesPath(id))
      return props.entries()
    },

    async setProperties(
      id: string,
      values: Record<string, string>
    ): Promise<Record<string, string>> {
      await requireManifest(id)
      host.assertStopped(
        id,
        'cambiar su configuración. Si no, la sobrescribirá al cerrarse'
      )
      return writeProperties(id, values)
    },

    // --- Plugins y mods (§4.8) -----------------------------------------------

    async listContent(id: string): Promise<ContentInfo> {
      const manifest = await requireManifest(id)
      return content.listContent(id, manifest.data.distribution)
    },

    /** Ruta de la carpeta de plugins/mods, creada si hacía falta. */
    async contentFolder(id: string): Promise<string | null> {
      const manifest = await requireManifest(id)
      return content.contentFolder(id, manifest.data.distribution)
    },

    async setContentEnabled(id: string, fileName: string, enabled: boolean): Promise<ContentInfo> {
      const manifest = await requireManifest(id)
      host.assertStopped(id, 'activar o desactivar plugins y mods')
      return content.setEnabled(id, manifest.data.distribution, fileName, enabled)
    },

    async removeContent(id: string, fileName: string): Promise<ContentInfo> {
      const manifest = await requireManifest(id)
      host.assertStopped(id, 'borrar plugins o mods')
      return content.removeContent(id, manifest.data.distribution, fileName)
    },

    // --- Configuración de plugins y mods (§19.20) ---------------------------
    //
    // Leer se puede siempre; guardar, solo con el servidor parado: muchos
    // plugins vuelven a escribir su configuración al cerrarse y pisarían los
    // cambios, y de todas formas no la leen hasta el siguiente arranque.

    async contentConfigFiles(id: string, fileName: string): Promise<ContentConfigInfo> {
      const manifest = await requireManifest(id)
      return contentConfig.listConfigFiles(id, manifest.data.distribution, fileName)
    },

    async readContentConfig(id: string, path: string): Promise<ContentConfigDocument> {
      await requireManifest(id)
      return contentConfig.readConfig(id, path)
    },

    async writeContentConfig(
      id: string,
      path: string,
      hash: string,
      changes: ConfigChange[]
    ): Promise<ContentConfigSaveResult> {
      await requireManifest(id)
      host.assertStopped(id, 'cambiar la configuración de un plugin o mod. Si no, la sobrescribirá al cerrarse')
      return contentConfig.writeConfig(id, path, hash, changes)
    },

    /** Ruta absoluta de un fichero o carpeta de configuración, para abrirlo fuera. */
    async contentConfigLocation(id: string, path: string): Promise<string> {
      await requireManifest(id)
      return contentConfig.resolveConfigPath(id, path, { folder: true })
    },

    // --- Plugins oficiales ---------------------------------------------------

    async listOfficialPlugins(id: string): Promise<OfficialPluginStatus[]> {
      const manifest = await requireManifest(id)
      return official.listOfficial(id, manifest.data.distribution)
    },

    /**
     * Instala un plugin oficial y aplica los ajustes de `server.properties` que
     * necesita: aceptar transferencias siempre, y el modo extremo si el papel
     * elegido lo exige.
     *
     * La interfaz ya ha avisado de lo que va a cambiar; prometerlo y no hacerlo
     * dejaría la partida en supervivencia normal sin que nadie se diera cuenta
     * hasta morirse y reaparecer tan tranquilo, o con un lobby incapaz de mandar
     * a nadie a jugar.
     */
    async installOfficialPlugin(
      id: string,
      pluginId: string,
      role?: string
    ): Promise<OfficialPluginStatus[]> {
      const manifest = await requireManifest(id)
      host.assertStopped(id, 'instalar un plugin')

      const result = await official.install(id, manifest.data.distribution, pluginId, role)

      const plugin = officialPluginById(pluginId)
      if (plugin) {
        const properties = serverPropertiesFor(plugin, role)
        if (Object.keys(properties).length > 0) {
          await writeProperties(id, properties)
        }
      }

      return result
    },

    async uninstallOfficialPlugin(
      id: string,
      pluginId: string,
      removeConfig = false
    ): Promise<OfficialPluginStatus[]> {
      const manifest = await requireManifest(id)
      host.assertStopped(id, 'quitar un plugin')
      return official.uninstall(id, manifest.data.distribution, pluginId, removeConfig)
    },

    async setOfficialPluginConfig(
      id: string,
      pluginId: string,
      values: Record<string, string | number | boolean>
    ): Promise<OfficialPluginStatus[]> {
      const manifest = await requireManifest(id)
      // El plugin lee su configuración al arrancar: cambiarla en caliente no
      // tendría efecto y daría una falsa sensación de haberlo aplicado.
      host.assertStopped(id, 'cambiar la configuración de un plugin')
      return official.writeConfig(id, manifest.data.distribution, pluginId, values)
    },

    // --- Mundos --------------------------------------------------------------
    //
    // Las tres operaciones escriben en server.properties, así que exigen el
    // servidor parado: en marcha lo reescribe al cerrarse y se perderían (§8).

    async listWorlds(id: string): Promise<WorldInfo[]> {
      await requireManifest(id)
      return worlds.listWorlds(id)
    },

    async createWorld(id: string, request: CreateWorldRequest): Promise<WorldInfo[]> {
      await requireManifest(id)
      host.assertStopped(id, 'crear un mundo')
      await worlds.createWorld(id, request)
      return worlds.listWorlds(id)
    },

    async activateWorld(id: string, name: string): Promise<WorldInfo[]> {
      await requireManifest(id)
      host.assertStopped(id, 'cambiar de mundo')
      await worlds.activateWorld(id, name)
      return worlds.listWorlds(id)
    },

    async deleteWorld(id: string, name: string): Promise<WorldInfo[]> {
      await requireManifest(id)
      host.assertStopped(id, 'borrar un mundo')

      // Un mundo borrado no se recupera, así que antes se guarda una copia,
      // igual que se hace antes de reinstalar o restaurar (§12).
      const active = await worlds.activeWorldName(id)
      if (name === active) {
        // No debería llegar aquí (el gestor lo impide), pero si el mundo activo
        // fuera el que se borra, la copia previa sería justo la que hace falta.
        await host.createBackup(id, `Copia previa a borrar "${name}"`, true).catch(() => undefined)
      }

      await worlds.deleteWorld(id, name)
      return worlds.listWorlds(id)
    },

    // --- Servidores a medida -------------------------------------------------

    /** Archivos con los que se puede arrancar, para cambiar el elegido. */
    async startFiles(id: string): Promise<StartFileInfo[]> {
      await requireManifest(id)
      return startFilesIn(serverDir(id))
    },

    /**
     * Cambia el archivo de inicio de un servidor a medida. Se vuelve a mirar
     * quién pone la memoria, porque depende del script elegido.
     */
    async setStartFile(id: string, path: string): Promise<InstanceManifest> {
      const manifest = await requireManifest(id)
      const custom = manifest.data.custom
      if (!custom) throw new Error('Solo los servidores a medida eligen su archivo de inicio.')
      host.assertStopped(id, 'cambiarle el archivo de inicio')
      const start = await describeStartFile(serverDir(id), path)
      return host.updateInstance(id, {
        data: { custom: { ...custom, startFile: start.path, memory: start.memory } }
      })
    }
  }
}

export type MinecraftService = ReturnType<typeof createMinecraftService>
