import { DashboardScreen } from './components/DashboardScreen.js';
import { LoginScreen } from './components/LoginScreen.js';
import { SecurityBlockedScreen } from './components/SecurityBlockedScreen.js';
import { useAppController } from './state/useAppController.js';

export function App(): React.JSX.Element {
  const controller = useAppController();

  switch (controller.state.kind) {
    case 'restoring':
      return (
        <main className="bootstrap-screen">
          <section className="bootstrap-card" aria-live="polite">
            <div className="loading-mark" aria-hidden="true" />
            <p className="eyebrow">SchoolWorkHub</p>
            <h1>세션을 확인하고 있습니다.</h1>
            <p>학교 서버 보안 연결과 저장된 로그인 정보를 확인하는 중입니다.</p>
          </section>
        </main>
      );
    case 'signed-out':
      return (
        <LoginScreen
          message={controller.state.message}
          busy={controller.busy}
          onLogin={controller.login}
        />
      );
    case 'security-blocked':
      return <SecurityBlockedScreen code={controller.state.code} />;
    case 'ready':
      return (
        <DashboardScreen
          session={controller.state.session}
          dashboard={controller.state.dashboard}
          connection={controller.state.connection}
          summary={controller.summary}
          busy={controller.busy}
          onLogout={controller.logout}
        />
      );
  }
}
