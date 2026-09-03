import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { SERVER_AWAKE_EVENT, SERVER_WAKING_EVENT } from '../lib/api';

/**
 * Toast shown when a request has been in flight long enough that the server is
 * probably cold-starting.
 *
 * The free hosting tier idles the instance after inactivity and takes 30-60
 * seconds to come back. Without this, the first request of a session looks like
 * the app has frozen, and the natural reaction is to reload — which restarts the
 * wait. Saying what is happening turns an apparent bug into an expected pause.
 *
 * Mounted once at app level rather than per page, so any slow call anywhere
 * surfaces it.
 */
export const ServerWaking = () => {
  const [waking, setWaking] = useState(false);

  useEffect(() => {
    const show = () => setWaking(true);
    const hide = () => setWaking(false);

    window.addEventListener(SERVER_WAKING_EVENT, show);
    window.addEventListener(SERVER_AWAKE_EVENT, hide);

    return () => {
      window.removeEventListener(SERVER_WAKING_EVENT, show);
      window.removeEventListener(SERVER_AWAKE_EVENT, hide);
    };
  }, []);

  if (!waking) return null;

  return (
    <div
      // `polite` rather than `assertive`: informative, not urgent.
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-sm sm:inset-x-auto sm:right-6 sm:bottom-6"
    >
      <div className="panel flex items-start gap-3 px-4 py-3 shadow-xl">
        <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-volt" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">Waking the server</p>
          <p className="mt-0.5 text-xs leading-relaxed text-fog">
            The free hosting tier sleeps when idle. The first request can take up
            to a minute — no need to reload.
          </p>
        </div>
      </div>
    </div>
  );
};
