import type { Instrumentation } from "next";

/*
 * Server error reporting. Next calls onRequestError for errors thrown while rendering pages, in route handlers,
 * server actions and the proxy. Every error is logged; if ERROR_WEBHOOK_URL is set (for example a Slack
 * "Incoming Webhook" URL), a short JSON summary is POSTed to it as well.
 *
 * Later upgrade: Sentry (@sentry/nextjs) gives stack traces with source maps, release tracking and browser errors.
 * Its wizard rewrites this file to call Sentry.captureRequestError; keep the webhook too if the team likes Slack alerts.
 */

export function register() {
  // Nothing to set up yet. (Sentry/OpenTelemetry would initialise here.)
}

const recent = new Map<string, number>();

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const err = error as { message?: string; digest?: string; stack?: string };
  const message = String(err?.message ?? error).slice(0, 500);
  const digest = err?.digest ?? "";
  const route = context.routePath || request.path;

  console.error(`[error] ${request.method} ${request.path} (${context.routeType} ${route})${digest ? ` digest=${digest}` : ""}: ${message}`);

  const url = process.env.ERROR_WEBHOOK_URL;
  if (!url) return;

  // Don't flood the channel: the same error on the same route is reported at most once a minute per server instance.
  const key = `${route}|${message}`;
  const now = Date.now();
  if ((recent.get(key) ?? 0) > now - 60_000) return;
  recent.set(key, now);
  if (recent.size > 200) recent.clear();

  const summary = {
    // `text` is what Slack shows; the other fields are for any other webhook consumer.
    text: `:rotating_light: ${process.env.NODE_ENV === "production" ? "" : "[dev] "}Error on ${request.method} ${request.path}\n*${message}*${digest ? `\ndigest: ${digest}` : ""}`,
    route,
    path: request.path,
    method: request.method,
    routeType: context.routeType,
    message,
    digest,
    site: process.env.NEXT_PUBLIC_SITE_URL ?? "",
    at: new Date().toISOString(),
  };
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(summary),
      signal: AbortSignal.timeout(4000),
    });
  } catch (e) {
    console.error("[error] webhook failed", e);
  }
};
