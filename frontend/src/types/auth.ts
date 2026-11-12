export interface UserPermissionOverride {
  permission_code: string;
  granted: boolean;
}

export interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  mobile?: string | null;
  role_id: number;
  role_name: string;
  role_display_name: string;
  is_active: boolean;
  is_owner: boolean;
  last_login_at?: string | null;
  created_at: string;
  permissions: string[];
  overrides: UserPermissionOverride[];
  employee_id?: number | null;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

export interface PermissionItem {
  id: number;
  code: string;
  module: string;
  description?: string | null;
}

export interface RoleItem {
  id: number;
  name: string;
  display_name: string;
  description?: string | null;
  is_system: boolean;
  permissions: string[];
}

export interface BusinessSettings {
  id: number;
  business_name: string;
  tagline?: string | null;
  logo_url?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  invoice_prefix: string;
  next_invoice_number: number;
  po_prefix: string;
  next_po_number: number;
  order_prefix: string;
  next_order_number: number;
  currency_code: string;
  currency_symbol: string;
  financial_year: string;
  default_gst_rate: number | string;
  allow_negative_stock: boolean;
  low_stock_alert_enabled: boolean;
  require_expense_approval: boolean;
  expense_approval_threshold: number | string;
  payment_methods: { methods?: string[] };
  tax_settings: { gst_enabled?: boolean; default_rates?: number[]; split_cgst_sgst?: boolean };
  updated_at: string;
}

export interface Branch {
  id: number;
  code: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
  is_default: boolean;
  is_active: boolean;
}

export interface AuditLog {
  id: number;
  user_id?: number | null;
  username?: string | null;
  action: string;
  module: string;
  entity_type?: string | null;
  entity_id?: string | null;
  description: string;
  ip_address?: string | null;
  created_at: string;
}

