import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve({ body: 'encrypted' })),
}));

// Mock SessionContext
vi.mock('../body/context/SessionContext', () => ({
  useSession: () => ({
    session: { userId: 'test-user', tabId: 'main', pays: 'sn' },
  }),
}));
