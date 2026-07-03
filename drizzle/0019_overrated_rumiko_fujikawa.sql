CREATE TYPE "public"."export_activation_status" AS ENUM('active');--> statement-breakpoint
CREATE TABLE "export_activation_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"approval_request_id" uuid NOT NULL,
	"activation_status" "export_activation_status" NOT NULL,
	"snapshot_digest" varchar(64) NOT NULL,
	"dataset_version" varchar(64) NOT NULL,
	"schema_version" varchar(32) NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"previous_snapshot_digest" varchar(64),
	"pointer_key" varchar(512) NOT NULL,
	"release_prefix" varchar(512) NOT NULL,
	"artifact_count" integer NOT NULL,
	"actor_id" varchar(200) NOT NULL,
	"actor_type" "admin_actor_type" NOT NULL,
	"reason_code" varchar(96) NOT NULL,
	"internal_note" text,
	"request_fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "export_activation_records_digest_shape" CHECK ("export_activation_records"."snapshot_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "export_activation_records_previous_digest_shape" CHECK ("export_activation_records"."previous_snapshot_digest" is null or "export_activation_records"."previous_snapshot_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "export_activation_records_distinct_previous_digest" CHECK ("export_activation_records"."previous_snapshot_digest" is null or "export_activation_records"."previous_snapshot_digest" <> "export_activation_records"."snapshot_digest"),
	CONSTRAINT "export_activation_records_artifact_count_range" CHECK ("export_activation_records"."artifact_count" between 1 and 100),
	CONSTRAINT "export_activation_records_time_order" CHECK ("export_activation_records"."generated_at" <= "export_activation_records"."published_at"),
	CONSTRAINT "export_activation_records_actor_nonempty" CHECK (length(trim("export_activation_records"."actor_id")) > 0),
	CONSTRAINT "export_activation_records_reason_nonempty" CHECK (length(trim("export_activation_records"."reason_code")) > 0),
	CONSTRAINT "export_activation_records_fingerprint_nonempty" CHECK (length("export_activation_records"."request_fingerprint") > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "export_activation_records_request_unique" ON "export_activation_records" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "export_activation_records_snapshot_unique" ON "export_activation_records" USING btree ("snapshot_digest");--> statement-breakpoint
CREATE UNIQUE INDEX "export_activation_records_dataset_unique" ON "export_activation_records" USING btree ("dataset_version");--> statement-breakpoint
CREATE INDEX "export_activation_records_published_idx" ON "export_activation_records" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "export_activation_records_actor_idx" ON "export_activation_records" USING btree ("actor_id","published_at");
