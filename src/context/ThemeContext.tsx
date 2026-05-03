import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { ActualthemeNumber, themes } from "../constants";

function clampThemeIndex(raw: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return ActualthemeNumber;
  const max = themes.length - 1;
  return Math.max(0, Math.min(max, Math.floor(n)));
}

const ThemeContext = createContext({
  themeNumber: ActualthemeNumber,
  setThemeNumber: (_value: number) => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeNumber, setThemeNumberState] = useState(() => {
    const saved = localStorage.getItem("themeNumber");
    return saved !== null ? clampThemeIndex(Number(saved)) : ActualthemeNumber;
  });

  const setThemeNumber = useCallback((value: number) => {
    setThemeNumberState(clampThemeIndex(value));
  }, []);

  useEffect(() => {
    localStorage.setItem("themeNumber", String(themeNumber));
  }, [themeNumber]);

  return (
    <ThemeContext.Provider value={{ themeNumber, setThemeNumber }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
