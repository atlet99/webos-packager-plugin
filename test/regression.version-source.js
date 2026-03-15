const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const webpack = require('webpack');
const { WebOSPackagerPlugin, hoc } = require('../dist');

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

(async () => {
	const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'webos-packager-version-source-'));
	const versionFile = path.join(workdir, '.release-version');
	fs.writeFileSync(versionFile, '9.8.7\n');

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
				versionFile,
				type: 'app',
			}),
		],
	});

	assert.ok(fs.existsSync(path.join(workdir, 'com.example.app_9.8.7_all.ipk')));

	process.env.RELEASE_VERSION = '1.2.3';
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
				versionFile,
				type: 'app',
			}),
		],
	});
	delete process.env.RELEASE_VERSION;

	assert.ok(fs.existsSync(path.join(workdir, 'com.example.app_1.2.3_all.ipk')));

	assert.throws(
		() =>
			new WebOSPackagerPlugin({
				id: 'com.example.app',
				versionFile: 'does-not-exist.release-version',
				type: 'app',
			}),
		{
			name: 'TypeError',
			message:
				'WebOSPackagerPlugin: "options.versionFile" could not be read: does-not-exist.release-version',
		},
	);

	fs.writeFileSync(versionFile, 'invalid-version');
	assert.throws(
		() =>
			new WebOSPackagerPlugin({
				id: 'com.example.app',
				versionFile,
				type: 'app',
			}),
		{
			name: 'TypeError',
			message:
				'WebOSPackagerPlugin: "options.versionFile" must be a valid semver-like value (x.y.z[-suffix]).',
		},
	);

	process.env.CUSTOM_RELEASE_VERSION = '5.4.3';
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
				versionEnv: 'CUSTOM_RELEASE_VERSION',
				type: 'app',
			}),
		],
	});
	delete process.env.CUSTOM_RELEASE_VERSION;

	assert.ok(fs.existsSync(path.join(workdir, 'com.example.app_5.4.3_all.ipk')));

	fs.writeFileSync(versionFile, '2.0.0');
	const hocConfig = hoc({
		id: 'com.example.hoc',
		versionFile,
		app: {
			id: 'com.example.hoc',
			mode: 'development',
			entry: './test/src/app.js',
			output: {
				filename: 'main.js',
				path: workdir,
			},
		},
	})({}, { env: {}, mode: 'development' });

	assert.ok(Array.isArray(hocConfig));
	assert.ok(Array.isArray(hocConfig[0].plugins));
})().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
