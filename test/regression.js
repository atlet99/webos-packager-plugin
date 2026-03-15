const { spawnSync } = require('child_process');
const path = require('path');

const tests = [
	'regression.watch.js',
	'regression.traversal.js',
	'regression.plugin-options.js',
	'regression.service-only.js',
	'regression.service-prefix.js',
	'regression.invalid-id.js',
	'regression.hoc-service-error.js',
];

for (const test of tests) {
	const file = path.join(__dirname, test);
	const result = spawnSync(process.execPath, [file], { stdio: 'inherit' });

	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}
