#!/usr/bin/env bash
# Prints the nuwan@blueprints profile card (see ascii.md) with ANSI colors.
set -euo pipefail

RESET=$'\033[0m'
BOLD=$'\033[1m'
DIM=$'\033[2m'
CYAN=$'\033[36m'
GREEN=$'\033[32m'
WHITE=$'\033[97m'

field() {
  local label="$1" value="$2" width="${3:-26}"
  local prefix="${label}: "
  local dots=$(( width - ${#prefix} ))
  (( dots < 3 )) && dots=3
  local leader
  leader="$(printf '%*s' "$dots" '' | tr ' ' '.')"
  printf '%s%s:%s %s%s%s %s' "$BOLD$GREEN" "$label" "$RESET" "$DIM" "$leader" "$RESET" "$value"
}

header() {
  printf '%s%s%s' "$BOLD$WHITE" "$1" "$RESET"
}

ART=(
  "KWNXMKWNXMKWNXMKWNKNMMNXMKWNXWKKNWKMXNWKMXNWKMXNWK"
  "NNNNXNNNNXNNNNXNNNNNklllooclc:clodKXNNNNXNNNNXNNNN"
  "NNNNXNNNNXNNNNXNX0dl;;,'''.........ckXNNXNNNNXNNNN"
  "NNNNNNNNNNNNNNXkd:,'................'lXNNNNNNNNNNN"
  "XNNNNXNNNNXNNKk:,....................'dXNNNNXNNNNX"
  "XNNNNXNNNNXNKl;,...',;;;;;::ccc:,,....,0NNNNXNNNNX"
  "NNNNNNNNNNNXl,....:odddddddddddoool:;',xNNNNNNNNNN"
  "NNNNXNNNNXNO,....,cdxxxxdxxxddddddolcl,;NXNNXXNNXW"
  "NNNNXNNNNXNl.....,lxxxxxkkkkxxxxxxddolc'XNNNXNXXNX"
  "NNNNNNNNNNN;....;oooolccccclodxddddddoc'xNNNNNNNNN"
  "XNNNNXNNNNK..'cll:,',,....'..,;;;,,;,;;.oXNNNXNNXW"
  "XNNNNXNNNKx:',';cl:''........',..........oNWXWNXNX"
  "NNNNNNNNNdlocl;xkxd''.......,xOl........lNNNNNNNNN"
  "NNNNXNXNWko:;olkOOOxc;'...'ckO0Oc......,KNNNNXNNNN"
  "WXNNNWWNNNdlllcdkkkOkxxdooxkxkkkxo::::lXXNNNNXNNNN"
  "NNNNNNNNNNKxxo;ldxxxxddddxdlcclc;coooodNNNNNNNNNNN"
  "NNNNXNNNNXNX0o;:coooddo:,;,'.';..':lllxXNNNNXNNNNX"
  "NNNNXNXNKxllok:,;cccodc.,:lllcc:;'..c:KXNNNNXNNNNX"
  "NNNNNNNx;....xx:,,,;co;:dxdolcccc:,',kNNNNNNNNNNNN"
  "XNNNNXX:''..'oddc'.'''',codd:,,;cl,.kNNNXNNNNXNNNN"
  "XNNNNXK;.....,:ddl;.....';cooooll:.dNNXNXNNXNXNNNN"
  "NNNNNNx''......,colc;,.......''..,kNNNNNNNNNNNNNNN"
  "NNNXko,'.........,:ccc:;;,'''''.,0XNXNNXNNNNXNNNNX"
  "NOo,................,;::;;,,;;....oNXNNXNNNNXNNNNX"
  ":,'..................',;;;;,;;.....cXNXMKWNXMKWNXM"
)

INFO=()
INFO+=("${BOLD}${GREEN}nuwan@blueprints${RESET}")
INFO+=("${DIM}-----------------------------------------------------------------------------------${RESET}")
INFO+=("$(field "OS" "Linux (RHEL, Ubuntu), Windows")")
INFO+=("$(field "Uptime" "8+ years in software engineering")")
INFO+=("$(field "Host" "Open to new opportunities")")
INFO+=("$(field "Kernel" "Senior Software Engineer (Full-Stack)")")
INFO+=("$(field "IDE" "PhpStorm, VS Code, Claude Code, Antigravity, Codex")")
INFO+=("")
INFO+=("$(field "Languages.Programming" "PHP, Python, JavaScript, TypeScript, Dart")")
INFO+=("$(field "Languages.Frameworks" "Symfony, Laravel, React, Vue.js, Node.js")")
INFO+=("$(field "Languages.Real" "English, Sinhala, Tamil")")
INFO+=("")
INFO+=("$(field "Practices" "SOLID, DDD, TDD, Microservices, Event-Driven")")
INFO+=("$(field "Focus" "Plugin architectures, monitoring platforms, mentoring & R&D")")
INFO+=("")
INFO+=("$(header "Contact")")
INFO+=("$(field "Email" "enuwan.perera@gmail.com")")
INFO+=("$(field "GitHub" "github.com/nuwanchamp")")
INFO+=("$(field "LinkedIn" "linkedin.com/in/nuwan-c-perera")")
INFO+=("")
INFO+=("$(header "GitHub Stats")")
INFO+=("$(field "Repos" "27 public (non-fork)")")
INFO+=("$(field "Followers" "2")")
INFO+=("$(field "Commits" "130 tracked, since 2016")")
INFO+=("$(field "Top Language" "PHP")")

for i in "${!ART[@]}"; do
  printf '%s%-50s%s   %s\n' "$CYAN" "${ART[$i]}" "$RESET" "${INFO[$i]:-}"
done
