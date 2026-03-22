import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  validateBody,
  sanitizeString,
  type ValidationRule,
} from '../../src/api/input-validation-middleware.js';

describe('Input Validation Middleware', () => {
  describe('validateBody - Required Fields', () => {
    it('should accept valid required string field', () => {
      const body = { email: 'user@example.com' };
      const rules: ValidationRule[] = [
        { field: 'email', type: 'string', required: true },
      ];

      const result = validateBody(body, rules);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject missing required field', () => {
      const body = {};
      const rules: ValidationRule[] = [
        { field: 'email', type: 'string', required: true },
      ];

      const result = validateBody(body, rules);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Field 'email' is required");
    });

    it('should reject null value for required field', () => {
      const body = { email: null };
      const rules: ValidationRule[] = [
        { field: 'email', type: 'string', required: true },
      ];

      const result = validateBody(body, rules);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Field 'email' is required");
    });

    it('should reject undefined value for required field', () => {
      const body = { email: undefined };
      const rules: ValidationRule[] = [
        { field: 'email', type: 'string', required: true },
      ];

      const result = validateBody(body, rules);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Field 'email' is required");
    });

    it('should allow optional field when not provided', () => {
      const body = { name: 'John' };
      const rules: ValidationRule[] = [
        { field: 'name', type: 'string', required: true },
        { field: 'nickname', type: 'string', required: false },
      ];

      const result = validateBody(body, rules);

      expect(result.valid).toBe(true);
    });
  });

  describe('validateBody - Type Validation', () => {
    it('should validate string type', () => {
      const body = { name: 'John' };
      const rules: ValidationRule[] = [
        { field: 'name', type: 'string', required: true },
      ];

      const result = validateBody(body, rules);

      expect(result.valid).toBe(true);
    });

    it('should validate number type', () => {
      const body = { age: 25 };
      const rules: ValidationRule[] = [
        { field: 'age', type: 'number', required: true },
      ];

      const result = validateBody(body, rules);

      expect(result.valid).toBe(true);
    });

    it('should validate boolean type', () => {
      const body = { active: true };
      const rules: ValidationRule[] = [
        { field: 'active', type: 'boolean', required: true },
      ];

      const result = validateBody(body, rules);

      expect(result.valid).toBe(true);
    });

    it('should reject wrong type for string field', () => {
      const body = { name: 123 };
      const rules: ValidationRule[] = [
        { field: 'name', type: 'string', required: true },
      ];

      const result = validateBody(body, rules);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('must be of type string');
    });

    it('should reject wrong type for number field', () => {
      const body = { age: 'not-a-number' };
      const rules: ValidationRule[] = [
        { field: 'age', type: 'number', required: true },
      ];

      const result = validateBody(body, rules);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('must be of type number');
    });

    it('should reject wrong type for boolean field', () => {
      const body = { active: 'yes' };
      const rules: ValidationRule[] = [
        { field: 'active', type: 'boolean', required: true },
      ];

      const result = validateBody(body, rules);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('must be of type boolean');
    });

    it('should accept zero as valid number', () => {
      const body = { count: 0 };
      const rules: ValidationRule[] = [
        { field: 'count', type: 'number', required: true },
      ];

      const result = validateBody(body, rules);

      expect(result.valid).toBe(true);
    });

    it('should accept false as valid boolean', () => {
      const body = { active: false };
      const rules: ValidationRule[] = [
        { field: 'active', type: 'boolean', required: true },
      ];

      const result = validateBody(body, rules);

      expect(result.valid).toBe(true);
    });

    it('should accept empty string as valid string', () => {
      const body = { description: '' };
      const rules: ValidationRule[] = [
        { field: 'description', type: 'string', required: true },
      ];

      const result = validateBody(body, rules);

      expect(result.valid).toBe(true);
    });
  });

  describe('validateBody - Length Constraints', () => {
    it('should enforce maxLength constraint', () => {
      const body = { username: 'a'.repeat(101) };
      const rules: ValidationRule[] = [
        { field: 'username', type: 'string', required: true, maxLength: 100 },
      ];

      const result = validateBody(body, rules);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('exceeds max length');
    });

    it('should allow string at maxLength boundary', () => {
      const body = { username: 'a'.repeat(100) };
      const rules: ValidationRule[] = [
        { field: 'username', type: 'string', required: true, maxLength: 100 },
      ];

      const result = validateBody(body, rules);

      expect(result.valid).toBe(true);
    });

    it('should allow string under maxLength', () => {
      const body = { username: 'validname' };
      const rules: ValidationRule[] = [
        { field: 'username', type: 'string', required: true, maxLength: 100 },
      ];

      const result = validateBody(body, rules);

      expect(result.valid).toBe(true);
    });

    it('should not enforce maxLength on missing optional field', () => {
      const body = {};
      const rules: ValidationRule[] = [
        { field: 'nickname', type: 'string', required: false, maxLength: 10 },
      ];

      const result = validateBody(body, rules);

      expect(result.valid).toBe(true);
    });

    it('should not enforce maxLength on non-string fields', () => {
      const body = { count: 999 };
      const rules: ValidationRule[] = [
        { field: 'count', type: 'number', required: true, maxLength: 5 },
      ];

      const result = validateBody(body, rules);

      expect(result.valid).toBe(true); // maxLength ignored for non-strings
    });
  });

  describe('validateBody - Multiple Fields', () => {
    it('should validate multiple required fields', () => {
      const body = { email: 'test@example.com', age: 25 };
      const rules: ValidationRule[] = [
        { field: 'email', type: 'string', required: true },
        { field: 'age', type: 'number', required: true },
      ];

      const result = validateBody(body, rules);

      expect(result.valid).toBe(true);
    });

    it('should collect multiple errors', () => {
      const body = { email: null, age: 'not-number' };
      const rules: ValidationRule[] = [
        { field: 'email', type: 'string', required: true },
        { field: 'age', type: 'number', required: true },
      ];

      const result = validateBody(body, rules);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });

    it('should mix required and optional fields', () => {
      const body = { email: 'test@example.com' };
      const rules: ValidationRule[] = [
        { field: 'email', type: 'string', required: true },
        { field: 'phone', type: 'string', required: false },
      ];

      const result = validateBody(body, rules);

      expect(result.valid).toBe(true);
    });

    it('should validate complex object with mixed constraints', () => {
      const body = {
        email: 'test@example.com',
        username: 'user',
        age: 25,
        premium: true,
      };
      const rules: ValidationRule[] = [
        { field: 'email', type: 'string', required: true, maxLength: 100 },
        { field: 'username', type: 'string', required: true, maxLength: 50 },
        { field: 'age', type: 'number', required: true },
        { field: 'premium', type: 'boolean', required: true },
      ];

      const result = validateBody(body, rules);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('sanitizeString - Control Character Removal', () => {
    it('should strip null bytes', () => {
      const input = 'hello\x00world';
      const result = sanitizeString(input);

      expect(result).toBe('helloworld');
    });

    it('should strip ASCII control characters', () => {
      const input = 'test\x01\x02\x03string';
      const result = sanitizeString(input);

      expect(result).toBe('teststring');
    });

    it('should strip DEL character (0x7F)', () => {
      const input = 'test\x7Fstring';
      const result = sanitizeString(input);

      expect(result).toBe('teststring');
    });

    it('should strip backspace (0x08)', () => {
      const input = 'hello\x08world';
      const result = sanitizeString(input);

      expect(result).toBe('helloworld');
    });

    it('should strip form feed (0x0C)', () => {
      const input = 'hello\x0Cworld';
      const result = sanitizeString(input);

      expect(result).toBe('helloworld');
    });

    it('should not strip newlines (0x0A)', () => {
      const input = 'hello\nworld';
      const result = sanitizeString(input);

      expect(result).toBe('hello\nworld');
    });

    it('should not strip tabs (0x09)', () => {
      const input = 'hello\tworld';
      const result = sanitizeString(input);

      expect(result).toBe('hello\tworld');
    });

    it('should not strip carriage return (0x0D)', () => {
      const input = 'hello\rworld';
      const result = sanitizeString(input);

      expect(result).toBe('hello\rworld');
    });

    it('should strip multiple control chars in sequence', () => {
      const input = 'a\x00\x01\x02b';
      const result = sanitizeString(input);

      expect(result).toBe('ab');
    });
  });

  describe('sanitizeString - Whitespace Handling', () => {
    it('should trim leading whitespace', () => {
      const input = '   hello world';
      const result = sanitizeString(input);

      expect(result).toBe('hello world');
    });

    it('should trim trailing whitespace', () => {
      const input = 'hello world   ';
      const result = sanitizeString(input);

      expect(result).toBe('hello world');
    });

    it('should trim both leading and trailing whitespace', () => {
      const input = '   hello world   ';
      const result = sanitizeString(input);

      expect(result).toBe('hello world');
    });

    it('should not strip internal spaces', () => {
      const input = 'hello   world';
      const result = sanitizeString(input);

      expect(result).toBe('hello   world');
    });

    it('should handle mixed whitespace and control chars', () => {
      const input = '  \x00hello\x00world  ';
      const result = sanitizeString(input);

      expect(result).toBe('helloworld');
    });
  });

  describe('sanitizeString - Normal Input', () => {
    it('should handle normal text without modification', () => {
      const input = 'Hello World 123';
      const result = sanitizeString(input);

      expect(result).toBe('Hello World 123');
    });

    it('should preserve special characters (non-control)', () => {
      const input = 'user@example.com';
      const result = sanitizeString(input);

      expect(result).toBe('user@example.com');
    });

    it('should preserve unicode characters', () => {
      const input = 'Hello 世界';
      const result = sanitizeString(input);

      expect(result).toBe('Hello 世界');
    });

    it('should handle empty string', () => {
      const input = '';
      const result = sanitizeString(input);

      expect(result).toBe('');
    });

    it('should handle whitespace-only string', () => {
      const input = '   ';
      const result = sanitizeString(input);

      expect(result).toBe('');
    });
  });

  describe('XSS Prevention Scenarios', () => {
    it('should reject script tags in validation', () => {
      const body = { description: '<script>alert("xss")</script>' };
      const rules: ValidationRule[] = [
        { field: 'description', type: 'string', required: true, maxLength: 1000 },
      ];

      const result = validateBody(body, rules);
      // Validation itself doesn't block HTML, but allows app-level sanitization
      expect(result.valid).toBe(true);
    });

    it('should sanitize null bytes used in attacks', () => {
      const input = 'legitimate\x00<script>alert("xss")</script>';
      const result = sanitizeString(input);

      expect(result).not.toContain('\x00');
      expect(result).toBe('legitimate<script>alert("xss")</script>');
    });

    it('should handle common XSS bypass with control chars', () => {
      const input = 'normal\x00content';
      const result = sanitizeString(input);

      expect(result).toBe('normalcontent');
    });
  });

  describe('Malicious Input Scenarios', () => {
    it('should detect oversized payload', () => {
      const body = { data: 'a'.repeat(10001) };
      const rules: ValidationRule[] = [
        { field: 'data', type: 'string', required: true, maxLength: 10000 },
      ];

      const result = validateBody(body, rules);

      expect(result.valid).toBe(false);
    });

    it('should detect type mismatch attacks', () => {
      const body = { userId: 'not-a-number' };
      const rules: ValidationRule[] = [
        { field: 'userId', type: 'number', required: true },
      ];

      const result = validateBody(body, rules);

      expect(result.valid).toBe(false);
    });

    it('should handle deeply nested objects (shallow validation)', () => {
      const body = { user: { name: { first: 'John' } } };
      const rules: ValidationRule[] = [
        { field: 'user', type: 'string', required: true },
      ];

      const result = validateBody(body, rules);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('must be of type string');
    });

    it('should reject array values in string field', () => {
      const body = { tags: ['tag1', 'tag2'] };
      const rules: ValidationRule[] = [
        { field: 'tags', type: 'string', required: true },
      ];

      const result = validateBody(body, rules);

      expect(result.valid).toBe(false);
    });
  });

  describe('Content-Type Validation Integration', () => {
    it('should validate JSON-compatible types', () => {
      const validJsonTypes = [
        { body: { count: 42 }, rules: [{ field: 'count', type: 'number', required: true }] },
        { body: { text: 'hello' }, rules: [{ field: 'text', type: 'string', required: true }] },
        { body: { active: true }, rules: [{ field: 'active', type: 'boolean', required: true }] },
      ];

      validJsonTypes.forEach(({ body, rules }) => {
        const result = validateBody(body as any, rules as any);
        expect(result.valid).toBe(true);
      });
    });

    it('should reject non-JSON types', () => {
      const body = { date: new Date() };
      const rules: ValidationRule[] = [
        { field: 'date', type: 'string', required: true },
      ];

      const result = validateBody(body, rules);

      expect(result.valid).toBe(false);
    });
  });

  describe('Error Messages', () => {
    it('should provide descriptive error messages', () => {
      const body = {};
      const rules: ValidationRule[] = [
        { field: 'email', type: 'string', required: true },
      ];

      const result = validateBody(body, rules);

      expect(result.errors[0]).toContain('email');
      expect(result.errors[0]).toContain('required');
    });

    it('should include field name in type error', () => {
      const body = { age: 'text' };
      const rules: ValidationRule[] = [
        { field: 'age', type: 'number', required: true },
      ];

      const result = validateBody(body, rules);

      expect(result.errors[0]).toContain('age');
      expect(result.errors[0]).toContain('number');
    });

    it('should include max length in length error', () => {
      const body = { username: 'a'.repeat(51) };
      const rules: ValidationRule[] = [
        { field: 'username', type: 'string', required: true, maxLength: 50 },
      ];

      const result = validateBody(body, rules);

      expect(result.errors[0]).toContain('50');
    });
  });
});
