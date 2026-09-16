import { describe, expect, test } from 'vitest';
import { parseSkillFrontmatter } from './registry';

function parse(compatibility: string) {
  return parseSkillFrontmatter(`---\nname: fixture\ndescription: fixture\ncompatibility: ${compatibility}\n---\n`);
}

describe('parseSkillFrontmatter compatibility representation', () => {
  test.each([
    ['[codex, 1]', ['codex', 1]],
    ['[codex, null]', ['codex', null]],
    ['codex', 'codex'],
    ['[]', []],
  ])('preserves explicit %s without stringifying it', (source, expected) => {
    const parsed = parse(source);
    expect(parsed).toMatchObject({ hasCompatibility: true, compatibility: expected });
  });

  test('distinguishes an absent compatibility key', () => {
    const parsed = parseSkillFrontmatter('---\nname: fixture\ndescription: fixture\n---\n');
    expect(parsed?.hasCompatibility).toBeUndefined();
  });

  test('preserves malformed YAML as an actionable frontmatter error', () => {
    const parsed = parseSkillFrontmatter('---\nname: fixture\ndescription: fixture\ncompatibility: [codex\n---\n');
    expect(parsed?.frontmatterError).toContain('Invalid YAML frontmatter:');
    expect(parsed?.hasCompatibility).toBe(true);
  });
});
