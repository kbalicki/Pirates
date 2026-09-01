#!/usr/bin/env node
/**
 * comfy.mjs — headless CLI for the local ComfyUI instance.
 *
 * Zero dependencies: uses Node's built-in fetch (Node 18+).
 * Designed to be driven by an agent, so every command prints machine-readable
 * lines and exits non-zero on failure.
 *
 *   node sd-pipeline/tools/comfy.mjs status
 *   node sd-pipeline/tools/comfy.mjs models
 *   node sd-pipeline/tools/comfy.mjs workflows
 *   node sd-pipeline/tools/comfy.mjs gen --workflow icon_64x64 --prompt "treasure chest" --out temp/gen
 *
 * gen options:
 *   --workflow <name|path>   workflow template (name resolves in sd-pipeline/workflows/)
 *   --prompt <text>          replaces {prompt} in the template
 *   --out <dir>              output directory (created if missing)
 *   --name <prefix>          output filename prefix (default: workflow name)
 *   --seed <n>               fixed seed; omit for random (printed, so you can reproduce)
 *   --steps <n> --cfg <n>    sampler overrides
 *   --width <n> --height <n> latent size overrides
 *   --batch <n>              images per prompt
 *   --negative <text>        replaces the negative prompt entirely
 *   --lora <name>            LoRA filename; requires a LoraLoader node in the template
 *   --lora-strength <n>      default 0.8
 *   --set <node>.<input>=<v> raw override, repeatable (e.g. --set 5.sampler_name=dpmpp_2m)
 *   --timeout <s>            per-image wait, default 300
 */

import { writeFile, mkdir, readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PIPELINE_ROOT = path.resolve(HERE, "..");
const WORKFLOW_DIR = path.join(PIPELINE_ROOT, "workflows");
const COMFY_URL = process.env.COMFY_URL || "http://127.0.0.1:8188";

// ─────────────────────────────────────────── arg parsing

function parseArgs(argv) {
  const cmd = argv[0];
  const opts = { _sets: [] };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    if (key === "set") {
      opts._sets.push(argv[++i]);
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) opts[key] = true;
    else {
      opts[key] = next;
      i++;
    }
  }
  return { cmd, opts };
}

function fail(msg) {
  console.error(`[ERROR] ${msg}`);
  process.exit(1);
}

// ─────────────────────────────────────────── comfy api

async function api(pathname, init) {
  let res;
  try {
    res = await fetch(`${COMFY_URL}${pathname}`, init);
  } catch (e) {
    fail(
      `ComfyUI unreachable at ${COMFY_URL} (${e.message}).\n` +
        `        Start it with: node sd-pipeline/tools/comfy.mjs start  (or C:\\AI\\start_comfyui.bat)`,
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    fail(`${pathname} -> HTTP ${res.status}\n${body.slice(0, 2000)}`);
  }
  return res;
}

async function systemStats() {
  const res = await api("/system_stats");
  return res.json();
}

async function objectInfo(nodeClass) {
  const res = await api(`/object_info/${nodeClass}`);
  return res.json();
}

// ─────────────────────────────────────────── workflow helpers

function findNodes(graph, classType) {
  return Object.entries(graph)
    .filter(([, n]) => n.class_type === classType)
    .map(([id, n]) => ({ id, node: n }));
}

/**
 * The positive prompt is the CLIPTextEncode that the KSampler consumes on its
 * `positive` input; the other one is negative. Templates here also mark the
 * positive by carrying the literal {prompt} placeholder, which we prefer.
 */
function classifyTextNodes(graph) {
  const encoders = findNodes(graph, "CLIPTextEncode");
  const sampler = findNodes(graph, "KSampler")[0];
  let positiveId = null;
  let negativeId = null;

  if (sampler) {
    const pos = sampler.node.inputs?.positive;
    const neg = sampler.node.inputs?.negative;
    if (Array.isArray(pos)) positiveId = pos[0];
    if (Array.isArray(neg)) negativeId = neg[0];
  }
  // Fall back to the placeholder convention.
  if (!positiveId) {
    const withPlaceholder = encoders.find(({ node }) =>
      String(node.inputs?.text ?? "").includes("{prompt}"),
    );
    positiveId = withPlaceholder?.id ?? null;
  }
  if (!negativeId) {
    negativeId = encoders.find(({ id }) => id !== positiveId)?.id ?? null;
  }
  return { positiveId, negativeId };
}

function applyOverrides(graph, opts) {
  const { positiveId, negativeId } = classifyTextNodes(graph);

  if (opts.prompt) {
    if (!positiveId) fail("template has no identifiable positive CLIPTextEncode node");
    const t = String(graph[positiveId].inputs.text ?? "");
    graph[positiveId].inputs.text = t.includes("{prompt}")
      ? t.replaceAll("{prompt}", opts.prompt)
      : opts.prompt;
  }
  if (opts.negative && negativeId) {
    graph[negativeId].inputs.text = String(opts.negative);
  }
  // Any residual placeholder would be sampled literally.
  for (const node of Object.values(graph)) {
    if (typeof node.inputs?.text === "string") {
      node.inputs.text = node.inputs.text.replaceAll("{prompt}", "");
    }
  }

  for (const { node } of findNodes(graph, "KSampler")) {
    node.inputs.seed = opts.seedValue;
    if (opts.steps) node.inputs.steps = Number(opts.steps);
    if (opts.cfg) node.inputs.cfg = Number(opts.cfg);
  }
  for (const { node } of findNodes(graph, "EmptyLatentImage")) {
    if (opts.width) node.inputs.width = Number(opts.width);
    if (opts.height) node.inputs.height = Number(opts.height);
    if (opts.batch) node.inputs.batch_size = Number(opts.batch);
  }
  if (opts.lora) {
    const loaders = findNodes(graph, "LoraLoader");
    if (loaders.length === 0) {
      fail(
        `--lora given but template has no LoraLoader node.\n` +
          `        Use a LoRA-aware template such as pirate_lora.json`,
      );
    }
    const strength = opts["lora-strength"] ? Number(opts["lora-strength"]) : 0.8;
    for (const { node } of loaders) {
      node.inputs.lora_name = String(opts.lora);
      node.inputs.strength_model = strength;
      node.inputs.strength_clip = strength;
    }
  }

  for (const raw of opts._sets) {
    const m = /^([^.]+)\.([^=]+)=(.*)$/.exec(raw ?? "");
    if (!m) fail(`--set expects <node>.<input>=<value>, got: ${raw}`);
    const [, nodeId, input, value] = m;
    if (!graph[nodeId]) fail(`--set: no node "${nodeId}" in template`);
    graph[nodeId].inputs[input] = /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value;
  }
  return graph;
}

// ─────────────────────────────────────────── generation

async function queuePrompt(graph, clientId) {
  const res = await api("/prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: graph, client_id: clientId }),
  });
  const data = await res.json();
  if (!data.prompt_id) fail(`queue rejected: ${JSON.stringify(data).slice(0, 1000)}`);
  return data.prompt_id;
}

