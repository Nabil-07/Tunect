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
const bcrypt = __importStar(require("bcrypt"));
const crypto_1 = require("crypto");
const prisma = new client_1.PrismaClient();
const USERS = [
    { email: 'fauzia.tabassum@tunectnow.com', role: 'ADMIN', persona: 'ADMIN' },
    { email: 'shifa.abida@tunectnow.com', role: 'TUTOR', persona: 'TUTOR' },
    { email: 'nazmeen.rahman@tunectnow.com', role: 'STUDENT', persona: 'STUDENT' },
    { email: 'nabil.irshad@tunectnow.com', role: 'TUTOR', persona: 'TUTOR' },
];
function generatePassword() {
    const base = (0, crypto_1.randomBytes)(12).toString('base64').replace(/[+/=]/g, '');
    const symbols = '!@#$%^&*_-+?';
    const symbol = symbols[Math.floor(Math.random() * symbols.length)];
    const suffix = Math.floor(10 + Math.random() * 90).toString();
    return `${base}${symbol}${suffix}`;
}
async function seed() {
    const results = [];
    for (const user of USERS) {
        const password = generatePassword();
        const hash = await bcrypt.hash(password, 10);
        const created = await prisma.user.upsert({
            where: { email: user.email.toLowerCase() },
            update: {
                role: user.role,
                password: hash,
                hasChosenRole: true,
            },
            create: {
                email: user.email.toLowerCase(),
                password: hash,
                role: user.role,
                hasChosenRole: true,
            },
            select: { id: true },
        });
        if (user.persona === 'STUDENT') {
            await prisma.student.upsert({
                where: { userId: created.id },
                update: {},
                create: { user: { connect: { id: created.id } }, tokens: 0 },
            });
        }
        if (user.persona === 'TUTOR') {
            await prisma.tutor.upsert({
                where: { userId: created.id },
                update: {},
                create: { user: { connect: { id: created.id } }, status: 'PENDING', hourlyRate: 0 },
            });
        }
        results.push({ email: user.email, password, role: user.role });
    }
    console.log('\n✅ Preprod users seeded/updated:');
    results.forEach((row) => {
        console.log(`- ${row.email} (${row.role}) => ${row.password}`);
    });
    console.log('\nStore these passwords securely.');
}
seed()
    .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed-preprod-users.js.map