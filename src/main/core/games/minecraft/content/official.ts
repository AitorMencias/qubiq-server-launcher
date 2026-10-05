import { join } from 'node:path'
import { readdir, copyFile, rm, access, readFile } from 'node:fs/promises'
import type { Distribution } from '@shared/games/minecraft/types'
import type {
  BundledOfficialPlugin,
  OfficialPlugin,
  OfficialPluginStatus
} from '@shared/games/minecraft/officialPlugins'
import {
  OFFICIAL_PLUGINS,
  officialPluginsFor,
  officialPluginById
} from '@shared/games/minecraft/officialPlugins'
import { serverDir, ensureDir, gameResourcePath } from '../../../paths'

/** Jar o plantilla de un plugin oficial, dentro de `resources/minecraft/plugins/<id>/`. */
function bundledPluginPath(pluginId: string, fileName: string): string {
  return gameResourcePath('minecraft', 'plugins', pluginId, fileName)
}
import { folderNameFor } from './manager'
import { PluginConfigFile, type ConfigValue } from './pluginConfig'

/**
 * Plugins oficiales: los que viajan con la aplicación (§4.8).
 *
 * A diferencia de los de Modrinth, de estos conocemos el jar y el formato de su
 * configuración, así que se pueden instalar y configurar sin salir de la app.
 *
 * Una decisión que ahorra un baile incómodo: la plantilla de `config.yml` se
 * empaqueta junto al jar y se escribe al instalar. Sin ella habría que arrancar
 * el servidor una vez solo para que el plugin generara el fichero, pararlo y
 * entonces configurarlo. Bukkit no sobrescribe una configuración que ya existe,
 * así que adelantarla es seguro.
 */

export type { OfficialPluginStatus }

/**
 * Lo que trae la app de un plugin: versión y nombre del jar. Lo escribe
 * `npm run plugins` al bajar la última release del plugin; en una instalación
 * va siempre, porque la release no sale sin él.
 */
async function bundled(plugin: OfficialPlugin): Promise<BundledOfficialPlugin> {
  try {
    return JSON.parse(
      await readFile(bundledPluginPath(plugin.id, 'plugin.json'), 'utf8')
    ) as BundledOfficialPlugin
  } catch {
    throw new Error(
      `La app no trae ${plugin.name}. Si es una instalación, vuelve a instalarla; ` +
        'en desarrollo, lo baja «npm run plugins».'
    )
  }
}

