import { handleRequest } from "../src/handler.js";

export default async function handler(_request, response) {
  const result = await handleRequest({
    method: "GET",
    pathname: "/healthz",
    headers: {},
    rawBody: ""
  });

  response.status(result.statusCode).json(result.payload);
}
