CREATE TYPE "public"."submission_application_event_action" AS ENUM('registered', 'application_committed', 'application_failed', 'application_retried', 'publication_committed', 'publication_failed', 'publication_retried');--> statement-breakpoint
CREATE TYPE "public"."submission_application_kind" AS ENUM('candidate_resolution', 'report_evidence', 'problem_correction', 'problem_claim_mutation', 'business_claim_update', 'photo_media_set');--> statement-breakpoint
CREATE TYPE "public"."submission_application_receipt_kind" AS ENUM('submission_event', 'candidate_promotion_decision', 'media_review_decision', 'export_release_decision');--> statement-breakpoint
CREATE TYPE "public"."submission_application_source_decision_kind" AS ENUM('suggest_candidate_acceptance', 'positive_payment_evidence', 'negative_report_evidence', 'problem_correction_handoff', 'problem_claim_mutation', 'business_claim_relationship', 'photos_parent_resolution');--> statement-breakpoint
CREATE TYPE "public"."submission_application_status" AS ENUM('pending', 'committed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."submission_publication_status" AS ENUM('blocked', 'pending', 'committed', 'failed');--> statement-breakpoint
CREATE TABLE "submission_application_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"application_id" uuid NOT NULL,
	"action" "submission_application_event_action" NOT NULL,
	"from_application_status" "submission_application_status",
	"to_application_status" "submission_application_status" NOT NULL,
	"from_publication_status" "submission_publication_status",
	"to_publication_status" "submission_publication_status" NOT NULL,
	"source_decision_event_id" uuid NOT NULL,
	"actor_id" varchar(200) NOT NULL,
	"actor_type" "admin_actor_type" NOT NULL,
	"request_fingerprint" varchar(64) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "submission_application_events_actor_nonempty" CHECK (length(trim("submission_application_events"."actor_id")) > 0),
	CONSTRAINT "submission_application_events_fingerprint_sha256" CHECK ("submission_application_events"."request_fingerprint" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "submission_application_events_registration_shape" CHECK ("submission_application_events"."action" <> 'registered' or ("submission_application_events"."from_application_status" is null and "submission_application_events"."from_publication_status" is null))
);
--> statement-breakpoint
CREATE TABLE "submission_applications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"registration_request_id" uuid NOT NULL,
	"submission_id" uuid NOT NULL,
	"submission_type" "submission_type" NOT NULL,
	"source_decision_kind" "submission_application_source_decision_kind" NOT NULL,
	"source_decision_event_id" uuid NOT NULL,
	"application_kind" "submission_application_kind" NOT NULL,
	"application_status" "submission_application_status" NOT NULL,
	"publication_status" "submission_publication_status" NOT NULL,
	"application_receipt_kind" "submission_application_receipt_kind",
	"application_receipt_ids" jsonb NOT NULL,
	"publication_receipt_kind" "submission_application_receipt_kind",
	"publication_receipt_ids" jsonb NOT NULL,
	"expected_submission_updated_at" timestamp with time zone NOT NULL,
	"actor_id" varchar(200) NOT NULL,
	"actor_type" "admin_actor_type" NOT NULL,
	"request_fingerprint" varchar(64) NOT NULL,
	"registered_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "submission_applications_actor_nonempty" CHECK (length(trim("submission_applications"."actor_id")) > 0),
	CONSTRAINT "submission_applications_fingerprint_sha256" CHECK ("submission_applications"."request_fingerprint" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "submission_applications_application_receipts_array" CHECK (jsonb_typeof("submission_applications"."application_receipt_ids") = 'array' and jsonb_array_length("submission_applications"."application_receipt_ids") between 0 and 20),
	CONSTRAINT "submission_applications_publication_receipts_array" CHECK (jsonb_typeof("submission_applications"."publication_receipt_ids") = 'array' and jsonb_array_length("submission_applications"."publication_receipt_ids") between 0 and 20),
	CONSTRAINT "submission_applications_application_receipt_pair" CHECK (("submission_applications"."application_receipt_kind" is null and jsonb_array_length("submission_applications"."application_receipt_ids") = 0) or ("submission_applications"."application_receipt_kind" is not null and jsonb_array_length("submission_applications"."application_receipt_ids") > 0)),
	CONSTRAINT "submission_applications_publication_receipt_pair" CHECK (("submission_applications"."publication_receipt_kind" is null and jsonb_array_length("submission_applications"."publication_receipt_ids") = 0) or ("submission_applications"."publication_receipt_kind" is not null and jsonb_array_length("submission_applications"."publication_receipt_ids") > 0)),
	CONSTRAINT "submission_applications_application_publication_order" CHECK (("submission_applications"."application_status" in ('pending', 'failed') and "submission_applications"."publication_status" = 'blocked') or ("submission_applications"."application_status" = 'committed' and "submission_applications"."publication_status" in ('pending', 'committed', 'failed'))),
	CONSTRAINT "submission_applications_committed_receipt" CHECK ("submission_applications"."application_status" <> 'committed' or "submission_applications"."application_receipt_kind" is not null),
	CONSTRAINT "submission_applications_uncommitted_receipt" CHECK ("submission_applications"."application_status" = 'committed' or ("submission_applications"."application_receipt_kind" is null and jsonb_array_length("submission_applications"."application_receipt_ids") = 0)),
	CONSTRAINT "submission_applications_publication_committed_receipt" CHECK ("submission_applications"."publication_status" <> 'committed' or "submission_applications"."publication_receipt_kind" is not null),
	CONSTRAINT "submission_applications_time_order" CHECK ("submission_applications"."expected_submission_updated_at" <= "submission_applications"."registered_at" and "submission_applications"."registered_at" <= "submission_applications"."updated_at")
);
--> statement-breakpoint
ALTER TABLE "submission_application_events" ADD CONSTRAINT "submission_application_events_application_id_submission_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."submission_applications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_application_events" ADD CONSTRAINT "submission_application_events_source_decision_event_id_submission_events_id_fk" FOREIGN KEY ("source_decision_event_id") REFERENCES "public"."submission_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_applications" ADD CONSTRAINT "submission_applications_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_applications" ADD CONSTRAINT "submission_applications_source_decision_event_id_submission_events_id_fk" FOREIGN KEY ("source_decision_event_id") REFERENCES "public"."submission_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "submission_application_events_application_created_idx" ON "submission_application_events" USING btree ("application_id","created_at");--> statement-breakpoint
CREATE INDEX "submission_application_events_actor_created_idx" ON "submission_application_events" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "submission_applications_request_unique" ON "submission_applications" USING btree ("registration_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submission_applications_submission_unique" ON "submission_applications" USING btree ("submission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submission_applications_source_event_unique" ON "submission_applications" USING btree ("source_decision_event_id");--> statement-breakpoint
CREATE INDEX "submission_applications_status_idx" ON "submission_applications" USING btree ("application_status","publication_status","updated_at");--> statement-breakpoint
CREATE INDEX "submission_applications_actor_idx" ON "submission_applications" USING btree ("actor_id","registered_at");