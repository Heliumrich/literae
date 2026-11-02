# Imitation de Jésus-Christ : édition téléchargeable compacte

La variante liseuse de la traduction Lamennais (1859) conserve tous les paragraphes,
le texte, les notes, les liens aller/retour et la couverture JPEG. Le corps de
l’édition web n’est pas modifié.

- Cette édition demande explicitement `p { margin: 0.5em 0; }`. Ce choix reste
  propre à l’Imitation ; l’outil générique conserve les réglages du lecteur par
  défaut lorsqu’aucune marge n’est demandée. Les styles généraux de `body`, titres
  et images restent supprimés. La garde conserve sa composition locale.
- Les 734 notes restent à leur place, conformément à la solution de repli demandée :
  80 % de la police courante, marges et padding nuls, sans alinéa. Les notes
  consécutives n’ont plus de marges CSS entre elles. Le réglage global de Crosspoint
  reste global et ajoute aussi son espacement aux paragraphes de notes s’il est activé.
- Les 734 appels sont en exposant, précédés d’une espace insécable ; leur ponctuation
  de droite est conservée. Les numérotations du corps restent du texte dans des `p`.

KOReader dispose de l’option « Show footnotes in popup » dans les réglages des liens.
Les attributs EPUB `noteref`, `footnote` et les liens de retour sont conservés.
Le code officiel Crosspoint inspecté (tag 2.0.0 et develop 2ec01c9) utilise un saut
vers la note et une pile de retour, pas une popup. Les notes ne sont donc pas déplacées
à la fin du volume : les garder compactes est le repli pour cette édition.

Sources inspectées :
- [Crosspoint : sélection des notes](https://github.com/crosspoint-reader/crosspoint-reader/blob/2.0.0/src/activities/reader/EpubReaderFootnoteSelectActivity.cpp)
- [Crosspoint : marges et espacement](https://github.com/crosspoint-reader/crosspoint-reader/blob/2.0.0/lib/Epub/Epub/parsers/ChapterHtmlSlimParser.cpp)
- [KOReader : popup des notes](https://github.com/koreader/koreader/blob/8012773/frontend/apps/reader/modules/readerlink.lua)

## Reproduire la préparation

```bash
python scripts/compact-download-epub.py original.epub compact.epub --stylesheet EPUB/style.css --paragraph-margin-em 0.5
```

Cet outil vérifie la conservation du texte hors espaces, des identifiants et des
liens de chaque XHTML modifié. Une nouvelle application conserve les mêmes notes, exposants et espaces sans les dupliquer.
EPUBCheck ne signale aucune erreur ni avertissement. Les 130 XHTML sont audités :
3 783 paragraphes, 734 notes, 734 appels. Quatre tests du parseur C++ Crosspoint
vérifient l’espacement désactivé/activé, la taille et l’alinéa des notes, puis le vrai
premier chapitre avec sa feuille CSS et ses appels reconnus. Les métriques matérielles
et le framebuffer sont des doubles de test, pas un test sur liseuse physique.

## Publication et cache

Le fichier utilise un nouvel UUID dans `books/dl_ebooks`, stockage `local`.
La relation `ebook_download_files` est mise à jour au même emplacement ; les métadonnées
de jumelage pointent vers l’édition web existante, dont les octets restent identiques.
Les identifiants et empreintes figurent dans [le rapport](EPUB-IMITATION-COMPACT-2026-11.json).
L’ancien fichier reste disponible jusqu’au rebuild des pages du VPS.

Crosspoint indexe son cache par chemin du fichier. Après remplacement d’un EPUB
sous le même nom, utiliser l’action de suppression du cache du livre pour reconstruire
le CSS et les pages avec le nouvel EPUB.

## Comparaison dans Crosspoint

Crosspoint n’applique pas une marge navigateur de 1 em aux `p` sans CSS.
Six tests natifs ont comparé l’absence de règle, 0,7 em et 0,5 em, chacun avec
l’option d’espacement supplémentaire désactivée puis activée. Avec les métriques
de test (ascendante 12 px, hauteur de ligne 16 px), l’espace ajouté entre deux
paragraphes est respectivement 0/8 px, 16/24 px et 12/20 px (option OFF/ON).
Les valeurs physiques varient avec la police. Les marges basse/haute s’additionnent.
Ainsi, 0,5 em réduit l’espacement par rapport à 0,7 em, mais l’augmente par rapport
à l’absence de règle lorsque l’option supplémentaire est désactivée.

La dernière révision ne change que la feuille CSS et la date de modification OPF :
les 130 XHTML et toutes les ressources graphiques sont identiques octet pour octet.
