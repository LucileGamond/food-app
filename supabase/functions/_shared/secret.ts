/** Comparaison en temps constant (le secret ne se devine pas caractère par caractère). */
export function sameSecret(given: string | null, expected: string): boolean {
  const a = new TextEncoder().encode(given ?? '')
  const b = new TextEncoder().encode(expected)
  let diff = a.length ^ b.length
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i]!
  return diff === 0
}
