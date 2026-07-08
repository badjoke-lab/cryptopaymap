import { sql } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../../db/client';
import { locations, sourceRecords } from '../../db/schema';
import type { LocationCorrectionDecisionCommand } from './decision';

export function locationCorrectionTargetGuard(
  database: CryptoPayMapDatabase,
  command: LocationCorrectionDecisionCommand,
) {
  return database.execute(sql`
    select 1 / case when exists (
      select 1
      from ${locations}
      where ${locations.id} = ${command.locationId}
        and ${locations.updatedAt} = ${command.expectedLocationUpdatedAt}
        and ${locations.deletedAt} is null
      for update
    ) then 1 else 0 end as location_correction_target_guard
  `);
}

export function locationCorrectionSourceSetGuard(
  database: CryptoPayMapDatabase,
  command: LocationCorrectionDecisionCommand,
) {
  return database.execute(sql`
    select 1 / case when (
      select coalesce(jsonb_agg(locked.id order by locked.id), '[]'::jsonb)
      from (
        select ${sourceRecords.id} as id
        from ${sourceRecords}
        where ${sourceRecords.id} in (
          select value::uuid
          from jsonb_array_elements_text(${JSON.stringify(command.sourceRecordIds)}::jsonb)
        )
        for share
      ) as locked
    ) = ${JSON.stringify(command.sourceRecordIds)}::jsonb then 1 else 0 end
      as location_correction_source_set_guard
  `);
}
