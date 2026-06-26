CREATE TYPE "public"."verification_actor_type" AS ENUM('operator', 'system', 'import');--> statement-breakpoint
CREATE TYPE "public"."verification_event_type" AS ENUM('confirmed', 'reconfirmed', 'marked_stale', 'ended', 'restored', 'corrected', 'hidden', 'unhidden');--> statement-breakpoint
CREATE TYPE "public"."verification_evidence_relationship" AS ENUM('basis', 'contradiction', 'context', 'superseded');--> statement-breakpoint
CREATE TABLE "verification_event_evidence" (
	"verification_event_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	"relationship" "verification_evidence_relationship" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_event_evidence_pk" PRIMARY KEY("verification_event_id","evidence_id")
);
--> statement-breakpoint
CREATE TABLE "verification_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"event_type" "verification_event_type" NOT NULL,
	"from_status" "acceptance_claim_status",
	"to_status" "acceptance_claim_status",
	"from_visibility" "claim_visibility",
	"to_visibility" "claim_visibility",
	"reason_code" varchar(96) NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"public_summary" text,
	"internal_note" text,
	"actor_type" "verification_actor_type" DEFAULT 'operator' NOT NULL,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_events_reason_nonempty" CHECK (length(trim("verification_events"."reason_code")) > 0),
	CONSTRAINT "verification_events_public_summary_nonempty" CHECK ("verification_events"."public_summary" is null or length(trim("verification_events"."public_summary")) > 0),
	CONSTRAINT "verification_events_internal_note_nonempty" CHECK ("verification_events"."internal_note" is null or length(trim("verification_events"."internal_note")) > 0),
	CONSTRAINT "verification_events_transition_present" CHECK ("verification_events"."to_status" is not null or "verification_events"."to_visibility" is not null or "verification_events"."event_type" = 'corrected'),
	CONSTRAINT "verification_events_confirmed_transition" CHECK ("verification_events"."event_type" <> 'confirmed' or ("verification_events"."to_status" = 'confirmed' and ("verification_events"."from_status" is null or "verification_events"."from_status" = 'candidate'))),
	CONSTRAINT "verification_events_reconfirmed_transition" CHECK ("verification_events"."event_type" <> 'reconfirmed' or ("verification_events"."from_status" = 'confirmed' and "verification_events"."to_status" = 'confirmed')),
	CONSTRAINT "verification_events_stale_transition" CHECK ("verification_events"."event_type" <> 'marked_stale' or ("verification_events"."from_status" = 'confirmed' and "verification_events"."to_status" = 'stale')),
	CONSTRAINT "verification_events_ended_transition" CHECK ("verification_events"."event_type" <> 'ended' or ("verification_events"."from_status" in ('confirmed', 'stale') and "verification_events"."to_status" = 'ended')),
	CONSTRAINT "verification_events_restored_transition" CHECK ("verification_events"."event_type" <> 'restored' or ("verification_events"."from_status" = 'stale' and "verification_events"."to_status" = 'confirmed')),
	CONSTRAINT "verification_events_hidden_transition" CHECK ("verification_events"."event_type" <> 'hidden' or ("verification_events"."to_visibility" in ('hidden', 'temporarily_hidden') and ("verification_events"."from_visibility" is null or "verification_events"."from_visibility" = 'public'))),
	CONSTRAINT "verification_events_unhidden_transition" CHECK ("verification_events"."event_type" <> 'unhidden' or ("verification_events"."from_visibility" in ('hidden', 'temporarily_hidden') and "verification_events"."to_visibility" = 'public'))
);
--> statement-breakpoint
ALTER TABLE "verification_event_evidence" ADD CONSTRAINT "verification_event_evidence_verification_event_id_verification_events_id_fk" FOREIGN KEY ("verification_event_id") REFERENCES "public"."verification_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_event_evidence" ADD CONSTRAINT "verification_event_evidence_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_events" ADD CONSTRAINT "verification_events_claim_id_acceptance_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."acceptance_claims"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "verification_event_evidence_relationship_unique" ON "verification_event_evidence" USING btree ("verification_event_id","evidence_id","relationship");--> statement-breakpoint
CREATE INDEX "verification_event_evidence_evidence_idx" ON "verification_event_evidence" USING btree ("evidence_id");--> statement-breakpoint
CREATE INDEX "verification_events_claim_effective_idx" ON "verification_events" USING btree ("claim_id","effective_at");--> statement-breakpoint
CREATE INDEX "verification_events_type_idx" ON "verification_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "verification_events_reason_idx" ON "verification_events" USING btree ("reason_code");