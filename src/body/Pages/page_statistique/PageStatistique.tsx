import React, { useCallback, useEffect, useState } from "react";
import { Container, Row, Col, Card, Spinner } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import "./css/pageStatistique.css";
import NavTop from "../../Modules/NavTop.js";
import { useSession } from "../../context/SessionContext.js";
import { useNavigationParams } from "../../hooks/useNavigationParams.js";
import { themes } from "../../../constants/index.ts";
import { useTheme } from "../../context/ThemeContext.js";
import AutorisationController from "../../controllers/AutorisationController.js";
import { useAlert } from "../../context/SearchContext.js";
import { checkPrivilege } from "../../helpers/helpers.js";
import { StatistiquesActesView } from "./StatistiquesActesView.js";

/**
 * Page Statistiques — coquille : navigation, droits (stt01), contenu dans StatistiquesActesView.
 */
export default function PageStatistique() {
  const navigate = useNavigate();
  const { isAuthenticated, session } = useSession();
  const { userId, tabId: tabFromNav, pays: paysFromNav } = useNavigationParams();
  const tabId = tabFromNav || session.tabId || "";
  const pays = paysFromNav || session.pays || "";
  const effectiveUserId = userId || session.userId || "";

  const { themeNumber } = useTheme();
  const theme = themes[themeNumber];
  const { setAlertObj } = useAlert();

  const [peutVoir, setPeutVoir] = useState(false);
  const [verificationEnCours, setVerificationEnCours] = useState(true);

  useEffect(() => {
    if (!isAuthenticated && !(effectiveUserId && tabId)) {
      navigate("/");
    }
  }, [isAuthenticated, effectiveUserId, tabId, navigate]);

  const verifierDroits = useCallback(async () => {
    setVerificationEnCours(true);
    try {
      const privs = await AutorisationController(pays ?? "").recupererPriviliegesDuUser(
        effectiveUserId,
        tabId
      );
      if (!privs?.length) {
        navigate("/");
        setAlertObj({
          type: "error",
          show: true,
          text: "Session invalide. Veuillez vous reconnecter.",
        });
        setPeutVoir(false);
        return;
      }
      const ok = checkPrivilege("stt01", privs);
      setPeutVoir(ok);
      if (!ok) {
        setAlertObj({
          type: "warning",
          show: true,
          text: "Vous n'avez pas les droits pour accéder aux statistiques.",
        });
      }
    } catch (e) {
      console.error(e);
      navigate("/");
      setAlertObj({
        type: "error",
        show: true,
        text: "Session expirée. Veuillez vous reconnecter.",
      });
      setPeutVoir(false);
    } finally {
      setVerificationEnCours(false);
    }
  }, [effectiveUserId, tabId, pays, navigate, setAlertObj]);

  useEffect(() => {
    void verifierDroits();
  }, [verifierDroits]);

  const tabPourStats = tabId || session.tabId || "main";
  const paysPourStats = pays || session.pays || "";

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <NavTop userId={effectiveUserId} id="nav-top" tabId={tabId} pays={pays} />

      <Container
        className="mt-4 flex-grow-1"
        style={{ color: theme.secondary, flex: 1 }}
      >
        <Row>
          <Col md={12}>
            <Card
              className="mb-4 border-0 shadow-sm"
              style={{
                backgroundColor: theme.secondary,
                color: theme.primary,
                overflow: "hidden",
              }}
            >
              <Card.Header
                as="header"
                className="d-flex align-items-center justify-content-between py-3"
                style={{
                  backgroundColor: theme.primary,
                  color: theme.secondary,
                }}
              >
                <Card.Title className="mb-0 h5"></Card.Title>
              </Card.Header>
              <Card.Body className="p-3 p-md-4">
                {verificationEnCours ? (
                  <div
                    className="d-flex flex-column align-items-center justify-content-center py-5 gap-2"
                    style={{ color: theme.primary }}
                  >
                    <Spinner animation="border" role="status" variant="dark" />
                    <span>Vérification des accès…</span>
                  </div>
                ) : peutVoir ? (
                  <StatistiquesActesView tabId={tabPourStats} pays={paysPourStats} />
                ) : (
                  <div className="alert alert-warning mb-0 text-center" role="alert">
                    Accès refusé. Demandez la permission « statistiques » (stt01) au praticien
                    responsable.
                  </div>
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </div>
  );
}
