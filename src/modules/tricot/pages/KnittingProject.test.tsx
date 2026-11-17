import { cleanup, screen, within } from '@testing-library/react'
import { setupUser } from '@/test/user'
import { fakeApi, renderWithApp } from '@/test/fakes'
import { EMPTY_YARN } from '../lib/yarn'
import { KnittingProjectPage } from './KnittingProjectPage'
import { OVERVIEW, PREPARE, PROJECT, START, STEP, renderProject } from './knittingTestUtils'

// Le projet est gardé sur le téléphone (hors ligne) : chaque test repart sans copie.
beforeEach(() => localStorage.clear())

describe('KnittingProjectPage : navigation, onglets et en-tête', () => {
  it('retour au-dessus du titre : « Tricot » depuis le projet, le nom du projet depuis une étape (C1)', async () => {
    const user = setupUser()
    renderProject(fakeApi(), PROJECT, STEP)
    const toProject = await screen.findByRole('link', { name: PROJECT.title })
    expect(toProject).toHaveAttribute('href', '/tricot/p1?onglet=preparer')
    await user.click(toProject)
    expect(await screen.findByRole('link', { name: 'Tricot' })).toHaveAttribute('href', '/tricot')
    expect(screen.queryByRole('link', { name: 'Projets' })).not.toBeInTheDocument()
  })

  it('projet issu de la bibliothèque : un lien vers sa fiche patron ; sans patron, pas de lien (E4)', async () => {
    renderProject(fakeApi(), { ...PROJECT, patternId: 'g1' }, OVERVIEW)
    expect(await screen.findByRole('link', { name: 'Fiche du patron' })).toHaveAttribute('href', '/tricot/patrons/g1')
    cleanup()
    renderProject(fakeApi(), { ...PROJECT, patternId: null }, OVERVIEW)
    await screen.findByRole('heading', { name: PROJECT.title })
    expect(screen.queryByRole('link', { name: 'Fiche du patron' })).not.toBeInTheDocument()
  })

  it('projet en trois onglets : Démarrer (matériel), Préparer (étapes), Tricoter (étape en cours)', async () => {
    const user = setupUser()
    // Projet commencé et étape en cours prête : il s'ouvre sur « Tricoter »
    renderProject(fakeApi(), PROJECT, OVERVIEW)
    expect(await screen.findByRole('tab', { name: /3. Tricoter/, selected: true })).toBeInTheDocument()
    // Test de rendu (classes CSS, sans équivalent accessible) : deux lignes par onglet (temps + état),
    // la barre grandit au lieu de laisser le texte déborder
    expect(screen.getByRole('tablist', { name: 'Temps du projet' })).toHaveClass('group-data-horizontal/tabs:h-auto')
    for (const tab of screen.getAllByRole('tab')) expect(tab).toHaveClass('h-auto', 'whitespace-normal')
    expect(screen.getByRole('heading', { name: 'Emmanchures' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tricoter' })).toHaveAttribute('href', '/tricot/p1/tricoter')
    // Pas d'interrupteur d'écran ni de compteur ici ; le suivi est replié.
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Rang \d+ fini$/ })).not.toBeInTheDocument()
    for (const title of ['Assez de laine pour finir ?', 'Notes et photos']) {
      expect(screen.getByRole('button', { name: title })).toHaveAttribute('aria-expanded', 'false')
    }

    // Démarrer : le matériel, en blocs repliés comme partout
    await user.click(screen.getByRole('tab', { name: /1. Démarrer/ }))
    expect(await screen.findByRole('region', { name: 'Laine et échantillon' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Laine et échantillon' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: 'Taille et aiguilles' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('region', { name: 'Taille et aiguilles' })).toHaveTextContent('Taille M · aiguilles à indiquer')
    expect(screen.getByRole('button', { name: 'Patron adapté à moi' })).toHaveAttribute('aria-expanded', 'false')

    // Préparer : les étapes, qui s'ouvrent une par une
    await user.click(screen.getByRole('tab', { name: /2. Préparer/ }))
    const nav = await screen.findByRole('navigation', { name: 'Étapes' })
    const links = within(within(nav).getByRole('list')).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['1Dos – côtes18 / 18 rangs(terminée)', '2Emmanchures8 / 30 rangsEn cours', '3Encolure'])
    expect(links[1]).toHaveAttribute('aria-current', 'step')
    expect(within(links[0]!).getByText('(terminée)')).toBeInTheDocument()
    await user.click(links[2]!)
    expect(await screen.findByRole('heading', { name: 'Encolure' })).toBeInTheDocument()
    // Le retour ramène à « Préparer »
    await user.click(screen.getByRole('link', { name: 'Pull Bergamote' }))
    expect(await screen.findByRole('navigation', { name: 'Étapes' })).toBeInTheDocument()
  })

  it('chaque onglet dit ce qu’il reste à faire, et le projet s’ouvre sur le premier qui demande quelque chose', async () => {
    const project = structuredClone(PROJECT)
    project.needles = []
    project.steps = project.steps.map((s) => ({ ...s, done: false, rowCount: 0 }))
    project.steps[0]!.sections = [{ kind: 'rows', rows: null, every: null, times: null, text: 'côtes', pattern: null }]
    renderProject(fakeApi(), project, OVERVIEW)
    // Rien n'est tricoté et les aiguilles manquent : on commence par Démarrer
    expect(await screen.findByRole('tab', { name: /1. Démarrer/, selected: true })).toBeInTheDocument()
    expect(screen.getByRole('note', { name: 'Avant de préparer les étapes' })).toHaveTextContent('Aiguilles à indiquer')
    expect(screen.getByRole('tab', { name: /1. Démarrer/ })).toHaveTextContent('à compléter')
    expect(screen.getByRole('tab', { name: /2. Préparer/ })).toHaveTextContent('1 à préparer')
    expect(screen.getByRole('tab', { name: /3. Tricoter/ })).toHaveTextContent('0 / 3')
  })

  it('liste des étapes : « À préparer » sur celles qui ne sont pas prêtes', async () => {
    const project = structuredClone(PROJECT)
    project.steps[2]!.sections = [{ kind: 'rows', rows: null, every: null, times: null, text: '', pattern: '3 cm' }]
    renderProject(fakeApi(), project, PREPARE)
    const nav = await screen.findByRole('navigation', { name: 'Étapes' })
    const links = within(within(nav).getByRole('list')).getAllByRole('link')
    expect(links.map((l) => l.textContent?.includes('À préparer'))).toEqual([false, false, true])
  })

  it('liste des étapes : la fois en cours d’une étape tricotée plusieurs fois', async () => {
    const project = structuredClone(PROJECT)
    project.steps[1] = { ...project.steps[1]!, times: 2, pass: 2 }
    renderProject(fakeApi(), project, OVERVIEW)
    expect(await screen.findByText('8 / 30 rangs · 2e fois sur 2')).toBeInTheDocument()
  })

  it('blocs repliés : même geste partout, et un résumé de ce qu’ils contiennent', async () => {
    const user = setupUser()
    const project = {
      ...structuredClone(PROJECT),
      yarns: [{ ...EMPTY_YARN, brand: 'Phildar', name: 'Partner 3.5' }],
      gauges: [{ needle: null, stitches: 22, rows: 30, checked: false }],
      yarnChecks: [{ yarn: 0, grams: 220, rowsDone: 10, at: '2026-11-10T09:00:00.000Z' }],
    }
    renderProject(fakeApi(), project, START)
    // Démarrer : tout est replié, avec son résumé
    const adapt = await screen.findByRole('button', { name: 'Patron adapté à moi' })
    expect(adapt).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('region', { name: 'Patron adapté à moi' })).toHaveTextContent('pas encore adapté')
    await user.click(adapt)
    expect(adapt).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('region', { name: 'Patron adapté à moi' })).not.toHaveTextContent('pas encore adapté')
    // Replié, chaque bloc dit ce qu'il contient
    expect(screen.getByRole('region', { name: 'Laine et échantillon' })).toHaveTextContent('1 laine · 1 échantillon')
    await user.click(screen.getByRole('tab', { name: /3. Tricoter/ }))
    expect(await screen.findByRole('region', { name: 'Assez de laine pour finir ?' })).toHaveTextContent('pesée le 10/11')
    expect(screen.getByRole('region', { name: 'Notes et photos' })).toHaveTextContent('rien de noté')
  })

  it('en-tête du projet : une seule taille affichée, celle suivie ; le choix est dans « Démarrer »', async () => {
    renderProject(fakeApi(), PROJECT, OVERVIEW)
    // Patron à une taille : dans l'en-tête, sans choix
    expect(await screen.findByText('Taille M', { selector: 'p' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Taille')).not.toBeInTheDocument()
    cleanup()
    // Plusieurs tailles : l'en-tête montre la taille suivie (L), pas celle de l'import (M)
    renderProject(fakeApi(), { ...PROJECT, sizes: ['S', 'M', 'L'], sizeIndex: 2 }, START)
    expect(await screen.findByText('Taille L', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByLabelText('Taille')).toHaveDisplayValue('L')
    cleanup()
    // Taille de l'import hors de la liste : proposée telle quelle
    renderProject(fakeApi(), { ...PROJECT, size: '4 ans', sizes: ['S', 'M'], sizeIndex: null }, START)
    expect(await screen.findByLabelText('Taille')).toHaveDisplayValue('4 ans')
  })

  it('page du projet : « Tricoter » ouvre le mode tricoter sur l’étape en cours', async () => {
    renderProject(fakeApi(), PROJECT, OVERVIEW)
    expect(await screen.findByRole('link', { name: 'Tricoter' })).toHaveAttribute('href', '/tricot/p1/tricoter')
  })

  it('ouvre le PDF d’origine et supprime le projet', async () => {
    const user = setupUser()
    const tab = { location: { href: '' }, close: vi.fn() }
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)
    const { api } = renderProject(fakeApi(), PROJECT, OVERVIEW)
    // Les actions du projet tiennent au bout du titre, en icônes
    await user.click(await screen.findByRole('button', { name: 'Voir le PDF' }))
    expect(open).toHaveBeenCalledWith('', '_blank')
    expect(api.knitting.pdfUrl).toHaveBeenCalledWith('u-lucile/abc.pdf')
    await vi.waitFor(() => expect(tab.location.href).toBe('https://cdn.test/u-lucile/abc.pdf'))
    open.mockRestore()

    await user.click(screen.getByRole('button', { name: 'Supprimer le projet' }))
    await user.click(await screen.findByRole('button', { name: 'Supprimer' }))
    expect(api.knitting.deleteProject).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1', pdfPath: 'u-lucile/abc.pdf' }))
    expect(await screen.findByText('Liste des projets')).toBeInTheDocument()
    // Copie hors ligne et avancée en attente oubliées
    expect(localStorage.getItem('life:tricot:projet:p1')).toBeNull()
  })

  it('signale un projet introuvable ou illisible', async () => {
    const user = setupUser()
    renderProject(fakeApi(), null)
    expect(await screen.findByText('Projet introuvable')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Retour aux projets' }))
    expect(await screen.findByText('Liste des projets')).toBeInTheDocument()
  })

  it('propose de réessayer le chargement', async () => {
    const user = setupUser()
    const api = fakeApi()
    api.knitting.getProject.mockRejectedValueOnce(new Error('réseau')).mockResolvedValue(structuredClone(PROJECT))
    renderWithApp(<KnittingProjectPage />, { api, route: STEP, path: '/tricot/:id' })
    await user.click(await screen.findByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByRole('heading', { name: 'Emmanchures' })).toBeInTheDocument()
  })
})
