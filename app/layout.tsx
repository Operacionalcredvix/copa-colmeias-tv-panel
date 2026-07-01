import type { Metadata } from 'next';
import './globals.css';
import './final-overrides.css';
import './tv-final-touches.css';

export const metadata: Metadata = {
  title: 'Copa das Colmeias - Painel TV',
  description: 'Painel ao vivo da Copa das Colmeias para exibicao interna em TV.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
