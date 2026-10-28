# Éditions patristiques importées en octobre 2026

Le lot comporte 4 ouvrages de saint Augustin et 19 de saint Jean Chrysostome.
Les Confessions (Moreau, 1864) existaient déjà : leur fichier a été remplacé
sans changer l’UUID de l’ouvrage ou du fichier, après sauvegarde de l’original.
Les 22 autres ouvrages ont été créés et reliés à leur auteur dans Directus.

## Sources et droits

La [Bibliothèque des Pères de l’Église de l’Université de Fribourg](https://bkv.unifr.ch/fr/about/copyrights)
indique : « Pour autant que je sache, les textes de la BKV ne sont plus soumis à
des droits d’auteur et peuvent donc être utilisés librement. » Elle demande de
mentionner leur provenance. Les textes fournis ont été rapprochés de ses notices
bibliographiques et des éditions historiques numérisées par la Bibliothèque
monastique. Les références individuelles sont conservées dans
[scripts/catalogs/patristic-2026-10.json](../scripts/catalogs/patristic-2026-10.json),
dans les métadonnées EPUB et dans les descriptions des fichiers Directus.
Aucune illustration moderne provenant des sites sources n’est reproduite.

- Augustin : Moreau, 1864 (Confessions) ; Saisset, 1869 (Cité de Dieu) ;
  abbé Devoille, 1867 (Sermon sur la montagne) ; abbé Aubert, 1869 (Contre les Juifs).
- Chrysostome : collection des Œuvres complètes dirigée par M. Jeannin,
  Bar-le-Duc, L. Guérin et Cie. **1864 est la date bibliographique de collection
  donnée par la BKV**, sans prétendre dater séparément chaque tome. La notice
  du [commentaire sur Matthieu](https://www.bibliotheque-monastique.ch/bibliotheque/bibliotheque/saints/chrysostome/matthieu/index.htm)
  indique 1865 pour les tomes VII–VIII.
- Les signatures de traducteurs présentes dans le texte sont conservées. Pour
  Hébreux, la notice BKV mentionne Boucherie, mais le texte porte Baissey et
  l’abbé Collery : le catalogue retient ces signatures. Les initiales B. A.,
  J.-B. J. et X… ne sont pas développées sans preuve. À défaut de nom attesté,
  le fichier indique honnêtement « sous la direction de M. Jeannin ».

## Transformation

L’outil Python [prepare-patristic-epubs.py](../scripts/prepare-patristic-epubs.py)
requiert `lxml`. Il travaille sur des copies locales et n’a aucun accès au CMS :

```bash
python scripts/prepare-patristic-epubs.py \
  scripts/catalogs/patristic-2026-10.json \
  /chemin/epub-originaux /chemin/epub-prepares
```

Les sorties contiennent un `report.json` avec empreintes SHA-256, taille maximale
XHTML et compte des liens réécrits. Le catalogue doit être vérifié avant toute
publication ; cet outil ne constitue pas une vérification juridique automatique.

- EPUB 3 reflowable, langue française, navigation XHTML imbriquée et métadonnées
  bibliographiques. Le `mimetype` est placé en premier et sans compression.
- Page de garde `titlepage.xhtml` et composition SVG classique, avec auteur,
  titre, traduction, édition et année. Une couverture PNG équivalente sert au
  catalogue Directus. Aucune police embarquée ni police imposée au texte courant.
- Suppression des pages de titre/sommaires générés en double et, pour Matthieu,
  des restes de navigation web et des anciennes pages ornementales précédant
  l’Avertissement. Les préfaces historiques, analyses et notes sont conservées.
- Contrôle de conservation du texte lors du retrait des enveloppes Pandoc et
  pendant le découpage. Les IDs dupliqués sont rendus uniques, sans changer la
  cible de la première occurrence des liens d’origine.
- Un fichier par livre/homélie quand sa taille le permet, sinon découpage aux
  limites des blocs. Chaque XHTML reste strictement sous **250 000 octets**.
- Sommaire avec livres/homélies parents et chapitres/articles enfants ; les 90
  homélies de Matthieu sont rétablies au bon niveau. Les notes finales possèdent
  leur propre entrée. Liens et renvois de notes recalculés après découpage.
- Les liens déjà sans destination dans l’EPUB de Matthieu deviennent du texte
  simple. Aucun contenu de note n’est inventé pour réparer un lien source cassé.

Le lecteur reconnaît déjà `titlepage.xhtml` et `.literae-cover`, fixe la hauteur
au viewport du lecteur, et préserve la composition originale de la couverture.
Aucune exception supplémentaire dans le code du site n’a été nécessaire.
Les autres pages suivent les réglages existants : police, taille, marges,
justification, césure et palette. Ce lot n’a pas le tag « Sainte Bible » ; le
traitement spécifique des notes en fenêtre des Bibles ne lui est pas appliqué.

## Validation et publication

Avant import, exécuter EPUBCheck sur **chaque** sortie, sans erreur ni avertissement.
Après import, reconstruire le site et exécuter :

```bash
npm run build
npm run check
CI=1 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
  npm run test:pwa -- tests/e2e/patristic-library.spec.ts tests/e2e/library.spec.ts
```

Les tests du lot lisent les vrais fichiers publics Directus sur desktop et mobile,
vérifient les couvertures et les réglages du corps du texte. Les fichiers EPUB et
PNG restent dans Directus, sans copie binaire dans Git. L’import vérifie les
empreintes des fichiers publics après téléversement ; le journal local conserve
les UUID et permet de reprendre une publication interrompue sans recréer les livres.

Sauvegarde Directus de l’EPUB original des Confessions :
`d93a0198-f1fc-42d5-af56-994006d0296b`.

Fiche créée pour Jean Chrysostome : `87b72f4e-fd1a-434e-8ab7-8f8a280d1864`.

Contrôles de ce lot : 23 EPUB validés avec EPUBCheck 5.4.0 (aucune erreur
ni avertissement), plus gros XHTML de 191 137 octets ; 69 essais locaux
ordinateur/portrait/paysage, puis 57 tests Playwright sur les fichiers publics
Directus. Build et contrôle TypeScript réussis.
