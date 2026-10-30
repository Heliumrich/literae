## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

## Library assets

- Active EPUBs and book covers use Directus `local` storage; gallery media stays on `s3`.
- Send the multipart `storage=local` field before the file. Uploads and migrations must be sequential; do not blindly retry an interrupted transfer on the same UUID.
- A content change gets a new EPUB UUID. Moving identical bytes between storages preserves the UUID and storage filename.
- Throttle S3 cleanup and check both collection references and live prerendered pages before deleting old files. CMS references alone are insufficient until the VPS has rebuilt.
- See [the local storage procedure](docs/DIRECTUS-LOCAL-LIBRARY.md) and [publication rules](docs/EPUB-ASSET-PUBLICATION.md).
