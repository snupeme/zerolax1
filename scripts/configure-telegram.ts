import {readFileSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import dotenv from 'dotenv';
import {createDb,runMigrations} from '@zerolax/db';
import {hashPassword} from '../apps/api/src/services/admin';

const env=dotenv.parse(readFileSync('.env'));
const info=JSON.parse(readFileSync('.data/telegram-bot-info.json','utf8'));
const logs=readFileSync('.data/telegram-tunnel-error.log','utf8')+readFileSync('.data/telegram-tunnel.log','utf8');
const publicUrl=logs.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i)?.[0];
if(!publicUrl)throw new Error('Public tunnel address is not ready');
env.TELEGRAM_BOT_USERNAME=info.username;
env.TELEGRAM_WEBAPP_URL=publicUrl;
env.WEB_URL=publicUrl;
env.DEV_AUTH_ENABLED='false';
env.JWT_SECRET=randomBytes(48).toString('hex');
env.ADMIN_PASSWORD=randomBytes(18).toString('base64url');
// Preview and API remain on loopback; only the compiled web app is tunneled.
writeFileSync('.env',Object.entries(env).map(([key,value])=>key+'='+value).join('\n')+'\n');
const db=await createDb({pgliteDir:env.PGLITE_DIR});
try{
 await runMigrations(db);
 await db.query('update admin_users set password_hash=$2 where lower(email)=lower($1)',[env.ADMIN_EMAIL,hashPassword(env.ADMIN_PASSWORD)]);
}finally{await db.close();}
writeFileSync('.data/telegram-preview.json',JSON.stringify({publicUrl,hostname:new URL(publicUrl).hostname,username:info.username,previewPort:5180},null,2));
console.log(JSON.stringify({publicUrl,username:info.username,telegramAuthOnly:true}));
