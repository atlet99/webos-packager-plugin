const assert = require('assert');
const os = require('os');
const path = require('path');
const webpack = require('webpack');
const { WebOSPackagerPlugin } = require('../dist');

const workdir = path.join(os.tmpdir(), `webos-packager-service-only-${Date.now()}`);

webpack(
	{
		mode: 'development',
		context: path.join(__dirname, '..'),
		entry: './test/src/service.js',
		output: {
			filename: 'service.js',
			path: workdir,
		},
		plugins: [
			new WebOSPackagerPlugin({
				id: 'com.example.service',
				version: '1.0.0',
				type: 'service',
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

		assert.ok(details.includes('Package must include exactly one app namespace.'));
	},
);
