import {
  appendBlockChildren,
  createDatabaseInPage,
  deleteBlock,
  createPageInDataSource,
  extractPlainTextFromProperty,
  listBlockChildren,
  queryAllPagesInDataSource,
  retrieveDataSource,
  retrieveDatabase,
  updateDataSource,
  updatePageProperties
} from "./notion.js";
import { getProgramDateForDay } from "./schedule.js";

const HISTORY_PAGE_ID = "32c1fc05-de1e-801b-b090-e43e9e05cf88";
const HISTORY_DATABASE_TITLE = "지난 인증률";
const GENERATED_BLOCK_PREFIX = "[auto-rate-comparison]";
const MAX_BLOCK_TEXT_LENGTH = 1800;

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

function extractBlockPlainText(block) {
  if (!block?.type) {
    return "";
  }

  return (block[block.type]?.rich_text || []).map((item) => item.plain_text || "").join("").trim();
}

async function ensureHistoryDataSourceId() {
  const existingBlocks = await listAllChildren(HISTORY_PAGE_ID);
  const existingDb = existingBlocks.find(
    (block) => block.type === "child_database" && block.child_database?.title === HISTORY_DATABASE_TITLE
  );

  if (existingDb) {
    const database = await retrieveDatabase(existingDb.id);
    const dataSourceId = database.data_sources?.[0]?.id;
    if (!dataSourceId) {
      throw new Error(`No data source found in child database ${existingDb.id}`);
    }
    return dataSourceId;
  }

  const database = await createDatabaseInPage(HISTORY_PAGE_ID, HISTORY_DATABASE_TITLE, {
    "이름": { title: {} },
    "날짜": { date: {} },
    "구분": {
      select: {
        options: [{ name: "베이직" }, { name: "프리미엄" }]
      }
    },
    "N일차": { number: {} },
    "인증 인원": { number: {} },
    "전체 인원": { number: {} },
    "인증률": { number: {} }
  });

  const dataSourceId = database.data_sources?.[0]?.id;
  if (!dataSourceId) {
    throw new Error(`Failed to create history data source in page ${HISTORY_PAGE_ID}`);
  }

  return dataSourceId;
}

function buildSnapshotTitle(segment, dayIndex, date) {
  return `${date} ${segment} D${dayIndex}`;
}

async function resolveRatePropertyName(dataSourceId) {
  const dataSource = await retrieveDataSource(dataSourceId);
  const properties = Object.values(dataSource.properties || {});
  const correctProperty = properties.find((property) => property.name === "인증률");
  if (correctProperty) {
    return correctProperty.name;
  }

  const typoProperty = properties.find((property) => property.name === "인증율");
  if (!typoProperty?.id) {
    return "인증률";
  }

  try {
    await updateDataSource(dataSourceId, {
      [typoProperty.id]: {
        name: "인증률"
      }
    });
    return "인증률";
  } catch {
    return "인증율";
  }
}

function buildSnapshotProperties(snapshot, ratePropertyName) {
  return {
    "이름": {
      title: [
        {
          type: "text",
          text: {
            content: buildSnapshotTitle(snapshot.segment, snapshot.dayIndex, snapshot.date)
          }
        }
      ]
    },
    "날짜": {
      date: {
        start: snapshot.date
      }
    },
    "구분": {
      select: {
        name: snapshot.segment
      }
    },
    "N일차": {
      number: snapshot.dayIndex
    },
    "인증 인원": {
      number: snapshot.participantCount
    },
    "전체 인원": {
      number: snapshot.totalPeople
    },
    [ratePropertyName]: {
      number: snapshot.rate
    }
  };
}

function buildBar(rate) {
  const filled = Math.max(0, Math.min(20, Math.round(rate / 5)));
  return `${"#".repeat(filled)}${".".repeat(20 - filled)}`;
}

function toRateRow(page) {
  const dayIndex = page.properties?.["N일차"]?.number;
  const date = page.properties?.["날짜"]?.date?.start || "";
  const segment = page.properties?.["구분"]?.select?.name || "";
  const participantCount = page.properties?.["인증 인원"]?.number ?? 0;
  const totalPeople = page.properties?.["전체 인원"]?.number ?? 0;
  const rate = page.properties?.["인증률"]?.number ?? 0;

  if (!dayIndex || !date || !segment) {
    return null;
  }

  return {
    dayIndex,
    date,
    segment,
    participantCount,
    totalPeople,
    rate
  };
}

