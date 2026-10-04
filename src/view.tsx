import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client';
import { countdown, createScheduleReader, HOUR, PRICING_SOURCE } from './schedule.ts';
import { CalendarError, CALENDAR_DOWNLOAD, MAX_CALENDAR_BYTES } from './calendar.ts';
import type { CalendarStore } from './calendar-store.ts';
import type { ReminderIssue, ReminderStore } from './reminder-store.ts';
import type { Segment } from './schedule.ts';
import type { TextKey } from './locales.ts';

export type TimeBandProps = PropsRuntime<'sidebar.footer.action'> & PropsLocale<'timeband'> & {
  useClock: (select: (now: number) => number) => number;
  calendarStore: CalendarStore;
  reminderStore: ReminderStore;
  testReminder: () => void;
};

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const timeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const reminderIssues: Record<ReminderIssue, TextKey> = {
  denied: 'reminderDenied', unsupported: 'reminderUnsupported', storage: 'reminderStorageError', delivery: 'reminderDeliveryError',
};

function Track({ segments, hour, small = false }: { segments: Segment[]; hour: number; small?: boolean }) {
  return <div className={`dtb-track${small ? ' dtb-track-small' : ''}`} aria-hidden="true">
    {segments.map(segment => <span key={segment.start} className={`dtb-segment dtb-${segment.band}`}
      style={{ left: `${segment.start / 24 * 100}%`, width: `${(segment.end - segment.start) / 24 * 100}%` }} />)}
    <span className="dtb-cursor" style={{ left: `${hour / 24 * 100}%` }} />
  </div>;
}

