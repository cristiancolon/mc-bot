import { config } from '../config.js'

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 }
const threshold = LEVELS[config.logLevel] ?? LEVELS.info

const stamp = () => new Date().toTimeString().slice(0, 8)

const emit = (level, tag, ...args) => {
  if (LEVELS[level] < threshold) return
  const stream = LEVELS[level] >= LEVELS.warn ? console.error : console.log
  stream(`[${stamp()}] ${level.toUpperCase().padEnd(5)} ${tag ? `(${tag}) ` : ''}${args.join(' ')}`)
}

export const log = {
  debug: (tag, ...a) => emit('debug', tag, ...a),
  info: (tag, ...a) => emit('info', tag, ...a),
  warn: (tag, ...a) => emit('warn', tag, ...a),
  error: (tag, ...a) => emit('error', tag, ...a)
}
