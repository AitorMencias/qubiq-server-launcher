/**
 * Cómo se cuenta el borrado mensual de Rust, igual en todas las pantallas.
 *
 * Es lo menos intuitivo del juego para quien llega nuevo, así que se explica
 * siempre con las mismas palabras: en el asistente, en el aviso de la pantalla
 * principal y en la pestaña de Borrado.
 */

/** «jueves 1 de octubre, a las 20:00», en la hora del equipo. */
export function wipeDateLabel(iso: string): string {
  const date = new Date(iso)
  const dia = date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
  const hora = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  return `${dia}, a las ${hora}`
}

/** «hace 3 días», «hoy», para decir cuándo empezó el mapa. */
export function sinceLabel(iso: string | null): string {
  if (!iso) return 'todavía no se ha generado'
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  return `hace ${days} días`
}

export function WipeExplainer(): React.JSX.Element {
  return (
    <>
      <p>
        El <strong>primer jueves de cada mes</strong>, hacia las 20:00, Facepunch publica una
        actualización de Rust. Desde ese momento solo se puede entrar en servidores actualizados, y
        el servidor actualizado <strong>empieza un mapa nuevo</strong>: lo construido se pierde y
        todo el mundo vuelve a empezar. Es el <em>wipe</em>, y es parte del juego.
      </p>
      <p>
        Lo que sí se conserva son los planos aprendidos (lo que cada uno sabe fabricar), salvo los
        meses en que Facepunch decide borrarlos también. Antes de cada borrado la app guarda una
        copia del mapa por si acaso.
      </p>
    </>
  )
}
