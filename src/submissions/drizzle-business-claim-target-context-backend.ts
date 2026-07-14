import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import type { CryptoPayMapDatabase } from '../db/client';
import { acceptanceClaims } from '../db/schema/acceptance-claims';
import { assets } from '../db/schema/assets';
import { claimAssets } from '../db/schema/claim-assets';
import { entities } from '../db/schema/entities';
import { locations } from '../db/schema/locations';
import { networks } from '../db/schema/networks';
import { paymentMethods } from '../db/schema/payment-registries';
import type {
  BusinessClaimCanonicalTargetContextBackend,
  BusinessClaimCanonicalTargetMaterial,
} from './business-claim-target-context';

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

export function createDrizzleBusinessClaimTargetContextBackend(
  database: CryptoPayMapDatabase,
): BusinessClaimCanonicalTargetContextBackend {
  return {
    async loadTarget(targetType, targetId): Promise<BusinessClaimCanonicalTargetMaterial | null> {
      let entityId: string;
      let locationId: string | null = null;

      if (targetType === 'entity') {
        const rows = await database
          .select({ id: entities.id })
          .from(entities)
          .where(and(eq(entities.id, targetId), isNull(entities.deletedAt)))
          .limit(1);
        if (rows[0] === undefined) return null;
        entityId = rows[0].id;
      } else {
        const rows = await database
          .select({ id: locations.id, entityId: locations.entityId })
          .from(locations)
          .where(and(eq(locations.id, targetId), isNull(locations.deletedAt)))
          .limit(1);
        if (rows[0] === undefined) return null;
        entityId = rows[0].entityId;
        locationId = rows[0].id;
      }

      const entityRows = await database
        .select({
          id: entities.id,
          entityType: entities.entityType,
          name: entities.name,
          slug: entities.slug,
          legalName: entities.legalName,
          websiteUrl: entities.websiteUrl,
          countryCode: entities.countryCode,
          entityStatus: entities.entityStatus,
          visibility: entities.visibility,
          updatedAt: entities.updatedAt,
        })
        .from(entities)
        .where(and(eq(entities.id, entityId), isNull(entities.deletedAt)))
        .limit(1);
      const entity = entityRows[0];
      if (entity === undefined) return null;

      let location: BusinessClaimCanonicalTargetMaterial['location'] = null;
      if (locationId !== null) {
        const locationRows = await database
          .select({
            id: locations.id,
            entityId: locations.entityId,
            name: locations.name,
            slug: locations.slug,
            addressLine: locations.addressLine,
            locality: locations.locality,
            region: locations.region,
            postalCode: locations.postalCode,
            countryCode: locations.countryCode,
            latitude: locations.latitude,
            longitude: locations.longitude,
            locationStatus: locations.locationStatus,
            visibility: locations.visibility,
            websiteUrl: locations.websiteUrl,
            phone: locations.phone,
            description: locations.description,
            openingHours: locations.openingHours,
            amenities: locations.amenities,
            socialLinks: locations.socialLinks,
            updatedAt: locations.updatedAt,
          })
          .from(locations)
          .where(
            and(
              eq(locations.id, locationId),
              eq(locations.entityId, entityId),
              isNull(locations.deletedAt),
            ),
          )
          .limit(1);
        const row = locationRows[0];
        if (row === undefined) return null;
        location = {
          ...row,
          latitude: Number(row.latitude),
          longitude: Number(row.longitude),
          amenities: row.amenities ?? [],
          socialLinks: row.socialLinks ?? [],
          updatedAt: row.updatedAt.toISOString(),
        };
      }

      const claimRows = await database
        .select({
          id: acceptanceClaims.id,
          entityId: acceptanceClaims.entityId,
          locationId: acceptanceClaims.locationId,
          claimScope: acceptanceClaims.claimScope,
          routeType: acceptanceClaims.routeType,
          acceptanceScope: acceptanceClaims.acceptanceScope,
          claimStatus: acceptanceClaims.claimStatus,
          visibility: acceptanceClaims.visibility,
          processorId: acceptanceClaims.processorId,
          howToPay: acceptanceClaims.howToPay,
          restrictions: acceptanceClaims.restrictions,
          firstConfirmedAt: acceptanceClaims.firstConfirmedAt,
          lastConfirmedAt: acceptanceClaims.lastConfirmedAt,
          nextReviewAt: acceptanceClaims.nextReviewAt,
          endedAt: acceptanceClaims.endedAt,
          updatedAt: acceptanceClaims.updatedAt,
        })
        .from(acceptanceClaims)
        .where(
          and(
            eq(acceptanceClaims.entityId, entityId),
            isNull(acceptanceClaims.deletedAt),
            locationId === null
              ? isNull(acceptanceClaims.locationId)
              : or(
                  isNull(acceptanceClaims.locationId),
                  eq(acceptanceClaims.locationId, locationId),
                ),
          ),
        );

      const claimIds = claimRows.map((claim) => claim.id);
      const processorIds = [
        ...new Set(
          claimRows
            .map((claim) => claim.processorId)
            .filter((value): value is string => value !== null),
        ),
      ];
      const processorRows =
        processorIds.length === 0
          ? []
          : await database
              .select({ id: entities.id, name: entities.name })
              .from(entities)
              .where(and(inArray(entities.id, processorIds), isNull(entities.deletedAt)));
      const processorNames = new Map(
        processorRows.map((processor) => [processor.id, processor.name]),
      );

      const optionRows =
        claimIds.length === 0
          ? []
          : await database
              .select({
                claimId: claimAssets.claimId,
                assetSlug: assets.slug,
                networkSlug: networks.slug,
                paymentMethod: paymentMethods.slug,
                isPrimary: claimAssets.isPrimary,
              })
              .from(claimAssets)
              .innerJoin(assets, eq(assets.id, claimAssets.assetId))
              .innerJoin(networks, eq(networks.id, claimAssets.networkId))
              .innerJoin(paymentMethods, eq(paymentMethods.id, claimAssets.paymentMethodId))
              .where(inArray(claimAssets.claimId, claimIds));

      const optionsByClaim = new Map<
        string,
        BusinessClaimCanonicalTargetMaterial['claims'][number]['options']
      >();
      for (const option of optionRows) {
        const current = optionsByClaim.get(option.claimId) ?? [];
        current.push({
          assetSlug: option.assetSlug,
          networkSlug: option.networkSlug,
          paymentMethod:
            option.paymentMethod as BusinessClaimCanonicalTargetMaterial['claims'][number]['options'][number]['paymentMethod'],
          isPrimary: option.isPrimary,
        });
        optionsByClaim.set(option.claimId, current);
      }

      return {
        targetType,
        targetId,
        entity: {
          ...entity,
          updatedAt: entity.updatedAt.toISOString(),
        },
        location,
        claims: claimRows.map((claim) => ({
          id: claim.id,
          entityId: claim.entityId,
          locationId: claim.locationId,
          claimScope: claim.claimScope,
          routeType: claim.routeType,
          acceptanceScope: claim.acceptanceScope,
          claimStatus: claim.claimStatus,
          visibility: claim.visibility,
          processorName:
            claim.processorId === null ? null : (processorNames.get(claim.processorId) ?? null),
          howToPay: claim.howToPay,
          restrictions: claim.restrictions,
          firstConfirmedAt: iso(claim.firstConfirmedAt),
          lastConfirmedAt: iso(claim.lastConfirmedAt),
          nextReviewAt: iso(claim.nextReviewAt),
          endedAt: iso(claim.endedAt),
          updatedAt: claim.updatedAt.toISOString(),
          options: optionsByClaim.get(claim.id) ?? [],
        })),
      };
    },
  };
}
