const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const webpack = require('webpack');
const { WebOSPackagerPlugin } = require('../dist');

const runCompiler = config =>
	new Promise((resolve, reject) => {
		webpack(config, (error, stats) => {
			if (error) {
				reject(error);
				return;
			}

			if (!stats || stats.hasErrors()) {
				reject(new Error(stats?.toString({ all: false, errors: true }) ?? 'Compilation failed.'));
				return;
			}

			resolve();
		});
	});

const runCompilerExpectFailure = config =>
	new Promise((resolve, reject) => {
		webpack(config, (error, stats) => {
			const details = [
				error?.message ?? '',
				...(stats?.toJson({ all: false, errors: true }).errors ?? []).map(x =>
					String(x.message ?? x),
				),
			].join('\n');

			if (details.includes('unknown output template token "build"')) {
				resolve();
				return;
			}

			reject(new Error(details || 'Expected compilation to fail.'));
		});
	});

(async () => {
	const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'webos-packager-output-options-'));

	await runCompiler({
		mode: 'development',
		context: path.join(__dirname, '..'),
		entry: './test/src/app.js',
		output: {
			filename: 'main.js',
			path: workdir,
		},
		plugins: [
			new WebOSPackagerPlugin({
				id: 'com.example.app',
				version: '1.2.3',
				type: 'app',
				output: {
					dir: 'artifacts',
					template: '[id]-[version]-[channel].[ext]',
					variables: {
						channel: 'ci',
					},
				},
			}),
		],
	});

	assert.ok(fs.existsSync(path.join(workdir, 'artifacts/com.example.app-1.2.3-ci.ipk')));

	await runCompiler({
		mode: 'development',
		context: path.join(__dirname, '..'),
		entry: './test/src/app.js',
		output: {
			filename: 'main.js',
			path: workdir,
		},
		plugins: [
			new WebOSPackagerPlugin({
				id: 'com.example.app',
				version: '2.0.0',
				type: 'app',
				filename: ({ id, version, ext }) => `releases/${id}_${version}_beta.${ext}`,
			}),
		],
	});

	assert.ok(fs.existsSync(path.join(workdir, 'releases/com.example.app_2.0.0_beta.ipk')));

	await runCompilerExpectFailure({
		mode: 'development',
		context: path.join(__dirname, '..'),
		entry: './test/src/app.js',
		output: {
			filename: 'main.js',
			path: workdir,
		},
		plugins: [
			new WebOSPackagerPlugin({
				id: 'com.example.app',
				version: '3.0.0',
				type: 'app',
				output: {
					template: '[id]-[build].[ext]',
				},
			}),
		],
	});
})().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
