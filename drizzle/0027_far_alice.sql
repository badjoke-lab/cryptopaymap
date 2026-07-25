CREATE TYPE "public"."submission_retention_material" AS ENUM('contact', 'payload', 'evidence', 'media_object_set');--> statement-breakpoint
CREATE TYPE "public"."submission_retention_outcome" AS ENUM('redacted', 'objects_deleted');--> statement-breakpoint
CREATE TYPE "public"."submission_retention_policy" AS ENUM('contact_retention_expired', 'terminal_payload_180d', 'private_evidence_180d', 'expired_authorization', 'closed_submission_without_handoff', 'rejected_media_30d', 'superseded_media_30d', 'private_evidence_media_180d', 'owner_verification_media_90d');--> statement-breakpoint
CREATE TYPE "public"."submission_retention_reference_type" AS ENUM('submission', 'evidence', 'reservation', 'media_asset');--> statement-breakpoint
CREATE TYPE "public"."submission_retention_run_state" AS ENUM('running', 'completed', 'partial');--> statement-breakpoint
CREATE TABLE "submission_retention_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"material" "submission_retention_material" NOT NULL,
	"policy" "submission_retention_policy" NOT NULL,
	"reference_type" "submission_retention_reference_type" NOT NULL,
	"reference_id" uuid NOT NULL,
	"submission_id" uuid,
	"outcome" "submission_retention_outcome" NOT NULL,
	"deleted_object_count" integer DEFAULT 0 NOT NULL,
	"missing_object_count" integer DEFAULT 0 NOT NULL,
	"actor_id" varchar(200) NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "submission_retention_items_object_counts" CHECK ("submission_retention_items"."deleted_object_count" >= 0 and "submission_retention_items"."missing_object_count" >= 0),
	CONSTRAINT "submission_retention_items_actor_nonempty" CHECK (length(trim("submission_retention_items"."actor_id")) > 0),
	CONSTRAINT "submission_retention_items_outcome_shape" CHECK (("submission_retention_items"."outcome" = 'redacted' and "submission_retention_items"."material" in ('contact', 'payload', 'evidence') and "submission_retention_items"."deleted_object_count" = 0 and "submission_retention_items"."missing_object_count" = 0) or ("submission_retention_items"."outcome" = 'objects_deleted' and "submission_retention_items"."material" = 'media_object_set'))
);
--> statement-breakpoint
CREATE TABLE "submission_retention_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"actor_id" varchar(200) NOT NULL,
	"request_fingerprint" varchar(64) NOT NULL,
	"state" "submission_retention_run_state" DEFAULT 'running' NOT NULL,
	"receipt" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "submission_retention_runs_fingerprint_sha256" CHECK ("submission_retention_runs"."request_fingerprint" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "submission_retention_runs_actor_nonempty" CHECK (length(trim("submission_retention_runs"."actor_id")) > 0),
	CONSTRAINT "submission_retention_runs_receipt_state" CHECK (("submission_retention_runs"."state" = 'running' and "submission_retention_runs"."receipt" is null) or ("submission_retention_runs"."state" in ('completed', 'partial') and "submission_retention_runs"."receipt" is not null and jsonb_typeof("submission_retention_runs"."receipt") = 'object')),
	CONSTRAINT "submission_retention_runs_time_order" CHECK ("submission_retention_runs"."created_at" <= "submission_retention_runs"."updated_at")
);
--> statement-breakpoint
ALTER TABLE "submission_retention_items" ADD CONSTRAINT "submission_retention_items_run_id_submission_retention_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."submission_retention_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_retention_items" ADD CONSTRAINT "submission_retention_items_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "submission_retention_items_policy_reference_unique" ON "submission_retention_items" USING btree ("policy","reference_type","reference_id");--> statement-breakpoint
CREATE INDEX "submission_retention_items_run_idx" ON "submission_retention_items" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "submission_retention_items_submission_idx" ON "submission_retention_items" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "submission_retention_items_completed_idx" ON "submission_retention_items" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "submission_retention_runs_effective_idx" ON "submission_retention_runs" USING btree ("effective_at");