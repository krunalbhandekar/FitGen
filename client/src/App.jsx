import { Route, Routes, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ServerWaking } from './components/ServerWaking';
import { Spinner } from './components/ui';
import { Footer } from './components/Footer';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Exercises } from './pages/Exercises';
import { ExerciseDetail } from './pages/ExerciseDetail';
import { Foods } from './pages/Foods';
import { Admin } from './pages/Admin';
import { Onboarding } from './pages/Onboarding';
import { Profile } from './pages/Profile';
import { WorkoutPlanPage } from './pages/WorkoutPlanPage';
import { DietPlanPage } from './pages/DietPlanPage';
import { LogWorkoutPage } from './pages/LogWorkoutPage';
import { CoachPage } from './pages/CoachPage';
/*
 * Recharts is large and only the progress dashboard uses it, so this route is
 * split out of the initial bundle and fetched on first visit.
 */
const ProgressPage = lazy(() =>
  import('./pages/ProgressPage').then((m) => ({ default: m.ProgressPage })),
);
import { NotFound } from './pages/NotFound';

/** Routers don't reset scroll between pages; this does. */
const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
};

const App = () => {
  const { pathname } = useLocation();

  return (
    <div className="flex min-h-dvh flex-col">
      <ScrollToTop />
      <Navbar />

      <main id="main" className="flex-1">
        {/*
         * Keyed on the path so navigating away from a screen that threw clears
         * the error, rather than the boundary staying stuck on every subsequent
         * route. Sits inside <main> so the navbar survives a crash and the user
         * can still move somewhere else.
         */}
        <ErrorBoundary key={pathname}>
          <Suspense fallback={<Spinner label="Loading" className="min-h-[60vh]" />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />

              <Route element={<ProtectedRoute />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/onboarding" element={<Onboarding />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/plan/workout" element={<WorkoutPlanPage />} />
                <Route path="/plan/diet" element={<DietPlanPage />} />
                <Route path="/log" element={<LogWorkoutPage />} />
                <Route path="/coach" element={<CoachPage />} />
                <Route path="/progress" element={<ProgressPage />} />
                <Route path="/exercises" element={<Exercises />} />
                <Route path="/exercises/:slug" element={<ExerciseDetail />} />
                <Route path="/foods" element={<Foods />} />
              </Route>

              <Route element={<ProtectedRoute role="admin" />}>
                <Route path="/admin" element={<Admin />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>

      <Footer />
      <ServerWaking />
    </div>
  );
};

export default App;
