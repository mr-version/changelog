import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as github from '@actions/github'
import * as fs from 'fs/promises'
import * as path from 'path'

interface ChangelogResult {
  content: string
  versionRange: string
  hasBreakingChanges: boolean
}

async function run(): Promise<void> {
  try {
    const repositoryPath = core.getInput('repository-path') || '.'
    const projectName = core.getInput('project-name')
    const fromVersion = core.getInput('from-version')
    const toVersion = core.getInput('to-version')
    const outputFormat = core.getInput('output-format') || 'markdown'
    const outputFile = core.getInput('output-file')
    const tagPrefix = core.getInput('tag-prefix') || 'v'
    const repositoryUrl = core.getInput('repository-url')
    const includeAuthors = core.getBooleanInput('include-authors')
    const includeCommitLinks = core.getBooleanInput('include-commit-links')
    const includeIssueReferences = core.getBooleanInput('include-issue-references')
    const includePrReferences = core.getBooleanInput('include-pr-references')
    const groupBreakingChanges = core.getBooleanInput('group-breaking-changes')
    const configFile = core.getInput('config-file')
    const postToPr = core.getBooleanInput('post-to-pr')
    const updateExistingComment = core.getBooleanInput('update-existing-comment')
    const commentHeader = core.getInput('comment-header') || '## 📝 Changelog'
    const token = core.getInput('token')

    core.info('Generating changelog...')

    // Generate the changelog using mr-version CLI
    const result = await generateChangelog({
      repositoryPath,
      projectName,
      fromVersion,
      toVersion,
      outputFormat,
      outputFile,
      tagPrefix,
      repositoryUrl,
      includeAuthors,
      includeCommitLinks,
      includeIssueReferences,
      includePrReferences,
      groupBreakingChanges,
      configFile
    })

    // Set outputs
    core.setOutput('changelog-content', result.content)
    core.setOutput('version-range', result.versionRange)
    core.setOutput('has-breaking-changes', result.hasBreakingChanges.toString())

    if (outputFile) {
      const resolvedPath = path.resolve(repositoryPath, outputFile)
      core.setOutput('changelog-file', resolvedPath)
    }

    // Post to PR if requested
    if (postToPr && github.context.eventName === 'pull_request') {
      await postChangelogToPr({
        content: result.content,
        header: commentHeader,
        updateExisting: updateExistingComment,
        token
      })
    }

    // Add summary to job output
    await core.summary
      .addHeading('📝 Changelog Generated')
      .addDetails('📋 Changelog Content',
        `\`\`\`${outputFormat}\n${result.content}\n\`\`\``
      )
      .addDetails('📊 Metadata',
        `- **Version Range**: \`${result.versionRange}\`\n` +
        `- **Has Breaking Changes**: ${result.hasBreakingChanges ? '⚠️ Yes' : '✅ No'}\n` +
        `- **Output Format**: \`${outputFormat}\`\n` +
        (outputFile ? `- **Output File**: \`${outputFile}\`\n` : '') +
        `- **Repository**: \`${repositoryPath}\`\n` +
        `- **Tag Prefix**: \`${tagPrefix}\``
      )
      .write()

    core.info(`✅ Changelog generated successfully`)

  } catch (error) {
    await core.summary
      .addHeading('❌ Changelog Generation Failed')
      .addDetails('🐛 Error Details',
        `\`\`\`\n${error instanceof Error ? error.message : String(error)}\n\`\`\``
      )
      .write()

    core.setFailed(`Failed to generate changelog: ${error instanceof Error ? error.message : String(error)}`)
  }
}

interface GenerateChangelogOptions {
  repositoryPath: string
  projectName?: string
  fromVersion?: string
  toVersion?: string
  outputFormat: string
  outputFile?: string
  tagPrefix: string
  repositoryUrl?: string
  includeAuthors: boolean
  includeCommitLinks: boolean
  includeIssueReferences: boolean
  includePrReferences: boolean
  groupBreakingChanges: boolean
  configFile?: string
}

