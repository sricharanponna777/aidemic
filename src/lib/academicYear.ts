/** Academic years as "2026/27". A UK school year starts on 1 September. */

export const academicYearStarting = (startYear: number) =>
  `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`;

/** The academic year `date` falls in: September onwards belongs to the year starting then. */
export const currentAcademicYear = (date: Date = new Date()) =>
  academicYearStarting(date.getMonth() >= 8 ? date.getFullYear() : date.getFullYear() - 1);

/** Last year, this year and next year, oldest first, worked out from `date`. */
export const academicYearOptions = (date: Date = new Date()) => {
  const start = date.getMonth() >= 8 ? date.getFullYear() : date.getFullYear() - 1;
  return [start - 1, start, start + 1].map(academicYearStarting);
};
