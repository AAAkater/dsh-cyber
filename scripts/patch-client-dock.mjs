/**
 * Refresh the embedded RedTeam console in an already dock-enabled client.js.
 *
 * The historical one-time dock bootstrap is retired. Current dock, environment
 * readiness, launcher, and rewind code is maintained directly in client.js, so
 * this script must never reconstruct or replace those sections. It only embeds
 * lib/redteam/client.js between the existing drill markers.
 *
 * Usage:
 *   node scripts/patch-client-dock.mjs
 *   node scripts/patch-client-dock.mjs --check [client.js]
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const clientArg = args.find((arg) => arg !== "--check");
const clientPath = resolve(clientArg || join(root, "client.js"));
const buildScript = join(root, "scripts", "build-client.mjs");
const begin = "/* __DSH_PURGE_DRILL_BEGIN__ */";
const end = "/* __DSH_PURGE_DRILL_END__ */";

const source = readFileSync(clientPath, "utf8");
const beginAt = source.indexOf(begin);
const endAt = source.indexOf(end);
if (beginAt < 0 || endAt < beginAt || source.indexOf(begin, beginAt + begin.length) >= 0 || source.indexOf(end, endAt + end.length) >= 0) {
	throw new Error("client.js must contain exactly one ordered pair of drill markers");
}

const required = [
	"function PurgeDock()",
	"function PurgeLauncher()",
	"function HeroNewSessionMount()",
	"function TabRowPurgeMount()",
	"function EnvAdaptSendGate()",
	"function requestDrill(kind)",
	"function requestDrillEnv()",
	"function openDrillFull()",
	'id: "dsh-purge-dock"',
	"h(EnvAdaptSendGate)",
];
for (const marker of required) {
	if (!source.includes(marker)) {
		throw new Error("client.js is missing current dock/env code: " + marker);
	}
}
const forbidden = [
	"WelcomeNotice",
	"AuthGate",
	"AUTH_KEY",
	"WELCOME_KEY",
	"readDrillAuth",
	"writeDrillAuth",
	"syncDrillGrant",
	"drill-grant",
	"authOpen",
];
for (const marker of forbidden) {
	if (source.includes(marker)) {
		throw new Error("client.js still contains removed drill dialog state: " + marker);
	}
}

console.log(checkOnly ? "dock client structure OK: " + clientPath : "refreshing embedded drill client in " + clientPath);
if (checkOnly) process.exit(0);

const built = spawnSync(process.execPath, [buildScript], {
	cwd: root,
	encoding: "utf8",
});
process.stdout.write(built.stdout || "");
process.stderr.write(built.stderr || "");
if (built.status !== 0) process.exit(built.status || 1);
console.log("done");
