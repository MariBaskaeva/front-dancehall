#!/usr/bin/env bash
set -euo pipefail

revision=${1:-development}
port=${SMOKE_PORT:-4173}
log_file=$(mktemp)

cleanup() {
  local code=$?
  trap - EXIT HUP INT TERM
  if [[ -n ${preview_pid:-} ]]; then
    kill "$preview_pid" >/dev/null 2>&1 || true
    wait "$preview_pid" >/dev/null 2>&1 || true
  fi
  if (( code != 0 )); then
    cat "$log_file" >&2
  fi
  rm -f "$log_file"
  exit "$code"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

npm run preview -- --host 127.0.0.1 --port "$port" --strictPort >"$log_file" 2>&1 &
preview_pid=$!

node --input-type=module - "$revision" "$port" <<'NODE'
const [revision, port] = process.argv.slice(2)
const baseUrl = `http://127.0.0.1:${port}`

let response
for (let attempt = 0; attempt < 30; attempt += 1) {
  try {
    response = await fetch(`${baseUrl}/`, {
      signal: AbortSignal.timeout(2_000),
    })
    if (response.ok) {
      break
    }
  } catch {
    // Vite preview may still be starting.
  }
  await new Promise((resolve) => setTimeout(resolve, 1_000))
}

if (response === undefined || !response.ok) {
  throw new Error('Static frontend did not become available')
}

const contentType = response.headers.get('content-type') ?? ''
if (!contentType.toLowerCase().startsWith('text/html')) {
  throw new Error(`Unexpected HTML content type: ${contentType}`)
}

const html = await response.text()
const marker = `name="dancehall-revision" content="${revision}"`
if (!html.includes(marker)) {
  throw new Error(`Revision marker was not found: ${revision}`)
}

const assetPath = html.match(/\/assets\/[^" ]+\.js/)?.[0]
if (assetPath === undefined) {
  throw new Error('JavaScript asset was not found in index.html')
}

const assetResponse = await fetch(`${baseUrl}${assetPath}`, {
  signal: AbortSignal.timeout(2_000),
})
if (!assetResponse.ok) {
  throw new Error(`JavaScript asset returned ${assetResponse.status}`)
}

const detailResponse = await fetch(`${baseUrl}/steps/example`, {
  signal: AbortSignal.timeout(2_000),
})
if (!detailResponse.ok) {
  throw new Error(`Direct step route returned ${detailResponse.status}`)
}
const detailHtml = await detailResponse.text()
if (!detailHtml.includes(marker)) {
  throw new Error('Direct step route did not return the SPA shell')
}

console.log(`Static frontend smoke test passed for revision ${revision}`)
NODE
