#!/usr/bin/env bash
set -euo pipefail

automation_root="$PWD"
filters=(-f base=main -f state=open -F per_page=100)
if [[ -n "$REVIEW_BRANCH" ]]; then
  filters+=(-f "head=${GITHUB_REPOSITORY_OWNER}:$REVIEW_BRANCH")
fi

pulls="$(gh api --paginate --method GET "repos/$GITHUB_REPOSITORY/pulls" "${filters[@]}" |
  jq -c --arg repo "$GITHUB_REPOSITORY" '
    .[] | select(.head.repo.full_name == $repo and (.head.ref | test("^(fix|feature)/.+")))
  ')"

failed=0
while IFS= read -r pull; do
  [[ -n "$pull" ]] || continue
  number="$(jq -r '.number' <<<"$pull")"
  head_sha="$(jq -r '.head.sha' <<<"$pull")"
  review="$(gh pr view "$number" --repo "$GITHUB_REPOSITORY" \
    --json state,baseRefName,headRefOid,reviewDecision,latestReviews)"
  # GitHub can return no review decision when approval rules are disabled.
  if ! jq -e --arg head "$head_sha" '
    .state == "OPEN" and .baseRefName == "main" and .headRefOid == $head and
    (.reviewDecision == "APPROVED" or
      ((.reviewDecision // "") == "" and any((.latestReviews // [])[]; .state == "APPROVED")))
  ' <<<"$review" >/dev/null; then
    continue
  fi

  head_ref="$(jq -r '.head.ref' <<<"$pull")"
  labels="$(jq -c '[.labels[].name]' <<<"$pull")"
  git fetch --no-tags --depth=1 origin "refs/pull/$number/head"
  if [[ "$(git rev-parse FETCH_HEAD)" != "$head_sha" ]]; then
    echo "PR #$number received a new commit during the version check."
    failed=1
    continue
  fi

  echo "Checking version for PR #$number ($head_ref)"
  worktree="$(mktemp -d)"
  git worktree add --detach "$worktree" "$head_sha"
  if ! bash "$automation_root/.github/scripts/update-pr-version.sh" \
    "$automation_root/package.json" "$worktree" "$head_ref" "$labels" /dev/null; then
    echo "Unable to update the version of PR #$number." >&2
    failed=1
  fi
  git worktree remove --force "$worktree"
done <<<"$pulls"

exit "$failed"
