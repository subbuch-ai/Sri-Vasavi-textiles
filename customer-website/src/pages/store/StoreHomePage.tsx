import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Award,
  BadgePercent,
  Building2,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Sparkles,
  Tag,
  Truck,
} from "lucide-react";
import { StoreProductCard } from "../../components/store/StoreProductCard";
import { useStoreAuth } from "../../context/StoreAuthContext";
import { storeApi } from "../../services/storeApi";
import { extractErrorMessage } from "../../services/api";
import { StoreHomeResponse, StoreProduct } from "../../types/storefront";
import { formatINR } from "../../utils/formatters";

export const StoreHomePage: React.FC = () => {
  const { customer, refreshCart } = useStoreAuth();
  const navigate = useNavigate();

  const [data, setData] = useState<StoreHomeResponse | null>(null);
  const [bannerIdx, setBannerIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await storeApi.get<StoreHomeResponse>("/home");
        setData(res.data);
      } catch {
        // handled by empty fallback
      } finally {
        setLoading(false);
      }
    })();
  }, [customer?.is_wholesale_approved]);

  const handleQuickAdd = async (product: StoreProduct) => {
    if (!customer) {
      navigate("/login");
      return;
    }
    setAddingId(product.id);
    setToast(null);
    try {
      await storeApi.post("/cart/items", {
        product_id: product.id,
        quantity: 1,
        selected_size: product.available_sizes[0] || "",
        selected_color: product.available_colors[0] || "",
      });
      await refreshCart();
      setToast({ msg: `${product.name} added to your cart.` });
    } catch (err) {
      setToast({ msg: extractErrorMessage(err), err: true });
    } finally {
      setAddingId(null);
    }
  };

  if (loading && !data) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-20 text-center text-sm text-slate-500">
        Loading Sri Vasavi Textiles collection...
      </div>
    );
  }

  const banners = data?.banners || [];
  const activeBanner = banners[bannerIdx % Math.max(banners.length, 1)];

  return (
    <div className="space-y-14 pb-10">
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl shadow-xl text-xs font-semibold border ${
            toast.err
              ? "bg-rose-50 text-rose-800 border-rose-200"
              : "bg-navy-900 text-amber-300 border-amber-400/50"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Hero Promotional Banner */}
      <section className="relative bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 text-white overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(212,175,55,0.22),transparent_55%)]" />
        <div className="max-w-7xl mx-auto px-6 py-14 sm:py-20 relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-5">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-400/40 text-amber-300 text-xs font-bold uppercase tracking-wider">
              <Sparkles className="h-3.5 w-3.5" />
              {activeBanner?.badge_text || "Heritage Collection"}
            </span>
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight text-white">
              {activeBanner?.title || data?.config.hero_title || "Sri Vasavi Textiles"}
            </h1>
            <p className="text-sm sm:text-base text-slate-300 max-w-xl leading-relaxed">
              {activeBanner?.subtitle ||
                data?.config.hero_subtitle ||
                "Fine Indian Sarees, Menswear, Womenswear, and Mill-Direct Wholesale Apparel."}
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                to={activeBanner?.cta_link || "/catalog"}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-500 text-navy-950 font-bold text-sm hover:bg-amber-400 shadow-lg transition"
              >
                {activeBanner?.cta_text || "Shop Collection"} <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/wholesale"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-amber-400/50 text-amber-200 font-semibold text-sm hover:bg-white/10 transition"
              >
                <Building2 className="h-4 w-4" /> Wholesale B2B Portal
              </Link>
            </div>
            {banners.length > 1 && (
              <div className="flex items-center gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setBannerIdx((i) => (i - 1 + banners.length) % banners.length)}
                  className="p-1.5 rounded-full bg-white/10 hover:bg-white/20"
                  aria-label="Previous Banner"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="flex gap-1.5">
                  {banners.map((b, idx) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setBannerIdx(idx)}
                      className={`h-2 rounded-full transition-all ${
                        idx === bannerIdx % banners.length ? "w-6 bg-amber-400" : "w-2 bg-white/30"
                      }`}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setBannerIdx((i) => (i + 1) % banners.length)}
                  className="p-1.5 rounded-full bg-white/10 hover:bg-white/20"
                  aria-label="Next Banner"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          <div className="lg:col-span-5">
            {activeBanner?.image_url ? (
              <img
                src={activeBanner.image_url}
                alt={activeBanner.title}
                className="w-full h-72 sm:h-80 object-cover rounded-3xl border-2 border-amber-400/40 shadow-2xl"
              />
            ) : (
              <div className="rounded-3xl bg-white/5 border border-amber-400/30 p-7 space-y-4 backdrop-blur">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-4 rounded-2xl bg-white/10 space-y-1">
                    <Truck className="h-5 w-5 text-amber-400" />
                    <p className="font-bold text-white">Fast Pan-India Dispatch</p>
                    <p className="text-slate-300">Live courier tracking on every order</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-white/10 space-y-1">
                    <ShieldCheck className="h-5 w-5 text-amber-400" />
                    <p className="font-bold text-white">GST Tax Invoices</p>
                    <p className="text-slate-300">Downloadable official GST PDF bills</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-white/10 space-y-1">
                    <Award className="h-5 w-5 text-amber-400" />
                    <p className="font-bold text-white">Mill Direct Quality</p>
                    <p className="text-slate-300">Live ERP warehouse inventory sync</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-white/10 space-y-1">
                    <Building2 className="h-5 w-5 text-amber-400" />
                    <p className="font-bold text-white">Wholesale Dealer Hub</p>
                    <p className="text-slate-300">Exclusive bulk pricing & MOQ tiers</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Special Offers / Promo Strip */}
      {data?.promotions && data.promotions.length > 0 && (
        <section className="max-w-7xl mx-auto px-6">
          <div className="rounded-2xl bg-gradient-to-r from-amber-50 via-white to-amber-50 border border-amber-200 p-5 flex flex-wrap items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-500 text-navy-950 flex items-center justify-center shrink-0">
                <BadgePercent className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-navy-900">Special Festive & Bulk Offers</h2>
                <p className="text-xs text-slate-600">Apply coupon codes inside your shopping cart during checkout.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {data.promotions.map((promo) => (
                <div
                  key={promo.id}
                  className="px-3 py-1.5 rounded-xl bg-white border border-dashed border-amber-500 text-xs flex items-center gap-2"
                >
                  <Tag className="h-3.5 w-3.5 text-amber-600" />
                  <span className="font-extrabold text-navy-900 tracking-wide">{promo.code}</span>
                  <span className="text-slate-600">
                    ({promo.discount_type === "PERCENT"
                      ? `${Number(promo.discount_value)}% OFF`
                      : `${formatINR(promo.discount_value)} OFF`}
                    {Number(promo.min_order_amount) > 0 ? ` on ${formatINR(promo.min_order_amount)}+` : ""})
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Categories Showcase */}
      {data?.categories && data.categories.length > 0 && (
        <section className="max-w-7xl mx-auto px-6 space-y-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-amber-700">Curated Sections</p>
              <h2 className="text-2xl font-extrabold text-navy-900">Shop by Category</h2>
            </div>
            <Link to="/catalog" className="text-xs font-bold text-navy-900 hover:text-amber-700 flex items-center gap-1">
              View All Products <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
            {data.categories.map((cat) => (
              <Link
                key={cat.id}
                to={`/catalog?category=${cat.id}`}
                className="p-4 rounded-2xl border border-slate-200 bg-white hover:border-amber-400 hover:shadow-md transition group"
              >
                <div className="h-9 w-9 rounded-xl bg-navy-900/5 group-hover:bg-navy-900 text-navy-900 group-hover:text-amber-400 flex items-center justify-center text-xs font-extrabold mb-3 transition">
                  {cat.name.slice(0, 2).toUpperCase()}
                </div>
                <p className="font-bold text-sm text-navy-900 group-hover:text-amber-700">{cat.name}</p>
                <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                  {cat.description || "Explore fresh catalogue arrivals"}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Featured Products */}
      <section className="max-w-7xl mx-auto px-6 space-y-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-amber-700">Handpicked Elegance</p>
            <h2 className="text-2xl font-extrabold text-navy-900">Featured Products</h2>
          </div>
          <Link to="/catalog?featured=true" className="text-xs font-bold text-navy-900 hover:text-amber-700 flex items-center gap-1">
            Explore Featured <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {data?.featured_products && data.featured_products.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {data.featured_products.map((p) => (
              <StoreProductCard
                key={p.id}
                product={p}
                onQuickAdd={handleQuickAdd}
                adding={addingId === p.id}
              />
            ))}
          </div>
        ) : (
          <div className="p-10 rounded-2xl border border-dashed border-slate-300 text-center text-sm text-slate-500">
            Featured textiles will appear here as inventory is published from Sri Vasavi Textiles ERP.
          </div>
        )}
      </section>

      {/* New Arrivals */}
      {data?.new_arrivals && data.new_arrivals.length > 0 && (
        <section className="bg-slate-50/80 border-y border-slate-200/80 py-12">
          <div className="max-w-7xl mx-auto px-6 space-y-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-amber-700">Just Landed</p>
                <h2 className="text-2xl font-extrabold text-navy-900">New Arrivals</h2>
              </div>
              <Link to="/catalog?new_arrival=true" className="text-xs font-bold text-navy-900 hover:text-amber-700 flex items-center gap-1">
                See All Arrivals <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {data.new_arrivals.map((p) => (
                <StoreProductCard
                  key={p.id}
                  product={p}
                  onQuickAdd={handleQuickAdd}
                  adding={addingId === p.id}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Best Sellers */}
      {data?.best_sellers && data.best_sellers.length > 0 && (
        <section className="max-w-7xl mx-auto px-6 space-y-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-amber-700">Customer Favourites</p>
              <h2 className="text-2xl font-extrabold text-navy-900">Best Sellers</h2>
            </div>
            <Link to="/catalog?best_seller=true" className="text-xs font-bold text-navy-900 hover:text-amber-700 flex items-center gap-1">
              View Best Sellers <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {data.best_sellers.map((p) => (
              <StoreProductCard
                key={p.id}
                product={p}
                onQuickAdd={handleQuickAdd}
                adding={addingId === p.id}
              />
            ))}
          </div>
        </section>
      )}

      {/* Wholesale Dealer CTA */}
      <section className="max-w-7xl mx-auto px-6">
        <div className="rounded-3xl bg-navy-900 text-white p-8 sm:p-10 flex flex-col md:flex-row items-center justify-between gap-6 border border-amber-500/40 shadow-xl">
          <div className="space-y-2 max-w-2xl">
            <span className="text-xs font-bold uppercase tracking-widest text-amber-400">
              For Boutique Owners, Showrooms & Traders
            </span>
            <h3 className="text-2xl font-extrabold">Partner with Sri Vasavi Textiles Wholesale</h3>
            <p className="text-sm text-slate-300">
              Register with your GSTIN and shop details to unlock verified B2B wholesale pricing, minimum order quantity discounts, and direct bulk quote negotiations.
            </p>
          </div>
          <Link
            to="/wholesale"
            className="shrink-0 inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-amber-500 text-navy-950 font-bold text-sm hover:bg-amber-400 transition"
          >
            Open Wholesale Portal <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
};

