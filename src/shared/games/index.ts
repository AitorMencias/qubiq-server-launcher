import type { AgreementId, GameId, InstanceManifest } from '../types'
import { formatSize, t } from '../i18n'
import { DISTRIBUTION_LABELS, contentKindFor } from './minecraft/types'
import {
  DEFAULT_GAME_PORT,
  MEMORY_MIN_GB,
  MEMORY_RECOMMENDED_GB,
  RELIABLE_PORT
} from './satisfactory/types'
import {
  DEFAULT_GAME_PORT as FACTORIO_DEFAULT_PORT,
  DEFAULT_MAX_PLAYERS as FACTORIO_MAX_PLAYERS,
  MEMORY_MIN_GB as FACTORIO_MEMORY_MIN_GB,
  MEMORY_RECOMMENDED_GB as FACTORIO_MEMORY_RECOMMENDED_GB
} from './factorio/types'
import {
  DEFAULT_GAME_PORT as ZOMBOID_DEFAULT_PORT,
  DEFAULT_MAX_PLAYERS as ZOMBOID_MAX_PLAYERS,
  MEMORY_MIN_GB as ZOMBOID_MEMORY_MIN_GB,
  MEMORY_RECOMMENDED_GB as ZOMBOID_MEMORY_RECOMMENDED_GB,
  presetInfo as zomboidPresetInfo,
  udpPortFor
} from './zomboid/types'
import {
  DEFAULT_QUERY_PORT as ENSHROUDED_DEFAULT_PORT,
  MAX_PLAYERS as ENSHROUDED_MAX_PLAYERS,
  MEMORY_MIN_GB as ENSHROUDED_MEMORY_MIN_GB,
  MEMORY_RECOMMENDED_GB as ENSHROUDED_MEMORY_RECOMMENDED_GB,
  presetInfo as enshroudedPresetInfo
} from './enshrouded/types'
import {
  DEFAULT_GAME_PORT as RUST_DEFAULT_PORT,
  MAX_PLAYERS as RUST_MAX_PLAYERS,
  MEMORY_MIN_GB as RUST_MEMORY_MIN_GB,
  MEMORY_RECOMMENDED_GB as RUST_MEMORY_RECOMMENDED_GB,
  queryPortFor as rustQueryPortFor,
  rustPlusPortFor,
  worldSizeInfo as rustWorldSizeInfo,
  worldSizeLabel as rustWorldSizeLabel
} from './rust/types'
import {
  DEFAULT_GAME_PORT as VALHEIM_DEFAULT_PORT,
  MAX_PLAYERS as VALHEIM_MAX_PLAYERS,
  MEMORY_MIN_GB as VALHEIM_MEMORY_MIN_GB,
  MEMORY_RECOMMENDED_GB as VALHEIM_MEMORY_RECOMMENDED_GB,
  queryPortFor
} from './valheim/types'

/**
 * Catálogo de juegos visible desde los dos lados (núcleo e interfaz).
 *
 * Solo datos: nombres, condiciones y capacidades. Cómo se instala o se para
 * cada juego vive en el núcleo (`main/core/games/<id>/adapter.ts`), que no
 * puede llegar al renderer.
 */

/**
 * Qué sabe hacer un servidor de un juego. Decide qué pestañas y controles
 * aparecen: un juego sin plugins no enseña la pestaña, igual que Vanilla no
 * enseña «Plugins».
 */
export interface GameCapabilities {
  /** Varios mundos en el mismo servidor (Minecraft: `level-name`). */
  worlds: boolean
  /** Plugins o mods que el usuario añade a mano. */
  content: boolean
  /** Plugins oficiales que viajan con la app. */
  officialPlugins: boolean
  /** Memoria asignable desde la app. */
  memory: boolean
  /** Ajustes del servidor editables con formulario. */
  settings: boolean
  /** Reinstalar el servidor desde la app. */
  reinstall: boolean
  /**
   * La app sabe qué versión es la última y puede cambiarla. No en un servidor
   * a medida de Minecraft: lo montó el usuario y su versión la decide su
   * modpack, no un catálogo.
   */
  versions: boolean
  /** Consola con entrada de comandos. */
  commands: boolean
  /**
   * El juego dice QUIÉN está conectado, aunque sea con un identificador en vez
   * de un nombre. Satisfactory solo da el número, así que su pantalla de
   * jugadores cuenta en vez de listar.
   */
  playerIds: boolean
  /**
   * Y además ese «quién» es un nombre que el usuario reconoce. Valheim solo da
   * el identificador de Steam: se puede listar y moderar, pero la pantalla
   * tiene que explicar qué es ese número en vez de hacerlo pasar por un nombre.
   */
  playerNames: boolean
  /**
   * Expulsar, banear o dar permisos desde la app. Cómo se hace es cosa de cada
   * juego (Minecraft por la consola, Valheim escribiendo en sus listas): lo
   * declara aquí y aporta los botones en `GameUi.playerActions`.
   */
  moderation: boolean
  /**
   * Se puede comprobar desde internet si se llega al servidor. Hace falta un
   * servicio de fuera que hable el protocolo del juego; Minecraft lo tiene y
   * Satisfactory no, y decirlo vale más que un botón que no prueba nada.
   */
  externalCheck: boolean
  /**
   * El juego trae su propia forma de jugar desde fuera sin abrir puertos
   * (Valheim: crossplay con código de 6 dígitos). Solo entonces se ofrece ese
   * modo de exposición, porque en los demás juegos no existe.
   */
  crossplay: boolean
}

