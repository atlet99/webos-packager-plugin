import { join } from 'path';

import { hoc } from '../src';

export default hoc({
	id: 'com.example.app',
	version: '1.0.0',
	options: {
		emitManifest: true,
		manifest: {
			title: 'Example App',
			description: 'Example app description',
			iconUrl: 'https://example.com/icon.png',
			sourceUrl: 'https://example.com/source',
		},
	},
	app: {
		id: 'com.example.app',
		mode: 'development',
		entry: './src/app.js',
		output: {
			filename: 'main.js',
			path: join(__dirname, 'dist/hoc'),
		},
	},
	services: [
		{
			id: 'com.example.app.service',
			mode: 'development',
			entry: './src/service.js',
			output: {
				filename: 'service.js',
				path: join(__dirname, 'dist/hoc'),
			},
		},
	],
});
