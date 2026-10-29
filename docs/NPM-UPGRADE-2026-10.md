# Dépendances npm – 29 octobre 2026

Le dépôt a d’abord été synchronisé avec `main` (`3daba65`). Vérification directe
sur https://registry.npmjs.org, puis installation avec Node **26.13.0** et npm
**12.2.1**. `.nvmrc` permet de retrouver cette version Node avec nvm.
Le minimum déclaré suit désormais celui d’Astro : Node 22.23.4.

## Dépendances directes

Les versions retenues sont figées dans `package.json` et `package-lock.json`.
Les versions de développement/alpha/bêta ne remplacent pas une version stable
simplement parce que leur numéro paraît supérieur.

| Paquet | Après git pull | Dernière stable publiée | Retenue |
| --- | --- | --- | --- |
| `@astrojs/node` | 11.1.4 | 11.1.9 | 11.1.9 |
| `@astrojs/svelte` | ^9.1.2 | 9.1.2 | 9.1.2 |
| `@tailwindcss/vite` | 4.3.3 | 4.3.3 | 4.3.3 |
| `astro` | ^7.4.4 | 7.4.4 | 7.4.4 |
| `better-sqlite3` | 13.0.3 | 13.0.3 | 13.0.3 |
| `epubjs` | 0.3.93 | 0.3.93 | 0.3.93 |
| `micromark` | 4.0.2 | 4.0.3 | 4.0.3 |
| `sql.js` | 1.15.0 | 1.15.2 | 1.15.2 |
| `svelte` | 5.57.0 | 5.57.3 | 5.57.3 |
| `tailwindcss` | 4.3.3 | 4.3.3 | 4.3.3 |
| `typescript` | 6.0.3 | 7.0.2 | 6.0.3 |
| `@playwright/test` | 1.64.1 | 1.64.1 | 1.64.1 |
| `@types/better-sqlite3` | 9.6.0 | 9.6.0 | 9.6.0 |
| `@types/sql.js` | 1.4.11 | 1.4.11 | 1.4.11 |

**TypeScript 7.0.2 n’est pas retenu** : la dernière intégration
`@astrojs/svelte@9.1.2` déclare `typescript: ^5.3.3 || ^6.0.0`.
6.0.3 est la dernière version stable 6.x publiée. Aucun `--force` ou
`--legacy-peer-deps` ne masque ce désaccord. Le moteur EPUB reste 0.3.93,
sa dernière version stable ; 0.5.0-alpha.3 reste une alpha.

`approve`, `scripts` et la déclaration directe `es5-ext` ont été retirés :
aucun import ni script du site ne les utilise. Les deux premiers sont des
paquets npm distincts, pas des commandes de configuration d’installation.
`es5-ext` reste présent si une dépendance indirecte le réclame.

Le verrouillage actualise 25 entrées de version par rapport au git pull,
y compris les dépendances indirectes. Une version indirecte plus récente ne
peut pas être imposée globalement lorsque son parent exige une autre API :
par exemple, le plugin Svelte déclare `obug ^2.1.0`, donc 2.2.1 est retenu
plutôt que 3.0.0. Les versions natives de Lightning CSS restent associées à
la version exacte requise par Tailwind. Les différents chemins d’un même
paquet peuvent légitimement conserver plusieurs versions.

## Audit

Avant et après : **3 alertes faibles**, aucune modérée, élevée ou critique.
Elles correspondent à une même dépendance :
`@astrojs/svelte → @sveltejs/vite-plugin-svelte → deepmerge@4.3.1`.
L’avis est [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4).
4.3.1 reste la dernière version publiée ; npm ne propose pas de correctif.
Le plugin utilise ce module pour fusionner sa configuration de compilation.
La mise à jour ne prétend donc pas produire un audit vierge.

L’override EPUB existant `@xmldom/xmldom@0.9.12` reste la dernière version
publiée. Les scripts d’installation nécessaires à `better-sqlite3` sont
explicitement autorisés. Les scripts d’information de `core-js` et `es5-ext`
sont explicitement désactivés ; cela ne supprime pas leur code de bibliothèque.
L’avertissement de dépréciation `@types/localforage` vient de la chaîne EPUB
existante ; les types sont déjà fournis par localforage lui-même.

## Reproduction sur le VPS

Après sélection du Node 26 du service et du terminal :

