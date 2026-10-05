import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client';
import { countdown, createScheduleReader, HOUR, PRICING_SOURCE } from './schedule.ts';
import type { CalendarStore } from './calendar-store.ts';
import type { ReminderIssue, ReminderStore } from './reminder-store.ts';
import type { DeliveryStatus, ReminderDelivery } from './reminder-delivery.ts';
import { newer } from './plugin-updates.ts';
import type { PluginUpdates } from './plugin-updates.ts';
import type { Band, Segment } from './schedule.ts';
import type { TextKey } from './locales.ts';

export type TimeBandProps = PropsRuntime<'sidebar.footer.action'> & PropsLocale<'timeband'> & {
  useClock: (select: (now: number) => number) => number;
  calendarStore: CalendarStore;
  reminderStore: ReminderStore;
  reminderDelivery: ReminderDelivery;
  testReminder: () => void;
  pluginUpdates: PluginUpdates;
};

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const timeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const reminderIssues: Record<ReminderIssue, TextKey> = {
  denied: 'reminderDenied', unsupported: 'reminderUnsupported', storage: 'reminderStorageError', delivery: 'reminderDeliveryError',
};
const deliveryMessages: Record<DeliveryStatus, TextKey> = {
  pending: 'reminderSending', accepted: 'reminderAccepted', unconfirmed: 'reminderUnconfirmed', unavailable: 'reminderFallback',
};

const ReminderBanner = memo(function ReminderBanner({ delivery, t }: { delivery: ReminderDelivery; t: TimeBandProps['t'] }) {
  const notice = useSyncExternalStore(delivery.subscribe, delivery.getSnapshot);
  const banner = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (notice) banner.current?.showPopover(); else banner.current?.hidePopover();
  }, [notice?.id]);
  if (!notice) return null;
  return createPortal(<div ref={banner} popover="manual" className="dtb-reminder-banner dtb-theme" role="status" aria-live="polite">
    {notice && <><div className="dtb-header"><strong>{notice.title}</strong>
      <button type="button" className="dtb-close" aria-label={t('dismissReminder')} onClick={delivery.dismiss}>×</button></div>
      <p>{notice.body}</p><p className="dtb-note dtb-delivery-status">{t(deliveryMessages[notice.delivery])}</p>
      {notice.sound === 'unavailable' && <p className="dtb-note dtb-sound-feedback">{t('reminderSoundError')}</p>}</>}
  </div>, document.body);
});

const Track = memo(function Track({ segments, hour, small = false }: { segments: Segment[]; hour: number; small?: boolean }) {
  return <div className={`dtb-track${small ? ' dtb-track-small' : ''}`} aria-hidden="true">
    {segments.map(segment => <span key={segment.start} className={`dtb-segment dtb-${segment.band}`}
      style={{ left: `${segment.start / 24 * 100}%`, width: `${(segment.end - segment.start) / 24 * 100}%` }} />)}
    <span className="dtb-cursor" style={{ left: `${hour / 24 * 100}%` }} />
  </div>;
});

type CountdownProps = Pick<TimeBandProps, 'useClock' | 't'> & { until: number | null; nextLabel: TextKey };
function countdownContent(now: number, until: number | null, t: TimeBandProps['t']) {
  const remaining = until === null ? null : countdown(until - now);
  const main = remaining?.major.map(part => `${part.value}${t(part.unit)}`).join('') ?? '';
  const seconds = remaining ? `${remaining.seconds}${t('seconds')}` : '—';
  return { text: `${main}${seconds}`, view: <span className="dtb-countdown"><span className="dtb-count-main">{main || seconds}</span>
    {main && <small className="dtb-count-seconds">{seconds}</small>}</span> };
}

function CardCountdown({ useClock, t, until, nextLabel }: CountdownProps) {
  const now = useClock(value => value);
  const { text, view } = countdownContent(now, until, t);
  return <div className="dtb-next"><span>{t(nextLabel)}</span><strong aria-label={`${t(nextLabel)} ${text}`}>{view}</strong></div>;
}

function Chip({ wide, useClock, t, until, nextLabel, band, segments, hour, trigger, id, open }: CountdownProps & {
  wide: boolean; band: Band; segments: Segment[]; hour: number; trigger: RefObject<HTMLButtonElement>; id: string; open: boolean;
}) {
  // Only the visible countdown needs a second-by-second React update.
  const now = useClock(value => wide ? value : Math.floor(value / 60_000) * 60_000);
  const { text, view } = countdownContent(now, until, t);
  return <button type="button" className="dtb-chip" ref={trigger} popovertarget={id} popovertargetaction="toggle"
    aria-label={`${t('open')} · ${t(band)} · ${t(nextLabel)} ${text}`}
    aria-expanded={open} aria-haspopup="dialog" aria-controls={id} title={`${t(band)} · ${t(nextLabel)} ${text}`}>
    <span className="dtb-chip-top"><span className={`dtb-dot dtb-${band}`} />
      {wide && <><span className="dtb-chip-label">{t(band)}</span><span className="dtb-chip-count">{view}</span></>}
    </span>
    {wide ? <Track segments={segments} hour={hour} small /> : <svg viewBox="0 0 24 24" className="dtb-rail-icon" aria-hidden="true"><path d="M3 17 8 7l5 10 4-7 4 7" /></svg>}
  </button>;
}

