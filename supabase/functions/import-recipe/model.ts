// Appel au modèle (API Messages d'Anthropic) pour transformer le contenu nettoyé en recette structurée.

import { callTool, HttpError, type ModelOptions, type ModelUsage } from '../_shared/anthropic.ts'
import type { PageContent } from './extract.ts'
import { ENGLISH_UNITS, MAX_PHOTO_RECIPES, NUTRITION_BASES, sanitizeRecipe, sanitizeRecipes, UNITS, type ImportedRecipe } from './recipe.ts'

export type { ModelOptions, ModelUsage }
export type { ImportedRecipe, PhotoArea } from './recipe.ts'
const MAX_KNOWN_TAGS = 40

/** Erreur d'import : statut HTTP et message lisible. */
export const ImportError = HttpError
export type ImportError = HttpError

const TOOL_NAME = 'enregistrer_recette'

const TOOL = {
  name: TOOL_NAME,
  description: 'Enregistre la recette extraite de la page.',
  input_schema: {
    type: 'object',
    properties: {
      is_recipe: { type: 'boolean', description: 'false si la page ne contient pas de recette de cuisine.' },
      title: { type: 'string', description: 'Nom de la recette, sans le nom du site.' },
      servings: { anyOf: [{ type: 'integer' }, { type: 'null' }], description: 'Nombre de portions / personnes, null si inconnu.' },
      ingredients: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Ingrédient seul, en minuscules, sans la quantité (ex. « farine », « œufs »).' },
            quantity: { anyOf: [{ type: 'number' }, { type: 'null' }], description: 'Quantité numérique (½ → 0.5, « un » → 1), null si non précisée.' },
            unit: {
              anyOf: [{ type: 'string', enum: [...UNITS, ...ENGLISH_UNITS] }, { type: 'null' }],
              description:
                'Unité de la liste (cuillère à soupe → « c. à s. », à café → « c. à c. », tbsp → « c. à s. », tsp → « c. à c. », grammes → « g »…) ; null pour un nombre de pièces (3 œufs). Unité anglaise (oz, lb, fl oz, cup, pint, quart, gallon, stick) : recopiée telle quelle avec sa quantité, sans la convertir (cup → « cup », jamais « tasse ») ; l’application convertit. Autre unité absente de la liste : null, et la quantité avec son unité dans note.',
            },
            note: {
              anyOf: [{ type: 'string' }, { type: 'null' }],
              description: 'Précision facultative : préparation (« émincés »), qualité (« bombée », « bio »), alternative, ou unité hors liste (« 1 shot »).',
            },
            section: {
              anyOf: [{ type: 'string' }, { type: 'null' }],
              description: 'Sous-partie de la recette à laquelle appartient l’ingrédient, telle qu’écrite (« Pour le streusel »), null si la recette n’en a pas.',
            },
          },
          required: ['name', 'quantity', 'unit', 'note', 'section'],
        },
      },
      steps: { type: 'string', description: 'Étapes de préparation numérotées, une par ligne (« 1. … »), reformulées sans rien inventer.' },
      tags: { type: 'array', items: { type: 'string' }, description: '0 à 5 tags courts en minuscules (ex. végé, rapide, dessert).' },
      checks: {
        type: 'array',
        description:
          'Points que la personne doit vérifier, 0 à 8 : passage illisible ou deviné, quantité approximative (« 4 ou 5 »), renvoi à une autre recette (« voir p. 208 »), unité hors liste. Liste vide si tout est clair.',
        items: {
          type: 'object',
          properties: {
            ingredient: { anyOf: [{ type: 'integer' }, { type: 'null' }], description: 'Numéro de l’ingrédient concerné dans la liste (à partir de 0), null pour la recette en général.' },
            ingredient_name: {
              anyOf: [{ type: 'string' }, { type: 'null' }],
              description: 'Nom de l’ingrédient concerné, recopié exactement comme dans ingredients ; null pour la recette en général.',
            },
            message: { type: 'string', description: 'Ce qu’il faut vérifier, en une phrase courte.' },
          },
          required: ['ingredient', 'ingredient_name', 'message'],
        },
      },
      prep_minutes: { anyOf: [{ type: 'integer' }, { type: 'null' }], description: 'Temps de préparation en minutes, null si non indiqué.' },
      rest_minutes: { anyOf: [{ type: 'integer' }, { type: 'null' }], description: 'Temps de repos, de réfrigération ou de levée en minutes, null si non indiqué.' },
      cook_minutes: {
        anyOf: [{ type: 'integer' }, { type: 'null' }],
        description: 'Temps de cuisson en minutes (pour une fourchette « 30 à 40 min », la valeur la plus longue), null si non indiqué.',
      },
      source: {
        anyOf: [{ type: 'string' }, { type: 'null' }],
        description: 'Photo seulement : titre du livre ou du magazine s’il est visible (sans la page) ; null sinon, et pour une page web.',
      },
      page: {
        anyOf: [{ type: 'string' }, { type: 'null' }],
        description: 'Photo seulement : numéro de page imprimé (« 146 », « 146-147 ») ; null s’il n’est pas lisible, et pour une page web.',
      },
      nutrition: {
        anyOf: [
          {
            type: 'object',
            properties: {
              per: { type: 'string', enum: [...NUTRITION_BASES], description: 'Ce à quoi se rapportent les valeurs : une portion, toute la recette, ou 100 g.' },
              kcal: { anyOf: [{ type: 'number' }, { type: 'null' }], description: 'Calories (kcal).' },
              carbs: { anyOf: [{ type: 'number' }, { type: 'null' }], description: 'Glucides, en grammes.' },
              protein: { anyOf: [{ type: 'number' }, { type: 'null' }], description: 'Protéines, en grammes.' },
              fat: { anyOf: [{ type: 'number' }, { type: 'null' }], description: 'Lipides, en grammes.' },
            },
            required: ['per', 'kcal', 'carbs', 'protein', 'fat'],
          },
          { type: 'null' },
        ],
        description: 'Valeurs nutritionnelles seulement si la recette les indique (calories, glucides, protéines, lipides) ; null sinon. Ne calcule rien.',
      },
    },
    required: ['is_recipe', 'title', 'servings', 'ingredients', 'steps', 'tags', 'checks', 'prep_minutes', 'rest_minutes', 'cook_minutes', 'source', 'page', 'nutrition'],
  },
}

