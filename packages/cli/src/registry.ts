import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parseFrontmatter } from './frontmatter';
import { parseCompatibility } from './compat';
import { findSkillSource } from './skill-discovery';

export interface Skill {
  name: string;
  description: string;
  tags: string[];
  author: string;
  version: string;
  path: string;
  compatibility?: unknown;
  /** Distinguishes an omitted key from an explicit null, scalar, or empty list. */
  hasCompatibility?: boolean;
  /** Preserves frontmatter parse failures so malformed skills cannot become universal. */
  frontmatterError?: string;
}

const getProjectRoot = () => path.resolve(__dirname, '..');

async function parseSkillMd(skillDir: string): Promise<Partial<Skill> | null> {
  try {
    const source = await findSkillSource(skillDir);
    if (!source) return null;
    const content = await fs.readFile(source.skillMdPath, 'utf-8');
    return parseSkillFrontmatter(content) ?? {};
  } catch {
    return null;
  }
}

export function parseSkillFrontmatter(content: string): Partial<Skill> | null {
  let source: Record<string, unknown>;
  try {
    source = parseFrontmatter(content).data;
  } catch (error) {
    return {
      frontmatterError: error instanceof Error ? error.message : String(error),
      hasCompatibility: true,
    };
  }
  if (Object.keys(source).length === 0 && !content.startsWith('---')) return null;
  const result: Partial<Skill> = {};
  if (typeof source.description === 'string') result.description = source.description;
  if (typeof source.author === 'string') result.author = source.author;
  if (typeof source.version === 'string') result.version = source.version;
  if (Array.isArray(source.tags)) result.tags = source.tags.filter((tag): tag is string => typeof tag === 'string');
  if (Object.prototype.hasOwnProperty.call(source, 'compatibility')) {
    result.hasCompatibility = true;
    result.compatibility = source.compatibility;
  }
  return result;
}

export function resolveCompatibility(
  fromRegistry: Record<string, unknown> | undefined,
  fromFrontmatter: Partial<Skill> | null,
): Pick<Skill, 'compatibility' | 'hasCompatibility' | 'frontmatterError'> {
  const localHasCompatibility = fromFrontmatter?.hasCompatibility === true;
  const frontmatterError = fromFrontmatter?.frontmatterError;
  const hasLocalSource = fromFrontmatter !== null;
  const registryHasCompatibility = hasOwn(fromRegistry, 'compatibility');
  const hasCompatibility = hasLocalSource
    ? localHasCompatibility || Boolean(frontmatterError)
    : registryHasCompatibility;
  const rawCompatibility = hasLocalSource
    ? fromFrontmatter?.compatibility
    : fromRegistry?.compatibility;
  const compatibilityResult = parseCompatibility(rawCompatibility, hasCompatibility);

  return {
    compatibility: compatibilityResult.ok && hasCompatibility
      ? compatibilityResult.targets
      : rawCompatibility,
    ...(hasCompatibility && { hasCompatibility }),
    ...(frontmatterError && { frontmatterError }),
  };
}

export async function loadRegistry(): Promise<Skill[]> {
  const root = getProjectRoot();
  const registryPath = path.join(root, 'registry.json');
  const skillsDir = path.join(root, 'skills');

  const registryMap = new Map<string, any>();
  try {
    const registryContent = await fs.readFile(registryPath, 'utf-8');
    const registryArray = JSON.parse(registryContent);
    for (const entry of registryArray) {
      if (entry?.name) registryMap.set(entry.name, entry);
    }
  } catch {}

  let diskEntries: { name: string; dir: string }[] = [];
  try {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });
    diskEntries = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
      .map(e => ({ name: e.name, dir: path.join(skillsDir, e.name) }));
  } catch {}

  const skills: Skill[] = [];
  const seen = new Set<string>();

  for (const { name, dir } of diskEntries) {
    seen.add(name);
    const fromRegistry = registryMap.get(name);
    const fromFrontmatter = await parseSkillMd(dir);
    const resolvedCompatibility = resolveCompatibility(fromRegistry, fromFrontmatter);
    skills.push({
      name,
      description: cleanDescription(fromRegistry?.description || fromFrontmatter?.description || `Skill: ${name}`),
      tags: Array.isArray(fromRegistry?.tags) ? fromRegistry.tags : (fromFrontmatter?.tags ?? []),
      author: fromRegistry?.author || fromFrontmatter?.author || 'OpenDirectory',
      version: fromRegistry?.version || fromFrontmatter?.version || 'unknown',
      path: fromRegistry?.path || `skills/${name}`,
      ...resolvedCompatibility,
    });
  }

  skills.sort((a, b) => a.name.localeCompare(b.name));
  return skills;
}

function hasOwn(value: unknown, key: string): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.prototype.hasOwnProperty.call(value, key);
}

function cleanDescription(desc: string): string {
  return desc
    .replace(/<img[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getAllTags(skills: Skill[]): string[] {
  const tags = new Set<string>();
  for (const skill of skills) {
    for (const tag of skill.tags) {
      tags.add(tag);
    }
  }
  return Array.from(tags).sort();
}

export function filterByTags(skills: Skill[], tags: string[]): Skill[] {
  if (!tags || tags.length === 0) return skills;
  return skills.filter(skill =>
    skill.tags.some(tag => tags.includes(tag))
  );
}
