#!/usr/bin/env node
/**
 * Assemble the npm package from the built MCP server.
 *
 * The same `dist/mcp-server.js` the VSIX ships is what gets published, so the
 * two distributions can never diverge in behaviour — there is one build.
 *
 * The version is *written* here from the root manifest rather than maintained
 * by hand in two places. A VSIX and an npm package claiming the same version
 * while carrying different code is the kind of drift that is invisible until
 * someone reports a bug against a version that never existed.
 *
 *   node scripts/build-npm.js
 */
const fs = require('node:fs');
const path = require('node:path');

const root = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const packageDir = path.resolve('mcp');
const manifestPath = path.join(packageDir, 'package.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const expectedName = `${root.name}-mcp`;
if (manifest.name !== expectedName) {
	console.error(
		`FAIL: mcp/package.json is named "${manifest.name}", expected "${expectedName}"`,
	);
	process.exit(1);
}

const bundlePath = path.resolve('dist/mcp-server.js');
if (!fs.existsSync(bundlePath)) {
	console.error('FAIL: dist/mcp-server.js is missing — run `bun run build:mcp:prod` first');
	process.exit(1);
}

if (manifest.version !== root.version) {
	manifest.version = root.version;
	fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, '\t')}\n`);
}

fs.copyFileSync(bundlePath, path.join(packageDir, 'server.js'));
fs.copyFileSync(path.resolve('LICENSE'), path.join(packageDir, 'LICENSE'));

console.log(`OK: mcp/ assembled as ${manifest.name}@${manifest.version}`);