const SYSTEM = [
  'Tu extrais une recette de cuisine à partir du contenu d’une page web, en français.',
  'N’invente rien : si une information manque, laisse-la vide ou null.',
  'Traduis en français si la page est dans une autre langue.',
  'Pour les tags, réutilise de préférence les tags existants fournis.',
  'Reprends les valeurs nutritionnelles (calories, glucides, protéines, lipides) si la page les donne, sans les calculer.',
  `Réponds uniquement en appelant l’outil ${TOOL_NAME}.`,
].join('\n')

/** Message envoyé au modèle : données structurées si possible, sinon texte nettoyé. */
export function buildUserMessage(content: PageContent, url: string, knownTags: readonly string[]): string {
  const tags = knownTags.slice(0, MAX_KNOWN_TAGS).join(', ')
  const header = [`Page : ${url}`, tags ? `Tags existants : ${tags}` : null].filter(Boolean).join('\n')
  if (content.structured) return `${header}\n\nDonnées structurées de la recette (JSON) :\n${JSON.stringify(content.structured)}`
  return `${header}${content.title ? `\nTitre de la page : ${content.title}` : ''}\n\nTexte de la page :\n${content.text}`
}

/** Appelle le modèle et renvoie la recette validée. */
export async function extractRecipe(
  content: PageContent,
  url: string,
  knownTags: readonly string[],
  options: ModelOptions,
  timeoutMs = 60_000,
): Promise<{ recipe: ImportedRecipe; usage: ModelUsage | null }> {
  const { input, usage } = await callTool(
    {
      system: SYSTEM,
      tool: TOOL,
      message: buildUserMessage(content, url, knownTags),
      maxTokens: 8192,
      timeoutMs,
      failure: 'L’analyse de la page a échoué',
      missing: 'réponse sans recette',
    },
    options,
  )
  return { recipe: sanitizeRecipe(input, content.title), usage }
}

// ---------------------------------------------------------------------------
// Photos d'une page de livre ou d'un scan

export interface PhotoInput {
  /** Image en base64 (sans préfixe data:). */
  data: string
  type: 'image/jpeg' | 'image/png' | 'image/webp'
}

const PHOTO_TOOL_NAME = 'enregistrer_recettes'