export interface AgreementInfo {
  id: AgreementId
  /** Cómo se nombra en una frase: «Hay que aceptar {label}». */
  label: string
  url: string
}

/**
 * Lo que distingue a un juego de otro en la pantalla de elegir juego: no se
 * elige por el nombre, sino por cuánta gente entra, qué pide al equipo y qué
 * tiene de raro. Lo que cambia la decisión va a la vista, no escondido dentro
 * del asistente.
 */
export interface GameCard {
  /** Qué es el juego, en una frase. */
  tagline: string
  /** Cuánta gente aguanta: «Hasta 4». */
  players: string
  /** Memoria del equipo, en GB: mínima para que arranque y la cómoda. */
  memoryGb: { min: number; recommended: number }
  /** Lo que ocupa la descarga. */
  download: string
  /** true si el tamaño está medido instalándolo, no estimado. */
  downloadMeasured: boolean
  /** Lo que conviene saber antes de elegirlo. */
  highlights: { text: string; tone: 'neutral' | 'good' | 'warn' }[]
  /**
   * La guía de requisitos (revisión de la 0.10.0): lo que se compara entre
   * juegos en la tabla del selector. Todo medido en las fases de cada uno.
   */
  requirements: {
    /** Lo que tarda en quedar listo para entrar. */
    startup: string
    /** Qué hay que abrir para jugar desde fuera, con los puertos de serie. */
    ports: string
    /** Lo que pide además, si pide algo. */
    extra?: string
  }
}

export interface GameInfo {
  id: GameId
  name: string
  card: GameCard
  agreements: AgreementInfo[]
  /** Aviso de producto no oficial, exigido por las normas de marca de cada juego. */
  disclaimer: string
  /** Dónde se pone la dirección dentro del juego, dicho en una frase. */
  joinHint: string
  /**
   * Los pasos exactos para entrar, cuando no basta con «pega la dirección».
   *
   * Satisfactory rechaza la conexión directa por IP: el cliente necesita un
   * token que solo consigue añadiendo el servidor por el menú del juego, y si
   * no, el error que da (**Encryption token missing**) no dice qué hacer.
   */
  joinSteps?: string[]
  /**
   * Los pasos cuando se entra por el crossplay del juego, que no son los
   * mismos: no hay dirección que pegar, sino un código que escribir. Solo
   * tienen sentido en los juegos con la capacidad `crossplay`.
   */
  joinStepsCrossplay?: string[]
  /** El fallo típico al entrar mal, dicho antes de que ocurra. */
  joinWarning?: string
  /** Ejemplo de dirección que da playit.gg para este juego, para reconocerla. */
  tunnelAddressExample: string
  /**
   * Qué se guarda: el mundo en Minecraft y Valheim, la partida en Satisfactory.
   * Los textos comunes eligen con esto su variante en vez de decir «mundo» a fuego.
   */
  save: SaveKind
  /** Qué entra en una copia de seguridad, en una o dos frases. */
  backupScope: string
  /**
   * Qué se puede moderar y dónde, en los juegos que no dan los nombres de
   * quien está dentro. Lo dice la pantalla de jugadores en vez de enseñar
   * botones que no funcionarían; cambia mucho de un juego a otro (Satisfactory
   * no deja nada desde fuera, Valheim deja listas pero no expulsar en caliente).
   */
  moderationHint?: string
}

/**
 * Qué es lo que se guarda en un juego: el mundo (Minecraft, Valheim,
 * Enshrouded), la partida (Satisfactory, Factorio, Zomboid) o el mapa (Rust).
 *
 * Antes era el sustantivo en español con su género, para montar «el mundo» o
 * «la partida» dentro de las frases. Eso no se traduce: en ruso cambia el caso,
 * en alemán el artículo, en japonés no hay. Ahora cada frase que lo menciona
 * tiene una variante por tipo (`…world`, `…game`, `…map`) en los diccionarios.
 */
export type SaveKind = 'world' | 'game' | 'map'

/** Las comunes a todos los juegos de Steam: el servidor se baja de forma anónima. */
export const STEAM_AGREEMENT: AgreementInfo = {
  id: 'steam-subscriber',
  get label() {
    return t('games.agreement.steam')
  },
  url: 'https://store.steampowered.com/subscriber_agreement/'
}

/** Ejemplo de dirección de playit.gg: «algo.joinmc.link», con «algo» traducido. */
function tunnelExample(domain: string): string {
  return `${t('games.tunnelExampleHost')}.${domain}`
}

