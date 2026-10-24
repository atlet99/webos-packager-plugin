export type Namespace = {
	id: string;
	type: 'app' | 'service';
};

export type PackageMetadata = {
	id: string;
	version: string;
};

export type PackageMetadataInput = {
	id: string;
	version?: string;
	versionFile?: string;
	versionEnv?: string;
};

export type ControlSection = Record<
	'Package' | 'Version' | 'Section' | 'Priority' | 'Architecture' | 'webOS-Package-Format-Version',
	string | number
>;

export type ControlSectionExtra = {
	Description?: string;
	Maintainer?: string;
	'Installed-Size'?: string | number;
};

export type Asset = Buffer | { data: Buffer; mode?: number };

export type AssetMap = { [path: string]: Asset };

export type IPKBuilderOptions = PackageMetadata & {
	primaryApp?: string;
	mtime?: number;
	control?: ControlSectionExtra;
};

export type OutputFilenameContext = {
	id: string;
	version: string;
	ext: 'ipk';
	baseName: string;
};

export type OutputFilename = string | ((context: OutputFilenameContext) => string);

type HomebrewManifest = {
	title: string;
	description: string;
	iconUrl: string;
	sourceUrl: string;
	rootRequired?: boolean;
	type?: 'web' | 'native';
};

type MaybeHomebrewOptionsMixin =
	| { emitManifest?: false }
	| {
			emitManifest: true;
			manifest: HomebrewManifest;
	  };

export type OutputOptions = {
	dir?: string;
	filename?: OutputFilename;
	template?: string;
	variables?: Record<string, string | number | boolean>;
};

export type PackagerOptions = MaybeHomebrewOptionsMixin & {
	filename?: OutputFilename;
	output?: OutputOptions;
};

export type WebOSPackagerPluginOptions = PackageMetadataInput & PackagerOptions & Namespace;
