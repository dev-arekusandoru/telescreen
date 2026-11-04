import { createServer } from "node:http";
import { FakeCaldav } from "../test/fake-caldav.js";

/** The in-process fake CalDAV from the server tests, exposed over HTTP for the e2e server (`ICLOUD_CALDAV_URL`). */
const fake = new FakeCaldav();
fake.addCalendar("Home");
fake.addCalendar("Holidays", { writable: false });

createServer(async (req, res) => {
  if (req.url === "/__health") {
    res.end("ok");
    return;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers[k] = v;
  const response = await fake.fetch(`http://${req.headers.host}${req.url}`, {
    method: req.method,
    headers,
    body: Buffer.concat(chunks).toString("utf8"),
  });
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(Number(process.env.FAKE_CALDAV_PORT ?? 8798), "127.0.0.1");
