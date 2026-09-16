import { test, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { randomUUID } from 'node:crypto';

let tmpHome: string;
let originalHome: string | undefined;
let originalUserprofile: string | undefined;
const UNIVERSAL_SKILL = 'brand-alchemy';
const CLI_ROOT = path.resolve(__dirname, '..');
let originalCwd: string;

beforeAll(() => {
  originalCwd = process.cwd();
  process.chdir(CLI_ROOT);
  if (!fs.existsSync(path.join(CLI_ROOT, 'dist', 'index.js'))) {
    execSync('pnpm run build', { stdio: 'inherit', cwd: CLI_ROOT });
  }
});

afterAll(() => {
  process.chdir(originalCwd);
});

beforeEach(() => {
  originalHome = process.env.HOME;
  originalUserprofile = process.env.USERPROFILE;
  tmpHome = path.join(os.tmpdir(), `od-test-${randomUUID()}`);
  fs.mkdirSync(tmpHome, { recursive: true });
  process.env.HOME = tmpHome;
  process.env.USERPROFILE = tmpHome;
});

afterEach(() => {
  fs.rmSync(tmpHome, { recursive: true, force: true });
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  if (originalUserprofile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = originalUserprofile;
});

test('installs skill via CLI args', async () => {
  const expectedPath = path.join(tmpHome, `.config/opencode/skills/${UNIVERSAL_SKILL}/SKILL.md`);
  execSync(`node dist/index.js install ${UNIVERSAL_SKILL} --target opencode`, { stdio: 'pipe' });
  expect(fs.existsSync(expectedPath)).toBe(true);
});

test('list --plain prints table identical to old format', async () => {
  const output = execSync('node dist/index.js list --plain', { stdio: 'pipe' }).toString();
  expect(output).toContain('Skill Name');
  expect(output).toContain('Description');
  expect(output).toContain(UNIVERSAL_SKILL);
});

test('list with piped stdout falls back to plain', async () => {
  const output = execSync('node dist/index.js list', { stdio: 'pipe' }).toString();
  expect(output).toContain('Skill Name');
  expect(output).toContain('Description');
});

test('NO_COLOR=1 strips all ANSI from output', async () => {
  const output = execSync('node dist/index.js list --plain', { stdio: 'pipe', env: { ...process.env, NO_COLOR: '1' } }).toString();
  expect(output).not.toMatch(/\x1b\[[0-9;]*m/);
});

test('install + uninstall round-trips manifest', async () => {
  execSync(`node dist/index.js install ${UNIVERSAL_SKILL} --target opencode`, { stdio: 'pipe' });
  const manifestPath = path.join(tmpHome, '.opendirectory/installed.json');
  expect(fs.existsSync(manifestPath)).toBe(true);

  execSync(`node dist/index.js uninstall ${UNIVERSAL_SKILL} --target opencode`, { stdio: 'pipe' });
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  expect(manifest.skills.length).toBe(0);
});

test('reconcile removes stale manifest entries', async () => {
  execSync(`node dist/index.js install ${UNIVERSAL_SKILL} --target opencode`, { stdio: 'pipe' });
  const skillPath = path.join(tmpHome, `.config/opencode/skills/${UNIVERSAL_SKILL}`);
  fs.rmSync(skillPath, { recursive: true, force: true });

  execSync('node dist/index.js installed --plain', { stdio: 'pipe', env: { ...process.env, CI: '1' } });

  const manifestPath = path.join(tmpHome, '.opendirectory/installed.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  expect(manifest.skills.length).toBe(0);
});

test('--target flag overrides config default', async () => {
  const configPath = path.join(tmpHome, '.opendirectory/config.json');
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({ defaultTarget: 'claude', version: 1 }));

  execSync(`node dist/index.js install ${UNIVERSAL_SKILL} --target opencode`, { stdio: 'pipe' });
  expect(fs.existsSync(path.join(tmpHome, `.config/opencode/skills/${UNIVERSAL_SKILL}/SKILL.md`))).toBe(true);
  expect(fs.existsSync(path.join(tmpHome, `.claude/skills/${UNIVERSAL_SKILL}/SKILL.md`))).toBe(false);
});

test('install command accepts uppercase target (case-insensitive)', async () => {
  execSync(`node dist/index.js install ${UNIVERSAL_SKILL} --target OPENCODE`, { stdio: 'pipe' });
  expect(fs.existsSync(path.join(tmpHome, `.config/opencode/skills/${UNIVERSAL_SKILL}/SKILL.md`))).toBe(true);
});

test('install command uses saved default target when --target omitted', async () => {
  const configPath = path.join(tmpHome, '.opendirectory/config.json');
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({ defaultTarget: 'opencode', version: 1 }));

  execSync(`node dist/index.js install ${UNIVERSAL_SKILL}`, { stdio: 'pipe' });
  expect(fs.existsSync(path.join(tmpHome, `.config/opencode/skills/${UNIVERSAL_SKILL}/SKILL.md`))).toBe(true);
});

test('non-existent skill errors with exact message', async () => {
  expect.assertions(2);
  try {
    execSync('node dist/index.js install non-existent-skill --target claude', { stdio: 'pipe' });
  } catch (error: any) {
    expect(error.stderr.toString()).toContain("Error: Repository 'non-existent-skill' not found.");
    expect(error.status).toBe(1);
  }
});

test('uninstall not-installed skill errors clearly', async () => {
  expect.assertions(2);
  try {
    execSync('node dist/index.js uninstall some-skill --target claude', { stdio: 'pipe' });
  } catch (error: any) {
    expect(error.stderr.toString()).toContain('Failed to uninstall:');
    expect(error.status).toBe(1);
  }
});

test('update of un-installed skill errors with "use install instead"', async () => {
  expect.assertions(2);
  try {
    execSync(`node dist/index.js update ${UNIVERSAL_SKILL} --target claude`, { stdio: 'pipe' });
  } catch (error: any) {
    expect(error.stderr.toString()).toContain('use install instead');
    expect(error.status).toBe(1);
  }
});

test('update is idempotent (replaces installed skill in place)', async () => {
  execSync(`node dist/index.js install ${UNIVERSAL_SKILL} --target opencode`, { stdio: 'pipe' });
  const skillPath = path.join(tmpHome, `.config/opencode/skills/${UNIVERSAL_SKILL}/SKILL.md`);
  expect(fs.existsSync(skillPath)).toBe(true);

  execSync(`node dist/index.js update ${UNIVERSAL_SKILL} --target opencode`, { stdio: 'pipe' });
  expect(fs.existsSync(skillPath)).toBe(true);

  const manifestPath = path.join(tmpHome, '.opendirectory/installed.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  expect(manifest.skills.length).toBe(1);
  expect(manifest.skills[0].name).toBe(UNIVERSAL_SKILL);
});

// --- Compatibility enforcement e2e tests ---

const COMPAT_FIXTURE_DIR = path.join(__dirname, '..', 'skills', 'test-compat-fixture');

function createCompatFixture(frontmatter: string, closeFrontmatter = true) {
  fs.mkdirSync(COMPAT_FIXTURE_DIR, { recursive: true });
  const closing = closeFrontmatter ? '\n---\n\n# Test Skill\nThis is a test fixture.\n' : '\n';
  fs.writeFileSync(
    path.join(COMPAT_FIXTURE_DIR, 'SKILL.md'),
    `---\nname: test-compat-fixture\ndescription: Test fixture for compatibility\n${frontmatter}${closing}`,
  );
}

function removeCompatFixture() {
  fs.rmSync(COMPAT_FIXTURE_DIR, { recursive: true, force: true });
}

test('compatibility: [codex] + --target codex → succeeds', () => {
  try {
    createCompatFixture('compatibility: [codex]');
    execSync('node dist/index.js install test-compat-fixture --target codex', { stdio: 'pipe' });
    const skillPath = path.join(tmpHome, '.codex/skills/test-compat-fixture/SKILL.md');
    expect(fs.existsSync(skillPath)).toBe(true);
  } finally {
    removeCompatFixture();
  }
});

test('compatibility: [codex] + --target claude → exit 1, no dest dir, no manifest entry', () => {
  try {
    createCompatFixture('compatibility: [codex]');
    expect.assertions(4);
    try {
      execSync('node dist/index.js install test-compat-fixture --target claude', { stdio: 'pipe' });
    } catch (error: any) {
      expect(error.status).toBe(1);
      expect(error.stderr.toString()).toContain('supports:');
    }
    // No destination directory created
    const destDir = path.join(tmpHome, '.claude/skills/test-compat-fixture');
    expect(fs.existsSync(destDir)).toBe(false);
    // No manifest entry
    const manifestPath = path.join(tmpHome, '.opendirectory/installed.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      expect(manifest.skills.length).toBe(0);
    } else {
      expect(true).toBe(true); // no manifest file at all is also correct
    }
  } finally {
    removeCompatFixture();
  }
});

test('compatibility: [CODEX, " opencode "] normalizes and succeeds', () => {
  try {
    createCompatFixture('compatibility: [CODEX, " opencode "]');
    execSync('node dist/index.js install test-compat-fixture --target codex', { stdio: 'pipe' });
    expect(fs.existsSync(path.join(tmpHome, '.codex/skills/test-compat-fixture/SKILL.md'))).toBe(true);
  } finally {
    removeCompatFixture();
  }
});

test('--target " CODEX " is normalized before validation and installation', () => {
  try {
    createCompatFixture('compatibility: [codex]');
    execSync('node dist/index.js install test-compat-fixture --target " CODEX "', { stdio: 'pipe' });
    expect(fs.existsSync(path.join(tmpHome, '.codex/skills/test-compat-fixture/SKILL.md'))).toBe(true);
  } finally {
    removeCompatFixture();
  }
});

test('compatibility: [codex, opencode] + --target gemini → rejected', () => {
  try {
    createCompatFixture('compatibility: [codex, opencode]');
    expect.assertions(2);
    try {
      execSync('node dist/index.js install test-compat-fixture --target gemini', { stdio: 'pipe' });
    } catch (error: any) {
      expect(error.status).toBe(1);
      expect(error.stderr.toString()).toContain('supports:');
    }
  } finally {
    removeCompatFixture();
  }
});

test('no compatibility field → installs to any target', () => {
  try {
    createCompatFixture('');
    execSync('node dist/index.js install test-compat-fixture --target gemini', { stdio: 'pipe' });
    expect(fs.existsSync(path.join(tmpHome, '.gemini/skills/test-compat-fixture/SKILL.md'))).toBe(true);
  } finally {
    removeCompatFixture();
  }
});

test('--target omitted, saved default incompatible → rejected', () => {
  try {
    createCompatFixture('compatibility: [codex]');
    const configPath = path.join(tmpHome, '.opendirectory/config.json');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({ defaultTarget: 'claude', version: 1 }));

    expect.assertions(2);
    try {
      execSync('node dist/index.js install test-compat-fixture', { stdio: 'pipe' });
    } catch (error: any) {
      expect(error.status).toBe(1);
      expect(error.stderr.toString()).toContain('supports:');
    }
  } finally {
    removeCompatFixture();
  }
});

test('update incompatible → rejected, existing files + manifest unchanged', () => {
  try {
    // First install with a universal fixture
    createCompatFixture('');
    execSync('node dist/index.js install test-compat-fixture --target codex', { stdio: 'pipe' });
    const skillPath = path.join(tmpHome, '.codex/skills/test-compat-fixture/SKILL.md');
    expect(fs.existsSync(skillPath)).toBe(true);

    const manifestPath = path.join(tmpHome, '.opendirectory/installed.json');
    const manifestBefore = fs.readFileSync(manifestPath, 'utf-8');
    const skillContentBefore = fs.readFileSync(skillPath, 'utf-8');

    // Change fixture to be incompatible with codex
    createCompatFixture('compatibility: [claude]');

    expect.assertions(5);
    try {
      execSync('node dist/index.js update test-compat-fixture --target codex', { stdio: 'pipe' });
    } catch (error: any) {
      expect(error.status).toBe(1);
      expect(error.stderr.toString()).toContain('supports:');
    }

    // Verify files and manifest are byte-identical
    expect(fs.readFileSync(skillPath, 'utf-8')).toBe(skillContentBefore);
    expect(fs.readFileSync(manifestPath, 'utf-8')).toBe(manifestBefore);
  } finally {
    removeCompatFixture();
  }
});

test('list --plain shows Compatibility column with all and canonical ordering', () => {
  try {
    createCompatFixture('compatibility: [ OPENCODE, CODEX ]');
    const output = execSync('node dist/index.js list --plain', { stdio: 'pipe' }).toString();
    expect(output).toContain('Compatibility');
    expect(output).toContain('codex, opencode');
    expect(output).toContain('all');
  } finally {
    removeCompatFixture();
  }
});

test('uppercase --target CODEX preserves existing behavior', () => {
  try {
    createCompatFixture('compatibility: [codex]');
    execSync('node dist/index.js install test-compat-fixture --target CODEX', { stdio: 'pipe' });
    expect(fs.existsSync(path.join(tmpHome, '.codex/skills/test-compat-fixture/SKILL.md'))).toBe(true);
  } finally {
    removeCompatFixture();
  }
});

test.each([
  ['number member', 'compatibility: [codex, 1]', 'item 2 must be a string'],
  ['null member', 'compatibility: [codex, null]', 'item 2 must be a string'],
  ['alias', 'compatibility: [claude-code]', 'unknown target "claude-code"'],
  ['unknown target', 'compatibility: [codex, unknown-target]', 'unknown target "unknown-target"'],
])('invalid explicit compatibility (%s) is never universal', (_label, frontmatter, expectedError) => {
  try {
    createCompatFixture(frontmatter);
    expect.assertions(4);
    try {
      execSync('node dist/index.js install test-compat-fixture --target codex', { stdio: 'pipe' });
    } catch (error: any) {
      expect(error.status).toBe(1);
      expect(error.stderr.toString()).toContain(expectedError);
    }
    expect(fs.existsSync(path.join(tmpHome, '.codex/skills/test-compat-fixture'))).toBe(false);
    expect(fs.existsSync(path.join(tmpHome, '.opendirectory/installed.json'))).toBe(false);
  } finally {
    removeCompatFixture();
  }
});

test('malformed compatibility YAML rejects install before destination or manifest mutation', () => {
  try {
    createCompatFixture('compatibility: [codex');
    expect.assertions(4);
    try {
      execSync('node dist/index.js install test-compat-fixture --target codex', { stdio: 'pipe' });
    } catch (error: any) {
      expect(error.status).toBe(1);
      expect(error.stderr.toString()).toContain('invalid YAML frontmatter');
    }
    expect(fs.existsSync(path.join(tmpHome, '.codex/skills/test-compat-fixture'))).toBe(false);
    expect(fs.existsSync(path.join(tmpHome, '.opendirectory/installed.json'))).toBe(false);
  } finally {
    removeCompatFixture();
  }
});

test('malformed compatibility YAML rejects update before backup or mutation', () => {
  try {
    createCompatFixture('');
    execSync('node dist/index.js install test-compat-fixture --target codex', { stdio: 'pipe' });
    const skillPath = path.join(tmpHome, '.codex/skills/test-compat-fixture');
    const manifestPath = path.join(tmpHome, '.opendirectory/installed.json');
    const skillContentBefore = fs.readFileSync(path.join(skillPath, 'SKILL.md'), 'utf-8');
    const manifestBefore = fs.readFileSync(manifestPath, 'utf-8');

    createCompatFixture('compatibility: [codex');
    expect.assertions(6);
    try {
      execSync('node dist/index.js update test-compat-fixture --target codex', { stdio: 'pipe' });
    } catch (error: any) {
      expect(error.status).toBe(1);
      expect(error.stderr.toString()).toContain('invalid YAML frontmatter');
    }
    expect(fs.existsSync(skillPath)).toBe(true);
    expect(fs.readFileSync(path.join(skillPath, 'SKILL.md'), 'utf-8')).toBe(skillContentBefore);
    expect(fs.readFileSync(manifestPath, 'utf-8')).toBe(manifestBefore);
    expect(fs.readdirSync(path.dirname(skillPath)).some(entry => entry.includes('.bak.'))).toBe(false);
  } finally {
    removeCompatFixture();
  }
});

test('unterminated compatibility frontmatter rejects install before mutation', () => {
  try {
    createCompatFixture('compatibility: [codex', false);
    expect.assertions(4);
    try {
      execSync('node dist/index.js install test-compat-fixture --target codex', { stdio: 'pipe' });
    } catch (error: any) {
      expect(error.status).toBe(1);
      expect(error.stderr.toString()).toContain('missing closing --- delimiter');
    }
    expect(fs.existsSync(path.join(tmpHome, '.codex/skills/test-compat-fixture'))).toBe(false);
    expect(fs.existsSync(path.join(tmpHome, '.opendirectory/installed.json'))).toBe(false);
  } finally {
    removeCompatFixture();
  }
});

test('unterminated compatibility frontmatter rejects update before mutation', () => {
  try {
    createCompatFixture('');
    execSync('node dist/index.js install test-compat-fixture --target codex', { stdio: 'pipe' });
    const skillPath = path.join(tmpHome, '.codex/skills/test-compat-fixture');
    const manifestPath = path.join(tmpHome, '.opendirectory/installed.json');
    const skillContentBefore = fs.readFileSync(path.join(skillPath, 'SKILL.md'), 'utf-8');
    const manifestBefore = fs.readFileSync(manifestPath, 'utf-8');

    createCompatFixture('compatibility: [codex', false);
    expect.assertions(6);
    try {
      execSync('node dist/index.js update test-compat-fixture --target codex', { stdio: 'pipe' });
    } catch (error: any) {
      expect(error.status).toBe(1);
      expect(error.stderr.toString()).toContain('missing closing --- delimiter');
    }
    expect(fs.existsSync(skillPath)).toBe(true);
    expect(fs.readFileSync(path.join(skillPath, 'SKILL.md'), 'utf-8')).toBe(skillContentBefore);
    expect(fs.readFileSync(manifestPath, 'utf-8')).toBe(manifestBefore);
    expect(fs.readdirSync(path.dirname(skillPath)).some(entry => entry.includes('.bak.'))).toBe(false);
  } finally {
    removeCompatFixture();
  }
});

test.each(['constructor', 'toString'])('unsupported inherited target %s returns an actionable error', target => {
  expect.assertions(2);
  try {
    execSync(`node dist/index.js install ${UNIVERSAL_SKILL} --target ${target}`, { stdio: 'pipe' });
  } catch (error: any) {
    expect(error.status).toBe(1);
    expect(error.stderr.toString()).toContain(`Unsupported target '${target}'.`);
  }
});
