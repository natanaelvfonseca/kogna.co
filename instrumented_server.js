
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import fs from 'fs';
const debLog = (msg) => {
    fs.appendFileSync('startup_debug.log', `[${new Date().toISOString()}] ${msg}\n`);
    console.log(msg);
};

debLog('STEP 0: Initializing instrumentation');

import express from 'express';
debLog('STEP 1: Express imported');
import fetch from 'node-fetch';
debLog('STEP 2: fetch imported');
import cors from 'cors';
debLog('STEP 3: cors imported');
import multer from 'multer';
debLog('STEP 4: multer imported');
import path from 'path';
debLog('STEP 5: path imported');
import { fileURLToPath } from 'url';
debLog('STEP 6: url imported');
import OpenAI from 'openai';
debLog('STEP 7: openai imported');
import { MercadoPagoConfig, Preference } from 'mercadopago';
debLog('STEP 8: mercadopago imported');

const pdfParser = require('pdf-parse');
debLog('STEP 9: pdf-parse imported via require');

import bcrypt from 'bcryptjs';
debLog('STEP 10: bcryptjs imported');
import cookieParser from 'cookie-parser';
debLog('STEP 11: cookieParser imported');
import jwt from 'jsonwebtoken';
debLog('STEP 12: jwt imported');
import helmet from 'helmet';
debLog('STEP 13: helmet imported');
import rateLimit from 'express-rate-limit';
debLog('STEP 14: rateLimit imported');

import dotenv from 'dotenv';
dotenv.config();
debLog('STEP 15: dotenv configured');

import pg from 'pg';
const { Pool } = pg;
debLog('STEP 16: pg imported');

const app = express();
debLog('STEP 17: Express app created');

// ... Continue with minimal setup to see if it even gets here ...

app.get('/api/health', (req, res) => res.send('OK'));
debLog('STEP 18: Health route added');

const PORT = 3001; // Use a different port to be safe
app.listen(PORT, () => {
    debLog('STEP 19: Server listening on port ' + PORT);
});
