/**
 * Ouvre dans un nouvel onglet une adresse obtenue après une attente (lien signé…) : l'onglet est ouvert tout de suite,
 * sinon le navigateur le bloque, puis dirigé vers l'adresse. Sans onglet (bloqué malgré tout), la page elle-même y va.
 * En cas d'erreur, l'onglet vide est refermé et l'erreur remonte.
 */
export async function openInNewTab(getUrl: () => Promise<string>): Promise<void> {
  const tab = window.open('', '_blank')
  try {
    const url = await getUrl()
    if (tab) tab.location.href = url
    else window.location.assign(url)
  } catch (error) {
    tab?.close()
    throw error
  }
}
