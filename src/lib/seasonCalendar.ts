// Calendrier des fruits et légumes de saison (France métropolitaine) : API Impact CO2 de l'ADEME
// (https://impactco2.fr/api/v1/fruitsetlegumes), téléchargé une fois le 31/10/2026 et recopié ici.
// Retirés : ceux disponibles toute l'année (ananas, banane, avocat, cresson, champignon, mangue, fruit de la passion)
// et ceux qui se conservent (ail, oignon, échalote, citron, noix, noisette, châtaigne, datte, noix de coco) :
// ils ne disent rien de la saison d'une recette.

export interface Produce {
  slug: string
  name: string
  kind: 'fruit' | 'légume'
  /** Mois de saison, de 1 (janvier) à 12. */
  months: readonly number[]
}

export const SEASON_CALENDAR: readonly Produce[] = [
  { slug: 'abricot', name: 'Abricot', kind: 'fruit', months: [6, 7, 8] },
  { slug: 'artichaut', name: 'Artichaut', kind: 'légume', months: [5, 6, 7, 8, 9] },
  { slug: 'asperge', name: 'Asperge', kind: 'légume', months: [4, 5, 6] },
  { slug: 'aubergine', name: 'Aubergine', kind: 'légume', months: [6, 7, 8, 9] },
  { slug: 'betterave', name: 'Betterave', kind: 'légume', months: [1, 2, 3, 10, 11, 12] },
  { slug: 'blette', name: 'Blette', kind: 'légume', months: [6, 7, 8, 9, 10, 11] },
  { slug: 'brocoli', name: 'Brocoli', kind: 'légume', months: [9, 10, 11] },
  { slug: 'carambole', name: 'Carambole', kind: 'fruit', months: [1, 11, 12] },
  { slug: 'carotte', name: 'Carotte', kind: 'légume', months: [1, 2, 3, 9, 10, 11, 12] },
  { slug: 'cassis', name: 'Cassis', kind: 'fruit', months: [6, 7, 8] },
  { slug: 'cerise', name: 'Cerise', kind: 'fruit', months: [6, 7] },
  { slug: 'chou', name: 'Chou', kind: 'légume', months: [1, 2, 3, 10, 11, 12] },
  { slug: 'choudebruxelles', name: 'Chou de Bruxelles', kind: 'légume', months: [1, 2, 3, 10, 11, 12] },
  { slug: 'choufleur', name: 'Chou-fleur', kind: 'légume', months: [1, 2, 3, 9, 10, 11, 12] },
  { slug: 'clementine', name: 'Clémentine', kind: 'fruit', months: [1, 2, 11, 12] },
  { slug: 'coing', name: 'Coing', kind: 'fruit', months: [10] },
  { slug: 'concombre', name: 'Concombre', kind: 'légume', months: [5, 6, 7, 8, 9, 10] },
  { slug: 'courge', name: 'Courge', kind: 'légume', months: [1, 9, 10, 11, 12] },
  { slug: 'courgette', name: 'Courgette', kind: 'légume', months: [5, 6, 7, 8, 9, 10] },
  { slug: 'celeri', name: 'Céleri', kind: 'légume', months: [1, 2, 3, 10, 11, 12] },
  { slug: 'endive', name: 'Endive', kind: 'légume', months: [1, 2, 3, 4, 5, 10] },
  { slug: 'fenouil', name: 'Fenouil', kind: 'légume', months: [4, 6, 7, 8, 9, 10, 11] },
  { slug: 'figue', name: 'Figue', kind: 'fruit', months: [7, 8, 9, 10] },
  { slug: 'fraise', name: 'Fraise', kind: 'fruit', months: [5, 6, 7] },
  { slug: 'framboise', name: 'Framboise', kind: 'fruit', months: [6, 7, 8] },
  { slug: 'grenade', name: 'Grenade', kind: 'fruit', months: [1, 2, 11, 12] },
  { slug: 'groseille', name: 'Groseille', kind: 'fruit', months: [6, 7, 8] },
  { slug: 'haricotvert', name: 'Haricot vert', kind: 'légume', months: [6, 7, 8, 9, 10] },
  { slug: 'kaki', name: 'Kaki', kind: 'fruit', months: [1, 10, 11, 12] },
  { slug: 'kiwi', name: 'Kiwi', kind: 'fruit', months: [1, 2, 3, 11, 12] },
  { slug: 'laitue', name: 'Laitue', kind: 'légume', months: [5, 6, 7, 8, 9] },
  { slug: 'mandarine', name: 'Mandarine', kind: 'fruit', months: [1, 2, 11, 12] },
  { slug: 'mais', name: 'Maïs', kind: 'légume', months: [7, 8, 9] },
  { slug: 'melon', name: 'Melon', kind: 'fruit', months: [6, 7, 8, 9] },
  { slug: 'myrtille', name: 'Myrtille', kind: 'fruit', months: [7, 8, 9] },
  { slug: 'mache', name: 'Mâche', kind: 'légume', months: [1, 2, 10, 11, 12] },
  { slug: 'mure', name: 'Mûre', kind: 'fruit', months: [8, 9] },
  { slug: 'navet', name: 'Navet', kind: 'légume', months: [1, 2, 3, 4, 5, 10, 11, 12] },
  { slug: 'nectarine', name: 'Nectarine', kind: 'fruit', months: [8, 9] },
  { slug: 'orange', name: 'Orange', kind: 'fruit', months: [1, 2, 3] },
  { slug: 'pamplemousse', name: 'Pamplemousse', kind: 'fruit', months: [2, 3, 4, 5, 6] },
  { slug: 'panais', name: 'Panais', kind: 'légume', months: [1, 2, 3, 10, 11, 12] },
  { slug: 'pasteque', name: 'Pastèque', kind: 'fruit', months: [6, 7, 8, 9] },
  { slug: 'petitpois', name: 'Petit pois', kind: 'légume', months: [5, 6, 7] },
  { slug: 'poire', name: 'Poire', kind: 'fruit', months: [1, 2, 3, 8, 9, 10, 11, 12] },
  { slug: 'poireau', name: 'Poireau', kind: 'légume', months: [1, 2, 3, 4, 9, 10, 11, 12] },
  { slug: 'poivron', name: 'Poivron', kind: 'légume', months: [6, 7, 8, 9] },
  { slug: 'pomme', name: 'Pomme', kind: 'fruit', months: [1, 2, 3, 4, 8, 9, 10, 11, 12] },
  { slug: 'potiron', name: 'Potiron', kind: 'légume', months: [1, 9, 10, 11, 12] },
  { slug: 'prune', name: 'Prune', kind: 'fruit', months: [7, 8, 9] },
  { slug: 'peche', name: 'Pêche', kind: 'fruit', months: [6, 7, 8, 9] },
  { slug: 'radis', name: 'Radis', kind: 'légume', months: [3, 4, 5, 6] },
  { slug: 'raisin', name: 'Raisin', kind: 'fruit', months: [9, 10] },
  { slug: 'reineclaude', name: 'Reine claude', kind: 'fruit', months: [9] },
  { slug: 'rhubarbe', name: 'Rhubarbe', kind: 'fruit', months: [4, 5, 6] },
  { slug: 'salsifis', name: 'Salsifis', kind: 'légume', months: [1, 2, 3, 11, 12] },
  { slug: 'tomate', name: 'Tomate', kind: 'légume', months: [6, 7, 8, 9] },
  { slug: 'topinambour', name: 'Topinambour', kind: 'légume', months: [1, 2, 11, 12] },
  { slug: 'epinard', name: 'Épinard', kind: 'légume', months: [1, 2, 3, 4, 5, 9, 10, 11, 12] },
]
