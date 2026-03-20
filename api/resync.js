import { resyncOverview } from "../src/resync.js";
import { updateDashboardWidget } from "../src/dashboard.js";
import { updatePremiumDashboardWidget } from "../src/premium-dashboard.js";

function isAuthorized(request) {
  const expected = process.env.RESYNC_SECRET || "";
  if (!expected) {
    throw new Error("Missing RESYNC_SECRET");
  }

  const provided =
    request.headers["x-resync-secret"] ||
    request.query?.secret ||
    request.body?.secret ||
    "";

  return provided === expected;
}

export default async function handler(request, response) {
  try {
    if (!["POST", "GET"].includes(request.method)) {
      return response.status(405).json({ error: "Method not allowed" });
    }

    if (!isAuthorized(request)) {
      return response.status(401).json({ error: "Unauthorized" });
    }

    const overviewResults = await resyncOverview();
    const widgetResult = await updateDashboardWidget();
    const premiumWidgetResult = await updatePremiumDashboardWidget();

    return response.status(200).json({
      ok: true,
      overviewResults,
      widgetResult,
      premiumWidgetResult
    });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: error.message });
  }
}
