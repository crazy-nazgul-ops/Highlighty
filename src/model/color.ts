export function cssColor(hex: string, alpha: number): string {
  const raw = hex.trim().replace('#', '')
  const full = raw.length === 3 ? raw.split('').map((part) => part + part).join('') : raw
  const value = Number.parseInt(full, 16)
  if (!Number.isFinite(value) || full.length !== 6) return `rgba(180, 160, 60, ${alpha})`
  const red = (value >> 16) & 255
  const green = (value >> 8) & 255
  const blue = value & 255
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

export function clampOpacity(value: number): number {
  if (!Number.isFinite(value)) return 0.4
  return Math.min(0.75, Math.max(0.15, value))
}
