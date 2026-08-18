import { spawn } from 'node:child_process'
import net from 'node:net'

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' })
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })
}

function run(label, command, args) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })

  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.log(`[${label}] salio con codigo ${code}`)
    }
  })

  return child
}

const children = []

if (await isPortOpen(3001)) {
  console.log('[api] http://localhost:3001 ya esta corriendo')
} else {
  children.push(run('api', 'node', ['server.js']))
}

children.push(run('vite', 'npm', ['run', 'dev:vite']))

function stop() {
  for (const child of children) {
    if (!child.killed) child.kill()
  }
}

process.on('SIGINT', () => {
  stop()
  process.exit(0)
})

process.on('SIGTERM', () => {
  stop()
  process.exit(0)
})
