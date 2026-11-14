import React, { useCallback, useEffect, useState } from "react";
import {
  BadgePercent,
  Building2,
  CheckCircle2,
  ExternalLink,
  Image as ImageIcon,
  MessageSquare,
  Plus,
  Save,
  Settings,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import { api, extractErrorMessage } from "../services/api";
import {
  StoreBanner,
  StorePromotion,
  StorefrontConfigAdmin,
  WholesaleApplication,
  WholesaleEnquiry,
} from "../types/storefront";
import { formatDateTime, formatINR } from "../utils/formatters";
import { Modal } from "../components/common/Modal";

interface AdminSummary {
  total_online_orders: number;
  pending_online_orders: number;
  online_order_value: number;
  pending_wholesale_applications: number;
  open_wholesale_enquiries: number;
}

export const StorefrontAdminPage: React.FC = () => {
  const [tab, setTab] = useState<"SETTINGS" | "WHOLESALE" | "ENQUIRIES" | "BANNERS" | "PROMOS">("SETTINGS");
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [config, setConfig] = useState<StorefrontConfigAdmin | null>(null);
  const [banners, setBanners] = useState<StoreBanner[]>([]);
  const [promos, setPromos] = useState<StorePromotion[]>([]);
  const [applications, setApplications] = useState<WholesaleApplication[]>([]);
  const [enquiries, setEnquiries] = useState<WholesaleEnquiry[]>([]);

  const [secretInputs, setSecretInputs] = useState({
    razorpay_key_secret: "",
    smtp_password: "",
    whatsapp_access_token: "",
  });

  const [bannerModal, setBannerModal] = useState(false);
  const [bannerForm, setBannerForm] = useState({
    title: "",
    subtitle: "",
    badge_text: "Festive Edit",
    cta_text: "Shop Collection",
    cta_link: "/shop/catalog",
    display_order: 1,
    is_active: true,
  });

  const [promoModal, setPromoModal] = useState(false);
  const [promoForm, setPromoForm] = useState({
    code: "",
    title: "",
    description: "",
    discount_type: "PERCENT" as "PERCENT" | "FLAT",
    discount_value: 10,
    min_order_amount: 500,
    max_discount_amount: 500,
    applicable_customer_type: "ALL" as "ALL" | "RETAIL" | "WHOLESALE",
    is_active: true,
  });

  const [respondTarget, setRespondTarget] = useState<WholesaleEnquiry | null>(null);
  const [quotePrice, setQuotePrice] = useState("");
  const [quoteNotes, setQuoteNotes] = useState("");

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [sumRes, cfgRes, banRes, proRes, appRes, enqRes] = await Promise.all([
        api.get<AdminSummary>("/storefront-admin/summary"),
        api.get<StorefrontConfigAdmin>("/storefront-admin/config"),
        api.get<StoreBanner[]>("/storefront-admin/banners"),
        api.get<StorePromotion[]>("/storefront-admin/promotions"),
        api.get<WholesaleApplication[]>("/storefront-admin/wholesale-applications"),
        api.get<WholesaleEnquiry[]>("/storefront-admin/wholesale-enquiries"),
      ]);
      setSummary(sumRes.data);
      setConfig(cfgRes.data);
      setBanners(banRes.data);
      setPromos(proRes.data);
      setApplications(appRes.data);
      setEnquiries(enqRes.data);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload: Record<string, unknown> = {
        store_enabled: config.store_enabled,
        hero_title: config.hero_title,
        hero_subtitle: config.hero_subtitle,
        contact_phone: config.contact_phone,
        contact_email: config.contact_email,
        contact_address: config.contact_address,
        whatsapp_number: config.whatsapp_number,
        free_delivery_threshold: Number(config.free_delivery_threshold),
        standard_delivery_charge: Number(config.standard_delivery_charge),
        cod_enabled: config.cod_enabled,
        upi_enabled: config.upi_enabled,
        upi_id: config.upi_id,
        bank_transfer_enabled: config.bank_transfer_enabled,
        bank_details_text: config.bank_details_text,
        gateway_provider: config.gateway_provider,
        razorpay_key_id: config.razorpay_key_id,
        email_notifications_enabled: config.email_notifications_enabled,
        smtp_host: config.smtp_host,
        smtp_port: Number(config.smtp_port),
        smtp_user: config.smtp_user,
        smtp_from_email: config.smtp_from_email,
        whatsapp_enabled: config.whatsapp_enabled,
        whatsapp_api_url: config.whatsapp_api_url,
        whatsapp_phone_number_id: config.whatsapp_phone_number_id,
        cancellation_policy_text: config.cancellation_policy_text,
        return_policy_text: config.return_policy_text,
        privacy_policy_text: config.privacy_policy_text,
      };
      if (secretInputs.razorpay_key_secret.trim()) {
        payload.razorpay_key_secret = secretInputs.razorpay_key_secret.trim();
      }
      if (secretInputs.smtp_password.trim()) {
        payload.smtp_password = secretInputs.smtp_password.trim();
      }
      if (secretInputs.whatsapp_access_token.trim()) {
        payload.whatsapp_access_token = secretInputs.whatsapp_access_token.trim();
      }
      const res = await api.put<StorefrontConfigAdmin>("/storefront-admin/config", payload);
      setConfig(res.data);
      setSecretInputs({ razorpay_key_secret: "", smtp_password: "", whatsapp_access_token: "" });
      setNotice("Storefront settings, payment configuration & notification credentials updated.");
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleReviewWholesale = async (appId: number, status: "APPROVED" | "REJECTED") => {
    const notes = window.prompt(
      `${status === "APPROVED" ? "Approve" : "Reject"} wholesale application? Enter optional review note:`,
      status === "APPROVED" ? "Verified GST & trade profile" : ""
    );
    if (notes === null) return;
    setError(null);
    try {
      await api.post(`/storefront-admin/wholesale-applications/${appId}/review`, {
        status,
        admin_notes: notes || null,
      });
      setNotice(`Application marked ${status}.`);
      await loadAll();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const handleRespondEnquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!respondTarget) return;
    try {
      await api.post(`/storefront-admin/wholesale-enquiries/${respondTarget.id}/respond`, {
        status: "QUOTED",
        quoted_price: quotePrice ? Number(quotePrice) : null,
        admin_response: quoteNotes,
      });
      setRespondTarget(null);
      setQuotePrice("");
      setQuoteNotes("");
      setNotice("Wholesale quote response sent to customer.");
      await loadAll();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const handleCreateBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/storefront-admin/banners", bannerForm);
      setBannerModal(false);
      setBannerForm({
        title: "",
        subtitle: "",
        badge_text: "Festive Edit",
        cta_text: "Shop Collection",
        cta_link: "/shop/catalog",
        display_order: 1,
        is_active: true,
      });
      await loadAll();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const handleUploadBannerImg = async (bannerId: number, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    await api.post(`/storefront-admin/banners/${bannerId}/image`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    await loadAll();
  };

  const handleDeleteBanner = async (bannerId: number) => {
    await api.delete(`/storefront-admin/banners/${bannerId}`);
    await loadAll();
  };

  const handleCreatePromo = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/storefront-admin/promotions", {
        ...promoForm,
        discount_value: Number(promoForm.discount_value),
        min_order_amount: Number(promoForm.min_order_amount),
        max_discount_amount: promoForm.max_discount_amount ? Number(promoForm.max_discount_amount) : null,
      });
      setPromoModal(false);
      await loadAll();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const handleDeletePromo = async (promoId: number) => {
    await api.delete(`/storefront-admin/promotions/${promoId}`);
    await loadAll();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-navy-900">Customer Website & Wholesale Administration</h2>
          <p className="text-xs text-slate-500">
            Control online store banners, promotions, wholesale buyer approvals, payment gateways, and shipping rules
          </p>
        </div>
        <a
          href="/shop"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-navy-900 text-amber-300 text-xs font-bold hover:bg-navy-800"
        >
          Open Live Customer Website <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* KPI Strip */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="card p-4">
            <p className="text-xs text-slate-500">Online Orders</p>
            <p className="text-2xl font-extrabold text-navy-900">{summary.total_online_orders}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-slate-500">Pending Fulfillment</p>
            <p className="text-2xl font-extrabold text-amber-600">{summary.pending_online_orders}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-slate-500">Online Order Value</p>
            <p className="text-xl font-extrabold text-emerald-700">{formatINR(summary.online_order_value)}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-slate-500">Wholesale Approvals</p>
            <p className="text-2xl font-extrabold text-navy-900">{summary.pending_wholesale_applications}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-slate-500">Open Bulk Enquiries</p>
            <p className="text-2xl font-extrabold text-navy-900">{summary.open_wholesale_enquiries}</p>
          </div>
        </div>
      )}

      {notice && <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 font-semibold">{notice}</div>}
      {error && <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">{error}</div>}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3 text-xs font-bold">
        {[
          { key: "SETTINGS", label: "Store Details & Online Payments (UPI / Bank)", icon: Settings },
          { key: "WHOLESALE", label: "Wholesale Approvals", icon: Building2 },
          { key: "ENQUIRIES", label: "Bulk Enquiries", icon: MessageSquare },
          { key: "BANNERS", label: "Homepage Banners", icon: Sparkles },
          { key: "PROMOS", label: "Promo Codes & Offers", icon: BadgePercent },
        ].map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key as typeof tab)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl transition ${
                active ? "bg-navy-900 text-amber-300" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* TAB: WHOLESALE APPROVALS */}
      {tab === "WHOLESALE" && (
        <div className="card overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Business / GSTIN</th>
                <th className="px-4 py-3 text-left">Contact & Location</th>
                <th className="px-4 py-3 text-left">Est. Monthly Volume</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {applications.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-slate-500">No wholesale dealership applications yet.</td></tr>
              ) : (
                applications.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-bold text-navy-900">{a.business_name}</p>
                      <p className="text-slate-500">GSTIN: {a.gst_number || "Not provided"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{a.contact_name} • {a.contact_mobile}</p>
                      <p className="text-slate-500">{a.shop_address}, {a.city}, {a.state} - {a.pincode}</p>
                    </td>
                    <td className="px-4 py-3">{a.estimated_monthly_volume || "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                        a.status === "APPROVED" ? "bg-emerald-100 text-emerald-800" : a.status === "REJECTED" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800"
                      }`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      {a.status === "PENDING" && (
                        <>
                          <button onClick={() => handleReviewWholesale(a.id, "APPROVED")} className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 text-white font-bold">
                            <CheckCircle2 className="h-3 w-3" /> Approve
                          </button>
                          <button onClick={() => handleReviewWholesale(a.id, "REJECTED")} className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-rose-600 text-white font-bold">
                            <XCircle className="h-3 w-3" /> Reject
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB: BULK ENQUIRIES */}
      {tab === "ENQUIRIES" && (
        <div className="card overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Enquiry #</th>
                <th className="px-4 py-3 text-left">Buyer / Contact</th>
                <th className="px-4 py-3 text-left">Product & Qty</th>
                <th className="px-4 py-3 text-left">Message / Quote</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {enquiries.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-slate-500">No wholesale enquiries received yet.</td></tr>
              ) : (
                enquiries.map((eq) => (
                  <tr key={eq.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-bold text-navy-900">{eq.enquiry_number}</p>
                      <p className="text-[11px] text-slate-400">{formatDateTime(eq.created_at)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{eq.contact_name} ({eq.business_name || "Buyer"})</p>
                      <p className="text-slate-500">{eq.mobile}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{eq.product_name || "General Bulk"}</p>
                      <p className="text-slate-500">Qty: {Number(eq.requested_quantity)} • Target: {eq.target_price ? formatINR(eq.target_price) : "—"}</p>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="text-slate-700">{eq.message}</p>
                      {eq.admin_response && (
                        <p className="mt-1 text-emerald-700 font-semibold">
                          Reply: {eq.admin_response} {eq.quoted_price ? `(₹${eq.quoted_price})` : ""}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setRespondTarget(eq);
                          setQuotePrice(eq.target_price ? String(eq.target_price) : "");
                          setQuoteNotes(eq.admin_response || "");
                        }}
                        className="px-3 py-1.5 rounded-lg bg-navy-900 text-white font-bold"
                      >
                        Send Quote
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB: BANNERS */}
      {tab === "BANNERS" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setBannerModal(true)} className="btn-primary">
              <Plus className="h-4 w-4" /> Add Homepage Banner
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {banners.map((b) => (
              <div key={b.id} className="card p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-800">{b.badge_text || "Banner"}</span>
                    <h4 className="font-bold text-navy-900 mt-1">{b.title}</h4>
                    <p className="text-xs text-slate-500">{b.subtitle}</p>
                  </div>
                  <button onClick={() => handleDeleteBanner(b.id)} className="text-rose-600 p-1 hover:bg-rose-50 rounded">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {b.image_url && <img src={b.image_url} alt={b.title} className="h-32 w-full object-cover rounded-xl border" />}
                <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
                  <span className="text-slate-500">CTA: {b.cta_text} → {b.cta_link}</span>
                  <label className="inline-flex items-center gap-1 cursor-pointer text-navy-900 font-bold hover:underline">
                    <ImageIcon className="h-3.5 w-3.5" /> Upload Image
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUploadBannerImg(b.id, f);
                    }} />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: PROMOS */}
      {tab === "PROMOS" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setPromoModal(true)} className="btn-primary">
              <Plus className="h-4 w-4" /> Create Promo Code
            </button>
          </div>
          <div className="card overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Code</th>
                  <th className="px-4 py-3 text-left">Offer Title</th>
                  <th className="px-4 py-3 text-left">Discount</th>
                  <th className="px-4 py-3 text-left">Min Order</th>
                  <th className="px-4 py-3 text-center">Eligibility</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {promos.map((pr) => (
                  <tr key={pr.id}>
                    <td className="px-4 py-3 font-extrabold text-navy-900">{pr.code}</td>
                    <td className="px-4 py-3">{pr.title}</td>
                    <td className="px-4 py-3 font-semibold text-emerald-700">
                      {pr.discount_type === "PERCENT" ? `${Number(pr.discount_value)}%` : formatINR(pr.discount_value)}
                    </td>
                    <td className="px-4 py-3">{formatINR(pr.min_order_amount)}</td>
                    <td className="px-4 py-3 text-center">{pr.applicable_customer_type}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => handleDeletePromo(pr.id)} className="text-rose-600 hover:bg-rose-50 p-1 rounded">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: SETTINGS */}
      {tab === "SETTINGS" && config && (
        <form onSubmit={handleSaveConfig} className="space-y-5">
          <div className="card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-navy-900">Storefront Availability & Showroom Contact</h3>
              <label className="inline-flex items-center gap-2 text-xs font-bold text-navy-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.store_enabled}
                  onChange={(e) => setConfig({ ...config, store_enabled: e.target.checked })}
                />
                Storefront Live
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="label-text">Customer Care Phone / Mobile</label>
                <input className="input-field" placeholder="e.g. +91 98765 43210" value={config.contact_phone || ""} onChange={(e) => setConfig({ ...config, contact_phone: e.target.value })} />
                <p className="text-[11px] text-slate-400 mt-0.5">Shown in website header & footer for customer support.</p>
              </div>
              <div>
                <label className="label-text">WhatsApp Support Number (Direct Chat)</label>
                <input className="input-field" placeholder="e.g. +91 98765 43210" value={config.whatsapp_number || ""} onChange={(e) => setConfig({ ...config, whatsapp_number: e.target.value })} />
                <p className="text-[11px] text-slate-400 mt-0.5">Enables customers to chat with you directly on WhatsApp.</p>
              </div>
              <div>
                <label className="label-text">Support Email Address</label>
                <input className="input-field" placeholder="orders@srivasavitextiles.com" value={config.contact_email || ""} onChange={(e) => setConfig({ ...config, contact_email: e.target.value })} />
              </div>
              <div>
                <label className="label-text">Showroom / Store Address</label>
                <input className="input-field" placeholder="Main Cloth Market, India" value={config.contact_address || ""} onChange={(e) => setConfig({ ...config, contact_address: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className="label-text">Store Website Headline</label>
                <input className="input-field" value={config.hero_title} onChange={(e) => setConfig({ ...config, hero_title: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className="label-text">Store Website Subtitle / Tagline</label>
                <input className="input-field" value={config.hero_subtitle} onChange={(e) => setConfig({ ...config, hero_subtitle: e.target.value })} />
              </div>
            </div>
          </div>

          <div className="card p-6 space-y-4">
            <h3 className="text-sm font-bold text-navy-900">Online Payment & Delivery Options (UPI / Bank / COD)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <label className="label-text">Free Delivery Over (₹)</label>
                <input type="number" className="input-field" value={Number(config.free_delivery_threshold)} onChange={(e) => setConfig({ ...config, free_delivery_threshold: e.target.value })} />
              </div>
              <div>
                <label className="label-text">Standard Delivery Fee (₹)</label>
                <input type="number" className="input-field" value={Number(config.standard_delivery_charge)} onChange={(e) => setConfig({ ...config, standard_delivery_charge: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className="label-text">Business UPI ID (GPay / PhonePe / Paytm / BHIM)</label>
                <input className="input-field" placeholder="e.g. srivasavitextiles@okaxis or 9876543210@paytm" value={config.upi_id || ""} onChange={(e) => setConfig({ ...config, upi_id: e.target.value })} />
                <p className="text-[11px] text-slate-400 mt-0.5">Customers transfer directly to this UPI ID at checkout.</p>
              </div>
              <div className="sm:col-span-4 flex flex-wrap gap-6 pt-2 border-t border-slate-100">
                <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={config.upi_enabled} onChange={(e) => setConfig({ ...config, upi_enabled: e.target.checked })} /> Enable Direct UPI Payments</label>
                <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={config.bank_transfer_enabled} onChange={(e) => setConfig({ ...config, bank_transfer_enabled: e.target.checked })} /> Enable Bank Transfer (IMPS/NEFT)</label>
                <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={config.cod_enabled} onChange={(e) => setConfig({ ...config, cod_enabled: e.target.checked })} /> Enable Cash on Delivery (COD)</label>
              </div>
            </div>

            <div className="space-y-4 text-xs pt-3 border-t border-slate-100">
              <div>
                <label className="label-text">Bank Account Details (Displayed to Customers on Checkout)</label>
                <textarea rows={4} className="input-field font-mono" placeholder={"Bank: State Bank of India\nAccount Name: Sri Vasavi Textiles\nAccount Number: 123456789012\nIFSC Code: SBIN0001234\nBranch: Main Branch"} value={config.bank_details_text || ""} onChange={(e) => setConfig({ ...config, bank_details_text: e.target.value })} />
                <p className="text-[11px] text-slate-400 mt-0.5">Include Bank Name, Account Name, Account Number, and IFSC Code.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="label-text">Razorpay Key ID (Optional Automated Gateway)</label>
                  <input className="input-field" placeholder="rzp_live_... or rzp_test_..." value={config.razorpay_key_id || ""} onChange={(e) => setConfig({ ...config, razorpay_key_id: e.target.value })} />
                </div>
                <div>
                  <label className="label-text">
                    Razorpay Key Secret {config.has_razorpay_secret && <span className="text-emerald-700 font-bold">(Configured ✓)</span>}
                  </label>
                  <input type="password" className="input-field" placeholder="Leave blank to keep existing secret" value={secretInputs.razorpay_key_secret} onChange={(e) => setSecretInputs({ ...secretInputs, razorpay_key_secret: e.target.value })} />
                </div>
              </div>
            </div>
          </div>

          <div className="card p-6 space-y-4">
            <h3 className="text-sm font-bold text-navy-900">Notifications (SMTP Email & Optional WhatsApp Business API)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
              <div className="sm:col-span-4 flex flex-wrap gap-6">
                <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={config.email_notifications_enabled} onChange={(e) => setConfig({ ...config, email_notifications_enabled: e.target.checked })} /> Enable Email Notifications</label>
                <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={config.whatsapp_enabled} onChange={(e) => setConfig({ ...config, whatsapp_enabled: e.target.checked })} /> Enable WhatsApp Business API</label>
              </div>
              <div>
                <label className="label-text">SMTP Host</label>
                <input className="input-field" value={config.smtp_host || ""} onChange={(e) => setConfig({ ...config, smtp_host: e.target.value })} />
              </div>
              <div>
                <label className="label-text">SMTP Port</label>
                <input type="number" className="input-field" value={config.smtp_port} onChange={(e) => setConfig({ ...config, smtp_port: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label-text">SMTP Username</label>
                <input className="input-field" value={config.smtp_user || ""} onChange={(e) => setConfig({ ...config, smtp_user: e.target.value })} />
              </div>
              <div>
                <label className="label-text">SMTP Password {config.has_smtp_password && "(Saved)"}</label>
                <input type="password" className="input-field" value={secretInputs.smtp_password} onChange={(e) => setSecretInputs({ ...secretInputs, smtp_password: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className="label-text">WhatsApp Cloud API URL</label>
                <input className="input-field" value={config.whatsapp_api_url || ""} onChange={(e) => setConfig({ ...config, whatsapp_api_url: e.target.value })} />
              </div>
              <div>
                <label className="label-text">WhatsApp Phone ID</label>
                <input className="input-field" value={config.whatsapp_phone_number_id || ""} onChange={(e) => setConfig({ ...config, whatsapp_phone_number_id: e.target.value })} />
              </div>
              <div>
                <label className="label-text">WhatsApp Token {config.has_whatsapp_token && "(Saved)"}</label>
                <input type="password" className="input-field" value={secretInputs.whatsapp_access_token} onChange={(e) => setSecretInputs({ ...secretInputs, whatsapp_access_token: e.target.value })} />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="btn-primary">
              <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save Storefront Settings"}
            </button>
          </div>
        </form>
      )}

      {/* Respond Quote Modal */}
      <Modal open={Boolean(respondTarget)} onClose={() => setRespondTarget(null)} title={`Respond to ${respondTarget?.enquiry_number || ""}`} maxWidthClass="max-w-md">
        <form onSubmit={handleRespondEnquiry} className="space-y-4">
          <div>
            <label className="label-text">Quoted Unit Rate (₹)</label>
            <input type="number" step="0.01" className="input-field" value={quotePrice} onChange={(e) => setQuotePrice(e.target.value)} />
          </div>
          <div>
            <label className="label-text">Sales Desk Response *</label>
            <textarea required rows={3} className="input-field" value={quoteNotes} onChange={(e) => setQuoteNotes(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setRespondTarget(null)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Send Quote</button>
          </div>
        </form>
      </Modal>

      {/* Banner Modal */}
      <Modal open={bannerModal} onClose={() => setBannerModal(false)} title="Create Homepage Banner" maxWidthClass="max-w-lg">
        <form onSubmit={handleCreateBanner} className="space-y-3">
          <div>
            <label className="label-text">Banner Title *</label>
            <input required className="input-field" value={bannerForm.title} onChange={(e) => setBannerForm({ ...bannerForm, title: e.target.value })} />
          </div>
          <div>
            <label className="label-text">Subtitle</label>
            <input className="input-field" value={bannerForm.subtitle} onChange={(e) => setBannerForm({ ...bannerForm, subtitle: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-text">CTA Text</label>
              <input className="input-field" value={bannerForm.cta_text} onChange={(e) => setBannerForm({ ...bannerForm, cta_text: e.target.value })} />
            </div>
            <div>
              <label className="label-text">CTA Link</label>
              <input className="input-field" value={bannerForm.cta_link} onChange={(e) => setBannerForm({ ...bannerForm, cta_link: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setBannerModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Create Banner</button>
          </div>
        </form>
      </Modal>

      {/* Promo Modal */}
      <Modal open={promoModal} onClose={() => setPromoModal(false)} title="Create Storefront Promo Code" maxWidthClass="max-w-lg">
        <form onSubmit={handleCreatePromo} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-text">Promo Code *</label>
              <input required className="input-field uppercase" value={promoForm.code} onChange={(e) => setPromoForm({ ...promoForm, code: e.target.value.toUpperCase() })} placeholder="SILK10" />
            </div>
            <div>
              <label className="label-text">Title *</label>
              <input required className="input-field" value={promoForm.title} onChange={(e) => setPromoForm({ ...promoForm, title: e.target.value })} placeholder="Festive 10% Off" />
            </div>
            <div>
              <label className="label-text">Type</label>
              <select className="input-field" value={promoForm.discount_type} onChange={(e) => setPromoForm({ ...promoForm, discount_type: e.target.value as "PERCENT" | "FLAT" })}>
                <option value="PERCENT">Percentage (%)</option>
                <option value="FLAT">Flat Amount (₹)</option>
              </select>
            </div>
            <div>
              <label className="label-text">Value *</label>
              <input required type="number" step="0.01" className="input-field" value={promoForm.discount_value} onChange={(e) => setPromoForm({ ...promoForm, discount_value: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label-text">Min Order Amount (₹)</label>
              <input type="number" className="input-field" value={promoForm.min_order_amount} onChange={(e) => setPromoForm({ ...promoForm, min_order_amount: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label-text">Max Discount Cap (₹)</label>
              <input type="number" className="input-field" value={promoForm.max_discount_amount} onChange={(e) => setPromoForm({ ...promoForm, max_discount_amount: Number(e.target.value) })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setPromoModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Save Promo Code</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

