import { describe, expect, test } from 'vitest';
import { parseSkillFrontmatter, resolveCompatibility } from './registry';

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

  test('rejects unterminated frontmatter as an actionable error', () => {
    const parsed = parseSkillFrontmatter('---\nname: fixture\ncompatibility: [codex');
    expect(parsed?.frontmatterError).toContain('missing closing --- delimiter');
    expect(parsed?.hasCompatibility).toBe(true);
  });

  test('source compatibility overrides stale registry compatibility', () => {
    expect(resolveCompatibility(
      { compatibility: ['codex'] },
      parseSkillFrontmatter('---\ncompatibility: [claude]\n---\n'),
    )).toMatchObject({ hasCompatibility: true, compatibility: ['claude'] });
  });

  test('invalid source compatibility overrides valid registry compatibility', () => {
    const resolved = resolveCompatibility(
      { compatibility: ['codex'] },
      parseSkillFrontmatter('---\ncompatibility: [claude-code]\n---\n'),
    );
    expect(resolved).toMatchObject({ hasCompatibility: true, compatibility: ['claude-code'] });
  });

  test('source frontmatter errors override registry compatibility', () => {
    const resolved = resolveCompatibility(
      { compatibility: ['codex'] },
      parseSkillFrontmatter('---\ncompatibility: [codex'),
    );
    expect(resolved.frontmatterError).toContain('missing closing --- delimiter');
    expect(resolved.hasCompatibility).toBe(true);
    expect(resolved.compatibility).toBeUndefined();
  });
});
