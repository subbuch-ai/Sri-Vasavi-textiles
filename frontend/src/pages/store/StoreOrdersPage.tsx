import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  FileDown,
  Package,
  Truck,
  XCircle,
} from "lucide-react";
import { Modal } from "../../components/common/Modal";
import { useStoreAuth } from "../../context/StoreAuthContext";
import { extractErrorMessage } from "../../services/api";
import { downloadStoreFile, storeApi } from "../../services/storeApi";
import { StoreOrder } from "../../types/storefront";
import { formatDateTime, formatINR } from "../../utils/formatters";

const TRACK_STEPS = [
  { key: "ORDER_PLACED", label: "Order Placed" },
  { key: "CONFIRMED", label: "Confirmed" },
  { key: "PROCESSING", label: "Processing" },
  { key: "READY_FOR_DISPATCH", label: "Ready to Ship" },
  { key: "SHIPPED", label: "Shipped" },
  { key: "DELIVERED", label: "Delivered" },
];

function stepIndex(status: string): number {
  const norm = status === "PENDING" ? "ORDER_PLACED" : status === "READY_FOR_DELIVERY" ? "READY_FOR_DISPATCH" : status === "DISPATCHED" ? "SHIPPED" : status;
  return TRACK_STEPS.findIndex((s) => s.key === norm);
}

const CANCELLABLE = new Set(["ORDER_PLACED", "PENDING", "CONFIRMED", "PROCESSING"]);

