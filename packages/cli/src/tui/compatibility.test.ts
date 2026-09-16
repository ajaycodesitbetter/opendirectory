import { describe, expect, test } from 'vitest';
import { getSkillAvailability } from './compatibility';
import { targetForSelection } from './browse';
import type { Skill } from '../registry';

const skill = (name: string, compatibility?: unknown, hasCompatibility = false): Skill => ({
  name,
  description: name,
  tags: [],
  author: 'test',
  version: '1.0.0',
  path: `skills/${name}`,
  ...(hasCompatibility && { compatibility, hasCompatibility }),
});

describe('getSkillAvailability', () => {
  test('filters incompatible and invalid explicit declarations before selection', () => {
    const result = getSkillAvailability([
      skill('universal'),
      skill('codex-only', ['codex'], true),
      skill('claude-only', ['claude'], true),
      skill('invalid-alias', ['claude-code'], true),
    ], ' CODEX ');

    expect(result.available.map(item => item.name)).toEqual(['universal', 'codex-only']);
    expect(result.unavailable.map(item => item.name)).toEqual(['claude-only', 'invalid-alias']);
  });
});

test('preserves an explicitly requested target when returning to selection', () => {
  expect(targetForSelection('claude', 'codex')).toBe('claude');
  expect(targetForSelection(undefined, 'codex')).toBe('codex');
});
