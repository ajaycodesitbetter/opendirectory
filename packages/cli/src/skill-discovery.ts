import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import { inspectSkillFrontmatter, type SkillFrontmatterDocument } from './frontmatter';

export interface SkillSource {
  skillDir: string;
  skillMdPath: string;
}

export interface LoadedSkillSource extends SkillSource {
  frontmatter: SkillFrontmatterDocument;
}

export type SkillFileReader = (skillMdPath: string) => Promise<string>;

/** Maximum directory depth below a skill root at which SKILL.md may be found. */
export const MAX_SKILL_SOURCE_DEPTH = 4;

const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules']);

/** Finds the same deterministic SKILL.md location used by runtime and tooling. */
export async function findSkillSource(repoDir: string): Promise<SkillSource | null> {
  return findSkillSourceAsync(repoDir, 0);
}

async function findSkillSourceAsync(dir: string, depth: number): Promise<SkillSource | null> {
  const direct = await sourceAt(dir);
  if (direct) return direct;
  if (depth >= MAX_SKILL_SOURCE_DEPTH) return null;

  let entries: fsSync.Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }

  const directories = entries
    .filter(entry => entry.isDirectory() && !IGNORED_DIRECTORIES.has(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of directories) {
    const source = await findSkillSourceAsync(path.join(dir, entry.name), depth + 1);
    if (source) return source;
  }
  return null;
}

export function findSkillSourceSync(repoDir: string): SkillSource | null {
  return findSkillSourceSyncAt(repoDir, 0);
}

function findSkillSourceSyncAt(dir: string, depth: number): SkillSource | null {
  const direct = sourceAtSync(dir);
  if (direct) return direct;
  if (depth >= MAX_SKILL_SOURCE_DEPTH) return null;

  let entries: fsSync.Dirent[];
  try {
    entries = fsSync.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }

  const directories = entries
    .filter(entry => entry.isDirectory() && !IGNORED_DIRECTORIES.has(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of directories) {
    const source = findSkillSourceSyncAt(path.join(dir, entry.name), depth + 1);
    if (source) return source;
  }
  return null;
}

export async function loadSkillSource(
  repoDir: string,
  readFile: SkillFileReader = skillMdPath => fs.readFile(skillMdPath, 'utf-8'),
): Promise<LoadedSkillSource | null> {
  const source = await findSkillSource(repoDir);
  if (!source) return null;
  try {
    const content = await readFile(source.skillMdPath);
    return { ...source, frontmatter: inspectSkillFrontmatter(content) };
  } catch (error) {
    return sourceReadError(source, error);
  }
}

async function sourceAt(skillDir: string): Promise<SkillSource | null> {
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  try {
    const stat = await fs.stat(skillMdPath);
    return stat.isFile() ? { skillDir, skillMdPath } : null;
  } catch {
    return null;
  }
}

function sourceReadError(source: SkillSource, error: unknown): LoadedSkillSource {
  const message = error instanceof Error ? error.message : String(error);
  return {
    ...source,
    frontmatter: {
      data: {},
      content: '',
      compatibility: {
        kind: 'invalid',
        error: `Unable to read discovered SKILL.md '${source.skillMdPath}': ${message}`,
      },
    },
  };
}

function sourceAtSync(skillDir: string): SkillSource | null {
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  try {
    return fsSync.statSync(skillMdPath).isFile() ? { skillDir, skillMdPath } : null;
  } catch {
    return null;
  }
}
