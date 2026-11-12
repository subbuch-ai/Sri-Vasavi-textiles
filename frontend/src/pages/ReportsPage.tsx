import React, { useEffect, useMemo, useState } from "react";
import { BarChart3, Download, FileSpreadsheet, FileText, Filter, RefreshCw, Search, Wallet } from "lucide-react";
import { api, extractErrorMessage } from "../services/api";
import { usePermission } from "../hooks/usePermission";
import { Account, Category, Customer, PaginatedResponse, ReportData } from "../types/erp";
import { User } from "../types/auth";
import { downloadAuthenticatedFile } from "../utils/download";
import { formatINR, todayISO } from "../utils/formatters";
import { CollectInvoicePaymentModal, PaymentSettlementTarget } from "../components/common/CollectInvoicePaymentModal";
import { EmptyState } from "../components/common/EmptyState";
import { StatusBadge } from "../components/common/StatusBadge";

interface ReportCatalogItem {
  key: string;
  label: string;
  group: "Sales" | "Purchase & Inventory" | "Finance & Audit";
  description: string;
  supportsCategory?: boolean;
  supportsUser?: boolean;
  supportsCustomer?: boolean;
  requiresFinancial?: boolean;
  requiresAudit?: boolean;
}

const REPORT_CATALOG: ReportCatalogItem[] = [
  { key: "daily_sales", label: "Daily Sales Report", group: "Sales", description: "Detailed confirmed invoices over selected date range." },
  { key: "monthly_sales", label: "Monthly Sales Report", group: "Sales", description: "Month-by-month sales, GST, and collection breakdown." },
  { key: "yearly_sales", label: "Yearly Sales Report", group: "Sales", description: "Annual sales totals and net collection performance." },
  { key: "wholesale_sales", label: "Wholesale Sales Report", group: "Sales", description: "B2B wholesale invoices, balances, and GST summary." },
  { key: "retail_sales", label: "Retail Sales Report", group: "Sales", description: "Walk-in retail invoices and daily billing totals." },
  { key: "purchase_report", label: "Purchase Report", group: "Purchase & Inventory", description: "Supplier purchase bills, taxes, transport, and dues." },
  { key: "product_performance", label: "Product Performance", group: "Purchase & Inventory", description: "Units sold, revenue, COGS, and gross margin per item.", supportsCategory: true },
  { key: "inventory_report", label: "Inventory Valuation", group: "Purchase & Inventory", description: "Current stock levels and valuation at cost price.", supportsCategory: true },
  { key: "low_stock_report", label: "Low Stock Alerts", group: "Purchase & Inventory", description: "Items at or below minimum stock reorder threshold.", supportsCategory: true },
  { key: "customer_outstanding", label: "Customer Outstanding", group: "Finance & Audit", description: "Receivables and pending balances from customers." },
  { key: "customer_statement", label: "Customer Statement (Ledger)", group: "Finance & Audit", description: "Individual customer details, debit (billed), credit (paid), running balance & totals.", supportsCustomer: true },
  { key: "supplier_outstanding", label: "Supplier Outstanding", group: "Finance & Audit", description: "Payables and pending supplier balances." },
  { key: "expense_report", label: "Expense Report", group: "Finance & Audit", description: "Operating expenses by category and approval status.", requiresFinancial: true },
  { key: "profit_and_loss", label: "Profit & Loss Statement", group: "Finance & Audit", description: "Accrual P&L: Net Sales, COGS, Gross & Net Profit.", requiresFinancial: true },
  { key: "payment_collection", label: "Payment Collection Report", group: "Finance & Audit", description: "Inbound collections and outbound supplier payouts by mode.", requiresFinancial: true },
  { key: "employee_activity", label: "Employee Activity Report", group: "Finance & Audit", description: "User and employee ERP audit trail across modules.", supportsUser: true, requiresAudit: true },
];

