import crypto from "node:crypto";
import { config } from "./config.js";
import {
  extractCheckboxValue,
  extractPlainTextFromProperty,
  extractRelationIds,
  retrievePage,
  retrieveDataSource,
  updatePageCheckbox
} from "./notion.js";

const processedEvents = new Map();
let runtimeVerificationToken = config.notionWebhookVerificationToken;
const dayDataSourceMetadataCache = new Map();

function rememberEvent(eventId) {
  const now = Date.now();
  processedEvents.set(eventId, now);

  for (const [id, timestamp] of processedEvents.entries()) {
    if (now - timestamp > 1000 * 60 * 60) {
      processedEvents.delete(id);
    }
  }
}

function verifySignature(rawBody, signatureHeader) {
  if (!runtimeVerificationToken) {
    throw new Error(
      "NOTION_WEBHOOK_VERIFICATION_TOKEN is missing. Create the webhook once, capture the verification token, and add it to .env."
    );
  }

  const expectedSignature =
    "sha256=" +
    crypto.createHmac("sha256", runtimeVerificationToken).update(rawBody).digest("hex");

  const actual = Buffer.from(signatureHeader || "", "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");

  if (actual.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(actual, expected);
}

async function getDayDataSourceMetadata(dataSourceId) {
  if (!dayDataSourceMetadataCache.has(dataSourceId)) {
    dayDataSourceMetadataCache.set(
      dataSourceId,
      retrieveDataSource(dataSourceId).then((dataSource) => {
        const properties = Object.values(dataSource.properties || {});
        const completedProperty = properties.find(
          (property) => property?.type === "checkbox" && property?.name === config.dayCompletedProperty
        );
        const relationPropertyNames = properties
          .filter((property) => property?.type === "relation")
          .filter((property) =>
            config.normalizedTeamDataSourceIds.includes(
              config.normalizeId(property.relation?.data_source_id)
            )
          )
          .map((property) => property.name);

        return {
          completedPropertyId: completedProperty?.id || null,
          relationPropertyNames
        };
      })
    );
  }

  return dayDataSourceMetadataCache.get(dataSourceId);
}

async function shouldProcessEvent(event, sourceDataSourceId) {
  if (event?.entity?.type !== "page") {
    return false;
  }

  if (
    !sourceDataSourceId ||
    config.normalizedTeamDataSourceIds.includes(config.normalizeId(sourceDataSourceId))
  ) {
    return false;
  }

  const metadata = await getDayDataSourceMetadata(sourceDataSourceId);
  if (!metadata.completedPropertyId || metadata.relationPropertyNames.length === 0) {
    return false;
  }

  if (event.type === "page.properties_updated") {
    const updatedProperties = event.data?.updated_properties || [];
    return updatedProperties.includes(metadata.completedPropertyId);
  }

  return event.type === "page.content_updated" || event.type === "page.created";
}

function parseDayPropertyName(title) {
  const match = String(title || "").match(/day\s*0*([1-9]|[12]\d|30)\b/i);
  return match ? `Day${Number(match[1])}` : null;
}

function getSourceDataSourceId(page) {
  const parent = page?.parent || {};

  if (parent.type === "data_source_id") {
    return parent.data_source_id;
  }

  if (parent.type === "database_id") {
    return parent.database_id;
  }

  return null;
}

async function syncDayPage(pageId) {
  const sourcePage = await retrievePage(pageId);
  const title = extractPlainTextFromProperty(sourcePage.properties?.["이름"]);
  const dayPropertyName = parseDayPropertyName(title);

  if (!dayPropertyName) {
    console.warn(`Unable to parse a Day number from "${title}" (${pageId})`);
    return;
  }

  const completed = extractCheckboxValue(sourcePage.properties?.[config.dayCompletedProperty]);
  const sourceDataSourceId = getSourceDataSourceId(sourcePage);
  const metadata = await getDayDataSourceMetadata(sourceDataSourceId);
  const memberPageIds = metadata.relationPropertyNames.flatMap((propertyName) =>
    extractRelationIds(sourcePage.properties?.[propertyName])
  );

  if (memberPageIds.length === 0) {
    console.warn(`No related Team member row found for "${title}" (${pageId})`);
    return;
  }

  for (const memberPageId of memberPageIds) {
    await updatePageCheckbox(memberPageId, dayPropertyName, completed);
    console.log(`Updated ${memberPageId}: ${dayPropertyName}=${completed} from "${title}"`);
  }
}

async function handleNotionEvent(event) {
  if (!event?.id || !event?.entity?.id || event.entity.type !== "page") {
    return;
  }

  if (processedEvents.has(event.id)) {
    return;
  }

  const sourcePage = await retrievePage(event.entity.id);
  const sourceDataSourceId = getSourceDataSourceId(sourcePage);
  if (!(await shouldProcessEvent(event, sourceDataSourceId))) {
    return;
  }

  rememberEvent(event.id);
  await syncDayPage(event.entity.id);
}

export async function handleRequest({ method, pathname, headers, rawBody }) {
  try {
    if (method === "GET" && pathname === "/healthz") {
      return { statusCode: 200, payload: { ok: true } };
    }

    if (method !== "POST" || pathname !== "/webhooks/notion") {
      return { statusCode: 404, payload: { error: "Not found" } };
    }

    const payload = rawBody ? JSON.parse(rawBody) : {};

    if (payload.verification_token) {
      runtimeVerificationToken = payload.verification_token;
      console.log("Received Notion verification token request.");
      console.log(`NOTION_WEBHOOK_VERIFICATION_TOKEN=${payload.verification_token}`);
      return { statusCode: 200, payload: { ok: true, verificationTokenReceived: true } };
    }

    const signatureHeader = headers["x-notion-signature"] || headers["X-Notion-Signature"];
    if (!verifySignature(rawBody, signatureHeader)) {
      return { statusCode: 401, payload: { error: "Invalid Notion signature" } };
    }

    await handleNotionEvent(payload);
    return { statusCode: 200, payload: { ok: true } };
  } catch (error) {
    console.error(error);
    return { statusCode: 500, payload: { error: error.message } };
  }
}
