import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { storeApi, storeTokenStorage } from "../services/storeApi";
import {
  CartSummary,
  CustomerAuthResponse,
  CustomerMe,
  CustomerNotificationItem,
  StoreCategory,
  StorefrontConfigPublic,
} from "../types/storefront";

interface StoreAuthContextValue {
  customer: CustomerMe | null;
  config: StorefrontConfigPublic | null;
  categories: StoreCategory[];
  cart: CartSummary | null;
  notifications: CustomerNotificationItem[];
  unreadCount: number;
  loading: boolean;
  login: (email_or_mobile: string, password: string) => Promise<CustomerMe>;
  register: (payload: Record<string, unknown>) => Promise<CustomerMe>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshCart: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  refreshPublicMeta: () => Promise<void>;
}

const StoreAuthContext = createContext<StoreAuthContextValue | undefined>(undefined);

const EMPTY_CART: CartSummary = {
  items: [],
  item_count: 0,
  promo_code: null,
  promo_message: null,
  subtotal: 0,
  discount_amount: 0,
  gst_amount: 0,
  delivery_charge: 0,
  total_amount: 0,
};

export const StoreAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [customer, setCustomer] = useState<CustomerMe | null>(null);
  const [config, setConfig] = useState<StorefrontConfigPublic | null>(null);
  const [categories, setCategories] = useState<StoreCategory[]>([]);
  const [cart, setCart] = useState<CartSummary | null>(EMPTY_CART);
  const [notifications, setNotifications] = useState<CustomerNotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshPublicMeta = useCallback(async () => {
    try {
      const [cfgRes, catRes] = await Promise.all([
        storeApi.get<StorefrontConfigPublic>("/config"),
        storeApi.get<StoreCategory[]>("/categories"),
      ]);
      setConfig(cfgRes.data);
      setCategories(catRes.data);
    } catch {
      // Public metadata load failure handled per page
    }
  }, []);

  const refreshCart = useCallback(async () => {
    if (!storeTokenStorage.getAccess()) {
      setCart(EMPTY_CART);
      return;
    }
    try {
      const res = await storeApi.get<CartSummary>("/cart");
      setCart(res.data);
    } catch {
      // ignore if signed out
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    if (!storeTokenStorage.getAccess()) {
      setNotifications([]);
      return;
    }
    try {
      const res = await storeApi.get<CustomerNotificationItem[]>("/notifications");
      setNotifications(res.data);
    } catch {
      // ignore
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    const token = storeTokenStorage.getAccess();
    if (!token) {
      setCustomer(null);
      setCart(EMPTY_CART);
      setNotifications([]);
      return;
    }
    try {
      const res = await storeApi.get<CustomerMe>("/auth/me");
      setCustomer(res.data);
      await Promise.all([refreshCart(), refreshNotifications()]);
    } catch {
      storeTokenStorage.clear();
      setCustomer(null);
      setCart(EMPTY_CART);
      setNotifications([]);
    }
  }, [refreshCart, refreshNotifications]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([refreshPublicMeta(), refreshProfile()]);
      setLoading(false);
    })();
  }, [refreshPublicMeta, refreshProfile]);

  const login = async (email_or_mobile: string, password: string): Promise<CustomerMe> => {
    const res = await storeApi.post<CustomerAuthResponse>("/auth/login", {
      email_or_mobile,
      password,
    });
    storeTokenStorage.setTokens(res.data.access_token, res.data.refresh_token);
    setCustomer(res.data.customer);
    await Promise.all([refreshCart(), refreshNotifications()]);
    return res.data.customer;
  };

  const register = async (payload: Record<string, unknown>): Promise<CustomerMe> => {
    const res = await storeApi.post<CustomerAuthResponse>("/auth/register", payload);
    storeTokenStorage.setTokens(res.data.access_token, res.data.refresh_token);
    setCustomer(res.data.customer);
    await Promise.all([refreshCart(), refreshNotifications()]);
    return res.data.customer;
  };

  const logout = async () => {
    const rt = storeTokenStorage.getRefresh();
    if (rt) {
      try {
        await storeApi.post("/auth/logout", { refresh_token: rt });
      } catch {
        // ignore logout cleanup errors
      }
    }
    storeTokenStorage.clear();
    setCustomer(null);
    setCart(EMPTY_CART);
    setNotifications([]);
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <StoreAuthContext.Provider
      value={{
        customer,
        config,
        categories,
        cart,
        notifications,
        unreadCount,
        loading,
        login,
        register,
        logout,
        refreshProfile,
        refreshCart,
        refreshNotifications,
        refreshPublicMeta,
      }}
    >
      {children}
    </StoreAuthContext.Provider>
  );
};

export function useStoreAuth(): StoreAuthContextValue {
  const ctx = useContext(StoreAuthContext);
  if (!ctx) throw new Error("useStoreAuth must be used inside StoreAuthProvider");
  return ctx;
}

