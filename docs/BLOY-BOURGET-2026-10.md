# Huit ouvrages de Léon Bloy et Paul Bourget

Le lot publié le 30 octobre 2026 ajoute sept ouvrages de Léon Bloy et
*Le Disciple* de Paul Bourget, avec leurs deux fiches d’auteurs. Les notices,
les étiquettes, les éditions et les sources sont conservées dans
[bloy-bourget-2026-10.json](../scripts/catalogs/bloy-bourget-2026-10.json)
et les biographies dans
[bloy-bourget-authors-2026-10.json](../scripts/catalogs/bloy-bourget-authors-2026-10.json).

## Éditions et droits

| Ouvrage | Édition du fichier fourni |
| --- | --- |
| Le Salut par les Juifs | Joseph Victorion et Cie, Paris, 1906 |
| Exégèse des Lieux Communs | Mercure de France, Paris, 1902 |
| La Femme pauvre | G. Crès, Paris, 1924 |
| Le Disciple | Plon, Paris, 1899 |
| Belluaires et porchers | Stock, Paris, 1905 |
| Le Désespéré | Nouvelle Librairie A. Soirat, Paris, 1886 |
| Les Dernières Colonnes de l’Église | Mercure de France, Paris, 1903 |
| Le Sang du pauvre | Stock, Delamain et Boutelleau, Paris, 1932 |

Ces références viennent des métadonnées et pages de titre des EPUB Wikisource
fournis. Le millésime 1886 du *Désespéré* figure bien sur l’image de sa page de
titre ; il désigne cette édition, sans remplacer la date de première parution
habituellement donnée dans les histoires littéraires. Aucun tirage ultérieur
ni traducteur n’est inventé.

Bloy est mort en 1917 et Bourget en 1935 : les textes historiques sont dans le
domaine public en France et en Suisse suivant le délai ordinaire de 70 ans
après la mort. Les préfaces et dédicaces originales sont conservées ; aucun
paratexte critique contemporain n’a été ajouté. Les transcriptions restent
sous les conditions de Wikisource, notamment CC BY-SA 3.0 : les crédits,
attributions et liens de licence des exports sont conservés en fin de volume.
Les adresses sources figurent aussi dans les métadonnées EPUB et dans Directus.
Les pages Wikisource en ligne ont renvoyé 403 à cet environnement lors du contrôle ;
la vérification de l’édition repose donc sur les fichiers fournis, dont les
empreintes sont consignées dans [le rapport](BLOY-BOURGET-2026-10.json).

## Traitement commun

Le profil `source_profile: "wikisource"` de
[prepare-library-epubs.py](../scripts/prepare-library-epubs.py) complète les
profils déjà utilisés pour les ouvrages classiques. Il ne se connecte pas au CMS :

```bash
python scripts/prepare-library-epubs.py \
  scripts/catalogs/bloy-bourget-2026-10.json /chemin/originaux /chemin/nettoyes
python scripts/prepare-reader-epub.py livre-nettoye.epub livre-web.epub \
  --download livre-liseuse.epub --report notes.json
```

Les noms d’entrée attendus figurent dans le catalogue. Les originaux fournis
restent conservés séparément ; les deux variantes publiées partent du même texte
nettoyé. Pour reprendre un traitement web, repartir de la variante liseuse,
jamais d’un EPUB contenant déjà `literae-notes/`.

- EPUB 3 reflowable, couverture SVG classique et page `titlepage.xhtml` reconnue
  par le lecteur ; PNG équivalent pour les cartes du catalogue.
- Nouvel avis technique concis, distinct des préfaces historiques conservées.
  Les tables générées `ws-summary` sont retirées ; les épigraphes et dédicaces
  qui les précèdent restent présentes. Les crédits techniques sont déplacés
  après le texte, avec leur attribution et leur licence.
- Sommaire reconstruit et indenté : les 35 et 27 chapitres de *La Femme pauvre*
  sont rattachés à leurs deux parties ; les sept subdivisions de la confession
  de Greslou restent sous la quatrième partie du *Disciple*. Les subdivisions
  internes des essais sont conservées. Le titre répété du *Disciple* est retiré
  avant son premier chapitre pour éviter une fausse entrée parente.
