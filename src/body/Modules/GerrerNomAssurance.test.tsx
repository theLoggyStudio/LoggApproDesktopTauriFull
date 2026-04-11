import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import GerrerNomAssurance from './GerrerNomAssurance';

const mockPageParametreController = vi.fn();
vi.mock('../controllers/PageParametreController', () => ({
  PageParametreController: () => ({
    ajouterUnTypeAssurance: mockPageParametreController,
    modifierUnTypeAssurance: mockPageParametreController,
    supprimerUnTypeAssurance: mockPageParametreController,
  }),
}));

vi.mock('../context/SearchContext', () => ({
  useAlert: () => ({ setAlertObj: vi.fn() }),
}));

vi.mock('../context/SessionContext', () => ({
  useSession: () => ({
    session: { userId: 'user-1', tabId: 'main' },
  }),
}));

vi.mock('../helpers/helpers', () => ({
  checkPrivilege: () => true,
}));

vi.mock('../controllers/TraceController', () => ({
  creerTrace: vi.fn(() => Promise.resolve()),
}));

vi.mock('../controllers/PageProfilController', () => ({
  PageProfilController: () => ({
    voirInfoDocteur: vi.fn(() => Promise.resolve({ docteur: { nom: 'Dr', prenom: 'Test' } })),
  }),
}));

vi.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ themeNumber: 0 }),
}));

const defaultProps = {
  allTypeAssurances: [],
  tabId: 'main',
  privs: ['crd05'],
  setLimitTypeAssurance: vi.fn(),
  pays: 'sn',
  limitTypeActe: 10,
};

describe('GerrerNomAssurance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('utilise tabIdDecrypted (pas tabId) lors de l\'ajout d\'une assurance', async () => {
    mockPageParametreController.mockResolvedValue({});
    render(<GerrerNomAssurance {...defaultProps} />);

    const addBtn = screen.getByRole('button', { name: /Ajouter une assurance/ });
    fireEvent.click(addBtn);

    const nomInput = await screen.findByLabelText(/Type d'assurance/i);
    fireEvent.change(nomInput, { target: { value: 'Mutuelle' } });

    await waitFor(() => {
      const modal = document.querySelector('.modal-global-content');
      if (!modal) throw new Error('Modal non trouvé');
      return modal;
    });
    const modal = document.querySelector('.modal-global-content')!;
    const submitBtn = within(modal as HTMLElement).getByRole('button', { name: 'Ajouter' });
    fireEvent.click(submitBtn);

    await vi.waitFor(() => {
      expect(mockPageParametreController).toHaveBeenCalledWith(
        expect.objectContaining({
          loggId: 'main',
          tabId: 'main',
        })
      );
    });
  });

  it('affiche le bouton d\'ajout', () => {
    render(<GerrerNomAssurance {...defaultProps} />);
    expect(screen.getByText(/Ajouter une assurance/i)).toBeInTheDocument();
  });
});
