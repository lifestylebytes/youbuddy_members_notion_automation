import { config } from "../src/config.js";
import { retrieveDataSource } from "../src/notion.js";

async function notionRequest(path, { method = "GET", body } = {}) {
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.notionApiKey}`,
      "Notion-Version": config.notionApiVersion,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }

  if (!response.ok) {
    throw new Error(`Notion API ${method} ${path} failed (${response.status}): ${text}`);
  }

  return payload;
}

function buildMissingDayProperties(existingProperties) {
  const updates = {};

  for (let day = 1; day <= 30; day += 1) {
    const propertyName = `Day${day}`;
    if (existingProperties[propertyName]) {
      continue;
    }

    updates[propertyName] = {
      type: "checkbox",
      checkbox: {}
    };
  }

  return updates;
}

async function ensureDayCheckboxes(dataSourceId) {
  const dataSource = await retrieveDataSource(dataSourceId);
  const updates = buildMissingDayProperties(dataSource.properties || {});
  const updateNames = Object.keys(updates);

  if (updateNames.length === 0) {
    console.log(`${dataSourceId}: Day1~Day30 already exist`);
    return;
  }

  await notionRequest(`/data_sources/${dataSourceId}`, {
    method: "PATCH",
    body: {
      properties: updates
    }
  });

  console.log(`${dataSourceId}: added ${updateNames.join(", ")}`);
}

async function main() {
  for (const dataSourceId of config.teamDataSourceIds) {
    await ensureDayCheckboxes(dataSourceId);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
