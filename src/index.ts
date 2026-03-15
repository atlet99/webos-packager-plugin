import { createHash } from 'crypto';
import { join, normalize } from 'path/posix';

import { Compilation, sources, type Compiler } from 'webpack';

import { IPKBuilder } from './ipk';
import { Deferred } from './utils';

import type {
	FlavoredConfig,
	HOCDefinition,
	Namespace,
	OutputFilename,
	OutputFilenameContext,
	PackageMetadata,
	PackagerOptions,
	Plugin,
	HookDeferredValue,
	WebpackArgv,
	WebpackEnvironment,
} from './declarations';

export type { FlavoredConfig } from './declarations';

const assertIdentifier = (name: string, value: string) => {
	if (typeof value !== 'string' || value.trim() === '') {
		throw new TypeError(`WebOSPackagerPlugin: "${name}" must be a non-empty string.`);
	}

	if (value === '.' || value === '..' || value.includes('/') || value.includes('\\')) {
		throw new TypeError(`WebOSPackagerPlugin: "${name}" contains invalid path characters.`);
	}
};

const assertNonEmptyString = (name: string, value: unknown) => {
	if (typeof value !== 'string' || value.trim() === '') {
		throw new TypeError(`WebOSPackagerPlugin: "${name}" must be a non-empty string.`);
	}
};

const assertRelativePath = (name: string, value: unknown) => {
	assertNonEmptyString(name, value);
	const target = normalize((value as string).replace(/\\/g, '/'));

	if (
		target === '' ||
		target === '.' ||
		target === '..' ||
		target.startsWith('../') ||
		target.includes('/../') ||
		target.startsWith('/')
	) {
		throw new TypeError(`WebOSPackagerPlugin: "${name}" contains invalid path segments.`);
	}
};

const assertOutputFilename = (name: string, value: unknown) => {
	if (typeof value === 'function') {
		return;
	}

	assertRelativePath(name, value);
};

const assertPackagerOptions = (options: PackagerOptions | null | undefined, prefix = 'options') => {
	if (!options) {
		return;
	}

	if (options.filename !== undefined) {
		assertOutputFilename(`${prefix}.filename`, options.filename);
	}

	if (options.output?.filename !== undefined) {
		assertOutputFilename(`${prefix}.output.filename`, options.output.filename);
	}

	if (options.output?.template !== undefined) {
		assertRelativePath(`${prefix}.output.template`, options.output.template);
	}

	if (options.output?.dir !== undefined) {
		assertRelativePath(`${prefix}.output.dir`, options.output.dir);
	}

	if (options.output?.variables !== undefined) {
		if (!options.output.variables || typeof options.output.variables !== 'object') {
			throw new TypeError(`WebOSPackagerPlugin: "${prefix}.output.variables" must be an object.`);
		}

		for (const [key, value] of Object.entries(options.output.variables)) {
			if (typeof key !== 'string' || key.trim() === '') {
				throw new TypeError(
					`WebOSPackagerPlugin: "${prefix}.output.variables" contains an invalid key.`,
				);
			}

			if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
				throw new TypeError(
					`WebOSPackagerPlugin: "${prefix}.output.variables.${key}" must be a string, number or boolean.`,
				);
			}
		}
	}

	if (!options.emitManifest) {
		return;
	}

	const manifest = (options as PackagerOptions & { emitManifest: true }).manifest;

	if (!manifest || typeof manifest !== 'object') {
		throw new TypeError(`WebOSPackagerPlugin: "${prefix}.manifest" must be provided.`);
	}

	const requiredStringFields = ['title', 'description', 'iconUrl', 'sourceUrl'] as const;
	const allowedFields = new Set([
		...requiredStringFields,
		'rootRequired',
		'type',
	] satisfies ReadonlyArray<keyof typeof manifest>);

	for (const key of requiredStringFields) {
		assertNonEmptyString(`${prefix}.manifest.${key}`, manifest[key]);
	}

	for (const [key, value] of Object.entries(manifest)) {
		if (!allowedFields.has(key as keyof typeof manifest)) {
			throw new TypeError(`WebOSPackagerPlugin: "${prefix}.manifest.${key}" is not supported.`);
		}

		if (key === 'rootRequired') {
			if (value !== undefined && typeof value !== 'boolean') {
				throw new TypeError(
					`WebOSPackagerPlugin: "${prefix}.manifest.rootRequired" must be a boolean.`,
				);
			}
			continue;
		}

		if (key === 'type') {
			if (value !== undefined && value !== 'web' && value !== 'native') {
				throw new TypeError(
					`WebOSPackagerPlugin: "${prefix}.manifest.type" must be "web" or "native".`,
				);
			}
			continue;
		}

		if (typeof value !== 'string') {
			throw new TypeError(`WebOSPackagerPlugin: "${prefix}.manifest.${key}" must be a string.`);
		}
	}
};

