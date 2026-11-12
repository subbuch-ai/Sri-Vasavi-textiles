import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2, FileText, PackageCheck, Plus, RotateCcw, Trash2 } from "lucide-react";
import { EmptyState } from "../components/common/EmptyState";
import { Modal } from "../components/common/Modal";
import { NumberInput } from "../components/common/NumberInput";
import { StatusBadge } from "../components/common/StatusBadge";
import { usePermission } from "../hooks/usePermission";
import { api, extractErrorMessage } from "../services/api";
import {
  Account,
  GoodsReceipt,
  PaginatedResponse,
  Product,
  PurchaseInvoice,
  PurchaseOrder,
  Supplier,
} from "../types/erp";
import { formatDate, formatINR, formatQty, todayISO } from "../utils/formatters";

interface LineDraft {
  product_id: number;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  gst_rate: number;
}

export const PurchasesPage: React.FC = () => {
  const { hasPermission } = usePermission();
  const [tab, setTab] = useState<"orders" | "grns" | "invoices">("orders");
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [grns, setGrns] = useState<GoodsReceipt[]>([]);
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<string | null>(null);

  // PO Creation Modal
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [poSupplierId, setPoSupplierId] = useState<number>(0);
  const [poDate, setPoDate] = useState(todayISO());
  const [poExpectedDate, setPoExpectedDate] = useState("");
  const [poTransport, setPoTransport] = useState(0);
  const [poDiscount, setPoDiscount] = useState(0);
  const [poNotes, setPoNotes] = useState("");
  const [poLines, setPoLines] = useState<LineDraft[]>([]);

  // GRN Receive Modal
  const [grnModalOpen, setGrnModalOpen] = useState(false);
  const [selectedPo, setSelectedPo] = useState<PurchaseOrder | null>(null);
  const [grnDate, setGrnDate] = useState(todayISO());
  const [grnChallan, setGrnChallan] = useState("");
  const [grnQtys, setGrnQtys] = useState<Record<number, number>>({});

  // Purchase Invoice Modal
  const [invModalOpen, setInvModalOpen] = useState(false);
  const [invSupplierId, setInvSupplierId] = useState<number>(0);
  const [invSupplierBillNo, setInvSupplierBillNo] = useState("");
  const [invDate, setInvDate] = useState(todayISO());
  const [invPoId, setInvPoId] = useState<string>("");
  const [invTransport, setInvTransport] = useState(0);
  const [invPaid, setInvPaid] = useState(0);
  const [invMode, setInvMode] = useState("BANK_TRANSFER");
  const [invAccountId, setInvAccountId] = useState<string>("");
  const [invReceiveStockNow, setInvReceiveStockNow] = useState(false);
  const [invLines, setInvLines] = useState<LineDraft[]>([]);

  // Return Modal
  const [retModalOpen, setRetModalOpen] = useState(false);
  const [retInvoice, setRetInvoice] = useState<PurchaseInvoice | null>(null);
  const [retReason, setRetReason] = useState("");
  const [retQtys, setRetQtys] = useState<Record<number, number>>({});

  const loadData = useCallback(async () => {
    try {
      const [poRes, grnRes, invRes, supRes, prodRes] = await Promise.all([
        api.get<PaginatedResponse<PurchaseOrder>>("/purchases/orders?page_size=50"),
        api.get<PaginatedResponse<GoodsReceipt>>("/purchases/grns?page_size=50"),
        api.get<PaginatedResponse<PurchaseInvoice>>("/purchases/invoices?page_size=50"),
        api.get<PaginatedResponse<Supplier>>("/suppliers?page_size=200"),
        api.get<PaginatedResponse<Product>>("/products?page_size=200"),
      ]);
      setPos(poRes.data.items);
      setGrns(grnRes.data.items);
      setInvoices(invRes.data.items);
      setSuppliers(supRes.data.items);
      setProducts(prodRes.data.items);

      if (supRes.data.items.length > 0) {
        const firstId = supRes.data.items[0].id;
        setPoSupplierId((prev) => prev || firstId);
        setInvSupplierId((prev) => prev || firstId);
      }
      api.get<Account[]>("/accounts").then((r) => setAccounts(r.data)).catch(() => {});
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const addDraftLine = (setter: React.Dispatch<React.SetStateAction<LineDraft[]>>) => {
    const p = products[0];
    if (!p) return;
    setter((prev) => [
      ...prev,
      {
        product_id: p.id,
        quantity: 1,
        unit_price: Number(p.purchase_price),
        discount_amount: 0,
        gst_rate: Number(p.gst_rate),
      },
    ]);
  };

  const openPoModal = () => {
    setPoNotes("");
    setPoTransport(0);
    setPoDiscount(0);
    setPoLines(
      products[0]
        ? [{ product_id: products[0].id, quantity: 10, unit_price: Number(products[0].purchase_price), discount_amount: 0, gst_rate: Number(products[0].gst_rate) }]
        : []
    );
    setPoModalOpen(true);
  };

  const handleCreatePo = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/purchases/orders", {
        supplier_id: Number(poSupplierId),
        order_date: poDate,
        expected_date: poExpectedDate || null,
        discount_amount: Number(poDiscount),
        transport_charges: Number(poTransport),
        status: "CONFIRMED",
        notes: poNotes || null,
        items: poLines,
      });
      setPoModalOpen(false);
      await loadData();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const openReceiveModal = (po: PurchaseOrder) => {
    setSelectedPo(po);
    setGrnDate(todayISO());
    setGrnChallan("");
    const initial: Record<number, number> = {};
    po.items.forEach((it) => {
      const rem = Math.max(0, Number(it.quantity) - Number(it.received_quantity));
      initial[it.id] = rem;
    });
    setGrnQtys(initial);
    setGrnModalOpen(true);
  };

  const handleReceiveGrn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPo) return;
    setError(null);
    try {
      const items = selectedPo.items
        .filter((it) => (grnQtys[it.id] || 0) > 0)
        .map((it) => ({
          po_item_id: it.id,
          product_id: it.product_id,
          quantity_received: Number(grnQtys[it.id]),
          unit_cost: Number(it.unit_price),
        }));
      if (items.length === 0) {
        setError("Enter at least one quantity > 0 to receive.");
        return;
      }
      await api.post("/purchases/grns", {
        purchase_order_id: selectedPo.id,
        supplier_id: selectedPo.supplier_id,
        received_date: grnDate,
        challan_number: grnChallan || null,
        items,
      });
      setGrnModalOpen(false);
      await loadData();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const openInvModal = () => {
    setInvSupplierBillNo("");
    setInvPaid(0);
    setInvTransport(0);
    setInvPoId("");
    setInvReceiveStockNow(false);
    setInvLines(
      products[0]
        ? [{ product_id: products[0].id, quantity: 10, unit_price: Number(products[0].purchase_price), discount_amount: 0, gst_rate: Number(products[0].gst_rate) }]
        : []
    );
    setInvModalOpen(true);
  };

  const handleCreatePurchaseInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/purchases/invoices", {
        supplier_id: Number(invSupplierId),
        supplier_invoice_no: invSupplierBillNo,
        purchase_order_id: invPoId ? Number(invPoId) : null,
        invoice_date: invDate,
        transport_charges: Number(invTransport),
        paid_amount: Number(invPaid),
        payment_mode: invMode,
        account_id: invAccountId ? Number(invAccountId) : null,
        receive_stock_now: invReceiveStockNow,
        items: invLines,
      });
      setInvModalOpen(false);
      setTab("invoices");
      await loadData();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const openReturnModal = (inv: PurchaseInvoice) => {
    setRetInvoice(inv);
    setRetReason("");
    const init: Record<number, number> = {};
    inv.items.forEach((it) => {
      init[it.product_id] = 0;
    });
    setRetQtys(init);
    setRetModalOpen(true);
  };

  const handlePurchaseReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!retInvoice) return;
    setError(null);
    try {
      const items = Object.entries(retQtys)
        .filter(([, q]) => Number(q) > 0)
        .map(([pid, q]) => ({ product_id: Number(pid), quantity: Number(q) }));
      if (items.length === 0) {
        setError("Enter return quantity for at least one item.");
        return;
      }
      await api.post("/purchases/returns", {
        purchase_invoice_id: retInvoice.id,
        return_date: todayISO(),
        reason: retReason || null,
        items,
      });
      setRetModalOpen(false);
      await loadData();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const computeLinesTotal = (lines: LineDraft[], extra = 0, disc = 0) => {
    const sum = lines.reduce((acc, l) => {
      const base = Math.max(0, l.quantity * l.unit_price - l.discount_amount);
      return acc + base + (base * l.gst_rate) / 100;
    }, 0);
    return Math.max(0, sum + Number(extra) - Number(disc));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-navy-900">Purchase Management</h2>
          <p className="text-xs text-slate-500">Purchase Orders → Goods Receipt (Stock In) → Supplier Purchase Bills & Returns</p>
        </div>
        {hasPermission("purchases:create") && (
          <div className="flex items-center gap-2">
            <button onClick={openInvModal} className="btn-secondary">
              <FileText className="h-4 w-4" /> Record Purchase Bill
            </button>
            <button onClick={openPoModal} className="btn-primary">
              <Plus className="h-4 w-4" /> New Purchase Order
            </button>
          </div>
        )}
      </div>

      {error && <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">{error}</div>}

      <div className="flex gap-2 border-b border-slate-200">
        <button onClick={() => setTab("orders")} className={`px-4 py-2 text-sm font-semibold border-b-2 ${tab === "orders" ? "border-navy-700 text-navy-900" : "border-transparent text-slate-500"}`}>
          Purchase Orders ({pos.length})
        </button>
        <button onClick={() => setTab("grns")} className={`px-4 py-2 text-sm font-semibold border-b-2 ${tab === "grns" ? "border-navy-700 text-navy-900" : "border-transparent text-slate-500"}`}>
          Goods Receipts ({grns.length})
        </button>
        <button onClick={() => setTab("invoices")} className={`px-4 py-2 text-sm font-semibold border-b-2 ${tab === "invoices" ? "border-navy-700 text-navy-900" : "border-transparent text-slate-500"}`}>
          Purchase Invoices ({invoices.length})
        </button>
      </div>

      {tab === "orders" && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">PO Number</th>
                  <th className="px-4 py-3 text-left">Supplier</th>
                  <th className="px-4 py-3 text-left">Order Date</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pos.length === 0 ? (
                  <tr><td colSpan={6}><EmptyState title="No purchase orders yet" description="Create a Purchase Order for bulk manufacturer stock." /></td></tr>
                ) : (
                  pos.map((po) => (
                    <tr key={po.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-navy-900 text-xs">{po.po_number}</td>
                      <td className="px-4 py-3 text-xs font-medium">{po.supplier_name}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{formatDate(po.order_date)}</td>
                      <td className="px-4 py-3 text-right text-xs font-bold">{formatINR(po.total_amount)}</td>
                      <td className="px-4 py-3 text-center"><StatusBadge status={po.status} /></td>
                      <td className="px-4 py-3 text-right">
                        {hasPermission("purchases:receive") && !["RECEIVED", "CANCELLED"].includes(po.status) && (
                          <button onClick={() => openReceiveModal(po)} className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700">
                            <PackageCheck className="h-3.5 w-3.5" /> Receive Goods
                          </button>
                        )}
                        {po.status === "RECEIVED" && (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Received
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "grns" && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">GRN No</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Supplier</th>
                  <th className="px-4 py-3 text-left">PO Ref</th>
                  <th className="px-4 py-3 text-left">Items Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {grns.length === 0 ? (
                  <tr><td colSpan={5}><EmptyState title="No Goods Receipts recorded yet" /></td></tr>
                ) : (
                  grns.map((g) => (
                    <tr key={g.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-xs text-navy-900">{g.grn_number}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{formatDate(g.received_date)}</td>
                      <td className="px-4 py-3 text-xs font-medium">{g.supplier_name}</td>
                      <td className="px-4 py-3 text-xs">{g.po_number || g.challan_number || "-"}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {g.items.map((it) => `${it.product_name} (${formatQty(it.quantity_received)})`).join(", ")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "invoices" && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Bill No</th>
                  <th className="px-4 py-3 text-left">Supplier</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3 text-right">Pending</th>
                  <th className="px-4 py-3 text-center">Payment</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.length === 0 ? (
                  <tr><td colSpan={8}><EmptyState title="No purchase bills recorded yet" /></td></tr>
                ) : (
                  invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-xs text-navy-900">{inv.invoice_number}</p>
                        <p className="text-[11px] text-slate-400">Sup Ref: {inv.supplier_invoice_no}</p>
                      </td>
                      <td className="px-4 py-3 text-xs font-medium">{inv.supplier_name}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{formatDate(inv.invoice_date)}</td>
                      <td className="px-4 py-3 text-right text-xs font-bold">{formatINR(inv.total_amount)}</td>
                      <td className="px-4 py-3 text-right text-xs text-emerald-700">{formatINR(inv.paid_amount)}</td>
                      <td className="px-4 py-3 text-right text-xs font-semibold text-rose-700">{formatINR(inv.pending_amount)}</td>
                      <td className="px-4 py-3 text-center"><StatusBadge status={inv.payment_status} /></td>
                      <td className="px-4 py-3 text-right">
                        {hasPermission("purchases:return") && (
                          <button onClick={() => openReturnModal(inv)} className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 hover:underline">
                            <RotateCcw className="h-3.5 w-3.5" /> Return
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PO Modal */}
      <Modal open={poModalOpen} onClose={() => setPoModalOpen(false)} title="Create Purchase Order" subtitle="Note: Stock increases only when goods are received via GRN" maxWidthClass="max-w-3xl lg:max-w-4xl">
        <form onSubmit={handleCreatePo} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-3">
            <div>
              <label className="label-text">Supplier *</label>
              <select className="input-field" value={poSupplierId} onChange={(e) => setPoSupplierId(Number(e.target.value))}>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.company_name}</option>)}
              </select>
            </div>
            <div>
              <label className="label-text">Order Date</label>
              <input type="date" className="input-field" value={poDate} onChange={(e) => setPoDate(e.target.value)} required />
            </div>
            <div>
              <label className="label-text">Expected Delivery</label>
              <input type="date" className="input-field" value={poExpectedDate} onChange={(e) => setPoExpectedDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="label-text">Order Items</span>
              <button type="button" onClick={() => addDraftLine(setPoLines)} className="text-xs font-semibold text-navy-700 hover:underline">+ Add Line</button>
            </div>
            <div className="max-h-36 sm:max-h-44 overflow-y-auto space-y-2 pr-1">
            {poLines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-2 rounded-lg">
                <select
                  className="input-field col-span-5"
                  value={line.product_id}
                  onChange={(e) => {
                    const p = products.find((x) => x.id === Number(e.target.value));
                    setPoLines((prev) => prev.map((r, i) => (i === idx && p ? { ...r, product_id: p.id, unit_price: Number(p.purchase_price), gst_rate: Number(p.gst_rate) } : r)));
                  }}
                >
                  {products.map((p) => <option key={p.id} value={p.id}>{p.product_code} — {p.name}</option>)}
                </select>
                <NumberInput className="input-field col-span-2" placeholder="Qty" value={line.quantity} onValueChange={(val) => setPoLines((prev) => prev.map((r, i) => (i === idx ? { ...r, quantity: val } : r)))} />
                <NumberInput className="input-field col-span-2" placeholder="Rate" value={line.unit_price} onValueChange={(val) => setPoLines((prev) => prev.map((r, i) => (i === idx ? { ...r, unit_price: val } : r)))} />
                <NumberInput className="input-field col-span-2" placeholder="GST%" value={line.gst_rate} onValueChange={(val) => setPoLines((prev) => prev.map((r, i) => (i === idx ? { ...r, gst_rate: val } : r)))} />
                <button type="button" onClick={() => setPoLines((prev) => prev.filter((_, i) => i !== idx))} className="col-span-1 text-rose-600 flex justify-center">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label-text">Transport Charges (₹)</label>
              <NumberInput className="input-field" value={poTransport} onValueChange={setPoTransport} />
            </div>
            <div>
              <label className="label-text">Discount (₹)</label>
              <NumberInput className="input-field" value={poDiscount} onValueChange={setPoDiscount} />
            </div>
            <div className="flex flex-col justify-end text-right">
              <span className="text-xs text-slate-500">Estimated Total</span>
              <span className="text-lg font-bold text-navy-900">{formatINR(computeLinesTotal(poLines, poTransport, poDiscount))}</span>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setPoModalOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Confirm Purchase Order</button>
          </div>
        </form>
      </Modal>

      {/* Receive Goods (GRN) Modal */}
      <Modal open={grnModalOpen} onClose={() => setGrnModalOpen(false)} title={`Receive Goods (GRN) — ${selectedPo?.po_number || ""}`} maxWidthClass="max-w-2xl">
        <form onSubmit={handleReceiveGrn} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-text">Received Date</label>
              <input type="date" className="input-field" value={grnDate} onChange={(e) => setGrnDate(e.target.value)} required />
            </div>
            <div>
              <label className="label-text">Supplier Challan / LR No</label>
              <input className="input-field" value={grnChallan} onChange={(e) => setGrnChallan(e.target.value)} />
            </div>
          </div>
          <div className="border rounded-lg overflow-x-auto max-h-52 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Product</th>
                  <th className="px-3 py-2 text-right">Ordered</th>
                  <th className="px-3 py-2 text-right">Already Recv</th>
                  <th className="px-3 py-2 text-right">Receive Now</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {selectedPo?.items.map((it) => {
                  const maxRem = Math.max(0, Number(it.quantity) - Number(it.received_quantity));
                  return (
                    <tr key={it.id}>
                      <td className="px-3 py-2 font-medium">{it.product_name}</td>
                      <td className="px-3 py-2 text-right">{formatQty(it.quantity)}</td>
                      <td className="px-3 py-2 text-right">{formatQty(it.received_quantity)}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max={maxRem}
                          value={grnQtys[it.id] ?? 0}
                          onChange={(e) => setGrnQtys((prev) => ({ ...prev, [it.id]: Number(e.target.value) }))}
                          className="input-field w-24 text-right ml-auto"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setGrnModalOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Confirm Receipt & Increase Stock</button>
          </div>
        </form>
      </Modal>

      {/* Purchase Invoice Modal */}
      <Modal open={invModalOpen} onClose={() => setInvModalOpen(false)} title="Record Supplier Purchase Invoice" maxWidthClass="max-w-3xl lg:max-w-4xl">
        <form onSubmit={handleCreatePurchaseInvoice} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-3">
            <div>
              <label className="label-text">Supplier *</label>
              <select className="input-field" value={invSupplierId} onChange={(e) => setInvSupplierId(Number(e.target.value))}>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.company_name}</option>)}
              </select>
            </div>
            <div>
              <label className="label-text">Supplier Bill No *</label>
              <input required className="input-field" value={invSupplierBillNo} onChange={(e) => setInvSupplierBillNo(e.target.value)} placeholder="MILL-INV-101" />
            </div>
            <div>
              <label className="label-text">Invoice Date</label>
              <input type="date" required className="input-field" value={invDate} onChange={(e) => setInvDate(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-text">Link Purchase Order (Optional)</label>
              <select className="input-field" value={invPoId} onChange={(e) => setInvPoId(e.target.value)}>
                <option value="">None / Direct Purchase</option>
                {pos.map((p) => <option key={p.id} value={p.id}>{p.po_number} ({p.supplier_name})</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-navy-900 pt-5 cursor-pointer">
              <input type="checkbox" checked={invReceiveStockNow} onChange={(e) => setInvReceiveStockNow(e.target.checked)} className="rounded" />
              Also increase stock now (auto-GRN if not already received)
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="label-text">Invoice Line Items</span>
              <button type="button" onClick={() => addDraftLine(setInvLines)} className="text-xs font-semibold text-navy-700 hover:underline">+ Add Line</button>
            </div>
            <div className="max-h-36 sm:max-h-44 overflow-y-auto space-y-2 pr-1">
            {invLines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-2 rounded-lg">
                <select
                  className="input-field col-span-5"
                  value={line.product_id}
                  onChange={(e) => {
                    const p = products.find((x) => x.id === Number(e.target.value));
                    setInvLines((prev) => prev.map((r, i) => (i === idx && p ? { ...r, product_id: p.id, unit_price: Number(p.purchase_price), gst_rate: Number(p.gst_rate) } : r)));
                  }}
                >
                  {products.map((p) => <option key={p.id} value={p.id}>{p.product_code} — {p.name}</option>)}
                </select>
                <NumberInput className="input-field col-span-2" value={line.quantity} onValueChange={(val) => setInvLines((prev) => prev.map((r, i) => (i === idx ? { ...r, quantity: val } : r)))} />
                <NumberInput className="input-field col-span-2" value={line.unit_price} onValueChange={(val) => setInvLines((prev) => prev.map((r, i) => (i === idx ? { ...r, unit_price: val } : r)))} />
                <NumberInput className="input-field col-span-2" value={line.gst_rate} onValueChange={(val) => setInvLines((prev) => prev.map((r, i) => (i === idx ? { ...r, gst_rate: val } : r)))} />
                <button type="button" onClick={() => setInvLines((prev) => prev.filter((_, i) => i !== idx))} className="col-span-1 text-rose-600 flex justify-center">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="label-text">Transport (₹)</label>
              <NumberInput className="input-field" value={invTransport} onValueChange={setInvTransport} />
            </div>
            <div>
              <label className="label-text">Paid Now (₹)</label>
              <NumberInput className="input-field" value={invPaid} onValueChange={setInvPaid} />
            </div>
            <div>
              <label className="label-text">Payment Mode</label>
              <select
                className="input-field"
                value={invMode}
                onChange={(e) => {
                  const mode = e.target.value;
                  setInvMode(mode);
                  if (mode === "CREDIT") {
                    setInvPaid(0);
                    setInvAccountId("");
                  }
                }}
              >
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="CHEQUE">Cheque</option>
                <option value="CREDIT">Credit</option>
              </select>
            </div>
            <div>
              <label className="label-text">Pay From Account</label>
              <select
                className="input-field"
                value={invAccountId}
                onChange={(e) => setInvAccountId(e.target.value)}
                disabled={invMode === "CREDIT" && invPaid === 0}
              >
                <option value="">{invMode === "CREDIT" && invPaid === 0 ? "N/A (Credit)" : "Auto Default"}</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-sm font-bold text-navy-900">
              Invoice Total: {formatINR(computeLinesTotal(invLines, invTransport, 0))}
            </span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setInvModalOpen(false)} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary">Save Purchase Invoice</button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Purchase Return Modal */}
      <Modal open={retModalOpen} onClose={() => setRetModalOpen(false)} title={`Purchase Return — ${retInvoice?.invoice_number || ""}`} maxWidthClass="max-w-lg">
        <form onSubmit={handlePurchaseReturn} className="space-y-4">
          <div className="space-y-2">
            {retInvoice?.items.map((it) => {
              const maxRet = Math.max(0, Number(it.quantity) - Number(it.returned_quantity));
              return (
                <div key={it.id} className="flex items-center justify-between gap-3 bg-slate-50 p-2 rounded">
                  <div className="text-xs">
                    <p className="font-semibold">{it.product_name}</p>
                    <p className="text-slate-500">Returnable: {formatQty(maxRet)}</p>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={maxRet}
                    className="input-field w-24 text-right"
                    value={retQtys[it.product_id] ?? 0}
                    onChange={(e) => setRetQtys((prev) => ({ ...prev, [it.product_id]: Number(e.target.value) }))}
                  />
                </div>
              );
            })}
          </div>
          <div>
            <label className="label-text">Reason</label>
            <input className="input-field" value={retReason} onChange={(e) => setRetReason(e.target.value)} placeholder="Defective lot / color mismatch" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setRetModalOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Process Return</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

