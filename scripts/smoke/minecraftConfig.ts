/**
 * Prueba de humo de la configuración de plugins y mods (§19.20): los editores
 * de YAML, TOML, JSON y .properties, la lectura de jars y el recorrido
 * completo de buscar, leer y guardar en un servidor de mentira.
 *
 * Los editores se probaron además contra 73 ficheros reales (EssentialsX,
 * LuckPerms, la configuración de Paper y 65 de un modpack de NeoForge): leer y
 * escribir sin cambios deja el fichero idéntico, y cambiarlo todo se relee
 * bien sin perder un comentario. Aquí van los casos que salieron de ahí.
 */

import { join } from 'node:path'
import { mkdir, readFile, writeFile, copyFile, rename } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { check, section } from './harness'
import { parseEditable, formatForFile } from '../../src/main/core/formats/editable'
import type { ConfigOption } from '../../src/shared/editableConfig'
import {
  identifyJar,
  listConfigFiles,
  modsFromToml,
  readConfig,
  resolveConfigPath,
  writeConfig
} from '../../src/main/core/games/minecraft/content/config'
import { serverDir, systemTarPath } from '../../src/main/core/paths'
import { OFFICIAL_PLUGINS } from '../../src/shared/games/minecraft/officialPlugins'

const execFileAsync = promisify(execFile)

function find(options: ConfigOption[], path: string): ConfigOption | undefined {
  return options.find((o) => o.path.join('.') === path)
}

function throws(fn: () => unknown): string | null {
  try {
    fn()
    return null
  } catch (err) {
    return (err as Error).message
  }
}

