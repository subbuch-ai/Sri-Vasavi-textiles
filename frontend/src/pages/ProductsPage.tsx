import React, { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Edit2, FolderPlus, Image as ImageIcon, Plus, Search, Trash2 } from "lucide-react";
import { EmptyState } from "../components/common/EmptyState";
import { Modal } from "../components/common/Modal";
import { StatusBadge } from "../components/common/StatusBadge";
import { usePermission } from "../hooks/usePermission";
import { api, extractErrorMessage } from "../services/api";
import { Category, PaginatedResponse, Product } from "../types/erp";
import { formatINR, formatQty } from "../utils/formatters";
import { stripLeadingZeroProps } from "../utils/numberInput";

interface ProductForm {
  product_code?: string;
  name: string;
  category_id: number;
  brand?: string;
  description?: string;
  size?: string;
  color?: string;
  fabric_type?: string;
  hsn_code?: string;
  unit: string;
  purchase_price: number;
  wholesale_price: number;
  retail_price: number;
  gst_rate: number;
  barcode?: string;
  initial_stock: number;
  min_stock_level: number;
}

export const ProductsPage: React.FC = () => {
  const { hasPermission } = usePermission();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  const [prodModalOpen, setProdModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catName, setCatName] = useState("");
  const [catDesc, setCatDesc] = useState("");

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<ProductForm>();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page_size: "100" });
      if (search.trim()) params.set("search", search.trim());
      if (selectedCategory) params.set("category_id", selectedCategory);
      const [pRes, cRes] = await Promise.all([
        api.get<PaginatedResponse<Product>>(`/products?${params.toString()}`),
        api.get<Category[]>("/categories"),
      ]);
      setProducts(pRes.data.items);
      setCategories(cRes.data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [search, selectedCategory]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openCreateModal = () => {
    setModalError(null);
    setEditingProduct(null);
    reset({
      name: "",
      category_id: categories[0]?.id || 1,
      unit: "PCS",
      purchase_price: 0,
      wholesale_price: 0,
      retail_price: 0,
      gst_rate: 5,
      initial_stock: 0,
      min_stock_level: 10,
    });
    setProdModalOpen(true);
  };

  const openEditModal = (p: Product) => {
    setModalError(null);
    setEditingProduct(p);
    reset({
      product_code: p.product_code,
      name: p.name,
      category_id: p.category_id,
      brand: p.brand || "",
      description: p.description || "",
      size: p.size || "",
      color: p.color || "",
      fabric_type: p.fabric_type || "",
      hsn_code: p.hsn_code || "",
      unit: p.unit,
      purchase_price: Number(p.purchase_price),
      wholesale_price: Number(p.wholesale_price),
      retail_price: Number(p.retail_price),
      gst_rate: Number(p.gst_rate),
      barcode: p.barcode || "",
      initial_stock: Number(p.current_stock),
      min_stock_level: Number(p.min_stock_level),
    });
    setProdModalOpen(true);
  };

  const onSaveProduct = async (data: ProductForm) => {
    setError(null);
    setModalError(null);
    const wholesalePrice = Number(data.wholesale_price);
    const retailPrice = Number(data.retail_price);
    if (wholesalePrice >= retailPrice) {
      setModalError("Wholesale Price must be lower than Retail Price so wholesale and retail customers receive different rates.");
      return;
    }
    try {
      const payload = {
        ...data,
        category_id: Number(data.category_id),
        purchase_price: Number(data.purchase_price),
        wholesale_price: wholesalePrice,
        retail_price: retailPrice,
        gst_rate: Number(data.gst_rate),
        min_stock_level: Number(data.min_stock_level),
        initial_stock: Number(data.initial_stock || 0),
        barcode: data.barcode?.trim() || null,
        product_code: data.product_code?.trim() || undefined,
      };
      if (editingProduct) {
        await api.patch(`/products/${editingProduct.id}`, payload);
      } else {
        await api.post("/products", payload);
      }
      setProdModalOpen(false);
      await loadData();
    } catch (err) {
      setModalError(extractErrorMessage(err));
    }
  };

  const handleUploadImage = async (productId: number, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    try {
      await api.post(`/products/${productId}/image`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await loadData();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const handleDelete = async (p: Product) => {
    if (!window.confirm(`Deactivate product '${p.name}'?`)) return;
    try {
      await api.delete(`/products/${p.id}`);
      await loadData();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/categories", { name: catName, description: catDesc || null });
      setCatName("");
      setCatDesc("");
      setCatModalOpen(false);
      await loadData();
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-navy-900">Textile Products & Categories</h2>
          <p className="text-xs text-slate-500">Manage sarees, garments, fabrics, HSN codes, GST rates, and wholesale/retail pricing</p>
        </div>
        <div className="flex items-center gap-2">
          {hasPermission("products:create") && (
            <>
              <button onClick={() => setCatModalOpen(true)} className="btn-secondary">
                <FolderPlus className="h-4 w-4" /> New Category
              </button>
              <button onClick={openCreateModal} className="btn-primary">
                <Plus className="h-4 w-4" /> Add Product
              </button>
            </>
          )}
        </div>
      </div>

      {error && <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">{error}</div>}

      <div className="card p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, SKU, barcode, brand, fabric..."
            className="input-field pl-9"
          />
        </div>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="input-field w-auto min-w-[180px]"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Product</th>
                <th className="px-4 py-3 text-left">Category / Specs</th>
                <th className="px-4 py-3 text-right">Purchase</th>
                <th className="px-4 py-3 text-right">Wholesale</th>
                <th className="px-4 py-3 text-right">Retail</th>
                <th className="px-4 py-3 text-center">GST</th>
                <th className="px-4 py-3 text-right">Stock</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={8} className="py-8 text-center text-xs text-slate-500">Loading products...</td></tr>
              ) : products.length === 0 ? (
                <tr><td colSpan={8}><EmptyState title="No products found" description="Add your first textile SKU to get started." /></td></tr>
              ) : (
                products.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {p.image_url ? (
                          <img src={p.image_url} alt={p.name} className="h-10 w-10 rounded-lg object-cover border" />
                        ) : (
                          <div className="h-10 w-10 rounded-lg bg-navy-50 text-navy-600 flex items-center justify-center text-xs font-bold">
                            {p.name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="font-semibold text-navy-900">{p.name}</p>
                          <p className="text-xs text-slate-400">
                            {p.product_code} {p.barcode ? `• ${p.barcode}` : ""} {p.hsn_code ? `• HSN ${p.hsn_code}` : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      <p className="font-medium text-slate-800">{p.category_name}</p>
                      <p>{[p.brand, p.fabric_type, p.size, p.color].filter(Boolean).join(" • ") || "-"}</p>
                    </td>
                    <td className="px-4 py-3 text-right text-xs">{formatINR(p.purchase_price)}</td>
                    <td className="px-4 py-3 text-right text-xs font-semibold text-navy-700">{formatINR(p.wholesale_price)}</td>
                    <td className="px-4 py-3 text-right text-xs font-semibold text-emerald-700">{formatINR(p.retail_price)}</td>
                    <td className="px-4 py-3 text-center text-xs">{Number(p.gst_rate)}%</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-xs font-bold ${p.is_low_stock ? "text-rose-600" : "text-slate-800"}`}>
                        {formatQty(p.current_stock)} {p.unit}
                      </span>
                      {p.is_low_stock && <div className="mt-0.5"><StatusBadge status="LOW_STOCK" /></div>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        {hasPermission("products:edit") && (
                          <>
                            <label className="p-1.5 rounded hover:bg-slate-100 cursor-pointer text-slate-500" title="Upload Image">
                              <ImageIcon className="h-4 w-4" />
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) handleUploadImage(p.id, f);
                                }}
                              />
                            </label>
                            <button onClick={() => openEditModal(p)} className="p-1.5 rounded hover:bg-slate-100 text-navy-700" title="Edit">
                              <Edit2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                        {hasPermission("products:delete") && (
                          <button onClick={() => handleDelete(p)} className="p-1.5 rounded hover:bg-rose-50 text-rose-600" title="Deactivate">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Product Modal */}
      <Modal
        open={prodModalOpen}
        onClose={() => setProdModalOpen(false)}
        title={editingProduct ? `Edit Product — ${editingProduct.product_code}` : "Add New Textile Product"}
        maxWidthClass="max-w-3xl md:max-w-4xl"
        headerClassName="px-4 py-3 sm:px-6 sm:py-3"
        bodyClassName="p-4 sm:px-6 sm:py-3.5 md:[&_.input-field]:py-1.5"
      >
        <form onSubmit={handleSubmit(onSaveProduct)} className="space-y-4 md:space-y-2.5 md:[&_.input-field]:py-1.5">
          {modalError && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">
              {modalError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-3">
            <div className="sm:col-span-2">
              <label className="label-text">Product Name *</label>
              <input className="input-field" placeholder="e.g. Kanchipuram Silk Saree Gold Zari" {...register("name", { required: true })} />
            </div>
            <div>
              <label className="label-text">Category *</label>
              <select className="input-field" {...register("category_id", { required: true })}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 md:gap-3">
            <div>
              <label className="label-text">Brand / Mill</label>
              <input className="input-field" placeholder="e.g. Raymond / Own" {...register("brand")} />
            </div>
            <div>
              <label className="label-text">Fabric Type</label>
              <input className="input-field" placeholder="Pure Silk / Cotton" {...register("fabric_type")} />
            </div>
            <div>
              <label className="label-text">Size</label>
              <input className="input-field" placeholder="M, L, XL, 6.2m" {...register("size")} />
            </div>
            <div>
              <label className="label-text">Color</label>
              <input className="input-field" placeholder="Royal Blue / Gold" {...register("color")} />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 md:gap-3">
            <div>
              <label className="label-text">HSN Code</label>
              <input className="input-field" placeholder="5007 / 6205" {...register("hsn_code")} />
            </div>
            <div>
              <label className="label-text">Unit</label>
              <select className="input-field" {...register("unit")}>
                <option value="PCS">PCS</option>
                <option value="MTR">MTR</option>
                <option value="SET">SET</option>
                <option value="BOX">BOX</option>
                <option value="BUNDLE">BUNDLE</option>
              </select>
            </div>
            <div>
              <label className="label-text">Barcode (Optional)</label>
              <input className="input-field" placeholder="Scan or type barcode" {...register("barcode")} />
            </div>
            <div>
              <label className="label-text">GST Rate (%)</label>
              <select className="input-field" {...register("gst_rate")}>
                <option value="0">0%</option>
                <option value="5">5%</option>
                <option value="12">12%</option>
                <option value="18">18%</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 md:gap-3">
            <div>
              <label className="label-text">Purchase Price (₹)</label>
              <input type="number" step="0.01" className="input-field" {...stripLeadingZeroProps} {...register("purchase_price", { required: true })} />
            </div>
            <div>
              <label className="label-text">Wholesale Price (₹)</label>
              <input type="number" step="0.01" className="input-field" {...stripLeadingZeroProps} {...register("wholesale_price", { required: true })} />
            </div>
            <div>
              <label className="label-text">Retail Price (₹)</label>
              <input type="number" step="0.01" className="input-field" {...stripLeadingZeroProps} {...register("retail_price", { required: true })} />
            </div>
            {!editingProduct && (
              <div>
                <label className="label-text">Opening Stock</label>
                <input type="number" step="0.01" className="input-field" {...stripLeadingZeroProps} {...register("initial_stock")} />
              </div>
            )}
            <div>
              <label className="label-text">Min Stock Level</label>
              <input type="number" step="0.01" className="input-field" {...stripLeadingZeroProps} {...register("min_stock_level")} />
            </div>
          </div>

          <div>
            <label className="label-text">Description</label>
            <textarea rows={2} className="input-field md:h-11" {...register("description")} />
          </div>

          <div className="flex justify-end gap-2 pt-2 md:pt-1">
            <button type="button" onClick={() => setProdModalOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? "Saving..." : editingProduct ? "Update Product" : "Create Product"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Category Modal */}
      <Modal open={catModalOpen} onClose={() => setCatModalOpen(false)} title="Create Product Category" maxWidthClass="max-w-md">
        <form onSubmit={handleCreateCategory} className="space-y-4">
          <div>
            <label className="label-text">Category Name *</label>
            <input required value={catName} onChange={(e) => setCatName(e.target.value)} className="input-field" placeholder="e.g. Bridal Lehengas" />
          </div>
          <div>
            <label className="label-text">Description</label>
            <textarea rows={2} value={catDesc} onChange={(e) => setCatDesc(e.target.value)} className="input-field" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCatModalOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Create Category</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

