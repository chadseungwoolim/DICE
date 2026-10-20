// Build the static bundle for the Capacitor app into ./out
//   NEXT_PUBLIC_WEB_URL   public https URL of the deployed website (share links, model weights)
//   NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY   (also read from .env.local by Next)
// The dynamic route app/v/[id] cannot be exported, so it is moved aside for the duration of the build;
// the app uses the query-string route app/v/page.tsx instead.
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, readFileSync } from "node:fs";

const dyn = "app/v/[id]";
const aside = ".app-build-aside/v-id";

function envFile() {
  try {
    return Object.fromEntries(
      readFileSync(".env.local", "utf8").split("\n").map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")])
    );
  } catch {
    return {};
  }
}
const fe = envFile();
const webUrl = process.env.NEXT_PUBLIC_WEB_URL || fe.NEXT_PUBLIC_WEB_URL || "";
if (!webUrl) console.warn("WARNING: NEXT_PUBLIC_WEB_URL is not set. Share links created inside the app will have no domain.");

let moved = false;
try {
  if (existsSync(dyn)) {
    mkdirSync(".app-build-aside", { recursive: true });
    rmSync(aside, { recursive: true, force: true });
    renameSync(dyn, aside);
    moved = true;
  }
  rmSync(".next", { recursive: true, force: true });
  rmSync("out", { recursive: true, force: true });
  execSync("npx next build", {
    stdio: "inherit",
    env: { ...process.env, APP_BUILD: "1", NEXT_PUBLIC_APP_BUILD: "1", NEXT_PUBLIC_WEB_URL: webUrl },
  });
  // model weights are fetched from the website, not bundled (keeps the APK small)
  rmSync("out/models", { recursive: true, force: true });
  // never ship local, git-ignored files from public/ (e.g. public/sem) inside the app
  for (const e of readdirSync("public")) {
    let ignored = e === "sem";
    try {
      execSync(`git check-ignore -q "public/${e}"`, { stdio: "ignore" });
      ignored = true;
    } catch {}
    if (ignored) {
      rmSync(`out/${e}`, { recursive: true, force: true });
      console.log(`excluded from app bundle: public/${e}`);
    }
  }
} finally {
  if (moved) {
    renameSync(aside, dyn);
    rmSync(".app-build-aside", { recursive: true, force: true });
  }
}
console.log("static app bundle ready in ./out");
