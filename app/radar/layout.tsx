import './radar-fixes.css';
import './panel-title-fix.css';
import './panel-title-hardfix.css';
import RadarCleanup from './cleanup';

export default function RadarLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RadarCleanup />
      {children}
    </>
  );
}
