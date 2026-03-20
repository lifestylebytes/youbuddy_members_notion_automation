import { config } from "../src/config.js";

const DATA_SOURCE_IDS = [
  process.env.TEAM_A_DATA_SOURCE_ID,
  process.env.TEAM_B_DATA_SOURCE_ID,
  "3291fc05-de1e-811d-b64a-000b6a856187"
].filter(Boolean);

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

function titleToText(row) {
  return (row.properties?.["이름"]?.title || []).map((item) => item.plain_text || "").join("").trim();
}

function blockText(block) {
  return (block?.[block.type]?.rich_text || []).map((item) => item.plain_text || "").join("").trim();
}

async function deleteBlock(blockId) {
  return notionRequest(`/blocks/${blockId}`, { method: "DELETE" });
}

async function main() {
  const deletions = [];

  for (const dataSourceId of DATA_SOURCE_IDS) {
    const rows = await queryAllRows(dataSourceId);

    for (const row of rows) {
      const children = await notionRequest(`/blocks/${row.id}/children?page_size=100`);
      const matches = (children.results || []).filter(
        (block) => block.type === "paragraph" && blockText(block) === "김가현"
      );

      for (const block of matches) {
        await deleteBlock(block.id);
        deletions.push({
          dataSourceId,
          pageId: row.id,
          member: titleToText(row),
          blockId: block.id
        });
        console.log(`Deleted stray block from ${titleToText(row)} (${row.id})`);
      }
    }
  }

  console.log(JSON.stringify({ deletedCount: deletions.length, deletions }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
