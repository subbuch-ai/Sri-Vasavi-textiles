import React, { useCallback, useEffect, useRef, useState } from "react";
import { Download, Eye, Plus, Printer, RotateCcw, Search, ShoppingCart, Trash2, Wallet } from "lucide-react";
import { CollectInvoicePaymentModal, PaymentSettlementTarget } from "../components/common/CollectInvoicePaymentModal";
import { EmptyState } from "../components/common/EmptyState";
import { Modal } from "../components/common/Modal";
import { NumberInput } from "../components/common/NumberInput";
import { StatusBadge } from "../components/common/StatusBadge";
import { usePermission } from "../hooks/usePermission";
import { api, extractErrorMessage } from "../services/api";
import { Account, Customer, PaginatedResponse, Product, Sale } from "../types/erp";
import { fetchAuthenticatedBlobUrl, triggerBlobDownload } from "../utils/download";
import { formatDate, formatINR, formatQty, todayISO } from "../utils/formatters";

interface CartLine {
  product: Product;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  gst_rate: number;
}

export const SalesPage: React.FC = () => {
  const { hasPermission } = usePermission();
  const [sales, setSales] = useState<Sale[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [filterType, setFilterType] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);

  // Billing Modal State
  const [billOpen, setBillOpen] = useState(false);
  const [saleType, setSaleType] = useState<"RETAIL" | "WHOLESALE">("RETAIL");
  const [customerId, setCustomerId] = useState<string>("");
  const [walkinName, setWalkinName] = useState("Walk-in Retail Customer");
  const [saleDate, setSaleDate] = useState(todayISO());
  const [prodQuery, setProdQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [invoiceDiscount, setInvoiceDiscount] = useState(0);
  const [isInterstate, setIsInterstate] = useState(false);
  const [paymentMode, setPaymentMode] = useState("CASH");
  const [accountId, setAccountId] = useState<string>("");
  const [paidAmount, setPaidAmount] = useState<string>("");
  const [notes, setNotes] = useState("");

  // Sales Return Modal
  const [retOpen, setRetOpen] = useState(false);
  const [retSale, setRetSale] = useState<Sale | null>(null);
  const [retQtys, setRetQtys] = useState<Record<number, number>>({});
  const [retReason, setRetReason] = useState("");
  const [refundCash, setRefundCash] = useState(false);

  // Invoice PDF Preview & Print Modal
  const [previewSale, setPreviewSale] = useState<Sale | null>(null);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [highlightPrint, setHighlightPrint] = useState(false);
  const [payTarget, setPayTarget] = useState<PaymentSettlementTarget | null>(null);
  const pdfFrameRef = useRef<HTMLIFrameElement | null>(null);
  const printBtnRef = useRef<HTMLButtonElement | null>(null);

  const loadData = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page_size: "50" });
      if (filterType) params.set("sale_type", filterType);
      if (search.trim()) params.set("search", search.trim());
      const [sRes, cRes, pRes] = await Promise.all([
        api.get<PaginatedResponse<Sale>>(`/sales?${params.toString()}`),
        api.get<PaginatedResponse<Customer>>("/customers?page_size=200"),
        api.get<PaginatedResponse<Product>>("/products?page_size=200"),
      ]);
      setSales(sRes.data.items);
      setCustomers(cRes.data.items);
      setProducts(pRes.data.items);
      api.get<Account[]>("/accounts").then((r) => setAccounts(r.data)).catch(() => {});
      api
        .get<{ allow_negative_stock: boolean }>("/settings")
        .then((r) => setAllowNegativeStock(Boolean(r.data.allow_negative_stock)))
        .catch(() => {});
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, [filterType, search]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    return () => {
      if (previewPdfUrl) {
        window.URL.revokeObjectURL(previewPdfUrl);
      }
    };
  }, [previewPdfUrl]);

  useEffect(() => {
    if (previewSale && previewPdfUrl && highlightPrint) {
      printBtnRef.current?.focus();
    }
  }, [previewSale, previewPdfUrl, highlightPrint]);

  const openInvoicePreview = async (sale: Sale, shouldHighlightPrint = false) => {
    setError(null);
    if (previewPdfUrl) {
      window.URL.revokeObjectURL(previewPdfUrl);
      setPreviewPdfUrl(null);
    }
    setPreviewSale(sale);
    setHighlightPrint(shouldHighlightPrint);
    setPreviewLoading(true);
    try {
      const url = await fetchAuthenticatedBlobUrl(`/sales/${sale.id}/pdf`, "application/pdf");
      setPreviewPdfUrl(url);
    } catch (err) {
      setPreviewSale(null);
      setHighlightPrint(false);
      setError(extractErrorMessage(err));
    } finally {
      setPreviewLoading(false);
    }
  };

  const closeInvoicePreview = () => {
    if (previewPdfUrl) {
      window.URL.revokeObjectURL(previewPdfUrl);
    }
    setPreviewSale(null);
    setPreviewPdfUrl(null);
    setHighlightPrint(false);
  };

  const handlePrintPreview = () => {
    if (!previewPdfUrl) return;
    const frameWin = pdfFrameRef.current?.contentWindow;
    if (frameWin) {
      try {
        frameWin.focus();
        frameWin.print();
        return;
      } catch {
        // Fallback to opening PDF tab if embedded frame print is restricted
      }
    }
    window.open(previewPdfUrl, "_blank", "noopener,noreferrer");
  };

  const openBilling = (mode: "RETAIL" | "WHOLESALE") => {
    setModalError(null);
    setSaleType(mode);
    setCustomerId("");
    setWalkinName("Walk-in Retail Customer");
    setSaleDate(todayISO());
    setCart([]);
    setInvoiceDiscount(0);
    setPaymentMode("CASH");
    setAccountId("");
    setPaidAmount("");
    setNotes("");
    setProdQuery("");
    setBillOpen(true);
  };

  const addToCart = (p: Product) => {
    setModalError(null);
    const avail = Number(p.current_stock);
    const existing = cart.find((c) => c.product.id === p.id);
    if (!allowNegativeStock) {
      if (avail <= 0) {
        setModalError(`'${p.name}' is out of stock (0 ${p.unit} available).`);
        return;
      }
      if (existing && existing.quantity + 1 > avail) {
        setModalError(`Insufficient stock for '${p.name}': only ${formatQty(avail)} ${p.unit} available.`);
        return;
      }
    }
    const price = saleType === "WHOLESALE" ? Number(p.wholesale_price) : Number(p.retail_price);
    setCart((prev) => {
      const found = prev.find((c) => c.product.id === p.id);
      if (found) {
        return prev.map((c) => (c.product.id === p.id ? { ...c, quantity: c.quantity + 1 } : c));
      }
      return [...prev, { product: p, quantity: Math.min(1, avail > 0 ? 1 : 0) || 1, unit_price: price, discount_amount: 0, gst_rate: Number(p.gst_rate) }];
    });
  };

  const updateCartQuantity = (idx: number, qty: number) => {
    const line = cart[idx];
    if (line) {
      const avail = Number(line.product.current_stock);
      if (!allowNegativeStock && qty > avail) {
        setModalError(`Insufficient stock for '${line.product.name}': only ${formatQty(avail)} ${line.product.unit} available (entered ${qty}).`);
      } else {
        setModalError(null);
      }
    }
    setCart((prev) => prev.map((c, i) => (i === idx ? { ...c, quantity: qty } : c)));
  };

  // Switch price tier automatically when toggling between Wholesale & Retail
  const handleSaleTypeSwitch = (mode: "RETAIL" | "WHOLESALE") => {
    setSaleType(mode);
    setCart((prev) =>
      prev.map((c) => ({
        ...c,
        unit_price: mode === "WHOLESALE" ? Number(c.product.wholesale_price) : Number(c.product.retail_price),
      }))
    );
  };

  // Sync sale type & cart unit prices automatically to match selected Customer type
  const handleCustomerChange = (val: string) => {
    setCustomerId(val);
    setModalError(null);
    if (!val) {
      handleSaleTypeSwitch("RETAIL");
      return;
    }
    const cust = customers.find((c) => String(c.id) === val);
    if (cust) {
      handleSaleTypeSwitch(cust.customer_type === "WHOLESALE" ? "WHOLESALE" : "RETAIL");
    }
  };

  // Switch payment mode and sync default Paid Amount / Deposit Account
  const handlePaymentModeChange = (mode: string) => {
    setPaymentMode(mode);
    setModalError(null);
    if (mode === "CREDIT") {
      setPaidAmount("0");
      setAccountId("");
    } else if (paidAmount === "0") {
      setPaidAmount("");
    }
  };

  const cartTotals = cart.reduce(
    (acc, line) => {
      const base = Math.max(0, line.quantity * line.unit_price - line.discount_amount);
      const gst = (base * line.gst_rate) / 100;
      acc.subtotal += base;
      acc.gst += gst;
      return acc;
    },
    { subtotal: 0, gst: 0 }
  );
  const grandTotal = Math.round(Math.max(0, cartTotals.subtotal - invoiceDiscount + cartTotals.gst));

  const filteredLookupProducts = products.filter((p) => {
    if (!prodQuery.trim()) return true;
    const q = prodQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.product_code.toLowerCase().includes(q) ||
      (p.barcode && p.barcode.toLowerCase().includes(q))
    );
  });

  const handleConfirmSale = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setModalError(null);
    if (cart.length === 0) {
      setModalError("Please add at least one product to the invoice.");
      return;
    }
    const zeroLine = cart.find((c) => c.quantity <= 0);
    if (zeroLine) {
      setModalError(`Quantity for '${zeroLine.product.name}' must be greater than 0.`);
      return;
    }
    if (!allowNegativeStock) {
      const overStock = cart.find((c) => c.quantity > Number(c.product.current_stock));
      if (overStock) {
        setModalError(
          `Insufficient stock for '${overStock.product.name}': only ${formatQty(overStock.product.current_stock)} ${overStock.product.unit} available (requested ${overStock.quantity}).`
        );
        return;
      }
    }
    try {
      const paidVal =
        paidAmount.trim() !== ""
          ? Number(paidAmount)
          : paymentMode !== "CREDIT" && saleType === "RETAIL" && !customerId
            ? grandTotal
            : 0;
      if ((paymentMode === "CREDIT" || paidVal < grandTotal) && !customerId) {
        setModalError("Credit sales require selecting a registered customer.");
        return;
      }
      const res = await api.post<Sale>("/sales", {
        customer_id: customerId ? Number(customerId) : null,
        customer_name_snapshot: !customerId ? walkinName : undefined,
        sale_type: saleType,
        sale_date: saleDate,
        discount_amount: Number(invoiceDiscount),
        is_interstate: isInterstate,
        paid_amount: paidVal,
        payment_mode: paymentMode,
        account_id: accountId ? Number(accountId) : null,
        notes: notes || null,
        items: cart.map((c) => ({
          product_id: c.product.id,
          quantity: c.quantity,
          unit_price: c.unit_price,
          discount_amount: c.discount_amount,
          gst_rate: c.gst_rate,
        })),
      });
      setBillOpen(false);
      await loadData();
      // Open PDF preview without forcing direct download so user can review and print
      await openInvoicePreview(res.data, true);
    } catch (err) {
      setModalError(extractErrorMessage(err));
    }
  };

  const handleSaleReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!retSale) return;
    setError(null);
    try {
      const items = Object.entries(retQtys)
        .filter(([, q]) => Number(q) > 0)
        .map(([pid, q]) => ({ product_id: Number(pid), quantity: Number(q) }));
      if (items.length === 0) {
        setError("Enter return quantity for at least one product.");
        return;
      }
      await api.post("/sales/returns", {
        sale_id: retSale.id,
        return_date: todayISO(),
        reason: retReason || null,
        refund_to_customer: refundCash,
        payment_mode: "CASH",
        items,
      });
      setRetOpen(false);
      await loadData();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-navy-900">Wholesale & Retail Sales Billing</h2>
          <p className="text-xs text-slate-500">POS quick retail checkout, bulk wholesale invoicing, GST tax calculation, and PDF invoices</p>
        </div>
        {hasPermission("sales:create") && (
          <div className="flex items-center gap-2">
            <button onClick={() => openBilling("RETAIL")} className="btn-gold">
              <ShoppingCart className="h-4 w-4" /> Retail POS Billing
            </button>
            <button onClick={() => openBilling("WHOLESALE")} className="btn-primary">
              <Plus className="h-4 w-4" /> Wholesale Invoice
            </button>
          </div>
        )}
      </div>

      {error && <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">{error}</div>}

      <div className="card p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search invoice number or customer..." className="input-field pl-9" />
        </div>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="input-field w-auto">
          <option value="">All Sales</option>
          <option value="WHOLESALE">Wholesale</option>
          <option value="RETAIL">Retail</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Invoice</th>
                <th className="px-4 py-3 text-center">Channel</th>
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Paid</th>
                <th className="px-4 py-3 text-right">Pending</th>
                <th className="px-4 py-3 text-center">Payment</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sales.length === 0 ? (
                <tr><td colSpan={9}><EmptyState title="No sales invoices yet" description="Create a Retail POS bill or Wholesale invoice." /></td></tr>
              ) : (
                sales.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-xs text-navy-900">{s.invoice_number}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={s.sale_type} /></td>
                    <td className="px-4 py-3 text-xs font-medium">{s.customer_name_snapshot}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDate(s.sale_date)}</td>
                    <td className="px-4 py-3 text-right text-xs font-bold">{formatINR(s.total_amount)}</td>
                    <td className="px-4 py-3 text-right text-xs text-emerald-700">{formatINR(s.paid_amount)}</td>
                    <td className="px-4 py-3 text-right text-xs font-semibold text-amber-700">{formatINR(s.pending_amount)}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={s.payment_status} />
                      <p className="text-[10px] text-slate-400 mt-0.5">{s.payment_mode}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => openInvoicePreview(s, false)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-navy-700 hover:underline"
                        >
                          <Eye className="h-3.5 w-3.5" /> PDF
                        </button>
                        {hasPermission("payments:create") && s.customer_id && Number(s.pending_amount) > 0 && (
                          <button
                            onClick={() =>
                              setPayTarget({
                                partyType: "CUSTOMER",
                                partyId: s.customer_id!,
                                partyName: s.customer_name_snapshot,
                                invoiceId: s.id,
                                invoiceNumber: s.invoice_number,
                                totalAmount: Number(s.total_amount),
                                paidAmount: Number(s.paid_amount),
                                pendingAmount: Number(s.pending_amount),
                              })
                            }
                            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
                          >
                            <Wallet className="h-3.5 w-3.5" /> Pay
                          </button>
                        )}
                        {hasPermission("sales:edit") && (
                          <button
                            onClick={() => {
                              setRetSale(s);
                              setRetQtys({});
                              setRetReason("");
                              setRetOpen(true);
                            }}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 hover:underline"
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> Return
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

      {/* Billing POS / Wholesale Modal */}
      <Modal
        open={billOpen}
        onClose={() => setBillOpen(false)}
        title={saleType === "WHOLESALE" ? "Wholesale Bulk Invoice" : "Retail POS Checkout"}
        maxWidthClass="max-w-5xl xl:max-w-6xl"
        headerClassName="px-4 py-2.5 sm:px-5 sm:py-2.5"
        bodyClassName="p-3 sm:px-5 sm:py-2.5 md:[&_.input-field]:py-1 md:[&_.label-text]:mb-0.5"
      >
        <form onSubmit={handleConfirmSale} className="space-y-2.5 md:space-y-2">
          {modalError && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700">
              {modalError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-2">
            <div>
              <label className="label-text">Sale Type</label>
              <select className="input-field" value={saleType} onChange={(e) => handleSaleTypeSwitch(e.target.value as "RETAIL" | "WHOLESALE")}>
                <option value="RETAIL">Retail</option>
                <option value="WHOLESALE">Wholesale</option>
              </select>
            </div>
            <div>
              <label className="label-text">Customer {saleType === "WHOLESALE" ? "*" : "(Optional)"}</label>
              <select className="input-field" value={customerId} onChange={(e) => handleCustomerChange(e.target.value)}>
                <option value="">Walk-in Customer (RETAIL)</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.customer_type})</option>
                ))}
              </select>
            </div>
            {!customerId && (
              <div>
                <label className="label-text">Walk-in Name</label>
                <input className="input-field" value={walkinName} onChange={(e) => setWalkinName(e.target.value)} />
              </div>
            )}
            <div>
              <label className="label-text">Invoice Date</label>
              <input type="date" className="input-field" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} required />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
            <div className="lg:col-span-5 border rounded-xl p-2.5 bg-slate-50 space-y-1.5">
              <label className="label-text">Quick Add Product (Barcode / SKU / Name)</label>
              <input
                className="input-field"
                placeholder="Scan barcode or search textile..."
                value={prodQuery}
                onChange={(e) => setProdQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const exact = products.find((p) => p.barcode === prodQuery.trim() || p.product_code.toLowerCase() === prodQuery.trim().toLowerCase());
                    if (exact) {
                      addToCart(exact);
                      setProdQuery("");
                    } else if (filteredLookupProducts[0]) {
                      addToCart(filteredLookupProducts[0]);
                    }
                  }
                }}
              />
              <div className="max-h-[26dvh] min-h-[112px] overflow-y-auto divide-y bg-white rounded-lg border">
                {filteredLookupProducts.slice(0, 20).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addToCart(p)}
                    className="w-full text-left px-2.5 py-1.5 hover:bg-navy-50 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-navy-900 truncate">{p.name}</p>
                      <p className="text-[11px] text-slate-500">
                        {p.product_code} • Stock: {formatQty(p.current_stock)} {p.unit}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-bold text-emerald-700 block">
                        {formatINR(saleType === "WHOLESALE" ? p.wholesale_price : p.retail_price)}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {saleType === "WHOLESALE" ? `Retail: ${formatINR(p.retail_price)}` : `Wholesale: ${formatINR(p.wholesale_price)}`}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="lg:col-span-7 border rounded-xl p-2.5 space-y-2">
              <p className="label-text">Invoice Cart ({cart.length} item(s))</p>
              <div className="max-h-[18dvh] min-h-[56px] overflow-y-auto space-y-1.5">
                {cart.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">Click products on the left to add them to the bill.</p>
                ) : (
                  cart.map((line, idx) => {
                    const avail = Number(line.product.current_stock);
                    const exceedsStock = !allowNegativeStock && line.quantity > avail;
                    return (
                    <div key={line.product.id} className={`grid grid-cols-12 gap-2 items-center p-2 rounded-lg text-xs ${exceedsStock ? "bg-rose-50 border border-rose-200" : "bg-slate-50"}`}>
                      <div className="col-span-4">
                        <p className="font-semibold text-navy-900 truncate">{line.product.name}</p>
                        <p className={`text-[10px] ${exceedsStock ? "text-rose-600 font-semibold" : "text-slate-500"}`}>
                          Avail: {formatQty(avail)} {exceedsStock ? `• Max ${formatQty(avail)}` : ""}
                        </p>
                      </div>
                      <NumberInput
                        className={`input-field col-span-2 py-1 text-xs ${exceedsStock ? "border-rose-500 text-rose-700 focus:border-rose-600 focus:ring-rose-100" : ""}`}
                        value={line.quantity}
                        onValueChange={(val) => updateCartQuantity(idx, val)}
                      />
                      <NumberInput
                        className="input-field col-span-3 py-1 text-xs"
                        value={line.unit_price}
                        onValueChange={(val) => setCart((prev) => prev.map((c, i) => (i === idx ? { ...c, unit_price: val } : c)))}
                      />
                      <div className="col-span-2 text-right font-semibold">
                        {formatINR((line.quantity * line.unit_price - line.discount_amount) * (1 + line.gst_rate / 100))}
                      </div>
                      <button type="button" onClick={() => { setModalError(null); setCart((prev) => prev.filter((_, i) => i !== idx)); }} className="col-span-1 text-rose-600 flex justify-center">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    );
                  })
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t">
                <div>
                  <label className="label-text">Bill Discount (₹)</label>
                  <NumberInput className="input-field" value={invoiceDiscount} onValueChange={setInvoiceDiscount} />
                </div>
                <div>
                  <label className="label-text">Paid Amount (₹)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="input-field"
                    placeholder={paymentMode === "CREDIT" ? "0 (Credit)" : saleType === "RETAIL" && !customerId ? String(grandTotal) : "0 (Credit)"}
                    value={paidAmount}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^\d.]/g, "").replace(/^0+(?=\d)/, "");
                      setPaidAmount(raw);
                    }}
                  />
                </div>
                <div>
                  <label className="label-text">Payment Mode</label>
                  <select className="input-field" value={paymentMode} onChange={(e) => handlePaymentModeChange(e.target.value)}>
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="CARD">Card</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="CREDIT">Credit</option>
                  </select>
                </div>
                <div>
                  <label className="label-text">Deposit Account</label>
                  <select
                    className="input-field"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    disabled={paymentMode === "CREDIT" && Number(paidAmount || 0) === 0}
                  >
                    <option value="">{paymentMode === "CREDIT" && Number(paidAmount || 0) === 0 ? "N/A (Credit)" : "Auto Default"}</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
                  <input type="checkbox" checked={isInterstate} onChange={(e) => setIsInterstate(e.target.checked)} className="rounded" />
                  Interstate Supply (IGST instead of CGST + SGST)
                </label>
                <div className="text-right">
                  <p className="text-xs text-slate-500">
                    Taxable: {formatINR(cartTotals.subtotal)} • GST: {formatINR(cartTotals.gst)}
                  </p>
                  <p className="text-base sm:text-lg font-extrabold text-navy-900">Grand Total: {formatINR(grandTotal)}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-0.5">
            <button type="button" onClick={() => setBillOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Confirm Sale</button>
          </div>
        </form>
      </Modal>

      {/* Invoice PDF Preview & Print Modal */}
      <Modal
        open={Boolean(previewSale)}
        onClose={closeInvoicePreview}
        title={`Invoice Preview — ${previewSale?.invoice_number || ""}`}
        maxWidthClass="max-w-5xl"
        headerClassName="px-4 py-2.5 sm:px-5 sm:py-2.5"
        bodyClassName="p-3 sm:px-5 sm:py-3 space-y-3"
      >
        {previewLoading ? (
          <div className="h-[60dvh] flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-500">
            Generating PDF invoice preview...
          </div>
        ) : previewPdfUrl ? (
          <iframe
            ref={pdfFrameRef}
            src={`${previewPdfUrl}#toolbar=1`}
            title={`Invoice ${previewSale?.invoice_number || ""}`}
            className="w-full h-[64dvh] min-h-[320px] rounded-lg border border-slate-200 bg-slate-100"
          />
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="text-xs">
            {highlightPrint && (
              <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 font-medium text-emerald-700">
                Sale confirmed — verify invoice above and click Print
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <button type="button" onClick={closeInvoicePreview} className="btn-secondary">
              Close
            </button>
            {previewPdfUrl && previewSale && (
              <>
                <button
                  type="button"
                  onClick={() => triggerBlobDownload(previewPdfUrl, `${previewSale.invoice_number}.pdf`)}
                  className="btn-secondary"
                >
                  <Download className="h-4 w-4" /> Download PDF
                </button>
                <button
                  ref={printBtnRef}
                  type="button"
                  onClick={handlePrintPreview}
                  className={
                    highlightPrint
                      ? "btn-gold ring-4 ring-gold-300 shadow-lg font-bold"
                      : "btn-gold"
                  }
                >
                  <Printer className="h-4 w-4" /> Print Invoice
                </button>
              </>
            )}
          </div>
        </div>
      </Modal>

      {/* Sales Return Modal */}
      <Modal open={retOpen} onClose={() => setRetOpen(false)} title={`Sales Return — ${retSale?.invoice_number || ""}`} maxWidthClass="max-w-lg">
        <form onSubmit={handleSaleReturn} className="space-y-4">
          <div className="space-y-2">
            {retSale?.items.map((it) => {
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
            <input className="input-field" value={retReason} onChange={(e) => setRetReason(e.target.value)} />
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
            <input type="checkbox" checked={refundCash} onChange={(e) => setRefundCash(e.target.checked)} className="rounded" />
            Issue Cash Refund Immediately (uncheck to adjust customer credit/pending balance)
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setRetOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Confirm Return & Restore Stock</button>
          </div>
        </form>
      </Modal>

      <CollectInvoicePaymentModal
        target={payTarget}
        accounts={accounts}
        onClose={() => setPayTarget(null)}
        onSuccess={async () => {
          await loadData();
        }}
      />
    </div>
  );
};

