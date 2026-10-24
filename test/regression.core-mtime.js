const assert = require('assert');
const { createHash } = require('crypto');
const { inspectIpk } = require('./ipk-inspect');
const { IPKBuilder, IPKBuilderError } = require('../dist/core');

const APP = 'com.example.app';
const SERVICE = 'com.example.app.service';
const MTIME = 1761000000;
const OTHER_MTIME = 1762000000;

const APP_ASSETS = {
	'index.html': Buffer.from('<!DOCTYPE html><html><body>mtime</body></html>'),
	'assets/main.js': Buffer.from('console.log("mtime");\n'),
};

const timestampsOf = entries =>
	Array.from(entries.values()).map(entry => entry.header.mtime.getTime() / 1000);

const build = async (mtime, assetOrder = Object.keys(APP_ASSETS)) => {
	const builder = new IPKBuilder({
		id: APP,
		version: '1.0.0',
		...(mtime === undefined ? {} : { mtime }),
	});

	builder.addEntries(
		{ id: APP, type: 'app' },
		Object.fromEntries(assetOrder.map(key => [key, APP_ASSETS[key]])),
	);
	builder.addEntries({ id: SERVICE, type: 'service' }, { 'service.js': Buffer.from('// service') });

	return builder.buffer();
};

(async () => {
	const explicit = await inspectIpk(await build(MTIME));

	for (const entries of [explicit.data, explicit.control]) {
		assert.deepEqual(
			Array.from(new Set(timestampsOf(entries))),
			[MTIME],
			'Expected every tar entry to carry the explicit mtime.',
		);
	}

	process.env.SOURCE_DATE_EPOCH = String(OTHER_MTIME);
	const fromEnv = await inspectIpk(await build());

	assert.deepEqual(Array.from(new Set(timestampsOf(fromEnv.data))), [OTHER_MTIME]);

	const explicitWins = await inspectIpk(await build(MTIME));

	assert.deepEqual(Array.from(new Set(timestampsOf(explicitWins.data))), [MTIME]);
	delete process.env.SOURCE_DATE_EPOCH;

	const legacy = await inspectIpk(await build());

	assert.deepEqual(Array.from(new Set(timestampsOf(legacy.data))), [0]);

	assert.throws(
		() => {
			process.env.SOURCE_DATE_EPOCH = 'not-a-number';

			try {
				return new IPKBuilder({ id: APP, version: '1.0.0' });
			} finally {
				delete process.env.SOURCE_DATE_EPOCH;
			}
		},
		{ name: 'IPKBuilderError' },
	);

	assert.throws(
		() => {
			process.env.SOURCE_DATE_EPOCH = '-100';

			try {
				return new IPKBuilder({ id: APP, version: '1.0.0' });
			} finally {
				delete process.env.SOURCE_DATE_EPOCH;
			}
		},
		{ name: 'IPKBuilderError' },
	);

	const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');

	const first = await build(MTIME);
	const second = await build(MTIME);

	assert.equal(sha256(first), sha256(second), 'Expected identical builds to be byte-identical.');

	const reordered = await build(MTIME, ['assets/main.js', 'index.html']);

	assert.equal(sha256(first), sha256(reordered), 'Expected asset order not to change the package.');

	const serviceFirst = new IPKBuilder({ id: APP, version: '1.0.0', mtime: MTIME });

	serviceFirst.addEntries(
		{ id: SERVICE, type: 'service' },
		{ 'service.js': Buffer.from('// service') },
	);
	serviceFirst.addEntries({ id: APP, type: 'app' }, APP_ASSETS);

	assert.equal(
		sha256(first),
		sha256(await serviceFirst.buffer()),
		'Expected namespace order not to change the package.',
	);

	const otherTime = await build(OTHER_MTIME);

	assert.notEqual(sha256(first), sha256(otherTime));
})().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
