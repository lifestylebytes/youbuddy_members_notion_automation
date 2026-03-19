import { config } from "../src/config.js";
import { listBlockChildren } from "../src/notion.js";

async function notionRequest(path, { method = "GET" } = {}) {
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.notionApiKey}`,
      "Notion-Version": config.notionApiVersion,
      "Content-Type": "application/json"
    }
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

function titleToText(titleProperty) {
  return (titleProperty?.title || []).map((item) => item.plain_text || "").join("").trim();
}

async function queryAllRows(dataSourceId) {
  const rows = [];
  let cursor;

  do {
    const response = await fetch(`https://api.notion.com/v1/data_sources/${dataSourceId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.notionApiKey}`,
        "Notion-Version": config.notionApiVersion,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(cursor ? { page_size: 100, start_cursor: cursor } : { page_size: 100 })
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(`Query failed for ${dataSourceId}: ${JSON.stringify(payload)}`);
    }

    rows.push(...payload.results);
    cursor = payload.has_more ? payload.next_cursor : null;
  } while (cursor);

  return rows;
}

async function getTeamMembers() {
  const members = [];

  for (const dataSourceId of config.teamDataSourceIds) {
    const rows = await queryAllRows(dataSourceId);
    for (const row of rows) {
      members.push({
        pageId: row.id,
        name: titleToText(row.properties?.["이름"])
      });
    }
  }

  return members;
}

async function main() {
  const members = await getTeamMembers();

  for (const member of members) {
    const children = await listBlockChildren(member.pageId);
    const extraDb = children.results.find(
      (block) => block.type === "child_database" && block.child_database?.title === "4기 개인"
    );

    if (!extraDb) {
      console.log(`${member.name}: no 4기 개인 found`);
      continue;
    }

    await notionRequest(`/blocks/${extraDb.id}`, { method: "DELETE" });
    console.log(`${member.name}: deleted 4기 개인`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
