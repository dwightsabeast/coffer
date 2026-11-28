# Prints `go test -json` output the way plain `go test` prints it: each package's result line, and the full output of
# every test that failed or of a package that failed to build. CI's bridge job saves the JSON for the security report
# (scripts/security-report-results.mjs) and runs this so its log stays readable. Python standard library only.
#   python3 -I scripts/report/go-test-log.py <go test -json file>
# Exit 0 if no test or package failed, 1 otherwise, 2 if the file can't be read.
import json
import sys

try:
    lines = open(sys.argv[1], encoding="utf-8").read().splitlines()
except (IndexError, OSError) as e:
    print(f"go-test-log: {e}", file=sys.stderr)
    sys.exit(2)

out = {}  # (package, test or "") -> [output lines]
failed = []  # in order
pkg_lines = []
for line in lines:
    if not line.startswith("{"):
        print(line)  # build errors and the like arrive as plain text
        continue
    e = json.loads(line)
    if e["Action"] == "build-output":
        sys.stdout.write(e.get("Output", ""))  # a compile error, as plain go test prints it
        continue
    key = (e.get("Package", ""), e.get("Test") or "")
    if e["Action"] == "output":
        out.setdefault(key, []).append(e["Output"])
        if not key[1] and (e["Output"].startswith(("ok ", "ok\t", "FAIL", "?   ", "---"))):
            pkg_lines.append(e["Output"])
    elif e["Action"] == "fail":
        failed.append(key)

for key in failed:
    if key[1]:
        print(f"=== failed: {key[0]} {key[1]}")
        sys.stdout.write("".join(out.get(key, [])))
for line in pkg_lines:
    sys.stdout.write(line)
sys.exit(1 if failed else 0)