abstract class AssetPlugin implements Plugin {
	protected abstract readonly pluginName: string;

	protected constructor(private readonly stage: number) {}

	protected abstract hook(compilation: Compilation): Promise<void> | void;

	public apply(compiler: Compiler) {
		compiler.hooks.thisCompilation.tap(this.pluginName, compilation => {
			compilation.hooks.processAssets.tapPromise(
				{
					name: this.pluginName,
					stage: this.stage,
				},
				async () => await this.hook(compilation),
			);
		});
	}
}

class AssetPackagerPlugin extends AssetPlugin {
	protected pluginName = 'AssetPackagerPlugin';

	private hooks: AssetHookPlugin[] = [];

	public constructor(
		private readonly options: PackagerOptions | null,
		private readonly metadata: PackageMetadata,
	) {
		super(Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_TRANSFER);
	}

	public register(hook: AssetHookPlugin) {
		this.hooks.push(hook);
	}

	protected async hook(compilation: Compilation) {
		const builder = new IPKBuilder(this.metadata);
		const compilations = await Promise.all(this.hooks.map(x => x.value()));

		for await (const { namespace, assets } of compilations) {
			const map: Record<string, Buffer> = {};

			for (const [path, asset] of Object.entries(assets)) {
				map[path] = asset.buffer();
			}

			builder.addEntries(namespace, map);
		}

		const filename = this.resolveOutputFilename();
		const buffer = await builder.buffer();

		compilation.emitAsset(filename, new sources.RawSource(buffer));

		if (this.options?.emitManifest) {
			const sha256 = createHash('sha256').update(buffer).digest('hex');

			compilation.emitAsset(
				`${this.metadata.id}.manifest.json`,
				this.createManifestAsset({
					ipkUrl: filename,
					ipkHash: { sha256 },
				}),
			);
		}
	}

	private resolveOutputFilename() {
		const output = this.options?.output;
		const defaultBaseName = `${this.metadata.id}_${this.metadata.version}_all`;
		const context: OutputFilenameContext = {
			id: this.metadata.id,
			version: this.metadata.version,
			ext: 'ipk',
			baseName: defaultBaseName,
		};
		const filenameSource: OutputFilename | undefined = output?.filename ?? this.options?.filename;
		let filename: string;

		if (typeof filenameSource === 'function') {
			filename = filenameSource(context);
		} else if (typeof filenameSource === 'string') {
			filename = filenameSource;
		} else if (typeof output?.template === 'string') {
			const variables = Object.fromEntries(
				Object.entries(output.variables ?? {}).map(([key, value]) => [key, String(value)]),
			);
			const tokens = {
				id: context.id,
				version: context.version,
				ext: context.ext,
				baseName: context.baseName,
				...variables,
			};

			filename = output.template.replace(/\[([A-Za-z0-9_]+)\]/g, (_, key: string) => {
				if (!(key in tokens)) {
					throw new TypeError(`WebOSPackagerPlugin: unknown output template token "${key}".`);
				}

				return tokens[key as keyof typeof tokens];
			});
		} else {
			filename = `${defaultBaseName}.ipk`;
		}

		assertRelativePath('output filename', filename);

		if (!filename.endsWith('.ipk')) {
			filename = `${filename}.ipk`;
		}

		if (output?.dir) {
			filename = join(output.dir, filename);
		}

		assertRelativePath('output filename', filename);
		return filename;
	}

