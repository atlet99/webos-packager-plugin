import { constants, createGzip } from 'zlib';
import { dirname, join, normalize } from 'path/posix';

import { Pack, pack } from 'tar-stream';

import { ArWriter } from './ar';
import { getDirectoryParents } from './utils';

import type {
	ControlSection,
	Namespace,
	PackageMetadata,
} from './declarations';

const NAMESPACE_MAP: Record<Namespace['type'], string> = {
	app: 'applications',
	service: 'services',
};

const ELF_MAGIC = 0x7f454c46;
const SHEBANG_MAGIC = 0x2321;
const FIXED_MTIME = new Date(0);

export class IPKBuilder {
	private readonly ar = new ArWriter();
	private readonly data = pack();
	private readonly packageId: string;
	private readonly namespaces: Record<Namespace['type'], Set<string>> = {
		app: new Set(),
		service: new Set(),
	};
	private readonly createdParents = new Set<string>();

	public constructor(private readonly metadata: PackageMetadata) {
		this.packageId = this.normalizeIdentifier(metadata.id, 'package id');
		this.ar.append('debian-binary', '2.0\n');
	}

	public addEntries(
		{ id, type }: Namespace,
		assets: { [path: string]: Buffer },
	) {
		const namespaceId = this.normalizeIdentifier(id, `${type} id`);
		const root = `usr/palm/${NAMESPACE_MAP[type]}/${namespaceId}`;
		const tree = new Set<string>(getDirectoryParents(root));
		const entries = Object.entries(assets)
			.map(([asset, buffer]) => [this.normalizeAssetPath(asset), buffer] as const)
			.sort(([a], [b]) => a.localeCompare(b));

		this.namespaces[type].add(namespaceId);

		for (const [asset] of entries) {
			tree.add(join(root, dirname(asset)));
		}

		for (const name of Array.from(tree).sort((a, b) => a.localeCompare(b))) {
			if (!this.createdParents.has(name)) {
				this.data.entry({ name, type: 'directory', mtime: FIXED_MTIME });
			}

			this.createdParents.add(name);
		}

		for (const [asset, buffer] of entries) {
			const name = join(root, asset);
			const mode = this.isExecutable(buffer) ? 0o755 : 0o644;

			this.data.entry({ name, mode, mtime: FIXED_MTIME }, buffer);
		}
	}

	public async buffer(): Promise<Buffer> {
		if (!this.metadata) {
			throw new IPKBuilderError('Package metadata not set.');
		}

		await this.appendControlSection();
		await this.appendDataSection();

		return this.ar.buffer();
	}

	private isExecutable(buffer: Buffer): boolean {
		if (buffer.length < 4) {
			return false;
		}

		return (
			buffer.readUInt32BE() === ELF_MAGIC ||
			buffer.readUInt16BE() === SHEBANG_MAGIC
		);
	}

	private normalizeAssetPath(path: string): string {
		const target = normalize(path.replace(/\\/g, '/'));

		if (
			target === '' ||
			target === '.' ||
			target === '..' ||
			target.startsWith('../') ||
			target.includes('/../') ||
			target.startsWith('/')
		) {
			throw new IPKBuilderError(`Invalid asset path: ${path}`);
		}

		return target;
	}

	private normalizeIdentifier(value: string, kind: string): string {
		if (
			typeof value !== 'string' ||
			value.trim() === '' ||
			value === '.' ||
			value === '..' ||
			value.includes('/') ||
			value.includes('\\')
		) {
			throw new IPKBuilderError(`Invalid ${kind}: ${value}`);
		}

		return value;
	}

	private async collectTarball(packer: Pack): Promise<Buffer> {
		packer.finalize();

		const chunks = [];

		for await (const chunk of packer.pipe(
			createGzip({ level: constants.Z_BEST_COMPRESSION }),
		)) {
			chunks.push(chunk);
		}

		return Buffer.concat(chunks);
	}

	private async appendControlSection(
		overrides?: Partial<ControlSection>,
	): Promise<void> {
		const tarball = pack();

		const control: ControlSection = {
			Package: this.packageId,
			Version: this.metadata.version,
			Section: 'misc',
			Priority: 'optional',
			Architecture: 'all',
			'webOS-Package-Format-Version': 2,
			...overrides,
		};

		const serialized = Object.entries(control).reduce(
			(accumulator, [key, value]) => `${accumulator}${key}: ${value}\n`,
			'',
		);

		tarball.entry({ name: 'control', mtime: FIXED_MTIME }, serialized);

		this.ar.append('control.tar.gz', await this.collectTarball(tarball));
	}

	private async appendDataSection() {
		if (this.namespaces.app.size !== 1) {
			throw new IPKBuilderError(
				'Package must include exactly one app namespace.',
			);
		}

		const app = this.namespaces.app.values().next().value!;

		const packageInfo = {
			id: this.packageId,
			version: this.metadata.version,
			app,
			services: Array.from(this.namespaces.service.values()).sort((a, b) =>
				a.localeCompare(b),
			),
		};

		const root = `usr/palm/packages/${this.packageId}`;

		for (const name of getDirectoryParents(root)) {
			if (!this.createdParents.has(name)) {
				this.data.entry({ name, type: 'directory', mtime: FIXED_MTIME });
			}
		}

		this.data.entry(
			{ name: join(root, 'packageinfo.json'), mtime: FIXED_MTIME },
			JSON.stringify(packageInfo, null, '\t'),
		);

		this.ar.append('data.tar.gz', await this.collectTarball(this.data));
	}
}

export class IPKBuilderError extends Error {
	public constructor(message: string) {
		super(message);

		Object.setPrototypeOf(this, IPKBuilderError.prototype);
	}
}
