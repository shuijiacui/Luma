import { createDb } from '../src/db.js'
import { generateAllReports } from '../src/services/periodReports.js'

try { process.loadEnvFile(new URL('../.env', import.meta.url)) } catch (error) { if (error.code !== 'ENOENT') throw error }
const db = createDb()
try { console.log(JSON.stringify({ reports: generateAllReports(db), timeZone: 'Asia/Shanghai' })) }
finally { db.close() }
