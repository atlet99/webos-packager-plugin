const assert = require('assert');
const { WebOSPackagerPlugin } = require('../dist');

assert.throws(
	() =>
		new WebOSPackagerPlugin({
			id: 'com/example.app',
			version: '1.0.0',
			type: 'app',
		}),
	{
		name: 'TypeError',
		message: 'WebOSPackagerPlugin: "id" contains invalid path characters.',
	},
);