```bash
node --version
npm ci
npm run check
npm run build
sudo systemctl restart scriptorium.service
```

`npm ci` réinstalle aussi les modules natifs pour le Node utilisé, ce qui évite
une ancienne liaison SQLite conservée après un changement de version Node.
Aucune modification Directus ni du contenu des EPUB ou de la Bible n’est faite.

## Validation réalisée

Après réinstallation propre avec `npm ci`, sous Node 26.13.0 / npm 12.2.1 :

- `npm ls --all` : aucun conflit de dépendances signalé ;
- TypeScript strict et frontière statique : réussis ;
- 20 tests Node : réussis, y compris les requêtes SQLite natives ;
- build de production : réussi, avec les deux sitemaps et le cache PWA ;
- 70 scénarios Chromium : réussis (4,6 minutes), couvrant les livres et les
  polices EPUB, les signets, le sommaire, les notes et citations bibliques,
  le catalogue, le comparateur, les téléchargements et mises à jour PWA,
  ainsi que la réouverture sans réseau sur ordinateur et mobile.

La suite complète de tous les EPUB n’a pas été relancée ; ces 70 scénarios
constituent le contrôle de régression ciblé de cette mise à jour.

## Inventaire complet comparé en ligne

301 installations physiques, représentant **290 noms de paquets** (hors binaires
optionnels d’autres plateformes non installés). Les versions ci-dessous ont été
comparées une à une avec le tag `latest` du registre npm. Ce tag peut désigner
une préversion pour certains paquets indirects. Une différence ne signifie donc
pas qu’une substitution respecte les contraintes du parent.

