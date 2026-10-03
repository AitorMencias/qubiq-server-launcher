import { Rich, formatDateOnly, formatTime, t } from '../../i18n'
/**
 * Cómo se cuenta el borrado mensual de Rust, igual en todas las pantallas.
 *
 * Es lo menos intuitivo del juego para quien llega nuevo, así que se explica
 * siempre con las mismas palabras: en el asistente, en el aviso de la pantalla
 * principal y en la pestaña de Borrado.
 */

/** «jueves 1 de octubre, a las 20:00», en la hora del equipo y el idioma de la app. */
export function wipeDateLabel(iso: string): string {
  const dia = formatDateOnly(iso, { weekday: 'long', day: 'numeric', month: 'long' })
  const hora = formatTime(iso, { hour: '2-digit', minute: '2-digit' })
  return t('rust.wipe.dateAt', { day: dia, time: hora })
}

/** «hace 3 días», «hoy», para decir cuándo empezó el mapa. */
export function sinceLabel(iso: string | null): string {
  if (!iso) return t('rust.since.notGenerated')
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  if (days <= 0) return t('rust.since.today')
  if (days === 1) return t('rust.since.yesterday')
  return t('rust.since.daysAgo', { count: days })
}

export function WipeExplainer(): React.JSX.Element {
  return (
    <>
      <p>
        <Rich
          k="rust.explainer.p1"
          values={{
            first: <strong>{t('rust.explainer.firstThursday')}</strong>,
            newMap: <strong>{t('rust.explainer.newMap')}</strong>,
            wipe: <em>wipe</em>
          }}
        />
      </p>
      <p>{t('rust.explainer.p2')}</p>
    </>
  )
}
