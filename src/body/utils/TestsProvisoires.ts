/**
 * Tests manuels pour vérifier que chaque fonctionnalité fonctionne.
 * Exécuter depuis la console : window.runTestsProvisoires({ userId, tabId, pays, patientId })
 * Ou cliquer sur le bouton "🧪 Tests" en bas à droite (mode dev)
 */

import { PagePatientDetailController } from "../controllers/PagePatientDetailController";
import { PagePatientController } from "../controllers/PagePatientController";
import { PageParametreController } from "../controllers/PageParametreController";
import { PageProfilController } from "../controllers/PageProfilController";
import { PageStatistiqueController } from "../controllers/PageStatistiqueController";
import TraceController from "../controllers/TraceController";
import TaskController from "../controllers/TaskController";
import { DataImportExportController } from "../controllers/DataImportExportController";
import NavTopController from "../controllers/NavTopController";
import AutorisationController from "../controllers/AutorisationController";

type TestResult = { nom: string; ok: boolean; message: string; duree?: number };

async function runTestsProvisoires(params: {
  userId: string;
  tabId: string;
  pays: string;
  patientId?: string;
}) {
  const { userId, tabId, pays, patientId } = params;
  const results: TestResult[] = [];
  const paysVal = pays || "sn";

  const test = async (
    nom: string,
    fn: () => Promise<any>
  ): Promise<TestResult> => {
    const start = Date.now();
    try {
      const res = await fn();
      const duree = Date.now() - start;
      return { nom, ok: true, message: `OK (${duree}ms)`, duree };
    } catch (e: any) {
      return {
        nom,
        ok: false,
        message: String(e?.message ?? e),
      };
    }
  };

  // === PATIENTS ===
  results.push(
    await test("1. list_patients (listerPatient)", () =>
      PagePatientController(paysVal).listerPatient("client", tabId, 10)
    )
  );

  results.push(
    await test("2. search_patients (chercherPatients)", () =>
      NavTopController(paysVal).chercherPatients(tabId, "")
    )
  );

  if (patientId) {
    results.push(
      await test("3. voirLePatient (get_patient_detail)", () =>
        PagePatientDetailController(paysVal).voirLePatient("client", patientId, tabId)
      )
    );

    results.push(
      await test("4. listerLesActes (list_actes_by_patient)", () =>
        PagePatientDetailController(paysVal).listerLesActes("client", patientId, 50, tabId)
      )
    );

    results.push(
      await test("5. ajouterUnActe (add_acte)", async () => {
        const syncDate = new Date().getTime();
        const newActe = {
          tabId,
          acte: {
            id: syncDate,
            nom: "Test acte provisoire",
            prix: 1000,
            argentRecu: 500,
            argentRestant: 500,
            date: new Date().toISOString(),
            description: "Test",
            isDone: false,
            dateCreation: new Date(),
            loggId: patientId,
          },
          assurance: { id: syncDate, nom: "non-assuré", pourcentage: 0, dateCreation: new Date(), loggId: patientId },
          facture: { id: syncDate, prixActe: 1000, argentRecuActe: 500, argentRestantActe: 500, argentAssurance: 0, acteId: 0, dateCreation: new Date(), loggId: patientId },
          materiels: [],
        };
        return PagePatientDetailController(paysVal).ajouterUnActe("client", newActe);
      })
    );

    results.push(
      await test("6. trouverLesMaterielsParActeId (get_materiels_by_acte)", async () => {
        const actes = await PagePatientDetailController(paysVal).listerLesActes("client", patientId, 1, tabId);
        const acteId = actes?.[0]?.acte?.id;
        if (!acteId) return [];
        return PagePatientDetailController(paysVal).trouverLesMaterielsParActeId("client", String(acteId), tabId);
      })
    );
  }

  // === PRIVILÈGES ===
  results.push(
    await test("7. recupererPriviliegesDuUser (get_user_privileges)", () =>
      AutorisationController(paysVal).recupererPriviliegesDuUser(userId, tabId)
    )
  );

  // === PARAMÈTRES (actes, assurances, matériels) ===
  results.push(
    await test("8. listerLesTypeActes (list_nom_actes)", () =>
      PagePatientDetailController(paysVal).listerLesTypeActes(tabId, 100)
    )
  );

  results.push(
    await test("9. listerLesTypeAssurances (list_nom_assurances)", () =>
      PagePatientDetailController(paysVal).listerLesTypeAssurances(100, tabId)
    )
  );

  results.push(
    await test("10. listerLesNomMateriels (list_nom_materiels)", () =>
      PagePatientDetailController(paysVal).listerLesNomMateriels("client", tabId, 100)
    )
  );

  results.push(
    await test("11. listerUnTypeActe (pageParametre)", () =>
      PageParametreController(paysVal).listerUnTypeActe(tabId, 100)
    )
  );

  results.push(
    await test("12. listerUnTypeAssurance (pageParametre)", () =>
      PageParametreController(paysVal).listerUnTypeAssurance(tabId, 100)
    )
  );

  // === PROFIL ===
  results.push(
    await test("13. voirInfoDocteur (get_docteur_profile)", () =>
      PageProfilController(paysVal).voirInfoDocteur(tabId, tabId)
    )
  );

  // === STATISTIQUES ===
  results.push(
    await test("14. stats_list_nom_actes (recupererLesNomActesExistantes)", async () => {
      const dateFin = new Date();
      const dateDebut = new Date(dateFin);
      dateDebut.setMonth(dateDebut.getMonth() - 1);
      return PageStatistiqueController(paysVal).recupererLesNomActesExistantes(
        dateDebut.toISOString().slice(0, 10),
        dateFin.toISOString().slice(0, 10),
        tabId
      );
    })
  );

  results.push(
    await test("15. stats_get_info (recupererLesStatisiquesDesActes)", async () => {
      const dateFin = new Date();
      const dateDebut = new Date(dateFin);
      dateDebut.setMonth(dateDebut.getMonth() - 1);
      return PageStatistiqueController(paysVal).recupererLesStatisiquesDesActes(
        dateDebut.toISOString().slice(0, 10),
        dateFin.toISOString().slice(0, 10),
        [],
        tabId
      );
    })
  );

  // === TRACES ===
  results.push(
    await test("16. trace_list_pagination", () =>
      TraceController(paysVal).listerTracesAvecPagination(tabId, 5, 0)
    )
  );

  // === TÂCHES ===
  results.push(
    await test("17. task_list", () =>
      TaskController(paysVal).listerTasks(tabId, 10)
    )
  );

  // === IMPORT/EXPORT ===
  results.push(
    await test("18. data_export_list_tables", () =>
      DataImportExportController(paysVal).listTables()
    )
  );

  results.push(
    await test("19. listCustomColumns", () =>
      DataImportExportController(paysVal).listCustomColumns(tabId)
    )
  );

  // Affichage des résultats
  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.filter((r) => !r.ok).length;

  console.group("🧪 TESTS FONCTIONNALITÉS - Résultats");
  results.forEach((r) => {
    console.log(
      r.ok ? "✅" : "❌",
      r.nom,
      r.ok ? `(${r.duree}ms)` : "",
      r.ok ? "" : `→ ${r.message}`
    );
  });
  console.log(`\n📊 Total: ${okCount} OK, ${failCount} échec(s)`);
  console.groupEnd();

  return { results, okCount, failCount };
}

export { runTestsProvisoires };
