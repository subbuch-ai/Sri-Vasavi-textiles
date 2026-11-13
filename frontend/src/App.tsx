import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute } from "./components/common/ProtectedRoute";
import { AppLayout } from "./components/layout/AppLayout";

import { SetupOwnerPage } from "./pages/SetupOwnerPage";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { PurchasesPage } from "./pages/PurchasesPage";
import { SalesPage } from "./pages/SalesPage";
import { OrdersPage } from "./pages/OrdersPage";
import { ProductsPage } from "./pages/ProductsPage";
import { InventoryPage } from "./pages/InventoryPage";
import { CustomersPage } from "./pages/CustomersPage";
import { SuppliersPage } from "./pages/SuppliersPage";
import { AccountsPage } from "./pages/AccountsPage";
import { ExpensesPage } from "./pages/ExpensesPage";
import { EmployeesPage } from "./pages/EmployeesPage";
import { ReportsPage } from "./pages/ReportsPage";
import { AdminPage } from "./pages/AdminPage";
import { SettingsPage } from "./pages/SettingsPage";
import { StorefrontAdminPage } from "./pages/StorefrontAdminPage";
import { StoreAuthProvider } from "./context/StoreAuthContext";
import { StoreLayout } from "./components/store/StoreLayout";
import { StoreHomePage } from "./pages/store/StoreHomePage";
import { StoreCatalogPage } from "./pages/store/StoreCatalogPage";
import { StoreProductPage } from "./pages/store/StoreProductPage";
import {
  StoreForgotPasswordPage,
  StoreLoginPage,
  StoreProfilePage,
  StoreRegisterPage,
} from "./pages/store/StoreAuthPages";
import { StoreCartPage } from "./pages/store/StoreCartPage";
import { StoreCheckoutPage } from "./pages/store/StoreCheckoutPage";
import { StoreOrdersPage } from "./pages/store/StoreOrdersPage";
import { StoreWholesalePage } from "./pages/store/StoreWholesalePage";

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/setup-owner" element={<SetupOwnerPage />} />
          <Route path="/login" element={<LoginPage />} />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route
              index
              element={
                <ProtectedRoute anyPermissions={["dashboard:view"]}>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="purchases"
              element={
                <ProtectedRoute anyPermissions={["purchases:view"]}>
                  <PurchasesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="sales"
              element={
                <ProtectedRoute anyPermissions={["sales:view"]}>
                  <SalesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="orders"
              element={
                <ProtectedRoute anyPermissions={["orders:view"]}>
                  <OrdersPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="products"
              element={
                <ProtectedRoute anyPermissions={["products:view"]}>
                  <ProductsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="inventory"
              element={
                <ProtectedRoute anyPermissions={["inventory:view"]}>
                  <InventoryPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="customers"
              element={
                <ProtectedRoute anyPermissions={["customers:view"]}>
                  <CustomersPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="suppliers"
              element={
                <ProtectedRoute anyPermissions={["suppliers:view"]}>
                  <SuppliersPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="accounts"
              element={
                <ProtectedRoute anyPermissions={["accounts:view", "payments:view"]}>
                  <AccountsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="expenses"
              element={
                <ProtectedRoute anyPermissions={["expenses:view"]}>
                  <ExpensesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="employees"
              element={
                <ProtectedRoute anyPermissions={["employees:view", "tasks:view_own"]}>
                  <EmployeesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="reports"
              element={
                <ProtectedRoute anyPermissions={["reports:view"]}>
                  <ReportsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="admin"
              element={
                <ProtectedRoute ownerOnly>
                  <AdminPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="settings"
              element={
                <ProtectedRoute anyPermissions={["settings:view", "settings:manage"]}>
                  <SettingsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="storefront-admin"
              element={
                <ProtectedRoute anyPermissions={["storefront:view", "storefront:manage"]}>
                  <StorefrontAdminPage />
                </ProtectedRoute>
              }
            />
          </Route>

          {/* Customer-Facing E-Commerce Storefront (/shop/*) */}
          <Route
            path="/shop"
            element={
              <StoreAuthProvider>
                <StoreLayout />
              </StoreAuthProvider>
            }
          >
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
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
