import React, { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { BookOpen, Download, Edit2, FileSpreadsheet, FileText, Plus, Search, Trash2 } from "lucide-react";
import { EmptyState } from "../components/common/EmptyState";
import { Modal } from "../components/common/Modal";
import { StatusBadge } from "../components/common/StatusBadge";
import { usePermission } from "../hooks/usePermission";
import { api, extractErrorMessage } from "../services/api";
import { Customer, LedgerEntry, PaginatedResponse } from "../types/erp";
import { downloadAuthenticatedFile } from "../utils/download";
import { formatDate, formatINR } from "../utils/formatters";

interface CustomerForm {
  name: string;
  mobile: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  customer_type: "WHOLESALE" | "RETAIL";
  gst_number?: string;
  credit_limit: number;
  opening_balance: number;
}

export const CustomersPage: React.FC = () => {
  const { hasPermission } = usePermission();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [duesOnly, setDuesOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledgerParty, setLedgerParty] = useState<Customer | null>(null);
  const [ledgerRows, setLedgerRows] = useState<LedgerEntry[]>([]);
  const [downloadingStmt, setDownloadingStmt] = useState<string | null>(null);

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<CustomerForm>();

  const loadData = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page_size: "100" });
      if (search.trim()) params.set("search", search.trim());
      if (typeFilter) params.set("customer_type", typeFilter);
      if (duesOnly) params.set("with_dues_only", "true");
      const res = await api.get<PaginatedResponse<Customer>>(`/customers?${params.toString()}`);
      setCustomers(res.data.items);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, [search, typeFilter, duesOnly]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openNew = () => {
    setEditing(null);
    reset({ name: "", mobile: "", customer_type: "WHOLESALE", credit_limit: 0, opening_balance: 0 });
    setModalOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditing(c);
    reset({
      name: c.name,
      mobile: c.mobile,
      email: c.email || "",
      address: c.address || "",
      city: c.city || "",
      state: c.state || "",
      customer_type: c.customer_type,
      gst_number: c.gst_number || "",
      credit_limit: Number(c.credit_limit),
      opening_balance: Number(c.opening_balance),
    });
    setModalOpen(true);
  };

  const onSubmit = async (data: CustomerForm) => {
    setError(null);
    try {
      const payload = {
        ...data,
        email: data.email?.trim() || null,
        credit_limit: Number(data.credit_limit || 0),
        opening_balance: Number(data.opening_balance || 0),
      };
      if (editing) {
        await api.patch(`/customers/${editing.id}`, payload);
      } else {
        await api.post("/customers", payload);
      }
      setModalOpen(false);
      await loadData();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const openLedger = async (c: Customer) => {
    setLedgerParty(c);
    setLedgerOpen(true);
    const res = await api.get<LedgerEntry[]>(`/customers/${c.id}/ledger`);
    setLedgerRows(res.data);
  };

  const downloadStatement = async (c: Customer, format: "pdf" | "xlsx" | "csv") => {
    setError(null);
    setDownloadingStmt(`${c.id}-${format}`);
    try {
      await downloadAuthenticatedFile(
        `/customers/${c.id}/statement/export?format=${format}`,
        `Customer_Statement_${c.customer_code}.${format}`
      );
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setDownloadingStmt(null);
    }
  };

  const handleDeactivate = async (c: Customer) => {
    if (!window.confirm(`Deactivate customer '${c.name}'?`)) return;
    await api.delete(`/customers/${c.id}`);
    await loadData();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-navy-900">Customers (Wholesale & Retail)</h2>
          <p className="text-xs text-slate-500">Manage wholesale dealers, retail buyers, credit limits, receivables, and customer ledgers</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => downloadAuthenticatedFile("/customers/export?format=xlsx", "customers.xlsx")} className="btn-secondary">
            <Download className="h-4 w-4" /> Export Excel
          </button>
          {hasPermission("customers:create") && (
            <button onClick={openNew} className="btn-primary">
              <Plus className="h-4 w-4" /> Add Customer
            </button>
          )}
        </div>
      </div>

      {error && <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">{error}</div>}

      <div className="card p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer name, mobile, city, GSTIN..." className="input-field pl-9" />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="input-field w-auto">
          <option value="">All Types</option>
          <option value="WHOLESALE">Wholesale</option>
          <option value="RETAIL">Retail</option>
        </select>
        <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
          <input type="checkbox" checked={duesOnly} onChange={(e) => setDuesOnly(e.target.checked)} className="rounded" />
          Outstanding Only
        </label>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-center">Type</th>
                <th className="px-4 py-3 text-left">Contact / City</th>
                <th className="px-4 py-3 text-right">Total Purchases</th>
                <th className="px-4 py-3 text-right">Total Paid</th>
                <th className="px-4 py-3 text-right">Outstanding</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers.length === 0 ? (
                <tr><td colSpan={7}><EmptyState title="No customers found" /></td></tr>
              ) : (
                customers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-navy-900">{c.name}</p>
                      <p className="text-xs text-slate-400">{c.customer_code} {c.gst_number ? `• ${c.gst_number}` : ""}</p>
                    </td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={c.customer_type} /></td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      <p>{c.mobile}</p>
                      <p className="text-slate-400">{c.city || "-"}</p>
                    </td>
                    <td className="px-4 py-3 text-right text-xs">{formatINR(c.total_purchases)}</td>
                    <td className="px-4 py-3 text-right text-xs text-emerald-700">{formatINR(c.total_payments)}</td>
                    <td className="px-4 py-3 text-right text-xs font-bold text-amber-700">{formatINR(c.outstanding_balance)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button onClick={() => openLedger(c)} className="p-1.5 rounded hover:bg-slate-100 text-navy-700" title="Customer Ledger & Statement">
                          <BookOpen className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => downloadStatement(c, "pdf")}
                          disabled={downloadingStmt === `${c.id}-pdf`}
                          className="p-1.5 rounded hover:bg-amber-50 text-amber-700"
                          title="Download Individual Statement (PDF)"
                        >
                          <FileText className="h-4 w-4" />
                        </button>
                        {hasPermission("customers:edit") && (
                          <button onClick={() => openEdit(c)} className="p-1.5 rounded hover:bg-slate-100 text-slate-600" title="Edit">
                            <Edit2 className="h-4 w-4" />
                          </button>
                        )}
                        {hasPermission("customers:delete") && (
                          <button onClick={() => handleDeactivate(c)} className="p-1.5 rounded hover:bg-rose-50 text-rose-600" title="Deactivate">
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Customer" : "Add New Customer"}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-text">Customer / Firm Name *</label>
              <input className="input-field" {...register("name", { required: true })} />
            </div>
            <div>
              <label className="label-text">Customer Type *</label>
              <select className="input-field" {...register("customer_type")}>
                <option value="WHOLESALE">Wholesale Dealer</option>
                <option value="RETAIL">Retail Customer</option>
              </select>
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
              <label className="label-text">GSTIN (Optional)</label>
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
            {!editing ? (
              <div>
                <label className="label-text">Opening Balance (₹)</label>
                <input type="number" step="0.01" className="input-field" {...register("opening_balance")} />
              </div>
            ) : (
              <div>
                <label className="label-text">Credit Limit (₹)</label>
                <input type="number" step="0.01" className="input-field" {...register("credit_limit")} />
              </div>
            )}
          </div>
          <div>
            <label className="label-text">Address</label>
            <textarea rows={2} className="input-field" {...register("address")} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary">Save Customer</button>
          </div>
        </form>
      </Modal>

      <Modal open={ledgerOpen} onClose={() => setLedgerOpen(false)} title={`Customer Statement & Ledger — ${ledgerParty?.name || ""}`} maxWidthClass="max-w-4xl">
        {ledgerParty && (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1 text-xs text-slate-600">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-navy-900 text-sm">{ledgerParty.name}</span>
                  <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold">{ledgerParty.customer_code}</span>
                  <StatusBadge status={ledgerParty.customer_type} />
                </div>
                <p>
                  Mobile: <span className="font-medium text-slate-800">{ledgerParty.mobile}</span>
                  {ledgerParty.email ? ` • Email: ${ledgerParty.email}` : ""}
                  {ledgerParty.gst_number ? ` • GSTIN: ${ledgerParty.gst_number}` : ""}
                </p>
                {(ledgerParty.address || ledgerParty.city || ledgerParty.state) && (
                  <p>Address: {[ledgerParty.address, ledgerParty.city, ledgerParty.state].filter(Boolean).join(", ")}</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadStatement(ledgerParty, "pdf")}
                  disabled={downloadingStmt !== null}
                  className="btn-primary text-xs py-1.5 px-3"
                >
                  <FileText className="h-3.5 w-3.5" />
                  {downloadingStmt === `${ledgerParty.id}-pdf` ? "Generating..." : "Download PDF"}
                </button>
                <button
                  type="button"
                  onClick={() => downloadStatement(ledgerParty, "xlsx")}
                  disabled={downloadingStmt !== null}
                  className="btn-secondary text-xs py-1.5 px-3"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" /> Excel
                </button>
                <button
                  type="button"
                  onClick={() => downloadStatement(ledgerParty, "csv")}
                  disabled={downloadingStmt !== null}
                  className="btn-secondary text-xs py-1.5 px-3"
                >
                  <Download className="h-3.5 w-3.5" /> CSV
                </button>
              </div>
            </div>

            {(() => {
              const totalDebit = ledgerRows.reduce((acc, r) => acc + Number(r.debit || 0), 0);
              const totalCredit = ledgerRows.reduce((acc, r) => acc + Number(r.credit || 0), 0);
              const closingBal = ledgerRows.length > 0
                ? Number(ledgerRows[ledgerRows.length - 1].balance || 0)
                : Number(ledgerParty.outstanding_balance || 0);
              return (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="rounded-lg border border-slate-200 p-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Opening Balance</p>
                      <p className="text-sm font-bold text-slate-800 mt-0.5">{formatINR(ledgerParty.opening_balance)}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Total Debit (Billed)</p>
                      <p className="text-sm font-bold text-navy-800 mt-0.5">{formatINR(totalDebit)}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Total Credit (Paid)</p>
                      <p className="text-sm font-bold text-emerald-700 mt-0.5">{formatINR(totalCredit)}</p>
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold">Closing Outstanding</p>
                      <p className={`text-sm font-bold mt-0.5 ${closingBal > 0 ? "text-rose-700" : "text-emerald-700"}`}>
                        {formatINR(closingBal)}
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-slate-500 uppercase">
                        <tr>
                          <th className="px-3 py-2 text-left">Date</th>
                          <th className="px-3 py-2 text-left">Ref</th>
                          <th className="px-3 py-2 text-left">Description</th>
                          <th className="px-3 py-2 text-right">Billed (Dr)</th>
                          <th className="px-3 py-2 text-right">Paid (Cr)</th>
                          <th className="px-3 py-2 text-right">Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {ledgerRows.length === 0 ? (
                          <tr><td colSpan={6} className="py-6 text-center text-slate-500">No ledger transactions yet.</td></tr>
                        ) : (
                          ledgerRows.map((row, idx) => (
                            <tr key={idx}>
                              <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.date)}</td>
                              <td className="px-3 py-2 font-semibold whitespace-nowrap">{row.reference}</td>
                              <td className="px-3 py-2">{row.description}</td>
                              <td className="px-3 py-2 text-right text-navy-800 whitespace-nowrap">{formatINR(row.debit)}</td>
                              <td className="px-3 py-2 text-right text-emerald-700 whitespace-nowrap">{formatINR(row.credit)}</td>
                              <td className="px-3 py-2 text-right font-bold whitespace-nowrap">{formatINR(row.balance)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      {ledgerRows.length > 0 && (
                        <tfoot className="bg-slate-100 border-t border-slate-200 font-bold text-slate-800">
                          <tr>
                            <td colSpan={3} className="px-3 py-2 text-right uppercase text-[11px] tracking-wider">Totals</td>
                            <td className="px-3 py-2 text-right text-navy-900 whitespace-nowrap">{formatINR(totalDebit)}</td>
                            <td className="px-3 py-2 text-right text-emerald-700 whitespace-nowrap">{formatINR(totalCredit)}</td>
                            <td className="px-3 py-2 text-right text-rose-700 whitespace-nowrap">{formatINR(closingBal)}</td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </Modal>
    </div>
  );
};

