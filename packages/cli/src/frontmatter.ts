import { parseDocument } from 'yaml';

export interface FrontmatterDocument {
  data: Record<string, unknown>;
  content: string;
}

const FRONTMATTER_PATTERN = /^---[^\S\r\n]*\r?\n([\s\S]*?)\r?\n---[^\S\r\n]*(?:\r?\n|$)/;
const FRONTMATTER_OPENING_PATTERN = /^---[^\S\r\n]*(?:\r?\n|$)/;

export function parseFrontmatter(source: string): FrontmatterDocument {
  const cleaned = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const match = FRONTMATTER_PATTERN.exec(cleaned);
  if (!match) {
    if (FRONTMATTER_OPENING_PATTERN.test(cleaned)) {
      throw new TypeError('Invalid YAML frontmatter: missing closing --- delimiter.');
    }
    return { data: {}, content: cleaned };
  }

  const document = parseDocument(match[1]);
  if (document.errors.length > 0) {
    throw new TypeError(`Invalid YAML frontmatter: ${document.errors[0].message}`);
  }

  const parsed = document.toJS();
  if (parsed == null) return { data: {}, content: cleaned.slice(match[0].length) };
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('Frontmatter must be a YAML mapping.');
  }

  return {
    data: parsed as Record<string, unknown>,
    content: cleaned.slice(match[0].length),
  };
}
