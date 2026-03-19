import { handleRequest } from "../src/handler.js";

async function readRawBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

export default async function handler(request, response) {
  const rawBody = await readRawBody(request);
  const result = await handleRequest({
    method: request.method,
    pathname: "/webhooks/notion",
    headers: request.headers,
    rawBody
  });

  response.status(result.statusCode).json(result.payload);
}