| Paquet | Version(s) installée(s) | Tag latest du registre |
| --- | --- | --- |
| `@astrojs/compiler-binding` | 0.5.2 | 0.5.2 |
| `@astrojs/compiler-binding-linux-x64-gnu` | 0.5.2 | 0.5.2 |
| `@astrojs/compiler-rs` | 0.5.2 | 0.5.2 |
| `@astrojs/internal-helpers` | 0.13.0 | 0.13.0 |
| `@astrojs/markdown-satteri` | 0.4.6 | 0.4.6 |
| `@astrojs/node` | 11.1.9 | 11.1.9 |
| `@astrojs/prism` | 4.1.2 | 4.1.2 |
| `@astrojs/svelte` | 9.1.2 | 9.1.2 |
| `@astrojs/telemetry` | 3.4.2 | 3.4.2 |
| `@babel/helper-string-parser` | 7.29.11 | 8.0.8 |
| `@babel/helper-validator-identifier` | 7.29.7 | 8.0.6 |
| `@babel/parser` | 7.29.11 | 8.0.8 |
| `@babel/types` | 7.29.11 | 8.0.8 |
| `@bruits/satteri-linux-x64-gnu` | 0.10.5 | 0.11.6 |
| `@capsizecss/unpack` | 4.0.1 | 4.0.1 |
| `@clack/core` | 1.5.1 | 1.5.1 |
| `@clack/prompts` | 1.8.1 | 1.8.1 |
| `@img/colour` | 1.1.0 | 1.1.0 |
| `@img/sharp-libvips-linux-x64` | 1.3.4 | 1.3.4 |
| `@img/sharp-linux-x64` | 0.35.5 | 0.35.5 |
| `@jridgewell/gen-mapping` | 0.3.13 | 0.3.13 |
| `@jridgewell/remapping` | 2.3.5 | 2.3.5 |
| `@jridgewell/resolve-uri` | 3.1.2 | 3.1.2 |
| `@jridgewell/sourcemap-codec` | 1.6.0 | 1.6.0 |
| `@jridgewell/trace-mapping` | 0.3.31 | 0.3.31 |
| `@oslojs/encoding` | 1.1.0 | 1.1.0 |
| `@oxc-project/types` | 0.155.0 | 0.156.0 |
| `@playwright/test` | 1.64.1 | 1.64.1 |
| `@rolldown/binding-linux-x64-gnu` | 1.2.15 | 1.2.15 |
| `@rolldown/pluginutils` | 1.0.1 | 1.0.1 |
| `@shikijs/core` | 4.5.0 | 4.5.0 |
| `@shikijs/engine-javascript` | 4.5.0 | 4.5.0 |
| `@shikijs/engine-oniguruma` | 4.5.0 | 4.5.0 |
| `@shikijs/langs` | 4.5.0 | 4.5.0 |
| `@shikijs/primitive` | 4.5.0 | 4.5.0 |
| `@shikijs/themes` | 4.5.0 | 4.5.0 |
| `@shikijs/types` | 4.5.0 | 4.5.0 |
| `@shikijs/vscode-textmate` | 10.1.0 | 10.1.0 |
| `@sveltejs/acorn-typescript` | 1.0.13 | 1.0.13 |
| `@sveltejs/vite-plugin-svelte` | 7.3.1 | 7.3.1 |
| `@tailwindcss/node` | 4.3.3 | 4.3.3 |
| `@tailwindcss/oxide` | 4.3.3 | 4.3.3 |
| `@tailwindcss/oxide-linux-x64-gnu` | 4.3.3 | 4.3.3 |
| `@tailwindcss/vite` | 4.3.3 | 4.3.3 |
| `@types/better-sqlite3` | 9.6.0 | 9.6.0 |
| `@types/debug` | 4.1.13 | 4.1.13 |
| `@types/emscripten` | 1.41.6 | 1.41.6 |
| `@types/estree` | 1.0.10 | 1.0.10 |
| `@types/estree-jsx` | 1.0.5 | 1.0.5 |
| `@types/hast` | 3.0.5 | 3.0.5 |
| `@types/localforage` | 0.0.34 | 0.0.34 |
| `@types/mdast` | 4.0.4 | 4.0.4 |
| `@types/ms` | 2.1.0 | 2.1.0 |
| `@types/nlcst` | 2.0.3 | 2.0.3 |
| `@types/node` | 26.6.6 | 26.6.6 |
| `@types/sql.js` | 1.4.11 | 1.4.11 |
| `@types/unist` | 3.0.3 | 3.0.3 |
| `@ungap/structured-clone` | 1.4.0 | 1.4.0 |
| `@xmldom/xmldom` | 0.9.12 | 0.9.12 |
| `acorn` | 8.19.0 | 8.19.0 |
| `am-i-vibing` | 0.5.0 | 0.5.0 |
| `anymatch` | 3.1.3 | 3.1.3 |
| `aria-query` | 5.3.1, 5.3.2 | 5.3.2 |
| `astro` | 7.4.4 | 7.4.4 |
| `axobject-query` | 4.1.0 | 4.1.0 |
| `bail` | 2.0.2 | 2.0.2 |
| `better-sqlite3` | 13.0.3 | 13.0.3 |
| `boolbase` | 1.0.0 | 2.0.0 |
| `ccount` | 2.0.1 | 2.0.1 |
| `character-entities` | 2.0.2 | 2.0.2 |
| `character-entities-html4` | 2.1.0 | 2.1.0 |
| `character-entities-legacy` | 3.0.0 | 3.0.0 |
| `chokidar` | 5.0.0 | 6.0.0 |
| `ci-info` | 4.4.0 | 4.4.0 |
| `clsx` | 2.1.1 | 2.1.1 |
| `comma-separated-tokens` | 2.0.3 | 2.0.3 |
| `commander` | 11.1.0 | 15.0.0 |
| `common-ancestor-path` | 2.0.0 | 2.0.0 |
| `cookie` | 2.0.1 | 2.0.1 |
| `cookie-es` | 1.2.3 | 3.1.1 |
| `core-js` | 3.51.0 | 3.51.0 |
| `core-util-is` | 1.0.3 | 1.0.3 |
| `crossws` | 0.3.5 | 0.4.17 |
| `css-select` | 6.0.0 | 7.0.0 |
| `css-tree` | 2.2.1, 3.2.1 | 3.2.1 |
| `css-what` | 7.0.0 | 8.0.0 |
| `csso` | 5.0.5 | 5.0.5 |
| `d` | 1.0.2 | 1.0.2 |
| `debug` | 4.4.3 | 4.4.3 |
| `decode-named-character-reference` | 1.3.0 | 1.3.0 |
| `dedent-js` | 1.0.1 | 1.0.1 |
| `deepmerge` | 4.3.1 | 4.3.1 |
| `defu` | 6.1.7 | 6.1.7 |
| `depd` | 2.0.0 | 2.0.0 |
| `dequal` | 2.0.3 | 2.0.3 |
| `destr` | 2.0.5 | 2.0.5 |
| `detect-libc` | 2.1.2 | 2.1.2 |
| `devalue` | 5.9.4, 6.0.3 | 6.0.3 |
| `devlop` | 1.1.0 | 1.1.0 |
| `diff` | 9.0.0 | 9.0.0 |
| `dom-serializer` | 2.0.0 | 3.1.1 |
| `domelementtype` | 2.3.0 | 3.0.0 |
| `domhandler` | 5.0.3 | 6.0.1 |
| `domutils` | 3.2.2 | 4.0.2 |
| `dset` | 3.1.4 | 3.1.4 |
| `ee-first` | 1.1.1 | 1.1.1 |
| `encodeurl` | 2.0.1 | 2.0.1 |
| `enhanced-resolve` | 5.26.0 | 5.26.0 |
| `entities` | 4.5.0 | 9.0.0 |
| `epubjs` | 0.3.93 | 0.3.93 |
| `es-module-lexer` | 3.0.4 | 3.0.4 |
| `es5-ext` | 0.10.64 | 0.10.64 |
| `es6-iterator` | 2.0.3 | 2.0.3 |
| `es6-symbol` | 3.1.4 | 3.1.4 |
| `escape-html` | 1.0.3 | 1.0.3 |
| `esm-env` | 1.2.2 | 1.2.2 |
| `esniff` | 2.0.1 | 2.0.1 |
| `esrap` | 2.4.0 | 2.4.0 |
| `etag` | 1.8.1 | 1.8.1 |
| `event-emitter` | 0.3.5 | 0.3.5 |
| `eventemitter3` | 5.0.4 | 5.0.4 |
| `ext` | 1.7.0 | 1.7.0 |
| `extend` | 3.0.2 | 3.0.2 |
| `fast-string-truncated-width` | 3.0.3 | 3.0.3 |
| `fast-string-width` | 3.0.2 | 3.0.2 |
| `fast-wrap-ansi` | 0.2.2 | 0.2.2 |
| `fdir` | 6.5.0 | 6.5.0 |
| `flattie` | 1.1.1 | 1.1.1 |
| `fnv1a-64` | 0.1.2 | 0.1.2 |
| `fontace` | 0.4.1 | 0.4.1 |
| `fontkitten` | 1.0.3 | 1.0.3 |
| `fresh` | 2.0.0 | 0.5.2 |
| `get-tsconfig` | 5.0.0-beta.6 | 4.14.3 |
| `github-slugger` | 2.0.0 | 2.0.0 |
| `graceful-fs` | 4.2.11 | 4.2.11 |
| `h3` | 1.15.11 | 2.0.8 |
| `hast-util-to-html` | 9.0.5 | 9.0.5 |
| `hast-util-whitespace` | 3.0.0 | 3.0.0 |
| `html-escaper` | 3.0.3 | 3.0.3 |
| `html-void-elements` | 3.0.0 | 3.0.0 |
| `http-cache-semantics` | 4.3.0 | 4.3.0 |
| `http-errors` | 2.0.1 | 2.0.1 |
| `immediate` | 3.0.6 | 3.3.0 |
| `inherits` | 2.0.4 | 2.0.4 |
| `iron-webcrypto` | 1.2.1 | 2.0.0 |
| `is-docker` | 4.0.0 | 4.0.0 |
| `is-plain-obj` | 4.1.0 | 4.1.0 |
| `is-reference` | 3.0.3 | 3.0.3 |
| `isarray` | 1.0.0 | 2.0.5 |
| `jiti` | 2.7.0 | 2.7.0 |
| `jsonc-parser` | 3.3.1 | 3.3.1 |
| `jszip` | 3.10.2 | 3.10.2 |
| `lie` | 3.1.1, 3.3.0 | 3.3.0 |
| `lightningcss` | 1.32.0, 1.33.0 | 1.33.0 |
| `lightningcss-linux-x64-gnu` | 1.32.0, 1.33.0 | 1.33.0 |
| `localforage` | 1.10.0 | 1.10.0 |
| `locate-character` | 3.0.0 | 3.0.0 |
| `lodash` | 4.18.1 | 4.18.1 |
| `lru-cache` | 11.5.3 | 11.5.3 |
| `magic-string` | 0.30.21, 1.4.5 | 1.4.5 |
| `magicast` | 0.5.5 | 0.5.5 |
| `marks-pane` | 1.0.9 | 1.0.9 |
| `mdast-util-to-hast` | 13.2.1 | 13.2.1 |
| `mdn-data` | 2.0.28, 2.27.1 | 2.37.2 |
| `micromark` | 4.0.3 | 4.0.3 |
| `micromark-core-commonmark` | 2.0.4 | 2.0.4 |
| `micromark-factory-destination` | 2.0.1 | 2.0.1 |
| `micromark-factory-label` | 2.0.1 | 2.0.1 |
| `micromark-factory-space` | 2.1.0 | 2.1.0 |
| `micromark-factory-title` | 2.0.1 | 2.0.1 |
| `micromark-factory-whitespace` | 2.0.1 | 2.0.1 |
| `micromark-util-character` | 2.1.1 | 2.1.1 |
| `micromark-util-chunked` | 2.0.1 | 2.0.1 |
| `micromark-util-classify-character` | 2.0.1 | 2.0.1 |
| `micromark-util-combine-extensions` | 2.0.1 | 2.0.1 |
| `micromark-util-decode-numeric-character-reference` | 2.0.2 | 2.0.2 |
| `micromark-util-edit-map` | 1.0.0 | 1.0.0 |
| `micromark-util-encode` | 2.0.1 | 2.0.1 |
| `micromark-util-html-tag-name` | 2.0.1 | 2.0.1 |
| `micromark-util-normalize-identifier` | 2.0.1 | 2.0.1 |
| `micromark-util-resolve-all` | 2.0.1 | 2.0.1 |
| `micromark-util-sanitize-uri` | 2.0.1 | 2.0.1 |
| `micromark-util-subtokenize` | 2.1.0 | 2.1.0 |
| `micromark-util-symbol` | 2.0.1 | 2.0.1 |
| `micromark-util-types` | 2.0.3 | 2.0.3 |
| `mime-db` | 1.54.0 | 1.54.0 |
| `mime-types` | 3.0.2 | 3.0.2 |
| `mrmime` | 2.0.1 | 2.0.1 |
| `ms` | 2.1.3 | 2.1.3 |
| `nanoid` | 3.3.20 | 6.0.2 |
| `neotraverse` | 1.0.1 | 1.0.1 |
| `next-tick` | 1.1.0 | 1.1.0 |
| `nlcst-to-string` | 4.0.0 | 4.0.0 |
| `node-addon-api` | 8.9.2 | 8.9.2 |
| `node-fetch-native` | 1.6.7 | 1.6.7 |
| `node-mock-http` | 1.0.5 | 1.0.5 |
| `normalize-path` | 3.0.0 | 3.0.0 |
| `nth-check` | 2.1.1 | 3.0.1 |
| `obug` | 2.2.1, 3.0.0 | 3.0.0 |
| `ofetch` | 1.5.1 | 1.5.1 |
| `on-finished` | 2.4.2 | 2.4.2 |
| `oniguruma-parser` | 0.12.2 | 0.12.2 |
| `oniguruma-to-es` | 4.3.6 | 4.3.6 |
| `p-limit` | 7.3.3 | 7.3.3 |
| `p-queue` | 9.3.5 | 10.0.0 |
| `p-timeout` | 7.0.2 | 8.0.0 |
| `package-manager-detector` | 1.9.0 | 1.9.0 |
| `pako` | 1.0.11 | 3.0.3 |
| `path-webpack` | 0.0.3 | 0.0.3 |
| `piccolore` | 0.1.3 | 0.1.3 |
| `picocolors` | 1.1.1 | 1.1.1 |
| `picomatch` | 2.3.2, 4.0.7 | 4.0.7 |
| `playwright` | 1.64.1 | 1.64.1 |
| `playwright-core` | 1.64.1 | 1.64.1 |
| `postcss` | 8.5.32 | 8.5.32 |
| `prismjs` | 1.30.0 | 1.30.0 |
| `process-ancestry` | 0.1.0 | 0.1.0 |
| `process-nextick-args` | 2.0.1 | 2.0.1 |
| `property-information` | 7.2.0 | 7.2.0 |
| `radix3` | 1.1.2 | 1.1.2 |
| `range-parser` | 1.3.0 | 1.3.0 |
| `readable-stream` | 2.3.8 | 4.8.0 |
| `readdirp` | 5.1.1 | 5.1.1 |
| `regex` | 6.1.0 | 6.1.0 |
| `regex-recursion` | 6.0.2 | 6.0.2 |
| `regex-utilities` | 2.3.0 | 2.3.0 |
| `resolve-pkg-maps` | 1.0.0 | 1.0.0 |
| `retext-smartypants` | 6.2.0 | 6.2.0 |
| `rolldown` | 1.2.15 | 1.2.15 |
| `safe-buffer` | 5.1.2 | 5.2.1 |
| `satteri` | 0.10.5 | 0.11.6 |
| `sax` | 1.6.1 | 1.6.1 |
| `scule` | 1.3.0 | 1.3.0 |
| `semver` | 7.8.5 | 7.8.5 |
| `send` | 1.2.1 | 1.2.1 |
| `server-destroy` | 1.0.1 | 1.0.1 |
| `setimmediate` | 1.0.5 | 1.0.5 |
| `setprototypeof` | 1.2.0 | 1.2.0 |
| `sharp` | 0.35.5 | 0.35.5 |
| `shiki` | 4.5.0 | 4.5.0 |
| `sisteransi` | 1.0.5 | 2.0.0 |
| `smol-toml` | 1.9.1 | 1.9.1 |
| `source-map-js` | 1.2.2 | 1.2.2 |
| `space-separated-tokens` | 2.0.2 | 2.0.2 |
| `sql.js` | 1.15.2 | 1.15.2 |
| `statuses` | 2.0.2 | 2.0.2 |
| `std-env` | 4.3.0 | 4.3.0 |
| `string_decoder` | 1.1.1 | 1.3.0 |
| `stringify-entities` | 4.0.4 | 4.0.4 |
| `svelte` | 5.57.3 | 5.57.3 |
| `svelte2tsx` | 0.7.62 | 0.7.62 |
| `svgo` | 4.1.0 | 4.1.0 |
| `tailwindcss` | 4.3.3 | 4.3.3 |
| `tapable` | 2.3.3 | 2.3.3 |
| `tiny-inflate` | 1.0.3 | 1.0.3 |
| `tinyclip` | 1.0.3 | 1.0.3 |
| `tinyexec` | 1.3.1 | 1.3.1 |
| `tinyglobby` | 0.2.17 | 0.2.17 |
| `tinyps` | 0.5.1 | 0.5.1 |
| `toidentifier` | 1.0.1 | 1.0.1 |
| `trim-lines` | 3.0.1 | 3.0.1 |
| `trough` | 2.2.0 | 2.2.0 |
| `type` | 2.7.3 | 2.7.3 |
| `typescript` | 6.0.3 | 7.0.2 |
| `ufo` | 1.6.4 | 1.6.4 |
| `ultrahtml` | 1.7.0 | 1.7.0 |
| `uncrypto` | 0.1.3 | 0.1.3 |
| `undici` | 8.12.3 | 8.12.3 |
| `undici-types` | 8.9.0 | 8.12.3 |
| `unified` | 11.0.5 | 11.0.5 |
| `unifont` | 1.0.3 | 1.0.3 |
| `unist-util-is` | 6.0.1 | 6.0.1 |
| `unist-util-position` | 5.0.0 | 5.0.0 |
| `unist-util-stringify-position` | 4.0.0 | 4.0.0 |
| `unist-util-visit` | 5.2.0 | 5.2.0 |
| `unist-util-visit-parents` | 6.1.0 | 6.1.0 |
| `unstorage` | 1.17.6 | 2.0.0-beta.0 |
| `util-deprecate` | 1.0.2 | 1.0.2 |
| `verkit` | 0.5.0 | 0.5.0 |
| `vfile` | 6.0.3 | 6.0.3 |
| `vfile-message` | 4.0.3 | 4.0.3 |
| `vite` | 8.3.5 | 8.3.5 |
| `vitefu` | 1.1.3 | 1.1.3 |
| `xxhash-wasm` | 1.1.0 | 1.1.0 |
| `yaml` | 2.9.1 | 2.9.1 |
| `yargs-parser` | 22.0.0 | 22.0.0 |
| `yocto-queue` | 1.2.2 | 1.2.2 |
| `zimmerframe` | 1.1.5 | 1.1.5 |
| `zod` | 4.6.7 | 4.6.7 |
| `zwitch` | 2.0.4 | 2.0.4 |
