/** Texte à comparer : minuscules, sans accents, œ/æ développés, espaces simples (« Œufs  frais » → « oeufs frais »). */
export function foldText(text: string): string {
  return text
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** « oignon » → « Oignon » */
export function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase('fr-FR') + text.slice(1)
}

/** « 1 rang », « 3 rangs » (pluriel en -s). */
export const plural = (n: number, word: string): string => `${n} ${word}${n > 1 ? 's' : ''}`

/** 3.5 → « 3,5 ». */
export const decimal = (n: number): string => String(n).replace('.', ',')
