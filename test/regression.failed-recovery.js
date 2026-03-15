const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const webpack = require('webpack');
const { WebOSPackagerPlugin } = require('../dist');

const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'webos-packager-failed-recovery-'));

const compiler = webpack({
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
});

const run = () =>
	new Promise(resolve => {
		compiler.run((error, stats) => {
			resolve({ error, stats });
		});
	});

(async () => {
	try {
		const firstRun = await run();
		const failedText = [
			firstRun.error?.message ?? '',
			...(firstRun.stats?.toJson({ all: false, errors: true }).errors ?? []).map(x =>
				String(x.message ?? x),
			),
		]
			.map(x => String(x))
			.join('\n');

		assert.ok(firstRun.error || firstRun.stats?.hasErrors());
		assert.ok(failedText.includes('Invalid asset path: ../escape.js'));

		compiler.options.output.filename = 'main.js';

		const secondRun = await run();
		assert.ok(secondRun.stats, 'Expected stats on successful compilation.');
		const recoveredText = [
			secondRun.error?.message ?? '',
			...(secondRun.stats?.toJson({ all: false, errors: true }).errors ?? []).map(x =>
				String(x.message ?? x),
			),
		]
			.map(x => String(x))
			.join('\n');

		assert.ok(!secondRun.error, recoveredText || 'Expected successful compilation.');
		assert.ok(!secondRun.stats?.hasErrors(), recoveredText || 'Expected successful compilation.');
		assert.ok(fs.existsSync(path.join(workdir, 'com.example.app_1.0.0_all.ipk')));
	} finally {
		await new Promise(resolve => compiler.close(() => resolve()));
	}
})().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
