ALTER TABLE "cashback_ledger" DROP CONSTRAINT "cashback_ledger_account_id_financial_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cashback_ledger" ADD CONSTRAINT "cashback_ledger_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_accounts_phone_non_null" ON "financial_accounts" USING btree ("phone") WHERE "financial_accounts"."phone" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_voucher_reversal_voucher_id" ON "vouchers" USING btree ("reversal_voucher_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_voucher_reversal_of_id" ON "vouchers" USING btree ("reversal_of_id");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "chk_order_item_math_integrity" CHECK ("order_items"."base_quantity_deducted" = "order_items"."sold_quantity" * "order_items"."conversion_factor_snap");--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "chk_voucher_no_self_reversal_voucher" CHECK ("vouchers"."reversal_voucher_id" IS NULL OR "vouchers"."reversal_voucher_id" != "vouchers"."id");--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "chk_voucher_no_self_reversal_of" CHECK ("vouchers"."reversal_of_id" IS NULL OR "vouchers"."reversal_of_id" != "vouchers"."id");--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "chk_voucher_reversal_consistency" CHECK (("vouchers"."is_reversed" = FALSE) OR ("vouchers"."is_reversed" = TRUE AND "vouchers"."reversal_voucher_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "chk_voucher_reversal_type_consistency" CHECK (("vouchers"."voucher_type" != 'reversal') OR ("vouchers"."voucher_type" = 'reversal' AND "vouchers"."reversal_of_id" IS NOT NULL));