import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowLeftRight, Boxes, IndianRupee, PlusCircle } from "lucide-react";
import { EmptyState } from "../components/common/EmptyState";
import { KpiCard } from "../components/common/KpiCard";
import { Modal } from "../components/common/Modal";
import { StatusBadge } from "../components/common/StatusBadge";
import { usePermission } from "../hooks/usePermission";
import { api, extractErrorMessage } from "../services/api";
import { Branch } from "../types/auth";
import { PaginatedResponse, Product, StockTransaction } from "../types/erp";
import { formatDate, formatINR, formatQty } from "../utils/formatters";

interface ValuationSummary {
  total_skus: number;
  total_units: number;
  total_cost_value: number;
  total_wholesale_value: number;
  total_retail_value: number;
  low_stock_count: number;
}

export const InventoryPage: React.FC = () => {
  const { hasPermission } = usePermission();
  const [valuation, setValuation] = useState<ValuationSummary | null>(null);
  const [lowStock, setLowStock] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [tab, setTab] = useState<"transactions" | "low_stock">("transactions");
  const [error, setError] = useState<string | null>(null);

  const [adjOpen, setAdjOpen] = useState(false);
  const [adjProductId, setAdjProductId] = useState<number>(0);
  const [adjBranchId, setAdjBranchId] = useState<number>(0);
  const [adjType, setAdjType] = useState("STOCK_IN");
  const [adjQty, setAdjQty] = useState("");
  const [adjNotes, setAdjNotes] = useState("");

  const [trfOpen, setTrfOpen] = useState(false);
  const [trfProd, setTrfProd] = useState<number>(0);
  const [trfSrc, setTrfSrc] = useState<number>(0);
  const [trfDst, setTrfDst] = useState<number>(0);
  const [trfQty, setTrfQty] = useState("");
  const [trfNotes, setTrfNotes] = useState("");

  const loadData = useCallback(async () => {
    try {
      const [valRes, lsRes, txRes, prodRes, brRes] = await Promise.all([
        api.get<ValuationSummary>("/inventory/valuation"),
        api.get<Product[]>("/inventory/low-stock"),
        api.get<PaginatedResponse<StockTransaction>>("/inventory/transactions?page_size=50"),
        api.get<PaginatedResponse<Product>>("/products?page_size=200"),
        api.get<Branch[]>("/settings/branches"),
      ]);
      setValuation(valRes.data);
      setLowStock(lsRes.data);
      setTransactions(txRes.data.items);
      setProducts(prodRes.data.items);
      setBranches(brRes.data);
      if (prodRes.data.items.length > 0) {
        const firstProd = prodRes.data.items[0].id;
        setAdjProductId((prev) => prev || firstProd);
        setTrfProd((prev) => prev || firstProd);
      }
      if (brRes.data.length > 0) {
        const firstBr = brRes.data[0].id;
        const secondBr = brRes.data[1]?.id || firstBr;
        setAdjBranchId((prev) => prev || firstBr);
        setTrfSrc((prev) => prev || firstBr);
        setTrfDst((prev) => prev || secondBr);
      }
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/inventory/adjust", {
        product_id: Number(adjProductId),
        branch_id: Number(adjBranchId) || undefined,
        transaction_type: adjType,
        quantity: Number(adjQty),
        notes: adjNotes || undefined,
      });
      setAdjOpen(false);
      setAdjQty("");
      setAdjNotes("");
      await loadData();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/inventory/transfer", {
        product_id: Number(trfProd),
        source_branch_id: Number(trfSrc),
        target_branch_id: Number(trfDst),
        quantity: Number(trfQty),
        notes: trfNotes || undefined,
      });
      setTrfOpen(false);
      setTrfQty("");
      setTrfNotes("");
      await loadData();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-navy-900">Inventory & Stock Control</h2>
          <p className="text-xs text-slate-500">Stock valuation, low stock alerts, adjustments, damaged stock, transfers, and movement ledger</p>
        </div>
        {hasPermission("inventory:adjust") && (
          <div className="flex items-center gap-2">
            <button onClick={() => setTrfOpen(true)} className="btn-secondary">
              <ArrowLeftRight className="h-4 w-4" /> Branch Transfer
            </button>
            <button onClick={() => setAdjOpen(true)} className="btn-primary">
              <PlusCircle className="h-4 w-4" /> Stock Adjustment
            </button>
          </div>
        )}
      </div>

      {error && <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">{error}</div>}

      {valuation && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard title="Total Active SKUs" value={String(valuation.total_skus)} subtitle={`${valuation.total_units} total units`} icon={Boxes} accent="navy" />
          <KpiCard title="Stock Cost Valuation" value={formatINR(valuation.total_cost_value)} icon={IndianRupee} accent="gold" />
          <KpiCard title="Potential Retail Value" value={formatINR(valuation.total_retail_value)} icon={IndianRupee} accent="emerald" />
          <KpiCard title="Low Stock Items" value={String(valuation.low_stock_count)} icon={AlertTriangle} accent="rose" />
        </div>
      )}

      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setTab("transactions")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 ${tab === "transactions" ? "border-navy-700 text-navy-900" : "border-transparent text-slate-500"}`}
        >
          Stock Movement History
        </button>
        <button
          onClick={() => setTab("low_stock")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 ${tab === "low_stock" ? "border-rose-600 text-rose-700" : "border-transparent text-slate-500"}`}
        >
          Low Stock Alerts ({lowStock.length})
        </button>
      </div>

      {tab === "transactions" ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Tx No</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Product</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-right">Change</th>
                  <th className="px-4 py-3 text-right">Before → After</th>
                  <th className="px-4 py-3 text-left">Reference / Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.length === 0 ? (
                  <tr><td colSpan={7}><EmptyState title="No stock movements yet" /></td></tr>
                ) : (
                  transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-xs text-navy-900">{tx.transaction_number}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{formatDate(tx.created_at)}</td>
                      <td className="px-4 py-3 text-xs">
                        <p className="font-semibold text-slate-800">{tx.product_name}</p>
                        <p className="text-slate-400">{tx.product_code} • {tx.branch_name}</p>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={tx.transaction_type} /></td>
                      <td className={`px-4 py-3 text-right text-xs font-bold ${Number(tx.quantity_change) >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                        {Number(tx.quantity_change) >= 0 ? `+${formatQty(tx.quantity_change)}` : formatQty(tx.quantity_change)}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-slate-600">
                        {formatQty(tx.stock_before)} → <span className="font-semibold text-slate-900">{formatQty(tx.stock_after)}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 max-w-xs truncate">
                        {tx.reference_number ? `${tx.reference_number} — ` : ""}{tx.notes || "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">SKU</th>
                  <th className="px-4 py-3 text-left">Product</th>
                  <th className="px-4 py-3 text-left">Category</th>
                  <th className="px-4 py-3 text-right">Current Stock</th>
                  <th className="px-4 py-3 text-right">Min Stock Level</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lowStock.length === 0 ? (
                  <tr><td colSpan={5}><EmptyState title="No low stock alerts" /></td></tr>
                ) : (
                  lowStock.map((p) => (
                    <tr key={p.id} className="hover:bg-rose-50/40">
                      <td className="px-4 py-3 text-xs font-semibold text-navy-900">{p.product_code}</td>
                      <td className="px-4 py-3 text-xs font-medium">{p.name}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{p.category_name}</td>
                      <td className="px-4 py-3 text-right text-xs font-bold text-rose-600">{formatQty(p.current_stock)} {p.unit}</td>
                      <td className="px-4 py-3 text-right text-xs text-slate-500">{formatQty(p.min_stock_level)} {p.unit}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={adjOpen} onClose={() => setAdjOpen(false)} title="Record Stock Movement / Adjustment" maxWidthClass="max-w-lg">
        <form onSubmit={handleAdjust} className="space-y-4">
          <div>
            <label className="label-text">Product</label>
            <select className="input-field" value={adjProductId} onChange={(e) => setAdjProductId(Number(e.target.value))}>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.product_code} — {p.name} (Avail: {formatQty(p.current_stock)})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-text">Movement Type</label>
              <select className="input-field" value={adjType} onChange={(e) => setAdjType(e.target.value)}>
                <option value="STOCK_IN">Stock In (+)</option>
                <option value="STOCK_OUT">Stock Out (-)</option>
                <option value="DAMAGED">Damaged Stock (-)</option>
                <option value="RETURNED_IN">Returned In (+)</option>
                <option value="RETURNED_OUT">Returned Out (-)</option>
                <option value="ADJUSTMENT">Manual Adjustment (+/-)</option>
              </select>
            </div>
            <div>
              <label className="label-text">Quantity</label>
              <input type="number" step="0.01" required className="input-field" value={adjQty} onChange={(e) => setAdjQty(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label-text">Branch</label>
            <select className="input-field" value={adjBranchId} onChange={(e) => setAdjBranchId(Number(e.target.value))}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-text">Notes / Reason</label>
            <textarea rows={2} className="input-field" value={adjNotes} onChange={(e) => setAdjNotes(e.target.value)} placeholder="Reason for stock adjustment..." />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAdjOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Save Stock Movement</button>
          </div>
        </form>
      </Modal>

      <Modal open={trfOpen} onClose={() => setTrfOpen(false)} title="Inter-Branch Stock Transfer" maxWidthClass="max-w-lg">
        <form onSubmit={handleTransfer} className="space-y-4">
          <div>
            <label className="label-text">Product</label>
            <select className="input-field" value={trfProd} onChange={(e) => setTrfProd(Number(e.target.value))}>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.product_code} — {p.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-text">From Branch</label>
              <select className="input-field" value={trfSrc} onChange={(e) => setTrfSrc(Number(e.target.value))}>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label-text">To Branch</label>
              <select className="input-field" value={trfDst} onChange={(e) => setTrfDst(Number(e.target.value))}>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label-text">Quantity</label>
            <input type="number" step="0.01" min="0.01" required className="input-field" value={trfQty} onChange={(e) => setTrfQty(e.target.value)} />
          </div>
          <div>
            <label className="label-text">Notes</label>
            <input className="input-field" value={trfNotes} onChange={(e) => setTrfNotes(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setTrfOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Execute Transfer</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

