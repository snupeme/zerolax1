import { it } from 'vitest';
import { chromium, expect } from '@playwright/test';
import { SignJWT, decodeJwt } from 'jose';
import { preview } from 'vite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createTestContext, createTestUser, loginAs } from '../tests/helpers';
import { hashPassword } from '../src/services/admin';

it('hides identity in student UI/storage and protects the admin view when switching accounts',async()=>{
 const ctx=await createTestContext();let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;let web:Awaited<ReturnType<typeof preview>>|undefined;
 try{
  const u=await createTestUser(ctx.db,{telegramId:'7788991122',nickname:'Privacy Student'});
  const privateValues=['7788991122','private_handle_123','SecretFirst','SecretLast'];
  await ctx.db.query('update profiles set telegram_username=$2,first_name=$3,last_name=$4,is_dev=false where id=$1',[u.id,...privateValues.slice(1)]);
  const fresh=await loginAs(ctx.app,u.telegramId);
  const legacy=await new SignJWT({role:'user',tg:u.telegramId}).setProtectedHeader({alg:'HS256'}).setIssuer('zerolax').setAudience('zerolax-user').setSubject(u.id).setIssuedAt().setExpirationTime('15m').sign(new TextEncoder().encode(ctx.config.jwtSecret));
  const oldSession={...fresh,accessToken:legacy,profile:{...fresh.profile,telegramId:u.telegramId,username:privateValues[1],firstName:privateValues[2],lastName:privateValues[3],isDev:false}};
  const permissions=['users.read','users.write','analytics.read'];
  await ctx.db.query("insert into admin_roles(key,name,permissions) values('privacy_ui_reader','Privacy reader',$1)",[JSON.stringify(permissions)]);
  await ctx.db.query("insert into admin_users(email,name,password_hash,role) values('privacy-reader@test.local','Privacy reader',$1,'privacy_ui_reader')",[hashPassword('privacy-test-password')]);
  await ctx.app.listen({host:'127.0.0.1',port:4109});
  web=await preview({configFile:false,root:resolve('apps/web'),preview:{host:'127.0.0.1',port:4189,strictPort:true,proxy:{'/api':'http://127.0.0.1:4109'}}});
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH??['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync),headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}});const errors:string[]=[];const pending:Array<Promise<void>>=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://telegram.org/js/telegram-web-app.js',r=>r.fulfill({contentType:'application/javascript',body:'// SDK not needed for stored-session browser test'}));
  let identityRequests=0;
  page.on('request',r=>{if(/\/users\/[^/]+\/telegram$/.test(new URL(r.url()).pathname))identityRequests++});
  page.on('response',r=>{
   const path=new URL(r.url()).pathname;
   if(r.ok()&&['/api/user/me','/api/auth/refresh','/api/auth/dev','/api/auth/telegram'].includes(path))pending.push(r.json().then(data=>{
    const text=JSON.stringify(data.profile);for(const value of privateValues)expect(text).not.toContain(value);
    if(data.accessToken)expect(decodeJwt(data.accessToken)).not.toHaveProperty('tg');
   }));
  });
  await page.addInitScript(s=>{if(!localStorage.getItem('zerolax.session.v1'))localStorage.setItem('zerolax.session.v1',JSON.stringify(s));localStorage.setItem('zerolax.language','uz');},oldSession);
  const host='http://127.0.0.1:4189';
  await page.goto(host+'/profile');await expect(page.getByRole('heading',{name:'Profil ma’lumotlari',exact:true})).toBeVisible();
  for(const value of [...privateValues,'Telegram ID','Telegram username'])await expect(page.locator('main')).not.toContainText(value);
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('zerolax.session.v1')!));for(const key of ['telegramId','username','firstName','lastName','isDev'])expect(stored.profile).not.toHaveProperty(key);expect(decodeJwt(stored.accessToken)).not.toHaveProperty('tg');
  await page.screenshot({path:'.data/privacy-student-profile.png',fullPage:true});
  await page.goto(host+'/settings');await expect(page.locator('#nickname')).toBeVisible();for(const value of [...privateValues,'Telegram ID'])await expect(page.locator('main')).not.toContainText(value);
  await page.screenshot({path:'.data/privacy-student-settings.png',fullPage:true});
  await page.setViewportSize({width:1280,height:900});await page.goto(host+'/admin/login');
  await page.locator('#admin-email').fill('admin@zerolax.test');await page.locator('#admin-password').fill('test-admin-password');await page.locator('form button[type="submit"]').click();await page.waitForURL(url=>url.pathname==='/admin');
  await page.goto(host+'/admin/users/'+u.id);await expect(page.getByRole('heading',{name:'Telegram hisobi',exact:true})).toBeVisible();
  for(const value of privateValues)await expect(page.locator('main')).toContainText(value);
  await expect(page.locator('main')).toContainText('Bog‘langan');expect(identityRequests).toBeGreaterThan(0);await page.screenshot({path:'.data/privacy-admin-authorized.png',fullPage:true});
  // Logout and sign into a restricted account without reloading the application.
  await page.locator('aside button').filter({has:page.locator('svg.lucide-log-out')}).click();await page.waitForURL(url=>url.pathname==='/admin/login');
  await page.locator('#admin-email').fill('privacy-reader@test.local');await page.locator('#admin-password').fill('privacy-test-password');await page.locator('form button[type="submit"]').click();await page.waitForURL(url=>url.pathname==='/admin/users/'+u.id);
  const before=identityRequests;
  await expect(page.getByRole('heading',{name:'Privacy Student',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Telegram hisobi',exact:true})).toHaveCount(0);
  for(const value of privateValues)await expect(page.locator('main')).not.toContainText(value);
  expect(identityRequests).toBe(before);await page.screenshot({path:'.data/privacy-admin-restricted.png',fullPage:true});
  await Promise.all(pending);expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }finally{await browser?.close();await new Promise<void>(done=>web?web.httpServer.close(()=>done()):done());await ctx.close();}
},120000);
