CREATE TYPE "public"."evidence_class" AS ENUM('a', 'b', 'c');--> statement-breakpoint
CREATE TYPE "public"."evidence_kind" AS ENUM('live_checkout', 'official_payment_page', 'verified_representative', 'payment_proof', 'official_social', 'processor_case_study', 'dated_osm_observation', 'independent_user_report', 'directory_listing', 'undated_osm_tag', 'article', 'search_snippet', 'platform_capability', 'other');--> statement-breakpoint
CREATE TYPE "public"."evidence_origin_role" AS ENUM('merchant_side', 'processor_side', 'usage_side', 'on_ground', 'osm_side', 'directory', 'other');--> statement-breakpoint
CREATE TYPE "public"."evidence_polarity" AS ENUM('supporting', 'contradicting', 'neutral');--> statement-breakpoint
CREATE TYPE "public"."evidence_review_status" AS ENUM('pending', 'accepted', 'rejected', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."evidence_source_type" AS ENUM('official_page', 'official_social', 'processor', 'openstreetmap', 'directory', 'article', 'search', 'user_submission', 'business_representative', 'live_observation', 'payment_proof', 'other');--> statement-breakpoint
CREATE TYPE "public"."evidence_visibility" AS ENUM('public', 'private', 'restricted');--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid,
	"submission_id" uuid,
	"source_record_id" uuid,
	"evidence_kind" "evidence_kind" NOT NULL,
	"evidence_class" "evidence_class" NOT NULL,
	"source_type" "evidence_source_type" NOT NULL,
	"origin_role" "evidence_origin_role" NOT NULL,
	"polarity" "evidence_polarity" DEFAULT 'supporting' NOT NULL,
	"source_name" varchar(160),
	"source_url" text,
	"source_native_id" varchar(256),
	"observed_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"fetched_at" timestamp with time zone,
	"summary" text NOT NULL,
	"visibility" "evidence_visibility" DEFAULT 'private' NOT NULL,
	"review_status" "evidence_review_status" DEFAULT 'pending' NOT NULL,
	"archive_url" text,
	"content_hash" varchar(128),
	"license_id" varchar(96),
	"attribution" text,
	"independence_key" varchar(160),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "evidence_parent_required" CHECK ("evidence"."claim_id" is not null or "evidence"."submission_id" is not null or "evidence"."source_record_id" is not null),
	CONSTRAINT "evidence_public_reviewed" CHECK ("evidence"."visibility" <> 'public' or "evidence"."review_status" = 'accepted'),
	CONSTRAINT "evidence_accepted_observation" CHECK ("evidence"."review_status" <> 'accepted' or "evidence"."evidence_class" = 'c' or "evidence"."observed_at" is not null),
	CONSTRAINT "evidence_accepted_b_independence" CHECK ("evidence"."review_status" <> 'accepted' or "evidence"."evidence_class" <> 'b' or "evidence"."independence_key" is not null),
	CONSTRAINT "evidence_summary_nonempty" CHECK (length(trim("evidence"."summary")) > 0),
	CONSTRAINT "evidence_source_name_nonempty" CHECK ("evidence"."source_name" is null or length(trim("evidence"."source_name")) > 0),
	CONSTRAINT "evidence_source_url_nonempty" CHECK ("evidence"."source_url" is null or length(trim("evidence"."source_url")) > 0),
	CONSTRAINT "evidence_archive_url_nonempty" CHECK ("evidence"."archive_url" is null or length(trim("evidence"."archive_url")) > 0),
	CONSTRAINT "evidence_content_hash_nonempty" CHECK ("evidence"."content_hash" is null or length(trim("evidence"."content_hash")) > 0),
	CONSTRAINT "evidence_independence_key_nonempty" CHECK ("evidence"."independence_key" is null or length(trim("evidence"."independence_key")) > 0)
);
--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_claim_id_acceptance_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."acceptance_claims"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evidence_claim_idx" ON "evidence" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "evidence_submission_idx" ON "evidence" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "evidence_source_record_idx" ON "evidence" USING btree ("source_record_id");--> statement-breakpoint
CREATE INDEX "evidence_review_idx" ON "evidence" USING btree ("review_status","evidence_class");--> statement-breakpoint
CREATE INDEX "evidence_observed_idx" ON "evidence" USING btree ("observed_at");--> statement-breakpoint
CREATE INDEX "evidence_content_hash_idx" ON "evidence" USING btree ("content_hash");