export function TimeBand({ wide, useClock, t, calendarStore, reminderStore, testReminder }: TimeBandProps) {
  const now = useClock(value => value);
  const calendarState = useSyncExternalStore(calendarStore.subscribe, calendarStore.getSnapshot);
  const reminderState = useSyncExternalStore(reminderStore.subscribe, reminderStore.getSnapshot);
  const readSchedule = useMemo(() => createScheduleReader(), []);
  const { day, band, next, segments, coverage } = readSchedule(now, calendarState.data);
  const hour = (now - day.midnight) / HOUR;
  const knownNext = next !== null && next.band !== 'unknown' && band !== 'unknown';
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const calendarInput = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState<TextKey | null>(null);
  const [importing, setImporting] = useState(false);
  const id = useId();
  const remaining = knownNext ? countdown(next.at - now) : null;
  const mainText = remaining?.major.map(part => `${part.value}${t(part.unit)}`).join('') ?? '';
  const secondsText = remaining ? `${remaining.seconds}${t('seconds')}` : '—';
  const countdownText = `${mainText}${secondsText}`;
  const countdownView = <span className="dtb-countdown"><span className="dtb-count-main">{mainText || secondsText}</span>
    {mainText && <small className="dtb-count-seconds">{secondsText}</small>}</span>;
  const nextLabel: TextKey = !knownNext ? 'nextUnknown' : next.band === 'peak' ? 'nextPeak' : 'nextOffpeak';
  const nextDate = useMemo(() => knownNext && next ? dateFormatter.format(next.at) : '', [knownNext, next]);
  const time = timeFormatter.format(now);
  const showError = (error: unknown) => setFeedback(error instanceof CalendarError && error.kind === 'storage' ? 'calendarStorageError' : 'calendarInvalid');
  const importCalendar = async (file: File) => {
    setImporting(true); setFeedback(null);
    try {
      if (file.size > MAX_CALENDAR_BYTES) throw new CalendarError('invalid');
      calendarStore.import(await file.text()); setFeedback('calendarImported');
    } catch (error) { showError(error); }
    finally { setImporting(false); }
  };

  useEffect(() => {
    const element = panel.current;
    if (!element) return;
    const onToggle = () => setOpen(element.matches(':popover-open'));
    element.addEventListener('toggle', onToggle);
    return () => element.removeEventListener('toggle', onToggle);
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
    <button type="button" className="dtb-chip" ref={trigger} popovertarget={id} popovertargetaction="toggle"
      aria-label={`${t('open')} · ${t(band)} · ${t(nextLabel)} ${countdownText}`}
      aria-expanded={open} aria-haspopup="dialog" aria-controls={id} title={`${t(band)} · ${t(nextLabel)} ${countdownText}`}>
      <span className="dtb-chip-top"><span className={`dtb-dot dtb-${band}`} />
        {wide && <><span className="dtb-chip-label">{t(band)}</span><span className="dtb-chip-count">{countdownView}</span></>}
      </span>
      {wide ? <Track segments={segments} hour={hour} small /> : <svg viewBox="0 0 24 24" className="dtb-rail-icon" aria-hidden="true"><path d="M3 17 8 7l5 10 4-7 4 7" /></svg>}
    </button>
    {createPortal(<div ref={panel} id={id} popover="auto" role="dialog" aria-labelledby={`${id}-title`}
      className="dtb-card dtb-theme" data-band={band}
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); hide(); } }}>
      <header className="dtb-header"><div><div className="dtb-eyebrow">DEEPSEEK / TIMEBAND</div><h2 id={`${id}-title`}>{t('title')}</h2></div>
        <button type="button" className="dtb-close" ref={close} aria-label={t('close')} onClick={hide}>×</button></header>
      <div className="dtb-status"><span className={`dtb-dot dtb-${band}`} /><strong>{t(band)}</strong></div>
      <div className="dtb-next"><span>{t(nextLabel)}</span><strong aria-label={`${t(nextLabel)} ${countdownText}`}>{countdownView}</strong></div>
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
      {coverage.notice === 'expiresSoon' && <p className="dtb-note dtb-calendar-notice">{t('calendarExpiresSoon')} {coverage.expiresOn}</p>}
      <details className="dtb-details">
        <summary>{t('details')}</summary>
        <p className="dtb-note">{t('note')}</p>
        <div className="dtb-reminder-settings">
          <label className="dtb-reminder-toggle"><span>{t('reminder')}</span>
            <input type="checkbox" role="switch" checked={reminderState.enabled} disabled={reminderState.busy}
              onChange={event => { void reminderStore.setEnabled(event.currentTarget.checked); }} />
          </label>
          {reminderState.enabled && <button type="button" className="dtb-button" onClick={testReminder}>{t('reminderTest')}</button>}
          <p className="dtb-note">{t('reminderHint')}</p>
          {reminderState.issue && <p className="dtb-note dtb-reminder-feedback" role="status">{t(reminderIssues[reminderState.issue])}</p>}
        </div>
        <div className="dtb-calendar-meta">
          <span>{t('calendar')} {calendarState.data.years.join('、')} · {t(calendarState.imported ? 'calendarLocal' : 'calendarBuiltin')}</span>
          <span>{t('calendarVerified')} {calendarState.data.verifiedOn}</span>
        </div>
        <div className="dtb-calendar-actions">
          <button type="button" className="dtb-button" disabled={importing} onClick={() => calendarInput.current?.click()}>{t('calendarImport')}</button>
          <button type="button" className="dtb-button" disabled={importing || (!calendarState.imported && !calendarState.issue)} onClick={() => {
            try { calendarStore.restore(); setFeedback('calendarRestored'); } catch (error) { showError(error); }
          }}>{t('calendarRestore')}</button>
          <a href={CALENDAR_DOWNLOAD} target="_blank" rel="noreferrer">{t('calendarDownload')} ↗</a>
          <input type="file" accept=".json,application/json" ref={calendarInput} hidden aria-label={t('calendarImport')} onChange={event => {
            const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void importCalendar(file);
          }} />
        </div>
        <p className="dtb-note">{t('calendarImportHint')}</p>
        <p className="dtb-note dtb-calendar-feedback" role="status">{feedback ? t(feedback) : calendarState.issue ? t(calendarState.issue === 'invalid' ? 'calendarSavedInvalid' : 'calendarStorageError') : ''}</p>
        <footer className="dtb-footer"><a href={calendarState.data.source} target="_blank" rel="noreferrer">{t('calendarSource')} ↗</a><a href={PRICING_SOURCE} target="_blank" rel="noreferrer">{t('rule')} ↗</a></footer>
      </details>
    </div>, document.body)}
  </div>;
}
