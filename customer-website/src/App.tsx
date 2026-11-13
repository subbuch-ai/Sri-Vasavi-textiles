import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { StoreAuthProvider } from "./context/StoreAuthContext";
import { StoreLayout } from "./components/store/StoreLayout";
import { StoreHomePage } from "./pages/store/StoreHomePage";
import { StoreCatalogPage } from "./pages/store/StoreCatalogPage";
import { StoreProductPage } from "./pages/store/StoreProductPage";
import { StoreCartPage } from "./pages/store/StoreCartPage";
import { StoreCheckoutPage } from "./pages/store/StoreCheckoutPage";
import { StoreOrdersPage } from "./pages/store/StoreOrdersPage";
import { StoreWholesalePage } from "./pages/store/StoreWholesalePage";
import {
  StoreLoginPage,
  StoreRegisterPage,
  StoreForgotPasswordPage,
  StoreProfilePage,
} from "./pages/store/StoreAuthPages";

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <StoreAuthProvider>
        <Routes>
          <Route path="/" element={<StoreLayout />}>
            <Route index element={<StoreHomePage />} />
            <Route path="catalog" element={<StoreCatalogPage />} />
            <Route path="product/:id" element={<StoreProductPage />} />
            <Route path="cart" element={<StoreCartPage />} />
            <Route path="checkout" element={<StoreCheckoutPage />} />
            <Route path="orders" element={<StoreOrdersPage />} />
            <Route path="wholesale" element={<StoreWholesalePage />} />
            <Route path="login" element={<StoreLoginPage />} />
            <Route path="register" element={<StoreRegisterPage />} />
            <Route path="forgot-password" element={<StoreForgotPasswordPage />} />
            <Route path="profile" element={<StoreProfilePage />} />

            {/* Backwards-compatibility aliases */}
            <Route path="shop" element={<Navigate to="/" replace />} />
            <Route path="shop/catalog" element={<Navigate to="/catalog" replace />} />
            <Route path="shop/cart" element={<Navigate to="/cart" replace />} />
            <Route path="shop/checkout" element={<Navigate to="/checkout" replace />} />
            <Route path="shop/orders" element={<Navigate to="/orders" replace />} />
            <Route path="shop/wholesale" element={<Navigate to="/wholesale" replace />} />
            <Route path="shop/login" element={<Navigate to="/login" replace />} />
            <Route path="shop/register" element={<Navigate to="/register" replace />} />
            <Route path="shop/profile" element={<Navigate to="/profile" replace />} />
            <Route path="shop/*" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </StoreAuthProvider>
    </BrowserRouter>
  );
};

export default App;
