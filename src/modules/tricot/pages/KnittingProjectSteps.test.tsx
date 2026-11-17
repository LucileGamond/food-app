import { cleanup, screen, waitFor, within } from '@testing-library/react'
import { setupUser } from '@/test/user'
import { AppError } from '@/api'
import { fakeApi, renderWithApp } from '@/test/fakes'
import { unfoldStepParts } from '@/test/openFold'
import type { StepSection } from '../lib/pattern'
import { KnittingProjectPage } from './KnittingProjectPage'
import { PROJECT, START, STEP, renderProject } from './knittingTestUtils'

// Le projet est gardé sur le téléphone (hors ligne) : chaque test repart sans copie.
beforeEach(() => localStorage.clear())

describe('préparation d’une étape', () => {
  it('préparation : texte, sous-étapes, diagrammes et notes en blocs repliés, avec leur résumé', async () => {
    // Rendu direct : sans le dépliage automatique des autres tests
    const api = fakeApi()
    api.knitting.getProject.mockResolvedValue(structuredClone({ ...PROJECT, needles: [4] }))
    renderWithApp(<KnittingProjectPage />, { api, route: `${STEP}=s2`, path: '/tricot/:id' })
    await screen.findByRole('heading', { name: 'Emmanchures', level: 1 })
    for (const title of ['Texte du patron', 'Sous-étapes', 'Diagrammes', 'Notes de l’étape']) {
      expect(screen.getByRole('button', { name: title })).toHaveAttribute('aria-expanded', 'false')
    }
    expect(screen.getByRole('region', { name: 'Sous-étapes' })).toHaveTextContent('2 sous-étapes')
    expect(screen.getByRole('region', { name: 'Diagrammes' })).toHaveTextContent('aucun')
    expect(screen.getByRole('region', { name: 'Notes de l’étape' })).toHaveTextContent('rien de noté')
    // L'aide reste à portée, même replié
    expect(screen.getByRole('button', { name: 'Aide : sous-étapes' })).toBeInTheDocument()
  })

  it('préparation : quelque chose à préparer → les sous-étapes s’ouvrent d’office ; « Aller à la première » les ouvre aussi', async () => {
    const user = setupUser()
    const api = fakeApi()
    // Pas d'aiguille choisie : chaque sous-étape est à régler
    api.knitting.getProject.mockResolvedValue(structuredClone({ ...PROJECT, needles: [3, 4] }))
    renderWithApp(<KnittingProjectPage />, { api, route: `${STEP}=s2`, path: '/tricot/:id' })
    const toggle = await screen.findByRole('button', { name: 'Sous-étapes' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('region', { name: 'Sous-étapes' })).toHaveTextContent('2 sous-étapes · 2 à régler')
    await user.click(screen.getByRole('button', { name: /^Aller à la première/ }))
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('en-tête de l’étape : le total de rangs une seule fois, sur la ligne d’avancée (L1)', async () => {
    renderProject(fakeApi(), PROJECT, `${STEP}=s2`)
    const header = (await screen.findByRole('heading', { name: 'Emmanchures', level: 1 })).closest('header')!
    expect(header.textContent!.match(/30 rangs/g)).toHaveLength(1)
    expect(within(header).getByText('Étape 2 sur 3')).toBeInTheDocument()
    expect(within(header).getByText('56 mailles à la fin')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aide : mailles au début' })).toBeInTheDocument()
  })

  it('en bas de la préparation : les étapes voisines, par leur nom (E2)', async () => {
    const user = setupUser()
    renderProject(fakeApi(), PROJECT, `${STEP}=s2`)
    const nav = await screen.findByRole('navigation', { name: 'Étapes voisines' })
    expect(within(nav).getAllByRole('button').map((b) => b.textContent?.trim())).toEqual(['Dos – côtes', 'Encolure'])
    await user.click(within(nav).getByRole('button', { name: 'Encolure' }))
    expect(await screen.findByRole('heading', { name: 'Encolure' })).toBeInTheDocument()
    // Dernière étape : seulement la précédente
    expect(within(screen.getByRole('navigation', { name: 'Étapes voisines' })).getAllByRole('button').map((b) => b.textContent?.trim())).toEqual(['Emmanchures'])
  })

  it('étape pas commencée : ses sous-étapes se déplacent dans Organiser, pas ici (E3)', async () => {
    const user = setupUser()
    const sections: StepSection[] = [
      { kind: 'rows', rows: 4, every: null, times: null, text: 'côtes', pattern: null },
      { kind: 'rows', rows: 10, every: null, times: null, text: 'jersey', pattern: null },
    ]
    const project = { ...PROJECT, steps: PROJECT.steps.map((s) => (s.id === 's3' ? { ...s, sections } : s)) }
    renderProject(fakeApi(), project, `${STEP}=s3`)
    await user.click(await screen.findByRole('button', { name: 'Actions pour « 10 rangs : jersey »' }))
    expect(await screen.findByRole('menuitem', { name: 'Déplacer…' })).toHaveAttribute('href', '/tricot/p1?onglet=preparer&vue=organiser')
    expect(screen.queryByRole('menuitem', { name: 'Monter' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Modifier' })).toBeInTheDocument()
  })

  it('étape commencée : Organiser ne la touche plus, Monter et Descendre restent dans la préparation (E3)', async () => {
    const user = setupUser()
    renderProject(fakeApi(), PROJECT, `${STEP}=s2`)
    await user.click(await screen.findByRole('button', { name: 'Actions pour « 4 rangs : jersey »' }))
    expect(await screen.findByRole('menuitem', { name: 'Descendre' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Déplacer…' })).not.toBeInTheDocument()
  })

  it('prête à tricoter : indiquée sur l’étape ; sinon ce qui manque, et le bouton Tricoter bloqué', async () => {
    const user = setupUser()
    const project = structuredClone(PROJECT)
    project.steps[1]!.sections = [project.steps[1]!.sections[0]!, { kind: 'rows', rows: null, every: null, times: null, text: 'jersey', pattern: '5 cm' }]
    const { api } = renderProject(fakeApi(), project, `${STEP}=s2`)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('1 chose à régler, signalée en orange dans les sous-étapes ci-dessous.')
    expect(screen.getByRole('button', { name: 'Tricoter cette étape' })).toBeDisabled()
    expect(screen.queryByRole('link', { name: 'Tricoter cette étape' })).not.toBeInTheDocument()

    // Réglée : prête, le bouton mène au mode tricoter
    api.knitting.getProject.mockResolvedValue({ ...project, steps: project.steps.map((s) => (s.id === 's2' ? { ...s, sections: [s.sections[0]!, { ...s.sections[1]!, rows: 15 }] } : s)) })
    await user.click(await screen.findByRole('button', { name: 'Actions pour « 5 cm (à régler) : jersey »' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Modifier' }))
    const form = screen.getByRole('form', { name: 'Sous-étape' })
    await user.type(within(form).getByLabelText('Nombre de rangs'), '15')
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByRole('link', { name: 'Tricoter cette étape' })).toBeInTheDocument()
    expect(screen.queryByText('À préparer avant de tricoter')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tricoter cette étape' })).toHaveAttribute('href', '/tricot/p1/tricoter?etape=s2')
  })

  it('« À préparer » : le compte, et le bouton ouvre la sous-étape, qui est signalée', async () => {
    const user = setupUser()
    const project = structuredClone(PROJECT)
    project.steps[1]!.sections = [project.steps[1]!.sections[0]!, { kind: 'rows', rows: null, every: null, times: null, text: 'jersey', pattern: '5 cm' }]
    renderProject(fakeApi(), project, `${STEP}=s2`)
    const alert = await screen.findByRole('alert')
    // Test de rendu (classes CSS, sans équivalent accessible) : la sous-étape qui manque de quelque chose est encadrée en ambre
    const items = within(screen.getByRole('region', { name: 'Sous-étapes' })).getAllByRole('listitem')
    expect(items[0]!.className).not.toContain('amber')
    expect(items[1]!.className).toContain('amber')
    // Le détail est dans la sous-étape, juste en dessous : ici, le compte seulement
    expect(alert).toHaveTextContent('1 chose à régler, signalée en orange dans les sous-étapes ci-dessous.')
    expect(alert).not.toHaveTextContent('nombre de rangs à régler.5 cm')
    // Le bouton ouvre le formulaire de la première sous-étape à régler
    await user.click(within(alert).getByRole('button', { name: /^Aller à la première/ }))
    const form = await screen.findByRole('form', { name: 'Sous-étape' })
    expect(within(form).getByLabelText('Description (facultatif)')).toHaveValue('jersey')
  })

  it('texte par sous-étape : chaque sous-étape montre son paragraphe, le texte complet est replié', async () => {
    const project = structuredClone(PROJECT)
    project.sizes = ['S', 'M', 'L']
    project.sizeIndex = 1
    project.steps[1]!.instructions = 'Tricoter 4 rangs.\n\nDiminuer 1 m. de chaque côté tous les 6 rangs 4 (4-5) fois.'
    project.steps[1]!.sections = [
      { ...project.steps[1]!.sections[0]!, source: 'Tricoter 4 rangs.' },
      { ...project.steps[1]!.sections[1]!, source: 'Diminuer 1 m. de chaque côté tous les 6 rangs 4 (4-5) fois.' },
    ]
    renderProject(fakeApi(), project, `${STEP}=s2`)
    const list = (await screen.findByRole('region', { name: 'Sous-étapes' })).querySelector('ol')!
    const items = within(list).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Tricoter 4 rangs.')
    expect(items[1]).toHaveTextContent('Diminuer 1 m. de chaque côté tous les 6 rangs 4 (4-5) fois.')
    // Nombres de la taille M surlignés dans le paragraphe
    expect(within(items[1]!).getAllByText((_, el) => el?.tagName === 'MARK').map((m) => m.textContent)).toEqual(['4'])
    expect(screen.getByRole('button', { name: 'Texte complet de l’étape' })).toBeInTheDocument()
  })

  it('diagramme montré dans la sous-étape où il commence', async () => {
    const chart = { id: 'c1', stepId: 's2', title: 'Torsade', gridTop: 0, gridBottom: 1, rows: 4, startRow: 5, endRow: 28, repeats: true, flat: false, oddOnly: false, imagePath: 'c1.png', imageUrl: null }
    renderProject(fakeApi(), { ...PROJECT, charts: [chart] }, `${STEP}=s2`)
    const list = (await screen.findByRole('region', { name: 'Sous-étapes' })).querySelector('ol')!
    const items = within(list).getAllByRole('listitem')
    expect(items[0]).not.toHaveTextContent('Diagramme')
    expect(items[1]).toHaveTextContent('Diagramme « Torsade » : rangs 5 à 28')
  })

  it('prépare une étape : notes, étape suivante ou précédente, reprise d’une étape terminée, sans compteur', async () => {
    const user = setupUser()
    const { api } = renderProject()
    expect(await screen.findByRole('heading', { name: 'Emmanchures' })).toBeInTheDocument()
    expect(screen.getByText('Étape 2 sur 3')).toBeInTheDocument()
    expect(screen.getByText('56 mailles à la fin')).toBeInTheDocument()
    expect(screen.getByText('8 / 30 rangs')).toBeInTheDocument()
    expect(screen.getByText('Rangs 5 à 28 · prochaine fois : rang 10')).toBeInTheDocument()
    // On tricote dans le mode tricoter : pas de compteur ni d'écran allumé ici
    expect(screen.queryByRole('button', { name: /^Rang \d+ fini$/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tricoter cette étape' })).toHaveAttribute('href', '/tricot/p1/tricoter?etape=s2')

    const notes = screen.getByRole('textbox', { name: 'Notes de l’étape' })
    await user.type(notes, 'Aiguilles 4,5')
    await user.tab()
    expect(api.knitting.saveProgress).toHaveBeenCalledWith('s2', { notes: 'Aiguilles 4,5' })

    // Étape suivante / précédente
    await user.click(screen.getByRole('button', { name: 'Étape suivante' }))
    expect(screen.getByRole('heading', { name: 'Encolure' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Étape suivante' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Étape précédente' }))
    await user.click(screen.getByRole('button', { name: 'Étape précédente' }))
    expect(screen.getByRole('heading', { name: 'Dos – côtes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Étape précédente' })).toBeDisabled()

    // Une étape terminée se rouvre
    await user.click(screen.getByRole('button', { name: 'Rouvrir l’étape' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s1', { done: false })
  })

  it('étape à tricoter plusieurs fois : le nombre de fois se change en touchant l’avancée', async () => {
    const user = setupUser()
    const { api } = renderProject()
    await screen.findByRole('heading', { name: 'Emmanchures' })
    // L'en-tête ne dit le nombre de fois qu'une fois, dans la ligne d'avancée
    expect(screen.getByText('Étape 2 sur 3')).toBeInTheDocument()
    expect(screen.getByText('56 mailles à la fin')).toBeInTheDocument()
    expect(screen.queryByLabelText('À tricoter')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Nombre de fois : à tricoter 1 fois' }))
    expect(screen.queryByLabelText('En cours')).not.toBeInTheDocument()
    await user.selectOptions(await screen.findByLabelText('À tricoter'), '2 fois')
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { times: 2, pass: 1 })
    expect(screen.getByRole('button', { name: 'Nombre de fois : 1re fois sur 2' })).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('En cours'), '2e fois')
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { pass: 2 })
    // Moins de fois que la fois en cours : elle redescend avec.
    await user.selectOptions(screen.getByLabelText('À tricoter'), '1 fois')
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { times: 1, pass: 1 })
    expect(screen.queryByLabelText('En cours')).not.toBeInTheDocument()
  })

  it('préparation : pas de « Étape entière » en double des sous-étapes (elle reste dans le mode tricoter)', async () => {
    renderProject()
    await screen.findByRole('heading', { name: 'Emmanchures' })
    expect(screen.getByRole('region', { name: 'Sous-étapes' })).toBeInTheDocument()
    expect(screen.queryByText('Étape entière')).not.toBeInTheDocument()
  })

  it('préparation : les aides restent repliées derrière (?) et s’ouvrent d’un toucher', async () => {
    const user = setupUser()
    renderProject()
    await screen.findByRole('heading', { name: 'Emmanchures' })
    expect(screen.queryByText(/Vérifie et corrige ce que la lecture a compris/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Ex. 2 pour les deux manches/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Aide : sous-étapes' }))
    expect(await screen.findByText(/Vérifie et corrige ce que la lecture a compris/)).toBeInTheDocument()
    await user.keyboard('{Escape}')
    // Le nombre de fois explique dans sa propre bulle
    await user.click(screen.getByRole('button', { name: 'Nombre de fois : à tricoter 1 fois' }))
    expect(await screen.findByText(/Ex. 2 pour les deux manches/)).toBeInTheDocument()
  })
})

describe('texte du patron et taille mise en valeur, dans le projet', () => {
  const TEXT = 'Monter 60 (64-68) m. et tricoter 6 (6-7) cm.'

  it('dans le projet : change la taille mise en valeur', async () => {
    const user = setupUser()
    const api = fakeApi()
    const project = structuredClone(PROJECT)
    project.sizes = ['S', 'M', 'L']
    project.sizeIndex = 1
    project.steps[1]!.instructions = TEXT
    api.knitting.getProject.mockResolvedValue(project)
    renderWithApp(<KnittingProjectPage />, { api, route: STEP, path: '/tricot/:id' })
    const article = (await screen.findByRole('heading', { name: 'Emmanchures' })).closest('article')!
    expect(within(article).getAllByText((_, el) => el?.tagName === 'MARK').map((m) => m.textContent)).toEqual(['64', '6'])

    // La taille se choisit pour tout le projet, sur sa page (pas dans une étape)
    expect(within(article).queryByLabelText('Taille')).not.toBeInTheDocument()
    cleanup()
    renderWithApp(<KnittingProjectPage />, { api, route: START, path: '/tricot/:id' })
    // Premier chargement déjà lancé (taille M) ; le rechargement après le choix renverra la taille S
    api.knitting.getProject.mockResolvedValue({ ...project, sizeIndex: 0 })
    await user.selectOptions(await screen.findByLabelText('Taille'), 'S')
    expect(api.knitting.setSizeIndex).toHaveBeenCalledWith('p1', 0)
    // Échec : message
    api.knitting.setSizeIndex.mockRejectedValueOnce(new AppError('Impossible de changer la taille mise en valeur.'))
    await user.selectOptions(screen.getByLabelText('Taille'), 'Aucune')
    expect(await screen.findByText('Impossible de changer la taille mise en valeur.')).toBeInTheDocument()
    // De retour dans l'étape : les nombres de la taille S
    cleanup()
    renderWithApp(<KnittingProjectPage />, { api, route: STEP, path: '/tricot/:id' })
    const again = (await screen.findByRole('heading', { name: 'Emmanchures' })).closest('article')!
    await waitFor(() => expect(within(again).getAllByText((_, el) => el?.tagName === 'MARK').map((m) => m.textContent)).toEqual(['60', '6']))
  })

  it('corrige le surlignage nombre par nombre, pour la taille mise en valeur', async () => {
    const user = setupUser()
    const api = fakeApi()
    const project = structuredClone(PROJECT)
    project.sizes = ['S', 'M', 'L']
    project.sizeIndex = 1
    project.steps[1]!.instructions = TEXT
    unfoldStepParts()
    renderWithApp(<KnittingProjectPage />, { api: (api.knitting.getProject.mockResolvedValue(project), api), route: STEP, path: '/tricot/:id' })
    const article = (await screen.findByRole('heading', { name: 'Emmanchures' })).closest('article')!
    // Nombres surlignés (boutons enfoncés du texte en mode correction)
    const marks = () => within(article).getAllByRole('button', { pressed: true }).map((m) => m.textContent).filter((t) => /^\d/.test(t ?? ''))

    await user.click(within(article).getByRole('button', { name: 'Corriger le surlignage' }))
    expect(within(article).getByText('Touche un nombre pour le surligner ou retirer son surlignage.')).toBeInTheDocument()
    // « 68 » surligné en plus, « 64 » retiré
    await user.click(within(article).getByRole('button', { name: '68' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { highlights: { '1': { '14': true } } })
    await user.click(within(article).getByRole('button', { name: '64, surligné' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { highlights: { '1': { '14': true, '11': false } } })
    expect(marks()).toEqual(['68', '6'])

    await user.click(within(article).getByRole('button', { name: 'Annuler mes corrections' }))
    expect(api.knitting.saveProgress).toHaveBeenLastCalledWith('s2', { highlights: {} })
    expect(marks()).toEqual(['64', '6'])
    await user.click(within(article).getByRole('button', { name: 'Terminé' }))
    expect(within(article).queryByRole('button', { name: '64, surligné' })).not.toBeInTheDocument()
    expect(within(article).getAllByText((_, el) => el?.tagName === 'MARK').map((m) => m.textContent)).toEqual(['64', '6'])
  })
})
