import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Building2, KeyRound, MapPin, Plus, ShieldCheck, Trash2, UserCheck } from "lucide-react";
import { useStoreAuth } from "../../context/StoreAuthContext";
import { extractErrorMessage } from "../../services/api";
import { storeApi } from "../../services/storeApi";
import { CustomerAddress } from "../../types/storefront";
import { formatINR } from "../../utils/formatters";

export const StoreLoginPage: React.FC = () => {
  const { login } = useStoreAuth();
  const navigate = useNavigate();
  const [ident, setIdent] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(ident, password);
      navigate("/");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-14">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-lg space-y-6">
        <div className="text-center space-y-1">
          <div className="h-12 w-12 mx-auto rounded-2xl bg-navy-900 text-amber-400 flex items-center justify-center font-extrabold">
            SVT
          </div>
          <h1 className="text-2xl font-extrabold text-navy-900">Customer Sign In</h1>
          <p className="text-xs text-slate-500">Access your orders, saved addresses, and wholesale account</p>
        </div>

        {error && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-navy-900 mb-1">Email or Mobile Number</label>
            <input
              required
              value={ident}
              onChange={(e) => setIdent(e.target.value)}
              placeholder="name@example.com or 98XXXXXXXX"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-navy-900">Password</label>
              <Link to="/forgot-password" className="text-xs font-semibold text-amber-700 hover:underline">
                Forgot password?
              </Link>
            </div>
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 rounded-xl bg-navy-900 text-white font-bold text-sm hover:bg-navy-800 disabled:opacity-50"
          >
            {busy ? "Signing In..." : "Sign In to Shop"}
          </button>
        </form>

        <p className="text-center text-xs text-slate-600">
          New to Sri Vasavi Textiles?{" "}
          <Link to="/register" className="font-bold text-navy-900 hover:text-amber-700 underline">
            Create Retail or Wholesale Account
          </Link>
        </p>
      </div>
    </div>
  );
};

