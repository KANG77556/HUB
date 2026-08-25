import { useState } from 'react';

import type { ServerChangeInput } from '../shared/contracts.js';
import { DashboardScreen } from './components/DashboardScreen.js';
import { LoginScreen } from './components/LoginScreen.js';
import { SecurityBlockedScreen } from './components/SecurityBlockedScreen.js';
import { ServerChangeDialog } from './components/ServerChangeDialog.js';
import { useAppController } from './state/useAppController.js';

export function App(): React.JSX.Element {
  const controller = useAppController();
  const [serverChangeOpen, setServerChangeOpen] = useState(false);

  const openServerChange = (): void => {
    controller.clearServerChangeError();
    setServerChangeOpen(true);
  };

  const closeServerChange = (): void => {
    controller.clearServerChangeError();
    setServerChangeOpen(false);
  };

  const submitServerChange = async (
    input: ServerChangeInput,
  ): Promise<boolean> => {
    const changed = await controller.requestServerChange(input);
    if (changed) {
      setServerChangeOpen(false);
    }
    return changed;
  };

  let screen: React.JSX.Element;
  switch (controller.state.kind) {
    case 'restoring':
      screen = (
        <main className="bootstrap-screen">
          <section className="bootstrap-card" aria-live="polite">
            <div className="loading-mark" aria-hidden="true" />
            <p className="eyebrow">SchoolWorkHub</p>
            <h1>세션을 확인하고 있습니다.</h1>
            <p>학교 서버 보안 연결과 저장된 로그인 정보를 확인하는 중입니다.</p>
          </section>
        </main>
      );
      break;
    case 'signed-out':
      screen = (
        <LoginScreen
          message={controller.state.message}
          busy={controller.busy}
          onLogin={controller.login}
          onChangeServer={
            controller.state.canChangeServer ? openServerChange : null
          }
        />
      );
      break;
    case 'security-blocked':
      screen = (
        <SecurityBlockedScreen
          code={controller.state.code}
          onChangeServer={openServerChange}
        />
      );
      break;
    case 'ready':
      screen = (
        <DashboardScreen
          session={controller.state.session}
          dashboard={controller.state.dashboard}
          connection={controller.state.connection}
          summary={controller.summary}
          busy={controller.busy}
          onLogout={controller.logout}
        />
      );
      break;
  }

  return (
    <>
      {screen}
      {serverChangeOpen ? (
        <ServerChangeDialog
          busy={controller.busy}
          error={controller.serverChangeError}
          onCancel={closeServerChange}
          onSubmit={submitServerChange}
        />
      ) : null}
    </>
  );
}
