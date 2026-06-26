import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { claimVisibilityEnum } from './enums';
import { entities } from './entities';

export const locationStatusValues = [
  'active',
  'temporarily_closed',
  'closed',
  'unknown',
] as const;
export const osmElementTypeValues = ['node', 'way', 'relation'] as const;

export const locationStatusEnum = pgEnum('location_status', locationStatusValues);
export const osmElementTypeEnum = pgEnum('osm_element_type', osmElementTypeValues);

export const locations = pgTable(
  'locations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    entityId: uuid('entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 160 }),
    slug: varchar('slug', { length: 64 }).notNull(),
    addressLine: text('address_line'),
    locality: varchar('locality', { length: 120 }),
    region: varchar('region', { length: 120 }),
    postalCode: varchar('postal_code', { length: 32 }),
    countryCode: varchar('country_code', { length: 2 }).notNull(),
    latitude: numeric('latitude', { precision: 9, scale: 6 }).notNull(),
    longitude: numeric('longitude', { precision: 10, scale: 6 }).notNull(),
    locationStatus: locationStatusEnum('location_status').default('active').notNull(),
    visibility: claimVisibilityEnum('visibility').default('hidden').notNull(),
    websiteUrl: text('website_url'),
    phone: varchar('phone', { length: 64 }),
    osmType: osmElementTypeEnum('osm_type'),
    osmId: bigint('osm_id', { mode: 'number' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('locations_slug_unique').on(table.slug),
    uniqueIndex('locations_osm_identity_unique')
      .on(table.osmType, table.osmId)
      .where(sql`${table.osmType} is not null and ${table.osmId} is not null`),
    index('locations_entity_idx').on(table.entityId),
    index('locations_country_locality_idx').on(table.countryCode, table.locality),
    index('locations_status_idx').on(table.locationStatus),
    index('locations_visibility_idx').on(table.visibility),
    check('locations_latitude_range', sql`${table.latitude} between -90 and 90`),
    check('locations_longitude_range', sql`${table.longitude} between -180 and 180`),
    check(
      'locations_osm_identity_pair',
      sql`(${table.osmType} is null and ${table.osmId} is null) or (${table.osmType} is not null and ${table.osmId} is not null)`,
    ),
  ],
);

export type Location = typeof locations.$inferSelect;
export type NewLocation = typeof locations.$inferInsert;
