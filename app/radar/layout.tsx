import './radar-fixes.css';
import RadarCleanup from './cleanup';

export default function RadarLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RadarCleanup />
      {children}
    </>
  );
}