	private createManifestAsset(fileInfo: { ipkUrl: string; ipkHash: { sha256: string } }) {
		if (!this.options?.emitManifest) {
			throw new TypeError('createManifestAsset: type guard');
		}

		const { id, version } = this.metadata;
		const {
			type = 'web',
			title,
			description: appDescription,
			iconUrl,
			sourceUrl: sourceUri,
			rootRequired = false,
		} = this.options.manifest;

		const manifest = {
			id,
			version,
			type,
			title,
			appDescription,
			iconUrl,
			sourceUri,
			rootRequired,
			...fileInfo,
		};

		return new sources.RawSource(JSON.stringify(manifest, null, '\t'));
	}
}

class AssetHookPlugin extends AssetPlugin {
	protected pluginName = 'AssetHookPlugin';

	private pending: HookDeferredValue[] = [];
	private deferred: Deferred<HookDeferredValue> | null = null;
	private readonly pushedCompilations = new WeakSet<Compilation>();

	public constructor(private readonly namespace: Namespace) {
		super(Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE);
	}

	public apply(compiler: Compiler) {
		super.apply(compiler);

		compiler.hooks.done.tap(this.pluginName, stats => {
			if (this.pushedCompilations.has(stats.compilation)) {
				return;
			}

			this.push({
				namespace: this.namespace,
				assets: stats.compilation.assets,
			});
			this.pushedCompilations.add(stats.compilation);
		});
	}

	public value() {
		if (this.pending.length > 0) {
			return Promise.resolve(this.pending.shift()!);
		}

		this.deferred ??= new Deferred<HookDeferredValue>();
		return this.deferred.promise;
	}

	protected hook(compilation: Compilation) {
		if (this.pushedCompilations.has(compilation)) {
			return;
		}

		this.push({
			namespace: this.namespace,
			assets: compilation.assets,
		});
		this.pushedCompilations.add(compilation);
	}

	private push(value: HookDeferredValue) {
		if (this.deferred) {
			this.deferred.resolve(value);
			this.deferred = null;
			return;
		}

		this.pending.push(value);
	}
}

export class WebOSPackagerPlugin implements Plugin {
	private readonly packager: AssetPackagerPlugin;
	private readonly hook: AssetHookPlugin;

	public constructor(options: PackageMetadata & PackagerOptions & Namespace) {
		WebOSPackagerPlugin.validateOptions(options);

		this.packager = new AssetPackagerPlugin(options, options);
		this.hook = new AssetHookPlugin(options);

		this.packager.register(this.hook);
	}

	public apply(compiler: Compiler) {
		this.packager.apply(compiler);
		this.hook.apply(compiler);
	}

	private static validateOptions(options: PackageMetadata & PackagerOptions & Namespace) {
		assertIdentifier('id', options.id);
		assertNonEmptyString('version', options.version);

		if (options.type !== 'app' && options.type !== 'service') {
			throw new TypeError('WebOSPackagerPlugin: "type" must be "app" or "service".');
		}

		assertPackagerOptions(options);
	}
}

export const hoc =
	<E extends Record<string, any> = {}>(definition: HOCDefinition) =>
	(...argv: [WebpackEnvironment<E>, WebpackArgv<E>]) => {
		assertIdentifier('definition.id', definition.id);
		assertNonEmptyString('definition.version', definition.version);
		assertPackagerOptions(definition.options, 'definition.options');

		const invoke = (config: FlavoredConfig) =>
			Object.defineProperties(typeof config === 'function' ? config(...argv) : config, {
				id: { enumerable: false },
			});

		const packager = new AssetPackagerPlugin(definition.options ?? null, {
			id: definition.id,
			version: definition.version,
		});

		const app = invoke(definition.app);
		assertIdentifier('app.id', app.id);
		const hook = new AssetHookPlugin({ id: app.id, type: 'app' });

		app.plugins ??= [];
		app.plugins.push(packager, hook);

		packager.register(hook);

		const services = definition.services?.map(service => {
			const svc = invoke(service);
			assertIdentifier('service.id', svc.id);
			const hook = new AssetHookPlugin({ id: svc.id, type: 'service' });

			svc.plugins ??= [];
			svc.plugins.push(hook);

			packager.register(hook);

			return svc;
		});

		return [app, ...(services ?? [])];
	};
