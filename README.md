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
make test
make test-plugin
make test-hoc
make pack
```

### Release

Publishing is done by GitHub Actions on tag push.

```bash
VERSION=$(node -p "require('./package.json').version")
git tag "v$VERSION"
git push origin "v$VERSION"
```
