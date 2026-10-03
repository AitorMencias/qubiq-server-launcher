/**
 * Lo que se dicen la app y el guardián (ver `source.ts`), sin E/S: así se
 * puede probar con texto.
 */

export type GuardianMessage =
  | { kind: 'hello'; protocol: number; serverPid: number; startedAt: number }
  | { kind: 'line'; seq: number; ts: number; text: string }
  | { kind: 'replayed' }
  | { kind: 'exit'; code: number }
  | { kind: 'unknown'; raw: string }

export function parseGuardianLine(raw: string): GuardianMessage {
  const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
  const tab = line.indexOf('\t')
  const type = tab === -1 ? line : line.slice(0, tab)
  const rest = tab === -1 ? '' : line.slice(tab + 1)

  switch (type) {
    case 'H': {
      const [protocol, pid, started] = rest.split('\t').map(Number)
      if (Number.isInteger(protocol) && Number.isInteger(pid) && Number.isFinite(started)) {
        return { kind: 'hello', protocol: protocol!, serverPid: pid!, startedAt: started! }
      }
      break
    }
    case 'L': {
      // El texto es lo último y puede llevar tabuladores: solo se cortan los
      // dos primeros campos.
      const first = rest.indexOf('\t')
      const second = first === -1 ? -1 : rest.indexOf('\t', first + 1)
      if (second === -1) break
      const seq = Number(rest.slice(0, first))
      const ts = Number(rest.slice(first + 1, second))
      if (Number.isInteger(seq) && Number.isFinite(ts)) {
        return { kind: 'line', seq, ts, text: rest.slice(second + 1) }
      }
      break
    }
    case 'R':
      return { kind: 'replayed' }
    case 'X': {
      const code = Number(rest.split('\t')[0])
      if (Number.isInteger(code)) return { kind: 'exit', code }
      break
    }
  }
  return { kind: 'unknown', raw: line }
}

/** Lo que deja el guardián al terminar sin nadie conectado. */
export type GuardianExitFile =
  | {
      kind: 'exit'
      code: number
      ts: number
      /** Sus últimas líneas, para diagnosticar el cierre. */
      lines: { seq: number; ts: number; text: string }[]
    }
  | { kind: 'error'; message: string }

export function parseExitFile(text: string): GuardianExitFile | null {
  const lines = text.split('\n').filter((line) => line.length > 0)
  const head = lines.shift()
  if (!head) return null
  if (head.startsWith('E\t')) return { kind: 'error', message: head.slice(2).trim() }

  const [type, code, ts] = head.split('\t')
  if (type !== 'X' || !Number.isInteger(Number(code))) return null
  const kept: { seq: number; ts: number; text: string }[] = []
  for (const line of lines) {
    const message = parseGuardianLine(line)
    if (message.kind === 'line') kept.push({ seq: message.seq, ts: message.ts, text: message.text })
  }
  return { kind: 'exit', code: Number(code), ts: Number(ts) || Date.now(), lines: kept }
}

/** El fichero con lo que hay que lanzar. Cada valor en base64, por si lleva saltos o `=`. */
export function encodeSpec(spec: { file: string; args: string; cwd: string; pipe: string; exit: string }): string {
  return (
    Object.entries(spec)
      .map(([key, value]) => `${key}=${Buffer.from(value, 'utf8').toString('base64')}`)
      .join('\r\n') + '\r\n'
  )
}

/** Una orden para la entrada estándar del servidor. */
export function stdinMessage(text: string): string {
  return `I\t${Buffer.from(text, 'utf8').toString('base64')}\n`
}
