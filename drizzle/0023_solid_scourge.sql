CREATE TYPE "public"."submission_event_actor_type" AS ENUM('submitter', 'reviewer', 'system');--> statement-breakpoint
CREATE TYPE "public"."submission_relationship" AS ENUM('customer', 'employee', 'owner_or_authorized_representative', 'payment_provider', 'independent_researcher', 'other');--> statement-breakpoint
CREATE TYPE "public"."submission_target_type" AS ENUM('entity', 'location', 'claim', 'new_record');--> statement-breakpoint
CREATE TYPE "public"."submission_type" AS ENUM('suggest', 'payment_report', 'problem_report', 'claim', 'photos');--> statement-breakpoint
CREATE TABLE "submission_contacts" (
	"submission_id" uuid PRIMARY KEY NOT NULL,
	"encrypted_email" text NOT NULL,
	"email_hash" varchar(64) NOT NULL,
	"contact_allowed" boolean NOT NULL,
	"retention_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "submission_contacts_encrypted_email_nonempty" CHECK (length("submission_contacts"."encrypted_email") > 0),
	CONSTRAINT "submission_contacts_email_hash_sha256" CHECK ("submission_contacts"."email_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "submission_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"submission_id" uuid NOT NULL,
	"from_status" "submission_workflow_status",
	"to_status" "submission_workflow_status" NOT NULL,
	"action" varchar(96) NOT NULL,
	"reason_code" varchar(96),
	"actor_id" varchar(200) NOT NULL,
	"actor_type" "submission_event_actor_type" NOT NULL,
	"internal_note" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "submission_events_action_nonempty" CHECK (length(trim("submission_events"."action")) > 0),
	CONSTRAINT "submission_events_actor_nonempty" CHECK (length(trim("submission_events"."actor_id")) > 0),
	CONSTRAINT "submission_events_reason_nonempty" CHECK ("submission_events"."reason_code" is null or length(trim("submission_events"."reason_code")) > 0),
	CONSTRAINT "submission_events_note_nonempty" CHECK ("submission_events"."internal_note" is null or length(trim("submission_events"."internal_note")) > 0),
	CONSTRAINT "submission_events_status_change" CHECK ("submission_events"."from_status" is null or "submission_events"."from_status" <> "submission_events"."to_status")
);
--> statement-breakpoint
CREATE TABLE "submission_payloads" (
	"submission_id" uuid PRIMARY KEY NOT NULL,
	"original_payload" jsonb NOT NULL,
	"normalized_payload" jsonb,
	"proposed_changes" jsonb,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "submission_payloads_original_object" CHECK (jsonb_typeof("submission_payloads"."original_payload") = 'object'),
	CONSTRAINT "submission_payloads_normalized_object" CHECK ("submission_payloads"."normalized_payload" is null or jsonb_typeof("submission_payloads"."normalized_payload") = 'object'),
	CONSTRAINT "submission_payloads_proposed_object" CHECK ("submission_payloads"."proposed_changes" is null or jsonb_typeof("submission_payloads"."proposed_changes") = 'object')
);
--> statement-breakpoint
CREATE TABLE "submission_public_reference_counters" (
	"year" integer PRIMARY KEY NOT NULL,
	"next_sequence" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submission_public_reference_year_range" CHECK ("submission_public_reference_counters"."year" between 2000 and 9999),
	CONSTRAINT "submission_public_reference_sequence_range" CHECK ("submission_public_reference_counters"."next_sequence" between 2 and 1000000)
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"intake_request_id" uuid NOT NULL,
	"request_fingerprint" varchar(64) NOT NULL,
	"public_id" varchar(17) NOT NULL,
	"submission_type" "submission_type" NOT NULL,
	"target_type" "submission_target_type",
	"target_id" uuid,
	"relationship" "submission_relationship",
	"workflow_status" "submission_workflow_status" DEFAULT 'received' NOT NULL,
	"resolution" "submission_resolution",
	"priority" integer DEFAULT 0 NOT NULL,
	"status_token_hash" varchar(71) NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	CONSTRAINT "submissions_request_fingerprint_sha256" CHECK ("submissions"."request_fingerprint" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "submissions_public_id_shape" CHECK ("submissions"."public_id" ~ '^CPM-S-[0-9]{4}-[0-9]{6}$'),
	CONSTRAINT "submissions_status_token_hash_shape" CHECK ("submissions"."status_token_hash" ~ '^sha256:[a-f0-9]{64}$'),
	CONSTRAINT "submissions_priority_range" CHECK ("submissions"."priority" between 0 and 1000),
	CONSTRAINT "submissions_target_pair" CHECK (("submissions"."target_type" is null and "submissions"."target_id" is null) or ("submissions"."target_type" is not null and "submissions"."target_id" is not null)),
	CONSTRAINT "submissions_resolved_requires_resolution" CHECK ("submissions"."workflow_status" <> 'resolved' or "submissions"."resolution" is not null),
	CONSTRAINT "submissions_duplicate_resolution_shape" CHECK ("submissions"."workflow_status" <> 'duplicate' or "submissions"."resolution" is null or "submissions"."resolution" = 'duplicate'),
	CONSTRAINT "submissions_withdrawn_resolution_shape" CHECK ("submissions"."workflow_status" <> 'withdrawn' or "submissions"."resolution" is null or "submissions"."resolution" = 'withdrawn'),
	CONSTRAINT "submissions_update_order" CHECK ("submissions"."submitted_at" <= "submissions"."updated_at"),
	CONSTRAINT "submissions_resolved_time_order" CHECK ("submissions"."resolved_at" is null or ("submissions"."submitted_at" <= "submissions"."resolved_at" and "submissions"."resolved_at" <= "submissions"."updated_at")),
	CONSTRAINT "submissions_withdrawn_time_order" CHECK ("submissions"."withdrawn_at" is null or ("submissions"."submitted_at" <= "submissions"."withdrawn_at" and "submissions"."withdrawn_at" <= "submissions"."updated_at"))
);
--> statement-breakpoint
ALTER TABLE "submission_contacts" ADD CONSTRAINT "submission_contacts_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_events" ADD CONSTRAINT "submission_events_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_payloads" ADD CONSTRAINT "submission_payloads_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "submission_contacts_email_hash_idx" ON "submission_contacts" USING btree ("email_hash");--> statement-breakpoint
CREATE INDEX "submission_contacts_retention_idx" ON "submission_contacts" USING btree ("retention_until");--> statement-breakpoint
CREATE INDEX "submission_events_submission_created_idx" ON "submission_events" USING btree ("submission_id","created_at");--> statement-breakpoint
CREATE INDEX "submission_events_actor_created_idx" ON "submission_events" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_intake_request_unique" ON "submissions" USING btree ("intake_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_public_id_unique" ON "submissions" USING btree ("public_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_status_token_hash_unique" ON "submissions" USING btree ("status_token_hash");--> statement-breakpoint
CREATE INDEX "submissions_workflow_priority_idx" ON "submissions" USING btree ("workflow_status","priority","submitted_at");--> statement-breakpoint
CREATE INDEX "submissions_type_submitted_idx" ON "submissions" USING btree ("submission_type","submitted_at");--> statement-breakpoint
CREATE INDEX "submissions_target_idx" ON "submissions" USING btree ("target_type","target_id");