import { YellowFrame } from '../components/YellowFrame.js';

/** Introduction rapide : dashboard synthétique + sidebar */
export function SceneIntro() {
  return (
    <div className="pub-scene pub-scene-intro">
      <YellowFrame>
        <div className="pub-mock-app">
          <aside className="pub-mock-sidebar">
            <div className="pub-mock-sidebar__logo" />
            {['Accueil', 'Patients', 'Actes', 'Statistiques'].map((x) => (
              <div key={x} className="pub-mock-sidebar__item">
                {x}
              </div>
            ))}
          </aside>
          <main className="pub-mock-main">
            <header className="pub-mock-toolbar">
              <span className="pub-mock-breadcrumb">Tableau de bord</span>
              <span className="pub-mock-notif">3</span>
            </header>
            <div className="pub-intro-cards">
              <div className="pub-intro-card pub-intro-card--a">
                <span>Rendez-vous</span>
                <strong>12</strong>
                <small>Aujourd’hui</small>
              </div>
              <div className="pub-intro-card pub-intro-card--b">
                <span>Patients</span>
                <strong>1 248</strong>
                <small>Actifs</small>
              </div>
              <div className="pub-intro-card pub-intro-card--c">
                <span>Actes</span>
                <strong>386</strong>
                <small>Ce mois</small>
              </div>
              <div className="pub-intro-card pub-intro-card--d">
                <span>Encaissements</span>
                <strong>2,4 M</strong>
                <small>FCFA</small>
              </div>
            </div>
          </main>
        </div>
      </YellowFrame>
    </div>
  );
}
