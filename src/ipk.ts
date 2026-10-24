import { constants, createGzip } from 'zlib';
import { join, normalize } from 'path/posix';

import { Pack, pack } from 'tar-stream';

import { ArWriter } from './ar';
import { getDirectoryParents } from './utils';
import { CONTROL_CHARACTERS, VERSION_REGEXP } from './validation';

import type {
	Asset,
	AssetMap,
	ControlSection,
	ControlSectionExtra,
	IPKBuilderOptions,
	Namespace,
} from './declarations';

const NAMESPACE_MAP: Record<Namespace['type'], string> = {
	app: 'applications',
	service: 'services',
};

const ELF_MAGIC = 0x7f454c46;
const SHEBANG_MAGIC = 0x2321;
const MAX_MODE = 0o7777;
const MAX_MTIME = 0o77777777777;
const EXECUTABLE_MODE = 0o755;
const READONLY_MODE = 0o644;
const DEFAULT_CONTROL: Omit<ControlSection, 'Package' | 'Version'> = {
	Section: 'misc',
	Priority: 'optional',
	Architecture: 'all',
	'webOS-Package-Format-Version': 2,
};
const EXTRA_CONTROL_FIELDS = new Set(['Description', 'Maintainer', 'Installed-Size']);

const compareStrings = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

type ResolvedAsset = { data: Buffer; mode: number };

export class IPKBuilder {
	private readonly ar = new ArWriter();
	private readonly data = pack();
	private readonly packageId: string;
	private readonly version: string;
	private readonly primaryApp?: string;
	private readonly mtime: Date;
	private readonly extraControl: ControlSectionExtra;
	private readonly namespaces: Record<Namespace['type'], Set<string>> = {
		app: new Set(),
		service: new Set(),
	};
	private readonly files = new Map<string, ResolvedAsset>();
	private readonly dirs = new Set<string>();
	private finalized = false;

	public constructor(metadata: IPKBuilderOptions) {
		this.packageId = this.normalizeIdentifier(metadata.id, 'package id');
		this.version = this.normalizeVersion(metadata.version);
		this.primaryApp =
			metadata.primaryApp === undefined
				? undefined
				: this.normalizeIdentifier(metadata.primaryApp, 'primary app');
		this.mtime = new Date(this.resolveMtime(metadata.mtime) * 1000);
		this.extraControl = this.normalizeExtraControl(metadata.control);

		this.ar.append('debian-binary', '2.0\n');
	}

	public addEntries({ id, type }: Namespace, assets: AssetMap) {
		if (this.finalized) {
			throw new IPKBuilderError('Cannot add entries after the package has been built.');
		}

		const namespaceId = this.normalizeIdentifier(id, `${type} id`);
		const root = `usr/palm/${NAMESPACE_MAP[type]}/${namespaceId}`;
		const entries = this.normalizeEntries(root, assets);
		const batchDirs = new Set<string>();

		for (const [asset] of entries) {
			for (const parent of getDirectoryParents(join(root, asset)).slice(0, -1)) {
				batchDirs.add(parent);
			}
		}

		for (const [asset] of entries) {
			const name = join(root, asset);

			if (this.files.has(name)) {
				throw new IPKBuilderError(`Duplicate asset path: ${name}`);
			}

			if (this.dirs.has(name) || batchDirs.has(name)) {
				throw new IPKBuilderError(`Path conflict: ${name} is already a directory.`);
			}

			for (const parent of getDirectoryParents(name).slice(0, -1)) {
				if (this.files.has(parent)) {
					throw new IPKBuilderError(`Path conflict: ${parent} is already a file.`);
				}
			}
		}

		this.namespaces[type].add(namespaceId);

		for (const dir of batchDirs) {
			this.dirs.add(dir);
		}

		for (const [asset, resolved] of entries) {
			this.files.set(join(root, asset), resolved);
		}
	}

	public async buffer(): Promise<Buffer> {
		if (this.finalized) {
			throw new IPKBuilderError('Package has already been built.');
		}

		this.finalized = true;

		await this.appendControlSection();
		await this.appendDataSection();

		return this.ar.buffer();
	}

