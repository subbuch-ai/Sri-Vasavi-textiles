import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, tokenStorage } from "../services/api";
import { BusinessSettings, TokenResponse, User } from "../types/auth";

interface AuthContextValue {
  user: User | null;
  settings: BusinessSettings | null;
  ownerInitialized: boolean | null;
  loading: boolean;
  login: (usernameOrEmail: string, password: string) => Promise<void>;
  setupOwner: (payload: {
    username: string;
    email: string;
    full_name: string;
    mobile?: string;
    password: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  refreshSettings: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [ownerInitialized, setOwnerInitialized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSettings = useCallback(async () => {
    try {
      const res = await api.get<BusinessSettings>("/settings");
      setSettings(res.data);
    } catch {
      // ignore if unauthenticated
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const token = tokenStorage.getAccess();
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const res = await api.get<User>("/auth/me");
      setUser(res.data);
      await refreshSettings();
    } catch {
      tokenStorage.clear();
      setUser(null);
    }
  }, [refreshSettings]);

  useEffect(() => {
    const init = async () => {
      try {
        const statusRes = await api.get<{ owner_initialized: boolean }>("/auth/setup-status");
        setOwnerInitialized(statusRes.data.owner_initialized);
      } catch {
        setOwnerInitialized(true);
      }
      await refreshUser();
      setLoading(false);
    };
    init();
  }, [refreshUser]);

  const login = async (usernameOrEmail: string, password: string) => {
    const res = await api.post<TokenResponse>("/auth/login", {
      username_or_email: usernameOrEmail,
      password,
    });
    tokenStorage.setTokens(res.data.access_token, res.data.refresh_token);
    setUser(res.data.user);
    setOwnerInitialized(true);
    await refreshSettings();
  };

  const setupOwner = async (payload: {
    username: string;
    email: string;
    full_name: string;
    mobile?: string;
    password: string;
  }) => {
    const res = await api.post<TokenResponse>("/auth/setup-owner", payload);
    tokenStorage.setTokens(res.data.access_token, res.data.refresh_token);
    setUser(res.data.user);
    setOwnerInitialized(true);
    await refreshSettings();
  };

  const logout = async () => {
    const refreshToken = tokenStorage.getRefresh();
    try {
      if (refreshToken) {
        await api.post("/auth/logout", { refresh_token: refreshToken });
      }
    } catch {
      // ignore logout transport error
    } finally {
      tokenStorage.clear();
      setUser(null);
      setSettings(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        settings,
        ownerInitialized,
        loading,
        login,
        setupOwner,
        logout,
        refreshUser,
        refreshSettings,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

