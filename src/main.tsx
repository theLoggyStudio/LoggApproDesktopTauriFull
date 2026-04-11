import { createRoot } from 'react-dom/client'
import 'bootstrap/dist/css/bootstrap.min.css'
import './index.css'
import './body/style.css'
import App from './App.tsx'
import React from 'react';
import { ThemeProvider, useTheme } from './body/context/ThemeContext.tsx'
import { ItemsTabProvider } from './body/context/SearchContext.tsx'
import { ModeProvider } from './body/context/SearchContext.tsx'
import { SearchProvider } from './body/context/SearchContext.tsx'
import { AlertProvider } from './body/context/SearchContext.tsx'
import { SessionProvider } from './body/context/SessionContext.tsx'
import { themes } from './constants/index.ts'
import { runTestsProvisoires } from './body/utils/TestsProvisoires.ts'

// Expose pour tests manuels en console (provisoire)
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as any).runTestsProvisoires = runTestsProvisoires;
}

function ThemeCssSync({ children }: { children: React.ReactNode }) {
  const { themeNumber } = useTheme();
  React.useEffect(() => {
    const t = themes[themeNumber] as Record<string, string>;
    const root = document.documentElement;
    Object.entries(t).forEach(([k, v]) => root.style.setProperty(`--${k}`, v));
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
    window.dispatchEvent(new Event('loggappro-ready'));
    console.error('LoggAppro Error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: 'sans-serif', color: '#333', maxWidth: 600, margin: '0 auto' }}>
          <h2>Une erreur s'est produite</h2>
          <p style={{ color: '#c00', fontWeight: 'bold' }}>{this.state.error.message}</p>
          {this.state.errorInfo?.componentStack && (
            <pre style={{ fontSize: 11, overflow: 'auto', background: '#f5f5f5', padding: 12, borderRadius: 4 }}>
              {this.state.errorInfo.componentStack}
            </pre>
          )}
          <p>Veuillez redémarrer l'application.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

function SplashReady({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    window.dispatchEvent(new Event('loggappro-ready'));
  }, []);
  return <>{children}</>;
}

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      <ThemeProvider>
      <ThemeCssSync>
      <SplashReady>
      <ModeProvider>
        <SessionProvider>
          <ItemsTabProvider>
            <SearchProvider>
              <AlertProvider>
                <App />
              </AlertProvider>
            </SearchProvider>
          </ItemsTabProvider>
        </SessionProvider>
      </ModeProvider>
      </SplashReady>
      </ThemeCssSync>
      </ThemeProvider>
    </AppErrorBoundary>
  </React.StrictMode>
);