export function TimeBand({ wide, useClock, t, calendarStore, reminderStore, reminderDelivery, testReminder, pluginUpdates }: TimeBandProps) {
  const now = useClock(value => Math.floor(value / 60_000) * 60_000);
  const calendarState = useSyncExternalStore(calendarStore.subscribe, calendarStore.getSnapshot);
  const reminderState = useSyncExternalStore(reminderStore.subscribe, reminderStore.getSnapshot);
  const reminderNotice = useSyncExternalStore(reminderDelivery.subscribe, reminderDelivery.getSnapshot);
  const updateState = useSyncExternalStore(pluginUpdates.subscribe, pluginUpdates.getSnapshot);
  const available = updateState.latest && newer(updateState.latest.version, pluginUpdates.version);
  const installMessage: TextKey | null = updateState.install === 'restart' ? 'updateRestart'
    : updateState.install === 'applied' ? 'updateApplied'
    : updateState.install === 'unknown' ? 'updateUnknown' : updateState.install === 'failed' ? 'updateFailed'
    : updateState.install === 'incompatible' ? 'updateIncompatible' : null;
  const readSchedule = useMemo(() => createScheduleReader(), []);
  const { day, band, next, segments } = readSchedule(now, calendarState.data);
  const hour = (now - day.midnight) / HOUR;
  const knownNext = next !== null && next.band !== 'unknown' && band !== 'unknown';
  const [open, setOpen] = useState(false);
  const detailsOpen = useRef(false);
  const details = useRef<HTMLDetailsElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const id = useId();
  const until = knownNext ? next.at : null;
  const nextLabel: TextKey = !knownNext ? 'nextUnknown' : next.band === 'peak' ? 'nextPeak' : 'nextOffpeak';
  const nextDate = useMemo(() => knownNext && next ? dateFormatter.format(next.at) : '', [knownNext, next]);
  const time = timeFormatter.format(now);
  const calendarNotice: TextKey | null = calendarState.issue === 'storage' ? 'calendarStorageError'
    : calendarState.update === 'checking' ? 'calendarChecking'
    : calendarState.update === 'waiting' ? 'calendarWaiting'
    : calendarState.update === 'failed' ? 'calendarUpdateFailed' : null;

  useEffect(() => {
    const element = panel.current;
    if (!element) return;
    const rememberDetails = () => { if (details.current) detailsOpen.current = details.current.open; };
    const onToggle = () => setOpen(element.matches(':popover-open'));
    element.addEventListener('beforetoggle', rememberDetails);
    element.addEventListener('toggle', onToggle);
    return () => { element.removeEventListener('beforetoggle', rememberDetails); element.removeEventListener('toggle', onToggle); };
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      if (!panel.current || !trigger.current) return;
      const anchor = trigger.current.getBoundingClientRect();
      const box = panel.current.getBoundingClientRect();
      const left = Math.max(12, Math.min(anchor.left, window.innerWidth - box.width - 12));
      const top = Math.max(12, Math.min(anchor.top - box.height - 12, window.innerHeight - box.height - 12));
      panel.current.style.left = `${left}px`;
      panel.current.style.top = `${top}px`;
    };
    position();
    close.current?.focus({ preventScroll: true });
    const observer = new ResizeObserver(position);
    if (panel.current) observer.observe(panel.current);
    if (trigger.current) observer.observe(trigger.current);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => { observer.disconnect(); window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true); };
  }, [open, wide]);

  const hide = () => { panel.current?.hidePopover(); setOpen(false); trigger.current?.focus({ preventScroll: true }); };
  return <div className="dtb-root dtb-theme" data-wide={wide} data-band={band}>
    <ReminderBanner delivery={reminderDelivery} t={t} />
    <Chip wide={wide} useClock={useClock} t={t} until={until} nextLabel={nextLabel} band={band}
      segments={segments} hour={hour} trigger={trigger} id={id} open={open} />
    {createPortal(<div ref={panel} id={id} popover="auto" role="dialog" aria-labelledby={`${id}-title`}
      className="dtb-card dtb-theme" data-band={band}
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); hide(); } }}>
      {open && <><header className="dtb-header"><div><div className="dtb-eyebrow">DEEPSEEK / TIMEBAND</div><h2 id={`${id}-title`}>{t('title')}</h2></div>
        <button type="button" className="dtb-close" ref={close} aria-label={t('close')} onClick={hide}>×</button></header>
      <div className="dtb-status"><span className={`dtb-dot dtb-${band}`} /><strong>{t(band)}</strong></div>
      <CardCountdown useClock={useClock} t={t} until={until} nextLabel={nextLabel} />
      <div className="dtb-date"><span>{t('zone')}</span><span>{nextDate && <>{t('nextSwitch')} {nextDate}</>}</span></div>
      <div className="dtb-axis" role="img" aria-label={`${t('timeline')}：${segments.map(s => `${s.start}:00–${s.end}:00 ${t(s.band)}`).join('；')}。${t('now')} ${time}`}>
        <div className="dtb-now" style={{ left: `${Math.min(91, Math.max(9, hour / 24 * 100))}%` }}>{t('now')} {time}</div>
        <Track segments={segments} hour={hour} />
        <div className="dtb-ticks"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
      </div>
      <div className="dtb-day-kind">{day.key} <span>·</span> {t(day.kind)}</div>
      {segments.length > 1 && <div className="dtb-periods">
          <div><span><i className={`dtb-dot dtb-${day.covered ? 'peak' : 'unknown'}`} />{t(day.covered ? 'peak' : 'unknown')}</span><b>09:00–12:00 · 14:00–18:00</b></div>
          <div><span><i className="dtb-dot dtb-offpeak" />{t('offpeak')}</span><b>{t('rest')}</b></div>
      </div>}
      {!day.covered && <p className="dtb-note">{t('unknownNote')}</p>}
      {calendarNotice && <p className="dtb-note dtb-calendar-notice" role="status">{t(calendarNotice)}</p>}
      <details className="dtb-details" ref={details} open={detailsOpen.current}>
        <summary>{t('details')}</summary>
        <p className="dtb-note">{t('note')}</p>
        <div className="dtb-reminder-settings">
          <label className="dtb-reminder-toggle"><span>{t('reminder')}</span>
            <input type="checkbox" role="switch" checked={reminderState.enabled} disabled={reminderState.busy}
              onChange={event => {
                if (event.currentTarget.checked) void reminderDelivery.primeSound();
                void reminderStore.setEnabled(event.currentTarget.checked);
              }} />
          </label>
          {reminderState.enabled && <button type="button" className="dtb-button" onClick={testReminder}>{t('reminderTest')}</button>}
          <p className="dtb-note">{t('reminderHint')}</p>
          {reminderNotice && <p className="dtb-note dtb-test-feedback" role="status">{t(deliveryMessages[reminderNotice.delivery])}</p>}
          {reminderNotice?.sound === 'unavailable' && <p className="dtb-note dtb-sound-feedback" role="status">{t('reminderSoundError')}</p>}
          {reminderState.issue && <p className="dtb-note dtb-reminder-feedback" role="status">{t(reminderIssues[reminderState.issue])}</p>}
        </div>
        <div className="dtb-version-row"><span>v{pluginUpdates.version}</span>
          <button type="button" className="dtb-button" disabled={updateState.check === 'checking' || updateState.install === 'installing'} onClick={() => { void pluginUpdates.check(); }}>{t(updateState.check === 'checking' ? 'updateChecking' : 'updateCheck')}</button></div>
        {available && <div className="dtb-update-notice" role="status">
          <span>{t('updateAvailable')} <b>v{updateState.latest!.version}</b></span>
          {pluginUpdates.canInstall() ? <button type="button" className="dtb-button" disabled={updateState.check === 'checking' || ['installing', 'restart', 'applied', 'unknown'].includes(updateState.install)}
            onClick={() => { void pluginUpdates.install(); }}>{t(updateState.install === 'installing' ? 'updateInstalling' : 'updateInstall')}</button>
            : <a href={updateState.latest!.download} target="_blank" rel="noreferrer">{t('updateDownload')} ↗</a>}
          <a href={updateState.latest!.url} target="_blank" rel="noreferrer">{t('updateNotes')} ↗</a>
          {installMessage && <p className="dtb-note">{t(installMessage)}</p>}
        </div>}
        {updateState.check === 'failed' && <p className="dtb-note">{t('updateCheckFailed')}</p>}
        {updateState.check === 'current' && !available && <p className="dtb-note">{t('updateCurrent')}</p>}
        <footer className="dtb-footer"><a href={calendarState.data.source} target="_blank" rel="noreferrer">{t('calendarSource')} ↗</a><a href={PRICING_SOURCE} target="_blank" rel="noreferrer">{t('rule')} ↗</a></footer>
      </details></>}
    </div>, document.body)}
  </div>;
}
