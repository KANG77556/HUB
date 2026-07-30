import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles.css';

function BootstrapScreen(): React.JSX.Element {
  return (
    <main className="bootstrap-screen">
      <section className="bootstrap-card">
        <p className="eyebrow">SchoolWorkHub</p>
        <h1>교사용 클라이언트를 준비하고 있습니다.</h1>
        <p>보안 세션과 학교 서버 연결을 확인하는 중입니다.</p>
      </section>
    </main>
  );
}

const root = document.getElementById('root');
if (root === null) {
  throw new Error('renderer root is missing');
}

createRoot(root).render(
  <StrictMode>
    <BootstrapScreen />
  </StrictMode>,
);
