import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client';
import type {} from '@deepseek-ai/dsh-client-locale/client';
import { createClock } from './clock.ts';
import { TimeBand } from './view.tsx';
import { zh, en } from './locales.ts';
import css from './style.css';

export const inject = ['slots', 'locale'];
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('timeband', { zh, en }));
  ctx.effect(() => {
    const style = document.createElement('style');
    style.dataset.plugin = 'dsh-timeband';
    style.textContent = css;
    document.head.append(style);
    return () => style.remove();
  });
  const clock = createClock();
  ctx.effect(() => clock.start());
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: 'dsh-timeband', order: 100, locale: 'timeband',
    inject: () => ({ hooks: { clock } }),
  }, TimeBand));
}
