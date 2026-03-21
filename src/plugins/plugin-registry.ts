// Plugin registry: central store for loaded, validated, and enabled plugins
import { logger } from '../core/logger.js';
import type { RunnableStrategy } from '../engine/strategy-runner.js';
import { loadPluginsFromDir, PluginLoadError, type PluginModule } from './plugin-loader.js';
import { validateAll, type PluginValidationResult } from './plugin-validator.js';

export interface PluginEntry {
  module: PluginModule;
  enabled: boolean;
  loadedAt: number;
  /** Set when registration validation fails */
  error?: string;
}

export class PluginRegistry {
  private plugins: Map<string, PluginEntry> = new Map();

  /**
   * Register a PluginModule after full validation.
   * Throws if the plugin name is already registered.
   */
  register(mod: PluginModule): PluginValidationResult {
    if (this.plugins.has(mod.name)) {
      throw new Error(`Plugin "${mod.name}" is already registered`);
    }

    const result = validateAll(mod);
    const entry: PluginEntry = {
      module: mod,
      enabled: result.valid,
      loadedAt: Date.now(),
      error: result.valid ? undefined : result.errors.join('; '),
    };

    this.plugins.set(mod.name, entry);

    if (result.valid) {
      logger.info(`Plugin registered and enabled: ${mod.name}@${mod.version}`, 'PluginRegistry');
    } else {
      logger.warn(
        `Plugin registered with errors: ${mod.name} — ${entry.error}`,
        'PluginRegistry',
      );
    }

    return result;
  }

  /** Enable a previously registered plugin by name. */
  enable(name: string): void {
    const entry = this.requireEntry(name);
    if (entry.enabled) return;
    entry.enabled = true;
    logger.info(`Plugin enabled: ${name}`, 'PluginRegistry');
  }

  /** Disable a plugin without removing it from the registry. */
  disable(name: string): void {
    const entry = this.requireEntry(name);
    if (!entry.enabled) return;
    entry.enabled = false;
    logger.info(`Plugin disabled: ${name}`, 'PluginRegistry');
  }

  /** Retrieve a single PluginEntry by name, or undefined if not found. */
  getPlugin(name: string): PluginEntry | undefined {
    return this.plugins.get(name);
  }

  /** List all registered plugins with their current status. */
  listPlugins(): ReadonlyArray<{
    name: string;
    version: string;
    description: string;
    enabled: boolean;
    loadedAt: number;
    error?: string;
  }> {
    return [...this.plugins.values()].map(e => ({
      name: e.module.name,
      version: e.module.version,
      description: e.module.description,
      enabled: e.enabled,
      loadedAt: e.loadedAt,
      error: e.error,
    }));
  }

  /**
   * Instantiate a strategy from an enabled plugin.
   * Throws if the plugin is not found or is disabled.
   */
  createStrategy(name: string): RunnableStrategy {
    const entry = this.requireEntry(name);
    if (!entry.enabled) {
      throw new Error(`Plugin "${name}" is disabled — enable it before creating a strategy`);
    }
    return entry.module.createStrategy();
  }

  /**
   * Convenience: load all .js files from dirPath, validate, and register.
   * Returns a summary of each file's outcome.
   */
  async loadAndRegisterAll(dirPath: string): Promise<
    Array<{
      file: string;
      name?: string;
      success: boolean;
      error?: string;
    }>
  > {
    const loaded = await loadPluginsFromDir(dirPath);

    return loaded.map(({ file, result }) => {
      if (result instanceof PluginLoadError) {
        logger.warn(`Failed to load plugin ${file}: ${result.reason}`, 'PluginRegistry');
        return { file, success: false, error: result.message };
      }

      try {
        const validation = this.register(result);
        return {
          file,
          name: result.name,
          success: validation.valid,
          error: validation.valid ? undefined : validation.errors.join('; '),
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn(`Could not register plugin ${file}: ${msg}`, 'PluginRegistry');
        return { file, name: result.name, success: false, error: msg };
      }
    });
  }

  private requireEntry(name: string): PluginEntry {
    const entry = this.plugins.get(name);
    if (!entry) throw new Error(`Plugin "${name}" not found in registry`);
    return entry;
  }
}
