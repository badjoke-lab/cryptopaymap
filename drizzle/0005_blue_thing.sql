CREATE TYPE "public"."acceptance_scope" AS ENUM('all_checkout', 'selected_products', 'new_purchase_only', 'renewal_only', 'region_limited', 'temporary');--> statement-breakpoint
CREATE TYPE "public"."claim_region_inclusion" AS ENUM('include', 'exclude');--> statement-breakpoint
CREATE TYPE "public"."claim_scope" AS ENUM('location_specific', 'brand_region', 'brand_global', 'online_service', 'platform_capability');--> statement-breakpoint
CREATE TYPE "public"."merchant_receives" AS ENUM('crypto', 'fiat', 'crypto_or_fiat', 'not_publicly_confirmed');--> statement-breakpoint
CREATE TABLE "acceptance_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" uuid NOT NULL,
	"location_id" uuid,
	"claim_scope" "claim_scope" NOT NULL,
	"route_type" "route_type" NOT NULL,
	"acceptance_scope" "acceptance_scope" DEFAULT 'all_checkout' NOT NULL,
	"claim_status" "acceptance_claim_status" DEFAULT 'candidate' NOT NULL,
	"visibility" "claim_visibility" DEFAULT 'hidden' NOT NULL,
	"customer_pays_crypto" boolean DEFAULT false NOT NULL,
	"merchant_explicitly_accepts_crypto" boolean DEFAULT false NOT NULL,
	"processor_id" uuid,
	"how_to_pay" text,
	"instructions_language" varchar(35) DEFAULT 'en' NOT NULL,
	"merchant_receives" "merchant_receives" DEFAULT 'not_publicly_confirmed' NOT NULL,
	"restrictions" text,
	"first_confirmed_at" timestamp with time zone,
	"last_confirmed_at" timestamp with time zone,
	"next_review_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"ended_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "acceptance_claims_location_scope" CHECK (("acceptance_claims"."claim_scope" = 'location_specific' and "acceptance_claims"."location_id" is not null) or ("acceptance_claims"."claim_scope" <> 'location_specific' and "acceptance_claims"."location_id" is null)),
	CONSTRAINT "acceptance_claims_processor_route" CHECK ("acceptance_claims"."route_type" <> 'processor_checkout' or "acceptance_claims"."processor_id" is not null),
	CONSTRAINT "acceptance_claims_ended_timestamp" CHECK ("acceptance_claims"."claim_status" <> 'ended' or "acceptance_claims"."ended_at" is not null),
	CONSTRAINT "acceptance_claims_confirmed_requirements" CHECK ("acceptance_claims"."claim_status" <> 'confirmed' or ("acceptance_claims"."how_to_pay" is not null and length(trim("acceptance_claims"."how_to_pay")) > 0 and "acceptance_claims"."first_confirmed_at" is not null and "acceptance_claims"."last_confirmed_at" is not null)),
	CONSTRAINT "acceptance_claims_public_status" CHECK ("acceptance_claims"."visibility" <> 'public' or "acceptance_claims"."claim_status" in ('confirmed', 'stale', 'ended')),
	CONSTRAINT "acceptance_claims_public_payment_flags" CHECK ("acceptance_claims"."visibility" <> 'public' or ("acceptance_claims"."customer_pays_crypto" = true and "acceptance_claims"."merchant_explicitly_accepts_crypto" = true)),
	CONSTRAINT "acceptance_claims_confirmation_order" CHECK ("acceptance_claims"."first_confirmed_at" is null or "acceptance_claims"."last_confirmed_at" is null or "acceptance_claims"."first_confirmed_at" <= "acceptance_claims"."last_confirmed_at")
);
--> statement-breakpoint
CREATE TABLE "claim_regions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"country_code" varchar(2) NOT NULL,
	"region_code" varchar(64),
	"inclusion_type" "claim_region_inclusion" NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "acceptance_claims" ADD CONSTRAINT "acceptance_claims_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acceptance_claims" ADD CONSTRAINT "acceptance_claims_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acceptance_claims" ADD CONSTRAINT "acceptance_claims_processor_id_entities_id_fk" FOREIGN KEY ("processor_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_regions" ADD CONSTRAINT "claim_regions_claim_id_acceptance_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."acceptance_claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "acceptance_claims_entity_idx" ON "acceptance_claims" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "acceptance_claims_location_idx" ON "acceptance_claims" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "acceptance_claims_processor_idx" ON "acceptance_claims" USING btree ("processor_id");--> statement-breakpoint
CREATE INDEX "acceptance_claims_status_idx" ON "acceptance_claims" USING btree ("claim_status");--> statement-breakpoint
CREATE INDEX "acceptance_claims_review_idx" ON "acceptance_claims" USING btree ("next_review_at");--> statement-breakpoint
CREATE UNIQUE INDEX "claim_regions_identity_unique" ON "claim_regions" USING btree ("claim_id","country_code","region_code","inclusion_type");--> statement-breakpoint
CREATE INDEX "claim_regions_claim_idx" ON "claim_regions" USING btree ("claim_id");