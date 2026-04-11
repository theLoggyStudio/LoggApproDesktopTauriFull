import { invoke } from "../../tauri-bridge";

export type Tuto = { id: string; titre: string; url: string; date_creation?: string };

/** Extrait l'ID vidéo YouTube (ex: watch?v=XXX ou youtu.be/XXX) */
export function extractYoutubeId(input: string): string {
  const s = input.trim();
  const vMatch = s.match(/[?&]v=([^&]+)/);
  if (vMatch) return vMatch[1];
  const beMatch = s.match(/youtu\.be\/([^?&]+)/);
  if (beMatch) return beMatch[1];
  return s;
}

const TutoController = () => ({
  list: async (): Promise<Tuto[]> => {
    const data = await invoke<Tuto[]>("list_tutos", { payload: "" });
    return Array.isArray(data) ? data : [];
  },
  add: async (titre: string, url: string): Promise<Tuto> => {
    const id = extractYoutubeId(url);
    return invoke<Tuto>("add_tuto", { payload: JSON.stringify({ titre, url: id }) });
  },
  update: async (id: string, titre: string, url: string): Promise<Tuto> => {
    const urlId = extractYoutubeId(url);
    return invoke<Tuto>("update_tuto", { payload: JSON.stringify({ id, titre, url: urlId }) });
  },
  delete: async (id: string): Promise<void> => {
    await invoke("delete_tuto", { payload: JSON.stringify({ id }) });
  },
});

export default TutoController;
