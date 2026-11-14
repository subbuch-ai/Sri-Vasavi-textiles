import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Banknote, CheckCircle2, CreditCard, ExternalLink, Landmark, Lock, QrCode, ShieldCheck, Smartphone } from "lucide-react";
import { useStoreAuth } from "../../context/StoreAuthContext";
import { extractErrorMessage } from "../../services/api";
import { storeApi } from "../../services/storeApi";
import { StoreCheckoutResponse, StoreOrder } from "../../types/storefront";
import { formatINR } from "../../utils/formatters";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export const StoreCheckoutPage: React.FC = () => {
  const { customer, config, cart, refreshCart, refreshNotifications } = useStoreAuth();
  const navigate = useNavigate();

  const [selectedAddressId, setSelectedAddressId] = useState<number | "">("");
  const [recipientName, setRecipientName] = useState("");
  const [mobile, setMobile] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateVal, setStateVal] = useState("Tamil Nadu");
  const [pincode, setPincode] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"COD" | "UPI" | "RAZORPAY" | "BANK_TRANSFER">("COD");
  const [notes, setNotes] = useState("");

  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [placedOrder, setPlacedOrder] = useState<StoreOrder | null>(null);
  const [manualRef, setManualRef] = useState("");
  const [submittingRef, setSubmittingRef] = useState(false);

  useEffect(() => {
    if (customer) {
      const def = customer.addresses.find((a) => a.is_default) || customer.addresses[0];
      if (def) {
        setSelectedAddressId(def.id);
        setRecipientName(def.recipient_name);
        setMobile(def.mobile);
        setAddress(def.address_line1);
        setCity(def.city);
        setStateVal(def.state);
        setPincode(def.pincode);
      } else {
        setRecipientName(customer.name);
        setMobile(customer.mobile);
        setAddress(customer.address || "");
        setCity(customer.city || "");
        setStateVal(customer.state || "Tamil Nadu");
      }
    }
  }, [customer]);

  if (!customer) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-3">
        <p className="text-sm font-bold text-navy-900">Please sign in to complete checkout.</p>
        <Link to="/login" className="inline-block px-5 py-2.5 rounded-xl bg-navy-900 text-white text-xs font-bold">
          Login
        </Link>
      </div>
    );
  }

  const handleSelectSavedAddress = (addrId: string) => {
    setSelectedAddressId(addrId ? Number(addrId) : "");
    const found = customer.addresses.find((a) => a.id === Number(addrId));
    if (found) {
      setRecipientName(found.recipient_name);
      setMobile(found.mobile);
      setAddress(found.address_line1);
      setCity(found.city);
      setStateVal(found.state);
      setPincode(found.pincode);
    }
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPlacing(true);
    try {
      const res = await storeApi.post<StoreCheckoutResponse>("/checkout", {
        address_id: selectedAddressId || null,
        recipient_name: recipientName,
        mobile,
        address,
        city,
        state: stateVal,
        pincode,
        payment_method: paymentMethod,
        promo_code: cart?.promo_code || null,
        notes: notes || null,
      });
      const checkout = res.data;
      await Promise.all([refreshCart(), refreshNotifications()]);

      if (paymentMethod === "RAZORPAY" && checkout.razorpay_order_id && checkout.razorpay_key_id) {
        if (!checkout.razorpay_key_id.startsWith("rzp_test_local")) {
          const loaded = await loadRazorpayScript();
          if (loaded && window.Razorpay) {
            const rzp = new window.Razorpay({
              key: checkout.razorpay_key_id,
              amount: checkout.amount_paise,
              currency: "INR",
              name: config?.business_name || "Sri Vasavi Textiles",
              description: `Order ${checkout.order.order_number}`,
              order_id: checkout.razorpay_order_id,
              prefill: {
                name: customer.name,
                email: customer.email,
                contact: customer.mobile,
              },
              handler: async (resp: {
                razorpay_order_id: string;
                razorpay_payment_id: string;
                razorpay_signature: string;
              }) => {
                try {
                  const verified = await storeApi.post<StoreOrder>("/payments/razorpay/verify", {
                    order_id: checkout.order.id,
                    razorpay_order_id: resp.razorpay_order_id,
                    razorpay_payment_id: resp.razorpay_payment_id,
                    razorpay_signature: resp.razorpay_signature,
                  });
                  setPlacedOrder(verified.data);
                } catch (verErr) {
                  setError(extractErrorMessage(verErr));
                  setPlacedOrder(checkout.order);
                }
              },
            });
            rzp.open();
            setPlacedOrder(checkout.order);
            return;
          }
        }
      }

      setPlacedOrder(checkout.order);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setPlacing(false);
    }
  };

  const handleManualReferenceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!placedOrder) return;
    setError(null);
    setSubmittingRef(true);
    try {
      const res = await storeApi.post<StoreOrder>("/payments/manual/submit-ref", {
        order_id: placedOrder.id,
        transaction_reference: manualRef,
      });
      setPlacedOrder(res.data);
      await refreshNotifications();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmittingRef(false);
    }
  };

  if (placedOrder) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="rounded-3xl border border-emerald-200 bg-white p-8 shadow-lg space-y-5">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Order Recorded in ERP</p>
              <h1 className="text-2xl font-extrabold text-navy-900">
                Order {placedOrder.order_number} Placed!
              </h1>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <div>
              <p className="text-slate-500">Order Total</p>
              <p className="font-extrabold text-navy-900 text-sm">{formatINR(placedOrder.total_amount)}</p>
            </div>
            <div>
              <p className="text-slate-500">Order Status</p>
              <p className="font-bold text-navy-900">{placedOrder.order_status.replace(/_/g, " ")}</p>
            </div>
            <div>
              <p className="text-slate-500">Payment Method</p>
              <p className="font-bold text-navy-900">{placedOrder.payment_method}</p>
            </div>
            <div>
              <p className="text-slate-500">Payment Status</p>
              <p className={`font-bold ${placedOrder.payment_status === "PAID" ? "text-emerald-700" : "text-amber-700"}`}>
                {placedOrder.payment_status}
              </p>
            </div>
          </div>

          {(placedOrder.payment_method === "UPI" || placedOrder.payment_method === "BANK_TRANSFER") &&
            placedOrder.payment_status !== "PAID" && (
              <form onSubmit={handleManualReferenceSubmit} className="rounded-2xl bg-amber-50 border border-amber-200 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-extrabold text-navy-900">
                    Complete Your {placedOrder.payment_method.replace("_", " ")} Payment
                  </p>
                  <span className="text-xs font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                    Awaiting Payment
                  </span>
                </div>

                {placedOrder.payment_method === "UPI" && config?.upi_id && (() => {
                  const upiUri = `upi://pay?pa=${encodeURIComponent(config.upi_id)}&pn=${encodeURIComponent(config.business_name || "Sri Vasavi Textiles")}&am=${placedOrder.total_amount}&cu=INR&tn=${encodeURIComponent(`Order ${placedOrder.order_number}`)}`;
                  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(upiUri)}`;

                  return (
                    <div className="space-y-4 pt-1">
                      {/* Mobile One-Click UPI Intent Button */}
                      <a
                        href={upiUri}
                        className="flex items-center justify-center gap-2.5 w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold text-sm shadow-md transition transform active:scale-95"
                      >
                        <Smartphone className="h-5 w-5" />
                        <span>Open GPay / PhonePe / Paytm to Pay {formatINR(placedOrder.total_amount)}</span>
                        <ExternalLink className="h-4 w-4 opacity-80" />
                      </a>

                      <div className="text-center">
                        <p className="text-[11px] text-slate-500 font-semibold">— OR SCAN QR CODE TO PAY —</p>
                      </div>

                      <div className="flex flex-col sm:flex-row items-center gap-4 bg-white p-4 rounded-2xl border border-amber-200">
                        <img
                          src={qrUrl}
                          alt="Scan UPI QR Code"
                          className="w-36 h-36 rounded-xl border border-slate-200 p-1 shadow-sm shrink-0"
                        />
                        <div className="space-y-1.5 text-xs text-slate-700">
                          <p className="font-bold text-navy-900 text-sm">Scan with any UPI App</p>
                          <p>1. Open Google Pay, PhonePe, Paytm, or BHIM.</p>
                          <p>2. Scan this QR code or pay to UPI ID:</p>
                          <p className="font-mono font-extrabold text-navy-900 bg-slate-100 px-2 py-1 rounded inline-block select-all">
                            {config.upi_id}
                          </p>
                          <p className="text-slate-500 text-[11px]">Exact Amount: {formatINR(placedOrder.total_amount)}</p>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {placedOrder.payment_method === "BANK_TRANSFER" && config?.bank_details_text && (
                  <div className="bg-white p-4 rounded-2xl border border-amber-200 space-y-2">
                    <p className="font-bold text-navy-900 text-xs">Transfer via IMPS / NEFT / RTGS:</p>
                    <p className="text-xs text-slate-700 font-mono whitespace-pre-line leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200">
                      {config.bank_details_text}
                    </p>
                    <p className="text-xs font-semibold text-slate-600">
                      Amount to transfer: <span className="font-extrabold text-navy-900">{formatINR(placedOrder.total_amount)}</span>
                    </p>
                  </div>
                )}

                <div className="pt-2 border-t border-amber-200 space-y-2">
                  <label className="block text-xs font-bold text-navy-900">
                    Step 2: Enter UPI / Bank Reference (UTR Number)
                  </label>
                  <p className="text-[11px] text-slate-500">
                    After completing payment in your UPI or Bank app, enter the 12-digit UTR / Reference ID below:
                  </p>
                  <div className="flex gap-2">
                    <input
                      required
                      value={manualRef}
                      onChange={(e) => setManualRef(e.target.value)}
                      placeholder="e.g. 412345678901 (12-digit UTR)"
                      className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono"
                    />
                    <button
                      type="submit"
                      disabled={submittingRef}
                      className="px-5 py-2.5 rounded-xl bg-navy-900 hover:bg-navy-800 text-white text-xs font-bold shadow transition"
                    >
                      {submittingRef ? "Verifying..." : "Confirm Payment"}
                    </button>
                  </div>
                </div>
              </form>
            )}

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate("/orders")}
              className="px-5 py-2.5 rounded-xl bg-navy-900 text-white text-xs font-bold"
            >
              Track My Orders
            </button>
            <Link
              to="/catalog"
              className="px-5 py-2.5 rounded-xl border border-slate-300 text-navy-900 text-xs font-bold"
            >
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="border-b border-slate-200 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-900">Secure Checkout</h1>
          <p className="text-xs text-slate-500">Inventory will be reserved immediately for your order</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
          <Lock className="h-4 w-4" /> Server-Verified Pricing & Stock
        </span>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">{error}</div>
      )}

      <form onSubmit={handlePlaceOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-5">
          {/* Delivery Details */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-extrabold text-navy-900">1. Delivery Address</h2>
              {customer.addresses.length > 0 && (
                <select
                  value={selectedAddressId}
                  onChange={(e) => handleSelectSavedAddress(e.target.value)}
                  className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                >
                  <option value="">Custom Address</option>
                  {customer.addresses.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label} — {a.city}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Full Name *</label>
                <input required value={recipientName} onChange={(e) => setRecipientName(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Mobile Number *</label>
                <input required value={mobile} onChange={(e) => setMobile(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">Complete Address *</label>
                <textarea required rows={2} value={address} onChange={(e) => setAddress(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">City *</label>
                <input required value={city} onChange={(e) => setCity(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">State *</label>
                  <input required value={stateVal} onChange={(e) => setStateVal(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">PIN Code *</label>
                  <input required value={pincode} onChange={(e) => setPincode(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">Delivery / Packaging Instructions</label>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional tailoring or dispatch note" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
              </div>
            </div>
          </div>

          {/* Payment Method */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-3">
            <h2 className="text-sm font-extrabold text-navy-900">2. Select Payment Method</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {config?.cod_enabled && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod("COD")}
                  className={`p-3.5 rounded-2xl border-2 text-left flex items-start gap-2.5 ${
                    paymentMethod === "COD" ? "border-navy-900 bg-navy-50" : "border-slate-200"
                  }`}
                >
                  <Banknote className="h-5 w-5 text-amber-600 shrink-0" />
                  <div>
                    <p className="font-bold text-navy-900">Cash on Delivery</p>
                    <p className="text-[11px] text-slate-500">Pay cash upon doorstep delivery</p>
                  </div>
                </button>
              )}

              {config?.upi_enabled && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod("UPI")}
                  className={`p-3.5 rounded-2xl border-2 text-left flex items-start gap-2.5 ${
                    paymentMethod === "UPI" ? "border-navy-900 bg-navy-50" : "border-slate-200"
                  }`}
                >
                  <QrCode className="h-5 w-5 text-amber-600 shrink-0" />
                  <div>
                    <p className="font-bold text-navy-900">Direct UPI</p>
                    <p className="text-[11px] text-slate-500">{config.upi_id || "GPay / PhonePe / Paytm"}</p>
                  </div>
                </button>
              )}

              {config?.razorpay_enabled && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod("RAZORPAY")}
                  className={`p-3.5 rounded-2xl border-2 text-left flex items-start gap-2.5 ${
                    paymentMethod === "RAZORPAY" ? "border-navy-900 bg-navy-50" : "border-slate-200"
                  }`}
                >
                  <CreditCard className="h-5 w-5 text-amber-600 shrink-0" />
                  <div>
                    <p className="font-bold text-navy-900">Online Gateway (Razorpay)</p>
                    <p className="text-[11px] text-slate-500">Cards, NetBanking, UPI • HMAC verified</p>
                  </div>
                </button>
              )}

              {config?.bank_transfer_enabled && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod("BANK_TRANSFER")}
                  className={`p-3.5 rounded-2xl border-2 text-left flex items-start gap-2.5 ${
                    paymentMethod === "BANK_TRANSFER" ? "border-navy-900 bg-navy-50" : "border-slate-200"
                  }`}
                >
                  <Landmark className="h-5 w-5 text-amber-600 shrink-0" />
                  <div>
                    <p className="font-bold text-navy-900">Bank Transfer (NEFT / RTGS)</p>
                    <p className="text-[11px] text-slate-500">Recommended for bulk wholesale orders</p>
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Review Items */}
        <div className="lg:col-span-5 rounded-3xl border border-slate-200 bg-white p-6 space-y-4 shadow-sm">
          <h2 className="text-sm font-extrabold text-navy-900">Order Items ({cart?.items.length || 0})</h2>
          <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto text-xs">
            {(cart?.items || []).map((it) => (
              <div key={it.id} className="py-2.5 flex justify-between gap-2">
                <div>
                  <p className="font-semibold text-navy-900">{it.product_name}</p>
                  <p className="text-slate-500">
                    Qty: {Number(it.quantity)} {it.unit} • {it.pricing_tier}
                  </p>
                </div>
                <span className="font-bold text-navy-900">{formatINR(it.line_total)}</span>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-200 pt-3 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-600">Subtotal</span>
              <span className="font-semibold">{formatINR(cart?.subtotal || 0)}</span>
            </div>
            {Number(cart?.discount_amount || 0) > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Discount</span>
                <span className="font-bold">- {formatINR(cart?.discount_amount || 0)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-600">GST</span>
              <span className="font-semibold">{formatINR(cart?.gst_amount || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Delivery</span>
              <span className="font-semibold">{formatINR(cart?.delivery_charge || 0)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2.5 text-base font-extrabold text-navy-900">
              <span>Payable Total</span>
              <span>{formatINR(cart?.total_amount || 0)}</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={placing || !(cart?.items.length)}
            className="w-full py-3.5 rounded-xl bg-navy-900 text-white font-bold text-sm hover:bg-navy-800 disabled:opacity-45 shadow flex items-center justify-center gap-2"
          >
            <ShieldCheck className="h-4 w-4 text-amber-400" />
            {placing ? "Placing Order..." : `Confirm Order (${formatINR(cart?.total_amount || 0)})`}
          </button>
        </div>
      </form>
    </div>
  );
};