/*
 * Los textos son getters: se traducen al leerlos, en el idioma de ese momento.
 * Así quien usa `gameInfo(...)` no cambia, y cambiar de idioma no deja nada
 * atrás. El aviso de Minecraft no se traduce: sus normas de marca exigen ese
 * texto literal (ANALISIS.md §13.1).
 */
export const GAMES: Record<GameId, GameInfo> = {
  minecraft: {
    id: 'minecraft',
    name: 'Minecraft',
    card: {
      get tagline() {
        return t('games.minecraft.tagline')
      },
      get players() {
        return t('games.minecraft.players')
      },
      memoryGb: { min: 2, recommended: 4 },
      get download() {
        return t('games.minecraft.download')
      },
      downloadMeasured: false,
      get highlights() {
        return [{ text: t('games.minecraft.highlight1'), tone: 'neutral' as const }]
      },
      requirements: {
        get startup() {
          return t('games.minecraft.startup')
        },
        get ports() {
          return t('games.minecraft.ports')
        },
        get extra() {
          return t('games.minecraft.extra')
        }
      }
    },
    agreements: [
      {
        id: 'minecraft-eula',
        get label() {
          return t('games.agreement.minecraft')
        },
        url: 'https://aka.ms/MinecraftEULA'
      }
    ],
    disclaimer:
      'NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.',
    get joinHint() {
      return t('games.minecraft.joinHint')
    },
    get tunnelAddressExample() {
      return tunnelExample('joinmc.link')
    },
    save: 'world',
    get backupScope() {
      return t('games.minecraft.backupScope')
    }
  },

  satisfactory: {
    id: 'satisfactory',
    name: 'Satisfactory',
    card: {
      get tagline() {
        return t('games.satisfactory.tagline')
      },
      get players() {
        return t('games.satisfactory.players')
      },
      memoryGb: { min: MEMORY_MIN_GB, recommended: MEMORY_RECOMMENDED_GB },
      get download() {
        return t('games.satisfactory.download')
      },
      downloadMeasured: true,
      get highlights() {
        return [
          { text: t('games.satisfactory.highlight1'), tone: 'good' as const },
          { text: t('games.satisfactory.highlight2'), tone: 'warn' as const }
        ]
      },
      requirements: {
        get startup() {
          return t('games.satisfactory.startup')
        },
        get ports() {
          return t('games.satisfactory.ports')
        }
      }
    },
    // El servidor se descarga de Steam de forma anónima: lo que se acepta es el
    // acuerdo de Steam, no un EULA del juego.
    agreements: [STEAM_AGREEMENT],
    get disclaimer() {
      return t('games.satisfactory.disclaimer')
    },
    get joinHint() {
      return t('games.satisfactory.joinHint')
    },
    get joinSteps() {
      return [
        t('games.satisfactory.join1'),
        t('games.satisfactory.join2'),
        t('games.satisfactory.join3'),
        t('games.satisfactory.join4')
      ]
    },
    get joinWarning() {
      return t('games.satisfactory.joinWarning')
    },
    get tunnelAddressExample() {
      return tunnelExample('gl.at.ply.gg')
    },
    save: 'game',
    get backupScope() {
      return t('games.satisfactory.backupScope')
    },
    get moderationHint() {
      return t('games.satisfactory.moderationHint')
    }
  },

  valheim: {
    id: 'valheim',
    name: 'Valheim',
    card: {
      get tagline() {
        return t('games.valheim.tagline')
      },
      get players() {
        return t('games.upTo', { n: VALHEIM_MAX_PLAYERS })
      },
      memoryGb: { min: VALHEIM_MEMORY_MIN_GB, recommended: VALHEIM_MEMORY_RECOMMENDED_GB },
      get download() {
        return t('games.valheim.download')
      },
      downloadMeasured: true,
      get highlights() {
        return [
          { text: t('games.valheim.highlight1'), tone: 'good' as const },
          { text: t('games.valheim.highlight2'), tone: 'good' as const },
          { text: t('games.valheim.highlight3'), tone: 'warn' as const }
        ]
      },
      requirements: {
        get startup() {
          return t('games.valheim.startup')
        },
        get ports() {
          return t('games.valheim.ports')
        }
      }
    },
    agreements: [STEAM_AGREEMENT],
    get disclaimer() {
      return t('games.valheim.disclaimer')
    },
    get joinHint() {
      return t('games.valheim.joinHint')
    },
    get joinSteps() {
      return [
        t('games.valheim.join1'),
        t('games.valheim.join2'),
        t('games.valheim.join3'),
        t('games.valheim.join4')
      ]
    },
    get joinStepsCrossplay() {
      return [
        t('games.valheim.join1'),
        t('games.valheim.crossplay2'),
        t('games.valheim.join3'),
        t('games.valheim.crossplay4')
      ]
    },
    get tunnelAddressExample() {
      return tunnelExample('gl.at.ply.gg')
    },
    save: 'world',
    get backupScope() {
      return t('games.valheim.backupScope')
    },
    get moderationHint() {
      return t('games.valheim.moderationHint')
    }
  },

  factorio: {
    id: 'factorio',
    name: 'Factorio',
    card: {
      get tagline() {
        return t('games.factorio.tagline')
      },
      get players() {
        return t('games.upToComfortably', { n: FACTORIO_MAX_PLAYERS })
      },
      memoryGb: { min: FACTORIO_MEMORY_MIN_GB, recommended: FACTORIO_MEMORY_RECOMMENDED_GB },
      // Medido en la fase 4: la descarga son 5 GB, pero el servidor se queda en
      // 246 MB porque no necesita ni imágenes ni sonidos.
      get download() {
        return `${formatSize(5, 'GB')} → ${formatSize(250, 'MB')}`
      },
      downloadMeasured: true,
      // Como en los demás juegos: primero lo bueno y el aviso al final.
      get highlights() {
        return [
          { text: t('games.factorio.highlight1'), tone: 'good' as const },
          { text: t('games.factorio.highlight2'), tone: 'neutral' as const },
          { text: t('games.factorio.highlight3'), tone: 'warn' as const }
        ]
      },
      requirements: {
        get startup() {
          return t('games.factorio.startup')
        },
        get ports() {
          return t('games.factorio.ports')
        },
        get extra() {
          return t('games.factorio.extra')
        }
      }
    },
    // El juego se descarga de Steam con la cuenta del usuario (no hay servidor
    // dedicado anónimo), así que lo que se acepta sigue siendo el acuerdo de Steam.
    agreements: [STEAM_AGREEMENT],
    get disclaimer() {
      return t('games.factorio.disclaimer')
    },
    get joinHint() {
      return t('games.factorio.joinHint')
    },
    get joinSteps() {
      return [
        t('games.factorio.join1'),
        t('games.factorio.join2'),
        t('games.factorio.join3'),
        t('games.factorio.join4')
      ]
    },
    get joinWarning() {
      return t('games.factorio.joinWarning')
    },
    get tunnelAddressExample() {
      return tunnelExample('gl.at.ply.gg')
    },
    save: 'game',
    get backupScope() {
      return t('games.factorio.backupScope')
    },
    get moderationHint() {
      return t('games.factorio.moderationHint')
    }
  },

  zomboid: {
    id: 'zomboid',
    name: 'Project Zomboid',
    card: {
      get tagline() {
        return t('games.zomboid.tagline')
      },
      get players() {
        return t('games.upToComfortably', { n: ZOMBOID_MAX_PLAYERS })
      },
      memoryGb: { min: ZOMBOID_MEMORY_MIN_GB, recommended: ZOMBOID_MEMORY_RECOMMENDED_GB },
      get download() {
        return t('games.zomboid.download')
      },
      downloadMeasured: true,
      get highlights() {
        return [
          { text: t('games.zomboid.highlight1'), tone: 'good' as const },
          { text: t('games.zomboid.highlight2'), tone: 'neutral' as const },
          { text: t('games.zomboid.highlight3'), tone: 'warn' as const }
        ]
      },
      requirements: {
        get startup() {
          return t('games.zomboid.startup')
        },
        get ports() {
          return t('games.zomboid.ports')
        }
      }
    },
    agreements: [STEAM_AGREEMENT],
    get disclaimer() {
      return t('games.zomboid.disclaimer')
    },
    get joinHint() {
      return t('games.zomboid.joinHint')
    },
    get joinSteps() {
      return [
        t('games.zomboid.join1'),
        t('games.zomboid.join2'),
        t('games.zomboid.join3'),
        t('games.zomboid.join4')
      ]
    },
    get joinWarning() {
      return t('games.zomboid.joinWarning')
    },
    get tunnelAddressExample() {
      return tunnelExample('gl.at.ply.gg')
    },
    save: 'game',
    get backupScope() {
      return t('games.zomboid.backupScope')
    },
    get moderationHint() {
      return t('games.zomboid.moderationHint')
    }
  },

  enshrouded: {
    id: 'enshrouded',
    name: 'Enshrouded',
    card: {
      get tagline() {
        return t('games.enshrouded.tagline')
      },
      get players() {
        return t('games.upTo', { n: ENSHROUDED_MAX_PLAYERS })
      },
      memoryGb: { min: ENSHROUDED_MEMORY_MIN_GB, recommended: ENSHROUDED_MEMORY_RECOMMENDED_GB },
      get download() {
        return t('games.enshrouded.download')
      },
      downloadMeasured: true,
      get highlights() {
        return [
          { text: t('games.enshrouded.highlight1'), tone: 'good' as const },
          { text: t('games.enshrouded.highlight2'), tone: 'neutral' as const },
          // Medido: no hay forma de apagarlo. Va el último, como en los demás,
          // pero es lo que más cambia la decisión de crearlo o no.
          { text: t('games.alwaysPublic'), tone: 'warn' as const }
        ]
      },
      requirements: {
        get startup() {
          return t('games.enshrouded.startup')
        },
        get ports() {
          return t('games.enshrouded.ports')
        },
        get extra() {
          return t('games.enshrouded.extra')
        }
      }
    },
    agreements: [STEAM_AGREEMENT],
    get disclaimer() {
      return t('games.enshrouded.disclaimer')
    },
    get joinHint() {
      return t('games.enshrouded.joinHint')
    },
    get joinSteps() {
      return [
        t('games.enshrouded.join1'),
        t('games.enshrouded.join2'),
        t('games.enshrouded.join3'),
        t('games.enshrouded.join4')
      ]
    },
    get joinWarning() {
      return t('games.enshrouded.joinWarning')
    },
    get tunnelAddressExample() {
      return tunnelExample('gl.at.ply.gg')
    },
    save: 'world',
    get backupScope() {
      return t('games.enshrouded.backupScope')
    },
    get moderationHint() {
      return t('games.enshrouded.moderationHint')
    }
  },

  rust: {
    id: 'rust',
    name: 'Rust',
    card: {
      get tagline() {
        return t('games.rust.tagline')
      },
      get players() {
        return t('games.rust.players', { n: RUST_MAX_PLAYERS })
      },
      memoryGb: { min: RUST_MEMORY_MIN_GB, recommended: RUST_MEMORY_RECOMMENDED_GB },
      get download() {
        return t('games.rust.download')
      },
      downloadMeasured: true,
      get highlights() {
        return [
          { text: t('games.rust.highlight1'), tone: 'good' as const },
          { text: t('games.rust.highlight2'), tone: 'neutral' as const },
          { text: t('games.rust.highlight3'), tone: 'warn' as const },
          // Medido: no hay ninguna variable para quedar fuera de la lista.
          { text: t('games.alwaysPublic'), tone: 'warn' as const }
        ]
      },
      requirements: {
        get startup() {
          return t('games.rust.startup')
        },
        get ports() {
          return t('games.rust.ports')
        },
        get extra() {
          return t('games.rust.extra')
        }
      }
    },
    agreements: [STEAM_AGREEMENT],
    get disclaimer() {
      return t('games.rust.disclaimer')
    },
    get joinHint() {
      return t('games.rust.joinHint')
    },
    get joinSteps() {
      return [
        t('games.rust.join1'),
        t('games.rust.join2'),
        t('games.rust.join3'),
        t('games.rust.join4')
      ]
    },
    get joinWarning() {
      return t('games.rust.joinWarning')
    },
    get tunnelAddressExample() {
      return tunnelExample('gl.at.ply.gg')
    },
    save: 'map',
    get backupScope() {
      return t('games.rust.backupScope')
    },
    get moderationHint() {
      return t('games.rust.moderationHint')
    }
  }
}

