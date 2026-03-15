const assert = require('assert');
const os = require('os');
const path = require('path');
const webpack = require('webpack');
const { WebOSPackagerPlugin } = require('../dist');

const workdir = path.join(
	os.tmpdir(),
	`webos-packager-traversal-${Date.now()}`,
);

webpack(
	{
		mode: 'development',
		context: path.join(__dirname, '..'),
		entry: './test/src/app.js',
		output: {
			filename: '../escape.js',
			path: workdir,
		},
		plugins: [
			new WebOSPackagerPlugin({
				id: 'com.example.app',
				version: '1.0.0',
				type: 'app',
			}),
		],
	},
	(error, stats) => {
		const details = [
			error?.message ?? '',
			...(stats?.toJson({ all: false, errors: true }).errors ?? []).map(x =>
				String(x.message ?? x),
			),
		].join('\n');

		assert.ok(details.includes('Invalid asset path: ../escape.js'));
	},
);
