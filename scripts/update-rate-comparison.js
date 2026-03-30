import { renderRateComparisonSection } from "../src/history-store.js";

async function main() {
  const payload = await renderRateComparisonSection();
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
