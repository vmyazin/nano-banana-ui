import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const repositoryRoot = process.cwd();
const deployScript = `${repositoryRoot}/scripts/deploy-production.sh`;
const deployService = `${repositoryRoot}/deploy/systemd/nano-banana-ui-deploy.service`;
const deployTimer = `${repositoryRoot}/deploy/systemd/nano-banana-ui-deploy.timer`;

describe('production deployment configuration', () => {
  it('ships a safe automatic deployment entrypoint for zurd', () => {
    expect(existsSync(deployScript)).toBe(true);
    expect(existsSync(deployService)).toBe(true);
    expect(existsSync(deployTimer)).toBe(true);

    execFileSync('bash', ['-n', deployScript]);

    const script = readFileSync(deployScript, 'utf8');
    expect(script).toContain('flock -n');
    expect(script).toContain('git fetch');
    expect(script).toContain('git merge --ff-only');
    expect(script).toContain('pnpm install --frozen-lockfile');
    expect(script).toContain('pnpm build');
    expect(script).toContain('pm2 restart');
    expect(script).toContain('curl --fail');

    const service = readFileSync(deployService, 'utf8');
    expect(service).toContain('User=vasily');
    expect(service).toContain('scripts/deploy-production.sh');

    const timer = readFileSync(deployTimer, 'utf8');
    expect(timer).toContain('OnUnitActiveSec=1min');
    expect(timer).toContain('Persistent=true');
  });
});
