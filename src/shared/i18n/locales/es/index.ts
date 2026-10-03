import { shell } from './shell'
import { games } from './games'
import { panel } from './panel'
import { minecraft } from './minecraft'
import { satisfactory } from './satisfactory'
import { valheim } from './valheim'
import { factorio } from './factorio'
import { zomboid } from './zomboid'
import { enshrouded } from './enshrouded'
import { rust } from './rust'
import { remote } from './remote'

/**
 * El español, idioma de referencia. Cada zona de la app tiene su fichero para
 * que los diccionarios se puedan revisar por partes; aquí se juntan.
 */
export const es = {
  ...shell,
  ...games,
  ...panel,
  ...minecraft,
  ...satisfactory,
  ...valheim,
  ...factorio,
  ...zomboid,
  ...enshrouded,
  ...rust,
  ...remote
}

export type MessageKey = keyof typeof es
