# Food — planning des repas et recettes

Application web installable (PWA) pour Lucile et Eric : planning partagé des repas de la semaine et carnet de recettes.

- **Front** : React + Vite + TypeScript, Tailwind CSS + shadcn/ui, glisser-déposer `@dnd-kit`, PWA (`vite-plugin-pwa`)
- **Données** : Supabase (PostgreSQL, Auth, Realtime, Storage)
- **Hébergement** : Azure Static Web Apps

## Fonctionnalités

- **Connexion** e-mail / mot de passe, sans inscription (2 comptes créés à la main).
- **Planning** : 7 jours glissants, créneaux Midi / Soir, plusieurs repas par créneau, pour Lucile et/ou Eric.
  Ajout, modification, suppression (avec confirmation), déplacement et duplication (glisser-déposer ou menu « … »).
  Synchronisation en direct entre les deux comptes.
- **Recettes** :
  - *ponctuelles* : titre, texte libre, lien — saisies directement dans le planning ;
  - *sauvegardées* : ingrédients détaillés, étapes, tags, photos — listées dans l'écran Recettes.
  Une recette ponctuelle peut être sauvegardée depuis le planning (« Sauvegarder la recette »).
  Une recette sauvegardée utilisée dans le planning ne peut pas être supprimée.

## Développement local

Prérequis : Node 24, Docker Desktop.

```bash
npm install
npm run db:start          # Supabase local (Docker)
cp .env.example .env.local  # puis coller la clé anon affichée par `npx supabase status`
npm run dev
```

Comptes de test locaux (créés par `supabase/seed.sql`) : `lucile@food.test` et `eric@food.test`, mot de passe `motdepasse-test`.

Après une modification du schéma (`supabase/migrations`) : `npm run db:reset` puis `npm run db:types`.

## Tests

| Commande | Contenu |
|---|---|
| `npm run test:coverage` | Unitaires + composants (Vitest, Testing Library), seuil de couverture 85 % |
| `npm run test:db` | Règles de la base (pgTAP) : contraintes, triggers, sécurité |
| `npm run test:integration` | Couche `src/api` contre la Supabase locale, seuil 85 % |
| `npm run test:e2e` | Parcours complets (Playwright), desktop + mobile, accessibilité (axe) |
| `npm run test:all` | Tout, avec lint et typage |

Les tests d'intégration et E2E vident les données de la Supabase **locale** avant chaque test.

## Mise en production (à faire une fois)

1. **Supabase** : créer le projet `food-app-prod` (offre gratuite).
   - *Authentication → Sign In / Providers* : désactiver **Allow new users to sign up**.
   - *Authentication → Users → Add user* : créer les 2 comptes (cocher *Auto Confirm User*).
   - Appliquer le schéma : `npx supabase link --project-ref <ref>` puis `npx supabase db push`
     (ou laisser la CI le faire au premier push sur `main`).
   - Renommer les profils (créés automatiquement avec le début de l'e-mail) dans *SQL Editor* :
     ```sql
     update profiles set display_name = 'Lucile' where id = (select id from auth.users where email = '...');
     update profiles set display_name = 'Eric'   where id = (select id from auth.users where email = '...');
     ```
2. **Azure** : créer une *Static Web App* (offre Free), source « Other », et récupérer son jeton de déploiement.
3. **GitHub** : pousser le dépôt, créer l'environnement `production` et ces secrets :

| Secret | Où le trouver |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `SUPABASE_PROJECT_REF` | Identifiant du projet (dans l'URL du dashboard) |
| `SUPABASE_ACCESS_TOKEN` | supabase.com → Account → Access Tokens |
| `SUPABASE_DB_PASSWORD` | Mot de passe de la base choisi à la création du projet |
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | Azure → Static Web App → Manage deployment token |

Ensuite, chaque push sur `main` lance tous les tests, puis — s'ils passent — applique les migrations et déploie.
Le workflow `keep-alive` interroge Supabase tous les 3 jours pour éviter la mise en pause du projet gratuit.

Sur Android : ouvrir l'URL de la Static Web App dans Chrome → menu → **Ajouter à l'écran d'accueil**.
