CREATE TABLE "location_profile_correction_decisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"actor_id" varchar(200) NOT NULL,
	"actor_type" "admin_actor_type" NOT NULL,
	"expected_location_updated_at" timestamp with time zone NOT NULL,
	"changed_field_paths" jsonb NOT NULL,
	"changes" jsonb NOT NULL,
	"before_values" jsonb NOT NULL,
	"after_values" jsonb NOT NULL,
	"source_record_ids" jsonb NOT NULL,
	"provenance_assignments" jsonb NOT NULL,
	"reason_code" varchar(96) NOT NULL,
	"public_summary" text,
	"internal_note" text,
	"decided_at" timestamp with time zone NOT NULL,
	"request_fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "location_profile_corrections_fields_array" CHECK (jsonb_typeof("location_profile_correction_decisions"."changed_field_paths") = 'array' and jsonb_array_length("location_profile_correction_decisions"."changed_field_paths") between 1 and 10),
	CONSTRAINT "location_profile_corrections_changes_object" CHECK (jsonb_typeof("location_profile_correction_decisions"."changes") = 'object'),
	CONSTRAINT "location_profile_corrections_before_object" CHECK (jsonb_typeof("location_profile_correction_decisions"."before_values") = 'object'),
	CONSTRAINT "location_profile_corrections_after_object" CHECK (jsonb_typeof("location_profile_correction_decisions"."after_values") = 'object'),
	CONSTRAINT "location_profile_corrections_sources_array" CHECK (jsonb_typeof("location_profile_correction_decisions"."source_record_ids") = 'array' and jsonb_array_length("location_profile_correction_decisions"."source_record_ids") between 1 and 100),
	CONSTRAINT "location_profile_corrections_assignments_array" CHECK (jsonb_typeof("location_profile_correction_decisions"."provenance_assignments") = 'array' and jsonb_array_length("location_profile_correction_decisions"."provenance_assignments") between 1 and 10),
	CONSTRAINT "location_profile_corrections_actor_nonempty" CHECK (length(trim("location_profile_correction_decisions"."actor_id")) > 0),
	CONSTRAINT "location_profile_corrections_reason_nonempty" CHECK (length(trim("location_profile_correction_decisions"."reason_code")) > 0),
	CONSTRAINT "location_profile_corrections_fingerprint_nonempty" CHECK (length("location_profile_correction_decisions"."request_fingerprint") > 0),
	CONSTRAINT "location_profile_corrections_summary_required" CHECK ("location_profile_correction_decisions"."public_summary" is not null or "location_profile_correction_decisions"."internal_note" is not null),
	CONSTRAINT "location_profile_corrections_summary_nonempty" CHECK ("location_profile_correction_decisions"."public_summary" is null or length(trim("location_profile_correction_decisions"."public_summary")) > 0),
	CONSTRAINT "location_profile_corrections_note_nonempty" CHECK ("location_profile_correction_decisions"."internal_note" is null or length(trim("location_profile_correction_decisions"."internal_note")) > 0),
	CONSTRAINT "location_profile_corrections_time_order" CHECK ("location_profile_correction_decisions"."expected_location_updated_at" <= "location_profile_correction_decisions"."decided_at")
);
--> statement-breakpoint
ALTER TABLE "location_profile_correction_decisions" ADD CONSTRAINT "location_profile_correction_decisions_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "location_profile_corrections_request_unique" ON "location_profile_correction_decisions" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "location_profile_corrections_location_idx" ON "location_profile_correction_decisions" USING btree ("location_id","decided_at");--> statement-breakpoint
CREATE INDEX "location_profile_corrections_actor_idx" ON "location_profile_correction_decisions" USING btree ("actor_id","decided_at");