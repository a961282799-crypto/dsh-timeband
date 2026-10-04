export const RELEASE_API = 'https://api.github.com/repos/a961282799-crypto/dsh-timeband/releases/latest';
export const RELEASES_URL = 'https://github.com/a961282799-crypto/dsh-timeband/releases';
export const UPDATE_TIMEOUT = 10_000;
const MAX_RELEASE_BYTES = 64 * 1024;

type Release = { version: string; url: string; download: string };
type CheckStatus = 'idle' | 'checking' | 'current' | 'failed';
type InstallStatus = 'idle' | 'installing' | 'restart' | 'applied' | 'unknown' | 'failed' | 'incompatible';
type Reply<T> = { ok: true; value: T } | { ok: false; error: unknown };
type InstallResult = { application: string; bundle?: string; error?: { code: string } };
/** The published rc.2 remote methods used by its own plugin management UI. */
export interface NativePluginManager {
  installBundle(spec: string, options: { requestId: string }): Promise<Reply<InstallResult>>;
  waitForInstall(requestId: string): Promise<Reply<InstallResult | null>>;
  cancelInstall(requestId: string): Promise<unknown>;
}
type Options = {
  version: string;
  manager: () => NativePluginManager | undefined;
  fetch?: typeof fetch;
};

function parts(version: unknown): number[] | null {
  if (typeof version !== 'string' || !/^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.test(version)) return null;
  return version.split('.').map(Number);
}
export function newer(version: string, current: string): boolean {
  const left = parts(version), right = parts(current);
  if (!left || !right) return false;
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i]! > right[i]!;
  return false;
}
function releaseFor(version: unknown): Release | null {
  if (!parts(version)) return null;
  const tag = `v${version}`;
  return { version: String(version), url: `${RELEASES_URL}/tag/${tag}`, download: `${RELEASES_URL}/download/${tag}/dsh-timeband-${version}.tgz` };
}
export function parseRelease(value: unknown): Release {
  if (!value || typeof value !== 'object') throw new Error('Invalid release');
  const data = value as Record<string, unknown>;
  const release = releaseFor(typeof data.tag_name === 'string' ? data.tag_name.slice(1) : null);
  if (!release || data.tag_name !== `v${release.version}` || data.draft !== false || data.prerelease !== false
    || data.html_url !== release.url || !Array.isArray(data.assets)
    || !data.assets.some(asset => asset?.name === `dsh-timeband-${release.version}.tgz`
      && asset.state === 'uploaded' && asset.browser_download_url === release.download)) throw new Error('Invalid release');
  return release;
}
async function readRelease(response: Response): Promise<Release> {
  if (!response.ok || Number(response.headers.get('content-length')) > MAX_RELEASE_BYTES) throw new Error('Release check failed');
  const text = await response.text();
  if (new TextEncoder().encode(text).length > MAX_RELEASE_BYTES) throw new Error('Release too large');
  return parseRelease(JSON.parse(text));
}

export function createPluginUpdates(options: Options) {
  const fetchRelease = options.fetch ?? ((input, init) => fetch(input, init));
  const listeners = new Set<() => void>();
  let snapshot: { latest: Release | null; check: CheckStatus; install: InstallStatus } = { latest: null, check: 'idle', install: 'idle' };
  let active = true;
  let request: AbortController | undefined, timeout: ReturnType<typeof setTimeout> | undefined;
  let install: { manager: NativePluginManager; id: string } | undefined;
  const update = (patch: Partial<typeof snapshot>) => {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  };
  const check = async () => {
    if (!active || request || install) return;
    const controller = new AbortController();
    request = controller; update({ check: 'checking' });
    timeout = setTimeout(() => controller.abort(), UPDATE_TIMEOUT);
    try {
      const response = await fetchRelease(RELEASE_API, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-cache', redirect: 'error' });
      const latest = await readRelease(response);
      if (!active) return;
      if (controller.signal.aborted) throw new Error('Release check timed out');
      update({ latest, check: 'current' });
    } catch { if (active) update({ check: 'failed' }); }
    finally {
      clearTimeout(timeout); timeout = undefined; request = undefined;
      controller.abort();
    }
  };
  return {
    version: options.version,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    canInstall: () => Boolean(options.manager()),
    check,
    async install() {
      const latest = snapshot.latest, manager = options.manager();
      if (!active || !latest || !newer(latest.version, options.version) || !manager || request || install || ['restart', 'applied', 'unknown'].includes(snapshot.install)) return;
      const id = crypto.randomUUID();
      install = { manager, id }; update({ install: 'installing' });
      try {
        let reply = await manager.installBundle(latest.download, { requestId: id });
        if (!reply.ok) {
          const recovered = await manager.waitForInstall(id);
          if (!recovered.ok || recovered.value === null) { if (active) update({ install: 'unknown' }); return; }
          reply = { ok: true, value: recovered.value };
        }
        if (!active) return;
        const result = reply.value;
        if (result.application === 'failed') update({ install: result.error?.code === 'incompatible-version' ? 'incompatible' : 'failed' });
        else if (['restart-required', 'applied'].includes(result.application) && result.bundle === 'dsh-timeband') update({ install: result.application === 'applied' ? 'applied' : 'restart' });
        else update({ install: 'unknown' });
      } catch { if (active) update({ install: 'unknown' }); }
      finally { install = undefined; }
    },
    dispose() {
      active = false; request?.abort();
      clearTimeout(timeout); timeout = undefined;
      if (install) { void install.manager.cancelInstall(install.id).catch(() => {}); install = undefined; }
    },
  };
}
export type PluginUpdates = ReturnType<typeof createPluginUpdates>;
