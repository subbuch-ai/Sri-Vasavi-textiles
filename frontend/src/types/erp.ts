export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface Category {
  id: number;
  name: string;
  code: string;
  description?: string | null;
  parent_id?: number | null;
  is_active: boolean;
  created_at: string;
}

export interface Product {
  id: number;
  product_code: string;
  name: string;
  category_id: number;
  category_name?: string | null;
  brand?: string | null;
  description?: string | null;
  size?: string | null;
  color?: string | null;
  fabric_type?: string | null;
  hsn_code?: string | null;
  unit: string;
  purchase_price: number | string;
  wholesale_price: number | string;
  retail_price: number | string;
  gst_rate: number | string;
  barcode?: string | null;
  current_stock: number | string;
  reserved_stock?: number | string;
  available_stock?: number | string;
  min_stock_level: number | string;
  image_url?: string | null;
  images?: Array<{
    id: number;
    image_url: string;
    alt_text?: string | null;
    display_order: number;
    is_primary: boolean;
  }>;
  is_active: boolean;
  is_storefront_visible?: boolean;
  is_featured?: boolean;
  is_new_arrival?: boolean;
  is_best_seller?: boolean;
  wholesale_min_qty?: number | string;
  is_low_stock: boolean;
  stock_value: number | string;
  created_at: string;
}

