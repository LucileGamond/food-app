import { extractPage, MAX_TEXT_CHARS } from './extract.ts'

const URL = 'https://cuisine.exemple.fr/recettes/quiche'

function page(head: string, body: string): string {
  return `<!doctype html><html><head><title>Quiche | Cuisine</title>${head}</head><body>${body}</body></html>`
}

const ld = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`

describe('extractPage : données structurées', () => {
  it('lit une Recipe JSON-LD dans un @graph, avec étapes et sections', () => {
    const html = page(
      ld({
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'WebPage', name: 'Quiche' },
          {
            '@type': ['Recipe', 'NewsArticle'],
            name: 'Quiche lorraine &amp; salade',
            recipeYield: ['6', '6 personnes'],
            recipeIngredient: ['200 g de lardons', ' 3   œufs ', '', 25],
            recipeInstructions: [
              { '@type': 'HowToStep', text: 'Préchauffer le four.' },
              {
                '@type': 'HowToSection',
                name: 'Garniture',
                itemListElement: [{ '@type': 'HowToStep', text: 'Battre les œufs.' }, { '@type': 'HowToStep', name: 'Ajouter les lardons.' }],
              },
              'Enfourner 30 min.',
            ],
            keywords: 'quiche, tarte',
            recipeCategory: ['Plat'],
            image: [{ '@type': 'ImageObject', url: '/img/quiche.jpg' }],
          },
        ],
      }),
      '<nav>Menu énorme</nav><p>Blabla</p>',
    )
    const result = extractPage(html, URL)
    expect(result.structured).toEqual({
      name: 'Quiche lorraine & salade',
      yield: '6, 6 personnes',
      ingredients: ['200 g de lardons', '3 œufs', '25'],
      instructions: ['Préchauffer le four.', 'Garniture :', 'Battre les œufs.', 'Ajouter les lardons.', 'Enfourner 30 min.'],
      keywords: 'quiche, tarte',
      category: 'Plat',
    })
    // Rien d'autre n'est envoyé au modèle
    expect(result.text).toBe('')
    expect(result.title).toBe('Quiche lorraine & salade')
    expect(result.imageUrl).toBe('https://cuisine.exemple.fr/img/quiche.jpg')
  })

  it('découpe des instructions en une seule chaîne HTML', () => {
    const html = page(
      ld({ '@type': 'Recipe', name: 'Crêpes', recipeIngredient: ['250 g de farine'], recipeInstructions: '<p>Mélanger.</p><p>Cuire&nbsp;à la poêle.</p>', image: 'https://cdn.exemple.fr/c.jpg' }),
      '',
    )
    expect(extractPage(html, URL).structured).toMatchObject({ instructions: ['Mélanger.', 'Cuire à la poêle.'] })
  })

  it('ignore un JSON-LD mal formé ou sans ingrédients et passe au texte', () => {
    const html = page(
      `<script type="application/ld+json">{ pas du json</script>${ld({ '@type': 'Recipe', name: 'Vide', recipeIngredient: [] })}`,
      `<main><h1>Gâteau</h1><p>${'Ingrédients et étapes. '.repeat(20)}</p></main>`,
    )
    const result = extractPage(html, URL)
    expect(result.structured).toBeNull()
    expect(result.text).toContain('Gâteau')
  })
})

describe('extractPage : texte nettoyé', () => {
  const body = `
    <header><a href="/">Accueil</a><nav>Recettes Desserts Contact</nav></header>
    <div class="cookie-banner">Acceptez les cookies</div>
    <aside>Recettes similaires</aside>
    <article>
      <h1>Tarte aux pommes</h1>
      <img src="x.jpg" alt="photo">
      <script>window.ads = 1</script>
      <style>.x{color:red}</style>
      <div class="share-buttons">Partager sur Facebook</div>
      <h2>Ingrédients</h2>
      <ul><li>1 pâte brisée</li><li>4 pommes</li><li> </li></ul>
      <h2>Préparation</h2>
      <ol><li>Éplucher les pommes.</li><li>Cuire <b>35&nbsp;min</b> à 180 °C.</li></ol>
      <table><tr><td>Temps</td><td>50 min</td></tr></table>
      <section id="comments"><p>Super recette !</p></section>
      <form><input value="email"><button>S'abonner</button></form>
    </article>
    <footer>Mentions légales</footer>`

  it('garde le contenu principal en texte structuré, sans le bruit', () => {
    const result = extractPage(page('<meta property="og:image" content="//cdn.exemple.fr/tarte.jpg">', body), URL)
    expect(result.structured).toBeNull()
    expect(result.text).toBe(
      ['Tarte aux pommes', 'Ingrédients', '- 1 pâte brisée', '- 4 pommes', 'Préparation', '- Éplucher les pommes.', '- Cuire 35 min à 180 °C.', 'Temps 50 min'].join('\n'),
    )
    expect(result.title).toBe('Tarte aux pommes')
    expect(result.imageUrl).toBe('https://cdn.exemple.fr/tarte.jpg')
  })

  it('ne supprime pas le contenu principal même si un parent a une classe « parasite »', () => {
    const html = page('', `<div class="layout has-sidebar"><main><p>${'Recette maison. '.repeat(20)}</p></main></div>`)
    expect(extractPage(html, URL).text).toContain('Recette maison.')
  })

  it('privilégie le bloc microdata Recipe et tronque les pages très longues', () => {
    const long = Array.from({ length: 1000 }, (_, i) => `<p>ligne ${i} de texte assez longue pour remplir</p>`).join('')
    const html = page('<meta property="og:title" content="Titre OG">', `<div><p>Hors recette</p></div><div itemscope itemtype="https://schema.org/Recipe">${long}</div>`)
    const result = extractPage(html, URL)
    expect(result.text).not.toContain('Hors recette')
    expect(result.text.length).toBeLessThanOrEqual(MAX_TEXT_CHARS + 4)
    expect(result.text.endsWith('[…]')).toBe(true)
    expect(result.title).toBe('Titre OG')
  })

  it('se rabat sur le titre du document et ignore une image invalide', () => {
    const result = extractPage(page('<meta property="og:image" content="http://[invalide">', '<p>court</p>'), URL)
    expect(result.title).toBe('Quiche | Cuisine')
    expect(result.imageUrl).toBeNull()
  })
})
