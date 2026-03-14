const assert = require('assert');
const { createHash } = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const webpack = require('webpack');
const { WebOSPackagerPlugin } = require('../dist');

const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'webos-packager-watch-'));

const compiler = webpack({
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
			version: '1.0.0',
			type: 'app',
		}),
	],
});

const run = () =>
	new Promise((resolve, reject) => {
		compiler.run((error, stats) => {
			if (error) {
				reject(error);
				return;
			}

			if (!stats || stats.hasErrors()) {
				reject(
					new Error(
						stats?.toString({ all: false, errors: true }) ??
							'Compilation failed.',
					),
				);
				return;
			}

			const filename = path.join(workdir, 'com.example.app_1.0.0_all.ipk');
			const content = fs.readFileSync(filename);
			resolve(createHash('sha256').update(content).digest('hex'));
		});
	});

(async () => {
	try {
		const firstHash = await run();
		const secondHash = await run();

		assert.ok(firstHash.length > 0);
		assert.equal(firstHash, secondHash);
	} finally {
		await new Promise(resolve => compiler.close(() => resolve()));
	}
})().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
