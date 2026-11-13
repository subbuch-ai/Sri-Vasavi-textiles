import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Minus,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Tag,
} from "lucide-react";
import { useStoreAuth } from "../../context/StoreAuthContext";
import { extractErrorMessage } from "../../services/api";
import { storeApi } from "../../services/storeApi";
import { StoreProduct } from "../../types/storefront";
import { formatINR } from "../../utils/formatters";

export const StoreProductPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { customer, refreshCart } = useStoreAuth();
  const navigate = useNavigate();

  const [product, setProduct] = useState<StoreProduct | null>(null);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedColor, setSelectedColor] = useState("");
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await storeApi.get<StoreProduct>(`/products/${id}`);
        const p = res.data;
        setProduct(p);
        const firstImg =
          p.images?.find((i) => i.is_primary)?.image_url ||
          p.images?.[0]?.image_url ||
          p.image_url ||
          null;
        setActiveImage(firstImg);
        setSelectedSize(p.available_sizes[0] || "");
        setSelectedColor(p.available_colors[0] || "");
        setQty(1);
      } catch (err) {
        setMsg({ text: extractErrorMessage(err), err: true });
      } finally {
        setLoading(false);
      }
    })();
  }, [id, customer?.is_wholesale_approved]);

  if (loading) {
    return <div className="max-w-6xl mx-auto px-6 py-20 text-center text-sm text-slate-500">Loading product...</div>;
  }

  if (!product) {
    return (
      <div className="max-w-xl mx-auto px-6 py-20 text-center space-y-4">
        <p className="text-lg font-bold text-navy-900">Product not available</p>
        <Link to="/shop/catalog" className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700">
          <ArrowLeft className="h-4 w-4" /> Back to Catalogue
        </Link>
      </div>
    );
  }

  const maxStock = Number(product.available_stock);
  const retail = Number(product.retail_price);
  const wholesale =
    product.wholesale_price !== null && product.wholesale_price !== undefined
      ? Number(product.wholesale_price)
      : null;
  const minMoq = Number(product.wholesale_min_qty);
  const wholesaleActive = Boolean(customer?.is_wholesale_approved && wholesale !== null && qty >= minMoq);
  const effectiveUnit = wholesaleActive && wholesale !== null ? wholesale : retail;

  const gallery = [
    ...(product.images || []).map((i) => i.image_url),
    ...(product.image_url && !(product.images || []).some((i) => i.image_url === product.image_url)
      ? [product.image_url]
      : []),
  ];

  const handleAddToCart = async (goToCart = false) => {
    if (!customer) {
      navigate("/shop/login");
      return;
    }
    setAdding(true);
    setMsg(null);
    try {
      await storeApi.post("/cart/items", {
        product_id: product.id,
        quantity: qty,
        selected_size: selectedSize,
        selected_color: selectedColor,
      });
      await refreshCart();
      if (goToCart) {
        navigate("/shop/cart");
      } else {
        setMsg({ text: `Added ${qty} ${product.unit} to your shopping cart.` });
      }
    } catch (err) {
      setMsg({ text: extractErrorMessage(err), err: true });
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <Link to="/shop/catalog" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-navy-900">
        <ArrowLeft className="h-4 w-4" /> Back to Catalogue
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Image Gallery */}
        <div className="lg:col-span-6 space-y-3">
          <div className="aspect-[4/3] rounded-3xl border border-slate-200 bg-slate-50 overflow-hidden shadow-sm">
            {activeImage ? (
              <img src={activeImage} alt={product.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-amber-50 text-navy-900/70">
                <Sparkles className="h-12 w-12 text-amber-500 mb-2" />
                <span className="text-xs font-bold uppercase tracking-widest">{product.category_name}</span>
              </div>
            )}
          </div>
          {gallery.length > 1 && (
            <div className="flex gap-2.5 overflow-x-auto pb-1">
              {gallery.map((url, idx) => (
                <button
                  key={`${url}-${idx}`}
                  type="button"
                  onClick={() => setActiveImage(url)}
                  className={`h-18 w-18 rounded-xl overflow-hidden border-2 shrink-0 ${
                    activeImage === url ? "border-amber-500" : "border-slate-200"
                  }`}
                >
                  <img src={url} alt="" className="h-16 w-16 object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product Info & Order Controls */}
        <div className="lg:col-span-6 space-y-5">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs mb-2">
              <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold uppercase tracking-wider">
                {product.category_name}
              </span>
              <span className="text-slate-400">SKU: {product.product_code}</span>
              {product.brand && <span className="text-slate-600 font-medium">• {product.brand}</span>}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-navy-900">{product.name}</h1>
          </div>

          {/* Pricing Box */}
          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-slate-500">
                  {wholesaleActive ? "Your Approved Wholesale Price" : "Retail Price"}
                </p>
                <p className="text-3xl font-extrabold text-navy-900">
                  {formatINR(effectiveUnit)}
                  <span className="text-sm font-normal text-slate-500"> / {product.unit}</span>
                </p>
              </div>
              <div className="text-right">
                {product.in_stock ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {maxStock} {product.unit} in stock
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-rose-100 text-rose-700 text-xs font-bold">
                    Out of Stock
                  </span>
                )}
                <p className="text-[11px] text-slate-500 mt-1">+{Number(product.gst_rate)}% GST (HSN {product.hsn_code || "Textile"})</p>
              </div>
            </div>

            {wholesale !== null ? (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  <Tag className="h-3.5 w-3.5 text-emerald-700" />
                  Wholesale Rate: {formatINR(wholesale)} / {product.unit} on orders of {minMoq}+ {product.unit}
                </span>
                {qty < minMoq && (
                  <button
                    type="button"
                    disabled={maxStock < minMoq}
                    onClick={() => setQty(Math.min(maxStock, minMoq))}
                    className="underline font-bold text-emerald-800 disabled:opacity-40"
                  >
                    Select {minMoq}
                  </button>
                )}
              </div>
            ) : (
              product.wholesale_eligible && (
                <p className="text-xs text-slate-600 flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-amber-600" />
                  Approved wholesale dealers receive bulk tier rates (MOQ {minMoq} {product.unit}).{" "}
                  <Link to="/shop/wholesale" className="font-bold text-navy-900 underline">
                    Apply / Enquire
                  </Link>
                </p>
              )
            )}
          </div>

          {product.description && (
            <p className="text-sm text-slate-600 leading-relaxed">{product.description}</p>
          )}

          {/* Size & Color Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {product.available_sizes.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Select Size</p>
                <div className="flex flex-wrap gap-2">
                  {product.available_sizes.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSelectedSize(s)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition ${
                        selectedSize === s
                          ? "bg-navy-900 text-amber-300 border-navy-900"
                          : "bg-white text-navy-900 border-slate-300 hover:border-navy-700"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {product.available_colors.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Select Colour</p>
                <div className="flex flex-wrap gap-2">
                  {product.available_colors.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setSelectedColor(c)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition ${
                        selectedColor === c
                          ? "bg-navy-900 text-amber-300 border-navy-900"
                          : "bg-white text-navy-900 border-slate-300 hover:border-navy-700"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Quantity & Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <div className="inline-flex items-center rounded-xl border border-slate-300 bg-white">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="p-3 text-navy-900 hover:bg-slate-100 rounded-l-xl"
              >
                <Minus className="h-4 w-4" />
              </button>
              <input
                type="number"
                min={1}
                max={Math.max(1, maxStock)}
                value={qty}
                onChange={(e) => setQty(Math.max(1, Math.min(maxStock || 1, Number(e.target.value) || 1)))}
                className="w-16 text-center text-sm font-bold text-navy-900 focus:outline-none"
              />
              <button
                type="button"
                disabled={qty >= maxStock}
                onClick={() => setQty((q) => Math.min(maxStock, q + 1))}
                className="p-3 text-navy-900 hover:bg-slate-100 rounded-r-xl disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              disabled={!product.in_stock || adding}
              onClick={() => handleAddToCart(false)}
              className="flex-1 min-w-[160px] inline-flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-navy-900 text-white font-bold text-sm hover:bg-navy-800 disabled:opacity-45 shadow"
            >
              <ShoppingBag className="h-4 w-4 text-amber-400" />
              {adding ? "Adding..." : "Add to Cart"}
            </button>

            <button
              type="button"
              disabled={!product.in_stock || adding}
              onClick={() => handleAddToCart(true)}
              className="py-3 px-5 rounded-xl bg-amber-500 text-navy-950 font-bold text-sm hover:bg-amber-400 disabled:opacity-45 shadow"
            >
              Buy Now
            </button>
          </div>

          {msg && (
            <div
              className={`rounded-xl px-4 py-3 text-xs font-semibold border ${
                msg.err
                  ? "bg-rose-50 text-rose-700 border-rose-200"
                  : "bg-emerald-50 text-emerald-800 border-emerald-200"
              }`}
            >
              {msg.text}
            </div>
          )}

          {/* Product Specifications */}
          <div className="rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-navy-900 flex items-center justify-between">
              <span>Textile Specifications</span>
              <ShieldCheck className="h-4 w-4 text-amber-600" />
            </div>
            <div className="divide-y divide-slate-100 text-xs">
              <div className="px-4 py-2.5 flex justify-between">
                <span className="text-slate-500">Fabric / Material</span>
                <span className="font-semibold text-navy-900">{product.fabric_type || "Standard Textile"}</span>
              </div>
              <div className="px-4 py-2.5 flex justify-between">
                <span className="text-slate-500">Brand / Mill</span>
                <span className="font-semibold text-navy-900">{product.brand || "Sri Vasavi Textiles"}</span>
              </div>
              <div className="px-4 py-2.5 flex justify-between">
                <span className="text-slate-500">HSN Code & GST</span>
                <span className="font-semibold text-navy-900">{product.hsn_code || "5007"} • {Number(product.gst_rate)}% GST</span>
              </div>
              {product.specifications &&
                Object.entries(product.specifications).map(([k, v]) => (
                  <div key={k} className="px-4 py-2.5 flex justify-between">
                    <span className="text-slate-500">{k}</span>
                    <span className="font-semibold text-navy-900">{String(v)}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

