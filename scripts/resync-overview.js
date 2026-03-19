import { resyncOverview } from "../src/resync.js";

async function main() {
  const results = await resyncOverview();
  for (const result of results) {
    if (result.status === "ok") {
      console.log(`${result.member}: resynced overview from original 4기`);
    } else {
      console.log(`${result.member}: ${result.reason}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
