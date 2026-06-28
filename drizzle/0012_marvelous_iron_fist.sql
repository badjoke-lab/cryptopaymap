CREATE TYPE "public"."admin_actor_type" AS ENUM('human', 'system');--> statement-breakpoint
CREATE TYPE "public"."import_kind" AS ENUM('physical_place', 'online_service');--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"request_id" uuid NOT NULL,
	"actor_id" varchar(200) NOT NULL,
	"actor_type" "admin_actor_type" NOT NULL,
	"source_id" uuid NOT NULL,
	"import_kind" "import_kind" NOT NULL,
	"source_schema_version" varchar(96) NOT NULL,
	"importer_version" varchar(32) NOT NULL,
	"input_checksum" varchar(64) NOT NULL,
	"input_count" integer NOT NULL,
	"accepted_count" integer NOT NULL,
	"rejected_count" integer NOT NULL,
	"replayed_count" integer NOT NULL,
	"out_of_scope_count" integer DEFAULT 0 NOT NULL,
	"duplicate_signal_count" integer DEFAULT 0 NOT NULL,
	"automatic_confirmed_count" integer DEFAULT 0 NOT NULL,
	"rejection_summary" jsonb NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_batches_actor_id_nonempty" CHECK (length(trim("import_batches"."actor_id")) > 0),
	CONSTRAINT "import_batches_source_schema_version_nonempty" CHECK (length(trim("import_batches"."source_schema_version")) > 0),
	CONSTRAINT "import_batches_importer_version_nonempty" CHECK (length(trim("import_batches"."importer_version")) > 0),
	CONSTRAINT "import_batches_input_checksum_sha256" CHECK ("import_batches"."input_checksum" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "import_batches_counts_nonnegative" CHECK ("import_batches"."input_count" >= 0 and "import_batches"."accepted_count" >= 0 and "import_batches"."rejected_count" >= 0 and "import_batches"."replayed_count" >= 0 and "import_batches"."out_of_scope_count" >= 0 and "import_batches"."duplicate_signal_count" >= 0 and "import_batches"."automatic_confirmed_count" >= 0),
	CONSTRAINT "import_batches_input_count_shape" CHECK ("import_batches"."input_count" = "import_batches"."accepted_count" + "import_batches"."rejected_count" + "import_batches"."replayed_count"),
	CONSTRAINT "import_batches_out_of_scope_subset" CHECK ("import_batches"."out_of_scope_count" <= "import_batches"."rejected_count"),
	CONSTRAINT "import_batches_no_automatic_confirmed" CHECK ("import_batches"."automatic_confirmed_count" = 0),
	CONSTRAINT "import_batches_time_order" CHECK ("import_batches"."started_at" <= "import_batches"."completed_at")
);
--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "import_batches_request_id_unique" ON "import_batches" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "import_batches_source_checksum_unique" ON "import_batches" USING btree ("source_id","import_kind","importer_version","input_checksum");--> statement-breakpoint
CREATE INDEX "import_batches_actor_completed_idx" ON "import_batches" USING btree ("actor_id","completed_at");--> statement-breakpoint
CREATE INDEX "import_batches_source_completed_idx" ON "import_batches" USING btree ("source_id","completed_at");--> statement-breakpoint
CREATE INDEX "import_batches_kind_completed_idx" ON "import_batches" USING btree ("import_kind","completed_at");