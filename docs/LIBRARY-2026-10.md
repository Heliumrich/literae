# Dix ouvrages classiques, octobre 2026

Le lot ajoute les dix EPUB fournis, sans remplacer un ouvrage existant. Les
métadonnées et les notices sont conservées dans
[library-2026-10.json](../scripts/catalogs/library-2026-10.json) ; les cinq fiches
d’auteurs dans [library-authors-2026-10.json](../scripts/catalogs/library-authors-2026-10.json).
Les fichiers binaires sont stockés dans Directus, avec les mêmes dossiers et
correspondances web/liseuse que les autres livres.

## Éditions et droits

| Ouvrage | Édition retenue |
| --- | --- |
| L’Imitation de Jésus-Christ | Traduction et réflexions de Félicité de Lamennais, Paris, Ambroise Bray, XLIIIe édition, 1859 |
| Pensées | Paris, Guillaume Desprez, seconde édition, 1670, dans l’ordre de Port-Royal |
| Traité de la concupiscence | Paris, Bloud et Cie, introduction et notes d’André Pératé, 1908 |
| Oraisons funèbres | Paris, Aristide Quillet, préface de René Doumic, 1928 |
| Le Blé qui lève | Paris, Calmann-Lévy, 1907 |
| La Terre qui meurt | Texte daté de 1899 dans le fichier Ebooks libres et gratuits |
| L’Isolée | Texte daté de 1905 dans le fichier Ebooks libres et gratuits |
| La Barrière | Texte daté de 1910 dans le fichier Ebooks libres et gratuits |
| Les Oberlé | Texte daté de 1903 dans le fichier Ebooks libres et gratuits |
| Considérations sur la France | Lyon, Chez Rusand, 1829 |

Les pages de titre et notices des fichiers fournis établissent ces références.
Pour les quatre EPUB d’Ebooks libres et gratuits, aucun tirage ni éditeur imprimé
supplémentaire n’est inventé. La date de 1903 des Oberlé désigne le texte transmis,
non la première parution du roman. L’attribution de l’Imitation à Thomas à Kempis
est présentée comme traditionnelle.