/** ¿Son el mismo fichero, byte a byte? */
async function sameContent(a: string, b: string): Promise<boolean> {
  try {
    const [one, other] = await Promise.all([readFile(a), readFile(b)])
    return one.length === other.length && Buffer.compare(one, other) === 0
  } catch {
    return false
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

function pluginsDir(id: string, distribution: Distribution): string | null {
  const folder = folderNameFor(distribution)
  return folder ? join(serverDir(id), folder) : null
}

/** Busca el jar del plugin, esté activo o desactivado. */
async function findInstalledJar(dir: string, plugin: OfficialPlugin): Promise<string | null> {
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return null
  }

  const prefix = plugin.jarPrefix.toLowerCase()
  return (
    entries.find((entry) => {
      const lower = entry.toLowerCase()
      if (!lower.startsWith(prefix)) return false
      return lower.endsWith('.jar') || lower.endsWith('.jar.disabled')
    }) ?? null
  )
}

function configPath(id: string, distribution: Distribution, plugin: OfficialPlugin): string | null {
  const dir = pluginsDir(id, distribution)
  return dir ? join(dir, plugin.configFolder, plugin.configFileName) : null
}

async function statusFor(
  id: string,
  distribution: Distribution,
  plugin: OfficialPlugin
): Promise<OfficialPluginStatus> {
  const dir = pluginsDir(id, distribution)
  const installedFileName = dir ? await findInstalledJar(dir, plugin) : null
  const own = await bundled(plugin)

  const status: OfficialPluginStatus = {
    id: plugin.id,
    installed: installedFileName !== null,
    enabled: installedFileName !== null && installedFileName.toLowerCase().endsWith('.jar'),
    installedFileName,
    bundledVersion: own.version,
    license: own.license,
    upToDate:
      installedFileName !== null &&
      dir !== null &&
      (await sameContent(
        join(dir, installedFileName),
        bundledPluginPath(plugin.id, own.jarFileName)
      )),
    hasConfig: false,
    role: null,
    config: {}
  }

  const path = configPath(id, distribution, plugin)
  if (!path || !(await exists(path))) return status

  status.hasConfig = true
  const config = await PluginConfigFile.load(path)

  if (plugin.roleKey) status.role = config.get(plugin.roleKey)
  for (const field of plugin.fields) {
    const value = config.get(field.path)
    if (value !== null) status.config[field.path] = value
  }

  return status
}

export async function listOfficial(
  id: string,
  distribution: Distribution
): Promise<OfficialPluginStatus[]> {
  const plugins = officialPluginsFor(distribution)
  return Promise.all(plugins.map((plugin) => statusFor(id, distribution, plugin)))
}

/** Los que trae la app, con versión, licencia y repositorio, para «Acerca de». */
export async function bundledOfficialPlugins(): Promise<
  (BundledOfficialPlugin & { name: string })[]
> {
  const found = await Promise.all(
    OFFICIAL_PLUGINS.map((plugin) =>
      bundled(plugin).then(
        (own) => ({ ...own, name: plugin.name }),
        () => null
      )
    )
  )
  return found.filter((p) => p !== null)
}

function requirePlugin(pluginId: string, distribution: Distribution): OfficialPlugin {
  const plugin = officialPluginById(pluginId)
  if (!plugin) throw new Error(`No existe el plugin oficial "${pluginId}".`)
  if (!plugin.distributions.includes(distribution)) {
    throw new Error(`${plugin.name} no es compatible con este tipo de servidor.`)
  }
  return plugin
}

/**
 * Instala el jar y deja la configuración lista.
 * Si ya había otra versión, se retira: dos jars del mismo plugin en la carpeta
 * hacen que el servidor no arranque.
 */
export async function install(
  id: string,
  distribution: Distribution,
  pluginId: string,
  role?: string
): Promise<OfficialPluginStatus[]> {
  const plugin = requirePlugin(pluginId, distribution)
  const dir = pluginsDir(id, distribution)
  if (!dir) throw new Error('Este tipo de servidor no admite plugins.')

  await ensureDir(dir)
  const own = await bundled(plugin)

  const previous = await findInstalledJar(dir, plugin)
  if (previous && previous !== own.jarFileName) {
    await rm(join(dir, previous), { force: true })
  }

  await copyFile(bundledPluginPath(plugin.id, own.jarFileName), join(dir, own.jarFileName))

  // Configuración por adelantado, para no tener que arrancar el servidor solo
  // para que se genere.
  const path = configPath(id, distribution, plugin)
  if (path) {
    await ensureDir(join(dir, plugin.configFolder))
    const templatePath = bundledPluginPath(plugin.id, plugin.configFileName)

    if (!(await exists(path))) {
      await copyFile(templatePath, path)
      if (role && plugin.roleKey) {
        const config = await PluginConfigFile.load(path)
        config.set(plugin.roleKey, role)
        await config.save(path)
      }
    } else {
      // Ya había configuración: se conserva tal cual y solo se le añaden las
      // opciones que el plugin haya estrenado desde entonces. Si no, quien lo
      // instaló antes vería los campos nuevos en el formulario y al guardarlos
      // no pasaría nada, porque el editor no crea claves.
      const config = await PluginConfigFile.load(path)
      config.addMissingFrom(PluginConfigFile.parse(await readFile(templatePath, 'utf8')))
      if (role && plugin.roleKey) config.set(plugin.roleKey, role)
      await config.save(path)
    }
  }

  return listOfficial(id, distribution)
}

/**
 * Quita el jar. La configuración se conserva salvo que se pida lo contrario:
 * dentro está la clave compartida y las direcciones, y volver a escribirlas es
 * lo más molesto de montar esto.
 */
export async function uninstall(
  id: string,
  distribution: Distribution,
  pluginId: string,
  removeConfig = false
): Promise<OfficialPluginStatus[]> {
  const plugin = requirePlugin(pluginId, distribution)
  const dir = pluginsDir(id, distribution)
  if (!dir) throw new Error('Este tipo de servidor no admite plugins.')

  const installed = await findInstalledJar(dir, plugin)
  if (installed) await rm(join(dir, installed), { force: true })

  if (removeConfig) {
    await rm(join(dir, plugin.configFolder), { recursive: true, force: true })
  }

  return listOfficial(id, distribution)
}

/** Guarda los campos del formulario en el config.yml, conservando comentarios. */
export async function writeConfig(
  id: string,
  distribution: Distribution,
  pluginId: string,
  values: Record<string, ConfigValue>
): Promise<OfficialPluginStatus[]> {
  const plugin = requirePlugin(pluginId, distribution)
  const path = configPath(id, distribution, plugin)
  if (!path || !(await exists(path))) {
    throw new Error(`Todavía no hay configuración de ${plugin.name}. Instálalo primero.`)
  }

  const config = await PluginConfigFile.load(path)

  // Si el fichero es de una versión anterior del plugin le faltarán claves, y
  // el editor no las crea. Se traen antes de escribir, desde la plantilla
  // oficial. Sin esto, guardar una opción nueva no daba error y tampoco hacía
  // nada: el campo se vaciaba al recargar y el usuario se quedaba sin saber por
  // qué. Es la misma fusión que hace instalar, y tampoco pisa ningún valor.
  const missing = Object.keys(values).some((key) => !config.has(key))
  if (missing) {
    const templatePath = bundledPluginPath(plugin.id, plugin.configFileName)
    config.addMissingFrom(PluginConfigFile.parse(await readFile(templatePath, 'utf8')))
  }

  const ignored: string[] = []

  for (const [key, value] of Object.entries(values)) {
    // Solo se escriben claves que el catálogo reconoce, para que la interfaz no
    // pueda inventar rutas dentro del YAML del plugin.
    const known = key === plugin.roleKey || plugin.fields.some((f) => f.path === key)
    if (!known) {
      ignored.push(key)
      continue
    }
    if (!config.set(key, value)) ignored.push(key)
  }

  await config.save(path)

  // Lo que se haya guardado, guardado queda; pero callarse lo que no cabe en el
  // fichero es peor que no guardarlo, porque el usuario cree que sí.
  if (ignored.length > 0) {
    const labels = ignored.map((key) => labelFor(plugin, key)).join(', ')
    throw new Error(
      `No se pudo guardar: ${labels}. ` +
        `Tu ${plugin.configFileName} no tiene esas opciones y la plantilla de la aplicación ` +
        `tampoco, así que puede que el plugin haya cambiado de formato. El resto sí se ha guardado.`
    )
  }

  return listOfficial(id, distribution)
}

/** El nombre que el usuario ve, para no soltarle una ruta del YAML en un error. */
function labelFor(plugin: OfficialPlugin, path: string): string {
  return plugin.fields.find((f) => f.path === path)?.label ?? path
}
