import { useState } from 'react';
import type { Session } from './lib/auth';
import { LoginForm } from './components/LoginForm';
import { QuotePanel } from './components/QuotePanel';

export function App() {
  const [session, setSession] = useState<Session | null>(null);

  return (
    <main className="min-h-screen bg-slate-100 py-8 px-4">
      {session ? (
        <QuotePanel
          token={session.token}
          merchant={session.merchant}
          onLogout={() => setSession(null)}
        />
      ) : (
        <LoginForm onLogin={setSession} />
      )}
    </main>
  );
}