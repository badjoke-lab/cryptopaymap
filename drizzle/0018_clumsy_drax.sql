CREATE TYPE "public"."export_release_action" AS ENUM('approve', 'reject');--> statement-breakpoint
CREATE TYPE "public"."export_release_candidate_status" AS ENUM('eligible', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."export_release_status" AS ENUM('approved', 'rejected');--> statement-breakpoint
CREATE TABLE "export_release_decisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"action" "export_release_action" NOT NULL,
	"release_status" "export_release_status" NOT NULL,
	"snapshot_digest" varchar(64) NOT NULL,
	"artifact_count" integer NOT NULL,
	"dataset_version" varchar(64) NOT NULL,
	"schema_version" varchar(32) NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"candidate_status" "export_release_candidate_status" NOT NULL,
	"validation_issues" jsonb NOT NULL,
	"actor_id" varchar(200) NOT NULL,
	"actor_type" "admin_actor_type" NOT NULL,
	"reason_code" varchar(96) NOT NULL,
	"public_summary" text,
	"internal_note" text,
	"decided_at" timestamp with time zone NOT NULL,
	"request_fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "export_release_decisions_digest_shape" CHECK ("export_release_decisions"."snapshot_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "export_release_decisions_artifact_count_range" CHECK ("export_release_decisions"."artifact_count" between 1 and 100),
	CONSTRAINT "export_release_decisions_validation_issues_array" CHECK (jsonb_typeof("export_release_decisions"."validation_issues") = 'array' and jsonb_array_length("export_release_decisions"."validation_issues") between 0 and 500),
	CONSTRAINT "export_release_decisions_candidate_shape" CHECK (("export_release_decisions"."candidate_status" = 'eligible' and jsonb_array_length("export_release_decisions"."validation_issues") = 0) or ("export_release_decisions"."candidate_status" = 'blocked' and jsonb_array_length("export_release_decisions"."validation_issues") > 0)),
	CONSTRAINT "export_release_decisions_dataset_version_nonempty" CHECK (length(trim("export_release_decisions"."dataset_version")) > 0),
	CONSTRAINT "export_release_decisions_schema_version_nonempty" CHECK (length(trim("export_release_decisions"."schema_version")) > 0),
	CONSTRAINT "export_release_decisions_actor_nonempty" CHECK (length(trim("export_release_decisions"."actor_id")) > 0),
	CONSTRAINT "export_release_decisions_reason_nonempty" CHECK (length(trim("export_release_decisions"."reason_code")) > 0),
	CONSTRAINT "export_release_decisions_fingerprint_nonempty" CHECK (length("export_release_decisions"."request_fingerprint") > 0),
	CONSTRAINT "export_release_decisions_summary_required" CHECK ("export_release_decisions"."public_summary" is not null or "export_release_decisions"."internal_note" is not null),
	CONSTRAINT "export_release_decisions_time_order" CHECK ("export_release_decisions"."generated_at" <= "export_release_decisions"."decided_at"),
	CONSTRAINT "export_release_decisions_approve_shape" CHECK ("export_release_decisions"."action" <> 'approve' or ("export_release_decisions"."release_status" = 'approved' and "export_release_decisions"."candidate_status" = 'eligible')),
	CONSTRAINT "export_release_decisions_reject_shape" CHECK ("export_release_decisions"."action" <> 'reject' or "export_release_decisions"."release_status" = 'rejected')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "export_release_decisions_request_unique" ON "export_release_decisions" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "export_release_decisions_approved_snapshot_unique" ON "export_release_decisions" USING btree ("snapshot_digest") WHERE "export_release_decisions"."release_status" = 'approved';--> statement-breakpoint
CREATE UNIQUE INDEX "export_release_decisions_approved_dataset_unique" ON "export_release_decisions" USING btree ("dataset_version") WHERE "export_release_decisions"."release_status" = 'approved';--> statement-breakpoint
CREATE INDEX "export_release_decisions_decided_idx" ON "export_release_decisions" USING btree ("decided_at");--> statement-breakpoint
CREATE INDEX "export_release_decisions_actor_idx" ON "export_release_decisions" USING btree ("actor_id","decided_at");--> statement-breakpoint
CREATE INDEX "export_release_decisions_status_idx" ON "export_release_decisions" USING btree ("release_status","decided_at");