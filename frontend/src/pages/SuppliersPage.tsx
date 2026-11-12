import React, { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { BookOpen, Download, Edit2, Plus, Search, Trash2 } from "lucide-react";
import { EmptyState } from "../components/common/EmptyState";
import { Modal } from "../components/common/Modal";
import { usePermission } from "../hooks/usePermission";
import { api, extractErrorMessage } from "../services/api";
import { LedgerEntry, PaginatedResponse, Supplier } from "../types/erp";
import { downloadAuthenticatedFile } from "../utils/download";
import { formatDate, formatINR } from "../utils/formatters";

interface SupplierForm {
  company_name: string;
  contact_person?: string;
  mobile: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  gst_number?: string;
  opening_balance: number;
  notes?: string;
}

export const SuppliersPage: React.FC = () => {
  const { hasPermission } = usePermission();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [duesOnly, setDuesOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledgerParty, setLedgerParty] = useState<Supplier | null>(null);
  const [ledgerRows, setLedgerRows] = useState<LedgerEntry[]>([]);

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<SupplierForm>();

  const loadData = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page_size: "100" });
      if (search.trim()) params.set("search", search.trim());
      if (duesOnly) params.set("with_dues_only", "true");
      const res = await api.get<PaginatedResponse<Supplier>>(`/suppliers?${params.toString()}`);
      setSuppliers(res.data.items);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, [search, duesOnly]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openNew = () => {
    setEditing(null);
    reset({ company_name: "", mobile: "", opening_balance: 0 });
    setModalOpen(true);
  };

  const openEdit = (s: Supplier) => {
    setEditing(s);
    reset({
      company_name: s.company_name,
      contact_person: s.contact_person || "",
      mobile: s.mobile,
      email: s.email || "",
      address: s.address || "",
      city: s.city || "",
      state: s.state || "",
      gst_number: s.gst_number || "",
      opening_balance: Number(s.opening_balance),
      notes: s.notes || "",
    });
    setModalOpen(true);
  };

  const onSubmit = async (data: SupplierForm) => {
    setError(null);
    try {
      const payload = {
        ...data,
        email: data.email?.trim() || null,
        opening_balance: Number(data.opening_balance || 0),
      };
      if (editing) {
        await api.patch(`/suppliers/${editing.id}`, payload);
      } else {
        await api.post("/suppliers", payload);
      }
      setModalOpen(false);
      await loadData();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const openLedger = async (s: Supplier) => {
    setLedgerParty(s);
    setLedgerOpen(true);
    const res = await api.get<LedgerEntry[]>(`/suppliers/${s.id}/ledger`);
    setLedgerRows(res.data);
  };

  const handleDeactivate = async (s: Supplier) => {
    if (!window.confirm(`Deactivate supplier '${s.company_name}'?`)) return;
    await api.delete(`/suppliers/${s.id}`);
    await loadData();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-navy-900">Suppliers & Textile Manufacturers</h2>
          <p className="text-xs text-slate-500">Manage textile mills, wholesale suppliers, GSTIN, payables, and supplier ledgers</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => downloadAuthenticatedFile("/suppliers/export?format=xlsx", "suppliers.xlsx")} className="btn-secondary">
            <Download className="h-4 w-4" /> Export Excel
          </button>
          {hasPermission("suppliers:create") && (
            <button onClick={openNew} className="btn-primary">
              <Plus className="h-4 w-4" /> Add Supplier
            </button>
          )}
        </div>
      </div>

      {error && <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">{error}</div>}

      <div className="card p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company, contact, mobile, GSTIN..." className="input-field pl-9" />
        </div>
        <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
          <input type="checkbox" checked={duesOnly} onChange={(e) => setDuesOnly(e.target.checked)} className="rounded" />
          Pending Payables Only
        </label>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Supplier</th>
                <th className="px-4 py-3 text-left">Contact & GSTIN</th>
                <th className="px-4 py-3 text-right">Total Purchases</th>
                <th className="px-4 py-3 text-right">Total Paid</th>
                <th className="px-4 py-3 text-right">Outstanding</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {suppliers.length === 0 ? (
                <tr><td colSpan={6}><EmptyState title="No suppliers found" /></td></tr>
              ) : (
                suppliers.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-navy-900">{s.company_name}</p>
                      <p className="text-xs text-slate-400">{s.supplier_code} • {s.city || "-"}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      <p>{s.contact_person || "-"} • {s.mobile}</p>
                      <p className="text-slate-400">{s.gst_number || "No GSTIN"}</p>
                    </td>
                    <td className="px-4 py-3 text-right text-xs">{formatINR(s.total_purchases)}</td>
                    <td className="px-4 py-3 text-right text-xs text-emerald-700">{formatINR(s.total_payments)}</td>
                    <td className="px-4 py-3 text-right text-xs font-bold text-rose-700">{formatINR(s.outstanding_balance)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button onClick={() => openLedger(s)} className="p-1.5 rounded hover:bg-slate-100 text-navy-700" title="View Ledger">
                          <BookOpen className="h-4 w-4" />
                        </button>
                        {hasPermission("suppliers:edit") && (
                          <button onClick={() => openEdit(s)} className="p-1.5 rounded hover:bg-slate-100 text-slate-600" title="Edit">
                            <Edit2 className="h-4 w-4" />
                          </button>
                        )}
                        {hasPermission("suppliers:delete") && (
                          <button onClick={() => handleDeactivate(s)} className="p-1.5 rounded hover:bg-rose-50 text-rose-600" title="Deactivate">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Supplier" : "Add New Supplier"}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-text">Company Name *</label>
              <input className="input-field" {...register("company_name", { required: true })} />
            </div>
            <div>
              <label className="label-text">Contact Person</label>
              <input className="input-field" {...register("contact_person")} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label-text">Mobile Number *</label>
              <input className="input-field" {...register("mobile", { required: true })} />
            </div>
            <div>
              <label className="label-text">Email</label>
              <input type="email" className="input-field" {...register("email")} />
            </div>
            <div>
              <label className="label-text">GSTIN</label>
              <input className="input-field" {...register("gst_number")} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label-text">City</label>
              <input className="input-field" {...register("city")} />
            </div>
            <div>
              <label className="label-text">State</label>
              <input className="input-field" {...register("state")} />
            </div>
            {!editing && (
              <div>
                <label className="label-text">Opening Payable (₹)</label>
                <input type="number" step="0.01" className="input-field" {...register("opening_balance")} />
              </div>
            )}
          </div>
          <div>
            <label className="label-text">Address</label>
            <textarea rows={2} className="input-field" {...register("address")} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary">Save Supplier</button>
          </div>
        </form>
      </Modal>

      <Modal open={ledgerOpen} onClose={() => setLedgerOpen(false)} title={`Supplier Ledger — ${ledgerParty?.company_name || ""}`} maxWidthClass="max-w-3xl">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Ref</th>
                <th className="px-3 py-2 text-left">Description</th>
                <th className="px-3 py-2 text-right">Paid (Dr)</th>
                <th className="px-3 py-2 text-right">Billed (Cr)</th>
                <th className="px-3 py-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ledgerRows.length === 0 ? (
                <tr><td colSpan={6} className="py-6 text-center text-slate-500">No ledger transactions yet.</td></tr>
              ) : (
                ledgerRows.map((row, idx) => (
                  <tr key={idx}>
                    <td className="px-3 py-2">{formatDate(row.date)}</td>
                    <td className="px-3 py-2 font-semibold">{row.reference}</td>
                    <td className="px-3 py-2">{row.description}</td>
                    <td className="px-3 py-2 text-right text-emerald-700">{formatINR(row.debit)}</td>
                    <td className="px-3 py-2 text-right text-rose-700">{formatINR(row.credit)}</td>
                    <td className="px-3 py-2 text-right font-bold">{formatINR(row.balance)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Modal>
    </div>
  );
};

