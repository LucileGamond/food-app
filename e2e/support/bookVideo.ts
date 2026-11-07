// Vidéo de fausse caméra pour Chrome (--use-file-for-fake-video-capture) : des pages de livre qu'on tourne.
// Générée au lancement du test (format Y4M, gris), pour ne pas garder de vidéo dans le dépôt.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const W = 240
const H = 320
const FPS = 10

/** Page simulée : fond clair, lignes de « texte » et un titre, placés selon la graine. */
function page(seed: number): Uint8Array {
  const data = new Uint8Array(W * H).fill(235)
  let s = seed
  const rand = () => (s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
  const top = 20 + Math.floor(rand() * 120)
  const left = 20 + Math.floor(rand() * 100)
  for (let y = top; y < top + 30; y++) for (let x = left; x < left + 90; x++) data[y * W + x] = 20
  for (let line = 12; line < H - 12; line += 9) {
    let x = 10 + Math.floor(rand() * 12)
    while (x < W - 16) {
      const word = 5 + Math.floor(rand() * 20)
      for (let y = line; y < line + 4; y++) for (let dx = 0; dx < word && x + dx < W - 10; dx++) data[y * W + x + dx] = 30
      x += word + 4
    }
  }
  return data
}

/** Page décalée horizontalement (en train d'être tournée). */
function shifted(source: Uint8Array, dx: number): Uint8Array {
  const data = new Uint8Array(W * H).fill(200)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x - dx >= 0 && x - dx < W) data[y * W + x] = source[y * W + x - dx]!
  return data
}

/** Écrit la vidéo : page 1 immobile 3 s, on tourne, page 2 immobile 3 s, on tourne (puis la vidéo boucle). */
export function writeBookVideo(path: string): string {
  const first = page(7)
  const second = page(42)
  const turn = (from: Uint8Array, to: Uint8Array) => [shifted(from, 40), shifted(from, 90), shifted(to, -90), shifted(to, -40)]
  const frames = [...Array(30).fill(first), ...turn(first, second), ...Array(30).fill(second), ...turn(second, first)] as Uint8Array[]
  const chroma = new Uint8Array((W / 2) * (H / 2) * 2).fill(128)
  const header = Buffer.from(`YUV4MPEG2 W${W} H${H} F${FPS}:1 Ip A1:1 C420jpeg\n`)
  const parts: Buffer[] = [header]
  for (const frame of frames) parts.push(Buffer.from('FRAME\n'), Buffer.from(frame), Buffer.from(chroma))
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, Buffer.concat(parts))
  return path
}