/** «Servidores de Minecraft» mientras sea el único juego; genérico después. */
export function appSubtitle(): string {
  return GAME_IDS.length === 1
    ? t('games.subtitleOne', { game: GAMES[GAME_IDS[0]!].name })
    : t('games.subtitle')
}

/**
 * Avisos de producto no oficial para la barra lateral.
 *
 * Con un solo juego se enseña el suyo. Con más, uno genérico, porque siete
 * avisos no los lee nadie; el de Minecraft se mantiene aparte y literal porque
 * sus normas de marca exigen ese texto exacto (ANALISIS.md §13.1).
 */
export function disclaimerLines(): string[] {
  if (GAME_IDS.length === 1) return [GAMES[GAME_IDS[0]!].disclaimer]
  return [GAMES.minecraft.disclaimer, t('games.disclaimerAll')]
}

/**
 * ¿Hay versión nueva del servidor? En los juegos de Steam es obligatorio
 * seguirla: un cliente actualizado no entra en un servidor viejo (en Rust,
 * además, cada mes).
 */
export interface UpdateCheck {
  available: boolean
  installed: string | null
  latest: string | null
}

/**
 * Una versión que se puede instalar en un servidor que ya existe.
 *
 * Unifica dos cosas que por dentro se parecen poco: en Minecraft es una versión
 * del juego (`26.2`), y en los juegos de Steam es una **rama** publicada por el
 * estudio (`public`, `experimental`, `default_preal`). Lo que tienen en común es
 * lo único que le importa a quien elige: cómo se llama, si es más nueva o más
 * vieja que la instalada, y si está terminada.
 */
