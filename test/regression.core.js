const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { inspectIpk } = require('./ipk-inspect');
const { IPKBuilder, IPKBuilderError } = require('../dist/core');

const APP = 'com.cleanyourtv.manager';
const PICKER = 'com.cleanyourtv.picker';
const NOTIFY = 'com.cleanyourtv.notify';
const SERVICE = 'com.cleanyourtv.manager.service';
const MTIME = 1761000000;

const ELF_BUFFER = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(12, 7)]);
const BINARY_BUFFER = Buffer.from(Array.from({ length: 256 }, (_, byte) => byte));
const HTML_BUFFER = Buffer.from('<!DOCTYPE html>\n<html><body>менеджер</body></html>\n');

const readControl = entry =>
	Object.fromEntries(
		entry.data
			.toString('utf8')
			.trim()
			.split('\n')
			.map(line => {
				const separator = line.indexOf(': ');
				return [line.slice(0, separator), line.slice(separator + 2)];
			}),
	);

const buildMultiAppPackage = () => {
	const builder = new IPKBuilder({
		id: APP,
		version: '1.5.13',
		primaryApp: APP,
		mtime: MTIME,
	});

	builder.addEntries(
		{ id: APP, type: 'app' },
		{
			'index.html': HTML_BUFFER,
			'assets/app.js': Buffer.from('console.log("manager");\n'),
			'assets/strings/en_US.json': Buffer.from('{"title": "Manager"}'),
		},
	);
	builder.addEntries(
		{ id: PICKER, type: 'app' },
		{
			'index.html': Buffer.from('<!DOCTYPE html><html><body>picker</body></html>'),
		},
	);
	builder.addEntries(
		{ id: NOTIFY, type: 'app' },
		{
			'index.html': Buffer.from('<!DOCTYPE html><html><body>notify</body></html>'),
		},
	);
	builder.addEntries(
		{ id: SERVICE, type: 'service' },
		{
			'bootstrap.sh': { data: Buffer.from('#!/bin/sh\nexec ./service.js\n'), mode: 0o755 },
			'inputhook/ezinject': { data: ELF_BUFFER, mode: 0o755 },
			'inputhook/libinputhookpp.so': { data: ELF_BUFFER, mode: 0o644 },
		},
	);

	return builder.buffer();
};

