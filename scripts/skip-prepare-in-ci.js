#!/usr/bin/env node
/**
 * Skip prepare script in CI environments.
 * Run `npm run build` explicitly after install in CI.
 *
 * Usage:
 * - CI: prepare hook exits immediately (build runs explicitly in workflow)
 * - Local: prepare hook runs build for development
 */

const isCI = process.env.CI === 'true' ||
             process.env.GITHUB_ACTIONS === 'true' ||
             process.env.CONTINUOUS_INTEGRATION === 'true';

if (isCI) {
  console.log('CI detected: Skipping prepare script');
  process.exit(0);
}

// Local development: run build
const { execSync } = require('child_process');
try {
  console.log('Local development: Running build...');
  execSync('npm run build', { stdio: 'inherit' });
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}
