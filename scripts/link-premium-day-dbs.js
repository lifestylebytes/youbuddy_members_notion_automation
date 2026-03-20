import { listBlockChildren, retrieveDataSource } from "../src/notion.js";
import { config } from "../src/config.js";

const PREMIUM_DATA_SOURCE_ID = "3291fc05-de1e-811d-b64a-000b6a856187";
const PREMIUM_NORMALIZED_ID = config.normalizeId(PREMIUM_DATA_SOURCE_ID);

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
    const payload = await notionRequest(`/data_sources/${dataSourceId}/query`, {
      method: "POST",
      body: cursor ? { page_size: 100, start_cursor: cursor } : { page_size: 100 }
    });

    rows.push(...payload.results);
    cursor = payload.has_more ? payload.next_cursor : null;
  } while (cursor);

  return rows;
}

async function getPremiumMembers() {
  const rows = await queryAllRows(PREMIUM_DATA_SOURCE_ID);
  return rows.map((row) => ({
    pageId: row.id,
    name: titleToText(row.properties?.["이름"])
  }));
}

async function getOriginalFourGiDataSourceId(memberPageId) {
  const children = await listBlockChildren(memberPageId);
  const original = children.results.find(
    (block) => block.type === "child_database" && block.child_database?.title === "4기"
  );

  if (!original) {
    return null;
  }

  const database = await notionRequest(`/databases/${original.id}`);
  return database.data_sources?.[0]?.id || null;
}

async function getRelationPropertyName(dataSourceId) {
  const dataSource = await retrieveDataSource(dataSourceId);
  const relationProperty = Object.values(dataSource.properties || {}).find(
    (property) =>
      property?.type === "relation" &&
      config.normalizeId(property.relation?.data_source_id) === PREMIUM_NORMALIZED_ID
  );

  return relationProperty?.name || null;
}

async function updateRowRelation(rowId, relationPropertyName, memberPageId) {
  return notionRequest(`/pages/${rowId}`, {
    method: "PATCH",
    body: {
      properties: {
        [relationPropertyName]: {
          relation: [{ id: memberPageId }]
        }
      }
    }
  });
}

async function main() {
  const members = await getPremiumMembers();

  for (const member of members) {
    const originalDataSourceId = await getOriginalFourGiDataSourceId(member.pageId);
    if (!originalDataSourceId) {
      console.log(`${member.name}: original 4기 not found, skipping`);
      continue;
    }

    const relationPropertyName = await getRelationPropertyName(originalDataSourceId);
    if (!relationPropertyName) {
      console.log(`${member.name}: no Premium relation property in original 4기, skipping`);
      continue;
    }

    const rows = await queryAllRows(originalDataSourceId);
    for (const row of rows) {
      await updateRowRelation(row.id, relationPropertyName, member.pageId);
    }

    console.log(`${member.name}: linked ${rows.length} original 4기 rows via "${relationPropertyName}"`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
