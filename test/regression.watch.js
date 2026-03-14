const assert = require('assert');
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
			resolve(fs.statSync(filename).size);
		});
	});

(async () => {
	try {
		const firstSize = await run();
		const secondSize = await run();

		assert.ok(firstSize > 0);
		assert.equal(firstSize, secondSize);
	} finally {
		await new Promise(resolve => compiler.close(() => resolve()));
	}
})().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
