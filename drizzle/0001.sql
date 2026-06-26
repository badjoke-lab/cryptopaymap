CREATE TYPE "public"."asset_type" AS ENUM('native', 'token', 'other');--> statement-breakpoint
CREATE TYPE "public"."asset_status" AS ENUM('active', 'deprecated');--> statement-breakpoint
CREATE TABLE "assets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" varchar(64) NOT NULL,
  "symbol" varchar(16) NOT NULL,
  "name" varchar(120) NOT NULL,
  "aliases" text[],
  "asset_type" "asset_type" NOT NULL,
  "is_stablecoin" boolean DEFAULT false NOT NULL,
  "is_wrapped" boolean DEFAULT false NOT NULL,
  "default_decimals" smallint,
  "status" "asset_status" DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "assets_slug_unique" ON "assets" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX "assets_symbol_idx" ON "assets" USING btree ("symbol");
--> statement-breakpoint
CREATE INDEX "assets_status_idx" ON "assets" USING btree ("status");
