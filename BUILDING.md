# Build and test

Use a maintained Node.js release. Core tests and worker generation use Node built-ins; no runtime package installation is required.

```sh
node build-worker.cjs
node --test tests/*.test.cjs
```

The extension is in `extension/`. To test unpacked in Chrome, choose this directory, which contains manifest.json. Only one comparison build should be enabled at a time.

Browser fixture tests and icon generation require Playwright and a separately configured test browser. They are development tools and are not included in the installed extension.

## ZIP and CRX

The installation ZIP contains the contents of extension/ at its root, plus LICENSE.md, LICENSE-MIT.txt, THIRD-PARTY-NOTICES.md and CREDITS.md. Do not zip the outer repository directory as the installation package.

The existing package-crx.cjs expects the install ZIP in the repository's parent directory, named Kavita-Komga-GPU-Image-Enhancer-VERSION.zip. It keeps the private signing key in the parent private-signing-api1 directory. Private keys must never be committed or included in archives.

The manifest key is public identity information, not a private key. To create your own signing identity, use `node package-crx.cjs init`, then prepare the install ZIP and run `node package-crx.cjs`. This changes the extension identity; do not do it for an existing release unless an identity change is intended.

## Public modules

reference-packages/ contains the three separately distributed public modules. Tests use additional legacy fixtures under tests/fixtures/modules/; those fixtures are not part of the module download pack and are not a promise of current public module support.

## Introduction page

site/index.html is a buildless static page. Keep styles.css, script.js, assets/ and docs/ at the same relative locations. The relative structure supports GitHub Pages subdirectory hosting. Comparison and GUI images remain unconfigured pending permission and material checks. No analytics or external font dependencies are used.
