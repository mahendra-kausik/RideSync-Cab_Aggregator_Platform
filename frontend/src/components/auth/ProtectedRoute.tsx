import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ProtectedRouteProps } from '@/types';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredRole,
  redirectTo = '/login',
}) => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  // Show loading spinner while checking authentication
  if (isLoading) {
    return <LoadingSpinner />;
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated || !user) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  // Check role-based access if required
  if (requiredRole && user.role !== requiredRole) {
    // Redirect to appropriate dashboard based on user role
    const roleDashboards = {
      rider: '/rider/book',
      driver: '/driver/dashboard',
      admin: '/admin/dashboard',
    };

    return <Navigate to={roleDashboards[user.role]} replace />;
  }

  return <>{children}</>;
};