import {
  MIN_PASSWORD_LENGTH,
  PERMISSIONS,
  roleLabel,
  type EnshroudedRole
} from '@shared/games/enshrouded/types'
import { CheckRow } from './CheckRow'

/**
 * Los roles de un servidor de Enshrouded: contraseña y permisos de cada uno.
 *
 * Se usa igual en el asistente avanzado y en la pantalla de configuración, para
 * que un rol se edite siempre de la misma forma.
 *
 * Dos avisos que salen de lo que hace el propio servidor: un rol **sin**
 * contraseña es al que va a parar quien entre sin escribir ninguna (y solo
 * puede haber uno así), y dos roles con la misma contraseña **impiden que el
 * servidor arranque**. Lo segundo lo corta `roleProblems`; lo primero se
 * explica aquí, porque es una decisión legítima.
 */

interface Props {
  roles: EnshroudedRole[]
  onChange: (roles: EnshroudedRole[]) => void
  disabled?: boolean
}

export function RolesEditor({ roles, onChange, disabled }: Props): React.JSX.Element {
  function update(index: number, changes: Partial<EnshroudedRole>): void {
    onChange(roles.map((role, i) => (i === index ? { ...role, ...changes } : role)))
  }

  return (
    <>
      {roles.map((role, index) => (
        // Cada rol es un bloque de campos hermanos, no un campo dentro de otro:
        // `.field` no se anida en el resto de la app y anidarlo descuadra los
        // márgenes y duplica las etiquetas.
        <div key={role.name} className="role-block">
          <div className="field">
            <label>Contraseña de {roleLabel(role.name)}</label>
            <input
              type="text"
              value={role.password}
              maxLength={40}
              disabled={disabled}
              placeholder="Vacío = entra cualquiera con este rol"
              onChange={(e) => update(index, { password: e.target.value })}
            />
            <div className="help">
              {role.password.length === 0 ? (
                <>
                  Sin contraseña: quien entre sin escribir ninguna tendrá este rol. Como Enshrouded
                  sale siempre en su lista pública, eso es dejar el servidor abierto.
                </>
              ) : role.password.length < MIN_PASSWORD_LENGTH ? (
                <>Se queda corta: pon al menos {MIN_PASSWORD_LENGTH} caracteres.</>
              ) : (
                <>{permissionSummary(role)}</>
              )}
            </div>
          </div>

          {PERMISSIONS.map((permission) => (
            <CheckRow
              key={permission.key}
              label={permission.label}
              help={permission.help}
              checked={role[permission.key]}
              disabled={disabled}
              onChange={(on) => update(index, { [permission.key]: on })}
            />
          ))}

          <div className="field">
            <label>Plazas reservadas para {roleLabel(role.name)}</label>
            <input
              type="number"
              min={0}
              max={16}
              value={role.reservedSlots}
              disabled={disabled}
              onChange={(e) => update(index, { reservedSlots: Number(e.target.value) })}
            />
            <div className="help">
              Con una o más, el servidor aparece «lleno» para los demás roles antes de que se agoten
              las plazas, para que este rol siempre pueda entrar.
            </div>
          </div>
        </div>
      ))}
    </>
  )
}

/** Qué puede hacer este rol, en una frase. */
function permissionSummary(role: EnshroudedRole): string {
  const puede = PERMISSIONS.filter((p) => role[p.key]).map((p) => p.label.toLowerCase())
  if (puede.length === 0) return 'Solo puede entrar, pelear y recoger cosas del mundo.'
  return `Puede ${puede.join(', ')}.`
}
