![NPM Version](https://img.shields.io/npm/v/%40atlet99%2Fwebos-packager-plugin?style=plastic)
![GitHub Release](https://img.shields.io/github/v/release/atlet99/webos-packager-plugin)
![GitHub License](https://img.shields.io/github/license/atlet99/webos-packager-plugin?style=plastic)
![GitHub Issues or Pull Requests](https://img.shields.io/github/issues/atlet99/webos-packager-plugin?style=plastic)
![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/atlet99/webos-packager-plugin/npm-publish.yml?style=plastic&label=Publish%20to%20registry)
![GitHub commit activity (branch)](https://img.shields.io/github/commit-activity/w/atlet99/webos-packager-plugin/master?style=plastic)

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

### Flexible IPK Output (CI/Monorepo Friendly)

You can keep legacy `filename`, or use `output` for richer control.

```typescript
new WebOSPackagerPlugin({
  id: 'com.example.app',
  version: '1.0.0',
  type: 'app',
  output: {
    dir: 'artifacts/webos',
    template: '[id]-[version]-[channel].[ext]',
    variables: {
      channel: process.env.CHANNEL ?? 'local',
    },
  },
});
```

Dynamic filename function is also supported:

```typescript
new WebOSPackagerPlugin({
  id: 'com.example.app',
  version: process.env.RELEASE_VERSION ?? '1.0.0',
  type: 'app',
  filename: ({ id, version, ext }) => `releases/${id}_${version}_ci.${ext}`,
});
```

### Monorepo Pattern (3 IPK Builds)

```typescript
import { join } from 'path';
import { WebOSPackagerPlugin } from '@atlet99/webos-packager-plugin';

const createConfig = (id: string, entry: string, channel: string) => ({
  mode: 'production',
  entry,
  output: {
    filename: 'main.js',
    path: join(__dirname, `dist/${id}`),
  },
  plugins: [
    new WebOSPackagerPlugin({
      id,
      version: process.env.RELEASE_VERSION ?? '1.0.0',
      type: 'app',
      output: {
        dir: 'artifacts/ipk',
        template: '[id]-[version]-[channel].[ext]',
        variables: { channel },
      },
    }),
  ],
});

export default [
  createConfig('com.example.app.alpha', './packages/alpha/src/app.js', 'alpha'),
  createConfig('com.example.app.beta', './packages/beta/src/app.js', 'beta'),
  createConfig('com.example.app.gamma', './packages/gamma/src/app.js', 'gamma'),
];
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
