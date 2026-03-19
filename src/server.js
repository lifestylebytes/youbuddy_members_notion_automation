import crypto from "node:crypto";
import http from "node:http";
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

function json(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

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
          completedPropertyName: completedProperty?.name || null,
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
  if (!match) {
    return null;
  }

  return `Day${Number(match[1])}`;
}

async function syncSharedDayPage(pageId) {
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
  const relationPropertyNames = metadata.relationPropertyNames;
  const memberPageIds = relationPropertyNames.flatMap((propertyName) =>
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
  await syncSharedDayPage(event.entity.id);
}

async function readRawBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/healthz") {
      return json(response, 200, { ok: true });
    }

    if (request.method !== "POST" || request.url !== "/webhooks/notion") {
      return json(response, 404, { error: "Not found" });
    }

    const rawBodyBuffer = await readRawBody(request);
    const rawBody = rawBodyBuffer.toString("utf8");
    const payload = rawBody ? JSON.parse(rawBody) : {};

    if (payload.verification_token) {
      runtimeVerificationToken = payload.verification_token;
      console.log("Received Notion verification token request.");
      console.log(`NOTION_WEBHOOK_VERIFICATION_TOKEN=${payload.verification_token}`);
      return json(response, 200, { ok: true, verificationTokenReceived: true });
    }

    const signatureHeader = request.headers["x-notion-signature"];
    if (!verifySignature(rawBody, signatureHeader)) {
      return json(response, 401, { error: "Invalid Notion signature" });
    }

    await handleNotionEvent(payload);
    return json(response, 200, { ok: true });
  } catch (error) {
    console.error(error);
    return json(response, 500, { error: error.message });
  }
});

server.listen(config.port, () => {
  console.log(`Notion day sync server listening on port ${config.port}`);
});
