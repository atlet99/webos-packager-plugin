# @atlet99/webos-packager-plugin

Pack applications to IPK on the fly.

Fork notice: this package is forked from the original `@webosbrew/webos-packager-plugin`.
Original author and credit: kitsuned (Andrey Smirnov).

### Installation

```bash
npm install @atlet99/webos-packager-plugin
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
git tag v2.1.0
git push origin v2.1.0
```

### Example

##### HOC

```typescript
import { hoc } from '@atlet99/webos-packager-plugin';

export default hoc({
	id: 'org.acme.product',
	version: '1.0.0',
	options: {
		// if you want to publish app in homebrew channel repo
		emitManifest: true,
		manifest: {
			title: 'ACME Goods',
			description: '',
			iconUrl: '',
			sourceUrl: '',
		},
	},
	app: {
		id: 'org.acme.product',
		// ... webpack configuation
	},
	services: [
		{
			id: 'org.acme.product.service',
			// ... webpack configuation
		},
		// ... extra services
	],
});
```

##### Plugin

```typescript
import { WebOSPackagerPlugin } from '@atlet99/webos-packager-plugin';

export default {
	// ... webpack configuation
	plugins: [
		new WebOSPackagerPlugin({
			id: 'com.example.app',
			version: '1.0.0',
			type: 'app',
		}),
	],
};
```
