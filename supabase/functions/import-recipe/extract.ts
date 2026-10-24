// Réduit une page de recette au strict nécessaire avant de l'envoyer au modèle :
// 1. les données structurées schema.org/Recipe (JSON-LD) quand le site en publie (cas le plus courant) ;
// 2. sinon le texte du contenu principal, débarrassé du menu, des publicités, commentaires, scripts…

import { parseHTML } from 'linkedom'

/** Au-delà, le texte est tronqué (≈ 4 000 tokens). */
export const MAX_TEXT_CHARS = 15_000
/** En dessous, la page est jugée illisible (page vide, protégée, rendue en JavaScript…). */
export const MIN_TEXT_CHARS = 200

export interface StructuredRecipe {
  name?: string
  yield?: string
  ingredients: string[]
  instructions: string[]
  keywords?: string
  category?: string
  cuisine?: string
}

export interface PageContent {
  /** Recette structurée (JSON-LD) si la page en contient une avec des ingrédients. */
  structured: StructuredRecipe | null
  /** Texte nettoyé du contenu principal (vide si `structured` suffit). */
  text: string
  title: string | null
  imageUrl: string | null
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
type JsonObject = { [key: string]: Json }

const isObject = (v: Json | undefined): v is JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v)

function hasType(node: JsonObject, type: string): boolean {
  const t = node['@type']
  return t === type || (Array.isArray(t) && t.includes(type))
}

/** Parcourt tout le JSON-LD (tableaux, @graph, objets imbriqués) à la recherche d'un nœud Recipe. */
function findRecipe(node: Json | undefined, depth = 0): JsonObject | null {
  if (depth > 6 || node === undefined || node === null) return null
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipe(item, depth + 1)
      if (found) return found
    }
    return null
  }
  if (!isObject(node)) return null
  if (hasType(node, 'Recipe')) return node
  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement']) {
    const found = findRecipe(node[key], depth + 1)
    if (found) return found
  }
  return null
}

function clean(text: string, decode: (s: string) => string): string {
  return decode(text).replace(/\s+/g, ' ').trim()
}

function asText(value: Json | undefined, decode: (s: string) => string): string | undefined {
  if (typeof value === 'string') return clean(value, decode) || undefined
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) {
    const parts = value.map((v) => asText(v, decode)).filter((v): v is string => Boolean(v))
    return parts.length ? parts.join(', ') : undefined
  }
  return undefined
}

/** recipeInstructions : texte, liste de textes, HowToStep, HowToSection (avec sous-étapes). */
function instructionLines(value: Json | undefined, decode: (s: string) => string, depth = 0): string[] {
  if (depth > 4 || value === undefined || value === null) return []
  if (typeof value === 'string') {
    // Certaines pages mettent tout dans une seule chaîne, parfois en HTML.
    return decode(value.replace(/<\/(p|li|br)>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''))
      .split(/\n+/)
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
  }
  if (Array.isArray(value)) return value.flatMap((v) => instructionLines(v, decode, depth + 1))
  if (!isObject(value)) return []
  if (hasType(value, 'HowToSection')) {
    const name = asText(value.name, decode)
    const steps = instructionLines(value.itemListElement, decode, depth + 1)
    return name ? [`${name} :`, ...steps] : steps
  }
  return instructionLines(value.text ?? value.name ?? value.description, decode, depth + 1)
}

function imageOf(value: Json | undefined): string | null {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return imageOf(value[0])
  if (isObject(value)) return imageOf(value.url ?? value.contentUrl)
  return null
}

function toStructured(node: JsonObject, decode: (s: string) => string): StructuredRecipe {
  const ingredients = (Array.isArray(node.recipeIngredient) ? node.recipeIngredient : Array.isArray(node.ingredients) ? node.ingredients : [])
    .map((i) => asText(i, decode))
    .filter((i): i is string => Boolean(i))
  const recipe: StructuredRecipe = {
    name: asText(node.name, decode),
    yield: asText(node.recipeYield, decode),
    ingredients,
    instructions: instructionLines(node.recipeInstructions, decode),
    keywords: asText(node.keywords, decode),
    category: asText(node.recipeCategory, decode),
    cuisine: asText(node.recipeCuisine, decode),
  }
  // Retire les champs vides pour économiser des tokens.
  for (const key of Object.keys(recipe) as (keyof StructuredRecipe)[]) {
    if (recipe[key] === undefined) delete recipe[key]
  }
  return recipe
}

