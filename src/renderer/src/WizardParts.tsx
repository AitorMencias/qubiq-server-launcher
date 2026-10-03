import { STEAM_AGREEMENT } from '@shared/games'
import { Rich, t } from './i18n'
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
        {current >= total ? t('wizard.allSet') : t('wizard.step', { n: current + 1, total })}
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
          {t('wizard.change')}
        </button>
      ) : (
        <span className="summary-auto">{autoNote ?? ''}</span>
      )}
    </div>
  )
}

interface SteamAgreementProps {
  agreed: boolean
  onChange: (agreed: boolean) => void
  /** En el asistente básico va al final del resumen, alineada a la izquierda. */
  basic?: boolean
  /** Para cuando el juego no se baja de forma anónima (Factorio). */
  hint?: string
  /** Los asistentes avanzados numeran sus tarjetas: «5. Condiciones». */
  number?: number
}

/**
 * Las condiciones de Steam, al final del asistente de cada juego de Steam.
 * Eran el mismo bloque copiado en doce asistentes; así se traduce una vez.
 */
export function SteamAgreement({
  agreed,
  onChange,
  basic,
  hint,
  number
}: SteamAgreementProps): React.JSX.Element {
  return (
    <div className="card" style={basic ? { textAlign: 'left', marginBottom: 0 } : undefined}>
      <h3>
        {number !== undefined && `${number}. `}
        {t('wizard.steam.title')}
      </h3>
      <p className="hint">{hint ?? (basic ? t('wizard.steam.hintBasic') : t('wizard.steam.hint'))}</p>
      <label className="row" style={{ cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => onChange(e.target.checked)}
          style={{ width: 16, height: 16, flexShrink: 0 }}
        />
        <span>
          <Rich
            k="wizard.steam.accept"
            values={{
              link: (
                <a
                  href={STEAM_AGREEMENT.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--accent)' }}
                >
                  {t('wizard.steam.link')}
                </a>
              )
            }}
          />
        </span>
      </label>
    </div>
  )
}
