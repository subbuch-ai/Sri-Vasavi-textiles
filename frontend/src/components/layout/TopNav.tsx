import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bell, KeyRound, LogOut, Menu, Search, User as UserIcon } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { api, extractErrorMessage } from "../../services/api";
import { Modal } from "../common/Modal";

interface SearchResult {
  type: string;
  label: string;
  sub: string;
  route: string;
}

interface NotificationPayload {
  unread_count: number;
  notifications: Array<{ id: number; title: string; message: string; is_read: boolean; link?: string | null }>;
  low_stock_alerts: Array<{ id: number; product_code: string; name: string; current_stock: number; min_stock_level: number }>;
}

export const TopNav: React.FC<{ onOpenMenu: () => void }> = ({ onOpenMenu }) => {
  const { user, settings, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const headerRef = useRef<HTMLElement | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showSearch, setShowSearch] = useState(false);

  const [notifData, setNotifData] = useState<NotificationPayload | null>(null);
  const [showNotif, setShowNotif] = useState(false);

  const [pwdOpen, setPwdOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwdMsg, setPwdMsg] = useState<string | null>(null);
  const [pwdErr, setPwdErr] = useState<string | null>(null);

  useEffect(() => {
    setShowNotif(false);
    setShowSearch(false);
  }, [location.pathname]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setShowNotif(false);
        setShowSearch(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    const fetchNotifs = () => {
      api
        .get<NotificationPayload>("/notifications")
        .then((res) => setNotifData(res.data))
        .catch(() => {});
    };
    fetchNotifs();
    const timer = setInterval(fetchNotifs, 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      api
        .get<{ results: SearchResult[] }>(`/dashboard/search?q=${encodeURIComponent(trimmed)}`)
        .then((res) => {
          setResults(res.data.results);
          setShowSearch(true);
        })
        .catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const handleMarkAllRead = async () => {
    await api.post("/notifications/mark-all-read");
    const res = await api.get<NotificationPayload>("/notifications");
    setNotifData(res.data);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdErr(null);
    setPwdMsg(null);
    try {
      await api.post("/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setPwdMsg("Password changed successfully.");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setPwdErr(extractErrorMessage(err));
    }
  };

  return (
    <>
      <header ref={headerRef} className="h-16 bg-white border-b border-slate-200 px-4 lg:px-6 flex items-center justify-between gap-4 sticky top-0 z-30">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onOpenMenu}
            className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="hidden sm:block">
            <h1 className="text-sm font-bold text-navy-900 tracking-wide uppercase">
              {settings?.business_name || "Sri Vasavi Textiles"}
            </h1>
            <p className="text-[11px] text-slate-500">
              FY {settings?.financial_year || "2026-2027"} • {settings?.currency_code || "INR"} ({settings?.currency_symbol || "₹"})
            </p>
          </div>
        </div>

        <div className="relative flex-1 max-w-md">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setShowSearch(true)}
            onBlur={() => setTimeout(() => setShowSearch(false), 180)}
            placeholder="Search products, invoices, customers, orders..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 py-1.5 text-sm focus:bg-white focus:border-navy-600 focus:outline-none"
          />
          {showSearch && results.length > 0 && (
            <div className="absolute left-0 right-0 mt-1 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-50 max-h-80 overflow-y-auto">
              {results.map((r, idx) => (
                <button
                  key={idx}
                  type="button"
                  onMouseDown={() => {
                    navigate(r.route);
                    setShowSearch(false);
                    setQuery("");
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-slate-50 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-navy-900 truncate">{r.label}</p>
                    <p className="text-xs text-slate-500 truncate">{r.sub}</p>
                  </div>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-navy-50 text-navy-700 shrink-0">
                    {r.type}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowNotif((prev) => !prev)}
              className="relative p-2 rounded-lg text-slate-600 hover:bg-slate-100"
              title="Notifications"
            >
              <Bell className="h-5 w-5" />
              {notifData && notifData.unread_count > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
                  {notifData.unread_count}
                </span>
              )}
            </button>

            {showNotif && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 z-50 p-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <span className="text-xs font-bold uppercase text-navy-900">Alerts & Notifications</span>
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="text-xs text-navy-700 hover:underline font-medium"
                  >
                    Mark all read
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 mt-1">
                  {notifData?.low_stock_alerts.map((item) => (
                    <div
                      key={`ls-${item.id}`}
                      onClick={() => {
                        setShowNotif(false);
                        navigate("/inventory");
                      }}
                      className="py-2 cursor-pointer hover:bg-slate-50 px-1 rounded"
                    >
                      <p className="text-xs font-semibold text-rose-700">Low Stock: {item.name}</p>
                      <p className="text-[11px] text-slate-500">
                        {item.product_code} — Current: {item.current_stock} (Min: {item.min_stock_level})
                      </p>
                    </div>
                  ))}
                  {notifData?.notifications.map((n) => (
                    <div key={n.id} className={`py-2 px-1 ${n.is_read ? "opacity-60" : ""}`}>
                      <p className="text-xs font-semibold text-slate-800">{n.title}</p>
                      <p className="text-[11px] text-slate-500">{n.message}</p>
                    </div>
                  ))}
                  {(!notifData || (notifData.low_stock_alerts.length === 0 && notifData.notifications.length === 0)) && (
                    <p className="text-xs text-slate-500 py-4 text-center">No active alerts.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="hidden md:flex items-center gap-2 pl-2 border-l border-slate-200">
            <div className="h-8 w-8 rounded-full bg-navy-700 text-gold-400 flex items-center justify-center">
              <UserIcon className="h-4 w-4" />
            </div>
            <div className="leading-tight">
              <p className="text-xs font-semibold text-slate-800">{user?.full_name}</p>
              <p className="text-[11px] text-slate-500">{user?.role_display_name}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setPwdOpen(true)}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-navy-700"
            title="Change Password"
          >
            <KeyRound className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      <Modal open={pwdOpen} onClose={() => setPwdOpen(false)} title="Change Password" maxWidthClass="max-w-md">
        <form onSubmit={handleChangePassword} className="space-y-4">
          {pwdErr && <div className="p-3 rounded-lg bg-rose-50 text-rose-700 text-xs">{pwdErr}</div>}
          {pwdMsg && <div className="p-3 rounded-lg bg-emerald-50 text-emerald-700 text-xs">{pwdMsg}</div>}
          <div>
            <label className="label-text">Current Password</label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="input-field"
            />
          </div>
          <div>
            <label className="label-text">New Password (min 8 chars)</label>
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="input-field"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setPwdOpen(false)} className="btn-secondary">
              Close
            </button>
            <button type="submit" className="btn-primary">
              Update Password
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
};

