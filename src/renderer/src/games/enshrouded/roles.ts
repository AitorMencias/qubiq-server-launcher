import { DEFAULT_ROLES, type EnshroudedRole } from '@shared/games/enshrouded/types'

/**
 * Los cuatro roles de serie con las contraseñas que elija el usuario.
 *
 * Los permisos son los que trae el propio servidor: no se inventan. Lo único
 * que se decide desde la app es la contraseña de cada uno, que es lo que de
 * verdad reparte el poder en este juego.
 *
 * **Los cuatro nacen con contraseña**, también los que el asistente no
 * pregunta. Un rol sin contraseña es al que va a parar quien entre sin escribir
 * ninguna, y como Enshrouded se anuncia siempre en su lista pública, eso sería
 * dejar el servidor abierto a quien pase por ahí. Quien quiera un rol abierto
 * puede vaciar su contraseña en Configuración → Roles, sabiendo lo que hace.
 */
export function rolesFor(adminPassword: string, friendPassword: string): EnshroudedRole[] {
  return DEFAULT_ROLES.map((role) => ({
    ...role,
    password:
      role.name === 'Admin'
        ? adminPassword
        : role.name === 'Friend'
          ? friendPassword
          : `${role.name.toLowerCase()}-${randomTail()}`
  }))
}

function randomTail(): string {
  const alfabeto = 'abcdefghijkmnpqrstuvwxyz23456789'
  let salida = ''
  for (let i = 0; i < 8; i++) salida += alfabeto[Math.floor(Math.random() * alfabeto.length)]
  return salida
}