Les textes historiques et les contributions des éditions sont dans le domaine
public en France et en Suisse, compte tenu des décès et du délai de 70 ans :
Thomas à Kempis (1471), Pascal (1662), Bossuet (1704), Maistre (1821), Lamennais
(1854), Bazin (1932), Doumic (1937), Pératé (1947) et Mortier (1951). L’appendice
Quillet conserve ses attributions à Bourdaloue, Fléchier, Massillon et Lacordaire,
tous morts avant 1870. Les notices d’auteurs Wikisource permettent de vérifier les
contributeurs les plus récents :
[André Pératé](https://fr.wikisource.org/wiki/Auteur:Andr%C3%A9_P%C3%A9rat%C3%A9),
[René Doumic](https://fr.wikisource.org/wiki/Auteur:Ren%C3%A9_Doumic),
[Raoul Mortier](https://fr.wikisource.org/wiki/Auteur:Raoul_Mortier),
[René Bazin](https://fr.wikisource.org/wiki/Auteur:Ren%C3%A9_Bazin) et
[Lamennais](https://fr.wikisource.org/wiki/Auteur:F%C3%A9licit%C3%A9_Robert_de_Lamennais).

Les conditions des **transcriptions numériques** restent distinctes : les crédits,
les contributeurs et la licence CC BY-SA 3.0 des exports Wikisource sont conservés.
Les conditions Ebooks libres et gratuits, dont la mention d’usage non commercial
et non professionnel, sont reproduites dans le colophon. La licence complète et
les crédits Gutenberg sont déplacés après le texte. Les références aux sources
restent dans les métadonnées EPUB et les notices de fichiers Directus.

## Préparation

```bash
python scripts/prepare-library-epubs.py scripts/catalogs/library-2026-10.json \
  /chemin/originaux /chemin/epub-nettoyes
python scripts/prepare-reader-epub.py livre-nettoye.epub livre-web.epub \
  --download livre-liseuse.epub --report notes.json
```

L’outil requiert `lxml`. Ses profils de sélection sont propres aux dix sources du
lot ; ils doivent être revus avant de traiter d’autres éditions. Il ne se connecte
pas au CMS. Le rapport contient les empreintes, les tailles, les liens réécrits et
les éventuels liens obsolètes, à contrôler avant publication. Une propriété
`rights_verified` du catalogue consigne la vérification éditoriale ; elle ne la
remplace pas.

- EPUB 3, couverture SVG sobre et page `titlepage.xhtml` adaptée au lecteur ;
  couverture PNG équivalente pour le catalogue.
- Avis au lecteur avec l’édition utilisée, la provenance et les choix de présentation.
- Préfaces, introductions, annexes, prières et notes conservées. L’Imitation garde
  ses quatre livres, les réflexions et les lectures présentes dans le fichier ;
  les pièces annoncées mais absentes du fichier source ne sont pas reconstituées.
- Retrait des publicités, couvertures répétées et tables imprimées redondantes.
  Les mentions de provenance et licences sont reportées en fin d’ouvrage.
- Suppression des styles de traitement de texte, des déclarations de polices et
  des dépendances de mise en page web. Les emphases et illustrations intérieures
  conservées restent dans le fichier ; aucun script n’est repris.
- Découpage par chapitre ou partie, avec limite de taille aux frontières des blocs.
  Hiérarchie livres/chapitres dans l’Imitation, portraits rattachés à la quatrième
  partie de L’Isolée et extraits rattachés à l’appendice des Oraisons.
- Conservation contrôlée du texte pendant la suppression des enveloppes ; IDs
  rendus uniques par document source et liens recalculés, y compris les liens
  directement placés à la racine d’un bloc.
- Notes Gutenberg, Wikisource et ELG reconnues puis traitées avec le convertisseur
  commun : petits XHTML non linéaires pour le web, notes classiques pour liseuse.
- Espaces insécables avant `: ; ? !` dans les deux variantes. Les s longs sont
  conservés dans les fichiers, leur modernisation étant un réglage du lecteur.

Le lot contient 1 303 notes reconnues, y compris les renvois des crédits, et son
plus gros XHTML nettoyé mesure 127 957 octets. Les 20 variantes sont contrôlées par
EPUBCheck 5.4.0, sans erreur ni avertissement. Un audit supplémentaire vérifie les
cibles internes, la conservation des paragraphes et notes, l’absence de notes
dans les documents web linéaires et l’absence de polices embarquées.

## Navigation, couvertures et réglage des s longs

EPUB.js peut positionner un fragment avant l’application complète des styles du
lecteur. `displayChapter` attend la police du document cible, actualise les tailles
et aligne la cible à partir de sa géométrie réelle, après stabilisation des vues.
Il n’attend pas les polices de vues voisines qui peuvent avoir été supprimées.
Une nouvelle navigation, un changement d’édition ou une interaction de lecture
annule le repositionnement encore en attente. L’événement DOM
`reader:chapter-positioned` indique la fin de cette opération, sans transmission
réseau. La règle `overflow-anchor: none` reste nécessaire pour éviter la double
compensation lors de l’ajout d’une vue précédente.

Les couvertures des cartes ont une hauteur indépendante de la taille intrinsèque
de l’image, avec `object-fit: contain`. Le zoom qui pouvait rogner leurs bords au
survol est supprimé, en grille comme en liste.

« Orthographe modernisée » se trouve sous la césure et est cochée par défaut,
y compris pour les anciens réglages enregistrés. Cette option remplace seulement
U+017F (`ſ`) par `s` : elle ne réécrit pas les autres graphies. Les nœuds texte
originaux sont conservés dans une WeakMap pour une désactivation sans perte ; les
attributs, liens et styles ne sont pas modifiés. Une lettre reste une lettre dans
les offsets CFI. Le réglage est mémorisé avec les autres préférences et s’applique
aussi au texte des notes ouvert dans le dialogue.

## Contrôles navigateur

`reader-navigation.spec.ts` mesure le premier clic sur des chapitres nouveaux à
1920 × 1080, sans faire défiler une cible avec Playwright. Il vérifie aussi que la
position reste correcte après les mises à jour différées de l’iframe.
`classical-library.spec.ts` contrôle les dix livres à 1920 × 1080 et sur Pixel en
portrait/paysage, les couvertures, les réglages du corps, la modernisation
réversible et persistante, et les cartes en grille/liste au survol.
Le catalogue des tests de notes contient maintenant les 37 ouvrages, avec des
parties représentatives des nouveaux livres et les régressions bibliques existantes.

Résultats conservés après la coupure cloud : 36 scénarios des nouveaux ouvrages,
des couvertures et de la navigation réussis, plus les 74 parcours de notes des
37 livres (382 visites de parties, 334 ouvertures de notes). Les 15 tests Node,
les 8 tests Python, le contrôle TypeScript et le build sont réussis. La suite de
régression élargie a été interrompue par l’indisponibilité de l’environnement ;
son exécution complète n’est pas comptée comme réussie.