function isCurrentScheduleRow(row) {
  return row.date === getProgramDateForDay(row.dayIndex);
}

function buildComparisonLines(rows) {
  const byDay = new Map();

  for (const row of rows) {
    if (!byDay.has(row.dayIndex)) {
      byDay.set(row.dayIndex, {
        dayIndex: row.dayIndex,
        date: row.date,
        basic: null,
        premium: null
      });
    }

    const target = byDay.get(row.dayIndex);
    target.date = row.date;
    if (row.segment === "베이직") {
      target.basic = row;
    } else if (row.segment === "프리미엄") {
      target.premium = row;
    }
  }

  const days = [...byDay.values()].sort((a, b) => a.dayIndex - b.dayIndex);

  return [
    `${GENERATED_BLOCK_PREFIX} 지난 인증률 비교`,
    "D  Date       Basic                          Premium",
    ...days.map(({ dayIndex, date, basic, premium }) => {
      const basicText = basic
        ? `${String(Math.round(basic.rate)).padStart(3, " ")}% ${String(
            basic.participantCount
          ).padStart(2, " ")}/${String(basic.totalPeople).padStart(2, " ")} ${buildBar(basic.rate)}`
        : " --% --/-- ....................";
      const premiumText = premium
        ? `${String(Math.round(premium.rate)).padStart(3, " ")}% ${String(
            premium.participantCount
          ).padStart(2, " ")}/${String(premium.totalPeople).padStart(2, " ")} ${buildBar(premium.rate)}`
        : " --% --/-- ....................";

      return `D${String(dayIndex).padStart(2, "0")} ${date}  ${basicText}  ${premiumText}`;
    })
  ];
}

function buildComparisonBlocks(lines) {
  const chunks = [];
  let current = "";

  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > MAX_BLOCK_TEXT_LENGTH && current) {
      chunks.push(current);
      current = `${GENERATED_BLOCK_PREFIX}\n${line}`;
      continue;
    }

    current = next;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.map((content) => ({
    object: "block",
    type: "code",
    code: {
      language: "plain text",
      rich_text: [
        {
          type: "text",
          text: {
            content
          }
        }
      ]
    }
  }));
}

async function deleteGeneratedComparisonBlocks() {
  const blocks = await listAllChildren(HISTORY_PAGE_ID);
  const generatedBlocks = blocks.filter((block) =>
    extractBlockPlainText(block).startsWith(GENERATED_BLOCK_PREFIX)
  );

  for (const block of generatedBlocks) {
    await deleteBlock(block.id);
  }
}

export async function renderRateComparisonSection() {
  const dataSourceId = await ensureHistoryDataSourceId();
  const pages = await queryAllPagesInDataSource(dataSourceId);
  const rows = pages.map(toRateRow).filter(Boolean).filter(isCurrentScheduleRow);
  const lines = buildComparisonLines(rows);
  const blocks = buildComparisonBlocks(lines);

  await deleteGeneratedComparisonBlocks();
  await appendBlockChildren(HISTORY_PAGE_ID, blocks);

  return {
    historyPageId: HISTORY_PAGE_ID,
    renderedDays: Math.max(0, lines.length - 2),
    renderedBlocks: blocks.length
  };
}

export async function saveRateSnapshot(snapshot) {
  const dataSourceId = await ensureHistoryDataSourceId();
  const ratePropertyName = await resolveRatePropertyName(dataSourceId);
  const pages = await queryAllPagesInDataSource(dataSourceId);
  const existingPage = pages.find((page) => {
    const name = extractPlainTextFromProperty(page.properties?.["이름"]);
    return name === buildSnapshotTitle(snapshot.segment, snapshot.dayIndex, snapshot.date);
  });

  if (existingPage) {
    return updatePageProperties(existingPage.id, buildSnapshotProperties(snapshot, ratePropertyName));
  }

  return createPageInDataSource(dataSourceId, buildSnapshotProperties(snapshot, ratePropertyName));
}
