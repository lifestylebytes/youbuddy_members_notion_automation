import { config } from "../src/config.js";
import {
  extractCheckboxValue,
  extractPlainTextFromProperty,
  extractRelationIds,
  retrieveDataSource,
  retrievePage,
  updatePageCheckbox
} from "../src/notion.js";

function parseDayPropertyName(title) {
  const match = String(title || "").match(/day\s*0*([1-9]|[12]\d|30)\b/i);
  if (!match) {
    return null;
  }

  return `Day${Number(match[1])}`;
}

async function getMemberRelationPropertyNames() {
  const dataSource = await retrieveDataSource(config.sharedDayDataSourceId);
  return Object.values(dataSource.properties || {})
    .filter((property) => property?.type === "relation")
    .filter((property) => config.teamDataSourceIds.includes(property.relation?.data_source_id))
    .map((property) => property.name);
}

async function main() {
  const pageId = process.argv[2];
  if (!pageId) {
    throw new Error("Usage: node scripts/sync-day-page.js <day_row_page_id>");
  }

  const page = await retrievePage(pageId);
  const title = extractPlainTextFromProperty(page.properties?.["이름"]);
  const dayPropertyName = parseDayPropertyName(title);
  const completed = extractCheckboxValue(page.properties?.[config.dayCompletedProperty]);
  const relationNames = await getMemberRelationPropertyNames();
  const memberIds = relationNames.flatMap((name) => extractRelationIds(page.properties?.[name]));

  if (!dayPropertyName) {
    throw new Error(`Could not parse day number from "${title}"`);
  }

  if (memberIds.length === 0) {
    throw new Error(`No related Team member row found for "${title}"`);
  }

  for (const memberId of memberIds) {
    await updatePageCheckbox(memberId, dayPropertyName, completed);
    console.log(`Updated ${memberId}: ${dayPropertyName}=${completed}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
