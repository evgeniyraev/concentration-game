#!/usr/bin/env bash
set -euo pipefail

base_package="$1"
worktree="$2"
head_ref="$3"
labels="$4"
output="$5"

version="$(node "$(dirname "$0")/prepare-pr-version.cjs" \
  "$base_package" "$worktree" "$head_ref" "$labels" "$output")"

git -C "$worktree" add -- package.json package-lock.json
if git -C "$worktree" diff --cached --quiet; then
  echo "Version $version is already present on the PR"
else
  git -C "$worktree" -c user.name='github-actions[bot]' \
    -c user.email='41898282+github-actions[bot]@users.noreply.github.com' \
    commit -m "chore(release): bump version to $version"
  git -C "$worktree" push origin "HEAD:refs/heads/$head_ref"
fi

printf 'head_sha=%s\n' "$(git -C "$worktree" rev-parse HEAD)" >> "$output"
