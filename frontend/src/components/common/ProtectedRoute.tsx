import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { usePermission } from "../../hooks/usePermission";

interface ProtectedRouteProps {
  children: React.ReactNode;
  anyPermissions?: string[];
  ownerOnly?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  anyPermissions,
  ownerOnly = false,
}) => {
  const { user, loading, ownerInitialized } = useAuth();
  const { isOwner, hasAnyPermission } = usePermission();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-2">
          <div className="h-10 w-10 border-4 border-navy-700 border-t-gold-500 rounded-full animate-spin mx-auto" />
          <p className="text-sm font-medium text-slate-600">Loading Sri Vasavi Textiles ERP...</p>
        </div>
      </div>
    );
  }

  if (ownerInitialized === false) {
    return <Navigate to="/setup-owner" replace />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (ownerOnly && !isOwner) {
    return (
      <div className="card p-8 text-center max-w-lg mx-auto mt-12">
        <h2 className="text-lg font-bold text-navy-900">Owner Authorization Required</h2>
        <p className="text-sm text-slate-600 mt-2">
          This module is restricted exclusively to the Business Owner.
        </p>
      </div>
    );
  }

  if (anyPermissions && anyPermissions.length > 0 && !hasAnyPermission(anyPermissions)) {
    return (
      <div className="card p-8 text-center max-w-lg mx-auto mt-12">
        <h2 className="text-lg font-bold text-navy-900">Access Restricted</h2>
        <p className="text-sm text-slate-600 mt-2">
          Your role ({user.role_display_name}) does not currently have permission to view this section.
        </p>
      </div>
    );
  }

  return <>{children}</>;
};