async function waitForResult(promptId, timeoutSec) {
  const deadline = Date.now() + timeoutSec * 1000;
  let lastReport = 0;
  while (Date.now() < deadline) {
    const res = await api(`/history/${promptId}`);
    const hist = await res.json();
    const entry = hist[promptId];
    if (entry) {
      const status = entry.status?.status_str;
      if (status === "error") {
        const msgs = (entry.status?.messages ?? [])
          .map((m) => JSON.stringify(m))
          .join("\n");
        fail(`ComfyUI reported an execution error:\n${msgs.slice(0, 3000)}`);
      }
      if (entry.outputs && Object.keys(entry.outputs).length > 0) return entry;
    }
    const waited = Math.round((Date.now() - (deadline - timeoutSec * 1000)) / 1000);
    if (waited - lastReport >= 15) {
      console.log(`  ... still rendering (${waited}s)`);
      lastReport = waited;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  fail(`timed out after ${timeoutSec}s waiting for prompt ${promptId}`);
}

function collectImages(entry) {
  const images = [];
  for (const out of Object.values(entry.outputs ?? {})) {
    for (const img of out.images ?? []) images.push(img);
  }
  return images;
}

async function downloadImage(img, destPath) {
  const q = new URLSearchParams({
    filename: img.filename,
    subfolder: img.subfolder ?? "",
    type: img.type ?? "output",
  });
  const res = await api(`/view?${q}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(destPath, buf);
  return buf.length;
}

// ─────────────────────────────────────────── commands

async function cmdStatus() {
  const stats = await systemStats();
  const d = stats.devices?.[0] ?? {};
  console.log(`[OK] ComfyUI ${stats.system?.comfyui_version} at ${COMFY_URL}`);
  console.log(`     device: ${d.name}`);
  console.log(
    `     VRAM: ${(d.vram_free / 2 ** 30).toFixed(1)} GB free of ${(d.vram_total / 2 ** 30).toFixed(1)} GB`,
  );
  console.log(`     torch: ${stats.system?.pytorch_version}`);
}

async function cmdModels() {
  const info = await objectInfo("CheckpointLoaderSimple");
  const ckpts = info.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] ?? [];
  const loraInfo = await objectInfo("LoraLoader");
  const loras = loraInfo.LoraLoader?.input?.required?.lora_name?.[0] ?? [];
  console.log("checkpoints:");
  for (const c of ckpts) console.log(`  ${c}`);
  console.log("loras:");
  for (const l of loras) console.log(`  ${l}`);
}

async function cmdWorkflows() {
  const files = (await readdir(WORKFLOW_DIR)).filter((f) => f.endsWith(".json"));
  for (const f of files) {
    const g = JSON.parse(await readFile(path.join(WORKFLOW_DIR, f), "utf8"));
    const hasLora = findNodes(g, "LoraLoader").length > 0;
    const latent = findNodes(g, "EmptyLatentImage")[0]?.node.inputs ?? {};
    const scale = findNodes(g, "ImageScale")[0]?.node.inputs;
    const out = scale ? `${scale.width}x${scale.height}` : `${latent.width}x${latent.height}`;
    console.log(
      `  ${f.replace(/\.json$/, "").padEnd(18)} ${String(out).padEnd(10)} ${hasLora ? "LoRA" : "-"}`,
    );
  }
}

async function cmdGen(opts) {
  if (!opts.workflow) fail("--workflow is required");
  if (!opts.out) fail("--out is required");

  const wfPath = existsSync(opts.workflow)
    ? opts.workflow
    : path.join(WORKFLOW_DIR, `${opts.workflow}.json`);
  if (!existsSync(wfPath)) fail(`workflow not found: ${wfPath}`);

  const template = JSON.parse(await readFile(wfPath, "utf8"));
  opts.seedValue =
    opts.seed !== undefined && opts.seed !== true
      ? Number(opts.seed)
      : Math.floor(Math.random() * 2 ** 31);

  const graph = applyOverrides(structuredClone(template), opts);

  await mkdir(opts.out, { recursive: true });
  const prefix =
    (opts.name && opts.name !== true ? opts.name : path.basename(wfPath, ".json")) ?? "gen";

  console.log(`workflow: ${path.basename(wfPath)}`);
  console.log(`prompt:   ${opts.prompt ?? "(template default)"}`);
  console.log(`seed:     ${opts.seedValue}`);
  if (opts.lora) console.log(`lora:     ${opts.lora} @ ${opts["lora-strength"] ?? 0.8}`);

  const t0 = Date.now();
  const promptId = await queuePrompt(graph, `agent-${process.pid}`);
  const entry = await waitForResult(promptId, Number(opts.timeout ?? 300));
  const images = collectImages(entry);
  if (images.length === 0) fail("run completed but produced no images");

  const written = [];
  for (let i = 0; i < images.length; i++) {
    const suffix = images.length > 1 ? `_${String(i + 1).padStart(2, "0")}` : "";
    const dest = path.join(opts.out, `${prefix}_${opts.seedValue}${suffix}.png`);
    const bytes = await downloadImage(images[i], dest);
    written.push(dest);
    console.log(`[OK] ${dest} (${(bytes / 1024).toFixed(1)} KB)`);
  }

  const meta = {
    workflow: path.basename(wfPath),
    prompt: opts.prompt ?? null,
    negative: opts.negative ?? null,
    seed: opts.seedValue,
    lora: opts.lora ?? null,
    loraStrength: opts.lora ? Number(opts["lora-strength"] ?? 0.8) : null,
    steps: opts.steps ? Number(opts.steps) : null,
    cfg: opts.cfg ? Number(opts.cfg) : null,
    size:
      opts.width || opts.height
        ? { width: Number(opts.width ?? 0), height: Number(opts.height ?? 0) }
        : null,
    overrides: opts._sets,
    files: written.map((f) => path.basename(f)),
    generatedAt: new Date().toISOString(),
    elapsedSec: Number(((Date.now() - t0) / 1000).toFixed(1)),
  };
  const metaPath = path.join(opts.out, `${prefix}_${opts.seedValue}.json`);
  await writeFile(metaPath, JSON.stringify(meta, null, 2));
  console.log(`[OK] ${metaPath}`);
  console.log(`done in ${meta.elapsedSec}s — now OPEN the PNG and judge it before using it`);
}

// ─────────────────────────────────────────── main

const { cmd, opts } = parseArgs(process.argv.slice(2));
switch (cmd) {
  case "status":
    await cmdStatus();
    break;
  case "models":
    await cmdModels();
    break;
  case "workflows":
    await cmdWorkflows();
    break;
  case "gen":
    await cmdGen(opts);
    break;
  default:
    console.log(
      [
        "usage: node sd-pipeline/tools/comfy.mjs <command> [options]",
        "",
        "  status      check the ComfyUI server, device and VRAM",
        "  models      list available checkpoints and LoRAs",
        "  workflows   list workflow templates with size and LoRA support",
        "  gen         generate images (see header of this file for options)",
        "",
        `server: ${COMFY_URL}  (override with COMFY_URL)`,
      ].join("\n"),
    );
    process.exit(cmd ? 1 : 0);
}
