import { updatePremiumDashboardWidget } from "../src/premium-dashboard.js";

async function main() {
  const payload = await updatePremiumDashboardWidget();
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
