# Build and test

Use a maintained Node.js release. Core tests and worker generation use Node built-ins; no runtime package installation is required.

```sh
node build-default-filters.cjs
node build-worker.cjs
node --test tests/*.test.cjs
```

The extension is in `extension/`. To test unpacked in Chrome, choose this directory, which contains manifest.json. Only one comparison build should be enabled at a time.

Browser fixture tests and icon generation require Playwright and a separately configured test browser. They are development tools and are not included in the installed extension.

## ZIP and CRX

The installation ZIP contains the contents of extension/ at its root, plus LICENSE.md, LICENSE-MIT.txt, THIRD-PARTY-NOTICES.md and CREDITS.md. Do not zip the outer repository directory as the installation package.

The existing package-crx.cjs expects the install ZIP in the repository's parent directory, named Kavita-Komga-GPU-Image-Enhancer-VERSION.zip. It keeps the private signing key at `../private-signing-api1/gpu-enhancer-release.pem`. Set `GPUIE_SIGNING_KEY_FILE` to use an existing key elsewhere. Private keys must never be committed or included in public archives. Download and retain a separate private backup outside the cloud workspace; a workspace alone is not a durable key backup.

The manifest key is public identity information, not a private key. To create your own signing identity, use `node package-crx.cjs init`, then prepare the install ZIP and run `node package-crx.cjs`. This changes the extension identity; do not do it for an existing release unless an identity change is intended.

## Public modules

reference-packages/ contains four separately distributable public modules, including the three removable default filters. Run build-default-filters.cjs after updating packaged filter sources; it generates static metadata and checksums from trusted repository files. Tests use additional legacy fixtures under tests/fixtures/modules/; those fixtures are not part of the module download pack and are not a promise of current public module support.

See [Module execution lifecycle](docs/Module-Execution-Lifecycle-ja.md) for execution boundaries, permission revocation, regression coverage and remaining store-review risks. The Chromium fixture uses actual MAIN/isolated worlds, Sandbox CSP and WebGL, with mocked extension APIs:

```sh
TEST_CHROME=/path/to/chromium node tests/module-execution-browser.cjs
TEST_CHROME=/path/to/chromium node tests/module-startup-browser.cjs
```

The startup fixture exercises the production HELLO path and real Reader Core, including interrupted initialization, catalog edits before retry, hot reconnection, foundation failures, stale readiness markers, overlapping connections and registered title pages, for Kavita/Komga, desktop/touch viewports and both processing modes. Readiness must validate the active Core registry after Core consumes its pending provider queue. The execution fixture additionally delays authorization replies across mode changes, including returning to the original mode, to check that an old denial cannot revoke a new runtime.

The execution fixture also invalidates the isolated world's runtime API after processing and checks retirement without uncaught page errors. `bridge-context-loss.test.cjs` covers missing APIs, synchronous context-invalidated exceptions, resource/listener cleanup, session ownership and recovery after a temporary transport error. After replacing or reloading the installed extension, reload existing reader tabs to replace their old content scripts.

This fixture is not a replacement for installed-extension tests in Chrome or Android Edge. The historical usm-memory-browser.cjs comparison additionally requires its original pre-optimization source at ../phase3-active-fix/extension/gpu/usm.js; that source is not in this repository.

## Introduction page

site/index.html is a buildless static page. Keep styles.css, script.js, assets/ and docs/ at the same relative locations. The relative structure supports GitHub Pages subdirectory hosting. Comparison images, quick-control icons, and illustrated package-import instructions are included. The guide screenshots reproduce the current UI implementation. No analytics or external font dependencies are used.

## Developer example

Start with [Build your first filter](docs/Module-Quickstart-en.md) or the [Japanese guide](docs/Module-Quickstart-ja.md). The complete example is in `examples/Brightness-Filter-1.0.0.js`. The core test suite verifies imports, duplicate rejection, updates, retained settings, and side-by-side versions.
