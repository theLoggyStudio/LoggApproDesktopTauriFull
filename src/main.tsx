import { createRoot } from "react-dom/client";
import "./index.css";
import "./app.css";
import App from "./App";
import React from "react";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { AlertProvider } from "./context/AlertContext";
import { SessionProvider } from "./body/context/SessionContext";
import { themes, type ThemeColors } from "./constants";
import { AntdThemeBridge } from "./components/AntdThemeBridge";

function ThemeCssSync({ children }: { children: React.ReactNode }) {
  const { themeNumber } = useTheme();
  React.useEffect(() => {
    const t: ThemeColors = themes[themeNumber] ?? themes[0];
    const root = document.documentElement;
    (Object.keys(t) as (keyof ThemeColors)[]).forEach((k) => {
      const v = t[k];
      if (typeof v === "string" && v.length > 0) root.style.setProperty(`--${k}`, v);
    });
  }, [themeNumber]);
  return <>{children}</>;
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null; errorInfo: React.ErrorInfo | null }
> {
  state = { hasError: false, error: null as Error | null, errorInfo: null as React.ErrorInfo | null };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    window.dispatchEvent(new Event("loggappro-ready"));
    console.error("LoggAppro Error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: "sans-serif", color: "#333", maxWidth: 600, margin: "0 auto" }}>
          <h2>Une erreur s&apos;est produite</h2>
          <p style={{ color: "#c00", fontWeight: "bold" }}>{this.state.error.message}</p>
          {this.state.errorInfo?.componentStack && (
            <pre style={{ fontSize: 11, overflow: "auto", background: "#f5f5f5", padding: 12, borderRadius: 4 }}>
              {this.state.errorInfo.componentStack}
            </pre>
          )}
          <p>Veuillez redémarrer l&apos;application.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

function SplashReady({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    window.dispatchEvent(new Event("loggappro-ready"));
  }, []);
  return <>{children}</>;
}

const root = createRoot(document.getElementById("root")!);
root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      <ThemeProvider>
        <ThemeCssSync>
          <SessionProvider>
            <AlertProvider>
              <AntdThemeBridge>
                <SplashReady>
                  <App />
                </SplashReady>
              </AntdThemeBridge>
            </AlertProvider>
          </SessionProvider>
        </ThemeCssSync>
      </ThemeProvider>
    </AppErrorBoundary>
  </React.StrictMode>
);
