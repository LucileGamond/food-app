import { screen, waitFor } from '@testing-library/react'
import { Route } from 'react-router-dom'
import { AppError } from '@/api'
import { fakeApi, renderWithApp } from '@/test/fakes'
import { SharePage } from './SharePage'

function renderShare(query: string, api = fakeApi()) {
  return renderWithApp(<SharePage />, {
    api,
    route: `/partage${query}`,
    path: '/partage',
    extraRoutes: <Route path="/planning" element={<p>Écran planning</p>} />,
  })
}

describe('SharePage (partage depuis le téléphone)', () => {
  it('ajoute le lien partagé avec son titre puis ouvre le planning', async () => {
    const { api } = renderShare('?url=https%3A%2F%2Fwww.marmiton.org%2Frecettes%2Fcrepes.aspx&title=P%C3%A2te%20%C3%A0%20cr%C3%AApes')
    expect(await screen.findByText('Écran planning')).toBeInTheDocument()
    expect(api.inbox.addItem).toHaveBeenCalledWith({ url: 'https://www.marmiton.org/recettes/crepes.aspx', title: 'Pâte à crêpes' })
    expect(await screen.findByText('Ajouté à « À planifier » : Pâte à crêpes')).toBeInTheDocument()
    expect(api.inbox.fetchTitle).not.toHaveBeenCalled()
  })

  it('trouve le lien dans le texte partagé et récupère le titre de la page', async () => {
    const api = fakeApi()
    api.inbox.fetchTitle.mockResolvedValue('Tarte tatin')
    renderShare('?text=Regarde%20%3A%20https%3A%2F%2Fcuisine.fr%2Ftatin', api)
    expect(await screen.findByText('Écran planning')).toBeInTheDocument()
    expect(api.inbox.addItem).toHaveBeenCalledWith({ url: 'https://cuisine.fr/tatin', title: 'cuisine.fr' })
    await waitFor(() => expect(api.inbox.renameItem).toHaveBeenCalledWith('new-item', 'Tarte tatin', 'cuisine.fr'))
  })

  it('ajoute un texte sans lien comme une idée', async () => {
    const { api } = renderShare('?text=Raclette%20samedi')
    expect(await screen.findByText('Écran planning')).toBeInTheDocument()
    expect(api.inbox.addItem).toHaveBeenCalledWith({ title: 'Raclette samedi' })
  })

  it('signale un partage vide ou une erreur', async () => {
    const { api } = renderShare('')
    expect(await screen.findByText('Rien à ajouter : le partage ne contenait ni lien ni texte.')).toBeInTheDocument()
    expect(api.inbox.addItem).not.toHaveBeenCalled()
  })

  it('affiche l’erreur d’ajout (ex. doublon)', async () => {
    const api = fakeApi()
    api.inbox.addItem.mockRejectedValueOnce(new AppError('Déjà dans la liste « À planifier ».'))
    renderShare('?url=https%3A%2F%2Fcuisine.fr%2Ftatin', api)
    expect(await screen.findByText('Déjà dans la liste « À planifier ».')).toBeInTheDocument()
    expect(await screen.findByText('Écran planning')).toBeInTheDocument()
  })
})
