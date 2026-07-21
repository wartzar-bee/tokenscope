// tokenscope scan — static token-cost estimate of a source directory.
//
// Unlike the session analyzer (which reads real ~/.claude usage), `scan` estimates the
// token footprint of the *code itself* — the prompts, tool defs, and context a codebase
// will feed an agent. It's what the CI cost-guardrail compares across a PR's HEAD vs BASE.
//
// Estimate, not a meter: token counts are approximated at ~CHARS_PER_TOKEN characters per
// token (the standard rough heuristic for English/code). It's a consistent, tokenizer-free
// proxy — good for *relative* deltas (did this PR grow?), not an exact billing figure.
// Labeled `"estimate": true` in JSON so no consumer mistakes it for a measured cost.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep, extname } from "node:path";

export const CHARS_PER_TOKEN = 4;

// Directories that are never "your agent code" — vendored, build output, VCS, caches.
const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out", "coverage", ".next", ".nuxt",
  "vendor", ".venv", "venv", "__pycache__", ".cache", ".turbo", ".svelte-kit",
]);

// Text/code/prompt extensions we count. Anything else (binaries, images, archives) is
// skipped so a stray .png or model weight can't dominate the estimate.
const TEXT_EXT = new Set([
  ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".py", ".rb", ".go", ".rs",
  ".java", ".kt", ".c", ".h", ".cpp", ".cc", ".hpp", ".cs", ".php", ".swift",
  ".scala", ".sh", ".bash", ".zsh", ".pl", ".lua", ".r", ".jl", ".dart",
  ".md", ".mdx", ".markdown", ".txt", ".rst", ".prompt", ".tpl", ".hbs", ".ejs",
  ".json", ".jsonl", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".env", ".xml",
  ".html", ".css", ".scss", ".sql", ".graphql", ".proto", ".sol",
]);

// Lockfiles are generated noise that swamps the signal — skip by basename.
const SKIP_FILES = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock",
  "Cargo.lock", "composer.lock", "Gemfile.lock", "go.sum",
]);

const MAX_FILE_BYTES = 1_000_000; // skip anything >1MB as data/blob, not agent code

export function estimateTokens(text) {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function walk(dir, root, out) {
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || e.name.startsWith(".")) continue; // skip hidden + vendored dirs
      walk(p, root, out);
    } else if (e.isFile()) {
      if (SKIP_FILES.has(e.name)) continue;
      if (!TEXT_EXT.has(extname(e.name).toLowerCase())) continue;
      let st;
      try { st = statSync(p); } catch { continue; }
      if (st.size > MAX_FILE_BYTES) continue;
      let text;
      try { text = readFileSync(p, "utf8"); } catch { continue; }
      out.push({ path: relative(root, p).split(sep).join("/"), tokens: estimateTokens(text) });
    }
  }
  return out;
}

// Scan a directory and return the guardrail's expected contract:
//   { total_tokens, files: [{ path, tokens }], estimate: true, chars_per_token }
export function scanDir(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new Error("Not a directory: " + dir);
  }
  const files = walk(dir, dir, []);
  files.sort((a, b) => b.tokens - a.tokens);
  const total_tokens = files.reduce((s, f) => s + f.tokens, 0);
  return { total_tokens, files, estimate: true, chars_per_token: CHARS_PER_TOKEN };
}

// Human-readable report (used when `scan` runs without --json).
export function renderScan(result, dir) {
  const { total_tokens, files } = result;
  const lines = [];
  lines.push(`tokenscope scan — ${dir}`);
  lines.push(`Estimated token footprint: ${total_tokens.toLocaleString()} tokens across ${files.length} files`);
  lines.push(`(estimate ≈ ${CHARS_PER_TOKEN} chars/token — a tokenizer-free proxy for relative comparison, not a billing figure)`);
  lines.push("");
  if (files.length) {
    lines.push("Top files by estimated tokens:");
    for (const f of files.slice(0, 15)) {
      lines.push(`  ${String(f.tokens).padStart(8)}  ${f.path}`);
    }
    if (files.length > 15) lines.push(`  … and ${files.length - 15} more`);
  } else {
    lines.push("No countable source files found.");
  }
  return lines.join("\n");
}
