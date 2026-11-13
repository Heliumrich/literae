# Repères doctrinaux des auteurs

Les fiches des auteurs présents dans la bibliothèque et les pages de leurs ouvrages
partagent le composant `AuthorDogmas.astro`. Les autres personnalités ne sont pas
concernées. Aucun score global n’est calculé pour un auteur.

Au build, `dogmas-server.ts` lit les relations `artists_dogmas` et développe
`dogmas_id` : `id`, `archived`, `title`, `description`, `url`, `grade`.
Seules les entrées explicitement non archivées avec un grade entier de −10 à +10
sont affichées. La description accepte Markdown ; le lien facultatif accepte HTTP(S).
Une modification dans Directus nécessite un rebuild du site.

Les grades positifs apparaissent d’abord, les points négatifs et les nuances ensuite.
Cinq SVG distinguent les bandes −10…−6, −5…−1, 0, +1…+5 et +6…+10.
Le rouge et le vert varient avec l’intensité du grade ; zéro reste ambré.

Les descriptions sont déjà dans le HTML. `dogmas-client.ts` améliore les popovers
natifs du navigateur : aperçu au survol avec une souris, fixation au clic,
fermeture avec Échap ou un clic extérieur. Le panneau peut être rejoint à la souris
pour lire, défiler ou suivre sa source. Le tactile utilise seulement le clic.
Aucune dépendance au lecteur EPUB, nouvelle island ou requête client n’est ajoutée.

Vérifications : `tests/unit/dogmas.test.mjs` et `tests/e2e/author-dogmas.spec.ts`.
