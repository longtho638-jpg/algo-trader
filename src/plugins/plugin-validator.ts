// Plugin validator: structural and basic security checks on loaded plugin modules
import type { RunnableStrategy } from '../engine/strategy-runner.js';
import type { PluginModule } from './plugin-loader.js';

export interface PluginValidationResult {
  valid: boolean;
  errors: string[];
}

/** Strategy interface methods that must be present and callable */
const STRATEGY_METHODS: ReadonlyArray<keyof RunnableStrategy> = ['start', 'stop', 'getStatus'];

/** Patterns that suggest dangerous filesystem or network access inside plugin source */
const DANGEROUS_PATTERNS: ReadonlyArray<RegExp> = [
  /\brequire\s*\(\s*['"]fs['"]/,
  /\brequire\s*\(\s*['"]child_process['"]/,
  /\bimport\s+.*\bfs\b/,
  /\bimport\s+.*\bchild_process\b/,
  /\bfetch\s*\(/,
  /\bxmlhttprequest\b/i,
  /\beval\s*\(/,
  /\bnew\s+Function\s*\(/,
];

/**
 * Check that all listed methods exist on obj and are functions.
 * Returns array of error messages (empty = all good).
 */
export function checkMethodSignatures(
  obj: Record<string, unknown>,
  methods: ReadonlyArray<string>,
): string[] {
  return methods.flatMap(method => {
    if (!(method in obj)) return [`Missing method: "${method}"`];
    if (typeof obj[method] !== 'function') return [`"${method}" must be a function`];
    return [];
  });
}

/**
 * Validate PluginModule shape: name/version/description strings + createStrategy function.
 */
export function validatePlugin(mod: unknown): PluginValidationResult {
  const errors: string[] = [];

  if (typeof mod !== 'object' || mod === null) {
    return { valid: false, errors: ['Plugin module must be a non-null object'] };
  }

  const m = mod as Record<string, unknown>;

  if (typeof m['name'] !== 'string' || m['name'].trim() === '') {
    errors.push('"name" must be a non-empty string');
  }
  if (typeof m['version'] !== 'string' || m['version'].trim() === '') {
    errors.push('"version" must be a non-empty string');
  }
  if (typeof m['description'] !== 'string') {
    errors.push('"description" must be a string');
  }
  if (typeof m['createStrategy'] !== 'function') {
    errors.push('"createStrategy" must be a function');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate that a strategy object implements the RunnableStrategy interface.
 */
export function validateStrategy(strategy: unknown): PluginValidationResult {
  const errors: string[] = [];

  if (typeof strategy !== 'object' || strategy === null) {
    return { valid: false, errors: ['Strategy must be a non-null object'] };
  }

  const methodErrors = checkMethodSignatures(
    strategy as Record<string, unknown>,
    STRATEGY_METHODS as ReadonlyArray<string>,
  );
  errors.push(...methodErrors);

  return { valid: errors.length === 0, errors };
}

/**
 * Basic static security scan on PluginModule.
 * Serialises createStrategy to string and checks for dangerous patterns.
 * Not a replacement for sandboxing — catches obvious violations only.
 */
export function securityScan(mod: PluginModule): PluginValidationResult {
  const errors: string[] = [];
  const src = mod.createStrategy.toString();

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(src)) {
      errors.push(`Security: suspicious pattern detected — ${pattern.source}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Full validation pipeline: shape check + strategy interface + security scan.
 */
export function validateAll(mod: PluginModule): PluginValidationResult {
  const shapeResult = validatePlugin(mod);
  if (!shapeResult.valid) return shapeResult;

  const errors: string[] = [];

  // Instantiate strategy to check its interface
  let strategy: unknown;
  try {
    strategy = mod.createStrategy();
  } catch (err) {
    return {
      valid: false,
      errors: [`createStrategy() threw: ${err instanceof Error ? err.message : String(err)}`],
    };
  }

  const stratResult = validateStrategy(strategy);
  errors.push(...stratResult.errors);

  const secResult = securityScan(mod);
  errors.push(...secResult.errors);

  return { valid: errors.length === 0, errors };
}
