import { formatCompactDate, type IsoDate } from './dates'
import type { Database } from './database.types'
import { formatQuantity, parseQuantity, roundQuantity } from './recipes'
import { isUnit, unitLabel } from './units'

export type Aisle = Database['public']['Enums']['shopping_aisle']

/** Rayons, dans l'ordre d'un magasin. */
export const AISLES: readonly { value: Aisle; label: string }[] = [
  { value: 'FRUITS_LEGUMES', label: 'Fruits et légumes' },
  { value: 'BOULANGERIE', label: 'Boulangerie' },
  { value: 'BOUCHERIE_POISSON', label: 'Boucherie et poisson' },
  { value: 'CREMERIE', label: 'Crèmerie' },
  { value: 'EPICERIE_SALEE', label: 'Épicerie salée' },
  { value: 'EPICERIE_SUCREE', label: 'Épicerie sucrée' },
  { value: 'SURGELES', label: 'Surgelés' },
  { value: 'BOISSONS', label: 'Boissons' },
  { value: 'HYGIENE_MAISON', label: 'Hygiène et maison' },
  { value: 'AUTRE', label: 'Autre' },
]

export function aisleLabel(aisle: Aisle): string {
  return AISLES.find((a) => a.value === aisle)!.label
}

export interface ShoppingList {
  id: string
  name: string
  updated_at: string
  total: number
  checked: number
}

export interface ShoppingItem {
  id: string
  list_id: string
  name: string
  quantity: number | null
  unit: string | null
  aisle: Aisle
  checked: boolean
  position: number
}

export interface ShoppingItemInput {
  name: string
  quantity: number | null
  unit: string | null
  aisle: Aisle
}

// ---------------------------------------------------------------------------
// Rayon deviné à partir du nom

