import { config } from "../src/config.js";
import {
  createDatabaseInPage,
  createPageInDataSource,
  listBlockChildren,
  retrieveDataSource
} from "../src/notion.js";

function titleToText(titleProperty) {
  return (titleProperty?.title || []).map((item) => item.plain_text || "").join("").trim();
}

function richTextToText(richTextProperty) {
  return (richTextProperty?.rich_text || []).map((item) => item.plain_text || "").join("").trim();
}

function dayNumberFromTitle(title) {
  const match = String(title || "").match(/day\s*0*([1-9]|[12]\d|30)\b/i);
  return match ? Number(match[1]) : null;
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

async function getTemplateDays() {
  const rows = await queryAllRows(config.sharedDayDataSourceId);

  return rows
    .map((row) => ({
      title: titleToText(row.properties?.["이름"]),
      goal: richTextToText(row.properties?.["오늘의 목표"]),
      week: row.properties?.["주차"]?.select?.name || null,
      date: row.properties?.["날짜"]?.date || null,
      earUrl: row.properties?.["👂 귀 열기"]?.url || null
    }))
    .map((row) => ({ ...row, dayNumber: dayNumberFromTitle(row.title) }))
    .filter((row) => row.dayNumber != null)
    .sort((a, b) => a.dayNumber - b.dayNumber);
}

async function getTeamMembers() {
  const members = [];

  for (const dataSourceId of config.teamDataSourceIds) {
    const rows = await queryAllRows(dataSourceId);
    for (const row of rows) {
      members.push({
        teamDataSourceId: dataSourceId,
        pageId: row.id,
        name: titleToText(row.properties?.["이름"])
      });
    }
  }

  return members;
}

async function listAllChildren(pageId) {
  const children = [];
  let cursor;

  do {
    const response = await listBlockChildren(pageId, cursor);
    children.push(...response.results);
    cursor = response.has_more ? response.next_cursor : null;
  } while (cursor);

  return children;
}

async function ensureMemberDatabase(member, templateDays) {
  const existingBlocks = await listAllChildren(member.pageId);
  const existingDb = existingBlocks.find(
    (block) => block.type === "child_database" && block.child_database?.title === "4기 개인"
  );

  if (existingDb) {
    console.log(`${member.name}: existing "4기 개인" database found, skipping create`);
    return null;
  }

  const database = await createDatabaseInPage(member.pageId, "4기 개인", {
    "이름": { title: {} },
    "완료": { checkbox: {} },
    "오늘의 목표": { rich_text: {} },
    "주차": {
      select: {
        options: [
          { name: "1주차 : Onboarding" },
          { name: "2주차" },
          { name: "3주차" },
          { name: "4주차" }
        ]
      }
    },
    "날짜": { date: {} },
    "👂 귀 열기": { url: {} },
    "팀 멤버": {
      relation: {
        data_source_id: member.teamDataSourceId,
        dual_property: {}
      }
    }
  });

  const childDataSourceId = database.data_sources?.[0]?.id;
  if (!childDataSourceId) {
    throw new Error(`Failed to get child data source for ${member.name}`);
  }

  for (const day of templateDays) {
    await createPageInDataSource(childDataSourceId, {
      "이름": {
        title: [
          {
            type: "text",
            text: {
              content: day.title
            }
          }
        ]
      },
      "완료": {
        checkbox: false
      },
      "오늘의 목표": day.goal
        ? {
            rich_text: [
              {
                type: "text",
                text: {
                  content: day.goal
                }
              }
            ]
          }
        : {
            rich_text: []
          },
      "주차": day.week
        ? {
            select: {
              name: day.week
            }
          }
        : undefined,
      "날짜": day.date
        ? {
            date: day.date
          }
        : undefined,
      "👂 귀 열기": {
        url: day.earUrl
      },
      "팀 멤버": {
        relation: [{ id: member.pageId }]
      }
    });
  }

  console.log(`${member.name}: created "4기 개인" with ${templateDays.length} day rows`);
  return childDataSourceId;
}

async function main() {
  const templateDays = await getTemplateDays();
  const members = await getTeamMembers();

  if (templateDays.length === 0) {
    throw new Error("No template day rows found in the shared 4기 data source");
  }

  for (const member of members) {
    await ensureMemberDatabase(member, templateDays);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
