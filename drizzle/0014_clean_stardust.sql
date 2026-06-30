CREATE TABLE "candidate_promotion_decisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"location_id" uuid,
	"claim_id" uuid NOT NULL,
	"claim_asset_ids" jsonb NOT NULL,
	"source_record_ids" jsonb NOT NULL,
	"canonical_path" text NOT NULL,
	"actor_id" varchar(200) NOT NULL,
	"actor_type" "admin_actor_type" NOT NULL,
	"expected_candidate_updated_at" timestamp with time zone NOT NULL,
	"promoted_at" timestamp with time zone NOT NULL,
	"request_fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_promotion_decisions_claim_assets_array" CHECK (jsonb_typeof("candidate_promotion_decisions"."claim_asset_ids") = 'array' and jsonb_array_length("candidate_promotion_decisions"."claim_asset_ids") between 1 and 100),
	CONSTRAINT "candidate_promotion_decisions_source_records_array" CHECK (jsonb_typeof("candidate_promotion_decisions"."source_record_ids") = 'array' and jsonb_array_length("candidate_promotion_decisions"."source_record_ids") between 1 and 100),
	CONSTRAINT "candidate_promotion_decisions_canonical_path_format" CHECK ("candidate_promotion_decisions"."canonical_path" ~ '^/(place|service)/[^/?#]+$'),
	CONSTRAINT "candidate_promotion_decisions_actor_nonempty" CHECK (length(trim("candidate_promotion_decisions"."actor_id")) > 0),
	CONSTRAINT "candidate_promotion_decisions_fingerprint_nonempty" CHECK (length("candidate_promotion_decisions"."request_fingerprint") > 0),
	CONSTRAINT "candidate_promotion_decisions_time_order" CHECK ("candidate_promotion_decisions"."expected_candidate_updated_at" <= "candidate_promotion_decisions"."promoted_at"),
	CONSTRAINT "candidate_promotion_decisions_location_shape" CHECK (("candidate_promotion_decisions"."canonical_path" like '/place/%' and "candidate_promotion_decisions"."location_id" is not null) or ("candidate_promotion_decisions"."canonical_path" like '/service/%' and "candidate_promotion_decisions"."location_id" is null))
);
--> statement-breakpoint
ALTER TABLE "candidate_promotion_decisions" ADD CONSTRAINT "candidate_promotion_decisions_candidate_id_source_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."source_candidates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_promotion_decisions" ADD CONSTRAINT "candidate_promotion_decisions_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_promotion_decisions" ADD CONSTRAINT "candidate_promotion_decisions_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_promotion_decisions" ADD CONSTRAINT "candidate_promotion_decisions_claim_id_acceptance_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."acceptance_claims"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_promotion_decisions_request_unique" ON "candidate_promotion_decisions" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_promotion_decisions_candidate_unique" ON "candidate_promotion_decisions" USING btree ("candidate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_promotion_decisions_claim_unique" ON "candidate_promotion_decisions" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "candidate_promotion_decisions_entity_idx" ON "candidate_promotion_decisions" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "candidate_promotion_decisions_location_idx" ON "candidate_promotion_decisions" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "candidate_promotion_decisions_actor_idx" ON "candidate_promotion_decisions" USING btree ("actor_id","promoted_at");