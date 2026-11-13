import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Filter, RotateCcw, Search } from "lucide-react";
import { StoreProductCard } from "../../components/store/StoreProductCard";
import { useStoreAuth } from "../../context/StoreAuthContext";
import { extractErrorMessage } from "../../services/api";
import { storeApi } from "../../services/storeApi";
import { PaginatedResponse } from "../../types/erp";
import { StoreProduct } from "../../types/storefront";

export const StoreCatalogPage: React.FC = () => {
  const { categories, customer, refreshCart } = useStoreAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [categoryId, setCategoryId] = useState(searchParams.get("category") || "");
  const [minPrice, setMinPrice] = useState(searchParams.get("min_price") || "");
  const [maxPrice, setMaxPrice] = useState(searchParams.get("max_price") || "");
  const [size, setSize] = useState(searchParams.get("size") || "");
  const [color, setColor] = useState(searchParams.get("color") || "");
  const [sort, setSort] = useState(searchParams.get("sort") || "newest");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [page, setPage] = useState(Number(searchParams.get("page") || 1));

  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);

  useEffect(() => {
    setSearch(searchParams.get("search") || "");
    setCategoryId(searchParams.get("category") || "");
  }, [searchParams]);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: "12",
        sort,
      });
      if (search.trim()) params.set("search", search.trim());
      if (categoryId) params.set("category_id", categoryId);
      if (minPrice) params.set("min_price", minPrice);
      if (maxPrice) params.set("max_price", maxPrice);
      if (size.trim()) params.set("size", size.trim());
      if (color.trim()) params.set("color", color.trim());
      if (inStockOnly) params.set("in_stock_only", "true");
      if (searchParams.get("featured") === "true") params.set("featured", "true");
      if (searchParams.get("new_arrival") === "true") params.set("new_arrival", "true");
      if (searchParams.get("best_seller") === "true") params.set("best_seller", "true");

      const res = await storeApi.get<PaginatedResponse<StoreProduct>>(`/products?${params.toString()}`);
      setProducts(res.data.items);
      setTotal(res.data.total);
      setTotalPages(Math.max(1, res.data.total_pages));
    } catch (err) {
      setToast({ msg: extractErrorMessage(err), err: true });
    } finally {
      setLoading(false);
    }
  }, [page, sort, search, categoryId, minPrice, maxPrice, size, color, inStockOnly, searchParams]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleReset = () => {
    setSearch("");
    setCategoryId("");
    setMinPrice("");
    setMaxPrice("");
    setSize("");
    setColor("");
    setSort("newest");
    setInStockOnly(false);
    setPage(1);
    setSearchParams({});
  };

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
      setToast({ msg: `${product.name} added to cart.` });
    } catch (err) {
      setToast({ msg: extractErrorMessage(err), err: true });
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
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

      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-amber-700">
            Sri Vasavi Textiles Catalogue
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-navy-900">
            Explore Our Textile Collection
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Showing {products.length} of {total} active products with real-time stock availability
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-600">Sort by:</label>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-navy-900"
          >
            <option value="newest">Newest First</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="name_asc">Name: A to Z</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Sidebar Filters */}
        <aside className="lg:col-span-3 rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-navy-900 flex items-center gap-2">
              <Filter className="h-4 w-4 text-amber-600" /> Filters
            </h2>
            <button
              type="button"
              onClick={handleReset}
              className="text-xs font-semibold text-slate-500 hover:text-navy-900 inline-flex items-center gap-1"
            >
              <RotateCcw className="h-3 w-3" /> Reset
            </button>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Search</label>
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Saree, shirt, brand..."
                className="w-full rounded-xl border border-slate-300 pl-8 pr-3 py-2 text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Category</label>
            <select
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Min ₹</label>
              <input
                type="number"
                min={0}
                value={minPrice}
                onChange={(e) => {
                  setMinPrice(e.target.value);
                  setPage(1);
                }}
                placeholder="0"
                className="w-full rounded-xl border border-slate-300 px-2.5 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Max ₹</label>
              <input
                type="number"
                min={0}
                value={maxPrice}
                onChange={(e) => {
                  setMaxPrice(e.target.value);
                  setPage(1);
                }}
                placeholder="50000"
                className="w-full rounded-xl border border-slate-300 px-2.5 py-2 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Size</label>
              <input
                type="text"
                value={size}
                onChange={(e) => {
                  setSize(e.target.value);
                  setPage(1);
                }}
                placeholder="M, L, XL..."
                className="w-full rounded-xl border border-slate-300 px-2.5 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Colour</label>
              <input
                type="text"
                value={color}
                onChange={(e) => {
                  setColor(e.target.value);
                  setPage(1);
                }}
                placeholder="Gold, Blue..."
                className="w-full rounded-xl border border-slate-300 px-2.5 py-2 text-xs"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-navy-900 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(e) => {
                setInStockOnly(e.target.checked);
                setPage(1);
              }}
              className="rounded border-slate-300 text-navy-900"
            />
            In Stock Only
          </label>
        </aside>

        {/* Product Grid + Pagination */}
        <div className="lg:col-span-9 space-y-6">
          {loading ? (
            <div className="py-20 text-center text-sm text-slate-500">Loading products...</div>
          ) : products.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center space-y-3">
              <p className="text-base font-bold text-navy-900">No textiles match your current filters</p>
              <p className="text-xs text-slate-500">Try clearing filters or searching for another fabric or category.</p>
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2 rounded-xl bg-navy-900 text-white text-xs font-semibold"
              >
                Show All Products
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {products.map((p) => (
                <StoreProductCard
                  key={p.id}
                  product={p}
                  onQuickAdd={handleQuickAdd}
                  adding={addingId === p.id}
                />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-xs font-semibold text-slate-600 px-3">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

