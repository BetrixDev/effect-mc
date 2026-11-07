import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";
import { CachedPaperDownloader, resolvePaperBuild, type FetchLike } from "./paper";

const buildsResponse = {
  project_id: "paper",
  version: "1.21.8",
  builds: [
    { build: 10, downloads: { application: { name: "paper-1.21.8-10.jar" } } },
    { build: 12, downloads: { application: { name: "paper-1.21.8-12.jar" } } },
  ],
};

const urlOf = (input: string | URL | Request): string =>
  typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

const fakeFetch = () => {
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = urlOf(input);
    calls.push(url);
    if (url.endsWith("/builds")) {
      return new Response(JSON.stringify(buildsResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), { status: 200 });
  }) as typeof fetch;
  return { fetchImpl, calls };
};

test("picks the newest Paper build", async () => {
  const { fetchImpl, calls } = fakeFetch();

  await expect(resolvePaperBuild(fetchImpl, "1.21.8")).resolves.toEqual({
    version: "1.21.8",
    build: 12,
    url: "https://api.papermc.io/v2/projects/paper/versions/1.21.8/builds/12/downloads/paper-1.21.8-12.jar",
  });
  expect(calls).toEqual(["https://api.papermc.io/v2/projects/paper/versions/1.21.8/builds"]);
});

test("downloads once and reuses the cached jar", async () => {
  const { fetchImpl, calls } = fakeFetch();
  const cache = await mkdtemp(join(tmpdir(), "effectmc-cache-"));
  const downloader = new CachedPaperDownloader(fetchImpl);

  const first = await downloader.ensure("1.21.8", cache);
  const second = await downloader.ensure("1.21.8", cache);

  expect(second).toBe(first);
  expect(await readFile(first)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  expect(calls).toEqual([
    "https://api.papermc.io/v2/projects/paper/versions/1.21.8/builds",
    "https://api.papermc.io/v2/projects/paper/versions/1.21.8/builds/12/downloads/paper-1.21.8-12.jar",
  ]);
});

test("rejects an invalid version without touching the network", async () => {
  const { fetchImpl, calls } = fakeFetch();

  await expect(resolvePaperBuild(fetchImpl, "../escape")).rejects.toThrow(/version/i);
  expect(calls).toEqual([]);
});

test("a first-run download can be interrupted", async () => {
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    if (urlOf(input).endsWith("/builds")) {
      return new Response(JSON.stringify(buildsResponse), { status: 200 });
    }
    return new Promise<Response>((_resolve, reject) => {
      const abort = (): void =>
        reject(new DOMException("The operation was aborted.", "AbortError"));
      if (init?.signal?.aborted === true) {
        abort();
        return;
      }
      init?.signal?.addEventListener("abort", abort);
    });
  }) as FetchLike;
  const cache = await mkdtemp(join(tmpdir(), "effectmc-cache-"));
  const controller = new AbortController();
  const download = new CachedPaperDownloader(fetchImpl).ensure("1.21.8", cache, controller.signal);

  controller.abort();

  await expect(download).rejects.toThrow(/aborted/i);
});

test("reports an HTTP failure with the URL", async () => {
  const fetchImpl = (async () => new Response("nope", { status: 503 })) as typeof fetch;
  const cache = await mkdtemp(join(tmpdir(), "effectmc-cache-"));
  const downloader = new CachedPaperDownloader(fetchImpl);

  await expect(downloader.ensure("1.21.8", cache)).rejects.toThrow(/503/);
});
