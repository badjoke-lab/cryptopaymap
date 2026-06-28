CREATE TYPE "public"."candidate_duplicate_decision_action" AS ENUM('confirm_duplicate', 'dismiss_signal');--> statement-breakpoint
CREATE TYPE "public"."candidate_duplicate_decision_reason" AS ENUM('same_osm_identity', 'same_physical_location', 'same_official_domain', 'same_online_service', 'manual_match', 'different_location', 'different_business', 'different_service', 'insufficient_evidence', 'stale_signal', 'other');--> statement-breakpoint
CREATE TYPE "public"."candidate_duplicate_signal_reason" AS ENUM('shared_osm_identity', 'same_name_and_coordinates', 'shared_official_domain', 'same_normalized_name');--> statement-breakpoint
CREATE TYPE "public"."candidate_duplicate_signal_strength" AS ENUM('strong', 'review');--> statement-breakpoint
CREATE TABLE "candidate_duplicate_decisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"duplicate_group_id" uuid NOT NULL,
	"action" "candidate_duplicate_decision_action" NOT NULL,
	"primary_candidate_id" uuid,
	"member_candidate_ids" jsonb NOT NULL,
	"previous_member_states" jsonb NOT NULL,
	"reason_code" "candidate_duplicate_decision_reason" NOT NULL,
	"note" text,
	"actor_id" varchar(200) NOT NULL,
	"actor_type" "admin_actor_type" NOT NULL,
	"expected_group_updated_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone NOT NULL,
	"decision_fingerprint" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_duplicate_decisions_actor_nonempty" CHECK (length(trim("candidate_duplicate_decisions"."actor_id")) > 0),
	CONSTRAINT "candidate_duplicate_decisions_note_nonempty" CHECK ("candidate_duplicate_decisions"."note" is null or length(trim("candidate_duplicate_decisions"."note")) > 0),
	CONSTRAINT "candidate_duplicate_decisions_members_array" CHECK (jsonb_typeof("candidate_duplicate_decisions"."member_candidate_ids") = 'array' and jsonb_array_length("candidate_duplicate_decisions"."member_candidate_ids") between 2 and 50),
	CONSTRAINT "candidate_duplicate_decisions_previous_states_array" CHECK (jsonb_typeof("candidate_duplicate_decisions"."previous_member_states") = 'array' and jsonb_array_length("candidate_duplicate_decisions"."previous_member_states") = jsonb_array_length("candidate_duplicate_decisions"."member_candidate_ids")),
	CONSTRAINT "candidate_duplicate_decisions_action_shape" CHECK (("candidate_duplicate_decisions"."action" = 'confirm_duplicate' and "candidate_duplicate_decisions"."primary_candidate_id" is not null) or ("candidate_duplicate_decisions"."action" = 'dismiss_signal' and "candidate_duplicate_decisions"."primary_candidate_id" is null)),
	CONSTRAINT "candidate_duplicate_decisions_fingerprint_sha256" CHECK ("candidate_duplicate_decisions"."decision_fingerprint" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "candidate_duplicate_signals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"duplicate_group_id" uuid NOT NULL,
	"left_candidate_id" uuid NOT NULL,
	"right_candidate_id" uuid NOT NULL,
	"reason" "candidate_duplicate_signal_reason" NOT NULL,
	"strength" "candidate_duplicate_signal_strength" NOT NULL,
	"import_batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_duplicate_signals_distinct_candidates" CHECK ("candidate_duplicate_signals"."left_candidate_id" <> "candidate_duplicate_signals"."right_candidate_id"),
	CONSTRAINT "candidate_duplicate_signals_ordered_candidates" CHECK ("candidate_duplicate_signals"."left_candidate_id" < "candidate_duplicate_signals"."right_candidate_id")
);
--> statement-breakpoint
ALTER TABLE "candidate_duplicate_decisions" ADD CONSTRAINT "candidate_duplicate_decisions_duplicate_group_id_candidate_duplicate_groups_id_fk" FOREIGN KEY ("duplicate_group_id") REFERENCES "public"."candidate_duplicate_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_duplicate_decisions" ADD CONSTRAINT "candidate_duplicate_decisions_primary_candidate_id_source_candidates_id_fk" FOREIGN KEY ("primary_candidate_id") REFERENCES "public"."source_candidates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_duplicate_signals" ADD CONSTRAINT "candidate_duplicate_signals_duplicate_group_id_candidate_duplicate_groups_id_fk" FOREIGN KEY ("duplicate_group_id") REFERENCES "public"."candidate_duplicate_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_duplicate_signals" ADD CONSTRAINT "candidate_duplicate_signals_left_candidate_id_source_candidates_id_fk" FOREIGN KEY ("left_candidate_id") REFERENCES "public"."source_candidates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_duplicate_signals" ADD CONSTRAINT "candidate_duplicate_signals_right_candidate_id_source_candidates_id_fk" FOREIGN KEY ("right_candidate_id") REFERENCES "public"."source_candidates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_duplicate_signals" ADD CONSTRAINT "candidate_duplicate_signals_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_duplicate_decisions_request_unique" ON "candidate_duplicate_decisions" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_duplicate_decisions_group_unique" ON "candidate_duplicate_decisions" USING btree ("duplicate_group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_duplicate_decisions_fingerprint_unique" ON "candidate_duplicate_decisions" USING btree ("decision_fingerprint");--> statement-breakpoint
CREATE INDEX "candidate_duplicate_decisions_actor_idx" ON "candidate_duplicate_decisions" USING btree ("actor_id","decided_at");--> statement-breakpoint
CREATE INDEX "candidate_duplicate_decisions_primary_idx" ON "candidate_duplicate_decisions" USING btree ("primary_candidate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_duplicate_signals_identity_unique" ON "candidate_duplicate_signals" USING btree ("duplicate_group_id","left_candidate_id","right_candidate_id","reason");--> statement-breakpoint
CREATE INDEX "candidate_duplicate_signals_group_idx" ON "candidate_duplicate_signals" USING btree ("duplicate_group_id","created_at");--> statement-breakpoint
CREATE INDEX "candidate_duplicate_signals_left_idx" ON "candidate_duplicate_signals" USING btree ("left_candidate_id");--> statement-breakpoint
CREATE INDEX "candidate_duplicate_signals_right_idx" ON "candidate_duplicate_signals" USING btree ("right_candidate_id");--> statement-breakpoint
CREATE INDEX "candidate_duplicate_signals_import_batch_idx" ON "candidate_duplicate_signals" USING btree ("import_batch_id");