import http from "node:http";
import { config } from "./config.js";
import { handleRequest } from "./handler.js";

async function readRawBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

const server = http.createServer(async (request, response) => {
  const rawBodyBuffer = await readRawBody(request);
  const rawBody = rawBodyBuffer.toString("utf8");
  const pathname = new URL(request.url, "http://localhost").pathname;
  const result = await handleRequest({
    method: request.method,
    pathname,
    headers: request.headers,
    rawBody
  });

  response.writeHead(result.statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(result.payload));
});

server.listen(config.port, () => {
  console.log(`Notion day sync server listening on port ${config.port}`);
});
