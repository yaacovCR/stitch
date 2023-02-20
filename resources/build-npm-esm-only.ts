import { buildPackage } from './build-package.js';
import { showDirStats } from './utils.js';

console.log('\n./npmEsmDist');
buildPackage('./npmEsmDist', true);
showDirStats('./npmEsmDist');
