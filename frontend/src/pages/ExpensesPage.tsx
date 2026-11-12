import React, { useCallback, useEffect, useState } from "react";
import { Check, Download, Paperclip, Plus, Trash2, X } from "lucide-react";
import { EmptyState } from "../components/common/EmptyState";
import { Modal } from "../components/common/Modal";
import { StatusBadge } from "../components/common/StatusBadge";
import { usePermission } from "../hooks/usePermission";
import { api, extractErrorMessage } from "../services/api";
import { Account, ExpenseRecord, PaginatedResponse } from "../types/erp";
import { downloadAuthenticatedFile } from "../utils/download";
import { formatDate, formatINR, todayISO } from "../utils/formatters";

const EXPENSE_CATEGORIES = [
  "SHOP_RENT",
  "ELECTRICITY",
  "EMPLOYEE_SALARIES",
  "TRANSPORTATION",
  "MAINTENANCE",
  "MARKETING",
  "OTHER",
];

export const ExpensesPage: React.FC = () => {
  const { hasPermission } = usePermission();
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [catFilter, setCatFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [expDate, setExpDate] = useState(todayISO());
  const [category, setCategory] = useState("SHOP_RENT");
  const [title, setTitle] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [amount, setAmount] = useState("");
  const [taxAmount, setTaxAmount] = useState("0");
  const [paymentMode, setPaymentMode] = useState("CASH");
  const [accountId, setAccountId] = useState("");
  const [description, setDescription] = useState("");

  const loadData = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page_size: "100" });
      if (catFilter) params.set("category", catFilter);
      if (startDate) params.set("start_date", startDate);
      if (endDate) params.set("end_date", endDate);
      const res = await api.get<PaginatedResponse<ExpenseRecord>>(`/expenses?${params.toString()}`);
      setExpenses(res.data.items);
      api.get<Account[]>("/accounts").then((r) => setAccounts(r.data)).catch(() => {});
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, [catFilter, startDate, endDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/expenses", {
        expense_date: expDate,
        category,
        title,
        vendor_name: vendorName || null,
        amount: Number(amount),
        tax_amount: Number(taxAmount || 0),
        payment_mode: paymentMode,
        account_id: accountId ? Number(accountId) : null,
        description: description || null,
      });
      setModalOpen(false);
      setTitle("");
      setAmount("");
      setDescription("");
      await loadData();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const handleApproval = async (id: number, status: "APPROVED" | "REJECTED") => {
    await api.patch(`/expenses/${id}/approval`, { approval_status: status });
    await loadData();
  };

  const handleUploadBill = async (id: number, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    await api.post(`/expenses/${id}/attachment`, fd, { headers: { "Content-Type": "multipart/form-data" } });
    await loadData();
  };

  const handleDelete = async (e: ExpenseRecord) => {
    if (!window.confirm(`Delete expense '${e.expense_number}'?`)) return;
    try {
      await api.delete(`/expenses/${e.id}`);
      await loadData();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-navy-900">Business Expense Management</h2>
          <p className="text-xs text-slate-500">Track rent, electricity, salaries, freight, marketing, bill uploads, and approvals</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => downloadAuthenticatedFile("/expenses/export?format=xlsx", "expenses.xlsx")} className="btn-secondary">
            <Download className="h-4 w-4" /> Export Excel
          </button>
          {hasPermission("expenses:create") && (
            <button onClick={() => setModalOpen(true)} className="btn-primary">
              <Plus className="h-4 w-4" /> Add Expense
            </button>
          )}
        </div>
      </div>

      {error && <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">{error}</div>}

      <div className="card p-4 flex flex-wrap gap-3 items-center">
        <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="input-field w-auto">
          <option value="">All Categories</option>
          {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
        </select>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input-field w-auto" />
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input-field w-auto" />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Expense</th>
                <th className="px-4 py-3 text-left">Category</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-right">Total (₹)</th>
                <th className="px-4 py-3 text-center">Approval</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {expenses.length === 0 ? (
                <tr><td colSpan={6}><EmptyState title="No expenses recorded" /></td></tr>
              ) : (
                expenses.map((ex) => (
                  <tr key={ex.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-xs text-navy-900">{ex.title}</p>
                      <p className="text-[11px] text-slate-400">{ex.expense_number} {ex.vendor_name ? `• ${ex.vendor_name}` : ""} • {ex.payment_mode}</p>
                    </td>
                    <td className="px-4 py-3 text-xs">{ex.category.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDate(ex.expense_date)}</td>
                    <td className="px-4 py-3 text-right text-xs font-bold text-rose-700">{formatINR(ex.total_amount)}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={ex.approval_status} /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {ex.attachment_url ? (
                          <a href={ex.attachment_url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-navy-700 hover:underline">
                            Bill
                          </a>
                        ) : (
                          <label className="p-1 rounded hover:bg-slate-100 cursor-pointer text-slate-500" title="Upload Bill">
                            <Paperclip className="h-3.5 w-3.5" />
                            <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadBill(ex.id, f); }} />
                          </label>
                        )}
                        {ex.approval_status === "PENDING" && hasPermission("expenses:approve") && (
                          <>
                            <button onClick={() => handleApproval(ex.id, "APPROVED")} className="p-1 rounded bg-emerald-100 text-emerald-700" title="Approve">
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => handleApproval(ex.id, "REJECTED")} className="p-1 rounded bg-rose-100 text-rose-700" title="Reject">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                        {hasPermission("expenses:delete") && (
                          <button onClick={() => handleDelete(ex)} className="p-1 rounded hover:bg-rose-50 text-rose-600" title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Record Business Expense" maxWidthClass="max-w-lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-text">Category</label>
              <select className="input-field" value={category} onChange={(e) => setCategory(e.target.value)}>
                {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
              </select>
            </div>
            <div>
              <label className="label-text">Expense Date</label>
              <input type="date" required className="input-field" value={expDate} onChange={(e) => setExpDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label-text">Title *</label>
            <input required className="input-field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Monthly Shop Rent / EB Bill" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label-text">Amount (₹)</label>
              <input type="number" step="0.01" min="0.01" required className="input-field" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <label className="label-text">GST / Tax (₹)</label>
              <input type="number" step="0.01" min="0" className="input-field" value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} />
            </div>
            <div>
              <label className="label-text">Mode</label>
              <select className="input-field" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-text">Vendor / Payee</label>
              <input className="input-field" value={vendorName} onChange={(e) => setVendorName(e.target.value)} />
            </div>
            <div>
              <label className="label-text">Pay From Account</label>
              <select className="input-field" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">Auto Default</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label-text">Description</label>
            <textarea rows={2} className="input-field" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Save Expense</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