	private normalizeEntries(root: string, assets: AssetMap) {
		const unique = new Map<string, Asset>();

		for (const [path, asset] of Object.entries(assets)) {
			const target = this.normalizeAssetPath(path);

			if (unique.has(target)) {
				throw new IPKBuilderError(`Duplicate asset path: ${join(root, target)}`);
			}

			unique.set(target, asset);
		}

		return Array.from(unique.entries())
			.sort(([a], [b]) => compareStrings(a, b))
			.map(([asset, content]) => [asset, this.resolveAsset(content)] as const);
	}

	private resolveAsset(asset: Asset): ResolvedAsset {
		if (Buffer.isBuffer(asset)) {
			return { data: asset, mode: this.resolveMode(undefined, asset) };
		}

		if (!asset || !Buffer.isBuffer((asset as { data?: unknown }).data)) {
			throw new IPKBuilderError('Asset must be a Buffer or an object with a Buffer "data" field.');
		}

		return { data: asset.data, mode: this.resolveMode(asset.mode, asset.data) };
	}

	private resolveMode(mode: number | undefined, buffer: Buffer): number {
		if (mode === undefined) {
			return this.isExecutable(buffer) ? EXECUTABLE_MODE : READONLY_MODE;
		}

		if (!Number.isInteger(mode) || mode < 0 || mode > MAX_MODE) {
			throw new IPKBuilderError(
				`Invalid asset mode: ${mode}. Mode must be an integer between 0 and ${MAX_MODE.toString(8)}.`,
			);
		}

		return mode;
	}

	private isExecutable(buffer: Buffer): boolean {
		if (buffer.length < 4) {
			return false;
		}

		return buffer.readUInt32BE() === ELF_MAGIC || buffer.readUInt16BE() === SHEBANG_MAGIC;
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
			value.includes('\\') ||
			/\s/.test(value) ||
			CONTROL_CHARACTERS.test(value)
		) {
			throw new IPKBuilderError(`Invalid ${kind}: ${value}`);
		}

