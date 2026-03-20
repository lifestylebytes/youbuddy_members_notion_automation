import { config } from "./config.js";
import { createDatabaseInPage, createPageInDataSource, listBlockChildren } from "./notion.js";

const PREMIUM_DASHBOARD_PAGE_ID = "3291fc05-de1e-804b-ab00-f371ca79badf";
const PREMIUM_WIDGET_TITLE = "4기 프리미엄 대시보드 위젯 자동화";
const PREMIUM_WIDGET_ROW_NAME = "Premium 오늘 현황";
const START_DATE_KST = "2026-03-23";
const TOTAL_DAYS = 20;

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

function formatKstDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function getDayIndex(todayKst) {
  const start = new Date(`${START_DATE_KST}T00:00:00+09:00`);
  const today = new Date(`${todayKst}T00:00:00+09:00`);
  const diffDays = Math.floor((today - start) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return 0;
  }

  return Math.min(diffDays + 1, TOTAL_DAYS);
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

async function findOrCreatePremiumWidgetDataSource() {
  const children = await listBlockChildren(PREMIUM_DASHBOARD_PAGE_ID);
  const existing = children.results.find(
    (block) => block.type === "child_database" && block.child_database?.title === PREMIUM_WIDGET_TITLE
  );

  if (existing) {
    const database = await notionRequest(`/databases/${existing.id}`);
    const dataSourceId = database.data_sources?.[0]?.id;
    if (!dataSourceId) {
      throw new Error(`Existing Premium widget database has no data source: ${existing.id}`);
    }
    return { databaseId: existing.id, dataSourceId };
  }

  const database = await createDatabaseInPage(PREMIUM_DASHBOARD_PAGE_ID, PREMIUM_WIDGET_TITLE, {
    "이름": { title: {} },
    "오늘 N일차": { number: {} },
    "오늘 인증 인원": { number: {} },
    "전체 인원": { number: {} },
    "오늘 인증율": { number: {} },
    "진행표시": { rich_text: {} },
    "날짜": { date: {} }
  });

  const dataSourceId = database.data_sources?.[0]?.id;
  if (!dataSourceId) {
    throw new Error("Failed to create Premium widget data source");
  }

  return { databaseId: database.id, dataSourceId };
}

async function findOrCreatePremiumWidgetRow(dataSourceId) {
  const rows = await queryAllRows(dataSourceId);
  if (rows[0]?.id) {
    return rows[0].id;
  }

  const row = await createPageInDataSource(dataSourceId, {
    "이름": {
      title: [
        {
          type: "text",
          text: {
            content: PREMIUM_WIDGET_ROW_NAME
          }
        }
      ]
    },
    "오늘 N일차": { number: 0 },
    "오늘 인증 인원": { number: 0 },
    "전체 인원": { number: 0 },
    "오늘 인증율": { number: 0 },
    "진행표시": { rich_text: [] },
    "날짜": { date: null }
  });

  return row.id;
}

async function getPremiumMemberRows() {
  return queryAllRows(config.premiumDataSourceId);
}

export async function updatePremiumDashboardWidget() {
  const { databaseId, dataSourceId } = await findOrCreatePremiumWidgetDataSource();
  const rowId = await findOrCreatePremiumWidgetRow(dataSourceId);

  const todayKst = formatKstDate();
  const dayIndex = getDayIndex(todayKst);
  const targetProperty = dayIndex > 0 ? `Day${dayIndex}` : null;
  const members = await getPremiumMemberRows();
  const totalPeople = members.length;
  const participantCount = targetProperty
    ? members.filter((member) => member.properties?.[targetProperty]?.checkbox === true).length
    : 0;
  const rate = totalPeople > 0 ? Math.round((participantCount / totalPeople) * 1000) / 10 : 0;
  const progressText = dayIndex > 0 ? `${dayIndex}/${TOTAL_DAYS}일째` : `시작 전 (0/${TOTAL_DAYS})`;

  await notionRequest(`/pages/${rowId}`, {
    method: "PATCH",
    body: {
      properties: {
        "오늘 N일차": { number: dayIndex },
        "오늘 인증 인원": { number: participantCount },
        "전체 인원": { number: totalPeople },
        "오늘 인증율": { number: rate },
        "진행표시": {
          rich_text: [
            {
              type: "text",
              text: { content: progressText }
            }
          ]
        },
        "날짜": {
          date: {
            start: todayKst
          }
        }
      }
    }
  });

  return {
    databaseId,
    dataSourceId,
    rowId,
    todayKst,
    dayIndex,
    participantCount,
    totalPeople,
    rate,
    progressText
  };
}
