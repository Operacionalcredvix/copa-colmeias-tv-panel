import '../tv-operacional-fix.css';
import TvDataCorrections from './TvDataCorrections';

export default function TvOperacionalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <TvDataCorrections />
    </>
  );
}
