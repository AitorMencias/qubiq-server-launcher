/**
 * Piezas comunes del asistente en modo básico.
 *
 * Las estrenó Minecraft y a partir de la fase 2 las comparten todos los juegos:
 * una pregunta por pantalla, opciones como tarjetas con su explicación, puntos
 * de progreso y un resumen editable. Que sean las mismas piezas es lo que hace
 * que crear un servidor se sienta igual sea del juego que sea.
 */

export interface Option<T extends string> {
  value: T
  title: string
  sub: string
}

export function labelOf<T extends string>(options: Option<T>[], value: T): string {
  return options.find((o) => o.value === value)?.title ?? value
}

interface ChoicesProps<T extends string> {
  options: Option<T>[]
  value: T
  onChange: (value: T) => void
  columns?: 1 | 2
}

export function Choices<T extends string>({
  options,
  value,
  onChange,
  columns = 2
}: ChoicesProps<T>): React.JSX.Element {
  return (
    <div className="choice-grid" style={columns === 1 ? { gridTemplateColumns: '1fr' } : undefined}>
      {options.map((option) => (
        <button
          key={option.value}
          className={`choice ${value === option.value ? 'selected' : ''}`}
          onClick={() => onChange(option.value)}
        >
          <div className="title">{option.title}</div>
          <div className="sub">{option.sub}</div>
        </button>
      ))}
    </div>
  )
}

export function StepDots({
  total,
  current
}: {
  total: number
  current: number
}): React.JSX.Element {
  return (
    <div className="step-dots">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`step-dot ${i < current ? 'done' : i === current ? 'now' : ''}`} />
      ))}
      <span className="step-label">
        {current >= total ? 'Todo listo' : `Paso ${current + 1} de ${total}`}
      </span>
    </div>
  )
}

interface StepFrameProps {
  title: string
  help: string
  children: React.ReactNode
}

export function StepFrame({ title, help, children }: StepFrameProps): React.JSX.Element {
  return (
    <div className="step-frame">
      <h2>{title}</h2>
      <p className="step-help">{help}</p>
      {children}
    </div>
  )
}

interface SummaryRowProps {
  label: string
  value: string
  onEdit?: () => void
  /** Por qué no se puede cambiar aquí, cuando no se puede. */
  autoNote?: string
  last?: boolean
}

export function SummaryRow({
  label,
  value,
  onEdit,
  autoNote,
  last
}: SummaryRowProps): React.JSX.Element {
  return (
    <div className={`summary-row ${last ? 'last' : ''}`}>
      <span className="summary-label">{label}</span>
      <span className="summary-value">{value}</span>
      {onEdit ? (
        <button className="link" onClick={onEdit}>
          cambiar
        </button>
      ) : (
        <span className="summary-auto">{autoNote ?? ''}</span>
      )}
    </div>
  )
}
