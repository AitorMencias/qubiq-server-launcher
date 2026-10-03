import type { ExposureMode, InstanceManifest } from '@shared/types'
import { PROTOCOL_LABELS, gameInfo, serverPorts, type ServerPort } from '@shared/games'
import { listParts } from '@shared/i18n'
import { uiFor } from './games'
import { Rich, quote, t } from './i18n'

/**
 * Guías de configuración para cada forma de exponer el servidor (§10).
 *
 * Están escritas para alguien que no sabe qué es un puerto: cada paso dice
 * dónde hacer clic y qué escribir, no qué concepto aplicar.
 *
 * Los puertos salen del juego (`serverPorts`): Minecraft usa uno TCP y los
 * juegos de Steam varios, casi siempre UDP. Con un solo puerto, el texto es el
 * de siempre; con varios, se pide una regla o un túnel por puerto.
 */

interface Props {
  mode: ExposureMode
  gateway: string | null
  localAddress: string | null
  manifest: InstanceManifest
  onClose: () => void
}

export function ExposureHelp({
  mode,
  gateway,
  localAddress,
  manifest,
  onClose
}: Props): React.JSX.Element {
  const ports = serverPorts(manifest)
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{t(`help.title.${mode}`)}</h3>
          <button onClick={onClose}>{t('common.close')}</button>
        </div>

        <div className="modal-body">
          {mode === 'local' && <LocalHelp />}
          {mode === 'router' && (
            <RouterHelp
              gateway={gateway}
              localAddress={localAddress}
              ports={ports}
              safetyNote={uiFor(manifest).routerSafetyNote}
            />
          )}
          {mode === 'crossplay' && <CrossplayHelp game={gameInfo(manifest.game).name} />}
          {mode === 'tunnel' && (
            <TunnelHelp ports={ports} addressExample={gameInfo(manifest.game).tunnelAddressExample} />
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * El crossplay del propio juego: sin router, sin túnel y sin dirección. Es la
 * opción buena para quien tiene CGNAT, que es justo donde abrir puertos no
 * sirve de nada.
 */
function CrossplayHelp({ game }: { game: string }): React.JSX.Element {
  return (
    <>
      <p>
        <Rich
          k="help.crossplay.intro"
          vars={{ game }}
          values={{ code: <strong>{t('help.crossplay.code')}</strong> }}
        />
      </p>
      <ol>
        <li>{t('help.crossplay.step1')}</li>
        <li>{t('help.crossplay.step2')}</li>
        <li>
          <Rich
            k="help.crossplay.step3"
            values={{ path: <strong>{t('help.crossplay.path')}</strong> }}
          />
        </li>
      </ol>
      <p className="note">
        <Rich
          k="help.crossplay.note"
          values={{ changes: <strong>{t('help.crossplay.changes')}</strong> }}
        />
      </p>
    </>
  )
}

function LocalHelp(): React.JSX.Element {
  return (
    <>
      <p>
        <Rich k="help.local.text" values={{ prefix: <code>192.168.</code> }} />
      </p>
      <p className="note">{t('help.local.note')}</p>
    </>
  )
}

/** «25565», «2456 y 2457», «7777, 8888 y 15000», con la «y» de cada idioma. */
function portList(ports: ServerPort[]): React.JSX.Element {
  return (
    <>
      {listParts(ports.map((p) => String(p.port))).map((part, i) =>
        part.type === 'element' ? <strong key={i}>{part.value}</strong> : <span key={i}>{part.value}</span>
      )}
    </>
  )
}

function RouterHelp({
  gateway,
  localAddress,
  ports,
  safetyNote
}: {
  gateway: string | null
  localAddress: string | null
  ports: ServerPort[]
  safetyNote: React.ReactNode
}): React.JSX.Element {
  const single = ports.length === 1
  return (
    <>
      <p>
        <Rich k="help.router.intro" vars={{ count: ports.length }} values={{ ports: portList(ports) }} />
      </p>

      <h4>{t('help.router.need')}</h4>
      <dl className="data-list">
        <div>
          <dt>{t('help.router.gateway')}</dt>
          <dd>
            {gateway ? (
              <>
                <code>{gateway}</code> {t('help.router.gatewayOpen')}
              </>
            ) : (
              t('help.router.gatewayUnknown')
            )}
          </dd>
        </div>
        <div>
          <dt>{t('help.router.localIp')}</dt>
          <dd>{localAddress ? <code>{localAddress}</code> : t('help.router.notDetected')}</dd>
        </div>
        {ports.map((p) => (
          <div key={p.port}>
            <dt>{single ? t('help.router.port') : t('help.router.portOf', { label: p.label })}</dt>
            <dd>
              <code>{p.port}</code> ({PROTOCOL_LABELS[p.protocol]})
            </dd>
          </div>
        ))}
      </dl>

      <h4>{t('help.steps')}</h4>
      <ol>
        <li>
          <Rich k="help.router.step1" values={{ gateway: <code>{gateway ?? '192.168.1.1'}</code> }} />
        </li>
        <li>
          <Rich
            k="help.router.step2"
            values={{
              a: <strong>Port Forwarding</strong>,
              b: <strong>{t('help.router.sectionB')}</strong>,
              c: <strong>NAT</strong>,
              d: <strong>{t('help.router.sectionD')}</strong>
            }}
          />
        </li>
        {ports.map((p) => (
          <li key={p.port}>
            {single ? t('help.router.ruleOne') : t('help.router.ruleFor', { label: quote(p.label) })}
            <ul>
              <li>
                <Rich k="help.router.extInt" values={{ port: <code>{p.port}</code> }} />
              </li>
              <li>
                <Rich
                  k="help.router.protocol"
                  values={{ protocol: <strong>{PROTOCOL_LABELS[p.protocol]}</strong> }}
                />
                {p.protocol === 'tcp+udp' && ` ${t('help.router.both')}`}
              </li>
              <li>
                <Rich
                  k="help.router.destIp"
                  values={{ ip: <code>{localAddress ?? t('help.router.thisIp')}</code> }}
                />
              </li>
            </ul>
          </li>
        ))}
        <li>{t('help.router.save')}</li>
        <li>
          <Rich
            k="help.router.check"
            values={{ button: <strong>{t('connection.checkButton')}</strong> }}
          />
        </li>
      </ol>

      <h4>{t('help.router.stillTitle')}</h4>
      <p>
        <Rich
          k="help.router.cgnat"
          values={{ cgnat: <strong>CGNAT</strong>, noPort: <em>{t('help.router.noPort')}</em> }}
        />
      </p>
      <p className="note">
        <Rich k="help.router.cgnatNote" values={{ playit: <strong>playit.gg</strong> }} />
      </p>

      <h4>{t('help.router.safetyTitle')}</h4>
      <p className="note">{safetyNote}</p>
    </>
  )
}

function TunnelHelp({
  ports,
  addressExample
}: {
  ports: ServerPort[]
  addressExample: string
}): React.JSX.Element {
  return (
    <>
      <p>
        <Rich
          k="help.tunnel.intro"
          values={{ noRouter: <strong>{t('help.tunnel.noRouter')}</strong> }}
        />
      </p>

      <h4>{t('help.tunnel.howTitle')}</h4>
      <p>
        <Rich k="help.tunnel.how" values={{ outgoing: <em>{t('help.tunnel.outgoing')}</em> }} />
      </p>

      <h4>{t('help.steps')}</h4>
      <ol>
        <li>
          <Rich k="help.tunnel.step1" values={{ url: <code>https://playit.gg</code> }} />
        </li>
        <li>{t('help.tunnel.step2')}</li>
        {ports.length === 1 ? (
          <li>
            <Rich
              k="help.tunnel.step3one"
              values={{
                type: <strong>{ports[0]!.tunnelType}</strong>,
                port: <code>{ports[0]!.port}</code>
              }}
            />
          </li>
        ) : (
          <li>
            {t('help.tunnel.step3many')}
            <ul>
              {ports.map((p) => (
                <li key={p.port}>
                  <Rich
                    k="help.tunnel.portLine"
                    vars={{ label: p.label }}
                    values={{ type: <strong>{p.tunnelType}</strong>, port: <code>{p.port}</code> }}
                  />
                </li>
              ))}
            </ul>
          </li>
        )}
        <li>
          <Rich k="help.tunnel.step4" values={{ example: <code>{addressExample}</code> }} />
        </li>
        <li>{t('help.tunnel.step5', { button: t('connection.checkButton') })}</li>
      </ol>

      <h4>{t('help.tunnel.knowTitle')}</h4>
      <ul>
        <li>
          <strong>{t('help.tunnel.slowTitle')}</strong> {t('help.tunnel.slow')}
        </li>
        <li>
          <strong>{t('help.tunnel.sameIpTitle')}</strong> {t('help.tunnel.sameIp')}
        </li>
        <li>
          <strong>{t('help.tunnel.openTitle')}</strong> {t('help.tunnel.open')}
        </li>
      </ul>

      <p className="note">{t('help.tunnel.note')}</p>
    </>
  )
}
