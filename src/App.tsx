import { Suspense, lazy } from "react";
import { HashRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import PageConnection from "./pages/PageConnection";
import { WebBackendBanner } from "./components/WebBackendBanner";
import { AppAlert } from "./components/AppAlert";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Loading } from "./items";

const StockLayout = lazy(() => import("./body/Pages/stock/StockLayout"));
const StockDashboard = lazy(() => import("./body/Pages/stock/StockDashboard"));
const StockArticlesLayout = lazy(() => import("./body/Pages/stock/StockArticlesLayout"));
const StockArticleList = lazy(() => import("./body/Pages/stock/StockArticleList"));
const StockArticleUnits = lazy(() => import("./body/Pages/stock/StockArticleUnits"));
const StockArticleCategories = lazy(() => import("./body/Pages/stock/StockArticleCategories"));
const StockArticleCurrencies = lazy(() => import("./body/Pages/stock/StockArticleCurrencies"));
const StockArticleLocations = lazy(() => import("./body/Pages/stock/StockArticleLocations"));
const StockWarehouseLayout = lazy(() => import("./body/Pages/stock/StockWarehouseLayout"));
const StockWarehouseRedirect = lazy(() => import("./body/Pages/stock/StockWarehouseRedirect"));
const StockMovements = lazy(() => import("./body/Pages/stock/StockMovements"));
const StockFournisseurs = lazy(() => import("./body/Pages/stock/StockFournisseurs"));
const StockClients = lazy(() => import("./body/Pages/stock/StockClients"));
const StockDocumentsLayout = lazy(() => import("./body/Pages/stock/StockDocumentsLayout"));
const StockDocumentsList = lazy(() => import("./body/Pages/stock/StockDocumentsList"));
const StockDocumentPrintModelsPage = lazy(() => import("./body/Pages/stock/StockDocumentPrintModelsPage"));
const StockDocumentPrintModelEditor = lazy(() => import("./body/Pages/stock/StockDocumentPrintModelEditor"));
const StockUserPage = lazy(() => import("./body/Pages/stock/StockUserPage"));
const StockCollaborateurLayout = lazy(() => import("./body/Pages/stock/StockCollaborateurLayout"));
const StockRolesPage = lazy(() => import("./body/Pages/stock/StockRolesPage"));
const StockCircuitsLayout = lazy(() => import("./body/Pages/stock/StockCircuitsLayout"));
const StockCircuitList = lazy(() => import("./body/Pages/stock/StockCircuitList"));
const StockCircuitEditor = lazy(() => import("./body/Pages/stock/StockCircuitEditor"));
const StockFormTemplatesList = lazy(() => import("./body/Pages/stock/StockFormTemplatesList"));
const StockFormTemplateEditor = lazy(() => import("./body/Pages/stock/StockFormTemplateEditor"));
const StockCircuitFillPage = lazy(() => import("./body/Pages/stock/StockCircuitFillPage"));

const routerFutureFlags = { v7_startTransition: true, v7_relativeSplatPath: true };

function AppContent() {
  return (
    <>
      <WebBackendBanner />
      <Suspense
        fallback={
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "40vh" }}>
            <Loading size="large" />
          </div>
        }
      >
        <Routes>
          <Route path="/connection" element={<PageConnection />} />
          <Route
            path="/stock"
            element={
              <ProtectedRoute>
                <StockLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<StockDashboard />} />
            <Route path="articles" element={<StockArticlesLayout />}>
              <Route index element={<StockArticleList />} />
              <Route path="units" element={<StockArticleUnits />} />
              <Route path="categories" element={<StockArticleCategories />} />
              <Route path="devises" element={<StockArticleCurrencies />} />
            </Route>
            <Route path="warehouse">
              <Route index element={<StockWarehouseRedirect />} />
              <Route path=":warehouseId" element={<StockWarehouseLayout />}>
                <Route index element={<StockArticleLocations />} />
              </Route>
            </Route>
            <Route path="movements" element={<StockMovements />} />
            <Route path="fournisseurs" element={<StockFournisseurs />} />
            <Route path="clients" element={<StockClients />} />
            <Route path="documents" element={<StockDocumentsLayout />}>
              <Route index element={<StockDocumentsList />} />
              <Route path="models" element={<StockDocumentPrintModelsPage />} />
              <Route path="models/:modelId" element={<StockDocumentPrintModelEditor />} />
            </Route>
            <Route path="circuits" element={<StockCircuitsLayout />}>
              <Route index element={<StockCircuitList />} />
              <Route path="forms" element={<StockFormTemplatesList />} />
              <Route path="forms/new" element={<StockFormTemplateEditor />} />
              <Route path="forms/:templateId/edit" element={<StockFormTemplateEditor />} />
              <Route path="fill" element={<StockCircuitFillPage />} />
              <Route path="new" element={<StockCircuitEditor />} />
              <Route path=":circuitId/edit" element={<StockCircuitEditor />} />
            </Route>
            <Route path="user" element={<StockCollaborateurLayout />}>
              <Route index element={<StockUserPage />} />
              <Route path="roles" element={<StockRolesPage />} />
            </Route>
          </Route>
          <Route path="/" element={<Navigate to="/connection" replace />} />
          <Route path="*" element={<Navigate to="/connection" replace />} />
        </Routes>
      </Suspense>
      <AppAlert />
    </>
  );
}

export default function App() {
  return (
    <Router future={routerFutureFlags}>
      <AppContent />
    </Router>
  );
}
