import React, { useEffect, useState } from "react";
import { Building2, Database, Edit2, MapPin, Plus, Save, Upload } from "lucide-react";
import { api, extractErrorMessage } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { usePermission } from "../hooks/usePermission";
import { Branch, BusinessSettings } from "../types/auth";
import { Modal } from "../components/common/Modal";
import { StatusBadge } from "../components/common/StatusBadge";
import { EmptyState } from "../components/common/EmptyState";

export const SettingsPage: React.FC = () => {
  const { isOwner } = usePermission();
  const { refreshSettings } = useAuth();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [form, setForm] = useState({
    business_name: "Sri Vasavi Textiles",
    tagline: "",
    logo_url: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    phone: "",
    email: "",
    gstin: "",
    invoice_prefix: "SVT-INV",
    next_invoice_number: 1,
    po_prefix: "SVT-PO",
    next_po_number: 1,
    order_prefix: "SVT-ORD",
    next_order_number: 1,
    currency_code: "INR",
    currency_symbol: "₹",
    financial_year: "2025-26",
    default_gst_rate: "5.00",
    allow_negative_stock: false,
    low_stock_alert_enabled: true,
    require_expense_approval: true,
    expense_approval_threshold: "5000.00",
    payment_methods_text: "CASH, UPI, BANK_TRANSFER, CARD, CHEQUE, CREDIT",
    split_cgst_sgst: true,
  });

  // Branch Modal State
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchForm, setBranchForm] = useState({
    code: "",
    name: "",
    address: "",
    city: "",
    state: "",
    phone: "",
    is_default: false,
    is_active: true,
  });
  const [savingBranch, setSavingBranch] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sRes, bRes] = await Promise.all([
        api.get<BusinessSettings>("/settings"),
        api.get<Branch[]>("/settings/branches"),
      ]);
      const s = sRes.data;
      setForm({
        business_name: s.business_name || "Sri Vasavi Textiles",
        tagline: s.tagline || "",
        logo_url: s.logo_url || "",
        address: s.address || "",
        city: s.city || "",
        state: s.state || "",
        pincode: s.pincode || "",
        phone: s.phone || "",
        email: s.email || "",
        gstin: s.gstin || "",
        invoice_prefix: s.invoice_prefix || "SVT-INV",
        next_invoice_number: s.next_invoice_number || 1,
        po_prefix: s.po_prefix || "SVT-PO",
        next_po_number: s.next_po_number || 1,
        order_prefix: s.order_prefix || "SVT-ORD",
        next_order_number: s.next_order_number || 1,
        currency_code: s.currency_code || "INR",
        currency_symbol: s.currency_symbol || "₹",
        financial_year: s.financial_year || "2025-26",
        default_gst_rate: String(s.default_gst_rate ?? "5.00"),
        allow_negative_stock: !!s.allow_negative_stock,
        low_stock_alert_enabled: !!s.low_stock_alert_enabled,
        require_expense_approval: !!s.require_expense_approval,
        expense_approval_threshold: String(s.expense_approval_threshold ?? "5000.00"),
        payment_methods_text: (s.payment_methods?.methods || ["CASH", "UPI", "BANK_TRANSFER"]).join(", "),
        split_cgst_sgst: s.tax_settings?.split_cgst_sgst !== false,
      });
      setBranches(bRes.data);
    } catch (err) {
      setFeedback({ type: "error", text: extractErrorMessage(err, "Failed to load settings.") });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner) return;
    setSaving(true);
    setFeedback(null);
    try {
      const methods = form.payment_methods_text
        .split(",")
        .map((m) => m.trim().toUpperCase())
        .filter(Boolean);

      await api.put<BusinessSettings>("/settings", {
        business_name: form.business_name,
        tagline: form.tagline || null,
        address: form.address || null,
        city: form.city || null,
        state: form.state || null,
        pincode: form.pincode || null,
        phone: form.phone || null,
        email: form.email || null,
        gstin: form.gstin || null,
        invoice_prefix: form.invoice_prefix,
        next_invoice_number: Number(form.next_invoice_number),
        po_prefix: form.po_prefix,
        next_po_number: Number(form.next_po_number),
        order_prefix: form.order_prefix,
        next_order_number: Number(form.next_order_number),
        currency_code: form.currency_code,
        currency_symbol: form.currency_symbol,
        financial_year: form.financial_year,
        default_gst_rate: Number(form.default_gst_rate),
        allow_negative_stock: form.allow_negative_stock,
        low_stock_alert_enabled: form.low_stock_alert_enabled,
        require_expense_approval: form.require_expense_approval,
        expense_approval_threshold: Number(form.expense_approval_threshold),
        payment_methods: { methods: methods.length ? methods : ["CASH", "UPI", "BANK_TRANSFER"] },
        tax_settings: {
          gst_enabled: true,
          default_rates: [0, 5, 12, 18],
          split_cgst_sgst: form.split_cgst_sgst,
        },
      });
      await refreshSettings();
      await loadData();
      setFeedback({ type: "success", text: "Business settings saved successfully." });
    } catch (err) {
      setFeedback({ type: "error", text: extractErrorMessage(err, "Failed to save settings.") });
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !isOwner) return;
    setUploadingLogo(true);
    setFeedback(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post<BusinessSettings>("/settings/logo", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setForm((prev) => ({ ...prev, logo_url: res.data.logo_url || "" }));
      await refreshSettings();
      setFeedback({ type: "success", text: "Business logo updated." });
    } catch (err) {
      setFeedback({ type: "error", text: extractErrorMessage(err, "Failed to upload logo.") });
    } finally {
      setUploadingLogo(false);
      e.target.value = "";
    }
  };

  const handleTriggerBackup = async () => {
    if (!isOwner) return;
    setBackingUp(true);
    setFeedback(null);
    try {
      const res = await api.post<{ message: string; filename: string; size_bytes: number }>(
        "/settings/backup"
      );
      setFeedback({
        type: "success",
        text: `${res.data.message} (${Math.round(res.data.size_bytes / 1024)} KB)`,
      });
    } catch (err) {
      setFeedback({ type: "error", text: extractErrorMessage(err, "Database backup failed.") });
    } finally {
      setBackingUp(false);
    }
  };

  const openCreateBranch = () => {
    setEditingBranch(null);
    setBranchForm({
      code: "",
      name: "",
      address: "",
      city: "",
      state: "",
      phone: "",
      is_default: false,
      is_active: true,
    });
    setBranchModalOpen(true);
  };

  const openEditBranch = (b: Branch) => {
    setEditingBranch(b);
    setBranchForm({
      code: b.code,
      name: b.name,
      address: b.address || "",
      city: b.city || "",
      state: b.state || "",
      phone: b.phone || "",
      is_default: b.is_default,
      is_active: b.is_active,
    });
    setBranchModalOpen(true);
  };

  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner) return;
    setSavingBranch(true);
    setFeedback(null);
    try {
      if (editingBranch) {
        await api.patch(`/settings/branches/${editingBranch.id}`, {
          name: branchForm.name,
          address: branchForm.address || null,
          city: branchForm.city || null,
          state: branchForm.state || null,
          phone: branchForm.phone || null,
          is_default: branchForm.is_default,
          is_active: branchForm.is_active,
        });
        setFeedback({ type: "success", text: `Updated branch '${branchForm.name}'.` });
      } else {
        await api.post("/settings/branches", {
          code: branchForm.code,
          name: branchForm.name,
          address: branchForm.address || undefined,
          city: branchForm.city || undefined,
          state: branchForm.state || undefined,
          phone: branchForm.phone || undefined,
          is_default: branchForm.is_default,
          is_active: branchForm.is_active,
        });
        setFeedback({ type: "success", text: `Created branch '${branchForm.name}'.` });
      }
      setBranchModalOpen(false);
      await loadData();
    } catch (err) {
      setFeedback({ type: "error", text: extractErrorMessage(err, "Failed to save branch.") });
    } finally {
      setSavingBranch(false);
    }
  };

  if (loading) {
    return <div className="py-12 text-center text-sm text-slate-500">Loading business settings...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Business Settings & Branches</h1>
          <p className="text-sm text-slate-500">
            Configure Sri Vasavi Textiles company profile, GST & invoice series, stock rules, and store branches.
          </p>
        </div>

        {isOwner && (
          <button
            type="button"
            onClick={handleTriggerBackup}
            disabled={backingUp}
            className="btn-secondary"
          >
            <Database className="h-4 w-4 text-navy-700" />
            {backingUp ? "Creating Backup..." : "Backup PostgreSQL Now"}
          </button>
        )}
      </div>

      {!isOwner && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3.5 text-xs text-amber-800">
          Read-only view: only the Business Owner can modify company settings, stock policies, or branches.
        </div>
      )}

      {feedback && (
        <div
          className={`rounded-xl p-3.5 text-sm border ${
            feedback.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-700"
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* BUSINESS SETTINGS FORM */}
      <form onSubmit={handleSaveSettings} className="space-y-6">
        <div className="card p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div className="flex items-center gap-3">
              {form.logo_url ? (
                <img
                  src={form.logo_url}
                  alt="Business Logo"
                  className="h-14 w-14 rounded-xl object-cover border border-slate-200 bg-white"
                />
              ) : (
                <div className="h-14 w-14 rounded-xl bg-navy-800 text-gold-400 font-extrabold flex items-center justify-center text-lg">
                  SVT
                </div>
              )}
              <div>
                <h2 className="text-base font-bold text-navy-900 flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-navy-700" />
                  Company Profile & Branding
                </h2>
                <p className="text-xs text-slate-500">Printed on wholesale/retail invoices and ERP reports.</p>
              </div>
            </div>

            {isOwner && (
              <label className="btn-secondary text-xs cursor-pointer">
                <Upload className="h-4 w-4" />
                {uploadingLogo ? "Uploading..." : "Upload Logo"}
                <input
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,.svg"
                  onChange={handleLogoUpload}
                  disabled={uploadingLogo}
                  className="hidden"
                />
              </label>
            )}
          </div>

          <fieldset disabled={!isOwner} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="label-text">Business Name</label>
                <input
                  required
                  value={form.business_name}
                  onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="label-text">Tagline</label>
                <input
                  value={form.tagline}
                  onChange={(e) => setForm({ ...form, tagline: e.target.value })}
                  className="input-field"
                  placeholder="Wholesale & Retail Textile Merchants"
                />
              </div>
              <div>
                <label className="label-text">GSTIN</label>
                <input
                  value={form.gstin}
                  onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
                  className="input-field"
                  placeholder="33XXXXX0000X1Z5"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="label-text">Phone</label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="label-text">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="label-text">Financial Year</label>
                <input
                  value={form.financial_year}
                  onChange={(e) => setForm({ ...form, financial_year: e.target.value })}
                  className="input-field"
                  placeholder="2025-26"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <label className="label-text">Address</label>
                <input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="label-text">City / State</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className="input-field"
                    placeholder="City"
                  />
                  <input
                    value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value })}
                    className="input-field"
                    placeholder="State"
                  />
                </div>
              </div>
              <div>
                <label className="label-text">Pincode</label>
                <input
                  value={form.pincode}
                  onChange={(e) => setForm({ ...form, pincode: e.target.value })}
                  className="input-field"
                />
              </div>
            </div>
          </fieldset>
        </div>

        {/* NUMBERING, TAX & INVENTORY POLICIES */}
        <div className="card p-6 space-y-5">
          <h2 className="text-base font-bold text-navy-900 border-b border-slate-200 pb-3">
            Billing Series, Taxation & Inventory Controls
          </h2>

          <fieldset disabled={!isOwner} className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="label-text">Invoice Prefix</label>
                <input
                  value={form.invoice_prefix}
                  onChange={(e) => setForm({ ...form, invoice_prefix: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="label-text">PO Prefix</label>
                <input
                  value={form.po_prefix}
                  onChange={(e) => setForm({ ...form, po_prefix: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="label-text">Order Prefix</label>
                <input
                  value={form.order_prefix}
                  onChange={(e) => setForm({ ...form, order_prefix: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="label-text">Default GST Rate (%)</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  max={28}
                  value={form.default_gst_rate}
                  onChange={(e) => setForm({ ...form, default_gst_rate: e.target.value })}
                  className="input-field"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="label-text">Expense Approval Threshold (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={form.expense_approval_threshold}
                  onChange={(e) => setForm({ ...form, expense_approval_threshold: e.target.value })}
                  className="input-field"
                />
              </div>
              <div className="md:col-span-2">
                <label className="label-text">Accepted Payment Modes (comma separated)</label>
                <input
                  value={form.payment_methods_text}
                  onChange={(e) => setForm({ ...form, payment_methods_text: e.target.value })}
                  className="input-field"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
              <label className="flex items-center gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50/50 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.allow_negative_stock}
                  onChange={(e) => setForm({ ...form, allow_negative_stock: e.target.checked })}
                  className="rounded border-slate-300 text-navy-800"
                />
                <span>Allow Negative Stock</span>
              </label>

              <label className="flex items-center gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50/50 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.low_stock_alert_enabled}
                  onChange={(e) => setForm({ ...form, low_stock_alert_enabled: e.target.checked })}
                  className="rounded border-slate-300 text-navy-800"
                />
                <span>Low Stock Alerts Enabled</span>
              </label>

              <label className="flex items-center gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50/50 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.require_expense_approval}
                  onChange={(e) => setForm({ ...form, require_expense_approval: e.target.checked })}
                  className="rounded border-slate-300 text-navy-800"
                />
                <span>Require Expense Approval</span>
              </label>

              <label className="flex items-center gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50/50 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.split_cgst_sgst}
                  onChange={(e) => setForm({ ...form, split_cgst_sgst: e.target.checked })}
                  className="rounded border-slate-300 text-navy-800"
                />
                <span>Split CGST / SGST (50/50)</span>
              </label>
            </div>
          </fieldset>

          {isOwner && (
            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button type="submit" disabled={saving} className="btn-gold">
                <Save className="h-4 w-4" />
                {saving ? "Saving Settings..." : "Save Business Settings"}
              </button>
            </div>
          )}
        </div>
      </form>

      {/* BRANCHES SECTION */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-navy-900 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-navy-700" />
              Store & Warehouse Branches ({branches.length})
            </h2>
            <p className="text-xs text-slate-500">
              Multi-branch locations used for stock transfers and regional billing.
            </p>
          </div>

          {isOwner && (
            <button type="button" onClick={openCreateBranch} className="btn-primary text-xs">
              <Plus className="h-4 w-4" />
              Add Branch
            </button>
          )}
        </div>

        {branches.length === 0 ? (
          <EmptyState title="No branches configured" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-xs uppercase text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Branch Name</th>
                  <th className="px-4 py-3">City / State</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Default</th>
                  <th className="px-4 py-3">Status</th>
                  {isOwner && <th className="px-4 py-3 text-right">Edit</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {branches.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-navy-900">{b.code}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-navy-900">{b.name}</div>
                      {b.address && <div className="text-xs text-slate-500">{b.address}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {[b.city, b.state].filter(Boolean).join(", ") || "-"}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{b.phone || "-"}</td>
                    <td className="px-4 py-3 text-xs">
                      {b.is_default ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full bg-gold-100 text-gold-800 font-semibold">
                          Primary
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={b.is_active ? "ACTIVE" : "INACTIVE"} />
                    </td>
                    {isOwner && (
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openEditBranch(b)}
                          className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-navy-800"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* BRANCH MODAL */}
      <Modal
        open={branchModalOpen}
        onClose={() => setBranchModalOpen(false)}
        title={editingBranch ? `Edit Branch: ${editingBranch.code}` : "Create New Branch / Warehouse"}
      >
        <form onSubmit={handleSaveBranch} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-text">Branch Code</label>
              <input
                required
                disabled={!!editingBranch}
                value={branchForm.code}
                onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value.toUpperCase() })}
                className="input-field disabled:bg-slate-100"
                placeholder="WH-NORTH"
              />
            </div>
            <div>
              <label className="label-text">Branch Name</label>
              <input
                required
                value={branchForm.name}
                onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                className="input-field"
                placeholder="North Wholesale Godown"
              />
            </div>
          </div>

          <div>
            <label className="label-text">Address</label>
            <input
              value={branchForm.address}
              onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })}
              className="input-field"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label-text">City</label>
              <input
                value={branchForm.city}
                onChange={(e) => setBranchForm({ ...branchForm, city: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="label-text">State</label>
              <input
                value={branchForm.state}
                onChange={(e) => setBranchForm({ ...branchForm, state: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="label-text">Phone</label>
              <input
                value={branchForm.phone}
                onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })}
                className="input-field"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-6 pt-1">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={branchForm.is_default}
                onChange={(e) => setBranchForm({ ...branchForm, is_default: e.target.checked })}
                className="rounded border-slate-300 text-navy-800"
              />
              Set as Primary Branch
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={branchForm.is_active}
                onChange={(e) => setBranchForm({ ...branchForm, is_active: e.target.checked })}
                className="rounded border-slate-300 text-navy-800"
              />
              Active Branch
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={() => setBranchModalOpen(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={savingBranch} className="btn-primary">
              {savingBranch ? "Saving..." : editingBranch ? "Update Branch" : "Create Branch"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
