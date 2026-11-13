import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, CheckCircle2, Clock, Send, ShieldCheck, ShoppingBag, Tag } from "lucide-react";
import { useStoreAuth } from "../../context/StoreAuthContext";
import { extractErrorMessage } from "../../services/api";
import { storeApi } from "../../services/storeApi";
import { PaginatedResponse } from "../../types/erp";
import { StoreProduct, WholesaleApplication, WholesaleEnquiry } from "../../types/storefront";
import { formatDateTime, formatINR } from "../../utils/formatters";

export const StoreWholesalePage: React.FC = () => {
  const { customer, refreshCart, refreshProfile } = useStoreAuth();

  const [applications, setApplications] = useState<WholesaleApplication[]>([]);
  const [enquiries, setEnquiries] = useState<WholesaleEnquiry[]>([]);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [appForm, setAppForm] = useState({
    business_name: "",
    gst_number: "",
    shop_address: "",
    city: "",
    state: "Tamil Nadu",
    pincode: "",
    contact_name: customer?.name || "",
    contact_mobile: customer?.mobile || "",
    contact_email: customer?.email || "",
    estimated_monthly_volume: "",
    notes: "",
  });

  const [enqForm, setEnqForm] = useState({
    product_id: "",
    contact_name: customer?.name || "",
    business_name: "",
    mobile: customer?.mobile || "",
    email: customer?.email || "",
    requested_quantity: "25",
    target_price: "",
    message: "",
  });

  const loadData = useCallback(async () => {
    try {
      const prodRes = await storeApi.get<PaginatedResponse<StoreProduct>>("/products?page_size=50");
      setProducts(prodRes.data.items);
      if (customer) {
        const [appRes, enqRes] = await Promise.all([
          storeApi.get<WholesaleApplication[]>("/wholesale/applications"),
          storeApi.get<WholesaleEnquiry[]>("/wholesale/enquiries"),
        ]);
        setApplications(appRes.data);
        setEnquiries(enqRes.data);
      }
    } catch {
      // ignore initial public load warnings
    }
  }, [customer]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleApplyWholesale = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      await storeApi.post("/wholesale/apply", appForm);
      setNotice("Wholesale dealership application submitted for Owner review.");
      await Promise.all([refreshProfile(), loadData()]);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const handleSubmitEnquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      await storeApi.post("/wholesale/enquiries", {
        ...enqForm,
        product_id: enqForm.product_id ? Number(enqForm.product_id) : null,
        requested_quantity: Number(enqForm.requested_quantity),
        target_price: enqForm.target_price ? Number(enqForm.target_price) : null,
      });
      setNotice("Bulk enquiry sent to Sri Vasavi Textiles sales desk.");
      setEnqForm((p) => ({ ...p, target_price: "", message: "" }));
      await loadData();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const handleAddMoqToCart = async (p: StoreProduct) => {
    setError(null);
    setNotice(null);
    try {
      const qty = Math.min(Number(p.available_stock), Number(p.wholesale_min_qty));
      await storeApi.post("/cart/items", {
        product_id: p.id,
        quantity: qty,
        selected_size: p.available_sizes[0] || "",
        selected_color: p.available_colors[0] || "",
      });
      await refreshCart();
      setNotice(`Added ${qty} ${p.unit} of ${p.name} at wholesale tier pricing.`);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Header Banner */}
      <div className="rounded-3xl bg-gradient-to-r from-navy-950 via-navy-900 to-navy-800 text-white p-8 flex flex-wrap items-center justify-between gap-6 border border-amber-500/40">
        <div className="space-y-2 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-amber-400">
            <Building2 className="h-4 w-4" /> B2B Dealer & Bulk Procurement Hub
          </span>
          <h1 className="text-3xl font-extrabold">Sri Vasavi Textiles Wholesale</h1>
          <p className="text-sm text-slate-300">
            Factory-direct pricing on Kanchipuram silks, cotton sarees, menswear, womenswear, and shirting bundles for verified boutiques and showroom dealers.
          </p>
        </div>
        {customer && (
          <div className="px-5 py-3.5 rounded-2xl bg-white/10 border border-white/15 text-xs space-y-1">
            <p className="text-slate-300">Account Status</p>
            {customer.is_wholesale_approved ? (
              <p className="font-extrabold text-emerald-300 text-sm flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4" /> Approved Wholesale Buyer
              </p>
            ) : (
              <p className="font-extrabold text-amber-300 text-sm flex items-center gap-1.5">
                <Clock className="h-4 w-4" /> {customer.customer_type} ({customer.wholesale_status})
              </p>
            )}
          </div>
        )}
      </div>

      {notice && <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3.5 text-xs font-semibold text-emerald-800">{notice}</div>}
      {error && <div className="rounded-xl bg-rose-50 border border-rose-200 p-3.5 text-xs font-semibold text-rose-700">{error}</div>}

      {/* Approved Wholesale Quick Bulk Matrix */}
      {customer?.is_wholesale_approved && (
        <section className="rounded-3xl border border-emerald-200 bg-white overflow-hidden shadow-sm">
          <div className="px-6 py-4 bg-emerald-50 border-b border-emerald-200 flex items-center justify-between">
            <div>
              <h2 className="text-base font-extrabold text-navy-900 flex items-center gap-2">
                <Tag className="h-4 w-4 text-emerald-700" /> Approved Wholesale Rate Sheet
              </h2>
              <p className="text-xs text-emerald-800">
                Order at or above Minimum Order Quantity (MOQ) to receive exclusive wholesale tier prices automatically in your cart.
              </p>
            </div>
            <Link to="/shop/cart" className="px-4 py-2 rounded-xl bg-navy-900 text-white text-xs font-bold">
              View Cart
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase">
                <tr>
                  <th className="px-5 py-3 text-left">Product</th>
                  <th className="px-5 py-3 text-right">Retail MRP</th>
                  <th className="px-5 py-3 text-right">Wholesale Rate</th>
                  <th className="px-5 py-3 text-center">MOQ</th>
                  <th className="px-5 py-3 text-right">Stock</th>
                  <th className="px-5 py-3 text-right">Quick Order</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <Link to={`/shop/product/${p.id}`} className="font-bold text-navy-900 hover:underline">
                        {p.name}
                      </Link>
                      <p className="text-slate-500">{p.category_name} • {p.product_code}</p>
                    </td>
                    <td className="px-5 py-3 text-right line-through text-slate-400">{formatINR(p.retail_price)}</td>
                    <td className="px-5 py-3 text-right font-extrabold text-emerald-700 text-sm">
                      {p.wholesale_price ? formatINR(p.wholesale_price) : "—"}
                    </td>
                    <td className="px-5 py-3 text-center font-semibold">
                      {Number(p.wholesale_min_qty)} {p.unit}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold">
                      {Number(p.available_stock)} {p.unit}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        disabled={!p.in_stock || p.wholesale_price === null}
                        onClick={() => handleAddMoqToCart(p)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-navy-900 text-white font-bold disabled:opacity-40"
                      >
                        <ShoppingBag className="h-3.5 w-3.5 text-amber-400" /> Add MOQ ({Number(p.wholesale_min_qty)})
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Wholesale Account Application (if not already approved) */}
        {!customer?.is_wholesale_approved && (
          <div className="lg:col-span-6 rounded-3xl border border-slate-200 bg-white p-6 space-y-4">
            <h2 className="text-lg font-extrabold text-navy-900">Apply for Wholesale Trade Account</h2>
            {!customer ? (
              <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 text-xs space-y-3">
                <p className="text-amber-900 font-medium">
                  Register as a Wholesale Dealer or sign in to submit your GST & showroom verification for wholesale price access.
                </p>
                <div className="flex gap-2">
                  <Link to="/shop/register" className="px-4 py-2 rounded-xl bg-navy-900 text-white font-bold">
                    Register as Wholesale Buyer
                  </Link>
                  <Link to="/shop/login" className="px-4 py-2 rounded-xl border border-navy-900 font-bold text-navy-900">
                    Sign In
                  </Link>
                </div>
              </div>
            ) : applications.some((a) => a.status === "PENDING") ? (
              <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2">
                <p className="font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-amber-700" /> Application Under Owner Review
                </p>
                <p>
                  Your GST and business details have been submitted. Wholesale tier prices will unlock automatically once approved in ERP.
                </p>
              </div>
            ) : (
              <form onSubmit={handleApplyWholesale} className="space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input required placeholder="Business / Showroom Name *" value={appForm.business_name} onChange={(e) => setAppForm({ ...appForm, business_name: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2" />
                  <input placeholder="GSTIN (Recommended)" value={appForm.gst_number} onChange={(e) => setAppForm({ ...appForm, gst_number: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2" />
                  <input required placeholder="Contact Name *" value={appForm.contact_name} onChange={(e) => setAppForm({ ...appForm, contact_name: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2" />
                  <input required placeholder="Mobile *" value={appForm.contact_mobile} onChange={(e) => setAppForm({ ...appForm, contact_mobile: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2" />
                  <input required placeholder="Shop Street Address *" value={appForm.shop_address} onChange={(e) => setAppForm({ ...appForm, shop_address: e.target.value })} className="sm:col-span-2 rounded-xl border border-slate-300 px-3 py-2" />
                  <input required placeholder="City *" value={appForm.city} onChange={(e) => setAppForm({ ...appForm, city: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2" />
                  <input required placeholder="State *" value={appForm.state} onChange={(e) => setAppForm({ ...appForm, state: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2" />
                  <input required placeholder="PIN Code *" value={appForm.pincode} onChange={(e) => setAppForm({ ...appForm, pincode: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2" />
                  <input placeholder="Est. Monthly Volume" value={appForm.estimated_monthly_volume} onChange={(e) => setAppForm({ ...appForm, estimated_monthly_volume: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2" />
                </div>
                <button type="submit" className="w-full py-2.5 rounded-xl bg-navy-900 text-white font-bold">
                  Submit Wholesale Verification
                </button>
              </form>
            )}
          </div>
        )}

        {/* Negotiated Bulk Quote Enquiry Form */}
        <div className={`${customer?.is_wholesale_approved ? "lg:col-span-6" : "lg:col-span-6"} rounded-3xl border border-slate-200 bg-white p-6 space-y-4`}>
          <h2 className="text-lg font-extrabold text-navy-900">Bulk Order & Negotiated Price Enquiry</h2>
          <form onSubmit={handleSubmitEnquiry} className="space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-600 mb-1">Textile Product (Optional)</label>
                <select value={enqForm.product_id} onChange={(e) => setEnqForm({ ...enqForm, product_id: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2">
                  <option value="">General Bulk Requirement</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.product_code})
                    </option>
                  ))}
                </select>
              </div>
              <input required placeholder="Your Name *" value={enqForm.contact_name} onChange={(e) => setEnqForm({ ...enqForm, contact_name: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2" />
              <input placeholder="Showroom / Business Name" value={enqForm.business_name} onChange={(e) => setEnqForm({ ...enqForm, business_name: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2" />
              <input required placeholder="Mobile Number *" value={enqForm.mobile} onChange={(e) => setEnqForm({ ...enqForm, mobile: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2" />
              <input type="email" placeholder="Email Address" value={enqForm.email} onChange={(e) => setEnqForm({ ...enqForm, email: e.target.value })} className="rounded-xl border border-slate-300 px-3 py-2" />
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Required Quantity *</label>
                <input required type="number" min={1} value={enqForm.requested_quantity} onChange={(e) => setEnqForm({ ...enqForm, requested_quantity: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2" />
              </div>
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Target Rate (₹ / unit)</label>
                <input type="number" step="0.01" placeholder="Optional" value={enqForm.target_price} onChange={(e) => setEnqForm({ ...enqForm, target_price: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2" />
              </div>
              <div className="sm:col-span-2">
                <textarea required minLength={5} rows={3} placeholder="Specify fabric mix, colour assortment, delivery city & timeline..." value={enqForm.message} onChange={(e) => setEnqForm({ ...enqForm, message: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2" />
              </div>
            </div>
            <button type="submit" className="w-full py-2.5 rounded-xl bg-amber-500 text-navy-950 font-extrabold inline-flex items-center justify-center gap-2 hover:bg-amber-400">
              <Send className="h-4 w-4" /> Send Bulk Quote Enquiry
            </button>
          </form>
        </div>

        {/* Customer Enquiries History */}
        {customer && enquiries.length > 0 && (
          <div className="lg:col-span-6 rounded-3xl border border-slate-200 bg-white p-6 space-y-3">
            <h3 className="text-sm font-extrabold text-navy-900">Your Quote Requests & Responses</h3>
            <div className="space-y-3 text-xs">
              {enquiries.map((eq) => (
                <div key={eq.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-navy-900">{eq.enquiry_number}</span>
                    <span className="px-2 py-0.5 rounded-full bg-navy-900 text-amber-300 text-[10px] font-bold">
                      {eq.status}
                    </span>
                  </div>
                  <p className="text-slate-600">
                    {eq.product_name || "General Bulk"} • Qty: {Number(eq.requested_quantity)} • {formatDateTime(eq.created_at)}
                  </p>
                  {eq.quoted_price && (
                    <p className="font-bold text-emerald-700">Quoted Rate: {formatINR(eq.quoted_price)}</p>
                  )}
                  {eq.admin_response && (
                    <p className="p-2.5 rounded-xl bg-white border border-slate-200 text-navy-900">
                      <strong>ERP Sales Reply:</strong> {eq.admin_response}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

