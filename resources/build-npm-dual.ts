import { buildPackage } from './build-package.js';
import { showDirStats } from './utils.js';

console.log('\n./npmDist');
await buildPackage('./npmDist', false);
showDirStats('./npmDist');
