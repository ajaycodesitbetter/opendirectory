import * as p from '@clack/prompts';
import chalk from 'chalk';
import { setTimeout } from 'timers/promises';
import { printAnimatedBanner } from '../banner';
import { loadRegistry, type Skill } from '../registry';
import { pickTarget, CancelledError } from './target-picker';
import { installSkill } from '../install-core';
import { terminalWidth, isInteractive, noColor } from '../tty';
import { categoryFor, CATEGORY_ORDER } from '../categories';
import { printRandomTip } from '../tips';
import { BRAILLE_SPINNER_FRAMES, renderProgressBar } from '../animations';
import { normalizeTarget } from '../compat';
import { getSkillAvailability } from './compatibility';
import { AGENT_PATHS, isValidAgent } from '../detect';

const BACK = Symbol('back');

const BRAND_PURPLE = '#856FE6';

export function targetForSelection(requestedTarget: string | undefined, pickedTarget: string): string {
  return requestedTarget ?? pickedTarget;
}

function truncate(text: string, len: number): string {
  return text.length > len ? text.slice(0, len - 3) + '...' : text;
}

function styledFrame(frame: string): string {
  return noColor() ? frame : chalk.hex(BRAND_PURPLE)(frame);
}

function groupSkillsByCategory(skills: Skill[]): Record<string, Skill[]> {
  const groups: Record<string, Skill[]> = {};
  for (const skill of skills) {
    const cat = categoryFor(skill.name);
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(skill);
  }
  const ordered: Record<string, Skill[]> = {};
  for (const cat of CATEGORY_ORDER) {
    if (groups[cat]) ordered[cat] = groups[cat].sort((a, b) => a.name.localeCompare(b.name));
  }
  for (const cat of Object.keys(groups)) {
    if (!ordered[cat]) ordered[cat] = groups[cat].sort((a, b) => a.name.localeCompare(b.name));
  }
  return ordered;
}

function buildSpinnerOptions(): p.SpinnerOptions | undefined {
  if (noColor()) return undefined;
  return {
    frames: BRAILLE_SPINNER_FRAMES,
    delay: 80,
    styleFrame: styledFrame
  };
}

async function searchAllSkills(skills: Skill[]): Promise<string[] | symbol> {
  return p.autocompleteMultiselect({
    message: 'Type to filter  ↓ to navigate  Space/Tab to select  Enter to confirm',
    options: skills.map(skill => ({
      value: skill.name,
      label: skill.name,
      hint: truncate(skill.description, 80)
    })),
    maxItems: 18,
    required: false
  });
}

async function browseByCategory(skills: Skill[]): Promise<string[] | symbol> {
  const grouped = groupSkillsByCategory(skills);
  const options: Record<string, Array<{ value: string; label: string; hint?: string }>> = {};
  for (const [cat, list] of Object.entries(grouped)) {
    const count = list.length;
    const groupLabel = `${cat} ${chalk.dim(`(${count})`)}`;
    options[groupLabel] = list.map(skill => ({
      value: skill.name,
      label: skill.name,
      hint: truncate(skill.description, 70)
    }));
  }

  p.note(
    'TAB jumps between categories  SPACE on category = select all in group' +
    '  Enter = confirm  ESC = back',
    'Keyboard shortcuts'
  );

  const selected = await p.groupMultiselect({
    message: 'Tab switches category  Space toggles  Enter confirms  ESC goes back',
    options,
    maxItems: 18,
    required: false,
    selectableGroups: true
  });

  if (p.isCancel(selected)) return BACK;
  return selected as string[];
}

