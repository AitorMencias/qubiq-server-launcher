/**
 * Mods con cargador y catálogo, compartidos entre el núcleo y la interfaz.
 *
 * Satisfactory y Valheim se amplían de la misma forma, aunque con piezas
 * distintas: hace falta **un cargador** que el juego base no trae (SML en
 * Satisfactory, BepInEx en Valheim) y los mods se sacan de **un catálogo** con
 * buscador (ficsit.app y Thunderstore). En los dos, cada mod es un paquete que
 * se descomprime dentro de la carpeta del servidor y que puede arrastrar otros.
 *
 * Project Zomboid y Factorio no usan esto: el primero baja del taller de Steam
 * con SteamCMD y el segundo tiene portal propio con credenciales, y ninguno de
 * los dos necesita cargador. Lo que se comparte aquí es solo lo que de verdad
 * es igual, no un molde al que obligar a los cuatro.
 *
 * No debe importar nada de Node ni de Electron.
 */

/** El cargador que hace falta para que el servidor mire siquiera los mods. */
export interface ModLoaderInfo {
  /** Cómo se llama, para poder nombrarlo en pantalla («SML», «BepInEx»). */
  name: string
  /** Si ya está puesto en este servidor. */
  installed: boolean
  /** La versión instalada, cuando se sabe. */
  version: string | null
  /** La última publicada, si es distinta de la instalada. */
  update?: string
  /**
   * Por qué el cargador no va a funcionar ahora mismo, dicho para el usuario.
   *
   * Lo estrena Oxide en Rust: cada actualización del juego lo quita, y hasta
   * que sale la Oxide de ese mes el servidor arranca sin plugins.
   */
  problem?: string
  /**
   * Qué hizo el cargador la última vez que arrancó el servidor.
   *
   * Lo aporta el juego cuyo cargador **no cuenta esto por la consola**: BepInEx
   * escribe la lista de mods cargados solo en su propio registro, así que sin
   * leerlo no habría forma de saber si un mod se quedó fuera. SML sí lo dice
   * por la consola y no lo necesita.
   */
  lastRun?: {
    loaded: string[]
    /** Lo que falló, ya traducido. */
    problems: string[]
  }
}

/**
 * Un mod del catálogo, tal como sale en el buscador.
 *
 * `id` es el identificador con el que se vuelve a pedir: el `mod_reference` de
 * ficsit («DirectToSplitter») o el nombre completo de Thunderstore
 * («Advize-PlantEverything»). Es lo único que hay que guardar para reinstalarlo.
 */
export interface ModCatalogItem {
  id: string
  name: string
  author: string
  summary: string
  downloads: number
  version: string | null
  iconUrl?: string
  /**
   * false cuando el mod **no tiene nada que poner en un servidor**: en
   * Satisfactory, porque solo publica versión de cliente; en Valheim, porque
   * está marcado como mod de cliente. Instalarlo no haría nada, así que la
   * pantalla lo dice en vez de dejar pulsar un botón que no sirve.
   */
  forServer: boolean
  /** Por qué no sirve para el servidor, cuando `forServer` es false. */
  clientOnlyReason?: string
}

/**
 * Un mod instalado, tal como se guarda en el manifiesto.
 *
 * `paths` es lo que dejó dentro de la carpeta del servidor, en rutas relativas
 * a ella. Sin eso no se sabría qué borrar al quitarlo ni qué apartar al
 * apagarlo: los dos juegos reparten los ficheros de un mod por varias carpetas.
 */
export interface ModRef {
  id: string
  name: string
  version: string
  /** Apagado sigue en disco, pero fuera de donde el servidor lo busca. */
  enabled: boolean
  /**
   * true si entró porque otro mod lo necesitaba, no porque se pidiera.
   *
   * Se distingue para poder decirlo en pantalla («lo necesita Refined Power»)
   * y para no dejar tirado un mod que ya no necesita nadie.
   */
  dependency: boolean
  paths: string[]
  addedAt: string
}

/** Un mod instalado con lo que solo se sabe mirando el disco y el catálogo. */
export interface ModEntry extends ModRef {
  sizeBytes: number
  /** Versión más nueva publicada, si la instalada se ha quedado atrás. */
  update?: string
  /** Por qué este mod no va a funcionar, dicho para el usuario. */
  problem?: string
}

/** Lo que la pestaña de mods necesita de una vez: el cargador y la lista. */
export interface ModsView {
  loader: ModLoaderInfo
  mods: ModEntry[]
}

/**
 * Lo que se instaló en una tacada: el mod pedido y lo que arrastró.
 *
 * Se devuelve para poder decir «se han instalado también Refined RD Lib y
 * ModularUI», que es la diferencia entre una lista que crece sola sin
 * explicación y una que se entiende.
 */
export interface ModInstallResult {
  view: ModsView
  /** Nombres de los mods que entraron como dependencia en esta instalación. */
  dependencies: string[]
}

/** Tamaño en MB o KB, para las pantallas de mods de los dos juegos. */
export function modSizeLabel(bytes: number): string {
  return bytes >= 1024 ** 2
    ? `${(bytes / 1024 ** 2).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}
