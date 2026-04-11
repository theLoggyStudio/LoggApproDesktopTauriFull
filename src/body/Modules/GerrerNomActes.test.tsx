import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { GerrerNomActes } from './GerrerNomActes';

const mockPageParametreController = vi.fn();
vi.mock('../controllers/PageParametreController', () => ({
  PageParametreController: () => ({
    ajouterUnTypeActe: mockPageParametreController,
    modifierUnTypeActe: mockPageParametreController,
    supprimerUnTypeActe: mockPageParametreController,
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
  allActes: [],
  tabId: 'main',
  privs: ['crd04'],
  limitTypeActe: 10,
  setLimitTypeActe: vi.fn(),
  pays: 'sn',
};

describe('GerrerNomActes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('utilise tabIdDecrypted (pas tabId) lors de l\'ajout d\'un acte', async () => {
    mockPageParametreController.mockResolvedValue({});
    render(<GerrerNomActes {...defaultProps} />);

    const addBtn = screen.getByRole('button', { name: /Ajouter un acte/ });
    fireEvent.click(addBtn);

    const nomInput = await screen.findByLabelText(/Type d'acte/i);
    fireEvent.change(nomInput, { target: { value: 'Consultation' } });

    const modalTitle = await screen.findByText('Ajouter un acte médical');
    const modal = modalTitle.closest('.modal-global-content') ?? modalTitle.parentElement!;
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
    render(<GerrerNomActes {...defaultProps} />);
    expect(screen.getByText(/Ajouter un acte/i)).toBeInTheDocument();
  });
});
