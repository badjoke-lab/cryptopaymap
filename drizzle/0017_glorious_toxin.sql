CREATE TYPE "public"."media_review_action" AS ENUM('approve_private', 'approve_public', 'reject', 'restrict', 'supersede');--> statement-breakpoint
CREATE TYPE "public"."media_review_privacy" AS ENUM('cleared', 'private_only', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."media_review_subject_type" AS ENUM('entity', 'location', 'claim', 'evidence', 'submission', 'source_record');--> statement-breakpoint
CREATE TYPE "public"."media_review_target_match" AS ENUM('confirmed', 'uncertain', 'wrong_target');--> statement-breakpoint
CREATE TABLE "media_review_decisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"media_asset_id" uuid NOT NULL,
	"action" "media_review_action" NOT NULL,
	"target_match" "media_review_target_match" NOT NULL,
	"privacy_review" "media_review_privacy" NOT NULL,
	"expected_media_updated_at" timestamp with time zone NOT NULL,
	"expected_review_status" "media_review_status" NOT NULL,
	"expected_purpose" "media_purpose" NOT NULL,
	"expected_rights_status" "media_rights_status" NOT NULL,
	"expected_visibility" "media_visibility" NOT NULL,
	"expected_subject_type" "media_review_subject_type" NOT NULL,
	"expected_subject_id" uuid NOT NULL,
	"expected_files" jsonb NOT NULL,
	"to_review_status" "media_review_status" NOT NULL,
	"to_purpose" "media_purpose" NOT NULL,
	"to_rights_status" "media_rights_status" NOT NULL,
	"to_visibility" "media_visibility" NOT NULL,
	"license_id" uuid,
	"rights_holder" varchar(200),
	"consent_reference" varchar(256),
	"attribution" text,
	"license_attribution_required" boolean,
	"alt_text" text,
	"display_order" integer,
	"public_display_file_id" uuid,
	"public_thumbnail_file_id" uuid,
	"public_file_ids" jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"actor_id" varchar(200) NOT NULL,
	"actor_type" "admin_actor_type" NOT NULL,
	"reason_code" varchar(96) NOT NULL,
	"public_summary" text,
	"internal_note" text,
	"decided_at" timestamp with time zone NOT NULL,
	"request_fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_review_decisions_expected_files_array" CHECK (jsonb_typeof("media_review_decisions"."expected_files") = 'array' and jsonb_array_length("media_review_decisions"."expected_files") between 0 and 3),
	CONSTRAINT "media_review_decisions_public_files_array" CHECK (jsonb_typeof("media_review_decisions"."public_file_ids") = 'array' and jsonb_array_length("media_review_decisions"."public_file_ids") between 0 and 3),
	CONSTRAINT "media_review_decisions_actor_nonempty" CHECK (length(trim("media_review_decisions"."actor_id")) > 0),
	CONSTRAINT "media_review_decisions_reason_nonempty" CHECK (length(trim("media_review_decisions"."reason_code")) > 0),
	CONSTRAINT "media_review_decisions_fingerprint_nonempty" CHECK (length("media_review_decisions"."request_fingerprint") > 0),
	CONSTRAINT "media_review_decisions_summary_required" CHECK ("media_review_decisions"."public_summary" is not null or "media_review_decisions"."internal_note" is not null),
	CONSTRAINT "media_review_decisions_time_order" CHECK ("media_review_decisions"."expected_media_updated_at" <= "media_review_decisions"."decided_at"),
	CONSTRAINT "media_review_decisions_private_approval_shape" CHECK ("media_review_decisions"."action" <> 'approve_private' or ("media_review_decisions"."expected_review_status" = 'pending' and "media_review_decisions"."expected_purpose" in ('evidence', 'owner_verification') and "media_review_decisions"."expected_visibility" = 'private' and "media_review_decisions"."target_match" = 'confirmed' and "media_review_decisions"."privacy_review" <> 'blocked' and "media_review_decisions"."to_review_status" = 'accepted' and "media_review_decisions"."to_purpose" = "media_review_decisions"."expected_purpose" and "media_review_decisions"."to_visibility" = 'private' and jsonb_array_length("media_review_decisions"."public_file_ids") = 0)),
	CONSTRAINT "media_review_decisions_public_approval_shape" CHECK ("media_review_decisions"."action" <> 'approve_public' or ("media_review_decisions"."expected_review_status" = 'pending' and "media_review_decisions"."expected_purpose" in ('public_gallery_candidate', 'canonical_logo') and "media_review_decisions"."expected_visibility" = 'private' and "media_review_decisions"."target_match" = 'confirmed' and "media_review_decisions"."privacy_review" = 'cleared' and "media_review_decisions"."to_review_status" = 'accepted' and "media_review_decisions"."to_purpose" in ('public_gallery', 'canonical_logo') and "media_review_decisions"."to_rights_status" in ('submitted_with_permission', 'licensed', 'public_domain') and "media_review_decisions"."to_visibility" = 'public' and "media_review_decisions"."alt_text" is not null and "media_review_decisions"."display_order" is not null and "media_review_decisions"."public_display_file_id" is not null and "media_review_decisions"."published_at" = "media_review_decisions"."decided_at")),
	CONSTRAINT "media_review_decisions_reject_shape" CHECK ("media_review_decisions"."action" <> 'reject' or ("media_review_decisions"."expected_review_status" = 'pending' and "media_review_decisions"."to_review_status" = 'rejected' and "media_review_decisions"."to_visibility" = 'private' and jsonb_array_length("media_review_decisions"."public_file_ids") = 0)),
	CONSTRAINT "media_review_decisions_restrict_shape" CHECK ("media_review_decisions"."action" <> 'restrict' or ("media_review_decisions"."expected_review_status" = 'accepted' and "media_review_decisions"."expected_visibility" = 'public' and "media_review_decisions"."to_review_status" = 'accepted' and "media_review_decisions"."to_visibility" = 'restricted')),
	CONSTRAINT "media_review_decisions_supersede_shape" CHECK ("media_review_decisions"."action" <> 'supersede' or ("media_review_decisions"."expected_review_status" = 'accepted' and "media_review_decisions"."expected_purpose" in ('public_gallery', 'canonical_logo') and "media_review_decisions"."expected_visibility" in ('public', 'restricted') and "media_review_decisions"."to_review_status" = 'superseded' and "media_review_decisions"."to_visibility" = 'restricted')),
	CONSTRAINT "media_review_decisions_license_shape" CHECK ("media_review_decisions"."to_rights_status" <> 'licensed' or "media_review_decisions"."license_id" is not null),
	CONSTRAINT "media_review_decisions_permission_shape" CHECK ("media_review_decisions"."to_rights_status" <> 'submitted_with_permission' or "media_review_decisions"."rights_holder" is not null or "media_review_decisions"."consent_reference" is not null),
	CONSTRAINT "media_review_decisions_attribution_shape" CHECK ("media_review_decisions"."license_attribution_required" is not true or "media_review_decisions"."attribution" is not null),
	CONSTRAINT "media_review_decisions_display_order_nonnegative" CHECK ("media_review_decisions"."display_order" is null or "media_review_decisions"."display_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "media_review_decisions" ADD CONSTRAINT "media_review_decisions_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_review_decisions" ADD CONSTRAINT "media_review_decisions_public_display_file_id_media_files_id_fk" FOREIGN KEY ("public_display_file_id") REFERENCES "public"."media_files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_review_decisions" ADD CONSTRAINT "media_review_decisions_public_thumbnail_file_id_media_files_id_fk" FOREIGN KEY ("public_thumbnail_file_id") REFERENCES "public"."media_files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_review_decisions_request_unique" ON "media_review_decisions" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "media_review_decisions_asset_idx" ON "media_review_decisions" USING btree ("media_asset_id","decided_at");--> statement-breakpoint
CREATE INDEX "media_review_decisions_actor_idx" ON "media_review_decisions" USING btree ("actor_id","decided_at");--> statement-breakpoint
CREATE INDEX "media_review_decisions_action_idx" ON "media_review_decisions" USING btree ("action","decided_at");