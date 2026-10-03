import { useEffect, useState } from 'react'
import type { GameId } from '@shared/types'
import { GAME_IDS, gameInfo } from '@shared/games'
import { GameIcon } from './GameIcon'
import { t, unitLabel } from './i18n'

/**
 * Elección de juego al crear un servidor: el paso previo a elegir modo.
 *
 * No se elige un juego por su nombre —eso ya se sabe—, sino por lo que va a
 * costar: cuánta gente entra, cuánta memoria pide comparada con la que tiene
 * este equipo, cuánto hay que descargar y qué tiene de raro. Lo que puede
 * cambiar la decisión sale como etiqueta, no escondido dentro del asistente.
 *
 * Mientras la app gestione un solo juego NO se muestra (ver `App`): añadir un
 * clic para elegir entre una única opción sería ruido.
 */

interface Props {
  onChoose: (game: GameId) => void
  onCancel: () => void
}

export function GameChooser({ onChoose, onCancel }: Props): React.JSX.Element {
  const [selected, setSelected] = useState<GameId | null>(null)
  const [totalMemoryMb, setTotalMemoryMb] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    window.qubiq.system
      .memory()
      .then((memory) => {
        if (!cancelled) setTotalMemoryMb(memory.totalMb)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="panel">
      <div className="chooser-intro">
        <h2>{t('chooser.title')}</h2>
        <p>{t('chooser.text')}</p>
      </div>

      <div className="game-grid">
        {GAME_IDS.map((id) => {
          const info = gameInfo(id)
          const { card } = info
          const memory = memoryChip(card.memoryGb, totalMemoryMb)

          return (
            <button
              key={id}
              className={`game-card ${selected === id ? 'selected' : ''}`}
              aria-pressed={selected === id}
              onClick={() => setSelected(id)}
              onDoubleClick={() => onChoose(id)}
            >
              <div className="game-card-head">
                <GameIcon game={id} size={40} />
                <span className="game-card-title">{info.name}</span>
              </div>

              <div className="game-card-tag">{card.tagline}</div>

              <dl className="game-facts">
                <dt>{t('chooser.players')}</dt>
                <dd>{card.players}</dd>
                <dt>{t('chooser.memory')}</dt>
                <dd>
                  {card.memoryGb.min}–{card.memoryGb.recommended} {unitLabel('GB')}
                </dd>
                <dt>{t('chooser.download')}</dt>
                <dd>
                  {card.download}
                  {!card.downloadMeasured && (
                    <span className="game-fact-note"> {t('chooser.approx')}</span>
                  )}
                </dd>
              </dl>

              <div className="chips">
                {memory && <span className={`chip ${memory.tone}`}>{memory.text}</span>}
                {card.highlights.map((highlight) => (
                  <span key={highlight.text} className={`chip ${highlight.tone}`}>
                    {highlight.text}
                  </span>
                ))}
              </div>
            </button>
          )
        })}
      </div>

      {/* La guía de requisitos: lo mismo que las tarjetas, pero en columnas
          para poder comparar de un vistazo. Todo medido en la fase de cada
          juego, no copiado de sus webs. */}
      <details className="card requirements-guide">
        <summary>{t('chooser.compare')}</summary>
        <div className="requirements-scroll">
          <table className="requirements-table">
            <thead>
              <tr>
                <th>{t('chooser.col.game')}</th>
                <th>{t('chooser.memory')}</th>
                <th>{t('chooser.download')}</th>
                <th>{t('chooser.col.startup')}</th>
                <th>{t('chooser.col.ports')}</th>
                <th>{t('chooser.col.extra')}</th>
              </tr>
            </thead>
            <tbody>
              {GAME_IDS.map((id) => {
                const info = gameInfo(id)
                const { card } = info
                return (
                  <tr key={id}>
                    <td>
                      <span className="row" style={{ gap: 8 }}>
                        <GameIcon game={id} size={20} />
                        {info.name}
                      </span>
                    </td>
                    <td>
                      {card.memoryGb.min}–{card.memoryGb.recommended} {unitLabel('GB')}
                    </td>
                    <td>{card.download}</td>
                    <td>{card.requirements.startup}</td>
                    <td>{card.requirements.ports}</td>
                    <td>{card.requirements.extra ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="hint" style={{ marginBottom: 0 }}>
          {t('chooser.memoryNote')}
        </p>
      </details>

      <div className="row between wizard-nav">
        <button onClick={onCancel}>{t('common.cancel')}</button>
        <button className="primary" disabled={selected === null} onClick={() => onChoose(selected!)}>
          {selected ? t('chooser.create', { game: gameInfo(selected).name }) : t('chooser.pick')}
        </button>
      </div>
    </div>
  )
}

/**
 * Cómo le queda el juego a ESTE equipo. Avisa, nunca bloquea: el ordenador es
 * suyo y puede cerrar cosas o probar de todas formas.
 */
function memoryChip(
  memoryGb: { min: number; recommended: number },
  totalMemoryMb: number | null
): { text: string; tone: 'good' | 'warn' | 'bad' } | null {
  if (totalMemoryMb === null) return null
  const totalGb = Math.round(totalMemoryMb / 1024)

  if (totalGb < memoryGb.min) {
    return { text: t('chooser.memoryBad', { gb: totalGb }), tone: 'bad' }
  }
  if (totalGb < memoryGb.recommended + 4) {
    return { text: t('chooser.memoryTight', { gb: totalGb }), tone: 'warn' }
  }
  return { text: t('chooser.memoryGood'), tone: 'good' }
}