/** Photo : une page peut contenir plusieurs recettes, chacune avec le même contenu qu'une recette de page web. */
const PHOTO_TOOL = {
  name: PHOTO_TOOL_NAME,
  description: 'Enregistre les recettes lues sur la photo (une le plus souvent).',
  input_schema: {
    type: 'object',
    properties: {
      recettes: {
        type: 'array',
        description: `Une entrée par recette distincte, avec son propre titre (${MAX_PHOTO_RECIPES} au plus) ; liste vide si la photo ne contient pas de recette.`,
        items: {
          ...TOOL.input_schema,
          properties: {
            ...TOOL.input_schema.properties,
            photo: {
              anyOf: [
                {
                  type: 'object',
                  properties: {
                    image: { type: 'integer', description: 'Numéro de l’image où se trouve la photo (à partir de 0).' },
                    left: { type: 'number', description: 'Bord gauche, en fraction de la largeur de l’image (0 à 1).' },
                    top: { type: 'number', description: 'Bord haut, en fraction de la hauteur de l’image (0 à 1).' },
                    right: { type: 'number', description: 'Bord droit, en fraction de la largeur (0 à 1).' },
                    bottom: { type: 'number', description: 'Bord bas, en fraction de la hauteur (0 à 1).' },
                    rotation: {
                      type: 'integer',
                      enum: [0, 90, 180, 270],
                      description:
                        'Quart de tour, dans le sens des aiguilles d’une montre, qui remet la photo à l’endroit (comme le texte de la page se lit) : 0 si l’image est déjà droite, 180 si la page est à l’envers, 90 ou 270 si elle est couchée.',
                    },
                  },
                  required: ['image', 'left', 'top', 'right', 'bottom', 'rotation'],
                },
                { type: 'null' },
              ],
              description:
                'Photo du plat de cette recette imprimée sur la page : cadre serré autour de la photo seule (sans texte, marge ni légende) ; null s’il n’y en a pas.',
            },
          },
          required: [...TOOL.input_schema.required, 'photo'],
        },
      },
    },
    required: ['recettes'],
  },
}

const PHOTO_SYSTEM = [
  'Tu lis des recettes de cuisine sur une à quatre photos (page de livre, magazine, fiche, scan, ou captures d’écran d’une publication comme la légende d’un reel Instagram), en français.',
  'Recopie fidèlement ce qui est écrit, sans rien inventer : si un passage est illisible, laisse-le de côté.',
  'Si les photos sont des pages ou des captures successives de la même recette, assemble-les dans l’ordre, sans répéter un passage visible sur deux captures.',
  'Sur une capture d’écran, ignore ce qui n’est pas la recette (nom du compte, mentions J’aime, commentaires, hashtags, boutons).',
  'Une page peut contenir plusieurs recettes distinctes, chacune avec son titre : renvoie-les toutes, dans l’ordre de la page.',
  'Les parties d’une même recette (« Pour la pâte », « Pour la garniture ») ne sont pas des recettes à part.',
  'Range chaque ingrédient dans sa sous-partie (section) quand la recette en a (« Pour le streusel »).',
  'Signale dans checks tout ce que tu as deviné ou mal lu.',
  'Note le titre du livre s’il est visible et le numéro de page imprimé, séparément.',
  'Reprends les valeurs nutritionnelles (calories, glucides, protéines, lipides) si la recette les indique, sans les calculer.',
  'Si une image montre une photo du plat terminé de la recette, donne son cadre (photo) : cadre serré autour de la photo seule, en fractions de la largeur et de la hauteur de l’image telle que tu la reçois, avec le quart de tour qui la remet à l’endroit si la page est couchée ou à l’envers. Pas pour un schéma, une illustration décorative, une photo d’étape ou une capture d’écran de vidéo ; null en cas de doute.',
  'Traduis en français si la recette est dans une autre langue.',
  'Pour les tags, réutilise de préférence les tags existants fournis.',
  `Réponds uniquement en appelant l’outil ${PHOTO_TOOL_NAME}.`,
].join('\n')

/** Nouvelle lecture demandée par la personne : la page avait été jugée sans recette, elle affirme le contraire. */
export const INSIST_NOTE =
  'La personne confirme qu’il y a bien une recette sur ces photos (une première lecture n’en avait pas trouvé) : lis-la même si elle est peu lisible, incomplète ou présentée de façon inhabituelle (ingrédients cités dans le texte, recette courte, mise en page originale). Ne réponds pas qu’il n’y a pas de recette.'

/** Lit les recettes sur les photos (une le plus souvent) et les renvoie validées, dans l'ordre de la page. */
export async function extractRecipeFromPhotos(
  photos: readonly PhotoInput[],
  knownTags: readonly string[],
  options: ModelOptions,
  insist = false,
): Promise<{ recipes: ImportedRecipe[]; usage: ModelUsage | null }> {
  const tags = knownTags.slice(0, MAX_KNOWN_TAGS).join(', ')
  const text = [
    photos.length > 1 ? `${photos.length} images, numérotées de 0 à ${photos.length - 1} dans l’ordre.` : 'Une image (numéro 0).',
    tags ? `Tags existants : ${tags}` : null,
    insist ? INSIST_NOTE : null,
  ]
    .filter(Boolean)
    .join('\n')
  const { input, usage } = await callTool(
    {
      system: PHOTO_SYSTEM,
      tool: PHOTO_TOOL,
      message: [...photos.map((p) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: p.type, data: p.data } })), { type: 'text', text }],
      maxTokens: 8192,
      // Lire deux pages et tout rédiger peut prendre plus longtemps qu'une page web déjà structurée.
      timeoutMs: 90_000,
      failure: 'La lecture de la photo a échoué',
      missing: 'réponse sans recette',
    },
    options,
  )
  return { recipes: sanitizeRecipes(input, photos.length), usage }
}