export interface InstallableVersion {
  /** Con lo que se pide instalarla: versión de Minecraft o nombre de la rama. */
  id: string
  /** Cómo se enseña: «26.2», «Estable», «Anterior a Ashlands». */
  label: string
  /** Lo que dice el estudio de esa rama, cuando lo dice. */
  description?: string
  /** No terminada: build alpha de Paper, rama experimental de Steam. */
  experimental?: boolean
  /** La que la app propone si no hay motivo para otra cosa. */
  recommended?: boolean
  /** La que está instalada ahora mismo. */
  installed?: boolean
  /**
   * Respecto a la instalada. `unknown` cuando no se puede saber de verdad, que
   * vale más que adivinarlo: bajar de versión puede costar la partida.
   */
  relation: 'newer' | 'same' | 'older' | 'unknown'
}

export type PortProtocol = 'tcp' | 'udp' | 'tcp+udp'

/**
 * Un puerto que el servidor necesita accesible. Minecraft usa uno solo (TCP);
 * los juegos de Steam suelen usar varios, casi siempre UDP.
 */
export interface ServerPort {
  port: number
  protocol: PortProtocol
  /** Para qué es, si hay más de uno («Juego», «Consulta de Steam»). */
  label: string
  /** Tipo de túnel que hay que elegir en playit.gg. */
  tunnelType: string
}

