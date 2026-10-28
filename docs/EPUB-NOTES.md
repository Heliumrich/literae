# Notes EPUB, ponctuation et téléchargements

Le lecteur traite les appels de notes de **tous les ouvrages**, sans dépendre du
tag `Sainte Bible`. La lecture web et le téléchargement utilisent deux fichiers
associés à la même édition.

## Organisation Directus

- `books/ebooks` : fichiers adaptés au lecteur web, associés à `books.ebook_files`.
- `books/dl_ebooks` : fichiers pour liseuses, associés à `books.ebook_download_files`.
- `books/images` : images de couverture uniquement.

Les deux relations de fichiers ont le **même nombre d’éléments et le même ordre**.
`book-editions.ts` utilise `sort` lorsqu’il existe, sinon l’identifiant de la ligne
intermédiaire, qui donne l’ordre de création. Les relations actuelles n’ont pas de
champ `sort` ; un réordonnancement par glisser-déposer nécessiterait de le configurer
sur les deux collections intermédiaires dans Directus.

Chaque fichier de téléchargement conserve dans `directus_files.metadata` le champ
`literae_reader_file_id`. Réciproquement, le fichier web contient
`literae_download_file_id`. Ce sont des UUID complets : la correspondance ne dépend
pas du nom du fichier, de sa taille ou d’un préfixe partagé entre deux traductions.
Le build échoue si l’ordre ou les associations sont incompatibles. Pour des fichiers
ajoutés manuellement sans ces métadonnées, les libellés des traductions doivent
correspondre à chaque position lorsqu’il existe plusieurs éditions.

Le bouton « Télécharger l’EPUB » utilise `downloadUrl`, distinct de l’URL ouverte
par EPUB.js. Son adresse est actualisée dès le changement d’édition. Le navigateur
ne charge que la version web choisie ; le fichier pour liseuse reste un téléchargement
explicite. Les signets continuent à dépendre de l’UUID du fichier web.

## Préparation

```bash
python scripts/prepare-reader-epub.py original.epub lecture-web.epub \
  --download liseuse.epub --report rapport.json
```

L’outil requiert Python et `lxml`, travaille sur des copies et n’accède pas au CMS.
`--download-source autre-original.epub` permet de conserver un original historique
pour liseuse lorsque la couverture de la version web a déjà été personnalisée.

Les espaces ordinaires précédant `: ; ? !` deviennent un espace insécable Unicode
U+00A0 dans les **deux versions**. L’opération parcourt les nœuds texte, y compris
les limites entre éléments en ligne ; les attributs, liens, scripts et styles ne
sont pas remplacés comme du texte brut. Elle n’ajoute pas un espace là où il n’en
existait pas. L’Unicode est valide en XHTML sans déclaration d’entité `&nbsp;`.

La version pour liseuse conserve la disposition normale des notes et son sommaire.
La seule réparation structurelle nécessaire dans l’ancien original des Confessions
est la renumérotation continue des `playOrder` du NCX ; son texte et sa couverture
sont conservés.

La version web :

1. reconnaît `epub:type="footnote"`/`endnote`, les rôles correspondants et les notes
   Wikisource `cite_note`, y compris les marqueurs placés dans un `span` ;
2. résout chaque lien vers sa note, même lorsque celle-ci est dans un gros fichier
   final, et regroupe les notes selon la **partie qui les appelle** ;
3. conserve le contenu riche, les identifiants nécessaires et les notes citées par
   une autre note ; si une note sert à plusieurs parties, chaque partie dispose
   de la copie locale nécessaire ;
4. crée de petits XHTML dans `literae-notes/`, inscrits au manifeste et dans le spine
   avec `linear="no"`, et déclare leurs liens dans le `head` de la partie ;
5. retire les anciens chapitres de notes devenus vides du spine, du sommaire EPUB 3
   et du NCX ; aucune note ne reste dans les documents de lecture linéaire ;
