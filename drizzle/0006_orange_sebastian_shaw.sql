CREATE TABLE "claim_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"network_id" uuid NOT NULL,
	"payment_method_id" uuid NOT NULL,
	"contract_address" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claim_assets_contract_address_nonempty" CHECK ("claim_assets"."contract_address" is null or length(trim("claim_assets"."contract_address")) > 0),
	CONSTRAINT "claim_assets_notes_nonempty" CHECK ("claim_assets"."notes" is null or length(trim("claim_assets"."notes")) > 0)
);
--> statement-breakpoint
ALTER TABLE "claim_assets" ADD CONSTRAINT "claim_assets_claim_id_acceptance_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."acceptance_claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_assets" ADD CONSTRAINT "claim_assets_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_assets" ADD CONSTRAINT "claim_assets_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_assets" ADD CONSTRAINT "claim_assets_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "claim_assets_without_contract_unique" ON "claim_assets" USING btree ("claim_id","asset_id","network_id","payment_method_id") WHERE "claim_assets"."contract_address" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "claim_assets_with_contract_unique" ON "claim_assets" USING btree ("claim_id","asset_id","network_id","payment_method_id","contract_address") WHERE "claim_assets"."contract_address" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "claim_assets_primary_per_claim_unique" ON "claim_assets" USING btree ("claim_id") WHERE "claim_assets"."is_primary" = true;--> statement-breakpoint
CREATE INDEX "claim_assets_claim_idx" ON "claim_assets" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "claim_assets_asset_network_idx" ON "claim_assets" USING btree ("asset_id","network_id");--> statement-breakpoint
CREATE INDEX "claim_assets_payment_method_idx" ON "claim_assets" USING btree ("payment_method_id");