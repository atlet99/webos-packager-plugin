const assert = require('assert');
const { gunzipSync } = require('zlib');
const { extract } = require('tar-stream');

const parseAr = buffer => {
	assert.ok(buffer.subarray(0, 8).toString('utf8') === '!<arch>\n', 'Expected ar magic header.');

	const members = [];
	let offset = 8;

	while (offset < buffer.length) {
		const header = buffer.subarray(offset, offset + 60).toString('utf8');
		const name = header.slice(0, 16).trim();
		const size = Number(header.slice(48, 58).trim());
		const data = buffer.subarray(offset + 60, offset + 60 + size);

		members.push({ name, data });
		offset += 60 + size + (size % 2);
	}

	return members;
};

const extractTarGz = data =>
	new Promise((resolve, reject) => {
		const entries = new Map();
		const extractor = extract();

		extractor.on('entry', (header, stream, next) => {
			const chunks = [];

			stream.on('data', chunk => chunks.push(chunk));
			stream.on('end', () => {
				entries.set(header.name, { header, data: Buffer.concat(chunks) });
				next();
			});
			stream.on('error', reject);
		});
		extractor.on('finish', () => resolve(entries));
		extractor.on('error', reject);
		extractor.end(gunzipSync(data));
	});

const inspectIpk = async buffer => {
	const members = parseAr(buffer);

	assert.deepEqual(
		members.map(member => member.name),
		['debian-binary', 'control.tar.gz', 'data.tar.gz'],
	);

	return {
		debianBinary: members[0].data.toString('utf8'),
		control: await extractTarGz(members[1].data),
		data: await extractTarGz(members[2].data),
	};
};

module.exports = { inspectIpk };
