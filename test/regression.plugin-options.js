const assert = require('assert');
const { WebOSPackagerPlugin } = require('../dist');

assert.throws(
	() =>
		new WebOSPackagerPlugin({
			id: 'com.example.app',
			version: '1.0.0',
		}),
	{
		name: 'TypeError',
		message: 'WebOSPackagerPlugin: "type" must be "app" or "service".',
	},
);

assert.throws(
	() =>
		new WebOSPackagerPlugin({
			id: 'com.example.app',
			version: '1.0.0',
			type: 'app',
			emitManifest: true,
		}),
	{
		name: 'TypeError',
		message: 'WebOSPackagerPlugin: "options.manifest" must be provided.',
	},
);

assert.throws(
	() =>
		new WebOSPackagerPlugin({
			id: 'com.example.app',
			version: '1.0.0',
			type: 'app',
			emitManifest: true,
			manifest: {
				title: '',
				description: 'description',
				iconUrl: 'https://example.com/icon.png',
				sourceUrl: 'https://example.com/source',
			},
		}),
	{
		name: 'TypeError',
		message: 'WebOSPackagerPlugin: "options.manifest.title" must be a non-empty string.',
	},
);

assert.throws(
	() =>
		new WebOSPackagerPlugin({
			id: 'com.example.app',
			version: '1.0.0',
			type: 'app',
			emitManifest: true,
			manifest: {
				title: 'title',
				description: 'description',
				iconUrl: 'https://example.com/icon.png',
				sourceUrl: 'https://example.com/source',
				type: 'invalid',
			},
		}),
	{
		name: 'TypeError',
		message: 'WebOSPackagerPlugin: "options.manifest.type" must be "web" or "native".',
	},
);

assert.throws(
	() =>
		new WebOSPackagerPlugin({
			id: 'com.example.app',
			version: '1.0.0',
			type: 'app',
			emitManifest: true,
			manifest: {
				title: 'title',
				description: 'description',
				iconUrl: 'https://example.com/icon.png',
				sourceUrl: 'https://example.com/source',
				unsupported: 'value',
			},
		}),
	{
		name: 'TypeError',
		message: 'WebOSPackagerPlugin: "options.manifest.unsupported" is not supported.',
	},
);

assert.throws(
	() =>
		new WebOSPackagerPlugin({
			id: 'com.example.app',
			version: '1.0.0',
			type: 'app',
			output: {
				dir: '../dist',
			},
		}),
	{
		name: 'TypeError',
		message: 'WebOSPackagerPlugin: "options.output.dir" contains invalid path segments.',
	},
);

assert.throws(
	() =>
		new WebOSPackagerPlugin({
			id: 'com.example.app',
			version: '1.0.0',
			type: 'app',
			output: {
				variables: {
					channel: {},
				},
			},
		}),
	{
		name: 'TypeError',
		message:
			'WebOSPackagerPlugin: "options.output.variables.channel" must be a string, number or boolean.',
	},
);
