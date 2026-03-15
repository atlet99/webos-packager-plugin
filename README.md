# @atlet99/webos-packager-plugin

Pack webOS IPK files directly from webpack builds.

Fork notice: this package is forked from the original
`@webosbrew/webos-packager-plugin`. Original author and credit: kitsuned (Andrey
Smirnov).

### Installation

```bash
npm i @atlet99/webos-packager-plugin
```

### webOS CLI vs This Library

| Topic             | `webos-cli` (`ares-*`)                        | `@atlet99/webos-packager-plugin`         |
| ----------------- | --------------------------------------------- | ---------------------------------------- |
| Main usage        | End-to-end app workflow                       | Packaging inside webpack pipeline        |
| Packaging command | `ares-package ./app ./service`                | webpack plugin/HOC emits `.ipk` asset    |
| Deploy to device  | `ares-install`, `ares-launch`, `ares-inspect` | Not included                             |
| Service naming    | Service id should start with app id           | Same rule validated during package build |
| Build integration | Separate build + package steps                | Single webpack flow                      |

### Quick Start (HOC)

```typescript
import { join } from 'path';
import { hoc } from '@atlet99/webos-packager-plugin';

export default hoc({
  id: 'com.example.app',
  version: '1.0.0',
  options: {
    emitManifest: true,
    manifest: {
      title: 'Example App',
      description: 'Example description',
      iconUrl: 'https://example.com/icon.png',
      sourceUrl: 'https://github.com/atlet99/webos-packager-plugin',
    },
  },
  app: {
    id: 'com.example.app',
    mode: 'development',
    entry: './src/app.js',
    output: {
      filename: 'main.js',
      path: join(__dirname, 'dist/app'),
    },
  },
  services: [
    {
      id: 'com.example.app.service',
      mode: 'development',
      entry: './src/service.js',
      output: {
        filename: 'service.js',
        path: join(__dirname, 'dist/service'),
      },
    },
  ],
});
```

### Quick Start (Plugin)

```typescript
import { join } from 'path';
import { WebOSPackagerPlugin } from '@atlet99/webos-packager-plugin';

export default {
  mode: 'development',
  entry: './src/app.js',
  output: {
    filename: 'main.js',
    path: join(__dirname, 'dist/app'),
  },
  plugins: [
    new WebOSPackagerPlugin({
      id: 'com.example.app',
      version: '1.0.0',
      type: 'app',
    }),
  ],
};
```

### Development

```bash
make install
make verify
```

Useful commands:

```bash
make help
make format
make format-check
make lint-make
make test
make test-plugin
make test-hoc
make pack
```

Makefile linting uses [checkmake](https://github.com/checkmake/checkmake) with
project config from `checkmake.ini`. If local `checkmake` is unavailable, the
`lint-make` target falls back to the official container image.

### Release

Publishing is done by GitHub Actions on tag push.

```bash
make tag-release
```

If you need to bump version first and open a PR to `master`:

```bash
make tag-release VERSION=2.1.1
```

Note: `VERSION=...` flow uses GitHub CLI. If `GH_TOKEN` or `GITHUB_TOKEN` is set
in your environment, interactive login is not required. Otherwise run
`gh auth login`.

By default, `AUTO_MERGE=1`: the PR is set to auto-squash after checks pass, then
`master` is updated and tag creation runs automatically.

To keep merge manual:

```bash
make tag-release VERSION=2.1.1 AUTO_MERGE=0
```