(async () => {
	const dist = path.join(__dirname, '..', 'dist');

	for (const file of [
		'core.js',
		'core.d.ts',
		'ipk.js',
		'ar.js',
		'utils.js',
		'validation.js',
		'declarations.js',
		'declarations.d.ts',
	]) {
		const source = fs.readFileSync(path.join(dist, file), 'utf8');

		assert.ok(!source.includes('webpack'), `dist/${file} must not depend on webpack.`);
	}

	const ipk = await inspectIpk(await buildMultiAppPackage());

	assert.equal(ipk.debianBinary, '2.0\n');

	const dataNames = Array.from(ipk.data.keys()).sort();

	assert.deepEqual(
		dataNames.filter(name => name.startsWith('usr/palm/applications/')),
		[
			'usr/palm/applications/com.cleanyourtv.manager',
			'usr/palm/applications/com.cleanyourtv.manager/assets',
			'usr/palm/applications/com.cleanyourtv.manager/assets/app.js',
			'usr/palm/applications/com.cleanyourtv.manager/assets/strings',
			'usr/palm/applications/com.cleanyourtv.manager/assets/strings/en_US.json',
			'usr/palm/applications/com.cleanyourtv.manager/index.html',
			'usr/palm/applications/com.cleanyourtv.notify',
			'usr/palm/applications/com.cleanyourtv.notify/index.html',
			'usr/palm/applications/com.cleanyourtv.picker',
			'usr/palm/applications/com.cleanyourtv.picker/index.html',
		],
	);
	assert.deepEqual(
		dataNames.filter(name => name.startsWith('usr/palm/services/')),
		[
			'usr/palm/services/com.cleanyourtv.manager.service',
			'usr/palm/services/com.cleanyourtv.manager.service/bootstrap.sh',
			'usr/palm/services/com.cleanyourtv.manager.service/inputhook',
			'usr/palm/services/com.cleanyourtv.manager.service/inputhook/ezinject',
			'usr/palm/services/com.cleanyourtv.manager.service/inputhook/libinputhookpp.so',
		],
	);

	const packageInfoEntry = ipk.data.get(
		'usr/palm/packages/com.cleanyourtv.manager/packageinfo.json',
	);

	assert.ok(packageInfoEntry, 'Expected packageinfo.json in usr/palm/packages.');
	assert.deepEqual(JSON.parse(packageInfoEntry.data.toString('utf8')), {
		id: APP,
		version: '1.5.13',
		app: APP,
		services: [SERVICE],
	});

	assert.equal(
		ipk.data.get('usr/palm/applications/com.cleanyourtv.manager/index.html').header.type,
		'file',
	);
	assert.equal(ipk.data.get('usr').header.type, 'directory');
	assert.equal(
		ipk.data.get('usr/palm/applications/com.cleanyourtv.manager/assets').header.type,
		'directory',
	);

	assert.equal(
		ipk.data.get('usr/palm/services/com.cleanyourtv.manager.service/bootstrap.sh').header.mode,
		0o755,
	);
	assert.equal(
		ipk.data.get('usr/palm/services/com.cleanyourtv.manager.service/inputhook/ezinject').header
			.mode,
		0o755,
	);
	assert.equal(
		ipk.data.get('usr/palm/services/com.cleanyourtv.manager.service/inputhook/libinputhookpp.so')
			.header.mode,
		0o644,
	);

	assert.ok(
		ipk.data
			.get('usr/palm/applications/com.cleanyourtv.manager/assets/strings/en_US.json')
			.data.equals(Buffer.from('{"title": "Manager"}')),
	);
	assert.ok(
		ipk.data
			.get('usr/palm/services/com.cleanyourtv.manager.service/inputhook/ezinject')
			.data.equals(ELF_BUFFER),
	);

	await (async () => {
		const builder = new IPKBuilder({ id: APP, version: '2.0.0' });

		builder.addEntries({ id: APP, type: 'app' }, { 'main.js': Buffer.from('// app') });

		const single = await inspectIpk(await builder.buffer());
		const packageInfo = JSON.parse(
			single.data
				.get('usr/palm/packages/com.cleanyourtv.manager/packageinfo.json')
				.data.toString('utf8'),
		);

		assert.equal(packageInfo.app, APP);
		assert.deepEqual(packageInfo.services, []);
	})();

	await (async () => {
		const builder = new IPKBuilder({ id: APP, version: '2.0.0' });

		builder.addEntries(
			{ id: APP, type: 'app' },
			{
				'auto.elf': ELF_BUFFER,
				'auto.sh': Buffer.from('#!/bin/sh\n'),
				'auto.txt': Buffer.from('text'),
			},
		);

		const heuristics = await inspectIpk(await builder.buffer());

		assert.equal(
			heuristics.data.get('usr/palm/applications/com.cleanyourtv.manager/auto.elf').header.mode,
			0o755,
		);
		assert.equal(
			heuristics.data.get('usr/palm/applications/com.cleanyourtv.manager/auto.sh').header.mode,
			0o755,
		);
		assert.equal(
			heuristics.data.get('usr/palm/applications/com.cleanyourtv.manager/auto.txt').header.mode,
			0o644,
		);
	})();

	await (async () => {
		const builder = new IPKBuilder({
			id: APP,
			version: '2.0.0',
			control: {
				Description: 'CleanYourTV manager',
				Maintainer: 'Abdurakhman Rakhmankulov',
				'Installed-Size': 1234,
			},
		});

		builder.addEntries({ id: APP, type: 'app' }, { 'main.js': Buffer.from('// app') });

		const extended = await inspectIpk(await builder.buffer());
		const control = readControl(extended.control.get('control'));

		assert.equal(control.Package, APP);
		assert.equal(control.Version, '2.0.0');
		assert.equal(control.Description, 'CleanYourTV manager');
		assert.equal(control.Maintainer, 'Abdurakhman Rakhmankulov');
		assert.equal(control['Installed-Size'], '1234');
	})();

	assert.throws(() => new IPKBuilder({ id: APP, version: 'not-a-version' }), {
		name: 'IPKBuilderError',
	});
	assert.throws(() => new IPKBuilder({ id: 'com/example.app', version: '1.0.0' }), {
		name: 'IPKBuilderError',
		message: 'Invalid package id: com/example.app',
	});
	assert.throws(() => new IPKBuilder({ id: APP, version: '1.0.0', primaryApp: 'bad id' }), {
		name: 'IPKBuilderError',
	});
	assert.throws(() => new IPKBuilder({ id: APP, version: '1.0.0', mtime: 1.5 }), {
		name: 'IPKBuilderError',
	});
	assert.throws(() => new IPKBuilder({ id: APP, version: '1.0.0', mtime: -1 }), {
		name: 'IPKBuilderError',
	});
	assert.throws(
		() => new IPKBuilder({ id: APP, version: '1.0.0', control: { Package: 'com.evil' } }),
		{ name: 'IPKBuilderError', message: 'IPKBuilder: unsupported control field: Package.' },
	);
	assert.throws(
		() =>
			new IPKBuilder({
				id: APP,
				version: '1.0.0',
				control: { Description: 'x\nPackage: com.evil' },
			}),
		{ name: 'IPKBuilderError' },
	);

	const expectBuildError = async (setup, message) => {
		const builder = setup();
		builder.addEntries({ id: APP, type: 'app' }, { 'main.js': Buffer.from('// app') });
		builder.addEntries({ id: PICKER, type: 'app' }, { 'main.js': Buffer.from('// picker') });

		await assert.rejects(() => builder.buffer(), { name: 'IPKBuilderError', message });
	};

	await expectBuildError(
		() => new IPKBuilder({ id: APP, version: '1.0.0' }),
		`Package includes multiple apps (${APP}, ${PICKER}); "primaryApp" must be specified.`,
	);
	await expectBuildError(
		() => new IPKBuilder({ id: APP, version: '1.0.0', primaryApp: NOTIFY }),
		`Primary app "${NOTIFY}" is not included in the package as an app.`,
	);

	await (async () => {
		const builder = new IPKBuilder({ id: APP, version: '1.0.0', primaryApp: SERVICE });

		builder.addEntries({ id: APP, type: 'app' }, { 'main.js': Buffer.from('// app') });
		builder.addEntries(
			{ id: SERVICE, type: 'service' },
			{ 'service.js': Buffer.from('// service') },
		);

		await assert.rejects(() => builder.buffer(), {
			name: 'IPKBuilderError',
			message: `Primary app "${SERVICE}" is not included in the package as an app.`,
		});
	})();

	await (async () => {
		const builder = new IPKBuilder({ id: APP, version: '1.0.0' });

		builder.addEntries({ id: APP, type: 'app' }, { 'main.js': Buffer.from('// app') });
		builder.addEntries({ id: 'com.other.svc', type: 'service' }, { 's.js': Buffer.from('// s') });

		await assert.rejects(() => builder.buffer(), {
			name: 'IPKBuilderError',
			message: `Service id "com.other.svc" must equal or start with one of the packaged app ids: ${APP}.`,
		});
	})();

	assert.throws(
		() =>
			new IPKBuilder({ id: APP, version: '1.0.0' }).addEntries(
				{ id: APP, type: 'app' },
				{
					'/etc/passwd': Buffer.from('nope'),
				},
			),
		{ name: 'IPKBuilderError', message: 'Invalid asset path: /etc/passwd' },
	);
	assert.throws(
		() =>
			new IPKBuilder({ id: APP, version: '1.0.0' }).addEntries(
				{ id: APP, type: 'app' },
				{
					'../escape.js': Buffer.from('nope'),
				},
			),
		{ name: 'IPKBuilderError', message: 'Invalid asset path: ../escape.js' },
	);
	assert.throws(
		() =>
			new IPKBuilder({ id: APP, version: '1.0.0' }).addEntries(
				{ id: APP, type: 'app' },
				{
					'..\\..\\escape.js': Buffer.from('nope'),
				},
			),
		{ name: 'IPKBuilderError', message: 'Invalid asset path: ..\\..\\escape.js' },
	);

	await (async () => {
		const builder = new IPKBuilder({ id: APP, version: '1.0.0' });
		const assets = { 'main.js': Buffer.from('// app') };

		builder.addEntries({ id: APP, type: 'app' }, assets);

		assert.throws(() => builder.addEntries({ id: APP, type: 'app' }, assets), {
			name: 'IPKBuilderError',
			message: `Duplicate asset path: usr/palm/applications/${APP}/main.js`,
		});
	})();

	await (async () => {
		const builder = new IPKBuilder({ id: APP, version: '1.0.0' });

		assert.throws(
			() =>
				builder.addEntries(
					{ id: APP, type: 'app' },
					{
						'assets/main.js': Buffer.from('// a'),
						assets: Buffer.from('// conflicting file'),
					},
				),
			{
				name: 'IPKBuilderError',
				message: `Path conflict: usr/palm/applications/${APP}/assets is already a directory.`,
			},
		);
	})();

	await (async () => {
		const builder = new IPKBuilder({ id: APP, version: '1.0.0' });

		builder.addEntries({ id: APP, type: 'app' }, { 'assets/main.js': Buffer.from('// a') });
		assert.throws(
			() =>
				builder.addEntries({ id: APP, type: 'app' }, { 'assets/main.js': Buffer.from('// again') }),
			{
				name: 'IPKBuilderError',
				message: `Duplicate asset path: usr/palm/applications/${APP}/assets/main.js`,
			},
		);
	})();

	await (async () => {
		const builder = new IPKBuilder({ id: APP, version: '1.0.0' });

		builder.addEntries({ id: APP, type: 'app' }, { 'assets/main.js': Buffer.from('// a') });
		assert.throws(
			() => builder.addEntries({ id: APP, type: 'app' }, { assets: Buffer.from('// now a file') }),
			{
				name: 'IPKBuilderError',
				message: `Path conflict: usr/palm/applications/${APP}/assets is already a directory.`,
			},
		);
	})();

	await (async () => {
		const builder = new IPKBuilder({ id: APP, version: '1.0.0' });

		builder.addEntries({ id: APP, type: 'app' }, { 'bin/tool': Buffer.from('binary') });
		assert.throws(
			() =>
				builder.addEntries(
					{ id: APP, type: 'app' },
					{ 'bin/tool/data.bin': Buffer.from('nested') },
				),
			{
				name: 'IPKBuilderError',
				message: `Path conflict: usr/palm/applications/${APP}/bin/tool is already a file.`,
			},
		);
	})();

	await (async () => {
		const builder = new IPKBuilder({ id: APP, version: '1.0.0' });

		assert.throws(
			() =>
				builder.addEntries(
					{ id: APP, type: 'app' },
					{ 'bin/tool': { data: Buffer.from('x'), mode: 0o100644 } },
				),
			{
				name: 'IPKBuilderError',
				message: 'Invalid asset mode: 33188. Mode must be an integer between 0 and 7777.',
			},
		);

		builder.addEntries(
			{ id: APP, type: 'app' },
			{ 'bin/tool': { data: Buffer.from('x'), mode: 0o755 } },
		);

		const recovered = await inspectIpk(await builder.buffer());

		assert.equal(
			recovered.data.get('usr/palm/applications/com.cleanyourtv.manager/bin/tool').header.mode,
			0o755,
		);
	})();

	await (async () => {
		const builder = new IPKBuilder({ id: APP, version: '1.0.0' });

		builder.addEntries({ id: APP, type: 'app' }, { 'main.js': Buffer.from('// app') });

		const built = await builder.buffer();

		await assert.rejects(() => builder.buffer(), {
			name: 'IPKBuilderError',
			message: 'Package has already been built.',
		});
		assert.throws(
			() => builder.addEntries({ id: APP, type: 'app' }, { 'late.js': Buffer.from('// late') }),
			{ name: 'IPKBuilderError', message: 'Cannot add entries after the package has been built.' },
		);
		assert.ok(built.length > 0);
	})();
})().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