6. marque les appels par `role="doc-noteref"`, `epub:type="noteref"` et
   `.literae-noteref`. Le CSS du lecteur les affiche en exposant, avec un petit
   espacement, sans doubler l’exposant lorsqu’un `sup` existe déjà.

Une note sans appel provoque un arrêt : il faut examiner la source avant publication.
Les fichiers déjà préparés avec `literae-notes/` sont refusés comme entrée ; repartir
de la version pour liseuse. Le rapport comprend les empreintes, les nombres de notes,
les liens de préchargement et les parties utilisables pour les tests.

## Préchargement et dialogue

`EpubNotes` enregistre les liens déclarés par les documents qu’EPUB.js rencontre,
mais ne décompresse pas automatiquement leurs notes. Le lecteur lui transmet la
partie courante et ses voisines précédente et suivante. Seules leurs notes sont
préchargées ; un petit cache conserve ces documents et quelques documents récents.
Un chapitre lointain rendu par anticipation ne déclenche pas un chargement global.

Les notes viennent de l’archive déjà téléchargée : leur ouverture ne nécessite
aucune requête HTTP. Le dialogue suit les thèmes du site, fonctionne en plein écran
et ne réécrit pas le signet pendant son ouverture. Le contenu est copié à travers
une liste de balises autorisées ; scripts, gestionnaires et liens de retour sont
écartés. Fermer, Échap et un clic sur le fond ferment le dialogue.

Le conteneur EPUB utilise `overflow-anchor: none` : EPUB.js compense déjà lui-même
les ajouts/retraits de vues. Cette règle empêche le navigateur d’ajuster une seconde
fois le défilement et de faire sauter un chapitre devenu court après retrait des notes.

Événements DOM pour les contrôles et intégrations, sans interface de débogage ni
transmission réseau : `reader:notes-load`, `reader:notes-context` et
`reader:note-opened`. Ils exposent les chemins, l’état du cache et les durées de
préparation du contenu, sans reproduire le texte des notes.

## Contrôles

```bash
python -m unittest discover -s tests/epub -v
npm run test:server
npm run check
npm run build
CI=1 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
  npm run test:pwa
```

Avant remplacement CMS, `LITERAE_PREPARED_EPUB_DIR=/chemin/versions-web` permet au
test de substituer `<UUID>.epub` aux seuls fichiers web. Après publication, relancer
sans cette variable pour lire les vrais fichiers publics Directus avec le CORS réel.

Le lot d’octobre 2026 contient 27 ouvrages, dont 19 avec **27 158 notes**. Les deux
notes non balisées du commentaire de Matthieu sont incluses. Les 54 EPUB sont
validés avec EPUBCheck 5.4.0 sans erreur ni avertissement. Le contrôle des archives
vérifie chaque appel, l’existence de sa cible et de son lien de préchargement,
l’absence de notes dans le fil web, ainsi que la conservation du texte des
paragraphes et des notes. La ponctuation est vérifiée par une seconde passe
idempotente.

`all-books-notes.spec.ts` parcourt 136 parties sur ordinateur et mobile : toutes les
questions contenant des notes de la Somme, les 22 livres de la Cité de Dieu,
plusieurs passages des deux Testaments et des parties représentatives de tous les
autres ouvrages. Il vérifie le cache avant clic, l’ouverture rapide, les exposants,
la ponctuation, la progression, le plein écran et la séparation des téléchargements.
Les mesures sont jointes aux résultats sous `notes-performance.json`.

Sur les fichiers publics Directus, les 272 visites de parties ont contrôlé
236 ouvertures de notes, toutes déjà préchargées au moment du clic. La préparation
du contenu du dialogue a pris moins de 18 ms dans 95 % des cas, avec un maximum
mesuré de 99 ms. Ces mesures concernent le contenu du dialogue après préchargement,
et sont consignées dans les rapports de test.

La suite complète exécutée après publication CMS compte 142 scénarios navigateur
réussis, complétés par 14 tests Node et 5 tests Python réussis.
