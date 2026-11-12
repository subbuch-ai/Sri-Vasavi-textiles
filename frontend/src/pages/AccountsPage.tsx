import React, { useCallback, useEffect, useState } from "react";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Landmark, Plus, Wallet } from "lucide-react";
import { EmptyState } from "../components/common/EmptyState";
import { KpiCard } from "../components/common/KpiCard";
import { Modal } from "../components/common/Modal";
import { StatusBadge } from "../components/common/StatusBadge";
import { usePermission } from "../hooks/usePermission";
import { api, extractErrorMessage } from "../services/api";
import {
  Account,
  Customer,
  FinancialTransaction,
  PaginatedResponse,
  PaymentRecord,
  PurchaseInvoice,
  Sale,
  Supplier,
} from "../types/erp";
import { formatDate, formatINR, todayISO } from "../utils/formatters";

interface AccountsSummary {
  cash_balance: number;
  bank_balance: number;
  total_receivables: number;
  total_payables: number;
  cash_flow: { total_inflows: number; total_outflows: number; net_cash_flow: number };
  profit_and_loss: { net_sales: number; cogs: number; gross_profit: number; operating_expenses: number; net_profit: number };
}

export const AccountsPage: React.FC = () => {
  const { hasPermission } = usePermission();
  const canViewAccounts = hasPermission("accounts:view");
  const [summary, setSummary] = useState<AccountsSummary | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [tab, setTab] = useState<"cashbook" | "payments" | "accounts">("cashbook");
  const [accountTypeFilter, setAccountTypeFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Payment Modal
  const [payOpen, setPayOpen] = useState(false);
  const [partyType, setPartyType] = useState<"CUSTOMER" | "SUPPLIER">("CUSTOMER");
  const [partyId, setPartyId] = useState<number>(0);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(todayISO());
  const [payMode, setPayMode] = useState("UPI");
  const [payAccountId, setPayAccountId] = useState<string>("");
  const [payInvoiceId, setPayInvoiceId] = useState<string>("");
  const [pendingSales, setPendingSales] = useState<Sale[]>([]);
  const [pendingPurchases, setPendingPurchases] = useState<PurchaseInvoice[]>([]);
  const [payRef, setPayRef] = useState("");
  const [payNotes, setPayNotes] = useState("");

  // Transfer Modal
  const [trfOpen, setTrfOpen] = useState(false);
  const [trfFrom, setTrfFrom] = useState<number>(0);
  const [trfTo, setTrfTo] = useState<number>(0);
  const [trfAmt, setTrfAmt] = useState("");
  const [trfDesc, setTrfDesc] = useState("Cash deposit to bank");

  // New Account Modal
  const [accOpen, setAccOpen] = useState(false);
  const [accCode, setAccCode] = useState("");
  const [accName, setAccName] = useState("");
  const [accType, setAccType] = useState("BANK");
  const [accBal, setAccBal] = useState("0");

  const loadData = useCallback(async () => {
    try {
      const txParams = new URLSearchParams({ page_size: "60" });
      if (accountTypeFilter) txParams.set("account_type", accountTypeFilter);

      const [payRes, custRes, supRes] = await Promise.all([
        api.get<PaginatedResponse<PaymentRecord>>("/payments?page_size=50"),
        api.get<PaginatedResponse<Customer>>("/customers?page_size=200").catch(() => ({ data: { items: [] } })),
        api.get<PaginatedResponse<Supplier>>("/suppliers?page_size=200").catch(() => ({ data: { items: [] } })),
      ]);
      setPayments(payRes.data.items);
      setCustomers(custRes.data.items);
      setSuppliers(supRes.data.items);

      if (canViewAccounts) {
        const [sumRes, accRes, txRes] = await Promise.all([
          api.get<AccountsSummary>("/accounts/summary"),
          api.get<Account[]>("/accounts"),
          api.get<PaginatedResponse<FinancialTransaction>>(`/accounts/transactions?${txParams.toString()}`),
        ]);
        setSummary(sumRes.data);
        setAccounts(accRes.data);
        setTransactions(txRes.data.items);
        if (accRes.data.length >= 2) {
          setTrfFrom((prev) => prev || accRes.data[0].id);
          setTrfTo((prev) => prev || accRes.data[1].id);
        }
      }
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, [accountTypeFilter, canViewAccounts]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!payOpen || !partyId) {
      setPendingSales([]);
      setPendingPurchases([]);
      return;
    }
    setPayInvoiceId("");
    if (partyType === "CUSTOMER") {
      api
        .get<PaginatedResponse<Sale>>(`/sales?customer_id=${partyId}&page_size=100`)
        .then((res) => setPendingSales(res.data.items.filter((s) => Number(s.pending_amount) > 0)))
        .catch(() => setPendingSales([]));
    } else {
      api
        .get<PaginatedResponse<PurchaseInvoice>>(`/purchases/invoices?page_size=100`)
        .then((res) =>
          setPendingPurchases(
            res.data.items.filter((b) => b.supplier_id === partyId && Number(b.pending_amount) > 0)
          )
        )
        .catch(() => setPendingPurchases([]));
    }
  }, [payOpen, partyType, partyId]);

  const openPayment = (type: "CUSTOMER" | "SUPPLIER") => {
    setPartyType(type);
    const list = type === "CUSTOMER" ? customers : suppliers;
    setPartyId(list[0]?.id || 0);
    setPayInvoiceId("");
    setPayAmount("");
    setPayRef("");
    setPayNotes("");
    setPayOpen(true);
  };

  const handleCreatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/payments", {
        payment_date: payDate,
        direction: partyType === "CUSTOMER" ? "INBOUND" : "OUTBOUND",
        party_type: partyType,
        customer_id: partyType === "CUSTOMER" ? Number(partyId) : null,
        supplier_id: partyType === "SUPPLIER" ? Number(partyId) : null,
        sale_id: partyType === "CUSTOMER" && payInvoiceId ? Number(payInvoiceId) : null,
        purchase_invoice_id: partyType === "SUPPLIER" && payInvoiceId ? Number(payInvoiceId) : null,
        account_id: payAccountId ? Number(payAccountId) : null,
        amount: Number(payAmount),
        payment_mode: payMode,
        reference_number: payRef || null,
        notes: payNotes || null,
      });
      setPayOpen(false);
      await loadData();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/accounts/transfer", {
        transfer_date: todayISO(),
        from_account_id: Number(trfFrom),
        to_account_id: Number(trfTo),
        amount: Number(trfAmt),
        description: trfDesc,
      });
      setTrfOpen(false);
      setTrfAmt("");
      await loadData();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/accounts", {
        code: accCode,
        name: accName,
        account_type: accType,
        opening_balance: Number(accBal || 0),
      });
      setAccOpen(false);
      setAccCode("");
      setAccName("");
      await loadData();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-navy-900">Accounts & Financial Management</h2>
          <p className="text-xs text-slate-500">Cash Book, Bank Book, Customer Collections, Supplier Payouts, Cash Flow & P&L</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasPermission("payments:create") && (
            <>
              <button onClick={() => openPayment("CUSTOMER")} className="btn-gold">
                <ArrowDownLeft className="h-4 w-4" /> Collect Customer Payment
              </button>
              <button onClick={() => openPayment("SUPPLIER")} className="btn-primary">
                <ArrowUpRight className="h-4 w-4" /> Pay Supplier
              </button>
            </>
          )}
          {hasPermission("accounts:manage") && (
            <button onClick={() => setTrfOpen(true)} className="btn-secondary">
              <ArrowLeftRight className="h-4 w-4" /> Cash/Bank Transfer
            </button>
          )}
        </div>
      </div>

      {error && <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">{error}</div>}

      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard title="Cash Balance" value={formatINR(summary.cash_balance)} icon={Wallet} accent="gold" />
          <KpiCard title="Bank & UPI Balance" value={formatINR(summary.bank_balance)} icon={Landmark} accent="navy" />
          <KpiCard title="Total Receivables" value={formatINR(summary.total_receivables)} subtitle={`Month Cash In: ${formatINR(summary.cash_flow.total_inflows)}`} icon={ArrowDownLeft} accent="emerald" />
          <KpiCard title="Total Payables" value={formatINR(summary.total_payables)} subtitle={`Month Net P&L: ${formatINR(summary.profit_and_loss.net_profit)}`} icon={ArrowUpRight} accent="rose" />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200">
        <div className="flex gap-2">
          {hasPermission("accounts:view") && (
            <button onClick={() => setTab("cashbook")} className={`px-4 py-2 text-sm font-semibold border-b-2 ${tab === "cashbook" ? "border-navy-700 text-navy-900" : "border-transparent text-slate-500"}`}>
              Cash & Bank Book
            </button>
          )}
          <button onClick={() => setTab("payments")} className={`px-4 py-2 text-sm font-semibold border-b-2 ${tab === "payments" ? "border-navy-700 text-navy-900" : "border-transparent text-slate-500"}`}>
            Payments & Collections ({payments.length})
          </button>
          {hasPermission("accounts:view") && (
            <button onClick={() => setTab("accounts")} className={`px-4 py-2 text-sm font-semibold border-b-2 ${tab === "accounts" ? "border-navy-700 text-navy-900" : "border-transparent text-slate-500"}`}>
              Accounts ({accounts.length})
            </button>
          )}
        </div>

        {tab === "cashbook" && (
          <select value={accountTypeFilter} onChange={(e) => setAccountTypeFilter(e.target.value)} className="input-field w-auto py-1 text-xs mb-1">
            <option value="">All Books (Cash + Bank)</option>
            <option value="CASH">Cash Book Only</option>
            <option value="BANK">Bank Book Only</option>
          </select>
        )}
      </div>

      {tab === "cashbook" && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Tx ID / Date</th>
                  <th className="px-4 py-3 text-left">Account</th>
                  <th className="px-4 py-3 text-left">Type / Ref</th>
                  <th className="px-4 py-3 text-left">Description</th>
                  <th className="px-4 py-3 text-right">Debit (Out)</th>
                  <th className="px-4 py-3 text-right">Credit (In)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.length === 0 ? (
                  <tr><td colSpan={6}><EmptyState title="No financial transactions yet" /></td></tr>
                ) : (
                  transactions.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-xs">
                        <p className="font-semibold text-navy-900">{t.transaction_number}</p>
                        <p className="text-slate-400">{formatDate(t.transaction_date)}</p>
                      </td>
                      <td className="px-4 py-3 text-xs font-medium">{t.account_name}</td>
                      <td className="px-4 py-3 text-xs">
                        <StatusBadge status={t.transaction_type} />
                        <p className="text-[11px] text-slate-400 mt-0.5">{t.reference_number || t.payment_mode}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700">{t.description}</td>
                      <td className="px-4 py-3 text-right text-xs font-semibold text-rose-700">
                        {Number(t.debit) > 0 ? formatINR(t.debit) : "-"}
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-semibold text-emerald-700">
                        {Number(t.credit) > 0 ? formatINR(t.credit) : "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "payments" && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Payment No</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-center">Direction</th>
                  <th className="px-4 py-3 text-left">Party</th>
                  <th className="px-4 py-3 text-left">Account / Mode</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.length === 0 ? (
                  <tr><td colSpan={6}><EmptyState title="No payments recorded yet" /></td></tr>
                ) : (
                  payments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-xs text-navy-900">{p.payment_number}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{formatDate(p.payment_date)}</td>
                      <td className="px-4 py-3 text-center"><StatusBadge status={p.direction} /></td>
                      <td className="px-4 py-3 text-xs font-medium">{p.customer_name || p.supplier_name}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{p.account_name} • {p.payment_mode}</td>
                      <td className="px-4 py-3 text-right text-xs font-bold">{formatINR(p.amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "accounts" && (
        <div className="space-y-4">
          {hasPermission("accounts:manage") && (
            <div className="flex justify-end">
              <button onClick={() => setAccOpen(true)} className="btn-primary text-xs">
                <Plus className="h-4 w-4" /> Add Bank / Cash Account
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {accounts.map((a) => (
              <div key={a.id} className="card p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400">{a.code}</span>
                  <StatusBadge status={a.account_type} />
                </div>
                <h4 className="text-base font-bold text-navy-900 mt-2">{a.name}</h4>
                <p className="text-2xl font-extrabold text-emerald-700 mt-3">{formatINR(a.current_balance)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment Modal */}
      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title={partyType === "CUSTOMER" ? "Record Customer Payment Collection" : "Record Supplier Payment"}
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleCreatePayment} className="space-y-4">
          <div>
            <label className="label-text">{partyType === "CUSTOMER" ? "Customer" : "Supplier"}</label>
            <select className="input-field" value={partyId} onChange={(e) => setPartyId(Number(e.target.value))}>
              {partyType === "CUSTOMER"
                ? customers.map((c) => <option key={c.id} value={c.id}>{c.name} (Due: {formatINR(c.outstanding_balance)})</option>)
                : suppliers.map((s) => <option key={s.id} value={s.id}>{s.company_name} (Due: {formatINR(s.outstanding_balance)})</option>)}
            </select>
          </div>
          <div>
            <label className="label-text">Pending Invoice / Bill (Optional)</label>
            <select
              className="input-field"
              value={payInvoiceId}
              onChange={(e) => {
                const val = e.target.value;
                setPayInvoiceId(val);
                if (val) {
                  if (partyType === "CUSTOMER") {
                    const inv = pendingSales.find((s) => String(s.id) === val);
                    if (inv) setPayAmount(String(inv.pending_amount));
                  } else {
                    const bill = pendingPurchases.find((b) => String(b.id) === val);
                    if (bill) setPayAmount(String(bill.pending_amount));
                  }
                }
              }}
            >
              <option value="">Auto-allocate oldest due bills (FIFO)</option>
              {partyType === "CUSTOMER"
                ? pendingSales.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.invoice_number} — Pending {formatINR(s.pending_amount)} ({s.payment_status})
                    </option>
                  ))
                : pendingPurchases.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.invoice_number} — Pending {formatINR(b.pending_amount)} ({b.payment_status})
                    </option>
                  ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-text">Amount (₹)</label>
              <input type="number" step="0.01" min="0.01" required className="input-field" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            </div>
            <div>
              <label className="label-text">Payment Date</label>
              <input type="date" required className="input-field" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-text">Payment Mode</label>
              <select className="input-field" value={payMode} onChange={(e) => setPayMode(e.target.value)}>
                <option value="UPI">UPI</option>
                <option value="CASH">Cash</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="CARD">Card</option>
                <option value="CHEQUE">Cheque</option>
              </select>
            </div>
            <div>
              <label className="label-text">Account</label>
              <select className="input-field" value={payAccountId} onChange={(e) => setPayAccountId(e.target.value)}>
                <option value="">Auto Default</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label-text">UTR / Cheque / Reference No</label>
            <input className="input-field" value={payRef} onChange={(e) => setPayRef(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setPayOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Save Payment</button>
          </div>
        </form>
      </Modal>

      {/* Contra Transfer Modal */}
      <Modal open={trfOpen} onClose={() => setTrfOpen(false)} title="Cash / Bank Contra Transfer" maxWidthClass="max-w-md">
        <form onSubmit={handleTransfer} className="space-y-4">
          <div>
            <label className="label-text">From Account</label>
            <select className="input-field" value={trfFrom} onChange={(e) => setTrfFrom(Number(e.target.value))}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({formatINR(a.current_balance)})</option>)}
            </select>
          </div>
          <div>
            <label className="label-text">To Account</label>
            <select className="input-field" value={trfTo} onChange={(e) => setTrfTo(Number(e.target.value))}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({formatINR(a.current_balance)})</option>)}
            </select>
          </div>
          <div>
            <label className="label-text">Amount (₹)</label>
            <input type="number" step="0.01" min="0.01" required className="input-field" value={trfAmt} onChange={(e) => setTrfAmt(e.target.value)} />
          </div>
          <div>
            <label className="label-text">Description</label>
            <input required className="input-field" value={trfDesc} onChange={(e) => setTrfDesc(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setTrfOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Execute Transfer</button>
          </div>
        </form>
      </Modal>

      {/* New Account Modal */}
      <Modal open={accOpen} onClose={() => setAccOpen(false)} title="Add Bank or Cash Account" maxWidthClass="max-w-md">
        <form onSubmit={handleCreateAccount} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-text">Code</label>
              <input required className="input-field" placeholder="HDFC-01" value={accCode} onChange={(e) => setAccCode(e.target.value)} />
            </div>
            <div>
              <label className="label-text">Type</label>
              <select className="input-field" value={accType} onChange={(e) => setAccType(e.target.value)}>
                <option value="BANK">Bank Account</option>
                <option value="CASH">Cash Drawer</option>
                <option value="UPI">UPI Wallet</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label-text">Account Name</label>
            <input required className="input-field" placeholder="HDFC Current Account" value={accName} onChange={(e) => setAccName(e.target.value)} />
          </div>
          <div>
            <label className="label-text">Opening Balance (₹)</label>
            <input type="number" step="0.01" className="input-field" value={accBal} onChange={(e) => setAccBal(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAccOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Create Account</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

