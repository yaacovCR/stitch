import fs from 'node:fs';

import { npm, readPackageJSON, writeGeneratedFile } from './utils.js';

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

writeGeneratedFile(
  `./${publishWorkspaceConfigDir}/package.json`,
  JSON.stringify(packageJSON),
);

npm().run('build:npm:dual');
