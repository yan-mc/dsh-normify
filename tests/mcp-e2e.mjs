// Exercise the real stdin/stdout adapter with the official MCP client, in a disposable project.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tempRoot = realpathSync(tmpdir())
const work = mkdtempSync(join(tempRoot, 'normify-mcp-e2e-'))
const root = join(work, 'structure home')
const repo = join(work, 'fixture repo')
mkdirSync(root)
mkdirSync(join(repo, 'src'), { recursive: true })

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(packageDir, 'lib', 'mcp.js'), '--root', root],
  cwd: work,
  stderr: 'pipe',
})
const client = new Client({ name: 'normify-mcp-e2e', version: '1.0.0' })
const protocolErrors = []
let stderr = ''
client.onerror = error => protocolErrors.push(String(error))
transport.stderr?.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-12000) })

async function call(name, args = {}, expectError = false) {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 10000 })
  assert.equal(result.isError === true, expectError, name + ': ' + JSON.stringify(result))
  assert.equal(result.content[0]?.type, 'text', name + ' must return JSON text')
  const payload = JSON.parse(result.content[0].text)
  assert.equal(payload.ok, !expectError, name + ': ' + JSON.stringify(payload))
  assert.deepEqual(result.structuredContent, payload, name + ' structured/text results must agree')
  return payload
}

function snapshot(dir) {
  const files = {}
  const walk = current => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(current, entry.name)
      assert.equal(entry.isSymbolicLink(), false, 'fixture must not contain links')
      if (entry.isDirectory()) walk(path)
      else files[relative(dir, path)] = createHash('sha256').update(readFileSync(path)).digest('hex')
    }
  }
  walk(dir)
  return files
}

function assertSchema(schema) {
  if (!schema || typeof schema !== 'object') return
  if (Object.hasOwn(schema, 'required')) {
    assert.ok(Array.isArray(schema.required), 'required must be a JSON Schema array, not a DSH boolean')
    assert.ok(schema.required.every(key => typeof key === 'string'))
  }
  for (const child of Object.values(schema)) {
    if (Array.isArray(child)) child.forEach(assertSchema)
    else if (child && typeof child === 'object') assertSchema(child)
  }
}

async function moduleData(id, parent, sourcePath, extra = {}) {
  const source = [{ path: sourcePath }]
  const result = await call('normify_fingerprint', { repoRoot: repo, source })
  const expectedHash = createHash('sha256').update(sourcePath).update(Buffer.from([0]))
    .update(readFileSync(join(repo, sourcePath))).digest('hex')
  assert.equal(result.fingerprint, expectedHash)
  return {
    uid: createHash('sha256').update(id).digest('hex').slice(0, 8),
    id, parent,
    name: { zh: id, en: id },
    description: { zh: '用于验证 MCP 适配器的模块。', en: 'Module for the MCP adapter fixture.' },
    source,
    revision: '0'.repeat(40),
    updated_at: new Date().toISOString(),
    fingerprint: result.fingerprint,
    ...extra,
  }
}

