import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface SkillSource {
  skillDir: string;
  skillMdPath: string;
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

async function sourceAt(skillDir: string): Promise<SkillSource | null> {
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  try {
    await fs.access(skillMdPath);
    return { skillDir, skillMdPath };
  } catch {
    return null;
  }
}
