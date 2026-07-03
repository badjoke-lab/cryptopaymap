import type { ProjectedMediaReviewDecision } from './drizzle-state';

export function mediaAssetUpdateValues(projected: ProjectedMediaReviewDecision) {
  return {
    reviewStatus: projected.asset.reviewStatus,
    purpose: projected.asset.purpose,
    rightsStatus: projected.asset.rightsStatus,
    visibility: projected.asset.visibility,
    licenseId: projected.asset.licenseId,
    rightsHolder: projected.asset.rightsHolder,
    consentReference: projected.asset.consentReference,
    attribution: projected.asset.attribution,
    altText: projected.asset.altText,
    displayOrder: projected.asset.displayOrder,
    publishedAt: projected.asset.publishedAt,
    updatedAt: projected.asset.updatedAt,
  };
}
