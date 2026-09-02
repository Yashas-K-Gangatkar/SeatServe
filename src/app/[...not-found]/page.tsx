import { permanentRedirect } from "next/navigation";

/**
 * Catch-all safety net: the customer app lives at `/` (hash-routed), so any
 * other path has no page. Search engines crawled the domain while it was
 * serving errors, and stale links to paths like `/staff/login` used to show
 * Vercel's 404. Redirect every unknown path to the homepage instead, so old
 * search-result links and mistyped URLs always land on the live app.
 *
 * Real routes (/faq, /legal/*, /staff, ...) and /api/* handlers are matched
 * before this catch-all and are unaffected.
 */
export default function UnknownPathPage() {
  permanentRedirect("/");
}
