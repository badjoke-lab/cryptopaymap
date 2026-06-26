CREATE TYPE "public"."payment_registry_status" AS ENUM('active', 'deprecated');--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(120) NOT NULL,
	"aliases" text[],
	"description" text,
	"status" "payment_registry_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" "route_type" NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"status" "payment_registry_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_methods_slug_unique" ON "payment_methods" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "payment_methods_status_idx" ON "payment_methods" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_routes_slug_unique" ON "payment_routes" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "payment_routes_status_idx" ON "payment_routes" USING btree ("status");