/** « Œufs Frais » → « oeufs frais » */
export function normalizeName(text: string): string {
  return text
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const KEYWORDS: Record<Aisle, string[]> = {
  FRUITS_LEGUMES: [
    'pomme de terre', 'patate', 'pomme', 'poire', 'banane', 'orange', 'clementine', 'mandarine', 'citron', 'pamplemousse', 'fraise',
    'framboise', 'myrtille', 'raisin', 'kiwi', 'ananas', 'mangue', 'peche', 'nectarine', 'abricot', 'cerise', 'prune', 'melon', 'pasteque',
    'figue', 'avocat', 'tomate', 'salade', 'laitue', 'mache', 'roquette', 'carotte', 'courgette', 'aubergine', 'poivron', 'concombre',
    'oignon', 'echalote', 'ail', 'poireau', 'champignon', 'brocoli', 'chou', 'chou-fleur', 'epinard', 'haricot vert', 'radis', 'betterave',
    'celeri', 'fenouil', 'persil', 'basilic', 'coriandre', 'menthe', 'ciboulette', 'thym', 'romarin', 'aneth', 'estragon', 'gingembre',
    'citrouille', 'potiron', 'courge', 'butternut', 'navet', 'endive', 'artichaut', 'asperge', 'patate douce', 'fruit', 'legume',
  ],
  BOULANGERIE: ['pain', 'baguette', 'brioche', 'croissant', 'pain au chocolat', 'viennoiserie', 'ficelle', 'fougasse'],
  BOUCHERIE_POISSON: [
    'viande', 'boeuf', 'steak', 'veau', 'porc', 'agneau', 'poulet', 'dinde', 'canard', 'jambon', 'lardon', 'saucisse', 'chorizo', 'bacon',
    'merguez', 'escalope', 'roti', 'cote', 'charcuterie', 'poisson', 'saumon', 'cabillaud', 'crevette', 'moule', 'truite', 'colin', 'lieu',
    'dorade', 'bar', 'gambas', 'saint-jacques', 'calamar',
  ],
  CREMERIE: [
    'lait', 'yaourt', 'yogourt', 'fromage', 'fromage blanc', 'beurre', 'creme', 'creme fraiche', 'oeuf', 'emmental', 'gruyere', 'parmesan',
    'mozzarella', 'comte', 'reblochon', 'tomme', 'chevre', 'feta', 'ricotta', 'mascarpone', 'skyr', 'petit suisse', 'camembert', 'brie', 'raclette', 'roquefort',
    // Pâtes à tarte : au rayon frais
    'pate brisee', 'pate feuilletee', 'pate sablee', 'pate a pizza',
  ],
  EPICERIE_SALEE: [
    'pate', 'spaghetti', 'tagliatelle', 'penne', 'riz', 'farine', 'huile', 'vinaigre', 'sel', 'poivre', 'epice', 'cumin', 'curry', 'paprika',
    'curcuma', 'moutarde', 'ketchup', 'mayonnaise', 'sauce', 'sauce soja', 'bouillon', 'conserve', 'lentille', 'pois chiche', 'haricot',
    'semoule', 'quinoa', 'boulgour', 'couscous', 'olive', 'cornichon', 'thon', 'sardine', 'mais', 'concentre de tomate', 'coulis', 'chips',
    'lait de coco', 'creme de coco', 'noix de coco', 'pate de curry', 'chapelure', 'puree', 'gnocchi', 'nouille', 'tortilla',
  ],
  EPICERIE_SUCREE: [
    'sucre', 'chocolat', 'cacao', 'confiture', 'miel', 'nutella', 'biscuit', 'gateau', 'cereale', 'granola', 'muesli', 'compote', 'cafe',
    'the', 'tisane', 'vanille', 'levure', 'sirop', 'bonbon', 'amande', 'noisette', 'noix', 'pistache', 'raisin sec', 'fruit sec', 'flocon',
    'petit beurre', 'madeleine', 'crepe',
  ],
  SURGELES: ['surgele', 'glace', 'frite', 'glacon', 'sorbet'],
  BOISSONS: ['eau', 'jus', 'soda', 'coca', 'biere', 'vin', 'cidre', 'champagne', 'limonade', 'boisson', 'sirop de', 'lait vegetal'],
  HYGIENE_MAISON: [
    'papier toilette', 'essuie-tout', 'sopalin', 'mouchoir', 'lessive', 'liquide vaisselle', 'pastille lave-vaisselle', 'eponge', 'savon',
    'shampoing', 'shampooing', 'dentifrice', 'brosse a dent', 'gel douche', 'sac poubelle', 'deodorant', 'coton', 'rasoir', 'nettoyant',
    'javel', 'papier alu', 'film alimentaire', 'papier cuisson',
  ],
  AUTRE: [],
}

// Mots-clés les plus longs d'abord : « pomme de terre » avant « pomme », « lait de coco » avant « lait ».
const KEYWORD_RULES: readonly { pattern: RegExp; aisle: Aisle }[] = (Object.entries(KEYWORDS) as [Aisle, string[]][])
  .flatMap(([aisle, words]) => words.map((word) => ({ word, aisle })))
  .sort((a, b) => b.word.length - a.word.length)
  .map(({ word, aisle }) => ({ pattern: new RegExp(`(^|[^a-z])${word.replace(/[-]/g, '[- ]')}(s|x)?([^a-z]|$)`), aisle }))

/** Rayon probable d'un article, d'après son nom (« Autre » si rien ne correspond). */
export function guessAisle(name: string): Aisle {
  const text = normalizeName(name)
  return KEYWORD_RULES.find((rule) => rule.pattern.test(text))?.aisle ?? 'AUTRE'
}

// ---------------------------------------------------------------------------
// Regroupement et affichage

export interface AisleGroup {
  aisle: Aisle
  label: string
  items: ShoppingItem[]
}

/** Articles à prendre, par rayon (ordre du magasin), et articles déjà dans le caddie. */
export function groupByAisle(items: readonly ShoppingItem[]): { groups: AisleGroup[]; checked: ShoppingItem[] } {
  const byPosition = [...items].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'fr'))
  const groups = AISLES.flatMap(({ value, label }) => {
    const list = byPosition.filter((i) => !i.checked && i.aisle === value)
    return list.length > 0 ? [{ aisle: value, label, items: list }] : []
  })
  return { groups, checked: byPosition.filter((i) => i.checked) }
}

/** « 500 g », « 3 gousses », « 2 » ; vide sans quantité. */
export function formatAmount(item: Pick<ShoppingItem, 'quantity' | 'unit'>): string {
  const unit = item.unit ? unitLabel(item.unit, item.quantity) : ''
  return [formatQuantity(item.quantity), unit].filter(Boolean).join(' ')
}

