import { describe, expect, test } from 'vitest';
import { parseFrontmatter } from './frontmatter';

describe('parseFrontmatter delimiters', () => {
  test.each([
    ['LF', '---\n\n---\n# Body'],
    ['CRLF', '---\r\n\r\n---\r\n# Body'],
  ])('accepts zero-content frontmatter with %s line endings', (_label, source) => {
    expect(parseFrontmatter(source)).toEqual({ data: {}, content: '# Body' });
  });

  test.each([
    ['LF', '---\ncompatibility: [codex]\n---\n# Body'],
    ['CRLF', '---\r\ncompatibility: [codex]\r\n---\r\n# Body'],
  ])('accepts well-formed compatibility frontmatter with %s line endings', (_label, source) => {
    expect(parseFrontmatter(source)).toEqual({
      data: { compatibility: ['codex'] },
      content: '# Body',
    });
  });

  test('rejects an inline closing delimiter as unterminated frontmatter', () => {
    expect(() => parseFrontmatter('---\ncompatibility: [codex]---\n# Body')).toThrow(
      'Invalid YAML frontmatter: missing closing --- delimiter.',
    );
  });

  test('distinguishes an unterminated frontmatter block', () => {
    expect(() => parseFrontmatter('---\nname: fixture\n# Body')).toThrow(
      'Invalid YAML frontmatter: missing closing --- delimiter.',
    );
  });
});
