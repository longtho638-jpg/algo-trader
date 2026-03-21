// Plugin loader: dynamic import of strategy plugins from filesystem
import { readdir } from 'node:fs/promises';
import { resolve, extname, basename } from 'node:path';
import type { RunnableStrategy } from '../engine/strategy-runner.js';

/** Shape every plugin file must export */
export interface PluginModule {
  name: string;
  version: string;
  description: string;
  /** Factory function that creates a fresh strategy instance */
  createStrategy: () => RunnableStrategy;
}

/** Thrown when a plugin file cannot be loaded or is malformed */
export class PluginLoadError extends Error {
  constructor(
    public readonly filePath: string,
    public readonly reason: string,
  ) {
    super(`PluginLoadError [${filePath}]: ${reason}`);
    this.name = 'PluginLoadError';
  }
}

/** Required top-level export keys for a valid PluginModule */
const REQUIRED_FIELDS: ReadonlyArray<keyof PluginModule> = [
  'name',
  'version',
  'description',
  'createStrategy',
];

/**
 * Dynamically import a single .js plugin file and return its PluginModule.
 * Throws PluginLoadError if the file is missing required exports.
 */
export async function loadPlugin(filePath: string): Promise<PluginModule> {
  const absolutePath = resolve(filePath);
  let mod: Record<string, unknown>;

  try {
    // Dynamic import — caller provides compiled .js path
    mod = (await import(absolutePath)) as Record<string, unknown>;
  } catch (err) {
    throw new PluginLoadError(
      absolutePath,
      `Failed to import: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Validate required fields exist
  for (const field of REQUIRED_FIELDS) {
    if (!(field in mod)) {
      throw new PluginLoadError(absolutePath, `Missing required export: "${field}"`);
    }
  }

  if (typeof mod['name'] !== 'string' || mod['name'].trim() === '') {
    throw new PluginLoadError(absolutePath, 'Export "name" must be a non-empty string');
  }
  if (typeof mod['version'] !== 'string') {
    throw new PluginLoadError(absolutePath, 'Export "version" must be a string');
  }
  if (typeof mod['description'] !== 'string') {
    throw new PluginLoadError(absolutePath, 'Export "description" must be a string');
  }
  if (typeof mod['createStrategy'] !== 'function') {
    throw new PluginLoadError(absolutePath, 'Export "createStrategy" must be a function');
  }

  return mod as unknown as PluginModule;
}

/**
 * Scan a directory and load all .js files as plugins.
 * Returns array of [filePath, PluginModule | PluginLoadError] pairs.
 * Non-.js files and subdirectories are skipped silently.
 */
export async function loadPluginsFromDir(
  dirPath: string,
): Promise<Array<{ file: string; result: PluginModule | PluginLoadError }>> {
  const absoluteDir = resolve(dirPath);
  let entries: string[];

  try {
    entries = await readdir(absoluteDir);
  } catch (err) {
    throw new PluginLoadError(
      absoluteDir,
      `Cannot read directory: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const jsFiles = entries
    .filter(f => extname(f) === '.js')
    .map(f => resolve(absoluteDir, f));

  const results = await Promise.allSettled(jsFiles.map(f => loadPlugin(f)));

  return jsFiles.map((file, i) => {
    const outcome = results[i];
    if (outcome === undefined) {
      return { file, result: new PluginLoadError(file, 'Unexpected missing result') };
    }
    return {
      file: basename(file),
      result: outcome.status === 'fulfilled' ? outcome.value : (outcome.reason as PluginLoadError),
    };
  });
}
