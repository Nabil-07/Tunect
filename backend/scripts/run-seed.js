"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
async function main() {
    const prisma = new client_1.PrismaClient();
    try {
        const sqlPath = path.resolve(__dirname, '../../database/seed.sql');
        const fullSql = fs.readFileSync(sqlPath, 'utf8');
        const lines = fullSql.split('\n');
        const cleaned = [];
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('--'))
                continue;
            if (/^BEGIN\s*;?\s*$/i.test(trimmed))
                continue;
            if (/^COMMIT\s*;?\s*$/i.test(trimmed))
                continue;
            cleaned.push(line);
        }
        const body = cleaned.join('\n');
        const statements = body
            .split(/;\s*\n\s*\n/)
            .map(s => s.trim())
            .filter(s => s.length > 0);
        console.log(`Running ${statements.length} SQL statements...`);
        let success = 0;
        let skipped = 0;
        for (let i = 0; i < statements.length; i++) {
            let stmt = statements[i];
            if (!stmt.endsWith(';'))
                stmt += ';';
            try {
                const result = await prisma.$executeRawUnsafe(stmt);
                success++;
                console.log(`  [${i + 1}/${statements.length}] OK (${result} rows affected)`);
            }
            catch (err) {
                if (err.meta?.code === '23505' || err.message?.includes('unique constraint')) {
                    skipped++;
                    console.log(`  [${i + 1}/${statements.length}] SKIPPED (already exists)`);
                }
                else if (err.meta?.code === '23503') {
                    skipped++;
                    console.log(`  [${i + 1}/${statements.length}] SKIPPED (FK ref missing): ${err.meta?.message?.substring(0, 100)}`);
                }
                else {
                    console.error(`  [${i + 1}/${statements.length}] FAILED:`, stmt.substring(0, 150));
                    console.error('  Error:', err.meta?.message || err.message);
                    throw err;
                }
            }
        }
        console.log(`\nSeed completed! ${success} succeeded, ${skipped} skipped.`);
    }
    finally {
        await prisma.$disconnect();
    }
}
main().catch((e) => {
    console.error('Seed failed:', e.message);
    process.exit(1);
});
//# sourceMappingURL=run-seed.js.map