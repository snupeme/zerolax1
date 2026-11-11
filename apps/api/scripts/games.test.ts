import { it } from 'vitest';
import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { GAME_IDS, GAME_OPERATIONS, gameAvailableForGrade, type GameId, type GameSession } from '@zerolax/shared';
import { createTestContext,createTestUser,loginAs,authHeader } from '../tests/helpers';

it('runs simple ten-question games, practice, correction, grades, saved results, archive and Telegram Back on Android widths',async()=>{
 const ctx=await createTestContext();let web:Awaited<ReturnType<typeof preview>>|undefined;let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
 try{
  const user=await createTestUser(ctx.db);const session=await loginAs(ctx.app,user.telegramId);
  await ctx.app.listen({host:'127.0.0.1',port:4109});
  web=await preview({configFile:false,root:resolve('apps/web'),preview:{host:'127.0.0.1',port:4189,strictPort:true,proxy:{'/api':'http://127.0.0.1:4109'}}});
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH??['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync),headless:true,args:['--disable-gpu']});
  const page=await browser.newPage({viewport:{width:360,height:800}});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://telegram.org/js/telegram-web-app.js',r=>r.fulfill({contentType:'text/javascript',body:`window.Telegram={WebApp:{initData:'',initDataUnsafe:{},version:'9.0',platform:'android',colorScheme:'light',ready(){},expand(){},enableClosingConfirmation(){},setHeaderColor(){},setBackgroundColor(){},onEvent(){},offEvent(){},BackButton:{show(){},hide(){},onClick(fn){window.__tgBackHandler=fn},offClick(fn){if(window.__tgBackHandler===fn)window.__tgBackHandler=null}}}};`}));
  await page.addInitScript(s=>{localStorage.setItem('zerolax.session.v1',JSON.stringify(s));localStorage.setItem('zerolax.language','uz');},session);
  const host='http://127.0.0.1:4189';
  await page.goto(host);
  await expect(page.locator('a[href="/exams/games"], a[href="/games"]')).toHaveCount(0);
  await page.locator('main a[href="/exams"]').first().click();
  await expect(page.getByRole('heading',{name:'Imtihonlar',exact:true})).toBeVisible();
  for(const href of ['/algebra','/geometry','/entrance?category=dtm','/entrance?category=sat','/iq','/entrance']) await expect(page.locator('main a[href="'+href+'"]')).toBeVisible();
  const category=page.locator('main a[href="/exams/games"]');
  await expect(category).toContainText('Mavjud o‘yinlar: 4');
  await page.screenshot({path:'.data/exams-categories-mobile.png',fullPage:true});
  await category.click();await expect(page).toHaveURL(host+'/exams/games');
  await page.reload();await expect(page.getByRole('heading',{name:'MATEMATIK MINI-O‘YINLAR',exact:true})).toBeVisible();
  await page.evaluate(()=>{(window as unknown as {__tgBackHandler:()=>void}).__tgBackHandler()});
  await expect(page).toHaveURL(host+'/exams');
  await page.locator('main a[href="/exams/games"]').click();
  for(let grade=1;grade<=5;grade++){
   await page.getByRole('button',{name:grade+'-Sinf',exact:true}).click();
   for(const id of GAME_IDS)await expect(page.locator(`a[href="/exams/games/${id}"]`)).toHaveCount(gameAvailableForGrade(id,grade)?1:0);
  }
  await page.screenshot({path:'.data/simple-games-catalog.png',fullPage:true});
  for(const [gameIndex,gameId] of GAME_IDS.entries()){
   const grade=[1,2,3,5][gameIndex];
   await page.goto(host+'/exams/games');await page.getByRole('button',{name:grade+'-Sinf',exact:true}).click();await page.locator(`a[href="/exams/games/${gameId}"]`).click();
   const start=page.getByRole('button',{name:'Tushundim, boshlash!',exact:true});await expect(start).toBeDisabled();
   const practiceCorrect=gameId==='find-answer'?5:gameId==='how-many'?6:3;
   await page.locator('.simple-answer').filter({hasText:new RegExp('^'+(practiceCorrect-1)+'$')}).click();await expect(page.getByText('Yana bir bor urinib ko‘r!',{exact:true})).toBeVisible();await expect(start).toBeDisabled();
   await page.locator('.simple-answer').filter({hasText:new RegExp('^'+practiceCorrect+'$')}).click();await expect(start).toBeEnabled();
   const starting=page.waitForResponse(r=>r.url().endsWith('/games/user/start'));await start.click();let s=await(await starting).json() as GameSession;expect(s.total).toBe(10);
   await expect(page.locator('.simple-answer')).toHaveCount(3);
   await expect(page.getByRole('spinbutton')).toHaveCount(0);await expect(page.locator('[draggable="true"]')).toHaveCount(0);
   if(gameIndex===0){await page.getByRole('button',{name:'Ovoz',exact:true}).click();await page.reload();await expect(page.getByRole('button',{name:'Ovoz',exact:true})).toHaveAttribute('aria-pressed','true');}
   for(let index=0;index<10;index++){
    const q=s.question!,op=GAME_OPERATIONS[q.game],solution=op==='addition'?q.a+q.b+q.c:op==='subtraction'?q.a-q.b-q.c:op==='multiplication'?q.a*q.b+q.c:q.a/q.b;
    const wrong=gameIndex===0&&index===0;
    const selected=wrong?q.choices.find(n=>n!==solution)!:solution;
    const answered=page.waitForResponse(r=>r.url().endsWith(`/sessions/${s.id}/answer`));
    await page.locator('.simple-answer').filter({hasText:new RegExp('^'+selected+'$')}).click();s=await(await answered).json();
    await expect(page.getByRole('status')).toContainText(wrong?'Yana bir bor urinib ko‘r!':'Barakalla! To‘g‘ri javob!');
    const next=page.getByRole('button',{name:index===9?'Natijalarni ko‘rish':'Keyingi savol',exact:true});
    if(wrong){await expect(next).toBeDisabled();await page.locator('.simple-answer').filter({hasText:new RegExp('^'+solution+'$')}).click();await expect(next).toBeEnabled();}
    if(index===3){await page.reload();await expect(page.getByRole('status')).toContainText('Barakalla! To‘g‘ri javob!');}
    if(index<9){const advanced=page.waitForResponse(r=>r.url().endsWith(`/sessions/${s.id}/next`));await next.click();s=await(await advanced).json();}else await next.click();
   }
   await expect(page.getByRole('heading',{name:'Barakalla, o‘yin tugadi!',exact:true})).toBeVisible();await expect(page.getByText(gameIndex===0?'90%':'100%',{exact:true})).toBeVisible();
   await page.reload();await expect(page.getByRole('heading',{name:'Barakalla, o‘yin tugadi!',exact:true})).toBeVisible();
   await page.goto(host+'/games/round/'+s.id);await expect(page).toHaveURL(host+'/exams/games/round/'+s.id);
   await expect(page.getByRole('heading',{name:'Barakalla, o‘yin tugadi!',exact:true})).toBeVisible();
   await page.getByRole('link',{name:/O‘yinlarga qaytish/}).click();await expect(page).toHaveURL(host+'/exams/games');
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await page.screenshot({path:'.data/simple-games-'+gameId+'-result.png',fullPage:true});
   const [ledger]=await ctx.db.query<{n:number}>('select count(*)::int n from coin_transactions where source_id=$1',[s.id]);expect(ledger.n).toBe(1);
  }
  const history=await ctx.app.inject({url:'/api/games/user/history',headers:authHeader(session.accessToken)});expect(history.statusCode,history.body).toBe(200);expect(history.json().filter((r:{status:string})=>r.status==='completed')).toHaveLength(4);
  await page.goto(host+'/exams/games/find-answer');await page.getByRole('button',{name:'O‘ynash',exact:true}).click();await expect(page.locator('.simple-answer')).toHaveCount(3);
  await page.evaluate(()=>{(window as unknown as {__tgBackHandler:()=>void}).__tgBackHandler()});await expect(page).toHaveURL(host+'/exams/games');
  const active=await ctx.app.inject({url:'/api/games/user/active',headers:authHeader(session.accessToken)});expect(active.json().status).toBe('paused');
  await page.goto(host+'/games/addition');await expect(page).toHaveURL(host+'/exams/games');await page.goto(host+'/games/play/'+active.json().id);await expect(page).toHaveURL(host+'/exams/games');
  await page.goto(host+'/exams/games/round/'+active.json().id);await page.getByRole('button',{name:'Davom etish',exact:true}).click();await expect(page.locator('.simple-answer')).toHaveCount(3);
  await page.emulateMedia({reducedMotion:'reduce'});expect(await page.locator('.simple-object').first().evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
  await page.screenshot({path:'.data/simple-games-question-360.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'.data/simple-games-question-desktop.png',fullPage:true});
  expect(errors).toEqual([]);
 }finally{await browser?.close();await new Promise<void>(done=>web?web.httpServer.close(()=>done()):done());await ctx.close();}
},240000);

// Independent context keeps configuration coverage separate from the high-volume
// four-round navigation scenario and the production per-IP rate-limit budget.
it('persists existing game admin configuration after the navigation move',async()=>{
 const ctx=await createTestContext();let web:Awaited<ReturnType<typeof preview>>|undefined;let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
 try{
  const login=await ctx.app.inject({method:'POST',url:'/api/admin/auth/login',payload:{email:'admin@zerolax.test',password:'test-admin-password'}});
  await ctx.app.listen({host:'127.0.0.1',port:4109});
  web=await preview({configFile:false,root:resolve('apps/web'),preview:{host:'127.0.0.1',port:4189,strictPort:true,proxy:{'/api':'http://127.0.0.1:4109'}}});
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH??['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync),headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:900}});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://telegram.org/js/telegram-web-app.js',r=>r.fulfill({contentType:'application/javascript',body:'// No Telegram launch data for admin browser scenario'}));
  await page.addInitScript(a=>{localStorage.setItem('zerolax.admin.v1',JSON.stringify(a));localStorage.setItem('zerolax.language','uz')},login.json());
  await page.goto('http://127.0.0.1:4189/admin/games');
  await expect(page.getByRole('heading',{name:'Eski o‘yinlar arxivi',exact:true})).toBeVisible();
  const rounds=page.getByLabel('Raunddagi savollar',{exact:true});await rounds.fill('3');
  const saved=page.waitForResponse(r=>r.url().endsWith('/api/games/admin/find-answer')&&r.request().method()==='PUT');
  await page.getByRole('button',{name:'Saqlash',exact:true}).first().click();const response=await saved;
  expect(response.status(),await response.text()).toBe(200);await page.reload();await expect(rounds).toHaveValue('3');expect(errors).toEqual([]);
 }finally{await browser?.close();await new Promise<void>(done=>web?web.httpServer.close(()=>done()):done());await ctx.close();}
},60000);
