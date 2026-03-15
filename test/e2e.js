const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const webpack = require('webpack');
const { WebOSPackagerPlugin, hoc } = require('../dist');

const runWebpack = config =>
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

			resolve(stats);
		});
	});

const assertExists = filepath => {
	assert.ok(fs.existsSync(filepath), `Expected file to exist: ${filepath}`);
};

(async () => {
	const root = path.join(__dirname, '..');
	const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'webos-packager-e2e-'));
	const versionFile = path.join(workdir, '.release-version');

	await runWebpack({
		mode: 'production',
		context: root,
		entry: './test/src/app.js',
		output: {
			filename: 'main.js',
			path: workdir,
		},
		plugins: [
			new WebOSPackagerPlugin({
				id: 'com.e2e.plugin',
				version: '1.0.0',
				type: 'app',
				output: {
					dir: 'artifacts/plugin',
					template: '[id]-[version]-[channel].[ext]',
					variables: {
						channel: 'stable',
					},
				},
			}),
		],
	});

	assertExists(path.join(workdir, 'artifacts/plugin/com.e2e.plugin-1.0.0-stable.ipk'));

	await runWebpack({
		mode: 'production',
		context: root,
		entry: './test/src/app.js',
		output: {
			filename: 'main.js',
			path: workdir,
		},
		plugins: [
			new WebOSPackagerPlugin({
				id: 'com.e2e.filename-fn',
				version: '2.0.0',
				type: 'app',
				filename: ({ id, version, ext }) => `artifacts/function/${id}_${version}_ci.${ext}`,
			}),
		],
	});

	assertExists(path.join(workdir, 'artifacts/function/com.e2e.filename-fn_2.0.0_ci.ipk'));

	fs.writeFileSync(versionFile, '3.2.1');
	await runWebpack({
		mode: 'production',
		context: root,
		entry: './test/src/app.js',
		output: {
			filename: 'main.js',
			path: workdir,
		},
		plugins: [
			new WebOSPackagerPlugin({
				id: 'com.e2e.version-file',
				versionFile,
				type: 'app',
			}),
		],
	});

	assertExists(path.join(workdir, 'com.e2e.version-file_3.2.1_all.ipk'));

	process.env.RELEASE_VERSION = '3.2.2';
	await runWebpack({
		mode: 'production',
		context: root,
		entry: './test/src/app.js',
		output: {
			filename: 'main.js',
			path: workdir,
		},
		plugins: [
			new WebOSPackagerPlugin({
				id: 'com.e2e.version-file',
				versionFile,
				type: 'app',
			}),
		],
	});
	delete process.env.RELEASE_VERSION;

	assertExists(path.join(workdir, 'com.e2e.version-file_3.2.2_all.ipk'));

	const hocConfigs = hoc({
		id: 'com.e2e.hoc',
		version: '4.0.0',
		options: {
			emitManifest: true,
			manifest: {
				title: 'E2E App',
				description: 'E2E description',
				iconUrl: 'https://example.com/icon.png',
				sourceUrl: 'https://example.com/source',
			},
			output: {
				dir: 'artifacts/hoc',
				template: '[id]-[version].[ext]',
			},
		},
		app: {
			id: 'com.e2e.hoc',
			mode: 'production',
			entry: './test/src/app.js',
			output: {
				filename: 'app.js',
				path: workdir,
			},
		},
		services: [
			{
				id: 'com.e2e.hoc.service',
				mode: 'production',
				entry: './test/src/service.js',
				output: {
					filename: 'service.js',
					path: workdir,
				},
			},
		],
	})({}, { env: {}, mode: 'production' });

	await runWebpack(hocConfigs);

	const manifestPath = path.join(workdir, 'com.e2e.hoc.manifest.json');
	assertExists(path.join(workdir, 'artifacts/hoc/com.e2e.hoc-4.0.0.ipk'));
	assertExists(manifestPath);

	const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
	assert.equal(manifest.ipkUrl, 'artifacts/hoc/com.e2e.hoc-4.0.0.ipk');
	assert.equal(manifest.version, '4.0.0');

	const monorepoConfigs = ['alpha', 'beta', 'gamma'].map(channel => ({
		mode: 'production',
		context: root,
		entry: './test/src/app.js',
		output: {
			filename: 'main.js',
			path: workdir,
		},
		plugins: [
			new WebOSPackagerPlugin({
				id: `com.e2e.monorepo.${channel}`,
				version: '5.0.0',
				type: 'app',
				output: {
					dir: 'artifacts/monorepo',
					template: '[id]-[version]-[channel].[ext]',
					variables: {
						channel,
					},
				},
			}),
		],
	}));

	await runWebpack(monorepoConfigs);

	for (const channel of ['alpha', 'beta', 'gamma']) {
		assertExists(
			path.join(workdir, `artifacts/monorepo/com.e2e.monorepo.${channel}-5.0.0-${channel}.ipk`),
		);
	}
})().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