export const PROTOCOL_LABELS: Record<PortProtocol, string> = {
  tcp: 'TCP',
  udp: 'UDP',
  get 'tcp+udp'() {
    return t('games.port.tcpUdp')
  }
}

/** Puertos que hay que abrir en el router (o tunelizar) para este servidor. */
export function serverPorts(manifest: InstanceManifest): ServerPort[] {
  switch (manifest.game) {
    case 'minecraft':
      return [{ port: manifest.port, protocol: 'tcp', label: t('games.port.game'), tunnelType: 'Minecraft Java' }]
    case 'satisfactory':
      // El de juego lleva las dos cosas: por UDP se juega y por TCP va la API
      // con la que la propia app configura el servidor. El de mensajería no
      // sigue al del juego: es siempre el 8888 (comprobado en la fase 2).
      return [
        {
          port: manifest.port,
          protocol: 'tcp+udp',
          label: t('games.port.game'),
          tunnelType: t('games.port.udpTcp')
        },
        { port: RELIABLE_PORT, protocol: 'tcp', label: t('games.port.messaging'), tunnelType: 'TCP' }
      ]
    case 'factorio':
      // Uno solo, y por UDP. El de RCON no se lista a propósito: la app lo abre
      // solo en 127.0.0.1 para poder parar y moderar el servidor, y abrirlo
      // fuera del equipo sería dar la consola remota a quien pase por ahí.
      return [{ port: manifest.port, protocol: 'udp', label: t('games.port.game'), tunnelType: 'UDP' }]
    case 'zomboid':
      // Medido con netstat: **sin Steam el servidor abre solo el de juego**. El
      // segundo (`UDPPort`) está en su configuración y en todas las guías, pero
      // solo llega a usarse con Steam encendido, así que solo entonces se pide
      // abrirlo. El de RCON no se lista nunca: es la consola de la app.
      return manifest.data.useSteam
        ? [
            { port: manifest.port, protocol: 'udp', label: t('games.port.game'), tunnelType: 'UDP' },
            {
              port: udpPortFor(manifest.port),
              protocol: 'udp',
              label: t('games.port.playerData'),
              tunnelType: 'UDP'
            }
          ]
        : [{ port: manifest.port, protocol: 'udp', label: t('games.port.game'), tunnelType: 'UDP' }]
    case 'enshrouded':
      // Uno solo, y por UDP. Desde el Content Update #2 no hay puerto de juego
      // aparte del de consulta, y el servidor no abre ningún otro: medido con
      // netstat en la fase 6.
      return [{ port: manifest.port, protocol: 'udp', label: t('games.port.game'), tunnelType: 'UDP' }]
    case 'rust': {
      // Medido con netstat: juego y consulta por UDP. La consola remota (el de
      // en medio, TCP) no se lista nunca: la app la abre solo en 127.0.0.1.
      // Rust+ solo si está encendido, que es cuando abre su puerto TCP.
      const ports: ServerPort[] = [
        { port: manifest.port, protocol: 'udp', label: t('games.port.game'), tunnelType: 'UDP' },
        {
          port: rustQueryPortFor(manifest.port),
          protocol: 'udp',
          label: t('games.port.steamQuery'),
          tunnelType: 'UDP'
        }
      ]
      if (manifest.data.rustPlus) {
        ports.push({
          port: rustPlusPortFor(manifest.port),
          protocol: 'tcp',
          label: t('games.port.rustPlus'),
          tunnelType: 'TCP'
        })
      }
      return ports
    }
    case 'valheim':
      // Todo por UDP, y el de consulta es siempre el siguiente al de juego.
      // Con crossplay no hace falta abrir ninguno, pero se siguen listando:
      // son los que el servidor usa, y quien elija abrir el router los necesita.
      return [
        { port: manifest.port, protocol: 'udp', label: t('games.port.game'), tunnelType: 'UDP' },
        {
          port: queryPortFor(manifest.port),
          protocol: 'udp',
          label: t('games.port.steamQuery'),
          tunnelType: 'UDP'
        }
      ]
  }
}

/** Todos los juegos disponibles, en el orden en que se ofrecen. */
export const GAME_IDS = Object.keys(GAMES) as GameId[]

/**
 * Condiciones que exige un juego. Vacío si el juego no está en el catálogo
 * compartido (p. ej. el juego falso de las pruebas, que solo existe en el núcleo).
 */
export function requiredAgreements(id: GameId | string): AgreementInfo[] {
  return (GAMES as Record<string, GameInfo | undefined>)[id]?.agreements ?? []
}

export function gameInfo(id: GameId): GameInfo {
  const info = GAMES[id]
  if (!info) throw new Error(`Juego desconocido: ${id}`)
  return info
}

