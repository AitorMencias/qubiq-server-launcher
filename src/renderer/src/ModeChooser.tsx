import type { UiMode } from '@shared/types'
import { t } from './i18n'

/**
 * Elección de modo al crear un servidor.
 *
 * Se pregunta ANTES del asistente y no dentro, porque no es un ajuste más: es
 * qué tipo de conversación va a tener la app contigo. Poner esto como un
 * desplegable escondido dejaría a quien no sabe del tema en el formulario
 * completo, que es justo lo que queremos evitar (§3).
 */

interface Props {
  current: UiMode
  onChoose: (mode: UiMode) => void
  onCancel: () => void
}

interface ModeCard {
  mode: UiMode
  title: string
  tagline: string
  points: string[]
  cta: string
  recommended?: boolean
}

/** Se construye al pintar: con los textos en una constante no cambiarían de idioma. */
function modeCards(): ModeCard[] {
  return [
    {
      mode: 'basic',
      title: t('mode.basic'),
      tagline: t('mode.basic.tagline'),
      points: [t('mode.basic.point1'), t('mode.basic.point2'), t('mode.basic.point3')],
      cta: t('mode.basic.cta'),
      recommended: true
    },
    {
      mode: 'advanced',
      title: t('mode.advanced'),
      tagline: t('mode.advanced.tagline'),
      points: [t('mode.advanced.point1'), t('mode.advanced.point2'), t('mode.advanced.point3')],
      cta: t('mode.advanced.cta')
    }
  ]
}

export function ModeChooser({ current, onChoose, onCancel }: Props): React.JSX.Element {
  return (
    <div className="panel">
      <div className="chooser-intro">
        <h2>{t('mode.chooser.title')}</h2>
        <p>{t('mode.chooser.text')}</p>
      </div>

      <div className="mode-choice-grid">
        {modeCards().map((card) => (
          <button
            key={card.mode}
            className={`mode-card ${current === card.mode ? 'current' : ''}`}
            onClick={() => onChoose(card.mode)}
          >
            <div className="mode-card-head">
              <span className="mode-card-title">{card.title}</span>
              {card.recommended && <span className="badge">{t('mode.recommended')}</span>}
              {current === card.mode && !card.recommended && (
                <span className="badge muted">{t('mode.current')}</span>
              )}
            </div>

            <p className="mode-card-tagline">{card.tagline}</p>

            <ul className="mode-card-points">
              {card.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>

            <span className="mode-card-cta">{card.cta}</span>
          </button>
        ))}
      </div>

      <div className="row" style={{ justifyContent: 'center', marginTop: 4 }}>
        <button onClick={onCancel}>{t('common.cancel')}</button>
      </div>
    </div>
  )
}
