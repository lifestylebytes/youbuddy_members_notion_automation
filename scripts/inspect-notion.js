import fs from "node:fs";
import path from "node:path";

function loadDotEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const index = trimmed.indexOf("=");
    if (index === -1) {
      continue;
    }
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

async function notion(pathname, options = {}) {
  const response = await fetch(`https://api.notion.com/v1${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
      "Notion-Version": process.env.NOTION_API_VERSION || "2025-09-03",
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  return {
    ok: response.ok,
    status: response.status,
    body
  };
}

function summarizeTitle(property) {
  if (!property) {
    return "";
  }
  if (property.type === "title") {
    return (property.title || []).map((item) => item.plain_text || "").join("");
  }
  if (property.type === "rich_text") {
    return (property.rich_text || []).map((item) => item.plain_text || "").join("");
  }
  return "";
}

async function main() {
  loadDotEnv();

  const ids = [
    process.env.TEAM_A_PARENT_ID,
    process.env.TEAM_B_PARENT_ID
  ].filter(Boolean);

  if (!process.env.NOTION_API_KEY) {
    throw new Error("Missing NOTION_API_KEY");
  }

  for (const id of ids) {
    const databaseResult = await notion(`/databases/${id}`);
    console.log(`\n=== DATABASE ${id} ===`);
    console.log(JSON.stringify(databaseResult, null, 2));

    const dataSourceId = databaseResult.body?.data_sources?.[0]?.id;
    if (!dataSourceId) {
      console.log(`No data source found for database ${id}`);
      continue;
    }

    const dataSourceResult = await notion(`/data_sources/${dataSourceId}`);
    console.log(`\n=== DATA SOURCE ${dataSourceId} ===`);
    console.log(JSON.stringify(dataSourceResult, null, 2));

    const queryResult = await notion(`/data_sources/${dataSourceId}/query`, {
      method: "POST",
      body: JSON.stringify({ page_size: 20 })
    });
    console.log(`\n=== DATA SOURCE ROWS ${dataSourceId} ===`);
    console.log(JSON.stringify(queryResult, null, 2));

    if (queryResult.ok && Array.isArray(queryResult.body?.results)) {
      for (const row of queryResult.body.results.slice(0, 5)) {
        const titleProp = Object.values(row.properties || {}).find((property) => property?.type === "title");
        const title = summarizeTitle(titleProp);
        console.log(`\nrow: ${row.id} -> ${title}`);

        const rowChildrenResult = await notion(`/blocks/${row.id}/children?page_size=100`);
        console.log(`\n=== ROW CHILDREN ${row.id} (${title}) ===`);
        console.log(JSON.stringify(rowChildrenResult, null, 2));
      }
    }
  }

  const sharedDayDataSourceId = "3271fc05-de1e-8062-94fa-000bd4228964";
  const sharedDayDataSourceResult = await notion(`/data_sources/${sharedDayDataSourceId}`);
  console.log(`\n=== SHARED DAY DATA SOURCE ${sharedDayDataSourceId} ===`);
  console.log(JSON.stringify(sharedDayDataSourceResult, null, 2));

  const sharedDayRowsResult = await notion(`/data_sources/${sharedDayDataSourceId}/query`, {
    method: "POST",
    body: JSON.stringify({ page_size: 10 })
  });
  console.log(`\n=== SHARED DAY ROWS ${sharedDayDataSourceId} ===`);
  console.log(JSON.stringify(sharedDayRowsResult, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
