import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '@/components/sidebar';
import { Providers } from '@/lib/providers';
import { ErrorBoundary } from '@/components/error-boundary';
import { ConnectionStatus } from '@/components/connection-status';

export const metadata: Metadata = {
  title: 'Cortex — Memory Dashboard',
  description: 'Persistent memory for Claude Code',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <ConnectionStatus />
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 overflow-auto">
              <ErrorBoundary>
                {children}
              </ErrorBoundary>
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
