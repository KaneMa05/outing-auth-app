export const interviewProducts = Object.freeze([
  ['interview_package', '면접 패키지'],
  ['interview_only', '면접 단과'],
  ['aptitude_only', '인적성 단과'],
]);

export const interviewProductLabel = value => interviewProducts.find(([id]) => id === value)?.[1] || '면접 패키지';
