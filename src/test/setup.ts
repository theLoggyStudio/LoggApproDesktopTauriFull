import "@testing-library/jest-dom";
import { vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve({ body: "encrypted" })),
}));
