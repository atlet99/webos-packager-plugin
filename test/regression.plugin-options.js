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
