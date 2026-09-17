import type { ExposureMode, InstanceManifest } from '@shared/types'
import { PROTOCOL_LABELS, gameInfo, serverPorts, type ServerPort } from '@shared/games'
import { uiFor } from './games'

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
          <h3>{TITLES[mode]}</h3>
          <button onClick={onClose}>Cerrar</button>
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

const TITLES: Record<ExposureMode, string> = {
  local: 'Jugar en la misma casa',
  crossplay: 'Jugar desde fuera con el crossplay del juego',
  router: 'Abrir el puerto en el router',
  tunnel: 'Usar playit.gg'
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
        No hay nada que configurar: {game} trae su propia forma de jugar entre casas. El servidor se
        conecta hacia fuera y tus amigos entran con un <strong>código de 6 dígitos</strong>, sin
        tocar el router ni instalar nada.
      </p>
      <ol>
        <li>Arranca el servidor y espera unos segundos: el código aparece en la pantalla principal.</li>
        <li>Pásaselo a tus amigos junto con la contraseña del servidor.</li>
        <li>
          Ellos entran por <strong>Unirse a partida → Unirse con código</strong> y lo escriben ahí.
        </li>
      </ol>
      <p className="note">
        <strong>El código cambia cada vez que arrancas el servidor</strong>, así que hay que volver a
        pasarlo. A cambio, funciona aunque tu compañía use CGNAT, que es cuando abrir puertos no
        sirve de nada.
      </p>
    </>
  )
}

function LocalHelp(): React.JSX.Element {
  return (
    <>
      <p>
        No hay nada que configurar. Cualquiera que esté conectado a tu mismo router —por wifi o por
        cable— puede entrar usando la dirección que empieza por <code>192.168.</code>
      </p>
      <p className="note">
        Si alguien intenta entrar desde otra casa, no funcionará: para eso necesitas una de las otras
        dos opciones.
      </p>
    </>
  )
}

