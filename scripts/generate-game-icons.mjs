// Genera los iconos de juego definitivos como SVG estáticos, uno por juego, en
// src/renderer/src/games/<juego>/icon.svg. Los píxeles del pico y los dientes
// del engranaje se calculan aquí una vez y quedan escritos como coordenadas.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Uso: node scripts/generate-game-icons.mjs  (desde la raíz del proyecto)
const REPO = process.cwd()
const W = '#ffffff'
const r2 = (n) => Math.round(n * 100) / 100

const stroke = (d, w = 3.4, extra = '') =>
  `<path d="${d}" fill="none" stroke="${W}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`
const fill = (d, color = W, extra = '') => `<path d="${d}" fill="${color}"${extra}/>`

function gear(cx, cy, rOut, rIn, teeth) {
  const pts = []
  for (let i = 0; i < teeth * 2; i++) {
    const a = (Math.PI / teeth) * i - Math.PI / 2
    const r = i % 2 === 0 ? rOut : rIn
    const spread = (Math.PI / teeth) * 0.42
    for (const da of [-spread, spread]) pts.push(`${r2(cx + r * Math.cos(a + da))} ${r2(cy + r * Math.sin(a + da))}`)
  }
  return `M${pts.join(' L')}Z`
}

// Pico en pixel art propio: curva y mango rasterizados en una rejilla de 12×12.
// Las celdas contiguas de cada fila se unen en un solo rectángulo.
function pixelPickaxe() {
  const cell = 3.6, ox = 10.4, oy = 10.4
  const head = (t) => {
    const p0 = [2.2, 2.6], c = [10.2, 1.8], p1 = [9.4, 9.8]
    return [(1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1]]
  }
  const dHead = (x, y) => {
    let best = 99
    for (let i = 0; i <= 60; i++) { const [hx, hy] = head(i / 60); best = Math.min(best, Math.hypot(hx - x, hy - y)) }
    return best
  }
  const dHandle = (x, y) => {
    const [ax, ay, bx, by] = [7.8, 4.2, 1.6, 10.4]
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)))
    return Math.hypot(ax + t * (bx - ax) - x, ay + t * (by - ay) - y)
  }
  const rows = []
  for (let gy = 0; gy < 12; gy++) {
    const row = []
    for (let gx = 0; gx < 12; gx++) {
      const x = gx + 0.5, y = gy + 0.5
      let c = null
      if (dHandle(x, y) < 0.95) c = '#f3dcb8'
      if (dHead(x, y) < 1.25) c = W
      row.push(c)
    }
    rows.push(row)
  }
  const out = []
  rows.forEach((row, gy) => {
    let start = 0
    for (let gx = 1; gx <= 12; gx++) {
      if (gx === 12 || row[gx] !== row[start]) {
        if (row[start]) {
          out.push(`<rect x="${r2(ox + start * cell)}" y="${r2(oy + gy * cell)}" width="${r2((gx - start) * cell + 0.05)}" height="${r2(cell + 0.05)}" fill="${row[start]}"/>`)
        }
        start = gx
      }
    }
  })
  return out.join('')
}

