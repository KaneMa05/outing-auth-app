export const interviewProducts = Object.freeze([
  ['interview_package', '면접 패키지 (인적성+면접)'],
  ['interview_only', '면접 단과'],
  ['aptitude_only', '인적성 단과'],
]);

export const interviewProductLabel = value => interviewProducts.find(([id]) => id === value)?.[1] || interviewProducts[0][1];

const purchaseProductNames = Object.freeze({
  interview_package: '해양경찰 인적성+면접 대비',
  interview_only: '해양경찰 및 일반직 면접',
  aptitude_only: '해양경찰 인적성검사 대비강의',
});

export const interviewPurchaseProductName = value => purchaseProductNames[value] || purchaseProductNames.interview_package;
