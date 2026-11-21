"""Refresh the read-only Google DESIGN.md reference from its official Git repository."""

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import subprocess
import tempfile
from urllib.parse import urlsplit


VENDOR = Path(__file__).resolve().parents[1] / "vendor" / "google-design-md"
SNAPSHOT = VENDOR / "upstream"
MANIFEST = ".snapshot.json"
REQUIRED = ("LICENSE", "docs/spec.md", "packages/cli/src/linter/spec-config.yaml")


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def file_hashes(root):
    hashes = {}
    for file in sorted(root.rglob("*")):
        if file.resolve() != file:
            raise ValueError(f"Redirected path in upstream snapshot: {file}")
        if file.is_file() and file != root / MANIFEST:
            hashes[file.relative_to(root).as_posix()] = hashlib.sha256(file.read_bytes()).hexdigest()
    return hashes


def check_snapshot():
    actual = file_hashes(SNAPSHOT)
    manifest = read_json(SNAPSHOT / MANIFEST)
    if not all(path in actual for path in REQUIRED):
        raise ValueError("The upstream snapshot is missing a required spec or license file.")
    expected = manifest["sha256"]
    changed = sorted(path for path in actual.keys() | expected.keys() if actual.get(path) != expected.get(path))
    if changed:
        raise ValueError(f"Local snapshot differs from its manifest: {', '.join(changed)}")
    return manifest


def update_snapshot(current, direct):
    upstream = read_json(VENDOR / "UPSTREAM.json")
    previous = VENDOR / ".previous"
    if previous.exists() or previous.is_symlink():
        raise ValueError(f"Found an earlier snapshot backup. Review it before updating: {previous}")
    with tempfile.TemporaryDirectory(prefix=".sync-", dir=VENDOR) as folder:
        staging = Path(folder)
        if staging.resolve().parent != VENDOR:
            raise ValueError("The staging directory must be inside the vendor directory.")
        checkout = staging / "checkout"
        env = os.environ.copy()
        if direct:
            host = urlsplit(upstream["repository"]).hostname
            env["NO_PROXY"] = ",".join(filter(None, [env.get("NO_PROXY"), host]))
        subprocess.run(
            ["git", "clone", "--depth", "1", "--no-tags", "--no-checkout",
             "--branch", upstream["branch"], "--", upstream["repository"], str(checkout)],
            check=True, env=env,
        )
        git = ["git", "-C", str(checkout)]
        commit = subprocess.check_output([*git, "rev-parse", "HEAD"], text=True).strip()
        if (
            current
            and current["commit"] == commit
            and current["source"] == upstream
            and current.get("format") == "git-blobs"
        ):
            print(f"Already up to date at {commit}.")
            return

        tree = subprocess.check_output(
            [*git, "ls-tree", "-r", "-z", commit, "--", *upstream["paths"]]
        )
        incoming = staging / "incoming"
        incoming.mkdir()
        # Read blobs directly so Git cannot apply checkout line-ending conversion.
        for entry in tree.rstrip(b"\0").split(b"\0"):
            info, raw_path = entry.split(b"\t", 1)
            mode, kind, blob = info.split()
            path = PurePosixPath(raw_path.decode("utf-8"))
            if kind != b"blob" or mode not in (b"100644", b"100755"):
                raise ValueError(f"Unexpected non-file in upstream: {path}")
            if path.is_absolute() or ".." in path.parts or any(":" in part or "\\" in part for part in path.parts):
                raise ValueError(f"Unexpected upstream path: {path}")
            target = incoming.joinpath(*path.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(subprocess.check_output([*git, "cat-file", "blob", blob.decode("ascii")]))

        hashes = file_hashes(incoming)
        if not all(path in hashes for path in REQUIRED):
            raise ValueError("The upstream archive does not contain the complete specification.")
        manifest = {"commit": commit, "source": upstream, "format": "git-blobs", "sha256": hashes}
        (incoming / MANIFEST).write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        if current:
            if check_snapshot() != current:
                raise ValueError("The snapshot was updated while Git was fetching. Run the update again.")
            SNAPSHOT.rename(previous)
        try:
            incoming.rename(SNAPSHOT)
        except OSError:
            if current:
                previous.rename(SNAPSHOT)
            raise
        if current:
            previous.rename(staging / "previous")
        print(f"Updated {len(hashes)} upstream files to {commit}.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--update", action="store_true", help="fetch and install the current upstream snapshot")
    parser.add_argument("--direct", action="store_true", help="connect directly to upstream for this update")
    args = parser.parse_args()
    try:
        if VENDOR.resolve() != VENDOR or SNAPSHOT.resolve() != SNAPSHOT:
            raise ValueError("The vendor and snapshot directories must be inside the skill.")
        current = check_snapshot() if SNAPSHOT.exists() or not args.update else None
        if args.update:
            update_snapshot(current, args.direct)
        else:
            print(f"Verified {len(current['sha256'])} files from {current['commit']}.")
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()