export const StoreRegisterPage: React.FC = () => {
  const { register } = useStoreAuth();
  const navigate = useNavigate();

  const [customerType, setCustomerType] = useState<"RETAIL" | "WHOLESALE">("RETAIL");
  const [form, setForm] = useState({
    name: "",
    email: "",
    mobile: "",
    password: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    business_name: "",
    gst_number: "",
    estimated_monthly_volume: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await register({
        ...form,
        customer_type: customerType,
      });
      navigate(customerType === "WHOLESALE" ? "/wholesale" : "/shop");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-lg space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-extrabold text-navy-900">Create Your Shopping Account</h1>
          <p className="text-xs text-slate-500">
            Choose Retail for personal shopping or Wholesale Dealer for GST-verified B2B rates
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setCustomerType("RETAIL")}
            className={`p-3.5 rounded-2xl border-2 text-left transition ${
              customerType === "RETAIL"
                ? "border-navy-900 bg-navy-50"
                : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <p className="font-bold text-sm text-navy-900 flex items-center gap-1.5">
              <UserCheck className="h-4 w-4 text-amber-600" /> Retail Customer
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">Single pieces & family shopping</p>
          </button>
          <button
            type="button"
            onClick={() => setCustomerType("WHOLESALE")}
            className={`p-3.5 rounded-2xl border-2 text-left transition ${
              customerType === "WHOLESALE"
                ? "border-navy-900 bg-amber-50/70"
                : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <p className="font-bold text-sm text-navy-900 flex items-center gap-1.5">
              <Building2 className="h-4 w-4 text-amber-600" /> Wholesale Dealer
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">Requires Owner approval for bulk pricing</p>
          </button>
        </div>

        {error && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-navy-900 mb-1">Full Name *</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-navy-900 mb-1">Mobile Number *</label>
              <input
                required
                value={form.mobile}
                onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-navy-900 mb-1">Email Address *</label>
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-navy-900 mb-1">Password (min 6 chars) *</label>
              <input
                required
                minLength={6}
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {customerType === "WHOLESALE" && (
            <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-3">
              <p className="text-xs font-bold text-navy-900">Wholesale Business Verification Details</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-navy-900 mb-1">Shop / Business Name *</label>
                  <input
                    required
                    value={form.business_name}
                    onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-navy-900 mb-1">GSTIN (Optional)</label>
                  <input
                    value={form.gst_number}
                    onChange={(e) => setForm({ ...form, gst_number: e.target.value })}
                    placeholder="e.g. 33AABCU9603R1ZM"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-navy-900 mb-1">Estimated Monthly Volume</label>
                  <input
                    value={form.estimated_monthly_volume}
                    onChange={(e) => setForm({ ...form, estimated_monthly_volume: e.target.value })}
                    placeholder="e.g. ₹1,50,000 / 100+ Sarees"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-3">
              <label className="block text-xs font-semibold text-navy-900 mb-1">
                {customerType === "WHOLESALE" ? "Shop Address *" : "Address (Optional)"}
              </label>
              <input
                required={customerType === "WHOLESALE"}
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-navy-900 mb-1">City</label>
              <input
                required={customerType === "WHOLESALE"}
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-navy-900 mb-1">State</label>
              <input
                required={customerType === "WHOLESALE"}
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-navy-900 mb-1">PIN Code</label>
              <input
                required={customerType === "WHOLESALE"}
                value={form.pincode}
                onChange={(e) => setForm({ ...form, pincode: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 rounded-xl bg-navy-900 text-white font-bold text-sm hover:bg-navy-800 disabled:opacity-50"
          >
            {busy ? "Creating Account..." : "Register Account"}
          </button>
        </form>

        <p className="text-center text-xs text-slate-600">
          Already registered?{" "}
          <Link to="/login" className="font-bold text-navy-900 underline">
            Sign in here
          </Link>
        </p>
      </div>
    </div>
  );
};

export const StoreForgotPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<"REQUEST" | "RESET">("REQUEST");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await storeApi.post<{ message: string; dev_reset_token?: string }>(
        "/auth/forgot-password",
        { email }
      );
      setNotice(
        res.data.dev_reset_token
          ? `${res.data.message} Token (dev preview): ${res.data.dev_reset_token}`
          : res.data.message
      );
      if (res.data.dev_reset_token) setToken(res.data.dev_reset_token);
      setStep("RESET");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await storeApi.post("/auth/reset-password", { token, new_password: newPassword });
      navigate("/login");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-14">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-lg space-y-5">
        <div className="flex items-center gap-2 text-navy-900">
          <KeyRound className="h-5 w-5 text-amber-600" />
          <h1 className="text-xl font-extrabold">Reset Customer Password</h1>
        </div>

        {notice && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 break-all">
            {notice}
          </div>
        )}
        {error && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
            {error}
          </div>
        )}

        {step === "REQUEST" ? (
          <form onSubmit={handleRequest} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-navy-900 mb-1">Registered Email Address</label>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-xl bg-navy-900 text-white font-bold text-sm"
            >
              {busy ? "Generating..." : "Send Reset Token"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleReset} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-navy-900 mb-1">Reset Token</label>
              <input
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-navy-900 mb-1">New Password</label>
              <input
                required
                minLength={6}
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-xl bg-navy-900 text-white font-bold text-sm"
            >
              {busy ? "Updating..." : "Update Password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export const StoreProfilePage: React.FC = () => {
  const { customer, refreshProfile } = useStoreAuth();
  const [name, setName] = useState(customer?.name || "");
  const [city, setCity] = useState(customer?.city || "");
  const [stateVal, setStateVal] = useState(customer?.state || "");
  const [gst, setGst] = useState(customer?.gst_number || "");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newAddr, setNewAddr] = useState({
    label: "Home",
    recipient_name: customer?.name || "",
    mobile: customer?.mobile || "",
    address_line1: "",
    city: "",
    state: "",
    pincode: "",
    is_default: true,
  });

  if (!customer) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-3">
        <p className="text-sm font-semibold text-navy-900">Sign in to manage your profile & addresses.</p>
        <Link to="/login" className="inline-block px-5 py-2.5 rounded-xl bg-navy-900 text-white text-xs font-bold">
          Login
        </Link>
      </div>
    );
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMsg(null);
    try {
      await storeApi.patch("/auth/me", { name, city, state: stateVal, gst_number: gst });
      await refreshProfile();
      setMsg("Profile updated.");
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await storeApi.post("/addresses", newAddr);
      setNewAddr({
        label: "Shop",
        recipient_name: customer.name,
        mobile: customer.mobile,
        address_line1: "",
        city: "",
        state: "",
        pincode: "",
        is_default: false,
      });
      await refreshProfile();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const handleDeleteAddress = async (addr: CustomerAddress) => {
    await storeApi.delete(`/addresses/${addr.id}`);
    await refreshProfile();
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-900">My Profile & Saved Addresses</h1>
          <p className="text-xs text-slate-500">
            Account Code: {customer.customer_code} • Type: {customer.customer_type}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="px-3 py-1.5 rounded-xl bg-slate-100 font-semibold text-navy-900">
            Ledger Balance: {formatINR(customer.outstanding_balance)}
          </span>
          {customer.is_wholesale_approved && (
            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-800 font-bold">
              <ShieldCheck className="h-4 w-4" /> Wholesale Approved
            </span>
          )}
        </div>
      </div>

      {msg && <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800">{msg}</div>}
      {error && <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form onSubmit={handleSaveProfile} className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <h2 className="text-sm font-bold text-navy-900">Personal Details</h2>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Full Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
              <input disabled value={customer.email} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Mobile</label>
              <input disabled value={customer.mobile} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">City</label>
              <input value={city} onChange={(e) => setCity(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">State</label>
              <input value={stateVal} onChange={(e) => setStateVal(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">GSTIN</label>
            <input value={gst} onChange={(e) => setGst(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <button type="submit" className="w-full py-2.5 rounded-xl bg-navy-900 text-white text-xs font-bold">
            Save Profile
          </button>
        </form>

        <div className="lg:col-span-7 space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-3">
            <h2 className="text-sm font-bold text-navy-900 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-amber-600" /> Saved Delivery Addresses
            </h2>
            {customer.addresses.length === 0 ? (
              <p className="text-xs text-slate-500">No saved delivery addresses yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {customer.addresses.map((addr) => (
                  <div key={addr.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 relative space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-navy-900">{addr.label}</span>
                      <button type="button" onClick={() => handleDeleteAddress(addr)} className="text-rose-600 hover:text-rose-800">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="font-semibold">{addr.recipient_name} • {addr.mobile}</p>
                    <p className="text-slate-600">{addr.address_line1}, {addr.city}, {addr.state} - {addr.pincode}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <form onSubmit={handleAddAddress} className="rounded-2xl border border-slate-200 bg-white p-6 space-y-3">
            <h3 className="text-sm font-bold text-navy-900 flex items-center gap-1.5">
              <Plus className="h-4 w-4 text-amber-600" /> Add New Delivery Address
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <input required placeholder="Label (Home/Shop)" value={newAddr.label} onChange={(e) => setNewAddr({ ...newAddr, label: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2" />
              <input required placeholder="Recipient Name" value={newAddr.recipient_name} onChange={(e) => setNewAddr({ ...newAddr, recipient_name: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2" />
              <input required placeholder="Mobile" value={newAddr.mobile} onChange={(e) => setNewAddr({ ...newAddr, mobile: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2" />
              <input required placeholder="Street / Door No. / Landmark" value={newAddr.address_line1} onChange={(e) => setNewAddr({ ...newAddr, address_line1: e.target.value })} className="sm:col-span-3 rounded-xl border border-slate-300 px-3 py-2" />
              <input required placeholder="City" value={newAddr.city} onChange={(e) => setNewAddr({ ...newAddr, city: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2" />
              <input required placeholder="State" value={newAddr.state} onChange={(e) => setNewAddr({ ...newAddr, state: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2" />
              <input required placeholder="PIN Code" value={newAddr.pincode} onChange={(e) => setNewAddr({ ...newAddr, pincode: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2" />
            </div>
            <button type="submit" className="px-4 py-2 rounded-xl bg-navy-900 text-white text-xs font-bold">
              Save Address
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