export interface StockTransaction {
  id: number;
  transaction_number: string;
  product_id: number;
  product_code?: string | null;
  product_name?: string | null;
  branch_id: number;
  branch_name?: string | null;
  target_branch_id?: number | null;
  transaction_type: string;
  quantity_change: number | string;
  stock_before: number | string;
  stock_after: number | string;
  unit_cost: number | string;
  reference_type?: string | null;
  reference_number?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface Supplier {
  id: number;
  supplier_code: string;
  company_name: string;
  contact_person?: string | null;
  mobile: string;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  gst_number?: string | null;
  opening_balance: number | string;
  total_purchases: number | string;
  total_payments: number | string;
  outstanding_balance: number | string;
  is_active: boolean;
  notes?: string | null;
  created_at: string;
}

export interface Customer {
  id: number;
  customer_code: string;
  name: string;
  mobile: string;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  customer_type: "WHOLESALE" | "RETAIL";
  gst_number?: string | null;
  credit_limit: number | string;
  opening_balance: number | string;
  total_purchases: number | string;
  total_payments: number | string;
  outstanding_balance: number | string;
  is_active: boolean;
  notes?: string | null;
  created_at: string;
}

export interface LedgerEntry {
  date: string;
  reference: string;
  entry_type: string;
  description: string;
  debit: number | string;
  credit: number | string;
  balance: number | string;
}

export interface PurchaseOrderItem {
  id: number;
  product_id: number;
  product_code?: string | null;
  product_name?: string | null;
  quantity: number | string;
  received_quantity: number | string;
  unit_price: number | string;
  discount_amount: number | string;
  gst_rate: number | string;
  gst_amount: number | string;
  total_amount: number | string;
}

export interface PurchaseOrder {
  id: number;
  po_number: string;
  supplier_id: number;
  supplier_name?: string | null;
  branch_id: number;
  order_date: string;
  expected_date?: string | null;
  status: string;
  subtotal: number | string;
  discount_amount: number | string;
  tax_amount: number | string;
  transport_charges: number | string;
  total_amount: number | string;
  notes?: string | null;
  created_at: string;
  items: PurchaseOrderItem[];
}

export interface GoodsReceipt {
  id: number;
  grn_number: string;
  purchase_order_id?: number | null;
  po_number?: string | null;
  supplier_id: number;
  supplier_name?: string | null;
  branch_id: number;
  received_date: string;
  challan_number?: string | null;
  notes?: string | null;
  created_at: string;
  items: Array<{
    id: number;
    product_id: number;
    product_code?: string | null;
    product_name?: string | null;
    quantity_received: number | string;
    unit_cost: number | string;
  }>;
}

export interface PurchaseInvoice {
  id: number;
  invoice_number: string;
  supplier_invoice_no: string;
  purchase_order_id?: number | null;
  goods_receipt_id?: number | null;
  supplier_id: number;
  supplier_name?: string | null;
  branch_id: number;
  invoice_date: string;
  due_date?: string | null;
  subtotal: number | string;
  discount_amount: number | string;
  cgst_amount: number | string;
  sgst_amount: number | string;
  igst_amount: number | string;
  tax_amount: number | string;
  transport_charges: number | string;
  round_off: number | string;
  total_amount: number | string;
  paid_amount: number | string;
  pending_amount: number | string;
  payment_status: string;
  status: string;
  notes?: string | null;
  created_at: string;
  items: Array<{
    id: number;
    product_id: number;
    product_code?: string | null;
    product_name?: string | null;
    quantity: number | string;
    returned_quantity: number | string;
    unit_price: number | string;
    gst_rate: number | string;
    gst_amount: number | string;
    total_amount: number | string;
  }>;
}

export interface CustomerOrder {
  id: number;
  order_number: string;
  customer_id: number;
  customer_name?: string | null;
  branch_id: number;
  order_date: string;
  expected_delivery_date?: string | null;
  order_type: "WHOLESALE" | "RETAIL";
  order_source?: "ERP" | "ONLINE";
  payment_method?: string;
  subtotal: number | string;
  discount_amount: number | string;
  tax_amount: number | string;
  delivery_charge?: number | string;
  total_amount: number | string;
  advance_amount: number | string;
  remaining_amount: number | string;
  order_status: string;
  payment_status: string;
  converted_sale_id?: number | null;
  stock_deducted: boolean;
  shipping_name?: string | null;
  shipping_mobile?: string | null;
  shipping_address?: string | null;
  shipping_city?: string | null;
  shipping_state?: string | null;
  shipping_pincode?: string | null;
  cancellation_requested?: boolean;
  cancellation_reason?: string | null;
  notes?: string | null;
  created_at: string;
  items: Array<{
    id: number;
    product_id: number;
    product_code?: string | null;
    product_name?: string | null;
    quantity: number | string;
    unit_price: number | string;
    discount_amount: number | string;
    gst_rate: number | string;
    gst_amount: number | string;
    total_amount: number | string;
  }>;
}

export interface Sale {
  id: number;
  invoice_number: string;
  customer_id?: number | null;
  customer_name_snapshot: string;
  customer_order_id?: number | null;
  branch_id: number;
  sale_type: "WHOLESALE" | "RETAIL";
  sale_date: string;
  subtotal: number | string;
  discount_amount: number | string;
  cgst_amount: number | string;
  sgst_amount: number | string;
  igst_amount: number | string;
  tax_amount: number | string;
  round_off: number | string;
  total_amount: number | string;
  total_cogs: number | string;
  paid_amount: number | string;
  pending_amount: number | string;
  payment_status: string;
  status: string;
  payment_mode: string;
  notes?: string | null;
  created_at: string;
  items: Array<{
    id: number;
    product_id: number;
    product_code?: string | null;
    product_name?: string | null;
    hsn_code?: string | null;
    unit?: string | null;
    quantity: number | string;
    returned_quantity: number | string;
    unit_price: number | string;
    cost_price: number | string;
    discount_amount: number | string;
    gst_rate: number | string;
    gst_amount: number | string;
    total_amount: number | string;
  }>;
}

export interface Account {
  id: number;
  code: string;
  name: string;
  account_type: string;
  opening_balance: number | string;
  current_balance: number | string;
  bank_name?: string | null;
  account_number?: string | null;
  ifsc_code?: string | null;
  upi_id?: string | null;
  is_default: boolean;
  is_active: boolean;
}

export interface PaymentRecord {
  id: number;
  payment_number: string;
  payment_date: string;
  direction: "INBOUND" | "OUTBOUND";
  party_type: "CUSTOMER" | "SUPPLIER";
  customer_id?: number | null;
  customer_name?: string | null;
  supplier_id?: number | null;
  supplier_name?: string | null;
  sale_id?: number | null;
  purchase_invoice_id?: number | null;
  account_id: number;
  account_name?: string | null;
  amount: number | string;
  payment_mode: string;
  reference_number?: string | null;
  notes?: string | null;
  status: string;
  created_at: string;
}

export interface ExpenseRecord {
  id: number;
  expense_number: string;
  expense_date: string;
  category: string;
  title: string;
  description?: string | null;
  amount: number | string;
  tax_amount: number | string;
  total_amount: number | string;
  payment_mode: string;
  account_id?: number | null;
  account_name?: string | null;
  vendor_name?: string | null;
  attachment_url?: string | null;
  approval_status: string;
  created_at: string;
}

export interface FinancialTransaction {
  id: number;
  transaction_number: string;
  transaction_date: string;
  account_id: number;
  account_name?: string | null;
  transaction_type: string;
  reference_type?: string | null;
  reference_number?: string | null;
  description: string;
  debit: number | string;
  credit: number | string;
  payment_mode: string;
  created_at: string;
}

export interface Employee {
  id: number;
  employee_code: string;
  user_id?: number | null;
  username?: string | null;
  role_name?: string | null;
  branch_id?: number | null;
  full_name: string;
  mobile: string;
  email?: string | null;
  designation: string;
  department?: string | null;
  joining_date: string;
  salary: number | string;
  status: string;
  address?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface EmployeeTask {
  id: number;
  employee_id: number;
  employee_name?: string | null;
  title: string;
  description?: string | null;
  module_ref?: string | null;
  record_ref?: string | null;
  priority: string;
  status: string;
  due_date?: string | null;
  completed_at?: string | null;
  completion_notes?: string | null;
  created_at: string;
}

export interface DashboardOverview {
  kpis: {
    total_sales_today: number | string;
    total_sales_this_month: number | string;
    total_purchases: number | string;
    total_revenue: number | string;
    total_expenses?: number | string | null;
    gross_profit?: number | string | null;
    net_profit?: number | string | null;
    total_customers: number;
    total_suppliers: number;
    total_products: number;
    total_stock_value: number | string;
    pending_orders: number;
    customer_outstanding: number | string;
    supplier_outstanding: number | string;
  };
  monthly_sales: Array<{ label: string; value: number | string }>;
  monthly_purchases: Array<{ label: string; value: number | string }>;
  profit_loss_series: Array<{ label: string; value: number | string; secondary_value?: number | string; tertiary_value?: number | string }>;
  wholesale_vs_retail: Array<{ label: string; value: number | string }>;
  top_selling_products: Array<{ label: string; value: number | string; secondary_value?: number | string }>;
  sales_by_category: Array<{ label: string; value: number | string }>;
  daily_revenue_trends: Array<{ label: string; value: number | string }>;
  recent_transactions: Array<{ id: number; date: string; type: string; reference: string; party: string; amount: number | string; status: string }>;
  low_stock_alerts: Array<{ id: number; product_code: string; name: string; category_name: string; current_stock: number | string; min_stock_level: number | string; unit: string }>;
}

export interface ReportData {
  report_type: string;
  title: string;
  period: string;
  summary: Record<string, number | string>;
  columns: string[];
  rows: Array<Record<string, string | number>>;
}

