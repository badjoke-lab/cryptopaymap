CREATE TYPE "public"."legacy_migration_status" AS ENUM('pending', 'mapped', 'unresolved', 'retired');--> statement-breakpoint
CREATE TYPE "public"."legacy_source_system" AS ENUM('cryptopaymap_v2', 'crypto_acceptance_registry');--> statement-breakpoint
CREATE TYPE "public"."media_purpose" AS ENUM('evidence', 'owner_verification', 'public_gallery_candidate', 'public_gallery', 'canonical_logo');--> statement-breakpoint
CREATE TYPE "public"."media_review_status" AS ENUM('pending', 'accepted', 'rejected', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."media_rights_status" AS ENUM('unknown', 'submitted_with_permission', 'licensed', 'public_domain', 'restricted');--> statement-breakpoint
CREATE TYPE "public"."media_role" AS ENUM('cover', 'gallery', 'exterior', 'interior', 'product', 'menu', 'payment_sign', 'checkout_terminal', 'logo', 'evidence_image', 'owner_verification_proof');--> statement-breakpoint
CREATE TYPE "public"."media_storage_scope" AS ENUM('quarantine', 'private', 'public');--> statement-breakpoint
CREATE TYPE "public"."media_variant" AS ENUM('original', 'display', 'thumbnail');--> statement-breakpoint
CREATE TYPE "public"."media_visibility" AS ENUM('private', 'public', 'restricted');--> statement-breakpoint
CREATE TABLE "legacy_place_ids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_system" "legacy_source_system" NOT NULL,
	"legacy_id" varchar(256) NOT NULL,
	"legacy_path" text,
	"migration_status" "legacy_migration_status" DEFAULT 'pending' NOT NULL,
	"canonical_path" text,
	"entity_id" uuid,
	"location_id" uuid,
	"source_record_id" uuid,
	"resolution_note" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legacy_place_ids_legacy_id_nonempty" CHECK (length(trim("legacy_place_ids"."legacy_id")) > 0),
	CONSTRAINT "legacy_place_ids_state_shape" CHECK (("legacy_place_ids"."migration_status" = 'pending' and "legacy_place_ids"."resolved_at" is null and "legacy_place_ids"."canonical_path" is null and num_nonnulls("legacy_place_ids"."entity_id", "legacy_place_ids"."location_id") = 0) or ("legacy_place_ids"."migration_status" = 'mapped' and "legacy_place_ids"."resolved_at" is not null and "legacy_place_ids"."canonical_path" is not null and num_nonnulls("legacy_place_ids"."entity_id", "legacy_place_ids"."location_id") = 1) or ("legacy_place_ids"."migration_status" in ('unresolved', 'retired') and "legacy_place_ids"."resolved_at" is not null and "legacy_place_ids"."canonical_path" is null and num_nonnulls("legacy_place_ids"."entity_id", "legacy_place_ids"."location_id") = 0)),
	CONSTRAINT "legacy_place_ids_source_target" CHECK ("legacy_place_ids"."migration_status" <> 'mapped' or ("legacy_place_ids"."source_system" = 'cryptopaymap_v2' and "legacy_place_ids"."location_id" is not null and "legacy_place_ids"."entity_id" is null) or ("legacy_place_ids"."source_system" = 'crypto_acceptance_registry' and "legacy_place_ids"."entity_id" is not null and "legacy_place_ids"."location_id" is null)),
	CONSTRAINT "legacy_place_ids_legacy_path_format" CHECK ("legacy_place_ids"."legacy_path" is null or "legacy_place_ids"."legacy_path" ~ '^/[^?#]*$'),
	CONSTRAINT "legacy_place_ids_canonical_path_format" CHECK ("legacy_place_ids"."canonical_path" is null or "legacy_place_ids"."canonical_path" ~ '^/[^?#]+$'),
	CONSTRAINT "legacy_place_ids_path_change" CHECK ("legacy_place_ids"."legacy_path" is null or "legacy_place_ids"."canonical_path" is null or "legacy_place_ids"."legacy_path" <> "legacy_place_ids"."canonical_path"),
	CONSTRAINT "legacy_place_ids_resolution_note_required" CHECK ("legacy_place_ids"."migration_status" not in ('unresolved', 'retired') or "legacy_place_ids"."resolution_note" is not null),
	CONSTRAINT "legacy_place_ids_resolution_note_nonempty" CHECK ("legacy_place_ids"."resolution_note" is null or length(trim("legacy_place_ids"."resolution_note")) > 0)
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purpose" "media_purpose" NOT NULL,
	"role" "media_role" NOT NULL,
	"review_status" "media_review_status" DEFAULT 'pending' NOT NULL,
	"rights_status" "media_rights_status" DEFAULT 'unknown' NOT NULL,
	"visibility" "media_visibility" DEFAULT 'private' NOT NULL,
	"entity_id" uuid,
	"location_id" uuid,
	"claim_id" uuid,
	"evidence_id" uuid,
	"submission_id" uuid,
	"source_record_id" uuid,
	"license_id" uuid,
	"attribution" text,
	"alt_text" text,
	"rights_holder" varchar(200),
	"consent_reference" varchar(256),
	"display_order" integer DEFAULT 0 NOT NULL,
	"captured_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "media_assets_subject_exactly_one" CHECK (num_nonnulls("media_assets"."entity_id", "media_assets"."location_id", "media_assets"."claim_id", "media_assets"."evidence_id", "media_assets"."submission_id", "media_assets"."source_record_id") = 1),
	CONSTRAINT "media_assets_purpose_role" CHECK (("media_assets"."purpose" = 'evidence' and "media_assets"."role" = 'evidence_image') or ("media_assets"."purpose" = 'owner_verification' and "media_assets"."role" = 'owner_verification_proof') or ("media_assets"."purpose" = 'canonical_logo' and "media_assets"."role" = 'logo') or ("media_assets"."purpose" in ('public_gallery_candidate', 'public_gallery') and "media_assets"."role" in ('cover', 'gallery', 'exterior', 'interior', 'product', 'menu', 'payment_sign', 'checkout_terminal'))),
	CONSTRAINT "media_assets_public_eligible" CHECK ("media_assets"."visibility" <> 'public' or ("media_assets"."review_status" = 'accepted' and "media_assets"."purpose" in ('public_gallery', 'canonical_logo') and "media_assets"."rights_status" in ('submitted_with_permission', 'licensed', 'public_domain') and "media_assets"."published_at" is not null and "media_assets"."alt_text" is not null)),
	CONSTRAINT "media_assets_licensed_reference" CHECK ("media_assets"."rights_status" <> 'licensed' or "media_assets"."license_id" is not null),
	CONSTRAINT "media_assets_permission_reference" CHECK ("media_assets"."rights_status" <> 'submitted_with_permission' or "media_assets"."rights_holder" is not null or "media_assets"."consent_reference" is not null),
	CONSTRAINT "media_assets_display_order_nonnegative" CHECK ("media_assets"."display_order" >= 0),
	CONSTRAINT "media_assets_attribution_nonempty" CHECK ("media_assets"."attribution" is null or length(trim("media_assets"."attribution")) > 0),
	CONSTRAINT "media_assets_alt_text_nonempty" CHECK ("media_assets"."alt_text" is null or length(trim("media_assets"."alt_text")) > 0),
	CONSTRAINT "media_assets_rights_holder_nonempty" CHECK ("media_assets"."rights_holder" is null or length(trim("media_assets"."rights_holder")) > 0),
	CONSTRAINT "media_assets_consent_reference_nonempty" CHECK ("media_assets"."consent_reference" is null or length(trim("media_assets"."consent_reference")) > 0)
);
--> statement-breakpoint
CREATE TABLE "media_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_asset_id" uuid NOT NULL,
	"variant" "media_variant" NOT NULL,
	"storage_scope" "media_storage_scope" NOT NULL,
	"storage_key" text NOT NULL,
	"original_filename" varchar(256),
	"mime_type" varchar(127) NOT NULL,
	"byte_size" bigint NOT NULL,
	"width" integer,
	"height" integer,
	"content_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_files_storage_key_nonempty" CHECK (length(trim("media_files"."storage_key")) > 0),
	CONSTRAINT "media_files_mime_type_nonempty" CHECK (length(trim("media_files"."mime_type")) > 0),
	CONSTRAINT "media_files_byte_size_positive" CHECK ("media_files"."byte_size" > 0),
	CONSTRAINT "media_files_dimensions_pair" CHECK (("media_files"."width" is null and "media_files"."height" is null) or ("media_files"."width" > 0 and "media_files"."height" > 0)),
	CONSTRAINT "media_files_content_hash_sha256" CHECK ("media_files"."content_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "media_files_original_filename_nonempty" CHECK ("media_files"."original_filename" is null or length(trim("media_files"."original_filename")) > 0),
	CONSTRAINT "media_files_original_filename_scope" CHECK ("media_files"."original_filename" is null or "media_files"."variant" = 'original'),
	CONSTRAINT "media_files_original_not_public" CHECK ("media_files"."variant" <> 'original' or "media_files"."storage_scope" <> 'public'),
	CONSTRAINT "media_files_public_format" CHECK ("media_files"."storage_scope" <> 'public' or ("media_files"."variant" <> 'original' and "media_files"."mime_type" in ('image/jpeg', 'image/webp')))
);
--> statement-breakpoint
ALTER TABLE "legacy_place_ids" ADD CONSTRAINT "legacy_place_ids_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_place_ids" ADD CONSTRAINT "legacy_place_ids_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_place_ids" ADD CONSTRAINT "legacy_place_ids_source_record_id_source_records_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "public"."source_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_claim_id_acceptance_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."acceptance_claims"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_source_record_id_source_records_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "public"."source_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_license_id_licenses_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."licenses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_place_ids_source_identity_unique" ON "legacy_place_ids" USING btree ("source_system","legacy_id");--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_place_ids_legacy_path_unique" ON "legacy_place_ids" USING btree ("legacy_path") WHERE "legacy_place_ids"."legacy_path" is not null;--> statement-breakpoint
CREATE INDEX "legacy_place_ids_status_idx" ON "legacy_place_ids" USING btree ("migration_status");--> statement-breakpoint
CREATE INDEX "legacy_place_ids_entity_idx" ON "legacy_place_ids" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "legacy_place_ids_location_idx" ON "legacy_place_ids" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "legacy_place_ids_source_record_idx" ON "legacy_place_ids" USING btree ("source_record_id");--> statement-breakpoint
CREATE INDEX "media_assets_entity_idx" ON "media_assets" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "media_assets_location_idx" ON "media_assets" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "media_assets_claim_idx" ON "media_assets" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "media_assets_evidence_idx" ON "media_assets" USING btree ("evidence_id");--> statement-breakpoint
CREATE INDEX "media_assets_submission_idx" ON "media_assets" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "media_assets_source_record_idx" ON "media_assets" USING btree ("source_record_id");--> statement-breakpoint
CREATE INDEX "media_assets_license_idx" ON "media_assets" USING btree ("license_id");--> statement-breakpoint
CREATE INDEX "media_assets_review_visibility_idx" ON "media_assets" USING btree ("review_status","visibility");--> statement-breakpoint
CREATE INDEX "media_assets_purpose_order_idx" ON "media_assets" USING btree ("purpose","display_order");--> statement-breakpoint
CREATE UNIQUE INDEX "media_files_storage_key_unique" ON "media_files" USING btree ("storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "media_files_asset_variant_unique" ON "media_files" USING btree ("media_asset_id","variant");--> statement-breakpoint
CREATE INDEX "media_files_asset_idx" ON "media_files" USING btree ("media_asset_id");--> statement-breakpoint
CREATE INDEX "media_files_content_hash_idx" ON "media_files" USING btree ("content_hash");