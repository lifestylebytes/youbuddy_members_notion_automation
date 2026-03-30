import { updateDashboardWidget } from "../src/dashboard.js";
import { renderRateComparisonSection } from "../src/history-store.js";
import { updatePremiumDashboardWidget } from "../src/premium-dashboard.js";

async function main() {
  const widgetResult = await updateDashboardWidget();
  const premiumWidgetResult = await updatePremiumDashboardWidget();
  const historyRenderResult = await renderRateComparisonSection();

  console.log(
    JSON.stringify(
      {
        widgetResult,
        premiumWidgetResult,
        historyRenderResult
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
