import { useEffect } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { AlertTriangle, ArrowLeft, Check, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Badge, Logo } from '../components/ui';

const PROMISES = [
  'No password to create or remember',
  'Your identity verified by Google',
  'Plans rebuilt whenever your goals change',
];

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export const Login = () => {
  const { isAuthenticated, signInWithGoogle, signingIn, error, setError, loading } =
    useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Clear a stale error (e.g. "session expired") when arriving fresh.
  useEffect(() => () => setError(null), [setError]);

  if (loading) {
    return (
      <div className="grid min-h-[70vh] place-items-center">
        <Loader2 size={24} className="animate-spin text-volt" aria-hidden="true" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to={location.state?.from ?? '/dashboard'} replace />;
  }

  const handleSuccess = async (response) => {
    try {
      const { user } = await signInWithGoogle(response.credential);
      // Anyone without a completed profile goes straight into the wizard;
      // everyone else resumes wherever they were headed.
      const destination = user.onboardingCompleted
        ? (location.state?.from ?? '/dashboard')
        : '/onboarding';
      navigate(destination, { replace: true });
    } catch {
      // Error surfaced through context.
    }
  };

  return (
    <div className="shell grid min-h-[calc(100vh-4rem)] items-center gap-12 py-12 lg:grid-cols-2 lg:gap-20">
      {/* Pitch — hidden on mobile so the form is immediately actionable */}
      <div className="hidden lg:block">
        <Badge tone="volt">Members</Badge>
        <h1 className="display-lg mt-5 text-balance">
          Welcome back to the <span className="text-volt">work</span>.
        </h1>
        <p className="mt-5 max-w-md text-fog">
          One account holds your split, your macros, your logs and your progress. Sign
          in and pick up where you left off.
        </p>

        <ul className="mt-9 space-y-3">
          {PROMISES.map((promise) => (
            <li key={promise} className="flex items-center gap-3 text-sm text-fog">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-volt/15 text-volt">
                <Check size={12} aria-hidden="true" />
              </span>
              {promise}
            </li>
          ))}
        </ul>
      </div>

      {/* Sign-in card */}
      <div className="mx-auto w-full max-w-md">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-fog-dim transition-colors hover:text-chalk"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Back to home
        </Link>

        <div className="panel p-6 sm:p-8">
          <div className="lg:hidden">
            <Logo />
          </div>

          <h2 className="display-md mt-5 lg:mt-0">Sign in</h2>
          <p className="mt-2 text-sm text-fog">
            FitGen uses Google sign-in only — it is the same account for signing up and
            signing in.
          </p>

          {error && (
            <div
              role="alert"
              className="mt-5 flex items-start gap-2.5 rounded-xl border border-ember/30 bg-ember/8 p-3.5 text-sm text-ember"
            >
              <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <div className="mt-7">
            {!GOOGLE_CLIENT_ID ? (
              <div className="rounded-xl border border-ember/30 bg-ember/8 p-4 text-sm text-fog">
                <p className="font-semibold text-ember">Google sign-in not configured</p>
                <p className="mt-2">
                  Set <code className="text-chalk">VITE_GOOGLE_CLIENT_ID</code> in{' '}
                  <code className="text-chalk">client/.env</code> and restart the dev
                  server. See the README for the Google Cloud Console steps.
                </p>
              </div>
            ) : signingIn ? (
              <div className="flex h-11 items-center justify-center gap-2.5 rounded-xl border border-line text-sm text-fog">
                <Loader2 size={16} className="animate-spin text-volt" aria-hidden="true" />
                Signing you in…
              </div>
            ) : (
              /*
               * GoogleLogin renders inside a Google-controlled iframe, so it
               * cannot inherit our styling — centring it keeps the card tidy at
               * every width. No `width` prop either: a hard-coded value
               * overflows the card on a narrow phone.
               */
              <div className="flex justify-center [color-scheme:light]">
                <GoogleLogin
                  onSuccess={handleSuccess}
                  onError={() =>
                    setError('Google sign-in was cancelled or blocked. Please try again.')
                  }
                  theme="filled_black"
                  size="large"
                  shape="pill"
                  text="continue_with"
                />
              </div>
            )}
          </div>

          <p className="mt-7 border-t border-line pt-5 text-xs leading-relaxed text-fog-dim">
            By continuing you agree that FitGen stores your profile, plans and training
            logs so it can personalise your programme. FitGen does not provide medical
            advice.
          </p>
        </div>
      </div>
    </div>
  );
};