/**
 * Capacidades de un servidor concreto. Dependen del manifiesto y no solo del
 * juego: en Minecraft, Vanilla no admite plugins pero Paper sí.
 */
export function capabilitiesFor(manifest: InstanceManifest): GameCapabilities {
  switch (manifest.game) {
    case 'minecraft': {
      const kind = contentKindFor(manifest.data.distribution)
      const custom = manifest.data.custom
      return {
        worlds: true,
        content: kind !== null,
        officialPlugins: kind === 'plugins',
        // En uno a medida, solo si la memoria no la fija su propio script.
        memory: custom ? custom.memory !== 'script' : true,
        settings: true,
        // Reinstalar uno a medida solo sirve para terminar de traerlo si se
        // quedó a medias; una vez traído no hay nada que la app sepa instalar.
        reinstall: custom ? custom.importFrom !== undefined : true,
        versions: !custom,
        commands: true,
        playerIds: true,
        playerNames: true,
        moderation: true,
        externalCheck: true,
        crossplay: false
      }
    }
    case 'satisfactory':
      // Las partidas tienen su propia pestaña (la aporta el juego), no son
      // «mundos» del núcleo. Y el servidor no lee órdenes por la consola: todo
      // lo que se puede mandar va por su API. Los mods sí los tiene: son los de
      // ficsit.app, con SML de cargador.
      return {
        worlds: false,
        content: true,
        officialPlugins: false,
        memory: false,
        settings: true,
        reinstall: true,
        versions: true,
        commands: false,
        playerIds: false,
        playerNames: false,
        moderation: false,
        externalCheck: false,
        crossplay: false
      }
    case 'factorio':
      // Las partidas y la moderación las aporta el juego con sus pestañas. Lo
      // que lo distingue de Valheim: aquí el registro SÍ dice el nombre de
      // quien entra y de quien habla ([JOIN] / [CHAT] / [LEAVE], comprobado con
      // un cliente real), y hay consola de comandos, aunque por dentro no sea
      // una consola sino RCON: el ejecutable no lee la entrada estándar.
      return {
        worlds: false,
        content: true,
        officialPlugins: false,
        memory: false,
        settings: true,
        reinstall: true,
        versions: true,
        commands: true,
        playerIds: true,
        playerNames: true,
        moderation: true,
        // No hay nadie fuera que sepa hablar el protocolo de Factorio salvo su
        // propia lista pública, y salir en ella exige publicar la IP del
        // usuario. Sin eso, un botón de «comprobar desde internet» mentiría.
        externalCheck: false,
        crossplay: false
      }
    case 'zomboid':
      // El más parecido a Minecraft: consola de verdad (la lee por su entrada
      // estándar), RCON, nombres de jugador, moderación completa y mods del
      // taller de Steam. Lo único que no tiene son mundos intercambiables.
      return {
        worlds: false,
        content: true,
        officialPlugins: false,
        memory: true,
        settings: true,
        reinstall: true,
        versions: true,
        commands: true,
        playerIds: true,
        playerNames: true,
        moderation: true,
        // Sin Steam el servidor no contesta a nadie de fuera, y con Steam la
        // única comprobación honesta exigiría publicar la IP del usuario.
        externalCheck: false,
        crossplay: false
      }
    case 'enshrouded':
      // Se parece a Valheim: ni consola ni RCON, todo por su fichero JSON y la
      // consulta de Steam. Dos diferencias medidas: aquí el servidor **no
      // puede echar a nadie** («Dedicated server kick not implemented», en su
      // propio ejecutable), así que lo único que se modera desde fuera es
      // quitar vetos; y la consulta de Steam contesta siempre, porque no hay
      // forma de no publicarse. Los mods son los de Shroudtopia.
      return {
        worlds: false,
        content: true,
        officialPlugins: false,
        memory: false,
        settings: true,
        reinstall: true,
        versions: true,
        commands: false,
        // El servidor dice cuántos hay por la consulta de Steam, pero no
        // quiénes: no se ha visto un nombre llegar nunca. Se cuenta, como en
        // Satisfactory, en vez de listar a nadie con un número inventado.
        playerIds: false,
        playerNames: false,
        // Quitar un veto es moderar de verdad, y es lo único que hay.
        moderation: true,
        externalCheck: true,
        crossplay: false
      }
    case 'rust':
      // El que más se parece a Zomboid en lo que se puede hacer: consola (por
      // WebRCON, no por la entrada estándar, que no la lee), nombres de quien
      // está dentro con su identificador de Steam, y moderación completa en
      // caliente. Los plugins son los de Oxide, con el catálogo de uMod.
      return {
        worlds: false,
        content: true,
        officialPlugins: false,
        memory: false,
        settings: true,
        reinstall: true,
        versions: true,
        commands: true,
        playerIds: true,
        playerNames: true,
        moderation: true,
        // Se anuncia siempre, así que Steam sabe si está en la lista.
        externalCheck: true,
        crossplay: false
      }
    case 'valheim':
      // Los mundos y la moderación los aporta el juego con sus propias pestañas
      // (las listas son ficheros de texto, no comandos). El servidor no lee
      // órdenes por la consola y solo dice el SteamID de quien entra, no su
      // nombre, así que ni `commands` ni `playerNames`. Los mods son los de
      // Thunderstore, con BepInEx de cargador.
      return {
        worlds: false,
        content: true,
        officialPlugins: false,
        memory: false,
        settings: true,
        reinstall: true,
        versions: true,
        commands: false,
        // El registro dice QUIÉN entra, pero con su identificador de Steam, no
        // con el nombre de su personaje. Se puede listar y moderar; lo que hay
        // que explicar es qué es ese número.
        playerIds: true,
        playerNames: false,
        moderation: true,
        externalCheck: true,
        crossplay: true
      }
  }
}

