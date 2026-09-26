/**
 * Una casilla con su explicación debajo.
 *
 * Es el patrón de la casa (`label.row` con la casilla y un `span` con el texto),
 * pero tiene tres detalles que hay que poner a mano o la fila sale descuadrada,
 * y se aprendieron descuadrándola:
 *
 * 1. **La casilla necesita tamaño y `flexShrink: 0`.** Un `input` hereda el
 *    `width: 100%` de los campos, así que dentro de un flex se estira y empuja
 *    el texto al otro extremo de la tarjeta.
 * 2. **La explicación va en un `div`, no en un `span`.** `label.row .help` da el
 *    tamaño y el color, pero no el salto de línea: en línea se pega al nombre
 *    de la opción («Construir en las basesLevantar, quitar…»).
 * 3. **Y sin margen**, que el de serie de `.help` la separa de más.
 *
 * La estrenó Enshrouded, que tiene casillas en cuatro pantallas; Rust la usa en
 * sus ajustes y en el borrado, así que vive con las piezas comunes.
 */

interface Props {
  label: string
  help?: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}

export function CheckRow({ label, help, checked, disabled, onChange }: Props): React.JSX.Element {
  return (
    <label className="row" style={{ cursor: disabled ? 'default' : 'pointer', marginBottom: 10 }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 16, height: 16, flexShrink: 0 }}
      />
      <span>
        <strong>{label}</strong>
        {help && (
          <div className="help" style={{ margin: 0 }}>
            {help}
          </div>
        )}
      </span>
    </label>
  )
}
