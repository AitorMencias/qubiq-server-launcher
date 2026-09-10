import type { ExposureMode } from '@shared/types'

/**
 * Guías de configuración para cada forma de exponer el servidor (§10).
 *
 * Están escritas para alguien que no sabe qué es un puerto: cada paso dice
 * dónde hacer clic y qué escribir, no qué concepto aplicar.
 */

interface Props {
  mode: ExposureMode
  gateway: string | null
  localAddress: string | null
  port: number
  onClose: () => void
}

export function ExposureHelp({
  mode,
  gateway,
  localAddress,
  port,
  onClose
}: Props): React.JSX.Element {
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
            <RouterHelp gateway={gateway} localAddress={localAddress} port={port} />
          )}
          {mode === 'tunnel' && <TunnelHelp port={port} />}
        </div>
      </div>
    </div>
  )
}

const TITLES: Record<ExposureMode, string> = {
  local: 'Jugar en la misma casa',
  router: 'Abrir el puerto en el router',
  tunnel: 'Usar playit.gg'
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

function RouterHelp({
  gateway,
  localAddress,
  port
}: {
  gateway: string | null
  localAddress: string | null
  port: number
}): React.JSX.Element {
  return (
    <>
      <p>
        Por defecto, tu router bloquea todo lo que llega de internet. Hay que decirle que las
        conexiones al puerto <strong>{port}</strong> se las pase a este ordenador. Se hace una sola
        vez.
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
        <div>
          <dt>Puerto</dt>
          <dd>
            <code>{port}</code> (TCP)
          </dd>
        </div>
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
        <li>
          Crea una regla nueva con estos datos:
          <ul>
            <li>
              Puerto externo e interno: <code>{port}</code>
            </li>
            <li>
              Protocolo: <strong>TCP</strong>
            </li>
            <li>
              IP de destino: <code>{localAddress ?? 'la IP de este ordenador'}</code>
            </li>
          </ul>
        </li>
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
      <p className="note">
        Abrir un puerto expone este ordenador a internet. Mantén activado <strong>&quot;Exigir cuenta
        oficial de Minecraft&quot;</strong> en Ajustes, y considera activar{' '}
        <strong>&quot;Solo pueden entrar los invitados&quot;</strong> para que solo entre gente que tú
        hayas añadido.
      </p>
    </>
  )
}

function TunnelHelp({ port }: { port: number }): React.JSX.Element {
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
        <li>
          En su panel, crea un túnel de tipo <strong>Minecraft Java</strong> apuntando al puerto{' '}
          <code>{port}</code> de tu ordenador.
        </li>
        <li>
          Te dará una dirección parecida a <code>algo.joinmc.link</code>. Cópiala.
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
