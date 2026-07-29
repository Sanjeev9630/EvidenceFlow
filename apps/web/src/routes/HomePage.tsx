import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../api/client";

type ImportSummary = {
  id: string;
  status: string;
};

/** Placeholder URLs — replace with real repo / Notion doc later. */
const GITHUB_URL = "https://github.com/Sanjeev9630/EvidenceFlow";
const NOTION_URL = "https://app.notion.com/p/EvidenceFlow-3acf181e320080c7ab12cdb6d4034eb5?source=copy_link";

export function HomePage() {
  const imports = useQuery({
    queryKey: ["imports"],
    queryFn: () => apiGet<ImportSummary[]>("/imports"),
    retry: 1,
  });

  const demoImport = imports.data?.find((item) => item.status === "calculated");

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center space-y-5 text-center">
        <h1 className="font-display text-5xl font-semibold leading-[1.15] text-ink-950 sm:text-6xl">
          Turn messy ESG evidence into trusted activity data.
        </h1>
        <p className="max-w-2xl text-lg text-ink-800/80 sm:text-xl">
          Upload a utility CSV or invoice. We hash the source file, extract or map activity fields,
          match emission factors deterministically, score confidence, and export an audit pack with
          full lineage.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <Link
            to="/imports/new"
            className="rounded-md bg-moss-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-moss-500"
          >
            Upload evidence
          </Link>
          <Link
            to="/imports"
            className="rounded-md border border-ink-900/15 bg-white/60 px-4 py-2.5 text-sm font-semibold text-ink-900 hover:bg-white"
          >
            View import history
          </Link>
          {demoImport && (
            <Link
              to={`/imports/${demoImport.id}`}
              className="rounded-md border border-moss-600/25 bg-moss-600/5 px-4 py-2.5 text-sm font-semibold text-moss-700 hover:bg-moss-600/10"
            >
              Open demo batch →
            </Link>
          )}
        </div>
      </section>

      <div className="flex shrink-0 justify-end pb-1 pr-[10%] sm:pr-[14%] md:pr-[18%]">
        <div className="flex items-center gap-5 text-ink-900/75">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View source on GitHub"
            className="inline-flex h-8 w-8 items-center justify-center transition-colors hover:text-ink-950"
          >
            <i className="fa-brands fa-github text-[1.75rem] leading-none" aria-hidden />
          </a>
          <a
            href={NOTION_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open Notion documentation"
            className="inline-flex h-8 w-8 items-center justify-center transition-colors hover:text-ink-950"
          >
            {/* Inline SVG — FA Notion brand glyph is often missing from CDN kits */}
            <svg
              viewBox="0 0 24 24"
              width="28"
              height="28"
              aria-hidden
              fill="currentColor"
            >
              <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L18.387 2.62c-.42-.326-.98-.7-2.054-.607L3.01 3.112c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.98-.56.98-1.167V7.288c0-.606-.233-.933-.746-.886l-15.177.886c-.56.047-.794.327-.794.886zm14.337.653c.093.42 0 .793-.42.84l-.7.14v10.264c-.607.327-1.168.514-1.635.514-.747 0-.933-.234-1.494-.933l-4.577-7.186v6.953l1.448.327s0 .793-1.12.793l-3.08.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.514.28-.886.747-.933zM2.8 2.02 16.94.887c1.635-.14 2.054.047 2.754.607l3.78 2.66c.466.373.607.56.607 1.04v15.45c0 .84-.327 1.354-1.494 1.447l-15.55.933c-.887.047-1.307-.093-1.774-.747L1.026 17.82C.513 17.027.28 16.48.28 15.78V3.6c0-.747.327-1.26 1.214-1.354z" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}
