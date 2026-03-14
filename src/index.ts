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
		throw new TypeError(
			`WebOSPackagerPlugin: "${name}" must be a non-empty string.`,
		);
	}

	if (
		value === '.' ||
		value === '..' ||
		value.includes('/') ||
		value.includes('\\')
	) {
		throw new TypeError(
			`WebOSPackagerPlugin: "${name}" contains invalid path characters.`,
		);
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
		const compilations = await Promise.all(
			this.hooks.map(x => x.value(compilation)),
		);

		for await (const { namespace, assets } of compilations) {
			const map: Record<string, Buffer> = {};

			for (const [path, asset] of Object.entries(assets)) {
				map[path] = asset.buffer();
			}

			builder.addEntries(namespace, map);
		}

		const filename =
			this.options?.filename ??
			`${this.metadata.id}_${this.metadata.version}_all.ipk`;
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

	private createManifestAsset(fileInfo: {
		ipkUrl: string;
		ipkHash: { sha256: string };
	}) {
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

	private lastCompilation: Compilation | null = null;
	private currentValue: HookDeferredValue | null = null;
	private deferred = new Deferred<HookDeferredValue>();

	public constructor(private readonly namespace: Namespace) {
		super(Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE);
	}

	public value(compilation: Compilation) {
		if (this.lastCompilation === compilation && this.currentValue) {
			return Promise.resolve(this.currentValue);
		}

		return this.deferred.promise;
	}

	protected hook(compilation: Compilation) {
		const value = {
			namespace: this.namespace,
			assets: compilation.assets,
		};

		this.lastCompilation = compilation;
		this.currentValue = value;
		this.deferred.resolve(value);
		this.deferred = new Deferred<HookDeferredValue>();
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

	private static validateOptions(
		options: PackageMetadata & PackagerOptions & Namespace,
	) {
		assertIdentifier('id', options.id);

		if (typeof options.version !== 'string' || options.version.trim() === '') {
			throw new TypeError(
				'WebOSPackagerPlugin: "version" must be a non-empty string.',
			);
		}

		if (options.type !== 'app' && options.type !== 'service') {
			throw new TypeError(
				'WebOSPackagerPlugin: "type" must be "app" or "service".',
			);
		}
	}
}

export const hoc =
	<E extends Record<string, any> = {}>(definition: HOCDefinition) =>
	(...argv: [WebpackEnvironment<E>, WebpackArgv<E>]) => {
		assertIdentifier('definition.id', definition.id);

		const invoke = (config: FlavoredConfig) =>
			Object.defineProperties(
				typeof config === 'function' ? config(...argv) : config,
				{
					id: { enumerable: false },
				},
			);

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
