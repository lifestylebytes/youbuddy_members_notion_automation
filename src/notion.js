import { config } from "./config.js";

const NOTION_API_BASE_URL = "https://api.notion.com/v1";

async function notionRequest(path, { method = "GET", body, query } = {}) {
  const url = new URL(`${NOTION_API_BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          url.searchParams.append(key, item);
        }
      } else if (value != null) {
        url.searchParams.set(key, value);
      }
    }
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${config.notionApiKey}`,
      "Notion-Version": config.notionApiVersion,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Notion API ${method} ${path} failed (${response.status}): ${text}`);
  }

  return response.json();
}

export async function retrievePage(pageId) {
  return notionRequest(`/pages/${pageId}`);
}

export async function retrieveDataSource(dataSourceId) {
  return notionRequest(`/data_sources/${dataSourceId}`);
}

export async function retrieveDatabase(databaseId) {
  return notionRequest(`/databases/${databaseId}`);
}

export async function listBlockChildren(blockId, startCursor) {
  return notionRequest(`/blocks/${blockId}/children`, {
    query: {
      page_size: 100,
      start_cursor: startCursor
    }
  });
}

export async function createDatabaseInPage(pageId, title, properties) {
  return notionRequest("/databases", {
    method: "POST",
    body: {
      parent: {
        type: "page_id",
        page_id: pageId
      },
      title: [
        {
          type: "text",
          text: {
            content: title
          }
        }
      ],
      is_inline: true,
      initial_data_source: {
        properties
      }
    }
  });
}

export async function createPageInDataSource(dataSourceId, properties) {
  return notionRequest("/pages", {
    method: "POST",
    body: {
      parent: {
        type: "data_source_id",
        data_source_id: dataSourceId
      },
      properties
    }
  });
}

export async function updatePageCheckbox(pageId, propertyName, checked) {
  return notionRequest(`/pages/${pageId}`, {
    method: "PATCH",
    body: {
      properties: {
        [propertyName]: {
          checkbox: checked
        }
      }
    }
  });
}

export async function updatePageProperties(pageId, properties) {
  return notionRequest(`/pages/${pageId}`, {
    method: "PATCH",
    body: {
      properties
    }
  });
}

export async function queryAllPagesInDataSource(dataSourceId, filterProperties = []) {
  const results = [];
  let nextCursor;

  do {
    const response = await notionRequest(`/data_sources/${dataSourceId}/query`, {
      method: "POST",
      query: filterProperties.length > 0 ? { "filter_properties[]": filterProperties } : undefined,
      body: nextCursor ? { start_cursor: nextCursor } : {}
    });

    results.push(...response.results.filter((entry) => entry.object === "page"));
    nextCursor = response.has_more ? response.next_cursor : null;
  } while (nextCursor);

  return results;
}

export function extractPlainTextFromProperty(property) {
  if (!property || typeof property !== "object") {
    return "";
  }

  if (property.type === "title") {
    return (property.title || []).map((item) => item.plain_text || "").join("").trim();
  }

  if (property.type === "rich_text") {
    return (property.rich_text || []).map((item) => item.plain_text || "").join("").trim();
  }

  if (property.type === "formula") {
    return extractPlainTextFromProperty(property.formula);
  }

  if (property.type === "string") {
    return String(property.string || "").trim();
  }

  return "";
}

export function extractCheckboxValue(property) {
  return Boolean(property?.checkbox);
}

export function extractRelationIds(property) {
  if (!property || property.type !== "relation") {
    return [];
  }

  return (property.relation || []).map((item) => item.id).filter(Boolean);
}
