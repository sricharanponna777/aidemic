/** Private bucket: handwriting is personal data, and often a child's. */
export const PAPER_SCANS_BUCKET = 'paper-scans';

/** Long enough to review a paper in one sitting, short enough to be worthless if leaked. */
export const SIGNED_URL_TTL_SECONDS = 60 * 30;

/** A phone-photographed paper that runs past this is a scanning problem, not a paper. */
export const MAX_PAPER_PAGES = 12;
