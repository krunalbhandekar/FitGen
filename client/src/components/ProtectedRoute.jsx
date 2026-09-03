import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { EmptyState, Spinner } from './ui';
import { ShieldOff } from 'lucide-react';

/**
 * Route guard. `role` additionally requires that role (RBAC).
 * Renders nothing decisive until the session has been rehydrated, so a
 * signed-in user reloading a deep link is not bounced to /login.
 */
export const ProtectedRoute = ({ role }) => {
  const { isAuthenticated, user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <Spinner label="Checking your session" className="min-h-[60vh]" />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (role && user.role !== role) {
    return (
      <div className="shell py-16">
        <EmptyState
          icon={ShieldOff}
          title="Admins only"
          description={`This area requires the "${role}" role. You are signed in as "${user.role}".`}
        />
      </div>
    );
  }

  return <Outlet />;
};
