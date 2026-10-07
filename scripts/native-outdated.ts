import manifest from "../native/sqlite/manifest.json" with { type: "json" };

const page = process.env["SQLITE_DOWNLOAD_PAGE_URL"] ?? "https://www.sqlite.org/download.html";
const response = await fetch(page);
if (!response.ok) throw new Error("SQLite release metadata unavailable");
const html = await response.text();
const product = /^PRODUCT,([^,]+),([^,\n]*sqlite-amalgamation-\d+\.zip),\d+,([a-f0-9]{64})/mu.exec(
  html,
);
if (!product) throw new Error("SQLite release metadata missing amalgamation");
const latest = product[1]!;
const release = await fetch(new URL(`releaselog/${latest.replaceAll(".", "_")}.html`, page));
if (!release.ok) throw new Error("SQLite release date unavailable");
const date = /SQLite Release [\d.]+ On (\d{4}-\d{2}-\d{2})/u.exec(await release.text())?.[1];
if (!date) throw new Error("SQLite release date missing");
const age = Date.now() - Date.parse(date);
if (!Number.isFinite(age) || !Number.isFinite(Date.parse(manifest.released)))
  throw new Error("Invalid SQLite release date");
if (Date.now() - Date.parse(manifest.released) < 3 * 86400000)
  throw new Error("Pinned SQLite release is younger than three days");
if (latest === manifest.version && product[3] !== manifest.source.sha3)
  throw new Error("Pinned SQLite source checksum differs from upstream");
if (latest !== manifest.version && age > 7 * 86400000)
  throw new Error(
    `Native SQLite ${manifest.version} is stale; newest eligible release is ${latest}`,
  );
process.stdout.write(
  "Native SQLite release is fresh (three-day install age, seven-day update grace).\n",
);
