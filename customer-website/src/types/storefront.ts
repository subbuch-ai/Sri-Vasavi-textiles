export interface StoreCategory {
  id: number;
  name: string;
  code: string;
  description?: string | null;
}

export interface StoreProductImage {
  id: number;
  image_url: string;
  alt_text?: string | null;
  display_order: number;
  is_primary: boolean;
}

export interface StoreProduct {
  id: number;
  product_code: string;
  name: string;
  category_id: number;
  category_name: string;
  category_code: string;
  brand?: string | null;
  description?: string | null;
  size?: string | null;
  color?: string | null;
  available_sizes: string[];
  available_colors: string[];
  fabric_type?: string | null;
  hsn_code?: string | null;
  unit: string;
  retail_price: number | string;
  wholesale_price?: number | string | null;
  wholesale_eligible: boolean;
  wholesale_min_qty: number | string;
  gst_rate: number | string;
  available_stock: number | string;
  in_stock: boolean;
  image_url?: string | null;
  images: StoreProductImage[];
  is_featured: boolean;
  is_new_arrival: boolean;
  is_best_seller: boolean;
  specifications?: Record<string, unknown> | null;
  created_at: string;
}

export interface StoreBanner {
  id: number;
  title: string;
  subtitle?: string | null;
  badge_text?: string | null;
  image_url?: string | null;
  cta_text: string;
  cta_link: string;
  display_order: number;
  is_active: boolean;
}

export interface StorePromotion {
  id: number;
  code: string;
  title: string;
  description?: string | null;
  discount_type: "PERCENT" | "FLAT";
  discount_value: number | string;
  min_order_amount: number | string;
  max_discount_amount?: number | string | null;
  applicable_customer_type: "ALL" | "RETAIL" | "WHOLESALE";
  ends_at?: string | null;
}

export interface StorefrontConfigPublic {
  store_enabled: boolean;
  business_name: string;
  tagline?: string | null;
  logo_url?: string | null;
  hero_title: string;
  hero_subtitle: string;
  contact_phone?: string | null;
  contact_email?: string | null;
  contact_address?: string | null;
  whatsapp_number?: string | null;
  free_delivery_threshold: number | string;
  standard_delivery_charge: number | string;
  cod_enabled: boolean;
  upi_enabled: boolean;
  upi_id?: string | null;
  bank_transfer_enabled: boolean;
  bank_details_text?: string | null;
  gateway_provider: string;
  razorpay_enabled: boolean;
  razorpay_key_id?: string | null;
  cancellation_policy_text: string;
  return_policy_text: string;
  privacy_policy_text: string;
}

export interface StorefrontConfigAdmin extends StorefrontConfigPublic {
  has_razorpay_secret: boolean;
  email_notifications_enabled: boolean;
  smtp_host?: string | null;
  smtp_port: number;
  smtp_user?: string | null;
  has_smtp_password: boolean;
  smtp_from_email?: string | null;
  whatsapp_enabled: boolean;
  whatsapp_api_url?: string | null;
  whatsapp_phone_number_id?: string | null;
  has_whatsapp_token: boolean;
}

export interface StoreHomeResponse {
  config: StorefrontConfigPublic;
  banners: StoreBanner[];
  categories: StoreCategory[];
  featured_products: StoreProduct[];
  new_arrivals: StoreProduct[];
  best_sellers: StoreProduct[];
  promotions: StorePromotion[];
}

export interface CustomerAddress {
  id: number;
  customer_id: number;
  label: string;
  recipient_name: string;
  mobile: string;
  address_line1: string;
  address_line2?: string | null;
  city: string;
  state: string;
  pincode: string;
  is_default: boolean;
}

export interface CustomerMe {
  id: number;
  customer_id: number;
  customer_code: string;
  name: string;
  email: string;
  mobile: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  customer_type: "RETAIL" | "WHOLESALE";
  wholesale_status: string;
  is_wholesale_approved: boolean;
  gst_number?: string | null;
  credit_limit: number | string;
  outstanding_balance: number | string;
  addresses: CustomerAddress[];
}

