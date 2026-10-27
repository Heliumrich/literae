# Notes des Bibles

La fonction est réservée aux livres dont les tags Directus contiennent exactement `Sainte Bible`. Les autres ouvrages gardent leur lecteur habituel.

## Lecture

Un appel de note ouvre un dialogue modal dans le lecteur. Fermer, Échap ou un clic sur le fond ferme le dialogue. Le texte reste à sa position ; la progression n’est pas réécrite pendant la consultation d’une note. Le dialogue fonctionne aussi en plein écran et suit le thème du site. Les liens de navigation biblique ordinaires restent des liens de navigation.

Les notes sont lues dans l’archive EPUB déjà téléchargée. Le préchargement décompresse le XHTML associé au chapitre courant et aux chapitres voisins, sans requête Web supplémentaire. Un cache borné conserve au plus trois fichiers de notes. Seul le texte et une liste limitée de balises de mise en forme sont copiés dans le dialogue ; les scripts, styles et gestionnaires d’événements de l’EPUB ne sont pas exécutés.

## Convention EPUB

- `OPS/literae-notes/pNNN.xhtml` regroupe les notes d’un livre biblique ou d’une section liminaire. Les chapitres originaux `pNNN-CCC.xhtml` restent en place.
- Le chapitre déclare `<link rel="literae-notes" href="literae-notes/pNNN.xhtml"/>` dans son `head`.
- Chaque appel pointe vers ce fichier et porte `epub:type="noteref"`.
- Chaque note est un `aside epub:type="footnote"` avec un identifiant préfixé par le nom de son chapitre, pour éviter les collisions entre chapitres.
- Les fichiers de notes sont déclarés au manifeste et à la fin du spine avec `linear="no"`. Ils ne sont pas ajoutés au sommaire. EPUB.js les saute lors du défilement ; les lecteurs EPUB ordinaires peuvent toujours résoudre les liens.
- Les identifiants des fichiers Directus restent inchangés, de même que les liens `books_files`. Les signets existants continuent à utiliser le même UUID. Le déplacement des notes peut néanmoins invalider un ancien CFI qui pointait précisément dans une note.

## Préparation et validation

`python3 scripts/prepare-bible-notes.py original.epub prepare.epub` nécessite `lxml` (`python3 -m pip install lxml`). Le script ne remplace jamais le fichier d’entrée. Il reconnaît les notes Wikisource `li#cite_note…` et les éléments `epub:type="footnote"`, réécrit leurs liens et préserve les numéros et le contenu. Il refuse une seconde conversion d’un EPUB déjà préparé. Inspecter le rapport et vérifier les liens avant de remplacer un fichier CMS.

Sur les fichiers examinés :

| Traduction | Notes déplacées | Fichiers de notes | Plus grand XHTML de notes |
|---|---:|---:|---:|
| Crampon | 8 887 | 79 | 288 003 octets |
| Glaire | 13 898 | 92 | 608 826 octets |
| Sacy | 0 | 0 | — |

Sacy ne contient actuellement aucun appel de note ni notes identifiées : son fichier n’a pas à être modifié. Les nombres de fichiers incluent les notes des introductions et autres sections, en plus des livres bibliques.

Les tests `tests/e2e/bible-notes.spec.ts` ouvrent les vrais EPUB et contrôlent la Genèse, le dialogue, sa fermeture, la progression, le sommaire et le plein écran sur ordinateur et mobile simulé. Avant publication, `LITERAE_PREPARED_EPUB_DIR` peut désigner un dossier contenant les versions préparées sous `<UUID>.epub` : seuls ces assets sont alors remplacés pendant le test. Sans cette variable, les fichiers publics Directus sont utilisés réellement.

Les originaux doivent être sauvegardés avant remplacement. Aucune relation de téléchargement distincte n’est créée : le bouton EPUB reste lié au fichier actuellement associé au livre, conformément à la séparation des versions originales prévue ultérieurement.

## Originaux conservés dans Directus

Les versions originales ont été réimportées comme fichiers indépendants, sans lien de téléchargement ajouté aux livres :

- Crampon : `c28adc3f-8674-4480-b83a-4a5057c49589`.
- Glaire : `98dd3a07-1fa2-4efa-a170-150752ff6d6a`.

Leur titre dans le CMS se termine par « original avant adaptation des notes Literae ». Les deux assets associés aux livres ont été remplacés et leurs octets publics comparés aux EPUB préparés par SHA-256. Sacy n’a pas été remplacé.
