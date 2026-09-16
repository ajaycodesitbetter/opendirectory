import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { loadRegistry } from './registry';
import { ValidAgent, isValidAgent, getAgentSkillsDir } from './detect';
import * as manifest from './manifest';
import { normalizeTarget, validateCompatibility } from './compat';
import { findSkillSource } from './skill-discovery';

export interface InstallResult {
  skillName: string;
  target: string;
  path: string;
  success: boolean;
  error?: Error;
}

export async function installSkill(skillName: string, target: string): Promise<InstallResult> {
  try {
    const normalizedTarget = normalizeTarget(target);
    if (!isValidAgent(normalizedTarget)) {
      return { skillName, target, path: '', success: false, error: new Error(`Unsupported target '${target}'.`) };
    }

    const root = path.resolve(__dirname, '..');
    const repoDir = path.join(root, 'skills', skillName);
    try {
      const source = await findSkillSource(repoDir);
      if (!source) {
        return { skillName, target: normalizedTarget, path: '', success: false, error: new Error(`Skill '${skillName}' missing SKILL.md in registry.`) };
      }
      const skillDir = source.skillDir;

      // Path-boundary guard: verify resolved skillDir stays inside skills/
      const skillsRoot = path.resolve(root, 'skills');
      const resolvedSkillDir = path.resolve(skillDir);
      const rel = path.relative(skillsRoot, resolvedSkillDir);
      if (rel.startsWith('..') || path.isAbsolute(rel) || rel.length === 0) {
        return {
          skillName,
          target: normalizedTarget,
          path: '',
          success: false,
          error: new Error(`Refusing to install '${resolvedSkillDir}': resolved path is outside the skills directory.`)
        };
      }

      return await installResolvedSkill(skillName, normalizedTarget, skillDir);
    } catch {
      return { skillName, target: normalizedTarget, path: '', success: false, error: new Error(`Repository '${skillName}' not found.`) };
    }
  } catch (error: any) {
    return { skillName, target, path: '', success: false, error };
  }
}

async function installResolvedSkill(skillName: string, normalizedTarget: string, skillDir: string): Promise<InstallResult> {
  try {
    const registrySkills = await loadRegistry();
    const registryEntry = registrySkills.find(s => s.name === skillName);

    if (registryEntry?.frontmatterError) {
      return {
        skillName,
        target: normalizedTarget,
        path: '',
        success: false,
        error: new Error(`Skill "${skillName}" has invalid YAML frontmatter: ${registryEntry.frontmatterError}`),
      };
    }

    const compatResult = validateCompatibility(
      skillName,
      registryEntry?.compatibility,
      registryEntry?.hasCompatibility === true,
      normalizedTarget,
    );
    if (!compatResult.ok) {
      return { skillName, target: normalizedTarget, path: '', success: false, error: new Error(compatResult.error) };
    }

    const manifestName = registryEntry ? skillName : path.basename(skillDir);
    const destFolderName = path.basename(skillDir);
    const destPath = path.join(getAgentSkillsDir(normalizedTarget as ValidAgent), destFolderName);

    await fs.mkdir(destPath, { recursive: true });
    await fs.cp(skillDir, destPath, { recursive: true });

    const version = registryEntry?.version || 'unknown';
    await manifest.addInstalled({
      name: manifestName,
      target: normalizedTarget,
      version,
      installedAt: new Date().toISOString(),
      path: destPath
    });

    return { skillName: manifestName, target: normalizedTarget, path: destPath, success: true };
  } catch (error: any) {
    return { skillName, target: normalizedTarget, path: '', success: false, error };
  }
}