async function generateChangelog(options: GenerateChangelogOptions): Promise<ChangelogResult> {
  const args = [
    'changelog',
    '--repo', options.repositoryPath,
    '--output', options.outputFormat,
    '--tag-prefix', options.tagPrefix
  ]

  if (options.projectName) {
    args.push('--project', options.projectName)
  }

  if (options.fromVersion) {
    args.push('--from', options.fromVersion)
  }

  if (options.toVersion) {
    args.push('--to', options.toVersion)
  }

  if (options.outputFile) {
    args.push('--output-file', options.outputFile)
  }

  if (options.repositoryUrl) {
    args.push('--repo-url', options.repositoryUrl)
  }

  if (options.includeAuthors) {
    args.push('--include-authors')
  }

  if (options.includeCommitLinks) {
    args.push('--include-commits')
  }

  if (options.includeIssueReferences) {
    args.push('--include-issues')
  }

  if (options.includePrReferences) {
    args.push('--include-prs')
  }

  if (options.groupBreakingChanges) {
    args.push('--group-breaking')
  }

  if (options.configFile) {
    args.push('--config-file', options.configFile)
  }

  const output = await exec.getExecOutput('mr-version', args, {
    silent: true,
    ignoreReturnCode: true
  })

  if (output.exitCode !== 0) {
    throw new Error(`mr-version changelog failed: ${output.stderr || output.stdout}`)
  }

  const content = output.stdout.trim()

  // Parse the output to extract metadata
  const versionRange = extractVersionRange(content, options.fromVersion, options.toVersion, options.tagPrefix)
  const hasBreakingChanges = checkForBreakingChanges(content)

  return {
    content,
    versionRange,
    hasBreakingChanges
  }
}

function extractVersionRange(content: string, from: string | undefined, to: string | undefined, tagPrefix: string): string {
  // Try to extract version from content (markdown/text headers)
  const versionMatch = content.match(/##?\s*(?:v?(\d+\.\d+\.\d+[^\s]*))/i)

  if (from && to) {
    return `${tagPrefix}${from}...${tagPrefix}${to}`
  } else if (from) {
    const toVer = versionMatch ? versionMatch[1] : 'HEAD'
    return `${tagPrefix}${from}...${toVer}`
  } else if (to) {
    return `...${tagPrefix}${to}`
  } else {
    const ver = versionMatch ? versionMatch[1] : 'HEAD'
    return `...${ver}`
  }
}

function checkForBreakingChanges(content: string): boolean {
  // Check for common breaking change indicators in the content
  const breakingChangePatterns = [
    /###?\s*(?:💥|⚠️)?\s*breaking\s+changes?/i,
    /BREAKING\s+CHANGE/i,
    /‼️/,
    /💥/
  ]

  return breakingChangePatterns.some(pattern => pattern.test(content))
}

interface PostToPrOptions {
  content: string
  header: string
  updateExisting: boolean
  token: string
}

async function postChangelogToPr(options: PostToPrOptions): Promise<void> {
  try {
    const octokit = github.getOctokit(options.token)
    const context = github.context

    if (!context.payload.pull_request) {
      core.warning('Not a pull request event, skipping PR comment')
      return
    }

    const pullRequestNumber = context.payload.pull_request.number
    const commentBody = `${options.header}\n\n${options.content}`

    // Check if we should update an existing comment
    if (options.updateExisting) {
      const { data: comments } = await octokit.rest.issues.listComments({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: pullRequestNumber
      })

      // Find existing comment with the same header
      const existingComment = comments.find(comment =>
        comment.body?.startsWith(options.header)
      )

      if (existingComment) {
        await octokit.rest.issues.updateComment({
          owner: context.repo.owner,
          repo: context.repo.repo,
          comment_id: existingComment.id,
          body: commentBody
        })
        core.info(`Updated existing PR comment #${existingComment.id}`)
        return
      }
    }

    // Create new comment
    await octokit.rest.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: pullRequestNumber,
      body: commentBody
    })
    core.info(`Posted changelog to PR #${pullRequestNumber}`)

  } catch (error) {
    core.warning(`Failed to post changelog to PR: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// Run the action
if (require.main === module) {
  run()
}

export { run }
