import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import CloudExecutionNotice from '@/components/account/CloudExecutionNotice';
import type { useCloudWorkspace } from '@/lib/account/useCloudWorkspace';

type Workspace = ReturnType<typeof useCloudWorkspace>;

/**
 * "Switch to in-browser" asked for a decision about speed, cost, privacy and
 * where the result ends up, with none of those on screen. The notice now says
 * what the other side costs and buys.
 */
function workspaceOn(cloud: boolean) {
  return {
    signedIn: true,
    uncertain: false,
    cloud,
    enabled: true,
    connected: true,
    checking: false,
    useBrowser: () => undefined,
    useCloud: () => undefined,
  } as unknown as Workspace;
}

describe('CloudExecutionNotice', () => {
  it('says what going in-browser costs before the switch is taken', () => {
    render(<CloudExecutionNotice workspace={workspaceOn(true)} />);

    expect(screen.getByRole('button', { name: 'Switch to in-browser' })).toBeInTheDocument();
    const line = screen.getByText(/^In-browser:/);
    expect(line.textContent).toContain('closing the tab stops the run');
    expect(line.textContent).toContain('stays in this browser instead of your account');
  });

  it('says what going to the background buys', () => {
    render(<CloudExecutionNotice workspace={workspaceOn(false)} />);

    expect(screen.getByRole('button', { name: 'Switch to background' })).toBeInTheDocument();
    const line = screen.getByText(/^Background:/);
    expect(line.textContent).toContain('without this tab open');
    expect(line.textContent).toContain('saves to your account');
  });

  it('stays out of the way when there is no account to run against', () => {
    const { container } = render(
      <CloudExecutionNotice workspace={{ ...workspaceOn(false), signedIn: false } as Workspace} />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
