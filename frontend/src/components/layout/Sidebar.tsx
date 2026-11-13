import React from "react";
import { NavLink } from "react-router-dom";
import {
  BarChart3,
  Boxes,
  ClipboardList,
  ExternalLink,
  Factory,
  Globe,
  Landmark,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { usePermission } from "../../hooks/usePermission";
import { useAuth } from "../../context/AuthContext";

interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  anyPermissions?: string[];
  ownerOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard, anyPermissions: ["dashboard:view"] },
  { label: "Purchases", to: "/purchases", icon: ShoppingBag, anyPermissions: ["purchases:view"] },
  { label: "Sales", to: "/sales", icon: ShoppingCart, anyPermissions: ["sales:view"] },
  { label: "Orders", to: "/orders", icon: ClipboardList, anyPermissions: ["orders:view"] },
  { label: "Products", to: "/products", icon: Package, anyPermissions: ["products:view"] },
  { label: "Inventory", to: "/inventory", icon: Boxes, anyPermissions: ["inventory:view"] },
  { label: "Customers", to: "/customers", icon: Users, anyPermissions: ["customers:view"] },
  { label: "Suppliers", to: "/suppliers", icon: Factory, anyPermissions: ["suppliers:view"] },
  { label: "Accounts", to: "/accounts", icon: Landmark, anyPermissions: ["accounts:view", "payments:view"] },
  { label: "Expenses", to: "/expenses", icon: Receipt, anyPermissions: ["expenses:view"] },
  { label: "Employees", to: "/employees", icon: UserCheck, anyPermissions: ["employees:view", "tasks:view_own"] },
  { label: "Reports", to: "/reports", icon: BarChart3, anyPermissions: ["reports:view"] },
  { label: "Storefront", to: "/storefront-admin", icon: Globe, anyPermissions: ["storefront:view", "storefront:manage"] },
  { label: "Admin", to: "/admin", icon: ShieldCheck, ownerOnly: true },
  { label: "Settings", to: "/settings", icon: Settings, anyPermissions: ["settings:view", "settings:manage"] },
];

export const Sidebar: React.FC<{ mobileOpen: boolean; onClose: () => void }> = ({
  mobileOpen,
  onClose,
}) => {
  const { isOwner, hasAnyPermission } = usePermission();
  const { settings, user } = useAuth();

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (isOwner) return true;
    if (item.ownerOnly) return false;
    if (!item.anyPermissions) return true;
    return hasAnyPermission(item.anyPermissions);
  });

  const navContent = (
    <div className="flex flex-col h-full bg-navy-900 text-slate-100 w-64">
      <div className="h-16 flex items-center justify-between px-5 border-b border-navy-800">
        <div className="flex items-center gap-3 min-w-0">
          {settings?.logo_url ? (
            <img
              src={settings.logo_url}
              alt="Logo"
              className="h-9 w-9 rounded-lg object-cover bg-white shrink-0"
            />
          ) : (
            <div className="h-9 w-9 rounded-lg bg-gold-500 text-navy-900 font-extrabold flex items-center justify-center shrink-0 text-sm shadow">
              SVT
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs font-bold tracking-wider text-gold-400 uppercase truncate">
              {settings?.business_name || "SRI VASAVI TEXTILES"}
            </p>
            <p className="text-[11px] text-slate-400 truncate">Textile ERP Suite</p>
          </div>
        </div>
        <button onClick={onClose} className="lg:hidden text-slate-400 hover:text-white">
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-navy-700 text-gold-300 border-l-4 border-gold-400"
                    : "text-slate-300 hover:bg-navy-800 hover:text-white"
                }`
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="p-4 border-t border-navy-800 text-xs text-slate-400 space-y-2.5">
        <a
          href="http://localhost:5174"
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between px-3 py-2 rounded-lg bg-navy-800 hover:bg-navy-700 text-gold-300 font-semibold transition"
          title="Open Customer Shopping Website (Port 5174)"
        >
          <span>Customer Website</span>
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <div>
          <p className="font-semibold text-slate-200 truncate">{user?.full_name}</p>
          <p className="text-gold-400 font-medium">{user?.role_display_name}</p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block shrink-0">{navContent}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-900/60" onClick={onClose} />
          <div className="relative z-50">{navContent}</div>
        </div>
      )}
    </>
  );
};