export async function minecraftConfigSmoke(): Promise<void> {
  await section('Configuración de plugins: YAML', async () => {
    const yaml = [
      '# +------------------------------------+ #',
      '# |         AJUSTES ESENCIALES         | #',
      '# +------------------------------------+ #',
      '',
      '# El nombre del servidor.',
      '# - Con "global" no se aplica.',
      'server: global',
      '',
      '# Máximo de casas por jugador.',
      'max-homes: 3   # comentario al final',
      '',
      '# Esto explica la opción apagada de abajo, no la siguiente.',
      '#change-playerlist: true',
      'teleport-safety: true',
      '',
      'nick-blacklist:',
      '#- Notch',
      "#- '^Dinnerbone'",
      '',
      '# Comandos desactivados.',
      'disabled-commands:',
      '  - fly',
      '  - "god"',
      '',
      'mezcla:',
      '  - uno',
      '  # un comentario entre elementos',
      '  - dos',
      '',
      '# Sección de base de datos.',
      'data:',
      '  address: "localhost:3306"',
      "  pool: 'mínimo'",
      '  motd: |',
      '    Hola',
      '    mundo',
      '  worlds: [world, world_nether]',
      'vacio:',
      'ratio: 1.5',
      ''
    ].join('\r\n')

    const doc = parseEditable('yaml', yaml)
    const o = doc.config.options
    check('ida y vuelta sin cambios deja el fichero igual', doc.serialize() === yaml)

    const server = find(o, 'server')
    check('descripción del comentario pegado', server?.description === 'El nombre del servidor.\n- Con "global" no se aplica.', server?.description ?? '')
    check('el banner no se cuela como descripción', !doc.config.options.some((x) => x.description?.includes('ESENCIALES')))
    check('el comentario del final de línea también cuenta', find(o, 'max-homes')?.description?.includes('comentario al final') === true)
    check('un entero se reconoce como entero', find(o, 'max-homes')?.type === 'integer')
    check('un decimal como número', find(o, 'ratio')?.type === 'number')
    check('una opción apagada (#clave) no explica la siguiente', find(o, 'teleport-safety')?.description === null)
    check(
      'una clave vacía con ejemplos «#- x» debajo es una lista vacía',
      find(o, 'nick-blacklist')?.type === 'list' && find(o, 'nick-blacklist')?.editable === true
    )
    check('una clave vacía sin más no se deja editar', find(o, 'vacio')?.editable === false)
    check('lista con guiones editable', find(o, 'disabled-commands')?.editable === true)
    check('y sin comillas en sus elementos', find(o, 'disabled-commands')?.items?.join(',') === 'fly,god')
    check('con comentarios entre elementos, solo lectura', find(o, 'mezcla')?.editable === false)
    check('las secciones anidan la ruta', find(o, 'data.address')?.value === 'localhost:3306')
    check('la sección guarda su descripción', doc.config.sections.some((s) => s.path.join('.') === 'data'))
    check('un texto de varias líneas es de solo lectura', find(o, 'data.motd')?.editable === false)
    check('lista entre corchetes', find(o, 'data.worlds')?.items?.join(',') === 'world,world_nether')

    doc.apply([
      { path: ['max-homes'], value: '5' },
      { path: ['server'], value: 'lobby: principal' },
      { path: ['data', 'pool'], value: "it's" },
      { path: ['disabled-commands'], value: ['fly', 'god', 'heal'] },
      { path: ['nick-blacklist'], value: ['Notch'] },
      { path: ['data', 'worlds'], value: [] },
      { path: ['ratio'], value: '2' }
    ])
    const out = doc.serialize()
    check('conserva el comentario del final de línea', out.includes('max-homes: 5   # comentario al final'))
    check('entrecomilla un texto con «: »', out.includes('server: "lobby: principal"'))
    check('respeta las comillas simples y escapa', out.includes("  pool: 'it''s'"))
    check('reescribe los elementos de la lista con su sangría', out.includes('  - fly\r\n  - god\r\n  - heal\r\n'))
    check('la lista vacía con ejemplos se rellena entre corchetes', out.includes('nick-blacklist: [Notch]\r\n#- Notch'))
    check('una lista entre corchetes puede quedar vacía', out.includes('  worlds: []'))
    check('un decimal sigue siéndolo', out.includes('ratio: 2.0'))
    check('no se pierde ni un comentario', out.split('#').length === yaml.split('#').length)
    const again = parseEditable('yaml', out).config.options
    check('se relee igual', find(again, 'server')?.value === 'lobby: principal' && find(again, 'data.pool')?.value === "it's")

    const noop = parseEditable('yaml', yaml)
    noop.apply([{ path: ['ratio'], value: '1.50' }, { path: ['disabled-commands'], value: ['fly', 'god'] }])
    check('un cambio que deja el mismo valor no toca el fichero', noop.serialize() === yaml)

    check(
      'rechaza una opción que no existe, sin tocar nada',
      throws(() => parseEditable('yaml', yaml).apply([{ path: ['no-existe'], value: '1' }]))?.includes('ya no está') === true
    )
    check(
      'rechaza un número mal escrito',
      throws(() => parseEditable('yaml', yaml).apply([{ path: ['max-homes'], value: '3.5' }]))?.includes('entero') === true
    )

    // La plantilla REAL del plugin oficial: el editor genérico tiene que ver
    // todos los campos que el formulario propio sabe cambiar.
    const templatePath = join(process.cwd(), 'resources/minecraft/plugins/hardcore-utility/config.yml')
    const template = await readFile(templatePath, 'utf8')
    const real = parseEditable('yaml', template)
    check('la plantilla real se lee y se escribe igual', real.serialize() === template)
    const hardcore = OFFICIAL_PLUGINS.find((p) => p.id === 'hardcore-utility')!
    const missing = hardcore.fields.filter((f) => !find(real.config.options, f.path)?.editable).map((f) => f.path)
    check('ve y deja editar todos sus campos', missing.length === 0, missing.join(', '))
  })

  await section('Configuración de mods: TOML', async () => {
    const toml = [
      '#Ajustes generales',
      '[general]',
      '\t#Si la bala del cañón rompe bloques.',
      '\tmatterCannonBlockDamage = false',
      '\t#Capacidad de los cables.',
      '\t#Allowed Values: INFINITE, DEFAULT, X2',
      '\tchannels = "DEFAULT"',
      '\t#Límite de subida, en bytes.',
      '\t# Default: 524288',
      '\t# Range: 1024 ~ 16777216',
      '\tupload_max_size = 524288',
      '\t# Range: 0.0 ~ 1.0',
      '\tchance = 0.5',
      '\tcapacity = 9223372036854775807',
      '\tbig = 1.6E7',
      "\tliteral = 'C:\\ruta'",
      '\tmods = [',
      '\t\t"waystones",',
      '\t\t"hyperbox"',
      '\t]',
      '\tinline = { a = 1 }',
      '',
      '[[entries]]',
      '\tname = "uno"',
      '[[entries]]',
      '\tname = "dos"',
      ''
    ].join('\n')

    const doc = parseEditable('toml', toml)
    const o = doc.config.options
    check('ida y vuelta sin cambios deja el fichero igual', doc.serialize() === toml)
    check('lee la explicación', find(o, 'general.matterCannonBlockDamage')?.description === 'Si la bala del cañón rompe bloques.')
    const channels = find(o, 'general.channels')
    check('saca los valores admitidos', channels?.allowed?.join(',') === 'INFINITE,DEFAULT,X2', channels?.allowed?.join(',') ?? '')
    check('y no los deja en la explicación', channels?.description === 'Capacidad de los cables.')
    const upload = find(o, 'general.upload_max_size')
    check('saca el valor por defecto', upload?.defaultValue === '524288')
    check('saca el rango', upload?.min === 1024 && upload?.max === 16777216)
    check('la sección lleva su explicación', doc.config.sections.some((s) => s.path[0] === 'general' && s.description === 'Ajustes generales'))
    check('lista de varias líneas editable', find(o, 'general.mods')?.items?.join(',') === 'waystones,hyperbox')
    check('una tabla en línea es de solo lectura', find(o, 'general.inline')?.editable === false)
    check('cada [[tabla]] repetida es un elemento distinto', find(o, 'entries.#1.name')?.value === 'dos')

    check(
      'respeta el rango de Forge',
      throws(() => parseEditable('toml', toml).apply([{ path: ['general', 'upload_max_size'], value: '10' }]))?.includes('menor que 1024') === true
    )
    check(
      'y los valores admitidos',
      throws(() => parseEditable('toml', toml).apply([{ path: ['general', 'channels'], value: 'X9' }])) !== null
    )

    doc.apply([
      { path: ['general', 'chance'], value: '1' },
      { path: ['general', 'mods'], value: ['waystones', 'hyperbox', 'otro'] },
      { path: ['general', 'literal'], value: 'D:\\otra' },
      { path: ['entries', '#0', 'name'], value: 'primero' },
      { path: ['general', 'capacity'], value: '9223372036854775806' }
    ])
    const out = doc.serialize()
    check('un decimal se escribe con decimales (Forge distingue)', out.includes('\tchance = 1.0\n'))
    check('la lista conserva un elemento por línea', out.includes('\tmods = [\n\t\t"waystones",\n\t\t"hyperbox",\n\t\t"otro"\n\t]'))
    check("un literal '...' sigue siéndolo", out.includes("\tliteral = 'D:\\otra'"))
    check('escribe en el elemento correcto de [[tabla]]', out.includes('name = "primero"') && out.includes('name = "dos"'))
    check('los enteros de 64 bits no se redondean', out.includes('capacity = 9223372036854775806'))

    const noop = parseEditable('toml', toml)
    noop.apply([
      { path: ['general', 'big'], value: '16000000' },
      { path: ['general', 'capacity'], value: '9223372036854775807' }
    ])
    check('el mismo valor escrito de otra forma no toca el fichero', noop.serialize() === toml)

    const mods = modsFromToml(
      ['modLoader="javafml"', '[[mods]]', 'modId="qubiqtest"', 'displayName="QubiQ Test"', '[[dependencies.qubiqtest]]', 'modId="forge"'].join('\n')
    )
    check('los modId de las dependencias no son del jar', mods.ids.join(',') === 'qubiqtest', mods.ids.join(','))
    check('y el nombre sale de displayName', mods.name === 'QubiQ Test')
  })

  await section('Configuración de mods: JSON y .properties', async () => {
    const json5 = [
      '{',
      '  // Si el mod está activo.',
      '  enabled: true,',
      "  'nombre': 'hola',",
      '  "lista": [',
      '    "a",',
      '    "b"',
      '  ],',
      '  "onlyOnBooks": {',
      '    "//": ["Solo en libros", "encantados."],',
      '    "//default": false,',
      '    "value": true',
      '  },',
      '  "nulo": null,',
      '  "dosDecimales": 2.0,',
      '}',
      ''
    ].join('\n')
    const doc = parseEditable('json', json5)
    const o = doc.config.options
    check('ida y vuelta sin cambios deja el fichero igual', doc.serialize() === json5)
    check('JSON5: comentario como explicación', find(o, 'enabled')?.description === 'Si el mod está activo.')
    check('JSON5: comillas simples', find(o, 'nombre')?.value === 'hola')
    check('las claves «//» no son opciones', !o.some((x) => x.path.some((p) => p.startsWith('//'))))
    const books = find(o, 'onlyOnBooks.value')
    check('explican su «value»', books?.description === 'Solo en libros\nencantados.' && books?.defaultValue === 'false')
    check('un null no se deja editar', find(o, 'nulo')?.editable === false)

    doc.apply([
      { path: ['lista'], value: ['a', 'b', 'c "d"'] },
      { path: ['onlyOnBooks', 'value'], value: false },
      { path: ['dosDecimales'], value: '3' }
    ])
    const out = doc.serialize()
    check('la lista conserva un elemento por línea', out.includes('"lista": [\n    "a",\n    "b",\n    "c \\"d\\""\n  ]'))
    check('cambia el value, no las notas', out.includes('"value": false') && out.includes('"//default": false'))
    check('un decimal sigue siéndolo', out.includes('"dosDecimales": 3.0'))

    const plain = '{\n  "a": 1,\n  "b": [1, 2]\n}\n'
    const pdoc = parseEditable('json', plain)
    pdoc.apply([{ path: ['a'], value: '2' }, { path: ['b'], value: ['3'] }])
    check('un JSON normal sigue siendo válido', JSON.parse(pdoc.serialize()).b[0] === 3)
    check('rechaza un JSON roto con un mensaje claro', throws(() => parseEditable('json', '{"a": }'))?.includes('no es un JSON válido') === true)

    const props = '# Velocidad del viento\nwind=1.5\nenabled=true\n'
    const prop = parseEditable('properties', props)
    check('.properties: explicación y tipos', find(prop.config.options, 'wind')?.description === 'Velocidad del viento' && find(prop.config.options, 'enabled')?.type === 'boolean')
    prop.apply([{ path: ['enabled'], value: false }])
    check('.properties: cambia solo esa línea', prop.serialize() === '# Velocidad del viento\nwind=1.5\nenabled=false\n')

    check('formato por extensión', formatForFile('a.yml') === 'yaml' && formatForFile('b.json5') === 'json' && formatForFile('c.cfg') === null)
  })

  await section('Configuración de plugins y mods: en un servidor', async () => {
    const id = 'config-plugins'
    const root = serverDir(id)
    await mkdir(join(root, 'plugins', 'HardcoreUtility', 'userdata'), { recursive: true })

    // El jar real del plugin oficial: su plugin.yml dice cómo se llama.
    const hardcore = OFFICIAL_PLUGINS.find((p) => p.id === 'hardcore-utility')!
    const bundled = join(process.cwd(), 'resources/minecraft/plugins/hardcore-utility')
    const { jarFileName } = JSON.parse(await readFile(join(bundled, 'plugin.json'), 'utf8')) as {
      jarFileName: string
    }
    await copyFile(join(bundled, jarFileName), join(root, 'plugins', jarFileName))
    const identity = await identifyJar(join(root, 'plugins', jarFileName), jarFileName)
    check('lee el nombre del plugin dentro del jar', identity.ids[0] === hardcore.configFolder, `${identity.name} -> ${identity.ids.join(',')}`)

    await copyFile(join(bundled, 'config.yml'), join(root, 'plugins', 'HardcoreUtility', 'config.yml'))
    await writeFile(join(root, 'plugins', 'HardcoreUtility', 'userdata', 'jugador.yml'), 'x: 1\n')
    const info = await listConfigFiles(id, 'paper', jarFileName)
    check('encuentra su config.yml', info.files[0]?.path === 'plugins/HardcoreUtility/config.yml', info.files.map((f) => f.path).join(', '))
    check('no enseña los datos de jugadores', !info.files.some((f) => f.path.includes('userdata')))

    const path = info.files[0]!.path
    const before = await readFile(join(root, path), 'utf8')
    const opened = await readConfig(id, path)
    const saved = await writeConfig(id, path, opened.hash, [{ path: ['game', 'api-port'], value: '25590' }])
    const after = await readFile(join(root, path), 'utf8')
    check('guarda el cambio', /api-port: 25590/.test(after))
    check('y solo ese', saved.written === 1 && before.split('\n').length === after.split('\n').length)
    check('deja una copia de cómo estaba', (await readFile(join(root, `${path}.bak`), 'utf8')) === before)
    check(
      'no guarda encima si el fichero ha cambiado entre medias',
      (await writeConfig(id, path, opened.hash, [{ path: ['game', 'api-port'], value: '1' }]).catch((e: Error) => e.message))
        .toString()
        .includes('ha cambiado')
    )

    // Un mod de mentira empaquetado con el tar de Windows, que hace zips de
    // verdad (comprimidos con deflate, como los jars).
    const staging = join(root, '..', 'jar')
    await mkdir(join(staging, 'META-INF'), { recursive: true })
    await writeFile(
      join(staging, 'META-INF', 'mods.toml'),
      '[[mods]]\nmodId="qubiqtest"\ndisplayName="QubiQ Test"\n[[dependencies.qubiqtest]]\nmodId="forge"\n'
    )
    await mkdir(join(root, 'mods'), { recursive: true })
    const zip = join(staging, '..', 'qubiqtest.zip')
    await execFileAsync(systemTarPath(), ['-a', '-c', '-f', zip, '-C', staging, 'META-INF/mods.toml'])
    await rename(zip, join(root, 'mods', 'qubiqtest-1.0.jar'))

    await mkdir(join(root, 'config', 'qubiqtest'), { recursive: true })
    await mkdir(join(root, 'mundo', 'serverconfig'), { recursive: true })
    await writeFile(join(root, 'server.properties'), 'level-name=mundo\n')
    await writeFile(join(root, 'config', 'qubiqtest-common.toml'), 'a = 1\n')
    await writeFile(join(root, 'config', 'qubiqtest-client.toml'), 'b = 1\n')
    await writeFile(join(root, 'config', 'qubiqtestextra-common.toml'), 'c = 1\n')
    await writeFile(join(root, 'config', 'qubiqtest', 'mas.json5'), '{ d: 1 }\n')
    await writeFile(join(root, 'mundo', 'serverconfig', 'qubiqtest-server.toml'), 'e = 1\n')

    const mod = await listConfigFiles(id, 'forge', 'qubiqtest-1.0.jar')
    const paths = mod.files.map((f) => f.path)
    check('lee el mods.toml del jar', mod.name === 'QubiQ Test')
    check('encuentra sus ficheros y su carpeta', paths.includes('config/qubiqtest-common.toml') && paths.includes('config/qubiqtest/mas.json5'), paths.join(', '))
    check('y el del mundo activo', paths.includes('mundo/serverconfig/qubiqtest-server.toml'))
    check('no se lleva los de otro mod con nombre parecido', !paths.some((p) => p.includes('qubiqtestextra')))
    check('esconde los de cliente y lo dice', !paths.some((p) => p.includes('client')) && mod.hiddenClientFiles === 1)

    // La ruta viene de la interfaz: no puede salirse de donde viven las
    // configuraciones de plugins y mods.
    check('no deja salir de la carpeta', throws(() => resolveConfigPath(id, 'plugins/../../manifest.json')) !== null)
    check('ni ir a otra', throws(() => resolveConfigPath(id, 'server.properties')) !== null)
    check('ni con una ruta absoluta', throws(() => resolveConfigPath(id, 'C:/Windows/win.ini')) !== null)
    check('la carpeta config sola solo se deja abrir', throws(() => resolveConfigPath(id, 'config')) !== null && throws(() => resolveConfigPath(id, 'config', { folder: true })) === null)
    check('pero sí el serverconfig de un mundo', throws(() => resolveConfigPath(id, 'mundo/serverconfig/qubiqtest-server.toml')) === null)
  })
}
