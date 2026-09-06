import path from 'node:path'
import fs from 'node:fs'
import { httpError } from './http.js'

export function managedImagePath(uploadDir, storedPath) {
  const root = path.resolve(uploadDir)
  const target = path.resolve(root, storedPath)
  const relative = path.relative(root, target)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw httpError(409, 'image is outside managed storage')
  // 不跟随指向受控目录以外文件的链接。
  if (fs.existsSync(target) && fs.realpathSync(target) !== target) throw httpError(409, 'image symlink is not supported')
  return target
}
