/** Official 2026 public-holiday intervals, inclusive; makeup weekends remain off-peak. */
export const calendar = {
  years: [2026] as readonly number[],
  verifiedOn: '2026-09-30',
  source: 'https://www.lufengshi.gov.cn/swlfsjj/gkmlpt/content/1/1199/mpost_1199727.html',
  holidays: [
    ['2026-01-01', '2026-01-03'],
    ['2026-02-15', '2026-02-23'],
    ['2026-04-04', '2026-04-06'],
    ['2026-05-01', '2026-05-05'],
    ['2026-06-19', '2026-06-21'],
    ['2026-09-25', '2026-09-27'],
    ['2026-10-01', '2026-10-07'],
  ] as readonly (readonly [string, string])[],
};
