CREATE SEQUENCE "public"."account_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1000 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."order_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1000 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."purchase_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1000 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."settlement_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1000 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."vault_csh_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1000 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."voucher_disb_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1000 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."voucher_receipt_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1000 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."voucher_rev_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1000 CACHE 1;--> statement-breakpoint
CREATE TABLE "auth_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" varchar(20) NOT NULL,
	"password_hash" varchar(255),
	"role" varchar(20) DEFAULT 'customer' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "auth_identities_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "staff_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_identity_id" uuid NOT NULL,
	"username" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"job_title" varchar(100) NOT NULL,
	"role" varchar(30) NOT NULL,
	"permissions" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_profiles_auth_identity_id_unique" UNIQUE("auth_identity_id"),
	CONSTRAINT "staff_profiles_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "account_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"type" varchar(20) NOT NULL,
	"value" varchar(150) NOT NULL,
	"label" varchar(50),
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_contact_type" CHECK ("account_contacts"."type" IN ('mobile', 'whatsapp', 'landline', 'email'))
);
--> statement-breakpoint
CREATE TABLE "account_opening_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"type" varchar(10) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"entry_date" date DEFAULT now() NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_opening_balances_account_id_unique" UNIQUE("account_id"),
	CONSTRAINT "chk_opening_type" CHECK ("account_opening_balances"."type" IN ('debit', 'credit')),
	CONSTRAINT "chk_opening_amount_positive" CHECK ("account_opening_balances"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "financial_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_code" varchar(30) NOT NULL,
	"name" varchar(150) NOT NULL,
	"business_name" varchar(150),
	"phone" varchar(20),
	"category" varchar(20) NOT NULL,
	"pricing_tier" varchar(20) DEFAULT 'retail' NOT NULL,
	"fixed_discount_percent" numeric(5, 2) DEFAULT '0.00',
	"city" varchar(100),
	"address" text,
	"auth_identity_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_accounts_account_code_unique" UNIQUE("account_code"),
	CONSTRAINT "financial_accounts_auth_identity_id_unique" UNIQUE("auth_identity_id"),
	CONSTRAINT "chk_account_category" CHECK ("financial_accounts"."category" IN ('customer', 'supplier', 'driver', 'employee')),
	CONSTRAINT "chk_account_pricing_tier" CHECK ("financial_accounts"."pricing_tier" IN ('retail', 'market', 'wholesale', 'special', 'general')),
	CONSTRAINT "chk_account_discount" CHECK ("financial_accounts"."fixed_discount_percent" >= 0 AND "financial_accounts"."fixed_discount_percent" <= 100)
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"image" text,
	"icon" varchar(50),
	"color" varchar(30),
	"order_index" integer DEFAULT 0 NOT NULL,
	"hide_from_home" boolean DEFAULT false NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_name_unique" UNIQUE("name"),
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"logo" text,
	"color" varchar(30),
	"icon" varchar(50),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "product_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"original_price" numeric(14, 2) NOT NULL,
	"original_wholesale_price" numeric(14, 2),
	"offer_price" numeric(14, 2) NOT NULL,
	"offer_wholesale_price" numeric(14, 2),
	"discount_percent" numeric(5, 2),
	"badge" varchar(50),
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_offer_price_lower" CHECK ("product_offers"."offer_price" < "product_offers"."original_price")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"barcode" varchar(100),
	"description" text,
	"category_id" uuid NOT NULL,
	"company_id" uuid,
	"current_stock_pieces" integer DEFAULT 0 NOT NULL,
	"min_stock_alert" integer DEFAULT 5 NOT NULL,
	"boxes_per_carton" integer DEFAULT 1 NOT NULL,
	"items_per_box" integer DEFAULT 1 NOT NULL,
	"pieces_per_carton" integer DEFAULT 1 NOT NULL,
	"retail_unit" varchar(50) NOT NULL,
	"wholesale_unit" varchar(50) NOT NULL,
	"market_unit" varchar(50),
	"piece_cost_price" numeric(14, 4) DEFAULT '0.0000' NOT NULL,
	"box_cost_price" numeric(14, 4) DEFAULT '0.0000' NOT NULL,
	"cost_price" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"price" numeric(14, 2) NOT NULL,
	"wholesale_price" numeric(14, 2) NOT NULL,
	"market_price" numeric(14, 2),
	"box_price" numeric(14, 2),
	"special_price" numeric(14, 2),
	"vip_price" numeric(14, 2),
	"wholesale_min_quantity" integer DEFAULT 1,
	"production_date" date,
	"expiry_date" date,
	"expiry_alert_days" integer DEFAULT 30,
	"is_featured" boolean DEFAULT false NOT NULL,
	"is_best_seller" boolean DEFAULT false NOT NULL,
	"is_new" boolean DEFAULT false NOT NULL,
	"images" text[] DEFAULT '{}' NOT NULL,
	"cashback_customer_amount" numeric(14, 2),
	"cashback_market_amount" numeric(14, 2),
	"cashback_merchant_amount" numeric(14, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_barcode_unique" UNIQUE("barcode"),
	CONSTRAINT "chk_product_stock_non_negative" CHECK ("products"."current_stock_pieces" >= 0),
	CONSTRAINT "chk_product_boxes_carton" CHECK ("products"."boxes_per_carton" > 0),
	CONSTRAINT "chk_product_items_box" CHECK ("products"."items_per_box" > 0),
	CONSTRAINT "chk_product_price_non_negative" CHECK ("products"."price" >= 0),
	CONSTRAINT "chk_product_wholesale_price_non_negative" CHECK ("products"."wholesale_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"movement_type" varchar(30) NOT NULL,
	"quantity_pieces" integer NOT NULL,
	"unit_cost_pieces" numeric(14, 4) NOT NULL,
	"total_cost" numeric(14, 2) NOT NULL,
	"balance_after_pieces" integer NOT NULL,
	"reference_type" varchar(30) NOT NULL,
	"reference_id" uuid NOT NULL,
	"reference_number" varchar(50),
	"performed_by_staff_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_inventory_movement_type" CHECK ("inventory_movements"."movement_type" IN ('purchase', 'sale', 'customer_return', 'order_cancellation', 'damage_spoilage', 'manual_adjustment')),
	CONSTRAINT "chk_inventory_reference_type" CHECK ("inventory_movements"."reference_type" IN ('order', 'purchase_invoice', 'manual'))
);
--> statement-breakpoint
CREATE TABLE "driver_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"settlement_number" varchar(50) NOT NULL,
	"driver_id" uuid NOT NULL,
	"expected_amount" numeric(14, 2) NOT NULL,
	"actual_amount" numeric(14, 2) NOT NULL,
	"variance" numeric(14, 2) NOT NULL,
	"shortage_amount" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"overage_amount" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"type" varchar(30) NOT NULL,
	"status" varchar(20) DEFAULT 'settled' NOT NULL,
	"staff_id" uuid NOT NULL,
	"repayment_of_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "driver_settlements_settlement_number_unique" UNIQUE("settlement_number"),
	CONSTRAINT "chk_settlement_actual_non_negative" CHECK ("driver_settlements"."actual_amount" >= 0),
	CONSTRAINT "chk_settlement_type" CHECK ("driver_settlements"."type" IN ('normal', 'shortage', 'overage', 'shortage_repayment'))
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_identity_id" uuid NOT NULL,
	"financial_account_id" uuid NOT NULL,
	"default_vehicle_id" uuid,
	"name" varchar(150) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drivers_auth_identity_id_unique" UNIQUE("auth_identity_id"),
	CONSTRAINT "drivers_financial_account_id_unique" UNIQUE("financial_account_id"),
	CONSTRAINT "drivers_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"plate_number" varchar(50) NOT NULL,
	"type" varchar(50) NOT NULL,
	"model_year" varchar(10),
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicles_plate_number_unique" UNIQUE("plate_number")
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"item_name_snap" varchar(200) NOT NULL,
	"unit_label_snap" varchar(50) NOT NULL,
	"sold_unit" varchar(20) NOT NULL,
	"sold_quantity" integer NOT NULL,
	"conversion_factor_snap" integer NOT NULL,
	"base_quantity_deducted" integer NOT NULL,
	"unit_price_snap" numeric(14, 2) NOT NULL,
	"unit_cost_pieces_snap" numeric(14, 4) NOT NULL,
	"earned_cashback" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"image" text,
	CONSTRAINT "chk_order_item_sold_qty" CHECK ("order_items"."sold_quantity" > 0),
	CONSTRAINT "chk_order_item_conversion_factor" CHECK ("order_items"."conversion_factor_snap" > 0),
	CONSTRAINT "chk_order_item_base_deducted" CHECK ("order_items"."base_quantity_deducted" > 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" varchar(50) NOT NULL,
	"account_id" uuid NOT NULL,
	"customer_name_snap" varchar(150) NOT NULL,
	"customer_phone_snap" varchar(20) NOT NULL,
	"delivery_address_snap" text NOT NULL,
	"location_title_snap" varchar(100),
	"lat" numeric(10, 7),
	"lng" numeric(10, 7),
	"maps_url" text,
	"storefront_image" text,
	"subtotal" numeric(14, 2) NOT NULL,
	"delivery_fee" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"discount" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"used_cashback_discount" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"earned_cashback" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"status" varchar(20) NOT NULL,
	"payment_method" varchar(20) NOT NULL,
	"driver_id" uuid,
	"vehicle_id" uuid,
	"collection_status" varchar(30) DEFAULT 'pending' NOT NULL,
	"collected_amount" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"remaining_debt_amount" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"driver_cash_settled" boolean DEFAULT false NOT NULL,
	"settlement_id" uuid,
	"inventory_restored" boolean DEFAULT false NOT NULL,
	"notes" text,
	"driver_notes" text,
	"driver_assigned_at" timestamp with time zone,
	"out_for_delivery_at" timestamp with time zone,
	"driver_arrived_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number"),
	CONSTRAINT "chk_order_status" CHECK ("orders"."status" IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
	CONSTRAINT "chk_order_total_non_negative" CHECK ("orders"."total" >= 0),
	CONSTRAINT "chk_order_subtotal_non_negative" CHECK ("orders"."subtotal" >= 0)
);
--> statement-breakpoint
CREATE TABLE "settlement_orders" (
	"settlement_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	CONSTRAINT "settlement_orders_settlement_id_order_id_pk" PRIMARY KEY("settlement_id","order_id"),
	CONSTRAINT "settlement_orders_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "purchase_invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"cost_price" numeric(14, 2) NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"boxes_per_carton" integer DEFAULT 1 NOT NULL,
	"items_per_box" integer DEFAULT 1 NOT NULL,
	"total_pieces" integer NOT NULL,
	"piece_cost_price" numeric(14, 4) NOT NULL,
	"expiry_date" date,
	CONSTRAINT "chk_purchase_item_qty" CHECK ("purchase_invoice_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_number" varchar(50) NOT NULL,
	"supplier_account_id" uuid NOT NULL,
	"company_id" uuid,
	"supplier_name_snap" varchar(150) NOT NULL,
	"invoice_date" date DEFAULT now() NOT NULL,
	"total_amount" numeric(14, 2) NOT NULL,
	"payment_method" varchar(20) NOT NULL,
	"paid_amount" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"remaining_amount" numeric(14, 2) DEFAULT '0.00' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_invoices_invoice_number_unique" UNIQUE("invoice_number"),
	CONSTRAINT "chk_purchase_total_non_negative" CHECK ("purchase_invoices"."total_amount" >= 0),
	CONSTRAINT "chk_purchase_payment_method" CHECK ("purchase_invoices"."payment_method" IN ('cash', 'credit', 'partial'))
);
--> statement-breakpoint
CREATE TABLE "cash_vault_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_number" varchar(50) NOT NULL,
	"date" timestamp with time zone DEFAULT now() NOT NULL,
	"type" varchar(10) NOT NULL,
	"category" varchar(30) NOT NULL,
	"category_label" varchar(100) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"reference_type" varchar(30),
	"reference_id" uuid,
	"reference_number" varchar(50),
	"party_name" varchar(150),
	"staff_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_vault_movements_transaction_number_unique" UNIQUE("transaction_number"),
	CONSTRAINT "chk_vault_type" CHECK ("cash_vault_movements"."type" IN ('inflow', 'outflow')),
	CONSTRAINT "chk_vault_amount_positive" CHECK ("cash_vault_movements"."amount" > 0),
	CONSTRAINT "chk_vault_category" CHECK ("cash_vault_movements"."category" IN ('sales_cash', 'debt_collection', 'driver_settlement', 'purchase_payment', 'expense', 'owner_withdrawal', 'deposit_adjustment', 'adjustment'))
);
--> statement-breakpoint
CREATE TABLE "cashback_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"type" varchar(20) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"order_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_cashback_type" CHECK ("cashback_ledger"."type" IN ('earned', 'redeemed', 'reversed', 'expired', 'adjustment')),
	CONSTRAINT "chk_cashback_amount_positive" CHECK ("cashback_ledger"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "vouchers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_number" varchar(50) NOT NULL,
	"account_id" uuid NOT NULL,
	"voucher_type" varchar(20) NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"payment_method" varchar(20) NOT NULL,
	"is_reversed" boolean DEFAULT false NOT NULL,
	"reversal_voucher_id" uuid,
	"reversal_of_id" uuid,
	"reversal_reason" text,
	"reversed_at" timestamp with time zone,
	"reversed_by_staff_id" uuid,
	"received_by_staff_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vouchers_receipt_number_unique" UNIQUE("receipt_number"),
	CONSTRAINT "chk_voucher_type" CHECK ("vouchers"."voucher_type" IN ('receipt', 'disbursement', 'reversal')),
	CONSTRAINT "chk_voucher_amount_positive" CHECK ("vouchers"."amount" > 0),
	CONSTRAINT "chk_voucher_payment_method" CHECK ("vouchers"."payment_method" IN ('cash', 'zaincash', 'qicard', 'bank_transfer', 'other'))
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"action_type" varchar(50) NOT NULL,
	"action_label" varchar(150) NOT NULL,
	"category" varchar(50) NOT NULL,
	"category_label" varchar(100),
	"staff_id" uuid,
	"operator_snapshot" jsonb,
	"target_type" varchar(50),
	"target_id" varchar(100),
	"target_reference_number" varchar(50),
	"financial_impact" jsonb,
	"details" text NOT NULL,
	"severity" varchar(20) DEFAULT 'info' NOT NULL,
	"ip_address" varchar(50),
	CONSTRAINT "chk_audit_severity" CHECK ("audit_logs"."severity" IN ('info', 'warning', 'danger'))
);
--> statement-breakpoint
CREATE TABLE "banners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(150) NOT NULL,
	"subtitle" text,
	"image" text NOT NULL,
	"link_url" text,
	"badge" varchar(50),
	"is_active" boolean DEFAULT true NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"position" varchar(30) DEFAULT 'top' NOT NULL,
	"category_id" uuid,
	"category_name" varchar(100),
	"is_campaign_showcase" boolean DEFAULT false NOT NULL,
	"campaign_bg_color" varchar(30),
	"campaign_products_title" varchar(150),
	"campaign_product_ids" jsonb DEFAULT '[]'::jsonb,
	"is_text_shelf" boolean DEFAULT false NOT NULL,
	"is_sprite_slider" boolean DEFAULT false NOT NULL,
	"banner_bg_color" varchar(30),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"discount_type" varchar(20) NOT NULL,
	"discount_value" numeric(14, 2) NOT NULL,
	"min_order_amount" numeric(14, 2),
	"target_audience" varchar(30) DEFAULT 'all' NOT NULL,
	"description" text,
	"usage_limit" integer,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_code_unique" UNIQUE("code"),
	CONSTRAINT "chk_coupon_discount_type" CHECK ("coupons"."discount_type" IN ('percentage', 'fixed')),
	CONSTRAINT "chk_coupon_discount_value" CHECK ("coupons"."discount_value" > 0),
	CONSTRAINT "chk_coupon_usage_count" CHECK ("coupons"."usage_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "customer_complaints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid,
	"customer_name" varchar(150) NOT NULL,
	"customer_phone" varchar(20) NOT NULL,
	"business_name" varchar(150),
	"city" varchar(100),
	"text" text NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"admin_reply" text,
	"replied_by_staff_id" uuid,
	"replied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_complaint_status" CHECK ("customer_complaints"."status" IN ('pending', 'in_progress', 'resolved', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "driver_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"order_number" varchar(50) NOT NULL,
	"customer_name" varchar(150) NOT NULL,
	"customer_phone" varchar(20) NOT NULL,
	"rating" integer NOT NULL,
	"rating_label" varchar(50) NOT NULL,
	"tag" varchar(100),
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_rating_range" CHECK ("driver_ratings"."rating" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "lucky_wheel_prizes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" varchar(100) NOT NULL,
	"sub_label" varchar(100),
	"type" varchar(30) NOT NULL,
	"value" varchar(100) NOT NULL,
	"coupon_code" varchar(50),
	"color" varchar(30) NOT NULL,
	"text_color" varchar(30) NOT NULL,
	"probability" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_notification_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"image" text,
	"icon" text,
	"badge" text,
	"url" text,
	"target_audience" varchar(50) NOT NULL,
	"target_audience_label" varchar(100) NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"sent_by_staff_id" uuid,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh_key" text NOT NULL,
	"auth_key" text NOT NULL,
	"user_id" uuid,
	"user_phone" varchar(20),
	"user_name" varchar(150),
	"account_type" varchar(50),
	"user_agent" text,
	"device_type" varchar(20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_active_at" timestamp with time zone,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "store_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"store_name" varchar(150) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"whatsapp" varchar(20),
	"accounting_whatsapp" varchar(20),
	"support_phone" varchar(20),
	"email" varchar(100),
	"address" text,
	"currency" varchar(20) DEFAULT 'IQD' NOT NULL,
	"delivery_config" jsonb,
	"cashback_config" jsonb,
	"homepage_config" jsonb,
	"competitions_config" jsonb,
	"popup_ads_config" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_auth_identity_id_auth_identities_id_fk" FOREIGN KEY ("auth_identity_id") REFERENCES "public"."auth_identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_contacts" ADD CONSTRAINT "account_contacts_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_opening_balances" ADD CONSTRAINT "account_opening_balances_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_auth_identity_id_auth_identities_id_fk" FOREIGN KEY ("auth_identity_id") REFERENCES "public"."auth_identities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_offers" ADD CONSTRAINT "product_offers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_performed_by_staff_id_staff_profiles_id_fk" FOREIGN KEY ("performed_by_staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_settlements" ADD CONSTRAINT "driver_settlements_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_settlements" ADD CONSTRAINT "driver_settlements_staff_id_staff_profiles_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_auth_identity_id_auth_identities_id_fk" FOREIGN KEY ("auth_identity_id") REFERENCES "public"."auth_identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_financial_account_id_financial_accounts_id_fk" FOREIGN KEY ("financial_account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_default_vehicle_id_vehicles_id_fk" FOREIGN KEY ("default_vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_settlement_id_driver_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."driver_settlements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_orders" ADD CONSTRAINT "settlement_orders_settlement_id_driver_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."driver_settlements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_orders" ADD CONSTRAINT "settlement_orders_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoice_items" ADD CONSTRAINT "purchase_invoice_items_invoice_id_purchase_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."purchase_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoice_items" ADD CONSTRAINT "purchase_invoice_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_supplier_account_id_financial_accounts_id_fk" FOREIGN KEY ("supplier_account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_vault_movements" ADD CONSTRAINT "cash_vault_movements_staff_id_staff_profiles_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashback_ledger" ADD CONSTRAINT "cashback_ledger_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashback_ledger" ADD CONSTRAINT "cashback_ledger_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_reversal_voucher_id_vouchers_id_fk" FOREIGN KEY ("reversal_voucher_id") REFERENCES "public"."vouchers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_reversal_of_id_vouchers_id_fk" FOREIGN KEY ("reversal_of_id") REFERENCES "public"."vouchers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_reversed_by_staff_id_staff_profiles_id_fk" FOREIGN KEY ("reversed_by_staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_received_by_staff_id_staff_profiles_id_fk" FOREIGN KEY ("received_by_staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_staff_id_staff_profiles_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "banners" ADD CONSTRAINT "banners_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_complaints" ADD CONSTRAINT "customer_complaints_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_complaints" ADD CONSTRAINT "customer_complaints_replied_by_staff_id_staff_profiles_id_fk" FOREIGN KEY ("replied_by_staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_ratings" ADD CONSTRAINT "driver_ratings_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_ratings" ADD CONSTRAINT "driver_ratings_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_notification_logs" ADD CONSTRAINT "push_notification_logs_sent_by_staff_id_staff_profiles_id_fk" FOREIGN KEY ("sent_by_staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_auth_identities_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_identities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_auth_phone" ON "auth_identities" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "idx_auth_role" ON "auth_identities" USING btree ("role");--> statement-breakpoint
CREATE INDEX "idx_staff_username" ON "staff_profiles" USING btree ("username");--> statement-breakpoint
CREATE INDEX "idx_contacts_account_id" ON "account_contacts" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_contacts_value" ON "account_contacts" USING btree ("value");--> statement-breakpoint
CREATE INDEX "idx_opening_account_id" ON "account_opening_balances" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_accounts_code" ON "financial_accounts" USING btree ("account_code");--> statement-breakpoint
CREATE INDEX "idx_accounts_category" ON "financial_accounts" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_accounts_phone" ON "financial_accounts" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "idx_categories_slug" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_offers_product_id" ON "product_offers" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_products_category" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_products_company" ON "products" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_products_barcode" ON "products" USING btree ("barcode");--> statement-breakpoint
CREATE INDEX "idx_inventory_product_id" ON "inventory_movements" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_reference" ON "inventory_movements" USING btree ("reference_type","reference_id");--> statement-breakpoint
CREATE INDEX "idx_inventory_created_at" ON "inventory_movements" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_settlements_driver_id" ON "driver_settlements" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "idx_settlements_number" ON "driver_settlements" USING btree ("settlement_number");--> statement-breakpoint
CREATE INDEX "idx_drivers_phone" ON "drivers" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "idx_order_items_order_id" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_order_items_product_id" ON "order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_orders_account_id" ON "orders" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_orders_status" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_orders_driver_id" ON "orders" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "idx_orders_created_at" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_settlement_orders_order_id" ON "settlement_orders" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_items_invoice_id" ON "purchase_invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_items_product_id" ON "purchase_invoice_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_supplier_id" ON "purchase_invoices" USING btree ("supplier_account_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_invoice_number" ON "purchase_invoices" USING btree ("invoice_number");--> statement-breakpoint
CREATE INDEX "idx_purchase_date" ON "purchase_invoices" USING btree ("invoice_date");--> statement-breakpoint
CREATE INDEX "idx_vault_date" ON "cash_vault_movements" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_vault_number" ON "cash_vault_movements" USING btree ("transaction_number");--> statement-breakpoint
CREATE INDEX "idx_cashback_account_id" ON "cashback_ledger" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_cashback_order_id" ON "cashback_ledger" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_vouchers_account_id" ON "vouchers" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_vouchers_receipt_number" ON "vouchers" USING btree ("receipt_number");--> statement-breakpoint
CREATE INDEX "idx_vouchers_created_at" ON "vouchers" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_timestamp" ON "audit_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_audit_category" ON "audit_logs" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_audit_action" ON "audit_logs" USING btree ("action_type");--> statement-breakpoint
CREATE INDEX "idx_audit_staff" ON "audit_logs" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "idx_coupons_code" ON "coupons" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_complaints_status" ON "customer_complaints" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_complaints_phone" ON "customer_complaints" USING btree ("customer_phone");--> statement-breakpoint
CREATE INDEX "idx_ratings_driver_id" ON "driver_ratings" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "idx_ratings_order_id" ON "driver_ratings" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_push_endpoint" ON "push_subscriptions" USING btree ("endpoint");