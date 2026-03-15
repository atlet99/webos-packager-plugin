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
			path: path.join(__dirname, '..', 'tmp-bad-service-prefix'),
		},
	},
	services: [
		{
			id: 'com.example.service',
			mode: 'development',
			entry: './test/src/service.js',
			output: {
				filename: 'service.js',
				path: path.join(__dirname, '..', 'tmp-bad-service-prefix'),
			},
		},
	],
})({}, { env: {} });

let completed = false;

webpack(config, (error, stats) => {
	completed = true;
	assert.ok(error || stats?.hasErrors());

	const details = [
		error?.message ?? '',
		...((stats?.toJson({ all: false, errors: true }).errors ?? []).map(x =>
			String(x.message ?? x),
		) ?? []),
	].join('\n');

	assert.ok(
		details.includes('Service id "com.example.service" must start with app id "com.example.app".'),
	);
});

setTimeout(() => {
	assert.ok(completed);
}, 5000);
