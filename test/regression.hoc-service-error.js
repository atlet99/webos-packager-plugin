const assert = require('assert');
const path = require('path');
const webpack = require('webpack');
const { hoc } = require('../dist');

const config = hoc({
	id: 'com.example.app',
	version: '1.0.0',
	app: {
		id: 'com.example.app',
		mode: 'development',
		entry: './test/src/app.js',
		output: {
			filename: 'main.js',
			path: path.join(__dirname, '..', 'tmp-bad-hoc'),
		},
	},
	services: [
		{
			id: 'com.example.app.service',
			mode: 'development',
			entry: './test/src/missing-service.js',
			output: {
				filename: 'service.js',
				path: path.join(__dirname, '..', 'tmp-bad-hoc'),
			},
		},
	],
})({}, { env: {} });

let completed = false;

webpack(config, (error, stats) => {
	completed = true;
	assert.equal(error, null);
	assert.ok(stats);
	assert.ok(stats.hasErrors());

	const details = (stats.toJson({ all: false, errors: true }).errors ?? [])
		.map(x => String(x.message ?? x))
		.join('\n');

	assert.ok(details.includes("Can't resolve './test/src/missing-service.js'"));
});

setTimeout(() => {
	assert.ok(completed);
}, 5000);
