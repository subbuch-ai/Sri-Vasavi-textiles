import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Minus, Plus, ShoppingBag, Tag, Trash2 } from "lucide-react";
import { useStoreAuth } from "../../context/StoreAuthContext";
import { extractErrorMessage } from "../../services/api";
import { storeApi } from "../../services/storeApi";
import { formatINR } from "../../utils/formatters";

export const StoreCartPage: React.FC = () => {
  const { customer, cart, refreshCart } = useStoreAuth();
  const navigate = useNavigate();

  const [promoCode, setPromoCode] = useState(cart?.promo_code || "");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!customer) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-4">
        <ShoppingBag className="h-12 w-12 mx-auto text-amber-500" />
        <h1 className="text-2xl font-extrabold text-navy-900">Sign In to View Your Cart</h1>
        <p className="text-xs text-slate-500">
          Your shopping cart syncs with live Sri Vasavi Textiles warehouse stock and wholesale tier rates.
        </p>
        <div className="flex justify-center gap-3">
          <Link to="/login" className="px-6 py-2.5 rounded-xl bg-navy-900 text-white text-xs font-bold">
            Login
          </Link>
          <Link to="/register" className="px-6 py-2.5 rounded-xl bg-amber-500 text-navy-950 text-xs font-bold">
            Register
          </Link>
        </div>
      </div>
    );
  }

  const updateQty = async (itemId: number, newQty: number) => {
    setError(null);
    setBusyId(itemId);
    try {
      await storeApi.patch(`/cart/items/${itemId}`, { quantity: newQty });
      await refreshCart();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const removeItem = async (itemId: number) => {
    setError(null);
    setBusyId(itemId);
    try {
      await storeApi.delete(`/cart/items/${itemId}`);
      await refreshCart();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const applyPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await storeApi.post("/cart/promo", { promo_code: promoCode.trim() || null });
      await refreshCart();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const items = cart?.items || [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="border-b border-slate-200 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-900">Your Shopping Cart</h1>
          <p className="text-xs text-slate-500">
            Live inventory validation enabled • GST & delivery charges calculated automatically
          </p>
        </div>
        <Link to="/catalog" className="text-xs font-bold text-navy-900 hover:text-amber-700 underline">
          Continue Shopping
        </Link>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">{error}</div>
      )}

      {items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 p-14 text-center space-y-4">
          <ShoppingBag className="h-10 w-10 mx-auto text-slate-400" />
          <p className="text-base font-bold text-navy-900">Your shopping cart is empty</p>
          <Link
            to="/catalog"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-navy-900 text-white text-xs font-bold"
          >
            Browse Textiles <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 space-y-3">
            {items.map((item) => {
              const qtyNum = Number(item.quantity);
              const stockNum = Number(item.available_stock);
              return (
                <div
                  key={item.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
                >
                  <div className="flex items-center gap-4">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.product_name} className="h-20 w-20 rounded-xl object-cover border" />
                    ) : (
                      <div className="h-20 w-20 rounded-xl bg-navy-50 text-navy-800 flex items-center justify-center text-sm font-bold shrink-0">
                        {item.product_name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="space-y-1">
                      <Link
                        to={`/product/${item.product_id}`}
                        className="font-bold text-sm text-navy-900 hover:text-amber-700"
                      >
                        {item.product_name}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {item.category_name} • SKU {item.product_code}
                      </p>
                      <div className="flex flex-wrap gap-1.5 text-[11px]">
                        {item.selected_size && (
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700">Size: {item.selected_size}</span>
                        )}
                        {item.selected_color && (
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700">Colour: {item.selected_color}</span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded font-bold ${
                            item.pricing_tier === "WHOLESALE"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-navy-50 text-navy-800"
                          }`}
                        >
                          {item.pricing_tier} RATE
                        </span>
                      </div>
                      <p className="text-xs text-slate-600">
                        {formatINR(item.unit_price)} / {item.unit} + {Number(item.gst_rate)}% GST • Stock left: {stockNum}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4">
                    <div className="inline-flex items-center rounded-xl border border-slate-300">
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => (qtyNum <= 1 ? removeItem(item.id) : updateQty(item.id, qtyNum - 1))}
                        className="p-2 hover:bg-slate-100 rounded-l-xl"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="px-3 text-xs font-bold">{qtyNum}</span>
                      <button
                        type="button"
                        disabled={busyId === item.id || qtyNum >= stockNum}
                        onClick={() => updateQty(item.id, qtyNum + 1)}
                        className="p-2 hover:bg-slate-100 rounded-r-xl disabled:opacity-40"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="text-right min-w-[90px]">
                      <p className="font-extrabold text-sm text-navy-900">{formatINR(item.line_total)}</p>
                      <p className="text-[11px] text-slate-500">incl. GST {formatINR(item.line_gst)}</p>
                    </div>

                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => removeItem(item.id)}
                      className="p-2 rounded-lg text-rose-500 hover:bg-rose-50"
                      title="Remove item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary Sidebar */}
          <div className="lg:col-span-4 rounded-3xl border border-slate-200 bg-white p-6 space-y-5 shadow-sm">
            <h2 className="text-base font-extrabold text-navy-900">Order Summary</h2>

            <form onSubmit={applyPromo} className="space-y-2">
              <label className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                <Tag className="h-3.5 w-3.5 text-amber-600" /> Promo / Coupon Code
              </label>
              <div className="flex gap-2">
                <input
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                  placeholder="Enter code (e.g. FESTIVE10)"
                  className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold uppercase"
                />
                <button type="submit" className="px-3.5 py-2 rounded-xl bg-navy-900 text-white text-xs font-bold">
                  Apply
                </button>
              </div>
              {cart?.promo_message && (
                <p className="text-[11px] text-emerald-700 font-medium">{cart.promo_message}</p>
              )}
            </form>

            <div className="space-y-2.5 text-xs border-t border-slate-100 pt-4">
              <div className="flex justify-between">
                <span className="text-slate-600">Subtotal ({items.length} line items)</span>
                <span className="font-semibold text-navy-900">{formatINR(cart?.subtotal || 0)}</span>
              </div>
              {Number(cart?.discount_amount || 0) > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Promo Discount ({cart?.promo_code})</span>
                  <span className="font-bold">- {formatINR(cart?.discount_amount || 0)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-600">Applicable GST</span>
                <span className="font-semibold text-navy-900">{formatINR(cart?.gst_amount || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Delivery Charge</span>
                <span className="font-semibold text-navy-900">
                  {Number(cart?.delivery_charge || 0) === 0 ? (
                    <span className="text-emerald-700 font-bold">FREE</span>
                  ) : (
                    formatINR(cart?.delivery_charge || 0)
                  )}
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-3 text-base font-extrabold text-navy-900">
                <span>Total Payable</span>
                <span>{formatINR(cart?.total_amount || 0)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate("/checkout")}
              className="w-full py-3.5 rounded-xl bg-amber-500 text-navy-950 font-extrabold text-sm hover:bg-amber-400 shadow flex items-center justify-center gap-2"
            >
              Proceed to Checkout <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

