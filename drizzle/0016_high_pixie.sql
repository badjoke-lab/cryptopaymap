CREATE TABLE "reconfirmation_expirations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"from_claim_status" "acceptance_claim_status" NOT NULL,
	"to_claim_status" "acceptance_claim_status" NOT NULL,
	"claim_visibility" "claim_visibility" NOT NULL,
	"verification_event_id" uuid NOT NULL,
	"expected_claim_updated_at" timestamp with time zone NOT NULL,
	"expected_next_review_at" timestamp with time zone NOT NULL,
	"actor_id" varchar(200) NOT NULL,
	"actor_type" "admin_actor_type" NOT NULL,
	"reason_code" varchar(96) NOT NULL,
	"public_summary" text,
	"internal_note" text,
	"effective_at" timestamp with time zone NOT NULL,
	"request_fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reconfirmation_expirations_status_shape" CHECK ("reconfirmation_expirations"."from_claim_status" = 'confirmed' and "reconfirmation_expirations"."to_claim_status" = 'stale'),
	CONSTRAINT "reconfirmation_expirations_actor_shape" CHECK ("reconfirmation_expirations"."actor_type" = 'system' and length(trim("reconfirmation_expirations"."actor_id")) > 0),
	CONSTRAINT "reconfirmation_expirations_reason_shape" CHECK ("reconfirmation_expirations"."reason_code" = 'review_window_expired'),
	CONSTRAINT "reconfirmation_expirations_summary_nonempty" CHECK ("reconfirmation_expirations"."public_summary" is null or length(trim("reconfirmation_expirations"."public_summary")) > 0),
	CONSTRAINT "reconfirmation_expirations_note_nonempty" CHECK ("reconfirmation_expirations"."internal_note" is null or length(trim("reconfirmation_expirations"."internal_note")) > 0),
	CONSTRAINT "reconfirmation_expirations_time_order" CHECK ("reconfirmation_expirations"."expected_claim_updated_at" <= "reconfirmation_expirations"."effective_at" and "reconfirmation_expirations"."expected_next_review_at" <= "reconfirmation_expirations"."effective_at"),
	CONSTRAINT "reconfirmation_expirations_fingerprint_nonempty" CHECK (length("reconfirmation_expirations"."request_fingerprint") > 0)
);
--> statement-breakpoint
ALTER TABLE "reconfirmation_expirations" ADD CONSTRAINT "reconfirmation_expirations_claim_id_acceptance_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."acceptance_claims"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconfirmation_expirations" ADD CONSTRAINT "reconfirmation_expirations_verification_event_id_verification_events_id_fk" FOREIGN KEY ("verification_event_id") REFERENCES "public"."verification_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reconfirmation_expirations_request_unique" ON "reconfirmation_expirations" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "reconfirmation_expirations_claim_idx" ON "reconfirmation_expirations" USING btree ("claim_id","effective_at");--> statement-breakpoint
CREATE INDEX "reconfirmation_expirations_event_idx" ON "reconfirmation_expirations" USING btree ("verification_event_id");--> statement-breakpoint
CREATE INDEX "reconfirmation_expirations_actor_idx" ON "reconfirmation_expirations" USING btree ("actor_id","effective_at");