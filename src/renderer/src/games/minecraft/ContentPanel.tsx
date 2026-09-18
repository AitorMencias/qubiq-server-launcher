import { useCallback, useEffect, useState } from 'react'
import type { InstanceState, UiMode } from '@shared/types'
import type { ContentInfo, ContentItem } from '@shared/games/minecraft/types'
import {
  CONTENT_SOURCES,
  DISTRIBUTION_LABELS,
  contentKindFor,
  minecraftOf
} from '@shared/games/minecraft/types'
import { OfficialPlugins } from './OfficialPlugins'
import { ContentConfigWindow } from './ContentConfigWindow'

/**
 * Plugins y mods (§4.8).
 *
 * La app no descarga por ti: te lleva a las webs buenas, te dice exactamente
 * qué filtrar y te abre la carpeta donde pegar el fichero. Después te enseña
 * qué hay dentro, para que compruebes que ha llegado bien.
 *
 * La distinción plugin/mod no es cosmética: los plugins van solo en el
 * servidor, los mods hay que instalarlos también en el Minecraft de cada
 * jugador. Confundirlo es el motivo nº 1 de "mis amigos no pueden entrar".
 */

interface Props {
  state: InstanceState
  mode: UiMode
}

export function ContentPanel({ state, mode }: Props): React.JSX.Element {
  const manifest = minecraftOf(state.manifest)
  const { status } = state
  const running = status !== 'stopped' && status !== 'crashed'
  const basic = mode === 'basic'

  const kind = contentKindFor(manifest.data.distribution)
  const isMods = kind === 'mods'
  const label = isMods ? 'mods' : 'plugins'

  const [info, setInfo] = useState<ContentInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /** Plugin o mod cuya configuración está abierta en la ventana flotante. */
  const [configuring, setConfiguring] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setInfo(await window.qubiq.minecraft.content.list(manifest.id))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [manifest.id])

  useEffect(() => {
    void refresh()
  }, [refresh, status])

  async function act(action: () => Promise<ContentInfo>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      setInfo(await action())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function openFolder(): Promise<void> {
    setError(null)
    try {
      await window.qubiq.minecraft.content.openFolder(manifest.id)
      // Al volver de pegar ficheros, la lista debe reflejarlo.
      setTimeout(() => void refresh(), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const sources = CONTENT_SOURCES[manifest.data.distribution]
  const items = info?.items ?? []

  return (
    <div className="panel">
      {error && (
        <div className="alert error">
          <strong>No se pudo completar la operación</strong>
          <p>{error}</p>
        </div>
      )}

      {/* Lo primero, el aviso que decide si esto va a funcionar o no. */}
      <div className={`alert ${isMods ? 'error' : 'info'}`}>
        <strong>
          {isMods
            ? 'Los mods hay que instalarlos también en el Minecraft de cada jugador'
            : 'Los plugins se instalan solo aquí, en el servidor'}
        </strong>
        <p>
          {isMods
            ? `Todos tenéis que tener exactamente los mismos mods y la misma versión (${manifest.data.minecraftVersion}). Quien no los tenga no podrá entrar. Los mods de aspecto —shaders, minimapas— van solo en su Minecraft, no aquí.`
            : 'Tus amigos no tienen que instalar nada: entran con su Minecraft normal. Por eso los plugins son lo más cómodo para jugar con gente.'}
        </p>
      </div>

      {/* Lo nuestro va primero: es un botón, no un paseo por media internet. */}
      <OfficialPlugins state={state} onChanged={() => void refresh()} />

      <div className="card">
        <h3>1. Descarga el archivo</h3>
        <p className="hint">
          Busca en estas webs y descarga el <code>.jar</code>. Fíjate bien en dos cosas antes de
          bajarlo.
        </p>

        <div className="requirements">
          <div>
            <span className="req-label">Versión de Minecraft</span>
            <span className="req-value">{manifest.data.minecraftVersion}</span>
          </div>
          <div>
            <span className="req-label">Tipo</span>
            <span className="req-value">
              {DISTRIBUTION_LABELS[manifest.data.distribution].name.replace(/^Mods \(|\)$/g, '')}
            </span>
          </div>
        </div>

        <div className="source-list">
          {sources.map((source) => (
            <a
              key={source.url}
              className={`source ${source.primary ? 'primary' : ''}`}
              href={source.url}
              target="_blank"
              rel="noreferrer"
            >
              <div className="source-head">
                <span className="source-name">{source.name}</span>
                {source.primary && <span className="badge">Recomendada</span>}
              </div>
              <span className="source-desc">{source.description}</span>
            </a>
          ))}
        </div>

        {manifest.data.distribution === 'fabric' && (
          <div className="alert info" style={{ marginTop: 14, marginBottom: 0 }}>
            <strong>Casi todos los mods de Fabric necesitan Fabric API</strong>
            <p>
              Es un mod más, que se instala igual que los demás. Si un mod no arranca, suele ser
              porque falta.{' '}
              <a
                href="https://modrinth.com/mod/fabric-api"
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--accent)' }}
              >
                Descargar Fabric API
              </a>
            </p>
          </div>
        )}
      </div>

      <div className="card">
        <h3>2. Pega el archivo en la carpeta</h3>
        <p className="hint">
          Se abre la carpeta <code>{info?.folderName ?? label}</code> del servidor. Arrastra ahí el{' '}
          <code>.jar</code> que has descargado. No hace falta descomprimir nada.
        </p>
        <div className="row">
          <button className="primary" onClick={() => void openFolder()}>
            Abrir la carpeta de {label}
          </button>
          <button onClick={() => void refresh()}>Actualizar lista</button>
        </div>
      </div>

      <div className="card">
        <h3>3. Reinicia el servidor</h3>
        <p className="hint" style={{ marginBottom: 0 }}>
          {running
            ? `El servidor está en marcha: los ${label} nuevos no se cargan hasta que lo pares y lo vuelvas a arrancar.`
            : `Arranca el servidor y los ${label} se cargarán solos. Si no arranca, casi siempre es por uno incompatible: desactívalo aquí abajo y prueba otra vez.`}
        </p>
      </div>

      <div className="card">
        <div className="row between" style={{ marginBottom: 4 }}>
          <h3 style={{ margin: 0 }}>
            Instalados {items.length > 0 && <span style={{ color: 'var(--muted)' }}>({items.length})</span>}
          </h3>
        </div>
        <p className="hint">
          Lo que hay ahora mismo en la carpeta. Si acabas de pegar un archivo y no aparece, pulsa
          &quot;Actualizar lista&quot;.
        </p>

        {items.length === 0 ? (
          <p className="hint" style={{ marginBottom: 0 }}>
            Todavía no hay ningún {isMods ? 'mod' : 'plugin'} instalado.
          </p>
        ) : (
          <div className="player-list">
            {items.map((item) => (
              <ContentRow
                key={item.fileName}
                item={item}
                busy={busy}
                running={running}
                basic={basic}
                onConfigure={() => setConfiguring(item.fileName)}
                onToggle={() =>
                  void act(() =>
                    window.qubiq.minecraft.content.setEnabled(manifest.id, item.fileName, !item.enabled)
                  )
                }
                onRemove={() => {
                  const ok = window.confirm(
                    `¿Borrar "${item.fileName}"?\n\nSe elimina el archivo. Siempre puedes volver a descargarlo.`
                  )
                  if (ok) void act(() => window.qubiq.minecraft.content.remove(manifest.id, item.fileName))
                }}
              />
            ))}
          </div>
        )}

        {running && items.length > 0 && (
          <div className="help" style={{ marginTop: 12 }}>
            Para activar, desactivar o borrar hay que parar el servidor antes. La configuración se
            puede mirar, pero para guardarla también hay que pararlo.
          </div>
        )}
      </div>

      {configuring && (
        <ContentConfigWindow
          instanceId={manifest.id}
          fileName={configuring}
          running={running}
          onClose={() => setConfiguring(null)}
        />
      )}
    </div>
  )
}

interface RowProps {
  item: ContentItem
  busy: boolean
  running: boolean
  basic: boolean
  onConfigure: () => void
  onToggle: () => void
  onRemove: () => void
}

function ContentRow({
  item,
  busy,
  running,
  basic,
  onConfigure,
  onToggle,
  onRemove
}: RowProps): React.JSX.Element {
  const name = item.fileName.replace(/\.jar(\.disabled)?$/i, '')

  return (
    <div className="player">
      <div className="grow" style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, opacity: item.enabled ? 1 : 0.55 }}>
          {name}
          {!item.enabled && (
            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--warn)', fontWeight: 400 }}>
              desactivado
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
          {formatSize(item.sizeBytes)} · añadido {formatDate(item.addedAt)}
        </div>
      </div>

      {/* Mirar se puede siempre; la ventana ya impide guardar en marcha. */}
      <button disabled={busy} onClick={onConfigure}>
        Configurar
      </button>

      {/* Desactivar es la salida cuando un mod impide arrancar: se conserva el
          fichero y el servidor deja de cargarlo. */}
      <button disabled={busy || running} onClick={onToggle}>
        {item.enabled ? 'Desactivar' : 'Activar'}
      </button>
      {!basic && (
        <button className="danger" disabled={busy || running} onClick={onRemove}>
          Borrar
        </button>
      )}
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })
}
