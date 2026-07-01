CREATE TYPE "public"."evidence_review_claim_action" AS ENUM('no_change', 'confirm', 'mark_stale', 'end', 'reject');--> statement-breakpoint
CREATE TYPE "public"."evidence_review_disposition" AS ENUM('accepted', 'rejected', 'held');--> statement-breakpoint
CREATE TYPE "public"."evidence_review_finding" AS ENUM('supports_claim', 'contradicts_claim', 'insufficient');--> statement-breakpoint
ALTER TYPE "public"."verification_event_type" ADD VALUE 'rejected' BEFORE 'restored';--> statement-breakpoint
CREATE TABLE "evidence_review_decisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"disposition" "evidence_review_disposition" NOT NULL,
	"finding" "evidence_review_finding" NOT NULL,
	"claim_action" "evidence_review_claim_action" NOT NULL,
	"evidence_review_status" "evidence_review_status" NOT NULL,
	"from_claim_status" "acceptance_claim_status" NOT NULL,
	"to_claim_status" "acceptance_claim_status" NOT NULL,
	"claim_visibility" "claim_visibility" NOT NULL,
	"verification_event_id" uuid,
	"expected_evidence_updated_at" timestamp with time zone NOT NULL,
	"expected_claim_updated_at" timestamp with time zone NOT NULL,
	"expected_accepted_evidence_ids" jsonb NOT NULL,
	"actor_id" varchar(200) NOT NULL,
	"actor_type" "admin_actor_type" NOT NULL,
	"reason_code" varchar(96) NOT NULL,
	"public_summary" text,
	"internal_note" text,
	"next_review_at" timestamp with time zone,
	"ended_reason" text,
	"decided_at" timestamp with time zone NOT NULL,
	"request_fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_review_decisions_expected_set_array" CHECK (jsonb_typeof("evidence_review_decisions"."expected_accepted_evidence_ids") = 'array' and jsonb_array_length("evidence_review_decisions"."expected_accepted_evidence_ids") between 0 and 100),
	CONSTRAINT "evidence_review_decisions_actor_nonempty" CHECK (length(trim("evidence_review_decisions"."actor_id")) > 0),
	CONSTRAINT "evidence_review_decisions_reason_nonempty" CHECK (length(trim("evidence_review_decisions"."reason_code")) > 0),
	CONSTRAINT "evidence_review_decisions_fingerprint_nonempty" CHECK (length("evidence_review_decisions"."request_fingerprint") > 0),
	CONSTRAINT "evidence_review_decisions_summary_required" CHECK ("evidence_review_decisions"."public_summary" is not null or "evidence_review_decisions"."internal_note" is not null),
	CONSTRAINT "evidence_review_decisions_summary_nonempty" CHECK ("evidence_review_decisions"."public_summary" is null or length(trim("evidence_review_decisions"."public_summary")) > 0),
	CONSTRAINT "evidence_review_decisions_note_nonempty" CHECK ("evidence_review_decisions"."internal_note" is null or length(trim("evidence_review_decisions"."internal_note")) > 0),
	CONSTRAINT "evidence_review_decisions_time_order" CHECK ("evidence_review_decisions"."expected_evidence_updated_at" <= "evidence_review_decisions"."decided_at" and "evidence_review_decisions"."expected_claim_updated_at" <= "evidence_review_decisions"."decided_at"),
	CONSTRAINT "evidence_review_decisions_disposition_shape" CHECK (("evidence_review_decisions"."disposition" = 'accepted' and "evidence_review_decisions"."evidence_review_status" = 'accepted') or ("evidence_review_decisions"."disposition" = 'rejected' and "evidence_review_decisions"."evidence_review_status" = 'rejected' and "evidence_review_decisions"."finding" = 'insufficient' and "evidence_review_decisions"."claim_action" = 'no_change') or ("evidence_review_decisions"."disposition" = 'held' and "evidence_review_decisions"."evidence_review_status" = 'pending' and "evidence_review_decisions"."finding" = 'insufficient' and "evidence_review_decisions"."claim_action" = 'no_change')),
	CONSTRAINT "evidence_review_decisions_action_event_shape" CHECK (("evidence_review_decisions"."claim_action" = 'no_change' and "evidence_review_decisions"."verification_event_id" is null and "evidence_review_decisions"."from_claim_status" = "evidence_review_decisions"."to_claim_status") or ("evidence_review_decisions"."claim_action" <> 'no_change' and "evidence_review_decisions"."disposition" = 'accepted' and "evidence_review_decisions"."verification_event_id" is not null)),
	CONSTRAINT "evidence_review_decisions_confirm_shape" CHECK ("evidence_review_decisions"."claim_action" <> 'confirm' or ("evidence_review_decisions"."finding" = 'supports_claim' and "evidence_review_decisions"."from_claim_status" in ('candidate', 'confirmed', 'stale') and "evidence_review_decisions"."to_claim_status" = 'confirmed' and "evidence_review_decisions"."next_review_at" is not null and "evidence_review_decisions"."next_review_at" > "evidence_review_decisions"."decided_at")),
	CONSTRAINT "evidence_review_decisions_stale_shape" CHECK ("evidence_review_decisions"."claim_action" <> 'mark_stale' or ("evidence_review_decisions"."finding" = 'contradicts_claim' and "evidence_review_decisions"."from_claim_status" = 'confirmed' and "evidence_review_decisions"."to_claim_status" = 'stale' and "evidence_review_decisions"."next_review_at" is not null and "evidence_review_decisions"."next_review_at" > "evidence_review_decisions"."decided_at")),
	CONSTRAINT "evidence_review_decisions_end_shape" CHECK ("evidence_review_decisions"."claim_action" <> 'end' or ("evidence_review_decisions"."finding" = 'contradicts_claim' and "evidence_review_decisions"."from_claim_status" in ('confirmed', 'stale') and "evidence_review_decisions"."to_claim_status" = 'ended' and "evidence_review_decisions"."ended_reason" is not null)),
	CONSTRAINT "evidence_review_decisions_reject_shape" CHECK ("evidence_review_decisions"."claim_action" <> 'reject' or ("evidence_review_decisions"."finding" = 'contradicts_claim' and "evidence_review_decisions"."from_claim_status" = 'candidate' and "evidence_review_decisions"."to_claim_status" = 'rejected')),
	CONSTRAINT "evidence_review_decisions_optional_action_fields" CHECK (("evidence_review_decisions"."claim_action" in ('confirm', 'mark_stale') or "evidence_review_decisions"."next_review_at" is null) and ("evidence_review_decisions"."claim_action" = 'end' or "evidence_review_decisions"."ended_reason" is null))
);
--> statement-breakpoint
ALTER TABLE "verification_events" DROP CONSTRAINT "verification_events_status_event_shape";--> statement-breakpoint
ALTER TABLE "evidence_review_decisions" ADD CONSTRAINT "evidence_review_decisions_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_review_decisions" ADD CONSTRAINT "evidence_review_decisions_claim_id_acceptance_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."acceptance_claims"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_review_decisions" ADD CONSTRAINT "evidence_review_decisions_verification_event_id_verification_events_id_fk" FOREIGN KEY ("verification_event_id") REFERENCES "public"."verification_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_review_decisions_request_unique" ON "evidence_review_decisions" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "evidence_review_decisions_evidence_idx" ON "evidence_review_decisions" USING btree ("evidence_id","decided_at");--> statement-breakpoint
CREATE INDEX "evidence_review_decisions_claim_idx" ON "evidence_review_decisions" USING btree ("claim_id","decided_at");--> statement-breakpoint
CREATE INDEX "evidence_review_decisions_actor_idx" ON "evidence_review_decisions" USING btree ("actor_id","decided_at");--> statement-breakpoint
CREATE INDEX "evidence_review_decisions_event_idx" ON "evidence_review_decisions" USING btree ("verification_event_id");--> statement-breakpoint
ALTER TABLE "verification_events" ADD CONSTRAINT "verification_events_rejected_transition" CHECK ("verification_events"."event_type" <> 'rejected' or ("verification_events"."from_status" = 'candidate' and "verification_events"."to_status" = 'rejected'));--> statement-breakpoint
ALTER TABLE "verification_events" ADD CONSTRAINT "verification_events_status_event_shape" CHECK ("verification_events"."event_type" not in ('confirmed', 'reconfirmed', 'marked_stale', 'ended', 'rejected', 'restored') or ("verification_events"."from_visibility" is null and "verification_events"."to_visibility" is null));