import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(`${process.cwd()}/app/globals.css`, 'utf8');

describe('prompt panel visual contract', () => {
  it('defines a richer shared prompt surface without changing textarea tokens', () => {
    expect(css).toContain('--prompt-surface: hsl(var(--tint-hue) 42% 8.8%);');
    expect(css).toMatch(/\.prompt-panel\s*\{[^}]*background:\s*var\(--prompt-surface\)/s);
    expect(css).toMatch(/textarea,\s*select\s*\{[^}]*background:\s*var\(--background-elevated\)/s);
  });

  it('keeps the runner subtle and completes one lap in two seconds', () => {
    expect(css).toMatch(/\.prompt-panel-border-runner-track\s*\{[^}]*stroke-width:\s*1\.15/s);
    expect(css).toMatch(/stroke-dasharray:\s*12 88/);
    expect(css).toMatch(/animation:\s*prompt-panel-lap 2s linear 1/);
    expect(css).toMatch(/12\.5%\s*\{[^}]*stroke-dashoffset:\s*-12\.5[^}]*opacity:\s*0\.55/s);
    expect(css).toMatch(/87\.5%\s*\{[^}]*stroke-dashoffset:\s*-87\.5[^}]*opacity:\s*0\.55/s);
  });

  it('removes the decorative runner for reduced motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.prompt-panel-border-runner\s*\{[^}]*display:\s*none/s);
  });
});