async function main() {
  await client.connect(transport, { timeout: 10000 })
  assert.ok(transport.pid, 'stdio transport must start a child process')
  assert.ok(client.getServerVersion()?.name, 'initialize must report a server identity')
  const capabilities = client.getServerCapabilities()
  for (const capability of ['tools', 'resources', 'prompts']) {
    assert.ok(capabilities?.[capability], 'initialize must advertise ' + capability)
  }
  const { tools } = await client.listTools()
  assert.equal(tools.length, 31)
  assert.equal(new Set(tools.map(tool => tool.name)).size, 31)
  for (const tool of tools) {
    assert.equal(tool.inputSchema.type, 'object')
    assertSchema(tool.inputSchema)
    assert.equal(typeof tool.annotations?.readOnlyHint, 'boolean')
    assert.equal(typeof tool.annotations?.destructiveHint, 'boolean')
  }
  const byName = new Map(tools.map(tool => [tool.name, tool]))
  const upsertSchema = byName.get('normify_module_upsert').inputSchema
  assert.ok(upsertSchema.required.includes('frontmatter'))
  const frontmatterSchema = upsertSchema.properties.frontmatter
  for (const field of ['uid', 'id', 'parent', 'name', 'description', 'source', 'revision', 'updated_at', 'fingerprint']) {
    assert.ok(frontmatterSchema.required.includes(field), 'missing nested required field: ' + field)
  }
  assert.deepEqual(frontmatterSchema.properties.name.required, ['zh', 'en'])
  assert.deepEqual(frontmatterSchema.properties.source.items.required, ['path'])
  assert.equal(frontmatterSchema.properties.deps.items.required.includes('label'), false, 'dependency label must remain optional')
  assert.equal(byName.get('normify_help').annotations.readOnlyHint, true)
  assert.equal(byName.get('normify_help').annotations.destructiveHint, false)
  assert.equal(byName.get('normify_module_delete').annotations.readOnlyHint, false)
  assert.equal(byName.get('normify_module_delete').annotations.destructiveHint, true)
  assert.equal(byName.get('normify_module_patch').annotations.readOnlyHint, false)
  assert.equal(byName.get('normify_build').annotations.idempotentHint, true)

  const help = await call('normify_help', { topic: 'tool:normify_module_upsert' })
  assert.match(help.reference, /frontmatter/)
  await call('normify_module_get', {}, true)
  await call('normify_module_get', { id: 42 }, true)
  await call('normify_project_init', { project: 'invalid', unknown_field: true }, true)
  assert.equal(existsSync(join(root, 'normify-invalid')), false, 'invalid arguments must not create a project')
  await call('normify_help', { topic: 'missing-topic' }, true)
  await call('normify_help', { topic: 'tools' })
  console.log('MCP initialize, 31 schemas, annotations and recoverable errors: PASS')

  const skillText = readFileSync(join(packageDir, 'skills', 'normify-gen', 'SKILL.md'), 'utf8')
  const { resources } = await client.listResources()
  const skill = resources.find(resource => resource.uri === 'normify://skills/normify-gen')
  assert.ok(skill, 'normify-gen skill resource must be discoverable')
  const resource = await client.readResource({ uri: skill.uri })
  assert.equal(resource.contents[0].text, skillText)
  const { prompts } = await client.listPrompts()
  assert.ok(prompts.some(prompt => prompt.name === 'normify-gen'))
  const prompt = await client.getPrompt({ name: 'normify-gen' })
  assert.ok(prompt.messages.some(message => message.content.type === 'text' && message.content.text.includes(skillText)))
  console.log('MCP skill resource and prompt: PASS')

  const project = 'mcp-demo'
  const initialized = await call('normify_project_init', {
    project,
    root: { id: 'demo', name: { zh: '演示', en: 'Demo' }, description: { zh: '测试项目', en: 'Test project' } },
  })
  const projectDir = join(root, 'normify-' + project)
  assert.equal(resolve(initialized.dir), projectDir)
  assert.ok(existsSync(join(projectDir, 'policy.yml')))
  assert.equal((await call('normify_module_get', { project, id: 'demo' })).module.state, 'planned')
  const initSnapshot = snapshot(projectDir)
  await call('normify_project_init', { project })
  assert.deepEqual(snapshot(projectDir), initSnapshot, 'repeated initialization must preserve the project')

  for (const name of ['main', 'alpha', 'beta']) {
    writeFileSync(join(repo, 'src', name + '.ts'), 'export const ' + name + ' = 1\n')
  }
  const rootModule = await moduleData('demo', null, 'src/main.ts')
  // JSON null exercises the root-parent schema compatibility at the MCP boundary.
  await call('normify_module_upsert', { project, frontmatter: rootModule })
  const leaves = []
  for (const name of ['alpha', 'beta']) {
    leaves.push(await moduleData('demo.' + name, 'demo', 'src/' + name + '.ts', {
      apis: [{ protocol: 'rpc', path: name, description: { zh: name, en: name } }],
    }))
  }
  await call('normify_module_batch', { project, items: leaves.map(frontmatter => ({ frontmatter })) })
  const unlabeledDeps = [{ kind: 'reference', to: 'demo.beta' }]
  await call('normify_module_upsert', { project, frontmatter: { ...leaves[0], deps: unlabeledDeps } })
  const withDependency = await call('normify_module_get', { project, id: 'demo.alpha' })
  assert.deepEqual(withDependency.module.deps, unlabeledDeps, 'upsert must accept and preserve dependencies without an optional label')
  await call('normify_layout_upsert', {
    project, id: 'demo', order: ['demo.alpha', 'demo.beta'], reading: { zh: '从左到右', en: 'Left to right' },
  })

  const beforeFailure = snapshot(projectDir)
  const extra = { ...leaves[0], id: 'demo.extra', uid: '12345678' }
  const invalid = { ...leaves[1], id: 'demo.invalid', uid: '87654321', parent: 'demo.wrong' }
  await call('normify_module_batch', { project, items: [{ frontmatter: extra }, { frontmatter: invalid }] }, true)
  assert.deepEqual(snapshot(projectDir), beforeFailure, 'failed batch must leave no partial writes')
  await call('normify_module_patch', { project, id: 'demo.alpha', patch: { tags: ['dry-run'] }, dry_run: true })
  assert.deepEqual(snapshot(projectDir), beforeFailure, 'dry_run must not change any project file')

  const updatedName = { zh: '并发更新', en: 'Concurrent update' }
  await Promise.all([
    call('normify_module_patch', { project, id: 'demo.alpha', patch: { tags: ['concurrent'] } }),
    call('normify_module_patch', { project, id: 'demo.alpha', patch: { name: updatedName } }),
  ])
  const updated = await call('normify_module_get', { project, id: 'demo.alpha' })
  assert.deepEqual(updated.module.tags, ['concurrent'], 'concurrent patch must preserve the first update')
  assert.deepEqual(updated.module.name, updatedName, 'concurrent patch must preserve the second update')
  assert.deepEqual(updated.module.deps, unlabeledDeps, 'unrelated patches must preserve the unlabeled dependency')
  assert.equal((await call('normify_module_list', { project })).count, 3)
  console.log('MCP project/module writes, atomic failure, dry-run and concurrent patches: PASS')

  const validated = await call('normify_validate', { project, repoRoot: repo })
  assert.deepEqual(validated.errors, [])
  await call('normify_build', { project, repoRoot: repo })
  for (const file of ['tree.json', 'outline.md', 'api-index.json', 'receipt.json']) {
    assert.ok(readFileSync(join(projectDir, file)).length > 0, file + ' must be generated')
  }
  const beforeInvalidBuild = snapshot(projectDir)
  writeFileSync(join(repo, 'src', 'alpha.ts'), 'export const alpha = 2\n')
  await call('normify_build', { project, repoRoot: repo }, true)
  assert.deepEqual(snapshot(projectDir), beforeInvalidBuild, 'failed evidence validation must preserve build outputs')
  writeFileSync(join(repo, 'src', 'alpha.ts'), 'export const alpha = 1\n')
  await call('normify_validate', { project, repoRoot: repo })
  const rendered = await call('normify_render', { project })
  assert.equal(resolve(rendered.html), join(projectDir, 'normify.html'))
  const html = readFileSync(rendered.html, 'utf8')
  assert.match(html, /<!doctype html>/i)
  assert.match(html, /demo\.alpha/)
  assert.equal(rendered.bytes, Buffer.byteLength(html))
  assert.equal(rendered.sha256, createHash('sha256').update(html).digest('hex'))
  assert.deepEqual(protocolErrors, [], 'server stdout must contain valid MCP messages only')
  console.log('MCP source evidence, validate/build/render and HTML verification: PASS')
}

let deadline
try {
  await Promise.race([
    main(),
    new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('MCP e2e exceeded 45 seconds')), 45000) }),
  ])
  console.log('=== MCP stdio e2e PASS ===')
} catch (error) {
  if (stderr) console.error('MCP server stderr:\n' + stderr)
  throw error
} finally {
  clearTimeout(deadline)
  try {
    // The SDK closes stdin, waits, and terminates its own child process if necessary.
    await client.close()
    await transport.close()
  } finally {
    const target = realpathSync(work)
    assert.equal(dirname(target), tempRoot, 'cleanup must stay directly under the temporary root')
    assert.ok(basename(target).startsWith('normify-mcp-e2e-'), 'cleanup must only remove our mkdtemp directory')
    rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  }
}