export const StoreOrdersPage: React.FC = () => {
  const { customer, refreshNotifications } = useStoreAuth();
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [typeFilter, setTypeFilter] = useState<"" | "RETAIL" | "WHOLESALE">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cancelTarget, setCancelTarget] = useState<StoreOrder | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const loadOrders = useCallback(async () => {
    if (!customer) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const qs = typeFilter ? `?order_type=${typeFilter}` : "";
      const res = await storeApi.get<StoreOrder[]>(`/orders${qs}`);
      setOrders(res.data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [customer, typeFilter]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  if (!customer) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-4">
        <Package className="h-12 w-12 mx-auto text-amber-500" />
        <h1 className="text-2xl font-extrabold text-navy-900">Sign In to Track Your Orders</h1>
        <Link to="/shop/login" className="inline-block px-6 py-2.5 rounded-xl bg-navy-900 text-white text-xs font-bold">
          Login to Account
        </Link>
      </div>
    );
  }

  const handleCancelOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelTarget) return;
    setCancelling(true);
    setError(null);
    try {
      await storeApi.post(`/orders/${cancelTarget.id}/cancel`, { reason: cancelReason });
      setCancelTarget(null);
      setCancelReason("");
      await Promise.all([loadOrders(), refreshNotifications()]);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-900">My Orders & Delivery Tracking</h1>
          <p className="text-xs text-slate-500">Live fulfillment updates synced directly with Sri Vasavi Textiles ERP</p>
        </div>
        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs font-semibold">
          {(["", "RETAIL", "WHOLESALE"] as const).map((t) => (
            <button
              key={t || "ALL"}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded-lg transition ${
                typeFilter === t ? "bg-navy-900 text-amber-300" : "text-slate-600 hover:text-navy-900"
              }`}
            >
              {t || "All Orders"}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">{error}</div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-500">Loading your orders...</div>
      ) : orders.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 p-12 text-center space-y-3">
          <p className="font-bold text-navy-900">You have not placed any orders yet</p>
          <Link to="/shop/catalog" className="inline-block px-5 py-2.5 rounded-xl bg-navy-900 text-white text-xs font-bold">
            Start Shopping
          </Link>
        </div>
      ) : (
        <div className="space-y-5">
          {orders.map((order) => {
            const curIdx = stepIndex(order.order_status);
            const isCancelled = order.order_status === "CANCELLED";
            const canCancel = !isCancelled && !order.converted_sale_id && CANCELLABLE.has(order.order_status);

            return (
              <div key={order.id} className="rounded-3xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <div>
                      <p className="text-slate-500">Order No.</p>
                      <p className="font-extrabold text-sm text-navy-900">{order.order_number}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Placed</p>
                      <p className="font-semibold text-navy-900">{formatDateTime(order.created_at)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Total</p>
                      <p className="font-extrabold text-navy-900">{formatINR(order.total_amount)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Payment ({order.payment_method})</p>
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          order.payment_status === "PAID"
                            ? "bg-emerald-100 text-emerald-800"
                            : order.payment_status === "REFUNDED"
                            ? "bg-purple-100 text-purple-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {order.payment_status}
                      </span>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-navy-900 text-amber-300 text-[10px] font-bold">
                      {order.order_type}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {order.converted_sale_id && (
                      <button
                        type="button"
                        onClick={() => downloadStoreFile(`/orders/${order.id}/invoice/pdf`, `${order.order_number}.pdf`)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-navy-900 text-white text-xs font-bold hover:bg-navy-800"
                      >
                        <FileDown className="h-3.5 w-3.5 text-amber-400" /> Invoice PDF
                      </button>
                    )}
                    {canCancel && (
                      <button
                        type="button"
                        onClick={() => {
                          setCancelTarget(order);
                          setCancelReason("");
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-rose-300 text-rose-700 text-xs font-bold hover:bg-rose-50"
                      >
                        <XCircle className="h-3.5 w-3.5" /> Cancel Order
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-6 space-y-5">
                  {/* Status Tracker */}
                  {isCancelled ? (
                    <div className="rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 text-xs text-rose-800 flex items-center gap-2">
                      <XCircle className="h-4 w-4 shrink-0" />
                      <span>
                        <strong>Order Cancelled</strong>
                        {order.cancellation_reason ? ` — Reason: ${order.cancellation_reason}` : ""}
                      </span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                      {TRACK_STEPS.map((st, idx) => {
                        const done = curIdx >= idx;
                        return (
                          <div
                            key={st.key}
                            className={`p-2.5 rounded-xl border text-center text-[11px] font-semibold flex flex-col items-center gap-1 ${
                              done
                                ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                                : "bg-slate-50 border-slate-200 text-slate-400"
                            }`}
                          >
                            {done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Clock className="h-4 w-4" />}
                            <span>{st.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Line Items & Shipping */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-5 text-xs">
                    <div className="md:col-span-7 space-y-2">
                      <p className="font-bold uppercase tracking-wider text-slate-500 text-[11px]">Items Ordered</p>
                      <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl px-4">
                        {order.items.map((it) => (
                          <div key={it.id} className="py-2.5 flex justify-between gap-3">
                            <div>
                              <p className="font-bold text-navy-900">{it.product_name || `Product #${it.product_id}`}</p>
                              <p className="text-slate-500">
                                Qty: {Number(it.quantity)} × {formatINR(it.unit_price)} (+{Number(it.gst_rate)}% GST)
                              </p>
                            </div>
                            <span className="font-bold text-navy-900">{formatINR(it.total_amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="md:col-span-5 space-y-3">
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                        <p className="font-bold uppercase tracking-wider text-slate-500 text-[11px]">Delivery Address</p>
                        <p className="font-bold text-navy-900">
                          {order.shipping_name} • {order.shipping_mobile}
                        </p>
                        <p className="text-slate-600">
                          {order.shipping_address}, {order.shipping_city}, {order.shipping_state} - {order.shipping_pincode}
                        </p>
                      </div>

                      {order.delivery_detail && (order.delivery_detail.courier_name || order.delivery_detail.tracking_number) && (
                        <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-1">
                          <p className="font-bold text-navy-900 flex items-center gap-1.5">
                            <Truck className="h-4 w-4 text-amber-600" /> Courier Tracking
                          </p>
                          <p>
                            <strong>{order.delivery_detail.courier_name}</strong>{" "}
                            {order.delivery_detail.tracking_number ? `• AWB: ${order.delivery_detail.tracking_number}` : ""}
                          </p>
                          {order.delivery_detail.tracking_url && (
                            <a
                              href={order.delivery_detail.tracking_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-navy-900 font-bold underline"
                            >
                              Track Shipment <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title={`Cancel Order ${cancelTarget?.order_number || ""}`}
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleCancelOrder} className="space-y-4">
          <p className="text-xs text-slate-600">
            Reserved stock will be released immediately. Any verified online payment will be refunded in accounting records.
          </p>
          <div>
            <label className="block text-xs font-semibold text-navy-900 mb-1">Cancellation Reason *</label>
            <textarea
              required
              minLength={3}
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Changed size / ordered by mistake"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCancelTarget(null)} className="px-4 py-2 rounded-xl border text-xs font-semibold">
              Keep Order
            </button>
            <button type="submit" disabled={cancelling} className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold">
              {cancelling ? "Cancelling..." : "Confirm Cancellation"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

