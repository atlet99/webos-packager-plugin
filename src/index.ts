import { createHash } from 'crypto';

import { Compilation, sources, type Compiler } from 'webpack';

import { IPKBuilder } from './ipk';
import { Deferred } from './utils';

import type {
	FlavoredConfig,
	HOCDefinition,
	Namespace,
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

const assertPackagerOptions = (options: PackagerOptions | null | undefined, prefix = 'options') => {
	if (!options) {
		return;
	}

	if (options.filename !== undefined) {
		assertNonEmptyString(`${prefix}.filename`, options.filename);
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

		const filename =
			this.options?.filename ?? `${this.metadata.id}_${this.metadata.version}_all.ipk`;
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