export function listProgress(list: Pick<ShoppingList, 'total' | 'checked'>): string {
  return `${list.checked} / ${list.total}`
}

/** « Courses du 25 oct. » */
export function defaultListName(today: IsoDate): string {
  return `Courses du ${formatCompactDate(today).replace(/\s\d{4}$/, '')}`
}

export function nextPosition(items: readonly Pick<ShoppingItem, 'position'>[]): number {
  return items.reduce((max, i) => Math.max(max, i.position), -1) + 1
}

// ---------------------------------------------------------------------------
// Fusion des doublons

/** Unités convertibles : masse en grammes, volume en millilitres. */
const UNIT_FACTORS: Readonly<Record<string, { base: 'g' | 'ml'; factor: number }>> = {
  g: { base: 'g', factor: 1 },
  kg: { base: 'g', factor: 1000 },
  ml: { base: 'ml', factor: 1 },
  cl: { base: 'ml', factor: 10 },
  dl: { base: 'ml', factor: 100 },
  l: { base: 'ml', factor: 1000 },
}

/** Quantité convertie dans l'unité `to`, ou null si les unités ne sont pas compatibles. */
export function convertQuantity(quantity: number, from: string | null, to: string | null): number | null {
  if ((from ?? '') === (to ?? '')) return quantity
  const a = from ? UNIT_FACTORS[from] : undefined
  const b = to ? UNIT_FACTORS[to] : undefined
  if (!a || !b || a.base !== b.base) return null
  return (quantity * a.factor) / b.factor
}

export interface MergePlan {
  item: ShoppingItem
  /** Nouvelle quantité de l'article existant (inchangée si aucune quantité). */
  quantity: number | null
}

/**
 * Article non coché déjà présent (même nom, unité identique ou convertible) auquel ajouter `input`,
 * avec la quantité additionnée dans l'unité de l'article existant. Null s'il faut créer un article.
 */
export function findMergeTarget(items: readonly ShoppingItem[], input: ShoppingItemInput): MergePlan | null {
  for (const item of items) {
    if (item.checked) continue
    const merged = addAmounts(item, input)
    if (merged) return { item, quantity: merged.quantity }
  }
  return null
}

type Amount = Pick<ShoppingItem, 'name' | 'quantity' | 'unit'>

/**
 * Quantité de `a` augmentée de celle de `b` (dans l'unité de `a`) s'il s'agit du même produit
 * (même nom normalisé) dans une unité identique ou convertible ; null sinon.
 */
export function addAmounts(a: Amount, b: Amount): { quantity: number | null } | null {
  if (normalizeName(a.name) !== normalizeName(b.name)) return null
  if (a.quantity === null && b.quantity === null && (a.unit ?? '') === (b.unit ?? '')) return { quantity: null }
  if (a.quantity === null || b.quantity === null) return null
  const added = convertQuantity(b.quantity, b.unit, a.unit)
  return added === null ? null : { quantity: roundQuantity(a.quantity + added) }
}

// ---------------------------------------------------------------------------
// Formulaire d'article

export interface ItemFormValues {
  name: string
  quantity: string
  unit: string
  aisle: Aisle
}

export type ItemFormErrors = Partial<Record<keyof ItemFormValues, string>>

export function emptyItemForm(): ItemFormValues {
  return { name: '', quantity: '', unit: '', aisle: 'AUTRE' }
}

export function itemToForm(item: ShoppingItem): ItemFormValues {
  return { name: item.name, quantity: formatQuantity(item.quantity), unit: item.unit ?? '', aisle: item.aisle }
}

export function validateItemForm(values: ItemFormValues): ItemFormErrors {
  const errors: ItemFormErrors = {}
  const name = values.name.trim()
  if (!name) errors.name = 'Nom requis'
  else if (name.length > 120) errors.name = '120 caractères maximum'
  const quantity = parseQuantity(values.quantity)
  if (quantity !== null && !(quantity > 0 && quantity < 100_000)) errors.quantity = 'Quantité invalide'
  if (values.unit !== '' && !isUnit(values.unit)) errors.unit = 'Unité inconnue'
  return errors
}

export function toItemInput(values: ItemFormValues): ShoppingItemInput {
  return { name: values.name.trim(), quantity: parseQuantity(values.quantity), unit: values.unit || null, aisle: values.aisle }
}
