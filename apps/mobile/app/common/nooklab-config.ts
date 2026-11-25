/*
 * NookLab — self-hosted host defaults and branding constants for mobile.
 */
import type { HostId } from "../stores/use-setting-store";

export const NOOKLAB_BASE_URL = "https://nooklab.duckdns.org";

export const NOOKLAB_DEFAULT_SERVER_URLS: Record<HostId, string> = {
  API_HOST: `${NOOKLAB_BASE_URL}/api`,
  AUTH_HOST: `${NOOKLAB_BASE_URL}/auth`,
  SSE_HOST: `${NOOKLAB_BASE_URL}/sse`,
  MONOGRAPH_HOST: `${NOOKLAB_BASE_URL}/mono`
};

export const NOOKLAB_REACHABILITY_URL = `${NOOKLAB_DEFAULT_SERVER_URLS.API_HOST}/health`;

export const NOOKLAB_NOTESNOOK_HOSTS = {
  ...NOOKLAB_DEFAULT_SERVER_URLS,
  SUBSCRIPTIONS_HOST: "https://subscriptions.streetwriters.co",
  ISSUES_HOST: "https://issues.streetwriters.co",
  NOTESNOOK_HOST: NOOKLAB_BASE_URL
};
