import { HashRouter as Router, Route, Routes, Navigate, useParams } from "react-router-dom";
import { ThemeProvider } from "react-bootstrap";
import Footer from "./body/Modules/Footer";
import { Alert } from "./body/Modules/Alert";
import { ClearParamsOnConnectionPage } from "./body/components/ClearParamsOnConnectionPage";
import ModalChangementMotDePasse from "./body/Modules/ModalChangementMotDePasse";
import ModalChangementEmailDemoDocteur from "./body/Modules/ModalChangementEmailDemoDocteur";
import ModalCorruptionDonnees from "./body/Modules/ModalCorruptionDonnees";
import { useNavigationParams } from "./body/hooks/useNavigationParams";

// Import direct : les imports dynamiques (lazy) échouent avec le protocole tauri://
import PageOuverture from "./body/Pages/PageOuverture";
import PageScanQR from "./body/Pages/PageScanQR";
import PageConnection from "./body/Pages/pages_connection/PageConnection";
import PageProfil from "./body/Pages/page_profil/PageProfil";
import PageParametre from "./body/Pages/page_parametre/PageParametre";
import PageStatistique from "./body/Pages/page_statistique/PageStatistique";
import PagePatientDetail from "./body/Pages/page_patient_detail/PagePatientDetail";
import PageEtat from "./body/Pages/page_etat/PageEtat";
import PopupRappel from "./body/Modules/PopupRappel";
import { WebBackendBanner } from "./body/Modules/WebBackendBanner";

const routerFutureFlags = { v7_startTransition: true, v7_relativeSplatPath: true };

/** Ancienne URL avec userId/tabId/pays dans le chemin → `/patient-detail/:patientId` uniquement. */
function LegacyPatientDetailRedirect() {
  const { patientId } = useParams<{ patientId: string }>();
  return <Navigate to={patientId ? `/patient-detail/${patientId}` : "/patient-detail"} replace />;
}

function AppContent() {
  const { tabId } = useNavigationParams();
  const isAdmin = tabId === 'admin';
  return (
    <>
        <WebBackendBanner />
        <ClearParamsOnConnectionPage />
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1 }}>
        <Routes>
            <Route path="/" element={<PageOuverture />} />
            <Route path="/scan" element={<PageScanQR />} />
            <Route path="/nouveau-compte" element={<Navigate to="/connection" replace />} />
            <Route path="/connection" element={<PageConnection />} />

            {/* Routes avec params URL (compatibilité Web) */}
            <Route path="/profil/:userId/:tabId/:pays" element={<PageProfil />} />
            <Route path="/parametres/:userId/:tabId/:pays" element={<PageParametre />} />
            <Route path="/statistique/:userId/:tabId/:pays" element={<PageStatistique />} />
            <Route path="/etats/:userId/:tabId/:pays" element={<PageEtat />} />

            {/* Ancienne URL liste patients → dossier unique */}
            <Route path="/patient" element={<PagePatientDetail /> } />
            <Route path="/patient/:userId/:tabId/:pays" element={<PagePatientDetail />} />

            {/* Fiche patient : session pour userId/tabId/pays — URL = patientId seul si besoin */}
            <Route path="/patient-detail/:patientId/:userId/:tabId/:pays" element={<LegacyPatientDetailRedirect />} />
            <Route path="/patient-detail/:patientId" element={<PagePatientDetail />} />
            <Route path="/patient-detail" element={<PagePatientDetail />} />

            {/* Routes sans params (session/state) */}
            <Route path="/profil" element={<PageProfil />} />
            <Route path="/parametres" element={<PageParametre />} />
            <Route path="/statistique" element={<PageStatistique />} />
            <Route path="/etats" element={<PageEtat />} />
            <Route path="*" element={<PageOuverture />} />
          </Routes>
        </div>

        <Footer isAdmin={isAdmin}/>
        </div>
        <Alert />
        <ModalChangementMotDePasse />
        <ModalChangementEmailDemoDocteur />
        <ModalCorruptionDonnees />
        <PopupRappel />
    </>
  );
}

function App() {
  return (
    <ThemeProvider>
      <Router future={routerFutureFlags}>
        <AppContent />
      </Router>
    </ThemeProvider>
  );
}

export default App;