const GAMES = [
  { id: 'minecraft', name: 'Minecraft', top: '#5aab55', bottom: '#2c6a33', node: '#d8ffb8',
    art: () => pixelPickaxe(), nodes: [[20, 18], [46, 45]] },
  { id: 'satisfactory', name: 'Satisfactory', top: '#2f9a93', bottom: '#1a5358', node: '#ffb54d',
    art: () =>
      stroke('M10 45 L50 25') + stroke('M14 53 L54 33') +
      `<circle cx="12" cy="49" r="5" fill="none" stroke="${W}" stroke-width="3.2"/>` +
      `<circle cx="52" cy="29" r="5" fill="none" stroke="${W}" stroke-width="3.2"/>` +
      fill('M22 34 L29 30.5 L32.5 37.5 L25.5 41 Z') +
      fill('M35 27.5 L42 24 L45.5 31 L38.5 34.5 Z', W, ' fill-opacity=".78"'),
    nodes: [[52, 29], [12, 49]] },
  { id: 'valheim', name: 'Valheim', top: '#4d6a80', bottom: '#212f3b', node: '#ff9a3c',
    art: () =>
      fill('M21 40 Q20 19 32 19 Q44 19 43 40 Z', W, ' fill-opacity=".18"') +
      stroke('M21 40 Q20 19 32 19 Q44 19 43 40') +
      fill('M22 31 Q9 29 11 11 Q15 23 24 25 Z') + fill('M42 31 Q55 29 53 11 Q49 23 40 25 Z') +
      stroke('M16 40 H48', 4.2) + stroke('M32 40 V51', 3.8),
    nodes: [[11, 11], [53, 11], [32, 51]] },
  { id: 'zomboid', name: 'Project Zomboid', top: '#9a4038', bottom: '#4a1d1a', node: '#ffd0c4',
    art: () =>
      fill('M16 14 H48 V50 H16 Z', '#000000', ' fill-opacity=".28"') + stroke('M16 14 H48 V50 H16 Z', 3.2) +
      fill('M11 18 L53 13 L54 21 L12 26 Z') + fill('M11 41 L53 46 L52 54 L10 49 Z', W, ' fill-opacity=".86"'),
    nodes: [[27, 33], [37, 33]] },
  { id: 'enshrouded', name: 'Enshrouded', top: '#7566c0', bottom: '#342c6a', node: '#ffd27a',
    art: () =>
      stroke('M28 11 A4 4 0 1 1 36 11', 3) + fill('M24 21 H40 L37 16 H27 Z') +
      fill('M23 21 H41 L39 43 H25 Z', W, ' fill-opacity=".16"') + stroke('M23 21 H41 L39 43 H25 Z', 3.2) +
      fill('M32 39 C26 34 28.5 28 32 24 C35.5 28 38 34 32 39 Z', '#ffd27a') +
      stroke('M20 44 H44', 3.6) +
      stroke('M6 51 Q13 47 20 51 T34 51 T48 51 T60 51', 3, ' stroke-opacity=".75"') +
      stroke('M12 57 Q19 53 26 57 T40 57 T54 57', 3, ' stroke-opacity=".45"'),
    nodes: [[32, 11], [8, 51], [58, 51]] },
  { id: 'rust', name: 'Rust', top: '#c05a2c', bottom: '#65260f', node: '#ffd9b8',
    art: () =>
      stroke('M19 55 L39 17', 4.4) +
      fill('M29 13 L45 8 L55 20 L47 31 L34 27 Z') +
      `<path d="M45 8 L43 20 L55 20 M43 20 L34 27" fill="none" stroke="#65260f" stroke-opacity=".6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` +
      stroke('M31 25 L40 22 M29 30 L38 27', 2.6),
    nodes: [[19, 55], [45, 8], [55, 20]] },
  { id: 'factorio', name: 'Factorio', top: '#c28b2c', bottom: '#664314', node: '#fff0c2',
    art: () =>
      fill(gear(36, 28, 17, 12.5, 9), W, ' fill-opacity=".95"') +
      `<circle cx="36" cy="28" r="5.2" fill="#8a5d1b"/>` +
      stroke('M8 56 H24', 4) + stroke('M15 56 V44 L27 39', 3.6),
    nodes: [[15, 44], [27, 39]] }
]

function svg(g) {
  // Ids con el juego delante: si varios iconos se insertan en la misma página
  // (en línea, no como <img>), sus degradados y filtros no se pisan.
  const id = `qubiq-${g.id}`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="${g.name}">
<!-- Icono propio de QubiQ Server Launcher (GPLv3). No es un logotipo oficial de ${g.name}
     ni está hecho a partir de él: evoca el tema del juego sin usar sus marcas.
     Criterio en ANALISIS.md §13.1. -->
<defs>
<linearGradient id="${id}-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${g.top}"/><stop offset="1" stop-color="${g.bottom}"/></linearGradient>
<filter id="${id}-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect x="1" y="1" width="62" height="62" rx="15" fill="url(#${id}-bg)"/>
<rect x="1.5" y="1.5" width="61" height="61" rx="14.5" fill="none" stroke="#ffffff" stroke-opacity=".16"/>
<path d="M3 16 Q3 3 16 3 H48 Q61 3 61 16 V20 Q32 12 3 26 Z" fill="#ffffff" fill-opacity=".07"/>
${g.art()}
${g.nodes.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.9" fill="${g.node}" filter="url(#${id}-glow)"/>`).join('\n')}
</svg>
`
}

for (const g of GAMES) {
  const dir = join(REPO, 'src', 'renderer', 'src', 'games', g.id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'icon.svg'), svg(g))
  console.log(`${g.id}/icon.svg`)
}