export async function runBrowseTUI(opts: { target?: string; noBanner?: boolean } = {}): Promise<void> {
  try {
    await printAnimatedBanner({ hidden: opts.noBanner });
    if (!opts.noBanner) printRandomTip();
    console.log();

    if (terminalWidth() < 60) {
      p.log.warn('Terminal is narrow — list may wrap awkwardly.');
    }

    const s = p.spinner(buildSpinnerOptions());
    s.start('Loading skills');
    const skills = await loadRegistry();
    s.stop(`${skills.length} skills loaded.`);

    if (skills.length === 0) {
      p.note('No skills found in registry.', 'Empty');
      process.exit(0);
    }

    let skillNames: string[] | null = null;
    let target: string | undefined;
    let requestedTarget = opts.target ? normalizeTarget(opts.target) : undefined;
    if (requestedTarget && !isValidAgent(requestedTarget)) {
      throw new Error(`Unsupported target '${opts.target}'.`);
    }

    selectionLoop:
    while (true) {
      modeLoop:
      while (true) {
      await setTimeout(10);
      const mode = await p.select({
        message: 'How would you like to browse?',
        options: [
          { value: 'category', label: 'Browse by category', hint: 'search + group by category' },
          { value: 'all', label: 'Search all skills', hint: 'filter across name, description, category' },
          { value: 'exit', label: 'Exit' }
        ],
        initialValue: 'category'
      });

      if (p.isCancel(mode) || mode === 'exit') {
        p.cancel('Exiting.');
        process.exit(0);
      }

      if (mode === 'category') {
        while (true) {
          const result = await browseByCategory(skills);
          if (result === BACK) continue modeLoop;
          if ((result as string[]).length === 0) continue;
          skillNames = result as string[];
          break;
        }
      } else {
        const result = await searchAllSkills(skills);
        if (p.isCancel(result)) continue;
        if ((result as string[]).length === 0) continue;
        skillNames = result as string[];
      }
      break;
      }

      const selectedSkills = skills.filter(skill => skillNames!.includes(skill.name));
      const disabledTargets = new Set(
        Object.keys(AGENT_PATHS).filter(candidate =>
          getSkillAvailability(selectedSkills, candidate).unavailable.length > 0,
        ),
      );

      if (disabledTargets.size === Object.keys(AGENT_PATHS).length) {
        p.note('No target supports every selected skill. Choose a different set of skills.', 'Compatibility');
        continue selectionLoop;
      }

      target = targetForSelection(requestedTarget, await pickTarget({ disabledTargets }));
      const preflight = getSkillAvailability(selectedSkills, target);
      if (preflight.unavailable.length > 0) {
        p.note(
          `${preflight.unavailable.map(skill => skill.name).join(', ')} cannot be installed for ${target}. Choose a different set of skills.`,
          'Compatibility',
        );
        continue selectionLoop;
      }
      break;
    }

    p.note(
      `Installing ${skillNames.length} skill${skillNames.length === 1 ? '' : 's'} to ${chalk.hex(BRAND_PURPLE).bold(target!)}\n${skillNames.join(', ')}`,
      'Summary'
    );

    const proceed = await p.confirm({
      message: 'Continue?',
      initialValue: true
    });

    if (p.isCancel(proceed) || !proceed) {
      p.cancel('Cancelled.');
      process.exit(0);
    }

    const successes: string[] = [];
    const failures: { name: string; error: string }[] = [];
    const total = skillNames.length;
    const startedAt = Date.now();

    for (let i = 0; i < skillNames.length; i++) {
      const name = skillNames[i];
      const sp = p.spinner(buildSpinnerOptions());
      const progress = renderProgressBar(i, total);
      sp.start(`${progress}  ${name}`);
      const result = await installSkill(name, target!);
      const finalProgress = renderProgressBar(i + 1, total);
      if (result.success) {
        sp.stop(`${finalProgress}  ${chalk.hex(BRAND_PURPLE).bold(name)} ${chalk.dim('installed')}`);
        successes.push(name);
      } else {
        sp.stop(`${finalProgress}  ${chalk.red(name)} ${chalk.dim('failed:')} ${result.error?.message}`);
        failures.push({ name, error: result.error?.message || 'Unknown error' });
      }
    }

    const seconds = ((Date.now() - startedAt) / 1000).toFixed(3);
    const outroLine = `Installed ${successes.length} of ${total} skill${total === 1 ? '' : 's'} in ${seconds}s`;
    if (isInteractive() && !noColor()) {
      p.outro(chalk.hex(BRAND_PURPLE).bold(outroLine));
    } else {
      p.outro(outroLine);
    }

    if (failures.length > 0) {
      for (const f of failures) {
        p.log.error(`${f.name}: ${f.error}`);
      }
      process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    if (error instanceof CancelledError) {
      p.cancel('Cancelled.');
      process.exit(0);
    }
    p.log.error(String(error));
    process.exit(1);
  }
}
