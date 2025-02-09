import fs from 'node:fs';

import { npm, prettify, readPackageJSON, writeGeneratedFile } from './utils.js';

const publishWorkspaceConfigDir = 'publishWorkspaceConfig';

console.log('\npreparing packages for publish');

fs.rmSync(`./${publishWorkspaceConfigDir}`, { recursive: true, force: true });
fs.mkdirSync(`./${publishWorkspaceConfigDir}`);
fs.cpSync('./.changeset', `./${publishWorkspaceConfigDir}/.changeset`, {
  recursive: true,
});

const packageJSON = readPackageJSON();

delete packageJSON.private;
packageJSON.workspaces = ['../npmDist'];

const destPath = `./${publishWorkspaceConfigDir}/package.json`;
const prettified = await prettify(destPath, JSON.stringify(packageJSON));
writeGeneratedFile(destPath, prettified);

npm().run('build:npm:dual');