/** «Minecraft 26.2»: la versión que tienen que usar los jugadores para entrar. */
export function versionLabel(manifest: InstanceManifest): string {
  switch (manifest.game) {
    case 'minecraft':
      return `Minecraft ${manifest.data.minecraftVersion}`
    case 'satisfactory':
      // El servidor siempre está en la última versión publicada en Steam, así
      // que lo que importa no es cuál es, sino tener el juego al día.
      return manifest.data.gameVersion
        ? `Satisfactory ${manifest.data.gameVersion}`
        : 'Satisfactory'
    case 'valheim':
      return manifest.data.gameVersion ? `Valheim ${manifest.data.gameVersion}` : 'Valheim'
    case 'enshrouded':
      return manifest.data.gameVersion
        ? `Enshrouded ${manifest.data.gameVersion}`
        : 'Enshrouded'
    case 'zomboid':
      return manifest.data.gameVersion
        ? `Project Zomboid ${manifest.data.gameVersion}`
        : 'Project Zomboid'
    case 'rust':
      // La versión de red («2633»), que es la que tiene que coincidir con la
      // del juego de quien entra.
      return manifest.data.gameVersion ? `Rust ${manifest.data.gameVersion}` : 'Rust'
    case 'factorio':
      // En Factorio la versión no es un detalle: el cliente tiene que ir en la
      // misma, así que se enseña siempre que se sepa.
      return manifest.data.gameVersion ? `Factorio ${manifest.data.gameVersion}` : 'Factorio'
  }
}

/** Una línea corta para la lista de servidores: «Plugins (Bukkit/Spigot) · 26.2». */
export function summaryLabel(manifest: InstanceManifest): string {
  switch (manifest.game) {
    case 'minecraft': {
      const { data } = manifest
      const base = `${DISTRIBUTION_LABELS[data.distribution].name} · ${data.minecraftVersion}`
      return data.custom ? `${base} · ${t('games.summary.custom')}` : base
    }
    case 'satisfactory':
      return `Satisfactory · ${manifest.data.sessionName}`
    case 'valheim':
      return `Valheim · ${manifest.data.worldName}`
    case 'enshrouded':
      return `Enshrouded · ${enshroudedPresetInfo(manifest.data.preset).label}`
    case 'zomboid':
      return `Project Zomboid · ${zomboidPresetInfo(manifest.data.preset).name}`
    case 'rust':
      return `Rust · ${t('games.summary.rustMap', { size: rustWorldSizeLabel(manifest.data.worldSize) })}`
    case 'factorio':
      return manifest.data.spaceAge
        ? `Factorio · ${manifest.data.saveName} · Space Age`
        : `Factorio · ${manifest.data.saveName}`
  }
}

/**
 * Memoria que va a usar este servidor en marcha, en GB, según cómo está
 * configurado y no solo según el juego.
 *
 * Es lo que se suma para avisar antes de arrancar un servidor más con otros ya
 * en marcha (§ revisión de la 0.10.0): el equipo es el mismo para todos. En los
 * juegos con la memoria a mano (Minecraft, Zomboid) es la que tienen puesta; en
 * Rust, la medida para su tamaño de mapa; en el resto, la mínima de su tarjeta.
 */
export function memoryNeedGb(manifest: InstanceManifest): number {
  switch (manifest.game) {
    case 'minecraft':
      return manifest.data.memoryMb / 1024
    case 'zomboid':
      return manifest.data.memoryMb / 1024
    case 'rust':
      return rustWorldSizeInfo(manifest.data.worldSize)?.memoryGb ?? RUST_MEMORY_RECOMMENDED_GB
    default:
      return GAMES[manifest.game].card.memoryGb.min
  }
}

/** Puerto que propone el asistente para un juego cuando el usuario no elige. */
export function defaultPortFor(game: GameId): number {
  switch (game) {
    case 'minecraft':
      return 25565
    case 'satisfactory':
      return DEFAULT_GAME_PORT
    case 'valheim':
      return VALHEIM_DEFAULT_PORT
    case 'factorio':
      return FACTORIO_DEFAULT_PORT
    case 'zomboid':
      return ZOMBOID_DEFAULT_PORT
    case 'enshrouded':
      return ENSHROUDED_DEFAULT_PORT
    case 'rust':
      return RUST_DEFAULT_PORT
  }
}
