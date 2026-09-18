import { useEffect } from 'react'

/**
 * Ventana flotante encima del panel, con la misma pinta que las guías de
 * conexión (`ExposureHelp`): cabecera con título y Cerrar, cuerpo con scroll y
 * un pie opcional que no se va con el scroll (donde van los botones de
 * guardar).
 *
 * Se cierra con Escape o pulsando fuera. Quien tenga cambios sin guardar debe
 * preguntar en `onClose` antes de cerrarse: aquí solo se avisa del intento.
 */

interface Props {
  title: React.ReactNode
  subtitle?: React.ReactNode
  onClose: () => void
  footer?: React.ReactNode
  /** Para contenidos con columnas, como la configuración de un plugin. */
  wide?: boolean
  children: React.ReactNode
}

export function FloatingWindow({
  title,
  subtitle,
  onClose,
  footer,
  wide,
  children
}: Props): React.JSX.Element {
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div style={{ minWidth: 0 }}>
            <h3>{title}</h3>
            {subtitle && <div className="modal-subtitle">{subtitle}</div>}
          </div>
          <button onClick={onClose}>Cerrar</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}
