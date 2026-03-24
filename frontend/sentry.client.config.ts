import * as Sentry from "@sentry/nextjs";

const TOKEN_PARAM_RE = /[?&](token|code|access_token)=[^&\s]+/g;

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,

  beforeSend(event) {
    // Strip token/code query params from URLs in breadcrumbs
    if (event.breadcrumbs?.values) {
      event.breadcrumbs.values = event.breadcrumbs.values.map((crumb) => {
        if (crumb.data?.url && typeof crumb.data.url === "string") {
          crumb.data.url = crumb.data.url.replace(
            TOKEN_PARAM_RE,
            "?$1=[FILTERED]"
          );
        }
        // Strip form data values from breadcrumbs
        if (crumb.category === "ui.input") {
          crumb.message = "[FILTERED]";
        }
        return crumb;
      });
    }

    // Strip email from user context
    if (event.user?.email) {
      event.user.email = "[FILTERED]";
    }

    return event;
  },
});
