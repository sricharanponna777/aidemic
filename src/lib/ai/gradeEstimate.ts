export type GcseTier = 'foundation' | 'higher' | null;

export const getGcseTier = (specification: string): GcseTier => {
  const normalized = specification.toLowerCase();
  if (/\bfoundation\b/.test(normalized)) return 'foundation';
  if (/\bhigher\b/.test(normalized)) return 'higher';
  return null;
};

export const estimateGrade = (
  percentage: number,
  examType: 'gcse' | 'a-level',
  board: 'aqa' | 'edexcel' | 'ocr' | null,
  gcseTier: GcseTier
) => {
  const adjustment = board === 'edexcel' ? -2 : board === 'ocr' ? -1 : 0;
  const boundaries =
    examType === 'a-level'
      ? [
          ['A*', 85],
          ['A', 75],
          ['B', 65],
          ['C', 55],
          ['D', 45],
          ['E', 35],
        ]
      : gcseTier === 'foundation'
      ? [
          ['5', 70],
          ['4', 55],
          ['3', 40],
          ['2', 25],
          ['1', 10],
        ]
      : gcseTier === 'higher'
      ? [
          ['9', 85],
          ['8', 78],
          ['7', 70],
          ['6', 60],
          ['5', 50],
          ['4', 40],
          ['3', 30],
        ]
      : [
          ['9', 85],
          ['8', 78],
          ['7', 70],
          ['6', 60],
          ['5', 50],
          ['4', 40],
          ['3', 30],
          ['2', 20],
          ['1', 10],
        ];

  for (const [grade, boundary] of boundaries) {
    if (percentage >= Number(boundary) + adjustment) return String(grade);
  }
  return 'U';
};