		return value;
	}

	private normalizeVersion(version: string): string {
		if (
			typeof version !== 'string' ||
			version.trim() === '' ||
			CONTROL_CHARACTERS.test(version) ||
			!VERSION_REGEXP.test(version.trim())
		) {
			throw new IPKBuilderError(
				'IPKBuilder: "version" must be a valid semver-like value (x.y.z[-suffix]).',
			);
		}

		return version.trim();
	}

	private resolveMtime(explicit: number | undefined): number {
		if (explicit !== undefined) {
			return this.assertMtime(explicit, '"mtime"');
		}

		const sourceDateEpoch = process.env.SOURCE_DATE_EPOCH;

		if (sourceDateEpoch === undefined || sourceDateEpoch.trim() === '') {
			return 0;
		}

		const value = Number(sourceDateEpoch);

		if (!Number.isInteger(value)) {
			throw new IPKBuilderError(
				`IPKBuilder: "SOURCE_DATE_EPOCH" must be an integer number of Unix seconds, got: ${sourceDateEpoch}.`,
			);
		}

		return this.assertMtime(value, '"SOURCE_DATE_EPOCH"');
	}

	private assertMtime(value: number, name: string): number {
		if (!Number.isInteger(value) || value < 0 || value > MAX_MTIME) {
			throw new IPKBuilderError(
				`IPKBuilder: ${name} must be an integer between 0 and ${MAX_MTIME} (Unix seconds).`,
			);
		}

		return value;
	}

	private normalizeExtraControl(control: ControlSectionExtra | undefined): ControlSectionExtra {
		if (control === undefined) {
			return {};
		}

		if (!control || typeof control !== 'object') {
			throw new IPKBuilderError('IPKBuilder: "control" must be an object.');
		}

		const result: ControlSectionExtra = {};

		for (const [key, value] of Object.entries(control)) {
			if (!EXTRA_CONTROL_FIELDS.has(key)) {
				throw new IPKBuilderError(`IPKBuilder: unsupported control field: ${key}.`);
			}

			if (value === undefined) {
				continue;
			}

			if (key === 'Installed-Size' && typeof value === 'number') {
				if (!Number.isInteger(value) || value < 0) {
					throw new IPKBuilderError(
						'IPKBuilder: "control.Installed-Size" must be a non-negative integer.',
					);
				}

				result['Installed-Size'] = value;
				continue;
			}

			if (typeof value !== 'string' || value.trim() === '' || CONTROL_CHARACTERS.test(value)) {
				throw new IPKBuilderError(
					`IPKBuilder: "control.${key}" must be a non-empty single-line string.`,
				);
			}

			result[key as keyof ControlSectionExtra] = value;
		}

		return result;
	}

	private async collectTarball(packer: Pack): Promise<Buffer> {
		packer.finalize();

		const chunks: Buffer[] = [];

		for await (const chunk of packer.pipe(createGzip({ level: constants.Z_BEST_COMPRESSION }))) {
			chunks.push(chunk);
		}

		return Buffer.concat(chunks);
	}

	private async appendControlSection(): Promise<void> {
		const tarball = pack();
		const control: ControlSection = {
			Package: this.packageId,
			Version: this.version,
			...DEFAULT_CONTROL,
			...this.extraControl,
		};

		const serialized = Object.entries(control).reduce(
			(accumulator, [key, value]) => `${accumulator}${key}: ${value}\n`,
			'',
		);

		tarball.entry({ name: 'control', mtime: this.mtime }, serialized);

		this.ar.append('control.tar.gz', await this.collectTarball(tarball));
	}

	private async appendDataSection() {
		const apps = Array.from(this.namespaces.app).sort(compareStrings);

		if (apps.length === 0) {
			throw new IPKBuilderError('Package must include at least one app namespace.');
		}

		let app: string;

		if (this.primaryApp !== undefined) {
			if (!apps.includes(this.primaryApp)) {
				throw new IPKBuilderError(
					`Primary app "${this.primaryApp}" is not included in the package as an app.`,
				);
			}

			app = this.primaryApp;
		} else {
			if (apps.length > 1) {
				throw new IPKBuilderError(
					`Package includes multiple apps (${apps.join(', ')}); "primaryApp" must be specified.`,
				);
			}

			app = apps[0];
		}

		const services = Array.from(this.namespaces.service).sort(compareStrings);
		const foreignService = services.find(
			service => !apps.some(id => service === id || service.startsWith(`${id}.`)),
		);

		if (foreignService) {
			throw new IPKBuilderError(
				`Service id "${foreignService}" must equal or start with one of the packaged app ids: ${apps.join(', ')}.`,
			);
		}

		const packageRoot = `usr/palm/packages/${this.packageId}`;

		this.files.set(join(packageRoot, 'packageinfo.json'), {
			data: Buffer.from(
				JSON.stringify(
					{
						id: this.packageId,
						version: this.version,
						app,
						services,
					},
					null,
					'\t',
				),
			),
			mode: READONLY_MODE,
		});

		const dirs = new Set<string>();

		for (const name of this.files.keys()) {
			for (const parent of getDirectoryParents(name).slice(0, -1)) {
				dirs.add(parent);
			}
		}

		for (const name of Array.from(dirs).sort(compareStrings)) {
			this.data.entry({ name, type: 'directory', mtime: this.mtime });
		}

		for (const [name, { data, mode }] of Array.from(this.files.entries()).sort(([a], [b]) =>
			compareStrings(a, b),
		)) {
			this.data.entry({ name, mode, mtime: this.mtime }, data);
		}

		this.ar.append('data.tar.gz', await this.collectTarball(this.data));
	}
}

export class IPKBuilderError extends Error {
	public constructor(message: string) {
		super(message);

		this.name = 'IPKBuilderError';

		Object.setPrototypeOf(this, IPKBuilderError.prototype);
	}
}
