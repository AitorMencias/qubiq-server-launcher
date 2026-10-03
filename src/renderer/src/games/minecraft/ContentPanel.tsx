import { useCallback, useEffect, useState } from 'react'
import type { InstanceState, UiMode } from '@shared/types'
import type { ContentInfo, ContentItem } from '@shared/games/minecraft/types'
import type { Distribution } from '@shared/games/minecraft/types'
import { CONTENT_SOURCES, contentKindFor, minecraftOf } from '@shared/games/minecraft/types'
import { OfficialPlugins } from './OfficialPlugins'
import { ContentConfigWindow } from './ContentConfigWindow'
import { Rich, formatBytes, formatDateOnly, t } from '../../i18n'

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
  /** Las frases que nombran plugins o mods tienen una variante para cada uno. */
  const kindKey = isMods ? 'mods' : 'plugins'

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
          <strong>{t('backup.error')}</strong>
          <p>{error}</p>
        </div>
      )}

      {/* Lo primero, el aviso que decide si esto va a funcionar o no. */}
      <div className={`alert ${isMods ? 'error' : 'info'}`}>
        <strong>{isMods ? t('mc.content.modsTitle') : t('mc.content.pluginsTitle')}</strong>
        <p>
          {isMods
            ? t('mc.content.modsText', { version: manifest.data.minecraftVersion })
            : t('mc.content.pluginsText')}
        </p>
      </div>

      {/* Lo nuestro va primero: es un botón, no un paseo por media internet. */}
      <OfficialPlugins state={state} onChanged={() => void refresh()} />

      <div className="card">
        <h3>{t('mc.content.step1')}</h3>
        <p className="hint">
          <Rich k="mc.content.step1Hint" values={{ jar: <code>.jar</code> }} />
        </p>

        <div className="requirements">
          <div>
            <span className="req-label">{t('mc.wizard.summary.version')}</span>
            <span className="req-value">{manifest.data.minecraftVersion}</span>
          </div>
          <div>
            <span className="req-label">{t('mc.wizard.summary.type')}</span>
            <span className="req-value">{LOADER_NAMES[manifest.data.distribution]}</span>
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
                {source.primary && <span className="badge">{t('mc.content.recommended')}</span>}
              </div>
              <span className="source-desc">{source.description}</span>
            </a>
          ))}
        </div>

        {manifest.data.distribution === 'fabric' && (
          <div className="alert info" style={{ marginTop: 14, marginBottom: 0 }}>
            <strong>{t('mc.content.fabricApi')}</strong>
            <p>
              {t('mc.content.fabricApiText')}{' '}
              <a
                href="https://modrinth.com/mod/fabric-api"
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--accent)' }}
              >
                {t('mc.content.fabricApiLink')}
              </a>
            </p>
          </div>
        )}
      </div>

      <div className="card">
        <h3>{t('mc.content.step2')}</h3>
        <p className="hint">
          <Rich
            k="mc.content.step2Hint"
            values={{ folder: <code>{info?.folderName ?? label}</code>, jar: <code>.jar</code> }}
          />
        </p>
        <div className="row">
          <button className="primary" onClick={() => void openFolder()}>
            {t(`mc.content.openFolder.${kindKey}`)}
          </button>
          <button onClick={() => void refresh()}>{t('mc.content.refresh')}</button>
        </div>
      </div>

      <div className="card">
        <h3>{t('mc.content.step3')}</h3>
        <p className="hint" style={{ marginBottom: 0 }}>
          {running
            ? t(`mc.content.step3Running.${kindKey}`)
            : t(`mc.content.step3Stopped.${kindKey}`)}
        </p>
      </div>

      <div className="card">
        <div className="row between" style={{ marginBottom: 4 }}>
          <h3 style={{ margin: 0 }}>
            {t('catalog.installedTitle')}{' '}
            {items.length > 0 && <span style={{ color: 'var(--muted)' }}>({items.length})</span>}
          </h3>
        </div>
        <p className="hint">{t('mc.content.installedHint', { button: t('mc.content.refresh') })}</p>

        {items.length === 0 ? (
          <p className="hint" style={{ marginBottom: 0 }}>
            {t(`mc.content.none.${kindKey}`)}
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
                  const ok = window.confirm(t('mc.content.confirmDelete', { file: item.fileName }))
                  if (ok) void act(() => window.qubiq.minecraft.content.remove(manifest.id, item.fileName))
                }}
              />
            ))}
          </div>
        )}

        {running && items.length > 0 && (
          <div className="help" style={{ marginTop: 12 }}>
            {t('mc.content.runningHelp')}
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
              {t('mc.content.disabled')}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
          {formatSize(item.sizeBytes)} · {t('mc.content.added', { date: formatDate(item.addedAt) })}
        </div>
      </div>

      {/* Mirar se puede siempre; la ventana ya impide guardar en marcha. */}
      <button disabled={busy} onClick={onConfigure}>
        {t('mc.content.configure')}
      </button>

      {/* Desactivar es la salida cuando un mod impide arrancar: se conserva el
          fichero y el servidor deja de cargarlo. */}
      <button disabled={busy || running} onClick={onToggle}>
        {item.enabled ? t('mc.content.disable') : t('mc.content.enable')}
      </button>
      {!basic && (
        <button className="danger" disabled={busy || running} onClick={onRemove}>
          {t('backup.delete')}
        </button>
      )}
    </div>
  )
}

/** El nombre del cargador, que es lo que se busca en las webs: no se traduce. */
const LOADER_NAMES: Record<Distribution, string> = {
  vanilla: 'Vanilla',
  paper: 'Paper',
  fabric: 'Fabric',
  forge: 'Forge',
  neoforge: 'NeoForge'
}

function formatSize(bytes: number): string {
  return formatBytes(bytes)
}

function formatDate(iso: string): string {
  return formatDateOnly(iso, {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })
}