/** «25565», «2456 y 2457», «7777, 8888 y 15000». */
function portList(ports: ServerPort[]): React.JSX.Element {
  return (
    <>
      {ports.map((p, i) => (
        <span key={p.port}>
          {i > 0 && (i === ports.length - 1 ? ' y ' : ', ')}
          <strong>{p.port}</strong>
        </span>
      ))}
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
        Por defecto, tu router bloquea todo lo que llega de internet. Hay que decirle que las
        conexiones {single ? 'al puerto' : 'a los puertos'} {portList(ports)} se las pase a este
        ordenador. Se hace una sola vez.
      </p>

      <h4>Lo que necesitas tener a mano</h4>
      <dl className="data-list">
        <div>
          <dt>Dirección de tu router</dt>
          <dd>
            {gateway ? (
              <>
                <code>{gateway}</code> — ábrela en el navegador
              </>
            ) : (
              'No se ha podido detectar. Suele ser 192.168.1.1 o 192.168.0.1'
            )}
          </dd>
        </div>
        <div>
          <dt>IP de este ordenador</dt>
          <dd>{localAddress ? <code>{localAddress}</code> : 'No detectada'}</dd>
        </div>
        {ports.map((p) => (
          <div key={p.port}>
            <dt>{single ? 'Puerto' : `Puerto: ${p.label}`}</dt>
            <dd>
              <code>{p.port}</code> ({PROTOCOL_LABELS[p.protocol]})
            </dd>
          </div>
        ))}
      </dl>

      <h4>Pasos</h4>
      <ol>
        <li>
          Abre <code>{gateway ?? '192.168.1.1'}</code> en el navegador. Te pedirá usuario y
          contraseña: suelen estar en una pegatina del propio router.
        </li>
        <li>
          Busca una sección llamada <strong>Port Forwarding</strong>, <strong>Redirección de
          puertos</strong>, <strong>NAT</strong> o <strong>Servidores virtuales</strong>. El nombre
          cambia según la marca.
        </li>
        {ports.map((p) => (
          <li key={p.port}>
            {single ? 'Crea una regla nueva con estos datos:' : `Crea una regla para «${p.label}»:`}
            <ul>
              <li>
                Puerto externo e interno: <code>{p.port}</code>
              </li>
              <li>
                Protocolo: <strong>{PROTOCOL_LABELS[p.protocol]}</strong>
                {p.protocol === 'tcp+udp' && ' (algunos routers lo llaman «Ambos»)'}
              </li>
              <li>
                IP de destino: <code>{localAddress ?? 'la IP de este ordenador'}</code>
              </li>
            </ul>
          </li>
        ))}
        <li>Guarda y, si el router lo pide, reinícialo.</li>
        <li>
          Vuelve aquí y pulsa <strong>Comprobar desde internet</strong>.
        </li>
      </ol>

      <h4>Si sigue sin funcionar</h4>
      <p>
        Lo más probable es que tu operador te tenga detrás de <strong>CGNAT</strong>: varios clientes
        comparten la misma IP pública y <em>no hay ningún puerto que abrir</em>. Es habitual en fibra
        barata y en conexiones móviles.
      </p>
      <p className="note">
        No es culpa de tu configuración y no tiene arreglo desde el router. La solución es usar
        <strong> playit.gg</strong>, que funciona igualmente. Puedes confirmarlo llamando a tu
        operador y preguntando si tienes IP pública.
      </p>

      <h4>Antes de abrir un puerto, ten en cuenta</h4>
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
        playit.gg es un servicio gratuito que te da una dirección pública{' '}
        <strong>sin tocar el router</strong>. Funciona incluso si tu operador usa CGNAT, que es
        cuando abrir puertos resulta imposible.
      </p>

      <h4>Cómo funciona</h4>
      <p>
        Un programa pequeño se ejecuta en tu ordenador y abre una conexión <em>de salida</em> hacia
        playit.gg. Las conexiones de salida no las bloquea nadie, igual que no configuras nada para
        navegar. Tus amigos se conectan a playit.gg y este reenvía el tráfico por ese túnel hasta tu
        servidor.
      </p>

      <h4>Pasos</h4>
      <ol>
        <li>
          Entra en <code>https://playit.gg</code> y crea una cuenta gratuita.
        </li>
        <li>Descarga su programa para Windows e instálalo. Déjalo abierto mientras juegas.</li>
        {ports.length === 1 ? (
          <li>
            En su panel, crea un túnel de tipo <strong>{ports[0].tunnelType}</strong> apuntando al
            puerto <code>{ports[0].port}</code> de tu ordenador.
          </li>
        ) : (
          <li>
            En su panel, crea un túnel por cada puerto de tu ordenador:
            <ul>
              {ports.map((p) => (
                <li key={p.port}>
                  {p.label}: tipo <strong>{p.tunnelType}</strong>, puerto <code>{p.port}</code>
                </li>
              ))}
            </ul>
          </li>
        )}
        <li>
          Te dará una dirección parecida a <code>{addressExample}</code>. Cópiala.
        </li>
        <li>Pégala aquí abajo, en el campo de dirección, y pulsa Comprobar.</li>
      </ol>

      <h4>Lo que hay que saber</h4>
      <ul>
        <li>
          <strong>Va algo más lento.</strong> El tráfico da un rodeo por sus servidores, así que
          notarás algo más de ping que abriendo el puerto.
        </li>
        <li>
          <strong>Todos llegan con la misma IP.</strong> Banear por IP deja de servir: usa la lista
          de invitados para controlar quién entra.
        </li>
        <li>
          <strong>El programa tiene que estar abierto.</strong> Si lo cierras, la dirección deja de
          funcionar.
        </li>
      </ul>

      <p className="note">
        No instalamos ese programa por ti: es de otra empresa y preferimos que lo descargues tú desde
        su web oficial, sabiendo qué estás instalando.
      </p>
    </>
  )
}
