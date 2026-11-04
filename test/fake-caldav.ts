/**
 * Minimal in-process CalDAV server speaking just enough WebDAV for tsdav discovery + our sync/write paths.
 * Plug in with `vi.stubGlobal("fetch", fake.fetch)`.
 */
export interface FakeCalendar {
  name: string;
  /** Collection path, e.g. `/cals/work/`. */
  path: string;
  writable: boolean;
  ctag: number;
  objects: Map<string, { ics: string; etag: string }>;
}

const NS =
  'xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/" xmlns:ca="http://apple.com/ns/ical/"';

const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export class FakeCaldav {
  readonly calendars: FakeCalendar[] = [];
  readonly requests: Array<{ method: string; path: string }> = [];
  /** Credentials the server accepts (HTTP Basic). */
  password = "app-pass";
  private etagCounter = 0;

  addCalendar(name: string, opts: { writable?: boolean } = {}): FakeCalendar {
    const cal: FakeCalendar = {
      name,
      path: `/cals/${name.toLowerCase().replace(/\W+/g, "-")}/`,
      writable: opts.writable ?? true,
      ctag: 1,
      objects: new Map(),
    };
    this.calendars.push(cal);
    return cal;
  }

  private nextEtag(): string {
    return `"etag-${++this.etagCounter}"`;
  }

  /** Server-side change (another client). Returns the new etag. */
  put(cal: FakeCalendar, file: string, ics: string): string {
    const etag = this.nextEtag();
    cal.objects.set(cal.path + file, { ics, etag });
    cal.ctag++;
    return etag;
  }

  remove(cal: FakeCalendar, file: string): void {
    cal.objects.delete(cal.path + file);
    cal.ctag++;
  }

  get(cal: FakeCalendar, file: string) {
    return cal.objects.get(cal.path + file);
  }

  readonly fetch: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const body = typeof init?.body === "string" ? init.body : "";
    const path = url.pathname;
    this.requests.push({ method, path });

    const expected = `Basic ${Buffer.from(`apple@example.com:${this.password}`).toString("base64")}`;
    if (headers.get("authorization") !== expected) return new Response("unauthorized", { status: 401 });

    const multistatus = (responses: string) =>
      new Response(`<?xml version="1.0" encoding="utf-8"?><d:multistatus ${NS}>${responses}</d:multistatus>`, {
        status: 207,
        headers: { "content-type": "application/xml" },
      });
    const prop = (href: string, inner: string) =>
      `<d:response><d:href>${href}</d:href><d:propstat><d:prop>${inner}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;

    if (method === "PROPFIND") {
      if (path === "/.well-known/caldav") return new Response("", { status: 404 });
      if (path === "/") {
        return multistatus(prop("/", "<d:current-user-principal><d:href>/principals/u/</d:href></d:current-user-principal>"));
      }
      if (path === "/principals/u/") {
        return multistatus(prop(path, "<c:calendar-home-set><d:href>/cals/</d:href></c:calendar-home-set>"));
      }
      if (path === "/cals/") {
        return multistatus(
          prop("/cals/", "<d:resourcetype><d:collection/></d:resourcetype>") +
            this.calendars
              .map((c) =>
                prop(
                  c.path,
                  `<d:resourcetype><d:collection/><c:calendar/></d:resourcetype>
                   <d:displayname>${xmlEscape(c.name)}</d:displayname>
                   <ca:calendar-color>#FF2968FF</ca:calendar-color>
                   <cs:getctag>ctag-${c.ctag}</cs:getctag>
                   <c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set>
                   <d:current-user-privilege-set>${
                     c.writable
                       ? "<d:privilege><d:read/></d:privilege><d:privilege><d:write/></d:privilege>"
                       : "<d:privilege><d:read/></d:privilege>"
                   }</d:current-user-privilege-set>`,
                ),
              )
              .join(""),
        );
      }
      // supported-report-set on a calendar
      return multistatus(
        prop(
          path,
          "<d:supported-report-set><d:supported-report><d:report><c:calendar-query/></d:report></d:supported-report><d:supported-report><d:report><c:calendar-multiget/></d:report></d:supported-report></d:supported-report-set>",
        ),
      );
    }

    const cal = this.calendars.find((c) => path.startsWith(c.path));
    if (!cal) return new Response("not found", { status: 404 });

    if (method === "REPORT") {
      return multistatus(
        [...cal.objects.entries()]
          .map(([href, o]) =>
            prop(href, `<d:getetag>${xmlEscape(o.etag)}</d:getetag><c:calendar-data>${xmlEscape(o.ics)}</c:calendar-data>`),
          )
          .join(""),
      );
    }

    const existing = cal.objects.get(path);
    if (method === "GET") {
      return existing
        ? new Response(existing.ics, { status: 200, headers: { etag: existing.etag, "content-type": "text/calendar" } })
        : new Response("", { status: 404 });
    }
    if (method === "PUT") {
      if (!cal.writable) return new Response("forbidden", { status: 403 });
      const ifMatch = headers.get("if-match");
      if (headers.get("if-none-match") === "*" && existing) return new Response("", { status: 412 });
      if (ifMatch && existing?.etag !== ifMatch) return new Response("", { status: 412 });
      const etag = this.nextEtag();
      cal.objects.set(path, { ics: body, etag });
      cal.ctag++;
      return new Response(null, { status: existing ? 204 : 201, headers: { etag } });
    }
    if (method === "DELETE") {
      if (!cal.writable) return new Response("forbidden", { status: 403 });
      const ifMatch = headers.get("if-match");
      if (!existing) return new Response("", { status: 404 });
      if (ifMatch && existing.etag !== ifMatch) return new Response("", { status: 412 });
      cal.objects.delete(path);
      cal.ctag++;
      return new Response(null, { status: 204 });
    }
    return new Response("unsupported", { status: 405 });
  };
}
