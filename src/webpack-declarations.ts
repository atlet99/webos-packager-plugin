import type { Compiler, Compilation, Configuration } from 'webpack';

import type { Namespace, PackageMetadataInput, PackagerOptions } from './declarations';

export type WebpackEnvironment<Argv extends Record<string, any>> = Argv;

export type WebpackArgv<Argv extends Record<string, any>> = Partial<Pick<Configuration, 'mode'>> & {
	env: WebpackEnvironment<Argv>;
};

type WebpackConfigurationFn<
	Flavor extends Record<string, any>,
	Argv extends Record<string, any>,
> = (env: WebpackEnvironment<Argv>, argv: WebpackArgv<Argv>) => Configuration & Flavor;

type Config<Flavor extends Record<string, any>> =
	| (Configuration & Flavor)
	| WebpackConfigurationFn<Flavor, {}>;

export type Plugin = {
	apply(compiler: Compiler): void;
};

export type FlavoredConfig = Config<{ id: string }>;

export type HookDeferredValue = {
	namespace: Namespace;
	assets: Compilation['assets'];
};

export type HOCDefinition = PackageMetadataInput & {
	options?: PackagerOptions;
	app: FlavoredConfig;
	services?: FlavoredConfig[];
};
