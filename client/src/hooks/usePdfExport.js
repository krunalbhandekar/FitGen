import { useCallback, useState } from 'react';

/**
 * Runs a PDF export, tracking the in-flight and failure states.
 *
 * The export functions are async because jsPDF is fetched on the first click
 * (see `lib/pdf.js`). Two things follow that a bare `onClick` would get wrong:
 * the first click has a visible delay while the chunk downloads, so the button
 * needs a busy state; and the chunk fetch can fail on a poor connection, so the
 * rejection needs somewhere to go other than an unhandled promise.
 */
export const usePdfExport = () => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = useCallback(async (exporter) => {
    setBusy(true);
    setError(null);
    try {
      await exporter();
    } catch (err) {
      console.error('[FitGen] PDF export failed:', err);
      setError('Could not build the PDF. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }, []);

  return { run, busy, error, dismissError: () => setError(null) };
};
