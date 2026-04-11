import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PageParametreController } from './PageParametreController';

vi.mock('../../tauri-bridge', () => ({
  invoke: vi.fn((cmd: string) => {
    if (cmd === 'list_nom_actes') return Promise.resolve({ body: 'enc' });
    if (cmd === 'list_nom_assurances') return Promise.resolve({ body: 'enc' });
    return Promise.resolve({ body: 'enc' });
  }),
}));

describe('PageParametreController', () => {
  beforeEach(() => vi.clearAllMocks());

  it('expose les méthodes attendues', () => {
    const controller = PageParametreController('sn');
    expect(controller.listerUnTypeActe).toBeDefined();
    expect(controller.listerUnTypeAssurance).toBeDefined();
    expect(controller.ajouterUnTypeActe).toBeDefined();
    expect(controller.ajouterUnTypeAssurance).toBeDefined();
  });

  it('listerUnTypeActe appelle invoke avec tabId', async () => {
    const { invoke } = await import('../../tauri-bridge');
    const controller = PageParametreController('sn');
    await controller.listerUnTypeActe('main', 100);
    expect(invoke).toHaveBeenCalledWith('list_nom_actes', expect.any(Object));
  });
});
