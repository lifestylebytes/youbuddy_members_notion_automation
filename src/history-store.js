import {
  createDatabaseInPage,
  createPageInDataSource,
  extractPlainTextFromProperty,
  listBlockChildren,
  queryAllPagesInDataSource,
  retrieveDatabase,
  updatePageProperties
} from "./notion.js";

const HISTORY_PAGE_ID = "32c1fc05-de1e-801b-b090-e43e9e05cf88";
const HISTORY_DATABASE_TITLE = "지난 인증률";

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

function buildSnapshotProperties(snapshot) {
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
    "인증률": {
      number: snapshot.rate
    }
  };
}

export async function saveRateSnapshot(snapshot) {
  const dataSourceId = await ensureHistoryDataSourceId();
  const pages = await queryAllPagesInDataSource(dataSourceId);
  const existingPage = pages.find((page) => {
    const name = extractPlainTextFromProperty(page.properties?.["이름"]);
    return name === buildSnapshotTitle(snapshot.segment, snapshot.dayIndex, snapshot.date);
  });

  if (existingPage) {
    return updatePageProperties(existingPage.id, buildSnapshotProperties(snapshot));
  }

  return createPageInDataSource(dataSourceId, buildSnapshotProperties(snapshot));
}
