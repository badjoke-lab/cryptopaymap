CREATE TYPE "public"."network_status" AS ENUM('active', 'deprecated');--> statement-breakpoint
CREATE TABLE "networks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(120) NOT NULL,
	"aliases" text[],
	"status" "network_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "networks_slug_unique" ON "networks" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "networks_status_idx" ON "networks" USING btree ("status");