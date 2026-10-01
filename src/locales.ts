export const zh = {
  title: '今日时段', zone: '北京时间 · UTC+8', peak: '峰时段', offpeak: '谷时段', unknown: '待核实',
  nextPeak: '距离峰时段', nextOffpeak: '距离谷时段', nextUnknown: '后续日历待更新',
  weekday: '周一至周五', weekend: '周末 · 全天谷时段', holiday: '公共假期 · 全天谷时段',
  unverified: '本年度节假日日历待更新', allDay: '全天', rest: '其余时段', now: '现在',
  nextSwitch: '下次切换：', close: '关闭时间轴', open: '查看峰谷时间轴', rule: 'DeepSeek 官方时段规则',
  calendar: '节假日日历：2026', note: '周末（含调休上班日）及公共假期全天为谷时段。',
  unknownNote: '缺少本年度假期数据，工作日峰时段暂不作确定判断。',
  timeline: '北京时间 24 小时时间轴', days: '天', hours: '小时', minutes: '分钟', seconds: '秒',
};
export type TextKey = keyof typeof zh;
export const en: Record<TextKey, string> = {
  title: 'Today’s schedule', zone: 'Beijing time · UTC+8', peak: 'Peak', offpeak: 'Off-peak', unknown: 'Unverified',
  nextPeak: 'Until peak hours', nextOffpeak: 'Until off-peak', nextUnknown: 'Calendar update needed',
  weekday: 'Monday–Friday', weekend: 'Weekend · off-peak all day', holiday: 'Public holiday · off-peak all day',
  unverified: 'Holiday calendar needs an update', allDay: 'All day', rest: 'All other hours', now: 'Now',
  nextSwitch: 'Next change:', close: 'Close timeline', open: 'View peak hours timeline', rule: 'DeepSeek official schedule',
  calendar: 'Holiday calendar: 2026', note: 'Weekends (including makeup workdays) and public holidays are off-peak all day.',
  unknownNote: 'Holiday data for this year is unavailable; weekday peak periods are unverified.',
  timeline: '24-hour timeline in Beijing time', days: 'd', hours: 'h', minutes: 'min', seconds: 's',
};
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { timeband: TextKey }
}