// Éléments jamais utiles pour une recette.
const DROP_SELECTORS = [
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'canvas',
  'iframe',
  'object',
  'video',
  'audio',
  'picture',
  'img',
  'form',
  'button',
  'select',
  'input',
  'textarea',
  'nav',
  'header',
  'footer',
  'aside',
  'dialog',
  '[hidden]',
  '[aria-hidden="true"]',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[role="complementary"]',
  '[role="dialog"]',
]

// Blocs parasites repérés par leur classe ou leur id.
const NOISE = /(^|[\s_-])(comments?|cookies?|consent|newsletter|share|sharing|social|ads?|advert\w*|promo\w*|related|recommend\w*|sidebar|breadcrumbs?|popup|modal|banner|subscribe|outbrain|taboola)([\s_-]|$)/i

const BLOCKS = new Set([
  'ADDRESS', 'ARTICLE', 'BLOCKQUOTE', 'BR', 'DD', 'DIV', 'DL', 'DT', 'FIGCAPTION', 'FIGURE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'HR', 'LI', 'MAIN', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TBODY', 'THEAD', 'TR', 'UL',
])

interface DomNode {
  nodeType: number
  nodeName: string
  textContent: string | null
  childNodes: ArrayLike<DomNode>
}

/** Texte lisible : un bloc par ligne, puces pour les listes. */
function textOf(root: DomNode): string {
  const out: string[] = []
  const walk = (node: DomNode) => {
    if (node.nodeType === 3) {
      out.push(node.textContent ?? '')
      return
    }
    if (node.nodeType !== 1) return
    const block = BLOCKS.has(node.nodeName)
    if (block) out.push('\n')
    if (node.nodeName === 'LI') out.push('- ')
    for (const child of Array.from(node.childNodes)) walk(child)
    if (block) out.push('\n')
    else if (node.nodeName === 'TD' || node.nodeName === 'TH') out.push(' ')
  }
  walk(root)
  const lines = out
    .join('')
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    .filter((line) => line !== '' && line !== '-')
  // Supprime les lignes identiques consécutives (titres répétés, boutons…).
  return lines.filter((line, i) => line !== lines[i - 1]).join('\n')
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastBreak = cut.lastIndexOf('\n')
  return (lastBreak > max * 0.8 ? cut.slice(0, lastBreak) : cut) + '\n[…]'
}

export function extractPage(html: string, pageUrl: string): PageContent {
  const { document } = parseHTML(html)
  const decoder = document.createElement('div')
  const decode = (s: string) => {
    if (!/[&<]/.test(s)) return s
    decoder.innerHTML = s.replace(/</g, '&lt;')
    return decoder.textContent ?? s
  }
  const meta = (selector: string) => document.querySelector(selector)?.getAttribute('content')?.trim() || null

  let recipeNode: JsonObject | null = null
  for (const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      recipeNode = findRecipe(JSON.parse(script.textContent ?? '') as Json)
    } catch {
      // JSON-LD mal formé : ignoré
    }
    if (recipeNode) break
  }
  const structured = recipeNode ? toStructured(recipeNode, decode) : null
  const usable = structured && structured.ingredients.length > 0 ? structured : null

  const rawImage = (recipeNode && imageOf(recipeNode.image)) || meta('meta[property="og:image"]') || meta('meta[name="twitter:image"]')
  let imageUrl: string | null = null
  if (rawImage) {
    try {
      imageUrl = new URL(rawImage, pageUrl).href
    } catch {
      imageUrl = null
    }
  }
  const title = usable?.name ?? meta('meta[property="og:title"]') ?? (document.querySelector('h1')?.textContent?.trim() || document.title?.trim() || null)

  if (usable) return { structured: usable, text: '', title, imageUrl }

  for (const el of Array.from(document.querySelectorAll(DROP_SELECTORS.join(',')))) el.remove()
  for (const el of Array.from(document.querySelectorAll('[class],[id]'))) {
    const label = `${el.getAttribute('class') ?? ''} ${el.getAttribute('id') ?? ''}`
    if (!NOISE.test(label) || !el.isConnected) continue
    // Ne jamais retirer le contenu principal (ex. <body class="has-sidebar">).
    if (['HTML', 'BODY', 'MAIN', 'ARTICLE'].includes(el.tagName) || el.querySelector('main, article, [itemtype*="schema.org/Recipe"]')) continue
    el.remove()
  }
  const root =
    document.querySelector('[itemtype*="schema.org/Recipe"]') ?? document.querySelector('article') ?? document.querySelector('main') ?? document.body
  const text = root ? truncate(textOf(root as unknown as DomNode), MAX_TEXT_CHARS) : ''
  return { structured: null, text, title, imageUrl }
}
