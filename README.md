# Generate Changelog Action

Generate a changelog from conventional commits with the Mister.Version CLI (`mr-version changelog`), optionally
write it to a file and post it as a pull request comment.

## Which ref to use

This repository has no release tags yet (there is no `v1`). Reference `@main` or pin a commit SHA:

```yaml
- uses: mr-version/changelog@main
```

## Usage

The CLI must be on `PATH`; install it with [`mr-version/setup`](https://github.com/mr-version/setup).

```yaml
steps:
  - uses: actions/checkout@v4
    with:
      fetch-depth: 0            # full history and tags are needed to find the previous release

  - uses: actions/setup-dotnet@v4
    with:
      dotnet-version: '8.0.x'

  - uses: mr-version/setup@main

  - uses: mr-version/changelog@main
    id: changelog
    with:
      repository-url: ${{ github.server_url }}/${{ github.repository }}
      output-file: CHANGELOG.md

  - name: Report breaking changes
    if: steps.changelog.outputs.has-breaking-changes == 'true'
    run: echo "::warning::This release contains breaking changes"
```

## Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `repository-path` | Path to the Git repository root | `.` |
| `project-name` | Project name for monorepo scenarios (uses `<prefix><project>/` tags) | |
| `from-version` | Start version, without the tag prefix (defaults to the previous version tag) | |
| `to-version` | End version, without the tag prefix (defaults to `HEAD`) | |
| `output-format` | `markdown`, `text` or `json` | `markdown` |
| `output-file` | Write the changelog to this file. Relative paths are resolved against `repository-path`; missing directories are created | |
| `tag-prefix` | Prefix for version tags | `v` |
| `repository-url` | Repository URL used to build commit/issue links (e.g. `https://github.com/owner/repo`) | |
| `include-authors` | Include commit authors | `false` |
| `include-commit-links` | Include commit links | `true` |
| `include-issue-references` | Include issue references | `true` |
| `include-pr-references` | Include PR references | `true` |
| `group-breaking-changes` | Put breaking changes in their own section | `true` |
| `config-file` | Path to `mr-version.yml` (auto-detected if not specified) | |
| `post-to-pr` | Post the changelog as a PR comment (`pull_request` events only) | `false` |
| `update-existing-comment` | Update the previous comment with the same header instead of adding a new one | `true` |
| `comment-header` | Header that identifies the PR comment | `## 📝 Changelog` |
| `token` | GitHub token for PR comments | `${{ github.token }}` |

### Boolean options and the CLI

The action only passes a boolean option to the CLI when it differs from the CLI default:

- `include-authors: true` adds `--include-authors`;
- `include-commit-links`, `include-issue-references`, `include-pr-references` and `group-breaking-changes` set to
  `false` add `--include-commits false`, `--include-issues false`, `--include-prs false` and
  `--group-breaking false`.

Turning the default-on options off needs a CLI that accepts an explicit `true`/`false` value for these options.
Older CLI versions (3.0.0 and earlier) parse them as plain switches and ignore the value, so they always include
commit links, issue and PR references and group breaking changes. When an option is left at its default, settings
in `mr-version.yml` (`changelog:` section) apply with CLIs that read them.

## Outputs

| Output | Description |
|--------|-------------|
| `changelog-content` | The generated changelog. With `output-file`, this is the content of the written file |
| `changelog-file` | Absolute path of the written file (only when `output-file` is set) |
| `version-range` | Version range of the changelog, e.g. `v1.0.0...v1.1.0` |
| `has-breaking-changes` | `true` when the changelog contains breaking changes (for `json` output, any entry with `isBreakingChange`) |

## Examples

### Changelog for one project in a monorepo

```yaml
- uses: mr-version/changelog@main
  with:
    project-name: MyLibrary
    from-version: '1.2.0'
    to-version: '1.3.0'
```

### Plain list without links, posted to the pull request

```yaml
- uses: mr-version/changelog@main
  with:
    include-commit-links: false
    include-issue-references: false
    post-to-pr: true
```

### Release notes for `gh release create`

```yaml
- uses: mr-version/changelog@main
  id: notes
  with:
    output-file: artifacts/RELEASE_NOTES.md
    repository-url: ${{ github.server_url }}/${{ github.repository }}

- run: gh release create "v${VERSION}" --notes-file "${{ steps.notes.outputs.changelog-file }}"
  env:
    GH_TOKEN: ${{ github.token }}
    VERSION: ${{ steps.calculate.outputs.version }}
```

## License

This action is part of the Mister.Version project and is licensed under the MIT License.
