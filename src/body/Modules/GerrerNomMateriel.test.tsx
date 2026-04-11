import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { GerrerNomMateriel } from './GerrerNomMateriel';

const mockPagePatientDetailController = vi.fn();
vi.mock('../controllers/PagePatientDetailController', () => ({
  PagePatientDetailController: () => ({
    ajouterUnNomMateriel: mockPagePatientDetailController,
    modifierUnNomMateriel: mockPagePatientDetailController,
    supprimerUnNomMateriel: mockPagePatientDetailController,
  }),
}));

vi.mock('../context/SearchContext', () => ({
  useAlert: () => ({ setAlertObj: vi.fn() }),
  useMode: () => ({ mode: 'normal' }),
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
  allMateriels: [],
  tabId: 'main',
  privs: ['crd04'],
  limitNomMateriel: 10,
  setLimitNomMateriel: vi.fn(),
  pays: 'sn',
};

describe('GerrerNomMateriel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('utilise tabIdDecrypted (pas tabId) lors de l\'ajout d\'un matériel', async () => {
    mockPagePatientDetailController.mockResolvedValue({});
    render(<GerrerNomMateriel {...defaultProps} />);

    const addBtn = screen.getByRole('button', { name: /Ajouter un matériel/ });
    fireEvent.click(addBtn);

    const nomInput = await screen.findByLabelText(/Nom du matériel/i);
    fireEvent.change(nomInput, { target: { value: 'Gants' } });

    const modalTitle = await screen.findByText('Ajouter un matériel médical');
    const modal = modalTitle.closest('.modal-global-content') ?? modalTitle.parentElement!;
    const submitBtn = within(modal as HTMLElement).getByRole('button', { name: 'Ajouter' });
    fireEvent.click(submitBtn);

    await vi.waitFor(() => {
      expect(mockPagePatientDetailController).toHaveBeenCalledWith(
        'normal',
        expect.objectContaining({ loggId: 'main' }),
        'main'
      );
    });
  });

  it('affiche le bouton d\'ajout', () => {
    render(<GerrerNomMateriel {...defaultProps} />);
    expect(screen.getByText(/Ajouter un matériel/i)).toBeInTheDocument();
  });
});
