#!/usr/bin/env bash
# Build and (optionally) run the `modal secret create hoops-hype-studio --force`
# command using values from .env.
#
# Usage:
#   ./setup-modal-secret.sh                    # dry-run, prints the command
#   ./setup-modal-secret.sh --run              # creates/updates the secret
#   ./setup-modal-secret.sh --token <hex>      # use a specific token
#   ./setup-modal-secret.sh --env-file <path>  # alternate .env location
#
# After running with --run:
#   modal deploy workers/modal/modal_app.py
#   then set GPU_WORKER_BASE_URL + GPU_WORKER_TOKEN in the Netlify dashboard.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GRAY='\033[0;37m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
TOKEN=""
RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --token) TOKEN="$2"; shift 2 ;;
    --env-file) ENV_FILE="$2"; shift 2 ;;
    --run) RUN=1; shift ;;
    -h|--help)
      sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

echo -e "${CYAN}================================================${NC}"
echo -e "${CYAN}Hoops Hype Studio - Modal Secret Setup${NC}"
echo -e "${CYAN}================================================${NC}"
echo ""

if [[ ! -f "$ENV_FILE" ]]; then
  echo -e "${RED}.env not found at $ENV_FILE. Pass --env-file to override.${NC}" >&2
  exit 1
fi

# Read a single key out of .env, stripping surrounding quotes and whitespace.
read_env() {
  local key="$1"
  local line
  line=$(grep -E "^[[:space:]]*${key}=" "$ENV_FILE" | head -n 1 || true)
  if [[ -z "$line" ]]; then
    echo ""
    return
  fi
  local val="${line#*=}"
  # trim leading/trailing whitespace
  val="${val#"${val%%[![:space:]]*}"}"
  val="${val%"${val##*[![:space:]]}"}"
  # strip matching surrounding quotes
  if [[ ( "${val:0:1}" == '"' && "${val: -1}" == '"' ) || ( "${val:0:1}" == "'" && "${val: -1}" == "'" ) ]]; then
    val="${val:1:${#val}-2}"
  fi
  echo "$val"
}

generate_token() {
  if command -v openssl &>/dev/null; then
    openssl rand -hex 32
  else
    # /dev/urandom fallback (POSIX)
    od -An -N32 -tx1 /dev/urandom | tr -d ' \n'
  fi
}

# Resolve GPU_WORKER_TOKEN: --token > .env > generate
if [[ -n "$TOKEN" ]]; then
  RESOLVED_TOKEN="$TOKEN"
  echo -e "${GREEN}Using GPU_WORKER_TOKEN from --token flag.${NC}"
else
  ENV_TOKEN="$(read_env GPU_WORKER_TOKEN)"
  if [[ -n "$ENV_TOKEN" ]]; then
    RESOLVED_TOKEN="$ENV_TOKEN"
    echo -e "${GREEN}Using GPU_WORKER_TOKEN from .env.${NC}"
  else
    RESOLVED_TOKEN="$(generate_token)"
    echo -e "${YELLOW}Generated fresh GPU_WORKER_TOKEN (.env did not have one).${NC}"
  fi
fi

# Required keys from .env (everything except GPU_WORKER_TOKEN, which we resolved above).
declare -A vals
missing=()
for key in STORAGE_BUCKET STORAGE_REGION STORAGE_ACCESS_KEY STORAGE_SECRET_KEY STORAGE_ENDPOINT OPENAI_API_KEY; do
  v="$(read_env "$key")"
  if [[ -z "$v" ]]; then
    missing+=("$key")
  else
    vals["$key"]="$v"
  fi
done

if (( ${#missing[@]} > 0 )); then
  echo -e "${RED}ERROR: .env is missing required keys: ${missing[*]}${NC}" >&2
  echo -e "${RED}Fill them in $ENV_FILE and re-run.${NC}" >&2
  exit 1
fi

ARGS=(
  secret create hoops-hype-studio --force
  "GPU_WORKER_TOKEN=$RESOLVED_TOKEN"
  "STORAGE_BUCKET=${vals[STORAGE_BUCKET]}"
  "STORAGE_REGION=${vals[STORAGE_REGION]}"
  "STORAGE_ACCESS_KEY=${vals[STORAGE_ACCESS_KEY]}"
  "STORAGE_SECRET_KEY=${vals[STORAGE_SECRET_KEY]}"
  "STORAGE_ENDPOINT=${vals[STORAGE_ENDPOINT]}"
  "OPENAI_API_KEY=${vals[OPENAI_API_KEY]}"
)

# Build a redacted preview (token replaced) for printing.
PREVIEW="modal"
for a in "${ARGS[@]}"; do
  if [[ "$a" == "GPU_WORKER_TOKEN=$RESOLVED_TOKEN" ]]; then
    PREVIEW+=" GPU_WORKER_TOKEN=<token>"
  else
    PREVIEW+=" $a"
  fi
done

echo ""
echo -e "${CYAN}Command:${NC}"
echo -e "${GRAY}  $PREVIEW${NC}"
echo ""
echo -e "${CYAN}GPU_WORKER_TOKEN to copy into Netlify:${NC}"
echo -e "  ${YELLOW}$RESOLVED_TOKEN${NC}"
echo ""

if (( RUN == 0 )); then
  echo -e "${YELLOW}Dry run only. Re-run with --run to actually create the secret.${NC}"
  exit 0
fi

echo -e "${CYAN}Running modal secret create --force ...${NC}"
modal "${ARGS[@]}"

echo ""
echo -e "${GREEN}Secret created/updated.${NC}"
echo ""
echo -e "${CYAN}Next steps:${NC}"
echo "  1. Redeploy the worker so it picks up the new secret values:"
echo "       modal deploy workers/modal/modal_app.py"
echo "  2. In the Netlify dashboard set:"
echo "       GPU_WORKER_BASE_URL = (URL printed by modal deploy)"
echo "       GPU_WORKER_TOKEN    = $RESOLVED_TOKEN"
echo "  3. Trigger a Netlify redeploy so functions reload the env."
echo "  4. Smoke test:"
echo "       curl -X POST \"\$GPU_WORKER_BASE_URL/highlights\" \\"
echo "         -H \"authorization: Bearer \$GPU_WORKER_TOKEN\" \\"
echo "         -H \"content-type: application/json\" \\"
echo "         -d '{\"assetId\":\"smoke\",\"proxyUrl\":\"https://example.com/x.mp4\"}'"
