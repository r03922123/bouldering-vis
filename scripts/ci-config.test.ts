import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// CI runs E2E inside Playwright's Docker image, so the browsers come from the image tag in ci.yml,
// while the test runner comes from package.json. Nothing bumps the tag when the package changes,
// and a runner talking to browsers of another version fails. These tests make the two move together.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  devDependencies: Record<string, string>;
};

/** The YAML without its whole-line comments, so a note naming a command isn't read as a step. */
function withoutComments(yaml: string): string {
  return yaml
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
}

// The checks below read the workflow's code, not its comments.
const workflow = withoutComments(readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8'));

/**
 * The `KEY: value` pairs of the workflow's top-level `env:` block, which every job inherits.
 * Quotes around a value are dropped: `skip`, `'skip'` and `"skip"` are the same YAML string.
 */
function workflowEnv(yaml: string): Record<string, string> {
  const lines = yaml.split('\n');
  const env: Record<string, string> = {};
  const start = lines.indexOf('env:');
  if (start === -1) return env;
  for (const line of lines.slice(start + 1)) {
    if (line !== '' && !line.startsWith(' ')) break;
    const m = /^ {2}([A-Z0-9_]+): *(\S+)/.exec(line);
    if (m?.[1] && m[2]) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return env;
}

describe('workflowEnv', () => {
  it('reads only the top-level env block', () => {
    const yaml = 'on: push\nenv:\n  A: one\n  B: two\njobs:\n  x:\n    env:\n      C: three\n';
    expect(workflowEnv(yaml)).toEqual({ A: 'one', B: 'two' });
  });

  it('is empty when there is no top-level env block', () => {
    expect(workflowEnv('jobs:\n  x:\n    env:\n      C: three\n')).toEqual({});
  });

  it('drops the quotes around a quoted value', () => {
    expect(workflowEnv('env:\n  A: \'one\'\n  B: "two"\njobs: {}\n')).toEqual({
      A: 'one',
      B: 'two',
    });
  });
});

describe('withoutComments', () => {
  it('drops whole-line comments and keeps the code lines', () => {
    expect(
      withoutComments('env:\n# a note\n  A: one\n    # npx playwright install\nrun: x\n'),
    ).toBe('env:\n  A: one\nrun: x\n');
  });
});

describe('.github/workflows/ci.yml', () => {
  it('runs E2E in the Playwright image of the same version as @playwright/test', () => {
    const tags = [...workflow.matchAll(/mcr\.microsoft\.com\/playwright:(\S+)/g)].map((m) => m[1]);
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) {
      expect(/^v(\d+\.\d+\.\d+)-[a-z]+$/.exec(tag ?? '')?.[1]).toBe(
        pkg.devDependencies['@playwright/test'],
      );
    }
  });

  it('installs no browsers during the run, since the image already has them', () => {
    expect(workflow).not.toMatch(/playwright install/);
  });

  it('skips the onnxruntime-node CUDA download in every job', () => {
    expect(workflowEnv(workflow).ONNXRUNTIME_NODE_INSTALL).toBe('skip');
  });
});
