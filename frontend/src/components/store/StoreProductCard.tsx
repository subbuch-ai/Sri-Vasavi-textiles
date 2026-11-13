import React from "react";
import { Link } from "react-router-dom";
import { Award, CheckCircle2, ShoppingBag, Sparkles, Tag } from "lucide-react";
import { StoreProduct } from "../../types/storefront";
import { formatINR } from "../../utils/formatters";

interface StoreProductCardProps {
  product: StoreProduct;
  onQuickAdd?: (product: StoreProduct) => void;
  adding?: boolean;
}

export const StoreProductCard: React.FC<StoreProductCardProps> = ({
  product,
  onQuickAdd,
  adding = false,
}) => {
  const retail = Number(product.retail_price);
  const wholesale =
    product.wholesale_price !== null && product.wholesale_price !== undefined
      ? Number(product.wholesale_price)
      : null;

  const primaryImg =
    product.image_url ||
    product.images?.find((im) => im.is_primary)?.image_url ||
    product.images?.[0]?.image_url;

  return (
    <div className="group flex flex-col bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-sm hover:shadow-xl hover:border-amber-300/80 transition-all duration-300">
      <Link to={`/shop/product/${product.id}`} className="relative aspect-[4/3] bg-slate-100 overflow-hidden">
        {primaryImg ? (
          <img
            src={primaryImg}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-slate-100 to-amber-50 text-navy-800/70">
            <Sparkles className="h-8 w-8 text-amber-500 mb-1.5" />
            <span className="text-[11px] font-semibold uppercase tracking-widest">
              {product.category_name}
            </span>
          </div>
        )}

        <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5">
          {product.is_new_arrival && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-navy-900 text-amber-300 shadow">
              New
            </span>
          )}
          {product.is_best_seller && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-amber-500 text-navy-950 shadow flex items-center gap-1">
              <Award className="h-2.5 w-2.5" /> Best Seller
            </span>
          )}
          {product.is_featured && !product.is_new_arrival && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-white/95 text-navy-900 border border-amber-300">
              Featured
            </span>
          )}
        </div>

        {!product.in_stock && (
          <div className="absolute inset-0 bg-slate-900/55 flex items-center justify-center">
            <span className="px-3 py-1 rounded-full bg-white text-slate-900 text-xs font-bold uppercase tracking-wider">
              Out of Stock
            </span>
          </div>
        )}
      </Link>

      <div className="p-4 flex-1 flex flex-col justify-between gap-3">
        <div>
          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 mb-1">
            <span className="font-semibold uppercase tracking-wider text-amber-700">
              {product.category_name}
            </span>
            {product.fabric_type && <span className="truncate">{product.fabric_type}</span>}
          </div>

          <Link
            to={`/shop/product/${product.id}`}
            className="font-semibold text-sm text-navy-900 group-hover:text-amber-700 line-clamp-2 leading-snug"
          >
            {product.name}
          </Link>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
            {product.available_sizes.length > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                Sizes: {product.available_sizes.slice(0, 3).join(", ")}
                {product.available_sizes.length > 3 ? "+" : ""}
              </span>
            )}
            {product.available_colors.length > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                {product.available_colors.slice(0, 2).join(", ")}
              </span>
            )}
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100 space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <p className="text-base font-bold text-navy-900">
                {formatINR(retail)}
                <span className="text-[11px] font-normal text-slate-500"> / {product.unit}</span>
              </p>
              {wholesale !== null ? (
                <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1 mt-0.5">
                  <Tag className="h-3 w-3" />
                  Wholesale: {formatINR(wholesale)} (Min {Number(product.wholesale_min_qty)}{" "}
                  {product.unit})
                </p>
              ) : product.wholesale_eligible ? (
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Wholesale B2B rates available on trade approval
                </p>
              ) : null}
            </div>
            <div className="text-right">
              {product.in_stock ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" /> {Number(product.available_stock)} left
                </span>
              ) : (
                <span className="text-[11px] font-medium text-rose-600">Restocking soon</span>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <Link
              to={`/shop/product/${product.id}`}
              className="flex-1 text-center py-2 px-3 rounded-xl border border-slate-200 text-xs font-semibold text-navy-900 hover:bg-slate-50 transition"
            >
              Details
            </Link>
            {onQuickAdd && (
              <button
                type="button"
                disabled={!product.in_stock || adding}
                onClick={() => onQuickAdd(product)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-navy-900 text-white text-xs font-semibold hover:bg-navy-800 disabled:opacity-45 transition"
              >
                <ShoppingBag className="h-3.5 w-3.5 text-amber-400" />
                {adding ? "Adding..." : "Add to Cart"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

