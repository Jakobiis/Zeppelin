import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import path from "node:path";

const fastify = Fastify({
  // We already get logs from nginx, so disable here
  logger: false,
});

// The backend API isn't publicly reachable, so we proxy archive links
// (used in mod log messages etc.) through the dashboard server instead.
// This talks to the backend directly over the internal docker network.
const internalApiUrl = process.env.INTERNAL_API_URL || "http://api:3001";
const apiPathPrefix = process.env.API_PATH_PREFIX || "";

fastify.addHook("preHandler", (req, reply, done) => {
  if (req.url === "/env.js") {
    reply.header("Content-Type", "application/javascript; charset=utf8");
    reply.send(`window.API_URL = ${JSON.stringify(process.env.API_URL)};`);
  }
  done();
});

fastify.get("/archives/:id", async (req, reply) => {
  const upstreamUrl = `${internalApiUrl}${apiPathPrefix}/archives/${encodeURIComponent(req.params.id)}`;
  const upstreamRes = await fetch(upstreamUrl);
  const body = await upstreamRes.text();

  reply.code(upstreamRes.status);
  reply.header("Content-Type", "text/plain; charset=UTF-8");
  reply.header("X-Content-Type-Options", "nosniff");
  reply.send(body);
});

fastify.register(fastifyStatic, {
  root: path.join(import.meta.dirname, "dist"),
  wildcard: false,
});

fastify.get("*", (req, reply) => {
  reply.sendFile("index.html");
});

fastify.listen({ port: 3002, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    throw err;
  }
  console.log(`Server listening on ${address}`);
});

process.on("SIGTERM", () => {
  fastify.close().then(() => {
    process.exit(0);
  });
});