export interface CustomerAuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  customer: CustomerMe;
}

export interface CartItem {
  id: number;
  product_id: number;
  product_code: string;
  product_name: string;
  category_name: string;
  image_url?: string | null;
  unit: string;
  selected_size: string;
  selected_color: string;
  quantity: number | string;
  available_stock: number | string;
  unit_price: number | string;
  pricing_tier: "RETAIL" | "WHOLESALE";
  wholesale_min_qty: number | string;
  gst_rate: number | string;
  line_subtotal: number | string;
  line_gst: number | string;
  line_total: number | string;
}

export interface CartSummary {
  items: CartItem[];
  item_count: number;
  promo_code?: string | null;
  promo_message?: string | null;
  subtotal: number | string;
  discount_amount: number | string;
  gst_amount: number | string;
  delivery_charge: number | string;
  total_amount: number | string;
}

export interface OrderStatusHistoryItem {
  id: number;
  status: string;
  notes?: string | null;
  changed_by_type: string;
  created_at: string;
}

export interface DeliveryDetail {
  courier_name?: string | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
  dispatched_at?: string | null;
  estimated_delivery_at?: string | null;
  delivered_at?: string | null;
  notes?: string | null;
}

export interface OnlinePayment {
  id: number;
  gateway_name: string;
  payment_method: string;
  gateway_order_id?: string | null;
  gateway_payment_id?: string | null;
  amount: number | string;
  currency: string;
  status: string;
  verified_server_side: boolean;
  created_at: string;
}

export interface StoreOrder {
  id: number;
  order_number: string;
  order_date: string;
  order_type: "RETAIL" | "WHOLESALE";
  order_source: string;
  order_status: string;
  payment_status: string;
  payment_method: string;
  subtotal: number | string;
  discount_amount: number | string;
  tax_amount: number | string;
  delivery_charge: number | string;
  total_amount: number | string;
  advance_amount: number | string;
  remaining_amount: number | string;
  shipping_name?: string | null;
  shipping_mobile?: string | null;
  shipping_address?: string | null;
  shipping_city?: string | null;
  shipping_state?: string | null;
  shipping_pincode?: string | null;
  cancellation_requested: boolean;
  cancellation_reason?: string | null;
  converted_sale_id?: number | null;
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
  status_history: OrderStatusHistoryItem[];
  delivery_detail?: DeliveryDetail | null;
  online_payment?: OnlinePayment | null;
}

export interface StoreCheckoutResponse {
  order: StoreOrder;
  razorpay_order_id?: string | null;
  razorpay_key_id?: string | null;
  amount_paise?: number | null;
}

export interface WholesaleApplication {
  id: number;
  customer_id: number;
  business_name: string;
  gst_number?: string | null;
  shop_address: string;
  city: string;
  state: string;
  pincode: string;
  contact_name: string;
  contact_mobile: string;
  contact_email?: string | null;
  estimated_monthly_volume?: string | null;
  notes?: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  admin_notes?: string | null;
  reviewed_at?: string | null;
  created_at: string;
}

export interface WholesaleEnquiry {
  id: number;
  enquiry_number: string;
  customer_id?: number | null;
  product_id?: number | null;
  product_name?: string | null;
  contact_name: string;
  business_name?: string | null;
  mobile: string;
  email?: string | null;
  requested_quantity: number | string;
  target_price?: number | string | null;
  message: string;
  status: string;
  quoted_price?: number | string | null;
  admin_response?: string | null;
  created_at: string;
}

export interface CustomerNotificationItem {
  id: number;
  order_id?: number | null;
  title: string;
  message: string;
  channel: string;
  delivery_status: string;
  is_read: boolean;
  created_at: string;
}