const CURRENCY_KEYS = new Set([
  "subtotal",
  "total_subtotal",
  "total_tax",
  "total_sales",
  "total_paid",
  "total_pending",
  "total_purchases",
  "total_revenue",
  "total_cogs",
  "total_margin",
  "total_stock_value",
  "total_outstanding",
  "opening_balance",
  "total_debit",
  "total_credit",
  "outstanding_balance",
  "total_billed",
  "total_expenses",
  "approved_expenses",
  "gross_sales",
  "sales_returns",
  "net_sales",
  "cogs",
  "gross_profit",
  "operating_expenses",
  "net_profit",
  "total_inbound",
  "total_outbound",
  "net_cashflow",
]);

function formatSummaryLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\bcogs\b/i, "COGS")
    .replace(/\bgst\b/i, "GST")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatSummaryValue(key: string, val: number | string): string {
  if (typeof val === "string") return val;
  if (CURRENCY_KEYS.has(key.toLowerCase())) {
    return formatINR(val);
  }
  return Number.isInteger(val) ? val.toLocaleString("en-IN") : val.toFixed(2);
}

const CURRENCY_COL_HINTS = [
  "Subtotal",
  "GST",
  "Tax",
  "Transport",
  "Total",
  "Paid",
  "Pending",
  "Debit",
  "Credit",
  "Debit (Billed)",
  "Credit (Paid)",
  "Balance",
  "Revenue",
  "COGS",
  "Gross Margin",
  "Purchase Price",
  "Wholesale Price",
  "Retail Price",
  "Stock Value",
  "Opening",
  "Opening Balance",
  "Total Debit (Billed)",
  "Total Credit (Paid)",
  "Total Sales",
  "Total Purchases",
  "Payments",
  "Outstanding",
  "Amount",
];

function formatCellValue(col: string, val: string | number | undefined): string {
  if (val === undefined || val === null || val === "") return "-";
  if (typeof val === "number") {
    if (CURRENCY_COL_HINTS.some((hint) => col.toLowerCase() === hint.toLowerCase())) {
      return formatINR(val);
    }
    return Number.isInteger(val) ? val.toLocaleString("en-IN") : val.toFixed(2);
  }
  return String(val);
}

function monthStartISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export const ReportsPage: React.FC = () => {
  const { isOwner, hasPermission } = usePermission();

  const visibleReports = useMemo(
    () =>
      REPORT_CATALOG.filter((item) => {
        if (item.requiresFinancial && !isOwner && !hasPermission("reports:financial")) return false;
        if (item.requiresAudit && !isOwner && !hasPermission("audit:view")) return false;
        return true;
      }),
    [isOwner, hasPermission]
  );

  const [selectedType, setSelectedType] = useState<string>("daily_sales");
  const [startDate, setStartDate] = useState<string>(monthStartISO());
  const [endDate, setEndDate] = useState<string>(todayISO());
  const [categoryId, setCategoryId] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [customerId, setCustomerId] = useState<string>("");
  const [rowSearch, setRowSearch] = useState<string>("");

  const [categories, setCategories] = useState<Category[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [settlementTarget, setSettlementTarget] = useState<PaymentSettlementTarget | null>(null);

  const currentMeta = useMemo(
    () => visibleReports.find((r) => r.key === selectedType) || visibleReports[0],
    [visibleReports, selectedType]
  );

  useEffect(() => {
    if (visibleReports.length > 0 && !visibleReports.some((r) => r.key === selectedType)) {
      setSelectedType(visibleReports[0].key);
    }
  }, [visibleReports, selectedType]);

  useEffect(() => {
    api
      .get<Category[]>("/categories")
      .then((res) => setCategories(res.data))
      .catch(() => {});

    if (isOwner) {
      api
        .get<User[]>("/users")
        .then((res) => setUsers(res.data))
        .catch(() => {});
    }

    api
      .get<Account[]>("/accounts")
      .then((res) => setAccounts(res.data))
      .catch(() => {});

    api
      .get<PaginatedResponse<Customer>>("/customers?page_size=200")
      .then((res) => setCustomers(res.data.items))
      .catch(() => {});
  }, [isOwner]);

  const fetchReport = async (typeToLoad = selectedType) => {
    setLoading(true);
    setError(null);
    try {
      const meta = visibleReports.find((r) => r.key === typeToLoad);
      const params: Record<string, string | number> = {};
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      if (meta?.supportsCategory && categoryId) params.category_id = Number(categoryId);
      if (meta?.supportsUser && userId) params.user_id = Number(userId);
      if (meta?.supportsCustomer && customerId) params.customer_id = Number(customerId);

      const res = await api.get<ReportData>(`/reports/${typeToLoad}`, { params });
      setReport(res.data);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load report."));
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedType) {
      fetchReport(selectedType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedType, customerId]);

  const handleExport = async (format: "pdf" | "xlsx" | "csv") => {
    setExporting(format);
    setError(null);
    try {
      const qs = new URLSearchParams({ format });
      if (startDate) qs.set("start_date", startDate);
      if (endDate) qs.set("end_date", endDate);
      if (currentMeta?.supportsCategory && categoryId) qs.set("category_id", categoryId);
      if (currentMeta?.supportsUser && userId) qs.set("user_id", userId);
      if (currentMeta?.supportsCustomer && customerId) qs.set("customer_id", customerId);
      const selectedCust = currentMeta?.supportsCustomer && customerId
        ? customers.find((c) => String(c.id) === customerId)
        : null;
      const filename = selectedCust
        ? `Customer_Statement_${selectedCust.customer_code}.${format}`
        : `${selectedType}_${endDate || todayISO()}.${format}`;
      await downloadAuthenticatedFile(
        `/reports/${selectedType}/export?${qs.toString()}`,
        filename
      );
    } catch (err) {
      setError(extractErrorMessage(err, `Failed to export ${format.toUpperCase()} report.`));
    } finally {
      setExporting(null);
    }
  };

  const applyPreset = (preset: "today" | "month" | "fy") => {
    const now = new Date();
    const t = todayISO();
    if (preset === "today") {
      setStartDate(t);
      setEndDate(t);
    } else if (preset === "month") {
      setStartDate(monthStartISO());
      setEndDate(t);
    } else {
      const fyStartYear = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
      setStartDate(`${fyStartYear}-04-01`);
      setEndDate(t);
    }
  };

  const filteredRows = useMemo(() => {
    if (!report) return [];
    const q = rowSearch.trim().toLowerCase();
    if (!q) return report.rows;
    return report.rows.filter((row) =>
      Object.values(row).some((val) => String(val ?? "").toLowerCase().includes(q))
    );
  }, [report, rowSearch]);

  const groups: Array<ReportCatalogItem["group"]> = ["Sales", "Purchase & Inventory", "Finance & Audit"];
  const canExport = hasPermission("reports:export");
  const canCollectPayments = hasPermission("payments:create");
  const supportsSettlement =
    canCollectPayments &&
    ["daily_sales", "wholesale_sales", "retail_sales", "purchase_report", "customer_outstanding", "supplier_outstanding"].includes(
      selectedType
    );

  const resolveSettlementTarget = (row: Record<string, string | number>): PaymentSettlementTarget | null => {
    if (!canCollectPayments) return null;
    if (selectedType === "daily_sales" || selectedType === "wholesale_sales" || selectedType === "retail_sales") {
      const cid = Number(row._customer_id || 0);
      const sid = Number(row._sale_id || 0);
      const pending = Number(row.Pending || 0);
      const custOutstanding = Number(row._customer_outstanding ?? pending);
      if (cid > 0 && sid > 0 && pending > 0 && custOutstanding > 0) {
        return {
          partyType: "CUSTOMER",
          partyId: cid,
          partyName: String(row.Customer || ""),
          invoiceId: sid,
          invoiceNumber: String(row["Invoice No"] || ""),
          totalAmount: Number(row.Total || 0),
          paidAmount: Number(row.Paid || 0),
          pendingAmount: Number(Math.min(pending, custOutstanding).toFixed(2)),
        };
      }
    } else if (selectedType === "purchase_report") {
      const supId = Number(row._supplier_id || 0);
      const pid = Number(row._purchase_invoice_id || 0);
      const pending = Number(row.Pending || 0);
      const supOutstanding = Number(row._supplier_outstanding ?? pending);
      if (supId > 0 && pid > 0 && pending > 0 && supOutstanding > 0) {
        return {
          partyType: "SUPPLIER",
          partyId: supId,
          partyName: String(row.Supplier || ""),
          invoiceId: pid,
          invoiceNumber: String(row["Bill No"] || ""),
          totalAmount: Number(row.Total || 0),
          paidAmount: Number(row.Paid || 0),
          pendingAmount: Number(Math.min(pending, supOutstanding).toFixed(2)),
        };
      }
    } else if (selectedType === "customer_outstanding") {
      const cid = Number(row._customer_id || 0);
      const pending = Number(row.Outstanding || 0);
      if (cid > 0 && pending > 0) {
        return {
          partyType: "CUSTOMER",
          partyId: cid,
          partyName: String(row.Customer || ""),
          totalAmount: Number(row["Total Purchases"] || 0),
          paidAmount: Number(row["Total Paid"] || 0),
          pendingAmount: pending,
        };
      }
    } else if (selectedType === "supplier_outstanding") {
      const supId = Number(row._supplier_id || 0);
      const pending = Number(row.Outstanding || 0);
      if (supId > 0 && pending > 0) {
        return {
          partyType: "SUPPLIER",
          partyId: supId,
          partyName: String(row.Company || ""),
          totalAmount: Number(row["Total Purchases"] || 0),
          paidAmount: Number(row["Total Paid"] || 0),
          pendingAmount: pending,
        };
      }
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Reports & Business Analytics</h1>
          <p className="text-sm text-slate-500">
            Real-time textile ERP reports generated from PostgreSQL with PDF, Excel, and CSV export.
          </p>
        </div>

        {canExport && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleExport("pdf")}
              disabled={!!exporting || loading}
              className="btn-primary text-xs py-2"
            >
              <FileText className="h-4 w-4" />
              {exporting === "pdf" ? "Exporting..." : "Export PDF"}
            </button>
            <button
              type="button"
              onClick={() => handleExport("xlsx")}
              disabled={!!exporting || loading}
              className="btn-secondary text-xs py-2"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-700" />
              {exporting === "xlsx" ? "Exporting..." : "Export Excel"}
            </button>
            <button
              type="button"
              onClick={() => handleExport("csv")}
              disabled={!!exporting || loading}
              className="btn-secondary text-xs py-2"
            >
              <Download className="h-4 w-4 text-navy-700" />
              {exporting === "csv" ? "Exporting..." : "Export CSV"}
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Catalog Sidebar */}
        <div className="lg:col-span-3 space-y-4">
          <div className="card p-4 space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-navy-700">
              <BarChart3 className="h-4 w-4 text-gold-600" />
              <span>Available Reports ({visibleReports.length})</span>
            </div>

            {groups.map((group) => {
              const items = visibleReports.filter((r) => r.group === group);
              if (items.length === 0) return null;
              return (
                <div key={group} className="space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-2 pt-1">
                    {group}
                  </p>
                  {items.map((item) => {
                    const active = item.key === selectedType;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => {
                          setRowSearch("");
                          setSelectedType(item.key);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                          active
                            ? "bg-navy-800 text-gold-300 font-semibold shadow-xs"
                            : "text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Report Workspace */}
        <div className="lg:col-span-9 space-y-5">
          {/* Filter Card */}
          <div className="card p-4 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-navy-900">
                  {currentMeta?.label || "Report"}
                </h2>
                <p className="text-xs text-slate-500">{currentMeta?.description}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => applyPreset("today")} className="btn-secondary text-xs py-1 px-2.5">
                  Today
                </button>
                <button type="button" onClick={() => applyPreset("month")} className="btn-secondary text-xs py-1 px-2.5">
                  This Month
                </button>
                <button type="button" onClick={() => applyPreset("fy")} className="btn-secondary text-xs py-1 px-2.5">
                  Financial Year
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 items-end pt-2 border-t border-slate-100">
              <div>
                <label className="label-text">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label className="label-text">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="input-field"
                />
              </div>

              {currentMeta?.supportsCategory && (
                <div>
                  <label className="label-text">Category</label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="input-field"
                  >
                    <option value="">All Categories</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {currentMeta?.supportsUser && isOwner && (
                <div>
                  <label className="label-text">Employee / User</label>
                  <select
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    className="input-field"
                  >
                    <option value="">All Users</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name} ({u.username})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {currentMeta?.supportsCustomer && (
                <div>
                  <label className="label-text">Customer</label>
                  <select
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className="input-field"
                  >
                    <option value="">All Customers (Summary)</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.customer_code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fetchReport(selectedType)}
                  disabled={loading}
                  className="btn-gold w-full sm:w-auto"
                >
                  {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Filter className="h-4 w-4" />}
                  {loading ? "Loading..." : "Run Report"}
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 text-sm text-rose-700">
              {error}
            </div>
          )}

          {successNotice && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs font-medium text-emerald-800 flex items-center justify-between gap-2">
              <span>{successNotice}</span>
              <button type="button" onClick={() => setSuccessNotice(null)} className="text-emerald-700 font-bold hover:underline">
                Dismiss
              </button>
            </div>
          )}

          {/* Report Summary Metrics */}
          {report && Object.keys(report.summary).length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {Object.entries(report.summary).map(([key, val]) => (
                <div key={key} className="card p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 truncate">
                    {formatSummaryLabel(key)}
                  </p>
                  <p className="text-lg font-bold text-navy-900 mt-1 truncate">
                    {formatSummaryValue(key, val)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Report Data Table */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-navy-900">
                  {report?.title || currentMeta?.label}
                </h3>
                {report && (
                  <p className="text-xs text-slate-500">
                    Period: {report.period} • Showing {filteredRows.length} of {report.rows.length} record(s)
                  </p>
                )}
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={rowSearch}
                  onChange={(e) => setRowSearch(e.target.value)}
                  placeholder="Filter rows..."
                  className="input-field pl-9 py-1.5 text-xs"
                />
              </div>
            </div>

            {loading ? (
              <div className="py-14 text-center text-sm text-slate-500">Generating report...</div>
            ) : !report || filteredRows.length === 0 ? (
              <EmptyState
                title="No report rows found"
                description="Try widening the selected date range or clearing search filters."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-600 border-b border-slate-200">
                    <tr>
                      {report.columns.map((col) => (
                        <th key={col} className="px-4 py-3 font-semibold whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                      {supportsSettlement && (
                        <th className="px-4 py-3 font-semibold text-right whitespace-nowrap">Action</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRows.map((row, idx) => {
                      const target = supportsSettlement ? resolveSettlementTarget(row) : null;
                      return (
                        <tr key={idx} className="hover:bg-slate-50/70">
                          {report.columns.map((col) => (
                            <td key={col} className="px-4 py-2.5 text-slate-700 whitespace-nowrap">
                              {col === "Status" || col === "Approval" ? (
                                <StatusBadge status={String(row[col] ?? "")} />
                              ) : (
                                formatCellValue(col, row[col])
                              )}
                            </td>
                          ))}
                          {supportsSettlement && (
                            <td className="px-4 py-2.5 text-right whitespace-nowrap">
                              {target ? (
                                <button
                                  type="button"
                                  onClick={() => setSettlementTarget(target)}
                                  className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                                >
                                  <Wallet className="h-3.5 w-3.5" />
                                  {target.invoiceId ? "Pay / Update Status" : "Collect Due"}
                                </button>
                              ) : (
                                <span className="text-xs text-slate-400">—</span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <CollectInvoicePaymentModal
        target={settlementTarget}
        accounts={accounts}
        onClose={() => setSettlementTarget(null)}
        onSuccess={async (msg) => {
          setSuccessNotice(msg);
          await fetchReport(selectedType);
        }}
      />
    </div>
  );
};
