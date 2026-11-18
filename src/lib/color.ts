export type RGB = [number, number, number]

export const rgbHex = (c: readonly number[] | null | undefined) =>
  c ? "#" + c.slice(0, 3).map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("") : "transparent"

export const hexRgb = (h: string): RGB => {
  const n = parseInt(h.replace("#", ""), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
