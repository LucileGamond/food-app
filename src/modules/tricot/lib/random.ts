// Tirages pseudo-aléatoires reproductibles : un même identifiant donne toujours le même dessin.

/** Graine stable tirée d'un identifiant : chaque projet a sa pelote, toujours enroulée pareil. */
export function seedOf(id: string): number {
  let h = 2166136261
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return (Math.abs(h) % 2147483646) + 1
}

/** Tirage pseudo-aléatoire reproductible (Park-Miller). */
export function random(seed: number): () => number {
  let s = seed % 2147483647 || 1
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}
