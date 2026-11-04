#!/usr/bin/env node
// HTTPS server for the phone pass. getUserMedia needs a secure context; localhost is secure,
// a LAN address is not, so a phone needs HTTPS (and must trust the certificate).
//
//   node experiments/acoustic-lab/serve.mjs
//   node experiments/acoustic-lab/serve.mjs --port 8443
//
// The certificate lives outside the repo (default ~/.cache/lopda-acoustic-lab) and is made with
// the openssl already on macOS. No dependency.

import { createServer } from "node:https";
import { createServer as createHttpServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join, resolve, extname, normalize } from "node:path";
import { networkInterfaces, homedir } from "node:os";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const ROOT = resolve(import.meta.dirname, "../..");
const PORT = parseInt(arg("--port", "8443"), 10);
const CERT_DIR = process.env.LAB_CERT_DIR || join(homedir(), ".cache", "lopda-acoustic-lab");
const KEY = join(CERT_DIR, "key.pem");
const CERT = join(CERT_DIR, "cert.pem");
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".md": "text/markdown; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".wav": "audio/wav", ".pem": "application/x-pem-file"
};

function lanAddress() {
  const nets = networkInterfaces();
  const preferred = ["en0", "en1", "eth0", "wlan0"];
  const all = [];
  for (const name of Object.keys(nets)) {
    for (const n of nets[name] || []) {
      if (n.family === "IPv4" && !n.internal) all.push({ name, address: n.address });
    }
  }
  for (const name of preferred) {
    const hit = all.find((x) => x.name === name);
    if (hit) return hit.address;
  }
  return all[0] ? all[0].address : null;
}

function makeCert() {
  if (existsSync(KEY) && existsSync(CERT)) return;
  mkdirSync(CERT_DIR, { recursive: true });
  const lan = lanAddress();
  const san = ["DNS:localhost", "IP:127.0.0.1", "IP:::1"];
  if (lan) san.push("IP:" + lan);
  const r = spawnSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-sha256", "-nodes", "-days", "365",
    "-keyout", KEY, "-out", CERT,
    "-subj", "/CN=Lo-PDA Acoustic Lab",
    "-addext", "subjectAltName=" + san.join(","),
    "-addext", "basicConstraints=critical,CA:TRUE",
    "-addext", "keyUsage=critical,keyCertSign,digitalSignature,keyEncipherment",
    "-addext", "extendedKeyUsage=serverAuth"
  ], { stdio: "ignore" });
  if (r.status !== 0) {
    console.error("\nopenssl could not make the certificate. Install it manually, or use a PR preview over HTTPS.\n");
    process.exit(1);
  }
}

function handler(req, res) {
  const pathname = decodeURIComponent(new URL(req.url, "https://x").pathname);
  if (pathname === "/cert.pem") {
    res.writeHead(200, { "content-type": "application/x-pem-file", "content-disposition": "attachment; filename=lopda-acoustic-lab.pem" });
    res.end(readFileSync(CERT));
    return;
  }
  let file = normalize(join(ROOT, pathname));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end("no"); return; }
  if (pathname.endsWith("/")) file = join(file, "index.html");
  if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end("not found"); return; }
  res.writeHead(200, {
    "content-type": TYPES[extname(file)] || "application/octet-stream",
    "cache-control": "no-store"
  });
  res.end(readFileSync(file));
}

makeCert();

const server = createServer({ key: readFileSync(KEY), cert: readFileSync(CERT) }, handler);
server.listen(PORT, "0.0.0.0", () => {
  const lan = lanAddress();
  console.log("Lo-PDA Acoustic Lab — HTTPS");
  console.log("  this computer: https://localhost:" + PORT + "/experiments/acoustic-lab/");
  if (lan) console.log("  phone:         https://" + lan + ":" + PORT + "/experiments/acoustic-lab/");
  console.log("  certificate:   " + CERT);
  console.log("                 (phone: install the profile from /cert.pem, then trust it in");
  console.log("                  Settings → General → About → Certificate Trust Settings)");
  console.log("  stop: Ctrl-C\n");
  if (lan) {
    /* A phone that opens http://<lan>:8080 would have no secure context; a tiny redirect helps. */
    const httpPort = PORT - 1;
    const redirect = createHttpServer((req, res) => {
      if (req.url === "/cert.pem") {
        res.writeHead(200, { "content-type": "application/x-pem-file", "content-disposition": "attachment; filename=lopda-acoustic-lab.pem" });
        res.end(readFileSync(CERT));
        return;
      }
      res.writeHead(302, { location: "https://" + lan + ":" + PORT + req.url });
      res.end();
    });
    redirect.listen(httpPort, "0.0.0.0", () => {
      console.log("  certificate download (plain HTTP, no warning):");
      console.log("                 http://" + lan + ":" + httpPort + "/cert.pem");
    });
    redirect.on("error", () => {});
  }
});
server.on("error", (e) => {
  console.error("Cannot start HTTPS server:", e.message);
  process.exit(1);
});
