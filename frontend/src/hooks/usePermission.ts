import { useCallback } from "react";
import { useAuth } from "../context/AuthContext";

export function usePermission() {
  const { user } = useAuth();
  const isOwner = Boolean(user?.is_owner || user?.role_name === "OWNER");

  const hasPermission = useCallback(
    (code: string): boolean => {
      if (!user) return false;
      if (isOwner) return true;
      return user.permissions.includes(code);
    },
    [user, isOwner]
  );

  const hasAnyPermission = useCallback(
    (codes: string[]): boolean => {
      if (!user) return false;
      if (isOwner) return true;
      return codes.some((c) => user.permissions.includes(c));
    },
    [user, isOwner]
  );

  return { isOwner, hasPermission, hasAnyPermission };
}
