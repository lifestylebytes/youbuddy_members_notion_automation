import { config } from "../src/config.js";
import { listBlockChildren } from "../src/notion.js";

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

async function getOriginalFourGiDatabaseId(memberPageId) {
  const children = await listBlockChildren(memberPageId);
  const original = children.results.find(
    (block) => block.type === "child_database" && block.child_database?.title === "4기"
  );
  return original?.id || null;
}

async function ensureProperty(databaseId, memberName) {
  const database = await notionRequest(`/databases/${databaseId}`);
  const dataSourceId = database.data_sources?.[0]?.id;
  if (!dataSourceId) {
    console.log(`${memberName}: no data source for original 4기`);
    return;
  }

  const dataSource = await notionRequest(`/data_sources/${dataSourceId}`);
  if (dataSource.properties?.["완료 메시지"]) {
    console.log(`${memberName}: 완료 메시지 already exists`);
    return;
  }

  await notionRequest(`/data_sources/${dataSourceId}`, {
    method: "PATCH",
    body: {
      properties: {
        "완료 메시지": {
          rich_text: {}
        }
      }
    }
  });

  console.log(`${memberName}: added 완료 메시지`);
}

async function main() {
  const members = await getTeamMembers();

  for (const member of members) {
    const databaseId = await getOriginalFourGiDatabaseId(member.pageId);
    if (!databaseId) {
      console.log(`${member.name}: original 4기 not found`);
      continue;
    }

    await ensureProperty(databaseId, member.name);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
