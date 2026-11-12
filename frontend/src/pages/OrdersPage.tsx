import React, { useCallback, useEffect, useState } from "react";
import { ArrowRightCircle, Plus, Search, Trash2 } from "lucide-react";
import { EmptyState } from "../components/common/EmptyState";
import { Modal } from "../components/common/Modal";
import { NumberInput } from "../components/common/NumberInput";
import { StatusBadge } from "../components/common/StatusBadge";
import { usePermission } from "../hooks/usePermission";
import { api, extractErrorMessage } from "../services/api";
import { Customer, CustomerOrder, PaginatedResponse, Product } from "../types/erp";
import { formatDate, formatINR, todayISO } from "../utils/formatters";

const ORDER_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "READY_FOR_DELIVERY",
  "DISPATCHED",
  "DELIVERED",
  "CANCELLED",
];

interface OrderLineDraft {
  product_id: number;
  quantity: number;
  unit_price: number;
  gst_rate: number;
}

export const OrdersPage: React.FC = () => {
  const { hasPermission } = usePermission();
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [customerId, setCustomerId] = useState<number>(0);
  const [orderType, setOrderType] = useState<"WHOLESALE" | "RETAIL">("WHOLESALE");
  const [orderDate, setOrderDate] = useState(todayISO());
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [advanceAmount, setAdvanceAmount] = useState(0);
  const [paymentMode, setPaymentMode] = useState("UPI");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<OrderLineDraft[]>([]);

  const loadData = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page_size: "50" });
      if (statusFilter) params.set("order_status", statusFilter);
      if (search.trim()) params.set("search", search.trim());
      const [oRes, cRes, pRes] = await Promise.all([
        api.get<PaginatedResponse<CustomerOrder>>(`/orders?${params.toString()}`),
        api.get<PaginatedResponse<Customer>>("/customers?page_size=200"),
        api.get<PaginatedResponse<Product>>("/products?page_size=200"),
      ]);
      setOrders(oRes.data.items);
      setCustomers(cRes.data.items);
      setProducts(pRes.data.items);
      if (cRes.data.items.length > 0) setCustomerId((prev) => prev || cRes.data.items[0].id);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, [statusFilter, search]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const applyOrderTier = (mode: "WHOLESALE" | "RETAIL", currentLines: OrderLineDraft[]) => {
    setOrderType(mode);
    setLines(
      currentLines.map((l) => {
        const p = products.find((x) => x.id === l.product_id);
        if (!p) return l;
        return {
          ...l,
          unit_price: Number(mode === "WHOLESALE" ? p.wholesale_price : p.retail_price),
        };
      })
    );
  };

  const openCreateModal = () => {
    const selectedCust = customers.find((c) => c.id === customerId) || customers[0];
    const mode: "WHOLESALE" | "RETAIL" = selectedCust?.customer_type === "RETAIL" ? "RETAIL" : "WHOLESALE";
    setOrderType(mode);
    setAdvanceAmount(0);
    setNotes("");
    setLines(
      products[0]
        ? [
            {
              product_id: products[0].id,
              quantity: mode === "WHOLESALE" ? 5 : 1,
              unit_price: Number(mode === "WHOLESALE" ? products[0].wholesale_price : products[0].retail_price),
              gst_rate: Number(products[0].gst_rate),
            },
          ]
        : []
    );
    setCreateOpen(true);
  };

  const handleOrderCustomerChange = (newCustId: number) => {
    setCustomerId(newCustId);
    const cust = customers.find((c) => c.id === newCustId);
    if (cust) {
      const mode: "WHOLESALE" | "RETAIL" = cust.customer_type === "WHOLESALE" ? "WHOLESALE" : "RETAIL";
      applyOrderTier(mode, lines);
    }
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/orders", {
        customer_id: Number(customerId),
        order_date: orderDate,
        expected_delivery_date: expectedDelivery || null,
        order_type: orderType,
        advance_amount: Number(advanceAmount),
        payment_mode: paymentMode,
        notes: notes || null,
        items: lines,
      });
      setCreateOpen(false);
      await loadData();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const handleStatusChange = async (orderId: number, newStatus: string) => {
    setError(null);
    try {
      await api.patch(`/orders/${orderId}`, { order_status: newStatus });
      await loadData();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const handleConvertToSale = async (order: CustomerOrder) => {
    if (!window.confirm(`Convert Order ${order.order_number} into a finalized Sales Invoice and deduct stock?`)) return;
    setError(null);
    try {
      await api.post(`/orders/${order.id}/convert-to-sale`, {
        sale_date: todayISO(),
        additional_paid_amount: 0,
        payment_mode: "CASH",
      });
      await loadData();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const estimatedTotal = lines.reduce(
    (sum, l) => sum + l.quantity * l.unit_price * (1 + l.gst_rate / 100),
    0
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-navy-900">Customer Orders Management</h2>
          <p className="text-xs text-slate-500">Track wholesale & retail orders, advance payments, fulfillment status, and invoice conversion</p>
        </div>
        {hasPermission("orders:create") && (
          <button onClick={openCreateModal} className="btn-primary">
            <Plus className="h-4 w-4" /> Create Order
          </button>
        )}
      </div>

      {error && <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">{error}</div>}

      <div className="card p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by Order ID (e.g. SVT-ORD-)..." className="input-field pl-9" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-field w-auto">
          <option value="">All Statuses</option>
          {ORDER_STATUSES.map((st) => <option key={st} value={st}>{st.replace(/_/g, " ")}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Order ID</th>
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-left">Dates</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Advance / Bal</th>
                <th className="px-4 py-3 text-center">Order Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.length === 0 ? (
                <tr><td colSpan={7}><EmptyState title="No customer orders found" /></td></tr>
              ) : (
                orders.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-xs text-navy-900">{o.order_number}</p>
                      <StatusBadge status={o.order_type} />
                    </td>
                    <td className="px-4 py-3 text-xs font-medium">{o.customer_name}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      <p>Ord: {formatDate(o.order_date)}</p>
                      <p>Due: {formatDate(o.expected_delivery_date)}</p>
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-bold">{formatINR(o.total_amount)}</td>
                    <td className="px-4 py-3 text-right text-xs">
                      <p className="text-emerald-700">Adv: {formatINR(o.advance_amount)}</p>
                      <p className="text-amber-700">Rem: {formatINR(o.remaining_amount)}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {hasPermission("orders:edit") && !o.converted_sale_id ? (
                        <select
                          value={o.order_status}
                          onChange={(e) => handleStatusChange(o.id, e.target.value)}
                          className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold bg-white"
                        >
                          {ORDER_STATUSES.map((st) => <option key={st} value={st}>{st.replace(/_/g, " ")}</option>)}
                        </select>
                      ) : (
                        <StatusBadge status={o.order_status} />
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {o.converted_sale_id ? (
                        <span className="text-xs font-semibold text-emerald-700">Invoiced (#{o.converted_sale_id})</span>
                      ) : (
                        hasPermission("orders:convert") && o.order_status !== "CANCELLED" && (
                          <button
                            onClick={() => handleConvertToSale(o)}
                            className="inline-flex items-center gap-1 rounded bg-navy-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-navy-800"
                          >
                            <ArrowRightCircle className="h-3.5 w-3.5" /> Convert to Sale
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Customer Order" maxWidthClass="max-w-3xl lg:max-w-4xl">
        <form onSubmit={handleCreateOrder} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className="label-text">Customer *</label>
              <select className="input-field" value={customerId} onChange={(e) => handleOrderCustomerChange(Number(e.target.value))}>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.customer_type})</option>)}
              </select>
            </div>
            <div>
              <label className="label-text">Order Type</label>
              <select className="input-field" value={orderType} onChange={(e) => applyOrderTier(e.target.value as "WHOLESALE" | "RETAIL", lines)}>
                <option value="WHOLESALE">Wholesale</option>
                <option value="RETAIL">Retail</option>
              </select>
            </div>
            <div>
              <label className="label-text">Order Date</label>
              <input type="date" className="input-field" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} required />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="label-text">Order Items</span>
              <button
                type="button"
                onClick={() => {
                  const p = products[0];
                  if (!p) return;
                  setLines((prev) => [
                    ...prev,
                    { product_id: p.id, quantity: 1, unit_price: Number(orderType === "WHOLESALE" ? p.wholesale_price : p.retail_price), gst_rate: Number(p.gst_rate) },
                  ]);
                }}
                className="text-xs font-semibold text-navy-700 hover:underline"
              >
                + Add Product
              </button>
            </div>
            <div className="max-h-36 sm:max-h-44 overflow-y-auto space-y-2 pr-1">
            {lines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-2 rounded-lg">
                <select
                  className="input-field col-span-5"
                  value={line.product_id}
                  onChange={(e) => {
                    const p = products.find((x) => x.id === Number(e.target.value));
                    setLines((prev) => prev.map((r, i) => (i === idx && p ? { ...r, product_id: p.id, unit_price: Number(orderType === "WHOLESALE" ? p.wholesale_price : p.retail_price), gst_rate: Number(p.gst_rate) } : r)));
                  }}
                >
                  {products.map((p) => <option key={p.id} value={p.id}>{p.product_code} — {p.name}</option>)}
                </select>
                <NumberInput className="input-field col-span-2" value={line.quantity} onValueChange={(val) => setLines((prev) => prev.map((r, i) => (i === idx ? { ...r, quantity: val } : r)))} />
                <NumberInput className="input-field col-span-2" value={line.unit_price} onValueChange={(val) => setLines((prev) => prev.map((r, i) => (i === idx ? { ...r, unit_price: val } : r)))} />
                <NumberInput className="input-field col-span-2" value={line.gst_rate} onValueChange={(val) => setLines((prev) => prev.map((r, i) => (i === idx ? { ...r, gst_rate: val } : r)))} />
                <button type="button" onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))} className="col-span-1 text-rose-600 flex justify-center">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label-text">Expected Delivery Date</label>
              <input type="date" className="input-field" value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} />
            </div>
            <div>
              <label className="label-text">Advance Received (₹)</label>
              <NumberInput className="input-field" value={advanceAmount} onValueChange={setAdvanceAmount} />
            </div>
            <div>
              <label className="label-text">Advance Payment Mode</label>
              <select className="input-field" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
                <option value="UPI">UPI</option>
                <option value="CASH">Cash</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-sm font-bold text-navy-900">Order Total: {formatINR(estimatedTotal)}</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setCreateOpen(false)} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary">Create Order</button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
};

