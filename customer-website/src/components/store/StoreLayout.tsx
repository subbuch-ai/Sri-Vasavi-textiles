import React, { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Bell,
  Building2,
  ChevronDown,
  LogOut,
  Mail,
  MapPin,
  Menu,
  PackageCheck,
  Phone,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  User as UserIcon,
  X,
} from "lucide-react";
import { useStoreAuth } from "../../context/StoreAuthContext";
import { storeApi } from "../../services/storeApi";
import { formatINR } from "../../utils/formatters";
import { Modal } from "../common/Modal";

export const StoreLayout: React.FC = () => {
  const {
    customer,
    config,
    categories,
    cart,
    notifications,
    unreadCount,
    logout,
    refreshNotifications,
  } = useStoreAuth();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [catDropdownOpen, setCatDropdownOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [policyModal, setPolicyModal] = useState<{ title: string; body: string } | null>(null);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    navigate(q ? `/catalog?search=${encodeURIComponent(q)}` : "/catalog");
    setMobileMenuOpen(false);
  };

  const handleMarkAllRead = async () => {
    await storeApi.post("/notifications/read-all");
    await refreshNotifications();
  };

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const bizName = config?.business_name || "Sri Vasavi Textiles";
  const freeDeliveryAmt = config?.free_delivery_threshold ?? 2500;

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900">
      {/* Top Promo & Contact Strip */}
      <div className="bg-navy-950 text-slate-200 text-xs py-2 px-4 border-b border-amber-500/30">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5 text-amber-300 font-medium">
              <Sparkles className="h-3.5 w-3.5" />
              Free shipping on orders above {formatINR(freeDeliveryAmt)}
            </span>
            {config?.contact_phone && (
              <span className="hidden sm:inline-flex items-center gap-1 text-slate-300">
                <Phone className="h-3 w-3 text-amber-400" /> {config.contact_phone}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <Link to="/wholesale" className="text-amber-300 hover:text-amber-200 font-semibold flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5" /> Wholesale & Bulk Enquiry
            </Link>
          </div>
        </div>
      </div>

      {/* Main Sticky Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-18 py-3 flex items-center justify-between gap-4">
          {/* Logo & Mobile Trigger */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="lg:hidden p-2 rounded-lg text-navy-900 hover:bg-slate-100"
              aria-label="Toggle Menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <Link to="/" className="flex items-center gap-2.5 shrink-0">
              {config?.logo_url ? (
                <img
                  src={config.logo_url}
                  alt={bizName}
                  className="h-10 w-10 rounded-xl object-cover border border-amber-300"
                />
              ) : (
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-navy-900 to-navy-700 text-amber-400 font-extrabold flex items-center justify-center text-sm shadow border border-amber-400/50">
                  SVT
                </div>
              )}
              <div>
                <p className="text-base sm:text-lg font-extrabold tracking-tight text-navy-900 leading-none">
                  {bizName}
                </p>
                <p className="text-[11px] font-medium text-amber-700 tracking-wide uppercase mt-0.5">
                  Silk • Cotton • Sarees • Apparel
                </p>
              </div>
            </Link>
          </div>

          {/* Search Bar (Desktop) */}
          <form onSubmit={handleSearch} className="hidden md:flex flex-1 max-w-md relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search sarees, silk, shirts, ethnic wear..."
              className="w-full rounded-full border border-slate-300 bg-slate-50 pl-4 pr-11 py-2 text-sm focus:bg-white focus:border-navy-700 focus:outline-none focus:ring-2 focus:ring-amber-400/40"
            />
            <button
              type="submit"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-navy-900 text-amber-400 flex items-center justify-center hover:bg-navy-800"
            >
              <Search className="h-4 w-4" />
            </button>
          </form>

          {/* Header Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            {customer && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNotifOpen((v) => !v)}
                  className="relative p-2 rounded-full text-navy-900 hover:bg-slate-100"
                  title="Order Notifications"
                >
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-1 rounded-full bg-amber-500 text-navy-950 text-[10px] font-bold flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </button>
                {notifOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-50">
                    <div className="px-4 py-3 bg-navy-900 text-white flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-amber-300">
                        Notifications
                      </span>
                      {unreadCount > 0 && (
                        <button
                          type="button"
                          onClick={handleMarkAllRead}
                          className="text-[11px] text-slate-200 hover:text-white underline"
                        >
                          Mark all read
                        </button>
                      )}
                    </div>
                    <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                      {notifications.length === 0 ? (
                        <p className="p-4 text-xs text-slate-500 text-center">No notifications yet.</p>
                      ) : (
                        notifications.slice(0, 8).map((n) => (
                          <div key={n.id} className={`p-3 text-xs ${n.is_read ? "bg-white" : "bg-amber-50/60"}`}>
                            <p className="font-semibold text-navy-900">{n.title}</p>
                            <p className="text-slate-600 mt-0.5">{n.message}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <Link
              to="/cart"
              className="relative inline-flex items-center gap-2 px-3 py-2 rounded-full bg-navy-900 text-white text-xs font-semibold hover:bg-navy-800 transition shadow-sm"
            >
              <ShoppingBag className="h-4 w-4 text-amber-400" />
              <span className="hidden sm:inline">Cart</span>
              <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-navy-950 text-[10px] font-extrabold">
                {cart?.item_count ?? 0}
              </span>
            </Link>

            {customer ? (
              <div className="hidden sm:flex items-center gap-2">
                <Link
                  to="/profile"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-slate-200 text-xs font-semibold text-navy-900 hover:bg-slate-50"
                >
                  <UserIcon className="h-3.5 w-3.5 text-amber-600" />
                  <span className="max-w-[110px] truncate">{customer.name}</span>
                  {customer.is_wholesale_approved && (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                      B2B
                    </span>
                  )}
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="p-2 rounded-full text-slate-500 hover:text-rose-600 hover:bg-rose-50"
                  title="Logout"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="hidden sm:flex items-center gap-2">
                <Link
                  to="/login"
                  className="px-3.5 py-2 rounded-full border border-navy-900 text-xs font-semibold text-navy-900 hover:bg-navy-50"
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="px-3.5 py-2 rounded-full bg-amber-500 text-navy-950 text-xs font-bold hover:bg-amber-400 shadow-sm"
                >
                  Register
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Secondary Desktop Navigation Row */}
        <nav className="hidden lg:block border-t border-slate-100 bg-white">
          <div className="max-w-7xl mx-auto px-6 h-11 flex items-center justify-between text-sm">
            <div className="flex items-center gap-6">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `font-semibold transition ${isActive ? "text-amber-700" : "text-navy-900 hover:text-amber-700"}`
                }
              >
                Home
              </NavLink>
              <NavLink
                to="/catalog"
                className={({ isActive }) =>
                  `font-semibold transition ${isActive ? "text-amber-700" : "text-navy-900 hover:text-amber-700"}`
                }
              >
                Shop All
              </NavLink>

              <div
                className="relative"
                onMouseEnter={() => setCatDropdownOpen(true)}
                onMouseLeave={() => setCatDropdownOpen(false)}
              >
                <button
                  type="button"
                  onClick={() => setCatDropdownOpen((v) => !v)}
                  className="inline-flex items-center gap-1 font-semibold text-navy-900 hover:text-amber-700 py-2"
                >
                  Categories <ChevronDown className="h-4 w-4" />
                </button>
                {catDropdownOpen && (
                  <div className="absolute left-0 top-full w-64 bg-white rounded-2xl shadow-xl border border-slate-200 p-2 grid grid-cols-1 gap-0.5 z-50">
                    {categories.map((cat) => (
                      <Link
                        key={cat.id}
                        to={`/catalog?category=${cat.id}`}
                        onClick={() => setCatDropdownOpen(false)}
                        className="px-3 py-2 rounded-xl text-xs font-medium text-navy-900 hover:bg-amber-50 hover:text-amber-800 flex items-center justify-between"
                      >
                        <span>{cat.name}</span>
                        <span className="text-[10px] text-slate-400">Browse</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <NavLink
                to="/wholesale"
                className={({ isActive }) =>
                  `font-semibold transition flex items-center gap-1.5 ${
                    isActive ? "text-amber-700" : "text-navy-900 hover:text-amber-700"
                  }`
                }
              >
                Wholesale Enquiry
              </NavLink>

              <NavLink
                to="/orders"
                className={({ isActive }) =>
                  `font-semibold transition flex items-center gap-1.5 ${
                    isActive ? "text-amber-700" : "text-navy-900 hover:text-amber-700"
                  }`
                }
              >
                <PackageCheck className="h-4 w-4 text-amber-600" /> My Orders
              </NavLink>
            </div>

            {customer?.customer_type === "WHOLESALE" && (
              <div className="text-xs">
                {customer.is_wholesale_approved ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                    <ShieldCheck className="h-3.5 w-3.5" /> Approved Wholesale Buyer
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 font-semibold border border-amber-200">
                    Wholesale Verification: {customer.wholesale_status}
                  </span>
                )}
              </div>
            )}
          </div>
        </nav>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-slate-200 bg-white px-4 py-4 space-y-3">
            <form onSubmit={handleSearch} className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search textiles..."
                className="w-full rounded-xl border border-slate-300 pl-3 pr-10 py-2 text-sm"
              />
              <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 text-navy-900">
                <Search className="h-4 w-4" />
              </button>
            </form>
            <div className="grid grid-cols-2 gap-2 text-sm font-semibold">
              <Link to="/" onClick={() => setMobileMenuOpen(false)} className="p-2 rounded-lg bg-slate-50">
                Home
              </Link>
              <Link to="/catalog" onClick={() => setMobileMenuOpen(false)} className="p-2 rounded-lg bg-slate-50">
                Shop All
              </Link>
              <Link to="/wholesale" onClick={() => setMobileMenuOpen(false)} className="p-2 rounded-lg bg-slate-50">
                Wholesale
              </Link>
              <Link to="/orders" onClick={() => setMobileMenuOpen(false)} className="p-2 rounded-lg bg-slate-50">
                My Orders
              </Link>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => (
                <Link
                  key={c.id}
                  to={`/catalog?category=${c.id}`}
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-2.5 py-1 rounded-full bg-slate-100 text-xs font-medium text-navy-900"
                >
                  {c.name}
                </Link>
              ))}
            </div>
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
              {customer ? (
                <>
                  <Link
                    to="/profile"
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-xs font-bold text-navy-900"
                  >
                    Account: {customer.name}
                  </Link>
                  <button type="button" onClick={handleLogout} className="text-xs font-semibold text-rose-600">
                    Logout
                  </button>
                </>
              ) : (
                <div className="flex gap-2 w-full">
                  <Link
                    to="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex-1 text-center py-2 rounded-xl border border-navy-900 text-xs font-semibold"
                  >
                    Login
                  </Link>
                  <Link
                    to="/register"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex-1 text-center py-2 rounded-xl bg-amber-500 text-navy-950 text-xs font-bold"
                  >
                    Register
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {config && !config.store_enabled ? (
          <div className="max-w-xl mx-auto my-20 p-8 rounded-2xl border border-amber-200 bg-amber-50 text-center space-y-3">
            <h2 className="text-xl font-bold text-navy-900">Storefront Temporarily Paused</h2>
            <p className="text-sm text-slate-600">
              Our online catalogue is undergoing inventory updates. Please check back shortly or contact our trade desk directly.
            </p>
          </div>
        ) : (
          <Outlet />
        )}
      </main>

      {/* Elegant Navy & Gold Footer */}
      <footer className="bg-navy-950 text-slate-300 border-t-4 border-amber-500 mt-16">
        <div className="max-w-7xl mx-auto px-6 py-12 grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-amber-500 text-navy-950 font-extrabold flex items-center justify-center text-sm">
                SVT
              </div>
              <div>
                <p className="font-bold text-white">{bizName}</p>
                <p className="text-[11px] text-amber-400">Heritage Textile Craftsmanship</p>
              </div>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Serving both discerning retail shoppers and verified wholesale textile dealers directly from mill and loom stocks.
            </p>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-3">
              Textile Categories
            </h4>
            <ul className="space-y-1.5 text-xs">
              {categories.slice(0, 6).map((c) => (
                <li key={c.id}>
                  <Link to={`/catalog?category=${c.id}`} className="hover:text-white transition">
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-3">
              Customer Policies
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  type="button"
                  onClick={() =>
                    setPolicyModal({
                      title: "Cancellation Policy",
                      body: config?.cancellation_policy_text || "Pre-dispatch cancellations accepted.",
                    })
                  }
                  className="hover:text-white transition"
                >
                  Cancellation & Refund Policy
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() =>
                    setPolicyModal({
                      title: "Return & Exchange Policy",
                      body: config?.return_policy_text || "Returns accepted within 7 days of delivery.",
                    })
                  }
                  className="hover:text-white transition"
                >
                  Return & Exchange Policy
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() =>
                    setPolicyModal({
                      title: "Privacy & Payment Security",
                      body: config?.privacy_policy_text || "Payments verified server-side cleanly.",
                    })
                  }
                  className="hover:text-white transition"
                >
                  Privacy & Data Protection
                </button>
              </li>
              <li>
                <Link to="/wholesale" className="hover:text-amber-300 font-semibold">
                  Wholesale B2B Programme
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-2.5 text-xs">
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-3">
              Contact Showroom
            </h4>
            {config?.contact_address && (
              <p className="flex items-start gap-2 text-slate-300">
                <MapPin className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <span>{config.contact_address}</span>
              </p>
            )}
            {config?.contact_phone && (
              <p className="flex items-center gap-2 text-slate-300">
                <Phone className="h-4 w-4 text-amber-400 shrink-0" />
                <span>{config.contact_phone}</span>
              </p>
            )}
            {config?.contact_email && (
              <p className="flex items-center gap-2 text-slate-300">
                <Mail className="h-4 w-4 text-amber-400 shrink-0" />
                <span>{config.contact_email}</span>
              </p>
            )}
          </div>
        </div>
        <div className="border-t border-navy-800 py-4 px-6 text-center text-[11px] text-slate-400">
          © {new Date().getFullYear()} {bizName}. Integrated with Sri Vasavi Textiles ERP Platform.
        </div>
      </footer>

      <Modal
        open={Boolean(policyModal)}
        onClose={() => setPolicyModal(null)}
        title={policyModal?.title || ""}
        maxWidthClass="max-w-lg"
      >
        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
          {policyModal?.body}
        </p>
      </Modal>
    </div>
  );
};

