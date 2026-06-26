CREATE TYPE "public"."candidate_source_relationship" AS ENUM('origin', 'supporting', 'contradiction', 'update', 'duplicate_signal');--> statement-breakpoint
CREATE TYPE "public"."candidate_status" AS ENUM('new', 'triaged', 'linked', 'promoted', 'duplicate', 'rejected', 'archived');--> statement-breakpoint
CREATE TYPE "public"."candidate_type" AS ENUM('physical_place', 'online_service', 'payment_processor', 'payment_program', 'platform');--> statement-breakpoint
CREATE TYPE "public"."duplicate_group_status" AS ENUM('open', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."provenance_role" AS ENUM('origin', 'verification', 'correction', 'attribution');--> statement-breakpoint
CREATE TYPE "public"."provenance_subject_type" AS ENUM('entity', 'location', 'acceptance_claim', 'claim_asset', 'evidence', 'verification_event', 'media');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('osm', 'official_site', 'official_social', 'processor', 'directory', 'user_submission', 'legacy_import', 'business_representative', 'live_observation', 'payment_proof', 'other');--> statement-breakpoint
CREATE TABLE "candidate_duplicate_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "duplicate_group_status" DEFAULT 'open' NOT NULL,
	"resolution_note" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_duplicate_groups_resolution_note_nonempty" CHECK ("candidate_duplicate_groups"."resolution_note" is null or length(trim("candidate_duplicate_groups"."resolution_note")) > 0),
	CONSTRAINT "candidate_duplicate_groups_resolution_time" CHECK (("candidate_duplicate_groups"."status" = 'open' and "candidate_duplicate_groups"."resolved_at" is null) or ("candidate_duplicate_groups"."status" in ('resolved', 'dismissed') and "candidate_duplicate_groups"."resolved_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "candidate_source_records" (
	"candidate_id" uuid NOT NULL,
	"source_record_id" uuid NOT NULL,
	"relationship" "candidate_source_relationship" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_source_records_pk" PRIMARY KEY("candidate_id","source_record_id")
);
--> statement-breakpoint
CREATE TABLE "licenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(96) NOT NULL,
	"name" varchar(160) NOT NULL,
	"version" varchar(64),
	"url" text,
	"attribution_required" boolean DEFAULT false NOT NULL,
	"share_alike" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "licenses_slug_nonempty" CHECK (length(trim("licenses"."slug")) > 0),
	CONSTRAINT "licenses_name_nonempty" CHECK (length(trim("licenses"."name")) > 0),
	CONSTRAINT "licenses_url_nonempty" CHECK ("licenses"."url" is null or length(trim("licenses"."url")) > 0),
	CONSTRAINT "licenses_notes_nonempty" CHECK ("licenses"."notes" is null or length(trim("licenses"."notes")) > 0)
);
--> statement-breakpoint
CREATE TABLE "provenance_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" "provenance_subject_type" NOT NULL,
	"subject_id" uuid NOT NULL,
	"field_path" varchar(160),
	"source_record_id" uuid NOT NULL,
	"license_id" uuid,
	"provenance_role" "provenance_role" NOT NULL,
	"effective_from" timestamp with time zone,
	"effective_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provenance_links_field_path_nonempty" CHECK ("provenance_links"."field_path" is null or length(trim("provenance_links"."field_path")) > 0),
	CONSTRAINT "provenance_links_effective_order" CHECK ("provenance_links"."effective_from" is null or "provenance_links"."effective_to" is null or "provenance_links"."effective_from" <= "provenance_links"."effective_to")
);
--> statement-breakpoint
CREATE TABLE "source_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_type" "candidate_type" NOT NULL,
	"normalized_name" varchar(200) NOT NULL,
	"candidate_status" "candidate_status" DEFAULT 'new' NOT NULL,
	"priority" integer,
	"duplicate_group_id" uuid,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"import_batch_id" uuid,
	"canonical_entity_id" uuid,
	"canonical_location_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_candidates_normalized_name_nonempty" CHECK (length(trim("source_candidates"."normalized_name")) > 0),
	CONSTRAINT "source_candidates_priority_range" CHECK ("source_candidates"."priority" is null or "source_candidates"."priority" between 0 and 1000),
	CONSTRAINT "source_candidates_seen_order" CHECK ("source_candidates"."first_seen_at" <= "source_candidates"."last_seen_at"),
	CONSTRAINT "source_candidates_location_type" CHECK ("source_candidates"."canonical_location_id" is null or "source_candidates"."candidate_type" = 'physical_place'),
	CONSTRAINT "source_candidates_linked_canonical" CHECK ("source_candidates"."candidate_status" not in ('linked', 'promoted') or "source_candidates"."canonical_entity_id" is not null or "source_candidates"."canonical_location_id" is not null),
	CONSTRAINT "source_candidates_duplicate_group" CHECK ("source_candidates"."candidate_status" <> 'duplicate' or "source_candidates"."duplicate_group_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "source_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"external_id" varchar(256),
	"source_url" text,
	"raw_payload" jsonb NOT NULL,
	"observed_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"fetched_at" timestamp with time zone NOT NULL,
	"content_hash" varchar(128),
	"archive_url" text,
	"license_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_records_identity_required" CHECK ("source_records"."external_id" is not null or "source_records"."source_url" is not null or "source_records"."content_hash" is not null),
	CONSTRAINT "source_records_external_id_nonempty" CHECK ("source_records"."external_id" is null or length(trim("source_records"."external_id")) > 0),
	CONSTRAINT "source_records_source_url_nonempty" CHECK ("source_records"."source_url" is null or length(trim("source_records"."source_url")) > 0),
	CONSTRAINT "source_records_archive_url_nonempty" CHECK ("source_records"."archive_url" is null or length(trim("source_records"."archive_url")) > 0),
	CONSTRAINT "source_records_content_hash_nonempty" CHECK ("source_records"."content_hash" is null or length(trim("source_records"."content_hash")) > 0),
	CONSTRAINT "source_records_archive_requires_source" CHECK ("source_records"."archive_url" is null or "source_records"."source_url" is not null)
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" "source_type" NOT NULL,
	"name" varchar(160) NOT NULL,
	"base_url" text,
	"default_license_id" uuid,
	"attribution_text" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_name_nonempty" CHECK (length(trim("sources"."name")) > 0),
	CONSTRAINT "sources_base_url_nonempty" CHECK ("sources"."base_url" is null or length(trim("sources"."base_url")) > 0),
	CONSTRAINT "sources_attribution_nonempty" CHECK ("sources"."attribution_text" is null or length(trim("sources"."attribution_text")) > 0)
);
--> statement-breakpoint
ALTER TABLE "evidence" ALTER COLUMN "license_id" SET DATA TYPE uuid;--> statement-breakpoint
ALTER TABLE "candidate_source_records" ADD CONSTRAINT "candidate_source_records_candidate_id_source_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."source_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_source_records" ADD CONSTRAINT "candidate_source_records_source_record_id_source_records_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "public"."source_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provenance_links" ADD CONSTRAINT "provenance_links_source_record_id_source_records_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "public"."source_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provenance_links" ADD CONSTRAINT "provenance_links_license_id_licenses_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."licenses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_candidates" ADD CONSTRAINT "source_candidates_duplicate_group_id_candidate_duplicate_groups_id_fk" FOREIGN KEY ("duplicate_group_id") REFERENCES "public"."candidate_duplicate_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_candidates" ADD CONSTRAINT "source_candidates_canonical_entity_id_entities_id_fk" FOREIGN KEY ("canonical_entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_candidates" ADD CONSTRAINT "source_candidates_canonical_location_id_locations_id_fk" FOREIGN KEY ("canonical_location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_records" ADD CONSTRAINT "source_records_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_records" ADD CONSTRAINT "source_records_license_id_licenses_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."licenses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_default_license_id_licenses_id_fk" FOREIGN KEY ("default_license_id") REFERENCES "public"."licenses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "candidate_duplicate_groups_status_idx" ON "candidate_duplicate_groups" USING btree ("status");--> statement-breakpoint
CREATE INDEX "candidate_source_records_source_idx" ON "candidate_source_records" USING btree ("source_record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "licenses_slug_unique" ON "licenses" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "provenance_links_record_unique" ON "provenance_links" USING btree ("subject_type","subject_id","source_record_id","provenance_role") WHERE "provenance_links"."field_path" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "provenance_links_field_unique" ON "provenance_links" USING btree ("subject_type","subject_id","field_path","source_record_id","provenance_role") WHERE "provenance_links"."field_path" is not null;--> statement-breakpoint
CREATE INDEX "provenance_links_subject_idx" ON "provenance_links" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "provenance_links_source_record_idx" ON "provenance_links" USING btree ("source_record_id");--> statement-breakpoint
CREATE INDEX "provenance_links_license_idx" ON "provenance_links" USING btree ("license_id");--> statement-breakpoint
CREATE INDEX "source_candidates_status_priority_idx" ON "source_candidates" USING btree ("candidate_status","priority");--> statement-breakpoint
CREATE INDEX "source_candidates_normalized_name_idx" ON "source_candidates" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "source_candidates_duplicate_group_idx" ON "source_candidates" USING btree ("duplicate_group_id");--> statement-breakpoint
CREATE INDEX "source_candidates_canonical_entity_idx" ON "source_candidates" USING btree ("canonical_entity_id");--> statement-breakpoint
CREATE INDEX "source_candidates_canonical_location_idx" ON "source_candidates" USING btree ("canonical_location_id");--> statement-breakpoint
CREATE INDEX "source_candidates_import_batch_idx" ON "source_candidates" USING btree ("import_batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_records_external_identity_unique" ON "source_records" USING btree ("source_id","external_id") WHERE "source_records"."external_id" is not null;--> statement-breakpoint
CREATE INDEX "source_records_source_fetched_idx" ON "source_records" USING btree ("source_id","fetched_at");--> statement-breakpoint
CREATE INDEX "source_records_content_hash_idx" ON "source_records" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "source_records_license_idx" ON "source_records" USING btree ("license_id");--> statement-breakpoint
CREATE INDEX "sources_type_active_idx" ON "sources" USING btree ("source_type","is_active");--> statement-breakpoint
CREATE INDEX "sources_default_license_idx" ON "sources" USING btree ("default_license_id");--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_source_record_id_source_records_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "public"."source_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_license_id_licenses_id_fk" FOREIGN KEY ("license_id") REFERENCES "public"."licenses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evidence_license_idx" ON "evidence" USING btree ("license_id");