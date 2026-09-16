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

/** Finds the same SKILL.md location used by both registry loading and installation. */
export async function findSkillSource(repoDir: string): Promise<SkillSource | null> {
  const direct = await sourceAt(repoDir);
  if (direct) return direct;

  const entries = await fs.readdir(repoDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const source = await sourceAt(path.join(repoDir, entry.name));
    if (source) return source;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name === '.git') continue;
    const subDir = path.join(repoDir, entry.name);
    const subEntries = await fs.readdir(subDir, { withFileTypes: true });
    for (const subEntry of subEntries) {
      if (!subEntry.isDirectory()) continue;
      const source = await sourceAt(path.join(subDir, subEntry.name));
      if (source) return source;
    }
  }

  return null;
}

export function findSkillSourceSync(repoDir: string): SkillSource | null {
  const direct = sourceAtSync(repoDir);
  if (direct) return direct;

  const entries = fsSync.readdirSync(repoDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const source = sourceAtSync(path.join(repoDir, entry.name));
    if (source) return source;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name === '.git') continue;
    const subEntries = fsSync.readdirSync(path.join(repoDir, entry.name), { withFileTypes: true });
    for (const subEntry of subEntries) {
      if (!subEntry.isDirectory()) continue;
      const source = sourceAtSync(path.join(repoDir, entry.name, subEntry.name));
      if (source) return source;
    }
  }

  return null;
}

export async function loadSkillSource(repoDir: string): Promise<LoadedSkillSource | null> {
  const source = await findSkillSource(repoDir);
  if (!source) return null;
  const content = await fs.readFile(source.skillMdPath, 'utf-8');
  return { ...source, frontmatter: inspectSkillFrontmatter(content) };
}

async function sourceAt(skillDir: string): Promise<SkillSource | null> {
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  try {
    await fs.access(skillMdPath);
    return { skillDir, skillMdPath };
  } catch {
    return null;
  }
}

function sourceAtSync(skillDir: string): SkillSource | null {
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  try {
    fsSync.accessSync(skillMdPath);
    return { skillDir, skillMdPath };
  } catch {
    return null;
  }
}