- Découpage aux chapitres et subdivisions ; tout XHTML reste sous 250 000 octets.
  Le plus gros fichier du lot mesure moins de 98 000 octets.
- Aucune police embarquée. Les styles d’export sont retirés, les emphases et
  illustrations intérieures conservées. Les enveloppes inline gardent leurs
  espaces et sauts de ligne ; une frontière de bloc retirée dans un titre ne
  colle pas deux mots. Les indentations Wiki sans terme deviennent des citations
  valides plutôt que des listes de définitions invalides.
- Tous les liens conservés sont recalculés et contrôlés. Les images ont une
  extension conforme à leur format, même si leur nom d’export contenait une
  chaîne de paramètres Wikimedia. Les espaces avant `: ; ? !` sont insécables.

La version liseuse garde ses notes normales et leurs liens de retour. La version
web emploie exclusivement le convertisseur commun des
[notes EPUB](EPUB-NOTES.md) : notes groupées par partie appelante, petits fichiers
non linéaires, préchargement des parties courante et voisines, dialogue et aperçu
à la souris existants. Les citations bibliques utilisent la détection et l’API
Fillion déjà présentes. Aucun profil de lecteur propre à Bloy ou Bourget n’est ajouté.
Le lot comprend 193 notes reconnues, y compris les renvois des crédits Wikisource.

## Directus et contrôle

Les fichiers web sont dans `books/ebooks`, les téléchargements dans
`books/dl_ebooks`, et les couvertures dans `books/images`. Les deux relations
`ebook_files` et `ebook_download_files` comportent une seule édition par nouveau
livre ; leurs métadonnées croisées contiennent les UUID complets correspondants.
Les nouveaux livres sont ajoutés après l’ordre Directus existant. Les huit
ouvrages et leurs auteurs sont publics, sans remplacer un ouvrage existant.
Les fichiers publics sont comparés aux sorties locales par SHA-256 après import.

Les seize EPUB et les Confessions réparées passent EPUBCheck 5.4.0 sans erreur
ni avertissement. Un audit supplémentaire contrôle les cibles des liens, les
limites de taille, l’absence de polices et la conservation des paragraphes et
des notes entre les deux variantes. Les contrôles du navigateur utilisent les
vrais fichiers publics Directus :

- `classical-library.spec.ts` inclut les huit livres sur ordinateur, téléphone
  portrait et paysage, pour les couvertures et les réglages typographiques ;
- `all-books-notes.spec.ts` inclut leurs parties représentatives dans le catalogue
  de tests commun, pour le préchargement, les ouvertures et les téléchargements.

Résultats : 40 scénarios distincts réussis sur les huit livres, dont 16 parcours
de notes visitant 152 parties et ouvrant 160 notes. Les ouvertures mesurées restent
sous 100 ms. Douze tests Python, 25 tests Node, le contrôle TypeScript et le build
sont réussis. Deux échecs initiaux provenaient d’une assertion qui appliquait les
contraintes de ponctuation de l’EPUB au texte biblique SQLite chargé séparément ;
l’assertion porte désormais sur la note source, et les deux parcours relancés
réussissent.

## Métadonnées des Confessions pour liseuse

Le fichier téléchargeable de Moreau contenait réellement `dc:title = Aurelius
Augustinus` et `dc:creator = Confessions`, avec les mêmes valeurs inversées dans
les champs `file-as`. [fix-confessions-metadata.py](../scripts/fix-confessions-metadata.py)
répare le titre en **Confessions**, l’auteur en **Saint Augustin**, et leurs champs
de classement. L’auteur correspond désormais à celui de *La Cité de Dieu*.

Le document OPF et le titre déclaré dans le NCX changent : les intitulés et
cibles du sommaire, le texte, la couverture et les autres ressources restent
identiques octet pour octet. Le titre NCX est également corrigé pour les liseuses
qui le préfèrent au titre OPF. Le fichier dans Directus
conserve son UUID, son nom, son dossier et son association au livre. La version
web possédait déjà les bonnes métadonnées. Sur une liseuse qui a déjà indexé
l’ancien fichier, retirer l’ancienne copie puis importer le nouvel EPUB permet
de renouveler sa fiche.
