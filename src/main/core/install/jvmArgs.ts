import { totalmem } from 'node:os'

/**
 * Argumentos de JVM (§6.1).
 *
 * Base: los flags de Aikar, estándar de facto para G1GC en servidores de Minecraft.
 * `Xms = Xmx` es intencional: reservar de golpe evita pausas por crecimiento del heap.
 */

export function memoryArgs(memoryMb: number): string[] {
  return [`-Xms${memoryMb}M`, `-Xmx${memoryMb}M`]
}

export function performanceArgs(memoryMb: number): string[] {
  const args = [
    '-XX:+UseG1GC',
    '-XX:+ParallelRefProcEnabled',
    '-XX:MaxGCPauseMillis=200',
    '-XX:+UnlockExperimentalVMOptions',
    '-XX:+DisableExplicitGC',
    '-XX:+AlwaysPreTouch',
    '-XX:G1HeapWastePercent=5',
    '-XX:G1MixedGCCountTarget=4',
    '-XX:G1MixedGCLiveThresholdPercent=90',
    '-XX:G1RSetUpdatingPauseTimePercent=5',
    '-XX:SurvivorRatio=32',
    '-XX:+PerfDisableSharedMem',
    '-XX:MaxTenuringThreshold=1',
    '-Dusing.aikars.flags=https://mcflags.emc.gs',
    '-Daikars.new.flags=true'
  ]

  // Aikar recomienda valores distintos a partir de 12 GB.
  if (memoryMb >= 12288) {
    args.push(
      '-XX:G1NewSizePercent=40',
      '-XX:G1MaxNewSizePercent=50',
      '-XX:G1HeapRegionSize=16M',
      '-XX:G1ReservePercent=15',
      '-XX:InitiatingHeapOccupancyPercent=20'
    )
  } else {
    args.push(
      '-XX:G1NewSizePercent=30',
      '-XX:G1MaxNewSizePercent=40',
      '-XX:G1HeapRegionSize=8M',
      '-XX:G1ReservePercent=20',
      '-XX:InitiatingHeapOccupancyPercent=15'
    )
  }

  return args
}

export function defaultJvmArgs(memoryMb: number): string[] {
  return [...memoryArgs(memoryMb), ...performanceArgs(memoryMb)]
}

/**
 * RAM sugerida. Se calcula sobre la memoria TOTAL menos un margen para el
 * sistema, porque el anfitrión suele jugar en el mismo equipo (§6.1).
 * Dar de más es el error clásico que congela el PC.
 */
export function suggestedMemoryMb(): number {
  const totalMb = Math.floor(totalmem() / (1024 * 1024))
  const reserved = 4096 // margen para Windows, el navegador y el propio juego
  const usable = totalMb - reserved
  const suggestion = Math.min(usable, 8192)
  // Nunca por debajo de 2 GB: menos que eso no arranca un servidor moderno.
  return Math.max(2048, Math.floor(suggestion / 512) * 512)
}

/**
 * Memoria recomendada según cuánta gente se espera y qué tipo de servidor es.
 *
 * El coste se reparte en dos partes: una fija, que paga el servidor por existir
 * (mucho mayor con mods, porque cargan miles de clases y registros), y otra por
 * jugador, que es sobre todo chunks cargados alrededor de cada uno.
 *
 * Son cifras orientativas: un modpack pesado puede duplicar la parte fija. Por
 * eso la interfaz la presenta como recomendación y deja mover el control.
 */
const MEMORY_PROFILE: Record<string, { baseMb: number; perPlayerMb: number }> = {
  vanilla: { baseMb: 1536, perPlayerMb: 150 },
  paper: { baseMb: 1536, perPlayerMb: 150 },
  fabric: { baseMb: 3072, perPlayerMb: 200 },
  forge: { baseMb: 4096, perPlayerMb: 200 }
}

export function recommendedMemoryMb(expectedPlayers: number, distribution: string): number {
  const profile = MEMORY_PROFILE[distribution] ?? MEMORY_PROFILE['paper']!
  const players = Math.max(1, Math.min(200, Math.round(expectedPlayers)))

  const raw = profile.baseMb + profile.perPlayerMb * players

  // Nunca se recomienda dejar al equipo sin margen: el anfitrión suele jugar
  // en la misma máquina, y quedarse sin RAM la congela entera (§6.1).
  //
  // ⚠ El redondeo va ANTES del límite, no después: redondear al alza sobre un
  // valor ya limitado puede volver a superar el techo, que es exactamente lo
  // que este límite existe para impedir.
  const ceiling = Math.max(2048, Math.floor((totalMemoryMb() - 4096) / 512) * 512)
  const rounded = Math.round(raw / 512) * 512

  return Math.max(2048, Math.min(rounded, ceiling))
}

/** Techo por encima del cual conviene avisar al usuario (§6.1). */
export function memoryWarningThresholdMb(): number {
  const totalMb = Math.floor(totalmem() / (1024 * 1024))
  return Math.max(2048, totalMb - 4096)
}

export function totalMemoryMb(): number {
  return Math.floor(totalmem() / (1024 * 1024))
}
