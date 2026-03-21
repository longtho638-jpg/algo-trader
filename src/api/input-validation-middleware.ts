/**
 * Lightweight input validation utility for JSON request bodies.
 * No external dependencies — pure TypeScript with schema-driven rules.
 */

export interface ValidationRule {
  field: string;
  type: 'string' | 'number' | 'boolean';
  required?: boolean;
  maxLength?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Strip control characters and trim whitespace from a string.
 */
export function sanitizeString(input: string): string {
  // Remove ASCII control chars (0x00–0x1F, 0x7F) except tab/newline
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}

/**
 * Validate a parsed JSON body against a list of rules.
 * Returns { valid, errors } — errors is empty when valid === true.
 */
export function validateBody(
  body: Record<string, unknown>,
  rules: ValidationRule[],
): ValidationResult {
  const errors: string[] = [];

  for (const rule of rules) {
    const value = body[rule.field];
    const missing = value === undefined || value === null;

    if (missing) {
      if (rule.required) {
        errors.push(`Field '${rule.field}' is required`);
      }
      // Skip further checks when field is absent and not required
      continue;
    }

    // Type check
    if (typeof value !== rule.type) {
      errors.push(`Field '${rule.field}' must be of type ${rule.type}, got ${typeof value}`);
      continue;
    }

    // String-specific checks
    if (rule.type === 'string' && typeof value === 'string') {
      if (rule.maxLength !== undefined && value.length > rule.maxLength) {
        errors.push(`Field '${rule.field}' exceeds max length of ${rule.maxLength}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
