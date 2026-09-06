import { beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/useAppStore';

describe('account key opt-outs', () => {
  beforeEach(() => useAppStore.setState({ accountKeyOptOuts: [] }));

  it('records a provider once, however many times it is set', () => {
    useAppStore.getState().setAccountKeyOptOut('fal', true);
    useAppStore.getState().setAccountKeyOptOut('fal', true);
    expect(useAppStore.getState().accountKeyOptOuts).toEqual(['fal']);
  });

  it('clears one provider without disturbing the others', () => {
    useAppStore.getState().setAccountKeyOptOut('fal', true);
    useAppStore.getState().setAccountKeyOptOut('kie', true);
    useAppStore.getState().setAccountKeyOptOut('fal', false);
    expect(useAppStore.getState().accountKeyOptOuts).toEqual(['kie']);
  });

  it('is included in the persisted slice', () => {
    useAppStore.getState().setAccountKeyOptOut('atlas', true);
    const persisted = JSON.parse(localStorage.getItem('scene-assembly-store') ?? '{}');
    expect(persisted.state?.accountKeyOptOuts).toEqual(['atlas']);
  });
});
