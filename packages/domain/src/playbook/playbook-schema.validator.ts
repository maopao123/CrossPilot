import { ErrorCodes } from '@crosspilot/shared';
import type { PlaybookJsonSchema } from '@crosspilot/shared';
import { PlaybookError } from './playbook.types.js';

const ALLOWED_TYPES = new Set(['string', 'number', 'boolean', 'object', 'array']);

export function assertPlaybookJsonSchema(schema: unknown, label: string): PlaybookJsonSchema {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new PlaybookError(
      ErrorCodes.PLAYBOOK_SCHEMA_INVALID,
      `${label} must be a JSON object schema`,
    );
  }
  const candidate = schema as Record<string, unknown>;
  if (candidate.type !== 'object') {
    throw new PlaybookError(
      ErrorCodes.PLAYBOOK_SCHEMA_INVALID,
      `${label} type must be "object"`,
    );
  }
  if (!candidate.properties || typeof candidate.properties !== 'object' || Array.isArray(candidate.properties)) {
    throw new PlaybookError(
      ErrorCodes.PLAYBOOK_SCHEMA_INVALID,
      `${label} properties must be an object`,
    );
  }
  const properties = candidate.properties as Record<string, unknown>;
  for (const [key, value] of Object.entries(properties)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new PlaybookError(
        ErrorCodes.PLAYBOOK_SCHEMA_INVALID,
        `${label} property "${key}" is invalid`,
      );
    }
    const type = (value as { type?: unknown }).type;
    if (typeof type !== 'string' || !ALLOWED_TYPES.has(type)) {
      throw new PlaybookError(
        ErrorCodes.PLAYBOOK_SCHEMA_INVALID,
        `${label} property "${key}" has unsupported type`,
      );
    }
  }
  const required = candidate.required;
  if (required !== undefined) {
    if (!Array.isArray(required) || required.some((item) => typeof item !== 'string')) {
      throw new PlaybookError(
        ErrorCodes.PLAYBOOK_SCHEMA_INVALID,
        `${label} required must be a string array`,
      );
    }
    for (const key of required) {
      if (!(key in properties)) {
        throw new PlaybookError(
          ErrorCodes.PLAYBOOK_SCHEMA_INVALID,
          `${label} required key "${key}" is missing from properties`,
        );
      }
    }
  }
  return schema as PlaybookJsonSchema;
}

export function jsonTypeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

export function validateAgainstSchema(
  data: unknown,
  schema: PlaybookJsonSchema,
): { ok: true } | { ok: false; message: string } {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, message: 'payload must be an object' };
  }
  const payload = data as Record<string, unknown>;
  for (const key of schema.required ?? []) {
    if (payload[key] === undefined) {
      return { ok: false, message: `missing required field: ${key}` };
    }
  }
  for (const [key, spec] of Object.entries(schema.properties)) {
    if (payload[key] === undefined) continue;
    const actual = jsonTypeOf(payload[key]);
    if (actual !== spec.type) {
      return { ok: false, message: `field "${key}" expected ${spec.type}, got ${actual}` };
    }
  }
  return { ok: true };
}
