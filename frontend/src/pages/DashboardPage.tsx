import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  ClipboardList,
  Factory,
  IndianRupee,
  Package,
  Receipt,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { KpiCard } from "../components/common/KpiCard";
import { StatusBadge } from "../components/common/StatusBadge";
import { api, extractErrorMessage } from "../services/api";
import { DashboardOverview } from "../types/erp";
import { formatDate, formatINR, formatQty } from "../utils/formatters";

const COLORS = ["#1b3664", "#c89624", "#059669", "#7c3aed", "#dc2626", "#0284c7", "#d97706"];

export const DashboardPage: React.FC = () => {
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<DashboardOverview>("/dashboard/overview");
      setData(res.data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  if (loading) {
    return <div className="card p-10 text-center text-sm text-slate-500">Loading real-time ERP analytics...</div>;
  }

  if (error || !data) {
    return (
      <div className="card p-6 text-center space-y-3">
        <p className="text-sm text-rose-600">{error || "Failed to load dashboard."}</p>
        <button onClick={loadDashboard} className="btn-secondary">Retry</button>
      </div>
    );
  }

  const { kpis } = data;
  const toNum = (v: number | string | null | undefined) => Number(v ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-navy-900">Executive Business Dashboard</h2>
          <p className="text-xs text-slate-500">Live operational, inventory, and financial intelligence from PostgreSQL</p>
        </div>
        <button onClick={loadDashboard} className="btn-secondary text-xs">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh Data
        </button>
      </div>

      {/* 14 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        <KpiCard title="Total Sales Today" value={formatINR(kpis.total_sales_today)} icon={IndianRupee} accent="navy" />
        <KpiCard title="Sales This Month" value={formatINR(kpis.total_sales_this_month)} icon={TrendingUp} accent="gold" />
        <KpiCard title="Total Purchases" value={formatINR(kpis.total_purchases)} icon={ShoppingBag} accent="navy" />
        <KpiCard title="Total Revenue (Net)" value={formatINR(kpis.total_revenue)} icon={Wallet} accent="emerald" />
        {kpis.total_expenses !== null && kpis.total_expenses !== undefined && (
          <KpiCard title="Total Expenses" value={formatINR(kpis.total_expenses)} icon={Receipt} accent="rose" />
        )}
        {kpis.gross_profit !== null && kpis.gross_profit !== undefined && (
          <KpiCard title="Gross Profit" value={formatINR(kpis.gross_profit)} icon={TrendingUp} accent="emerald" />
        )}
        {kpis.net_profit !== null && kpis.net_profit !== undefined && (
          <KpiCard title="Net Profit" value={formatINR(kpis.net_profit)} icon={IndianRupee} accent={Number(kpis.net_profit) >= 0 ? "emerald" : "rose"} />
        )}
        <KpiCard title="Total Customers" value={String(kpis.total_customers)} icon={Users} accent="navy" />
        <KpiCard title="Total Suppliers" value={String(kpis.total_suppliers)} icon={Factory} accent="navy" />
        <KpiCard title="Total Products" value={String(kpis.total_products)} icon={Package} accent="gold" />
        <KpiCard title="Total Stock Value" value={formatINR(kpis.total_stock_value)} icon={Boxes} accent="navy" />
        <KpiCard title="Pending Orders" value={String(kpis.pending_orders)} icon={ClipboardList} accent="amber" />
        <KpiCard title="Customer Outstanding" value={formatINR(kpis.customer_outstanding)} icon={ArrowDownLeft} accent="amber" />
        <KpiCard title="Supplier Outstanding" value={formatINR(kpis.supplier_outstanding)} icon={ArrowUpRight} accent="rose" />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h3 className="text-sm font-bold text-navy-900 mb-4">1. Monthly Sales Analysis</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.monthly_sales.map((d) => ({ name: d.label, Sales: toNum(d.value) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(val: number) => formatINR(val)} />
                <Bar dataKey="Sales" fill="#1b3664" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-bold text-navy-900 mb-4">2. Monthly Purchase Analysis</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.monthly_purchases.map((d) => ({ name: d.label, Purchases: toNum(d.value) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(val: number) => formatINR(val)} />
                <Bar dataKey="Purchases" fill="#c89624" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {data.profit_loss_series.length > 0 && (
          <div className="card p-5 lg:col-span-2">
            <h3 className="text-sm font-bold text-navy-900 mb-4">3. Profit & Loss Analysis</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={data.profit_loss_series.map((d) => ({
                    name: d.label,
                    Revenue: toNum(d.value),
                    "COGS + Expenses": toNum(d.secondary_value),
                    "Net Profit": toNum(d.tertiary_value),
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(val: number) => formatINR(val)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="Revenue" stroke="#1b3664" strokeWidth={2.5} />
                  <Line type="monotone" dataKey="COGS + Expenses" stroke="#dc2626" strokeWidth={2} />
                  <Line type="monotone" dataKey="Net Profit" stroke="#059669" strokeWidth={2.5} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className="card p-5">
          <h3 className="text-sm font-bold text-navy-900 mb-4">4. Wholesale vs Retail Sales</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.wholesale_vs_retail.map((d) => ({ name: d.label, value: toNum(d.value) }))}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {data.wholesale_vs_retail.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(val: number) => formatINR(val)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Charts Row 3 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card p-5">
          <h3 className="text-sm font-bold text-navy-900 mb-4">5. Top-Selling Products</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={data.top_selling_products.map((d) => ({ name: d.label, Revenue: toNum(d.value) }))}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(val: number) => formatINR(val)} />
                <Bar dataKey="Revenue" fill="#1b3664" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-bold text-navy-900 mb-4">6. Sales by Product Category</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.sales_by_category.map((d) => ({ name: d.label, value: toNum(d.value) }))}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={78}
                >
                  {data.sales_by_category.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(val: number) => formatINR(val)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-bold text-navy-900 mb-4">7. Daily Revenue Trends (14 Days)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.daily_revenue_trends.map((d) => ({ name: d.label, Revenue: toNum(d.value) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(val: number) => formatINR(val)} />
                <Area type="monotone" dataKey="Revenue" stroke="#c89624" fill="#faecc5" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom Tables: Recent Transactions & Low Stock Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-navy-900">Recent Transactions</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 text-left">Ref</th>
                  <th className="px-4 py-2.5 text-left">Details</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                  <th className="px-4 py-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.recent_transactions.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-xs text-slate-500">
                      No transactions recorded yet.
                    </td>
                  </tr>
                ) : (
                  data.recent_transactions.map((tx) => (
                    <tr key={`${tx.type}-${tx.id}`} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <p className="font-semibold text-navy-900 text-xs">{tx.reference}</p>
                        <p className="text-[11px] text-slate-400">{formatDate(tx.date)}</p>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-700 max-w-[200px] truncate">{tx.party}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-xs">{formatINR(tx.amount)}</td>
                      <td className="px-4 py-2.5 text-center">
                        <StatusBadge status={tx.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600" />
            <h3 className="text-sm font-bold text-navy-900">Low Stock Alerts</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 text-left">Product</th>
                  <th className="px-4 py-2.5 text-left">Category</th>
                  <th className="px-4 py-2.5 text-right">Stock</th>
                  <th className="px-4 py-2.5 text-right">Min</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.low_stock_alerts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-xs text-slate-500">
                      All textile SKUs are above minimum stock levels.
                    </td>
                  </tr>
                ) : (
                  data.low_stock_alerts.map((item) => (
                    <tr key={item.id} className="hover:bg-rose-50/40">
                      <td className="px-4 py-2.5">
                        <p className="font-semibold text-navy-900 text-xs">{item.name}</p>
                        <p className="text-[11px] text-slate-400">{item.product_code}</p>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-600">{item.category_name}</td>
                      <td className="px-4 py-2.5 text-right text-xs font-bold text-rose-600">
                        {formatQty(item.current_stock)} {item.unit}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-slate-500">
                        {formatQty(item.min_stock_level)} {item.unit}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

