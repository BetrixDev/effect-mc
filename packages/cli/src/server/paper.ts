import { existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Logger } from "../log";

/** The Paper version a managed server downloads when none is configured. */
export const DEFAULT_PAPER_VERSION = "1.21.8";

const VERSION = /^\d+\.\d+(?:\.\d+)?$/;
const DOWNLOAD_NAME = /^[A-Za-z0-9._-]+$/;

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface PaperBuild {
  readonly version: string;
  readonly build: number;
  readonly url: string;
}

/** Ensures the Paper server jar is available and returns its path. */
export interface PaperDownloader {
  ensure(version: string, cacheDirectory: string, signal?: AbortSignal): Promise<string>;
}

/** Resolves the newest Paper build for a version through the Paper API. */
export async function resolvePaperBuild(
  fetchImpl: FetchLike,
  version: string,
  signal?: AbortSignal,
): Promise<PaperBuild> {
  if (!VERSION.test(version)) {
    throw new Error(`Invalid Paper version '${version}'. Use a version like 1.21.8.`);
  }

  const endpoint = `https://api.papermc.io/v2/projects/paper/versions/${version}/builds`;
  const response = await fetchImpl(endpoint, { signal });
  if (!response.ok) {
    throw new Error(`Could not list Paper builds from ${endpoint}: HTTP ${response.status}.`);
  }

  const body = (await response.json()) as {
    builds?: Array<{
      build?: unknown;
      downloads?: { application?: { name?: unknown } };
    }>;
  };

  const builds = Array.isArray(body.builds) ? body.builds : [];
  let latest: { build: number; name: string } | undefined;
  for (const candidate of builds) {
    const build = typeof candidate.build === "number" ? candidate.build : Number(candidate.build);
    const name = candidate.downloads?.application?.name;
    if (!Number.isInteger(build) || typeof name !== "string" || !DOWNLOAD_NAME.test(name)) {
      continue;
    }
    if (latest === undefined || build > latest.build) {
      latest = { build, name };
    }
  }

  if (latest === undefined) {
    throw new Error(`Paper has no downloadable builds for version ${version}.`);
  }

  return {
    version,
    build: latest.build,
    url: `https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${latest.build}/downloads/${latest.name}`,
  };
}

/** Downloads Paper once into the user cache and reuses it on later runs. */
export class CachedPaperDownloader implements PaperDownloader {
  constructor(
    private readonly fetchImpl: FetchLike = fetch,
    private readonly log: Logger = () => {},
  ) {}

  async ensure(version: string, cacheDirectory: string, signal?: AbortSignal): Promise<string> {
    const path = join(cacheDirectory, "paper", version, "paper.jar");
    if (existsSync(path) && statSync(path).size > 0) {
      return path;
    }

    const build = await resolvePaperBuild(this.fetchImpl, version, signal);
    this.log(`Downloading Paper ${version} build ${build.build}...`);

    const response = await this.fetchImpl(build.url, { signal });
    if (!response.ok) {
      throw new Error(
        `Could not download Paper from ${build.url}: HTTP ${response.status} ${response.statusText}.`,
      );
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    mkdirSync(dirname(path), { recursive: true });
    const temporary = `${path}.tmp`;
    try {
      writeFileSync(temporary, bytes);
      renameSync(temporary, path);
    } catch (error) {
      rmSync(temporary, { force: true });
      throw error;
    }
    return path;
  }
}

/** The platform cache directory for downloaded Paper builds. */
export function defaultCacheDirectory(env: NodeJS.ProcessEnv = process.env): string {
  if (
    process.platform === "win32" &&
    env.LOCALAPPDATA !== undefined &&
    env.LOCALAPPDATA.length > 0
  ) {
    return join(env.LOCALAPPDATA, "effectmc", "cache");
  }
  if (env.XDG_CACHE_HOME !== undefined && env.XDG_CACHE_HOME.length > 0) {
    return join(env.XDG_CACHE_HOME, "effectmc");
  }
  return join(env.HOME ?? env.USERPROFILE ?? process.cwd(), ".cache", "effectmc");
}
