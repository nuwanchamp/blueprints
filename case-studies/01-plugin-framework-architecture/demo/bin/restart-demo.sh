#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT/var/run"
LOG_DIR="$ROOT/var/log"
API_PORT_WAS_SET="${API_PORT+x}"
HOST_PORT_WAS_SET="${HOST_PORT+x}"
API_PORT="${API_PORT:-8000}"
HOST_PORT="${HOST_PORT:-5173}"

mkdir -p "$RUN_DIR" "$LOG_DIR"
cd "$ROOT"

services=()

build_services() {
  services=(
    "api|$API_PORT|http://127.0.0.1:$API_PORT/api/extensions|API_PORT=$API_PORT composer run dev:api"
    "host|$HOST_PORT|http://127.0.0.1:$HOST_PORT/|API_PORT=$API_PORT npm run dev:host"
  )
}

plugin_remote_urls() {
  php -r '
    $database = new PDO("sqlite:var/data/plugins.sqlite");
    foreach ($database->query("SELECT remote_entry FROM plugins WHERE enabled = 1 ORDER BY name") as $plugin) {
        echo "http://127.0.0.1:" . getenv("API_PORT") . $plugin["remote_entry"] . PHP_EOL;
    }
  '
}

pids_for_port() {
  local port="$1"

  if command -v lsof >/dev/null 2>&1; then
    lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true
    return
  fi

  if command -v fuser >/dev/null 2>&1; then
    fuser "$port/tcp" 2>/dev/null || true
    return
  fi

  if command -v ss >/dev/null 2>&1; then
    ss -ltnp "sport = :$port" 2>/dev/null | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' || true
  fi
}

port_is_listening() {
  local port="$1"

  if command -v ss >/dev/null 2>&1; then
    ss -ltn "sport = :$port" 2>/dev/null | awk 'NR > 1 { found = 1 } END { exit found ? 0 : 1 }'
    return
  fi

  if command -v lsof >/dev/null 2>&1; then
    lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
  fi
}

stop_pids() {
  local pids="$1"

  if [[ -z "$pids" ]]; then
    return
  fi

  for pid in $pids; do
    kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
  done

  sleep 1

  for pid in $pids; do
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 -- "-$pid" 2>/dev/null || kill -9 "$pid" 2>/dev/null || true
    fi
  done
}

stop_service() {
  local name="$1"
  local port="$2"
  local pid_file="$RUN_DIR/$name.pid"
  local pids=""

  if [[ -f "$pid_file" ]]; then
    pids="$(cat "$pid_file" 2>/dev/null || true)"
  fi

  pids="$pids $(pids_for_port "$port")"
  stop_pids "$(printf '%s\n' $pids | awk 'NF && !seen[$1]++')"
  rm -f "$pid_file"
}

stop_all() {
  stop_known_demo_ports
  rm -f "$RUN_DIR"/*.port
}

stop_known_demo_ports() {
  for port in "$API_PORT" 8000 8010 8011 8012; do
    stop_service api "$port"
  done

  stop_service plugin-device-status 5174
  stop_service plugin-alert-triage 5175
  stop_service host "$HOST_PORT"
}

choose_api_port() {
  if ! port_is_listening "$API_PORT"; then
    return
  fi

  if [[ -n "$API_PORT_WAS_SET" ]]; then
    echo "API_PORT=$API_PORT is already in use." >&2
    exit 1
  fi

  for candidate in 8010 8011 8012 8013 8014; do
    if ! port_is_listening "$candidate"; then
      echo "Port 8000 is already in use; using API port $candidate."
      API_PORT="$candidate"
      return
    fi
  done

  echo "No free API port found. Set API_PORT and rerun." >&2
  exit 1
}

write_selected_ports() {
  echo "$API_PORT" > "$RUN_DIR/api.port"
  echo "$HOST_PORT" > "$RUN_DIR/host.port"
}

load_selected_ports() {
  if [[ -z "$API_PORT_WAS_SET" && -f "$RUN_DIR/api.port" ]]; then
    API_PORT="$(cat "$RUN_DIR/api.port")"
  fi

  if [[ -z "${HOST_PORT_WAS_SET:-}" && -f "$RUN_DIR/host.port" ]]; then
    HOST_PORT="$(cat "$RUN_DIR/host.port")"
  fi

}

start_service() {
  local name="$1"
  local command="$2"

  if command -v setsid >/dev/null 2>&1; then
    nohup setsid bash -lc "$command" > "$LOG_DIR/$name.log" 2>&1 &
  else
    nohup bash -lc "$command" > "$LOG_DIR/$name.log" 2>&1 &
  fi

  echo "$!" > "$RUN_DIR/$name.pid"
}

wait_for_url() {
  local name="$1"
  local url="$2"
  local log_file="$LOG_DIR/$name.log"

  for _ in $(seq 1 40); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done

  echo "$name did not become ready at $url" >&2
  echo "Last log lines from $log_file:" >&2
  tail -n 40 "$log_file" >&2 || true
  return 1
}

status_all() {
  load_selected_ports
  build_services

  for service in "${services[@]}"; do
    IFS="|" read -r name port url _command <<< "$service"

    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "$name: running on port $port"
    else
      echo "$name: not responding on port $port"
    fi
  done

  while IFS= read -r remote_url; do
    if curl -fsS "$remote_url" >/dev/null 2>&1; then
      echo "plugin-remote: running at $remote_url"
    else
      echo "plugin-remote: not responding at $remote_url"
    fi
  done < <(API_PORT="$API_PORT" plugin_remote_urls)
}

restart_all() {
  stop_known_demo_ports
  choose_api_port
  write_selected_ports
  build_services

  php bin/setup-plugin-db.php
  npm run build:plugins

  for service in "${services[@]}"; do
    IFS="|" read -r name _port _url command <<< "$service"
    start_service "$name" "$command"
  done

  for service in "${services[@]}"; do
    IFS="|" read -r name _port url _command <<< "$service"
    wait_for_url "$name" "$url"
  done

  while IFS= read -r remote_url; do
    wait_for_url "plugin-remote" "$remote_url"
  done < <(API_PORT="$API_PORT" plugin_remote_urls)

  echo "API:    http://127.0.0.1:$API_PORT"
  echo "Host:   http://127.0.0.1:$HOST_PORT"
  API_PORT="$API_PORT" plugin_remote_urls | sed 's/^/Plugin: /'
  echo "Logs:   $LOG_DIR"
}

case "${1:-restart}" in
  restart)
    restart_all
    ;;
  stop)
    stop_all
    ;;
  status)
    status_all
    ;;
  *)
    echo "Usage: $0 [restart|stop|status]" >&2
    exit 2
    ;;
esac
