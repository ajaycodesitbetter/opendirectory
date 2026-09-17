import { describe, expect, test } from 'vitest';
import { parseFrontmatter } from './frontmatter';

describe('parseFrontmatter delimiters', () => {
  test.each([
    ['LF', '---\n---\n# Body'],
    ['CRLF', '---\r\n---\r\n# Body'],
  ])('accepts zero-content frontmatter with %s line endings', (_label, source) => {
    expect(parseFrontmatter(source)).toEqual({ data: {}, content: '# Body' });
  });

  test('distinguishes an unterminated frontmatter block', () => {
    expect(() => parseFrontmatter('---\nname: fixture\n# Body')).toThrow(
      'Invalid YAML frontmatter: missing closing --- delimiter.',
    );
  });
});
