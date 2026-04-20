import { getApps, initializeApp, getApp } from "firebase-admin/app";
import { getRemoteConfig } from "firebase-admin/remote-config";

const CACHE_TTL_MS = 5 * 60_000;

let cache: Record<string, number | string | boolean> | null = null;
let cacheExpiresAt = 0;

function adminApp() {
  return getApps().length ? getApp() : initializeApp();
}

async function loadTemplate(): Promise<Record<string, number | string | boolean>> {
  const template = await getRemoteConfig(adminApp()).getTemplate();
  const out: Record<string, number | string | boolean> = {};
  for (const [key, param] of Object.entries(template.parameters)) {
    const def = param.defaultValue;
    if (def && "value" in def) {
      const v = (def as { value: string }).value;
      if (v === "true") out[key] = true;
      else if (v === "false") out[key] = false;
      else if (v !== "" && !isNaN(Number(v))) out[key] = Number(v);
      else out[key] = v;
    }
  }
  return out;
}

/**
 * Returns a Remote Config value by key, falling back to `fallback` if the key
 * is missing or Remote Config is unavailable. Template is cached for 5 minutes.
 */
export async function getRemoteConfigValue<T extends number | string | boolean>(
  key: string,
  fallback: T
): Promise<T> {
  const now = Date.now();
  if (!cache || now > cacheExpiresAt) {
    try {
      cache = await loadTemplate();
      cacheExpiresAt = now + CACHE_TTL_MS;
    } catch {
      return fallback;
    }
  }
  const val = cache[key];
  return val !== undefined ? (val as T) : fallback;
}
