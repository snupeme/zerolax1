import { afterAll, beforeAll, expect, it } from 'vitest';
import { decodeJwt } from 'jose';
import { authHeader, createTestContext, createTestUser, loginAs, signTelegramInitData, type TestContext } from './helpers';
import { signAdminAccessToken } from '../src/auth/tokens';

const token='123456:PRIVACY-TEST-TOKEN';
const identity={id:7788991122,username:'private_handle_123',first_name:'SecretFirst',last_name:'SecretLast'};
const privateValues=[String(identity.id),identity.username,identity.first_name,identity.last_name];
const forbiddenKeys=new Set(['telegramId','telegram_id','telegramUserId','telegram_user_id','telegram_username','username','firstName','lastName','first_name','last_name','initData','auth_date','tg','isDev','is_dev']);
let ctx:TestContext;let userId:string;let student:ReturnType<typeof authHeader>;let root:ReturnType<typeof authHeader>;let reader:ReturnType<typeof authHeader>;let permitted:ReturnType<typeof authHeader>;let noRead:ReturnType<typeof authHeader>;
function assertNoIdentity(value:unknown){
 const text=JSON.stringify(value);for(const secret of privateValues)expect(text).not.toContain(secret);
 function walk(v:unknown){if(Array.isArray(v)){v.forEach(walk);return}if(v&&typeof v==='object')for(const [key,item] of Object.entries(v)){expect(forbiddenKeys.has(key),key).toBe(false);walk(item)}}walk(value);
}
const get=(url:string,headers=student)=>ctx.app.inject({url,headers});
beforeAll(async()=>{
 ctx=await createTestContext({TELEGRAM_BOT_TOKEN:token});
 const user=await createTestUser(ctx.db,{telegramId:String(identity.id),nickname:'Student Alias'});userId=user.id;
 await ctx.db.query('update profiles set telegram_username=$2,first_name=$3,last_name=$4,is_dev=false where id=$1',[userId,identity.username,identity.first_name,identity.last_name]);
 student=authHeader((await loginAs(ctx.app,String(identity.id))).accessToken);
 const login=await ctx.app.inject({method:'POST',url:'/api/admin/auth/login',payload:{email:'admin@zerolax.test',password:'test-admin-password'}});root=authHeader(login.json().accessToken);
 async function staff(key:string,permissions:string[]){await ctx.db.query('insert into admin_roles(key,name,permissions) values($1,$1,$2)',[key,JSON.stringify(permissions)]);const [a]=await ctx.db.query<{id:string;email:string;role:string}>("insert into admin_users(email,name,password_hash,role) values($1,$2,'unused',$2) returning id,email,role",[key+'@test.local',key]);return authHeader(await signAdminAccessToken(ctx.config,a));}
 const common=['users.read','users.write','reports.read','reports.export','audit.read','notifications.read'];
 reader=await staff('privacy_reader',common);permitted=await staff('privacy_allowed',[...common,'users.private']);noRead=await staff('privacy_only',['users.private']);
 await ctx.db.query("insert into admin_audit_logs(action,entity_id,details) values('privacy.test',$1,$2)",[userId,JSON.stringify({before:{first_name:identity.first_name,last_name:identity.last_name},telegramId:String(identity.id),nested:[{username:identity.username}],safe:'retained'})]);
 await ctx.db.query("insert into telegram_notification_logs(user_id,telegram_id,kind,status,error) values($1,$2,'system','failed',$3)",[userId,String(identity.id),'Telegram delivery failed for '+identity.id]);
});
afterAll(async()=>ctx?.close());
it('never sends Telegram identity in dev login, Telegram login, refresh, me or profile updates',async()=>{
 const dev=await ctx.app.inject({method:'POST',url:'/api/auth/dev',payload:{telegramId:String(identity.id)}});expect(dev.statusCode).toBe(200);assertNoIdentity(dev.json().profile);assertNoIdentity(decodeJwt(dev.json().accessToken));
 const signed=signTelegramInitData(token,identity,Math.floor(Date.now()/1000));
 const telegram=await ctx.app.inject({method:'POST',url:'/api/auth/telegram',payload:{initData:signed}});expect(telegram.statusCode,telegram.body).toBe(200);assertNoIdentity(telegram.json().profile);assertNoIdentity(decodeJwt(telegram.json().accessToken));
 const refresh=await ctx.app.inject({method:'POST',url:'/api/auth/refresh',payload:{refreshToken:telegram.json().refreshToken}});expect(refresh.statusCode).toBe(200);assertNoIdentity(refresh.json().profile);assertNoIdentity(decodeJwt(refresh.json().accessToken));
 const me=await get('/api/user/me',authHeader(refresh.json().accessToken));expect(me.statusCode).toBe(200);assertNoIdentity(me.json());expect(me.json().profile.nickname).toBe('Student Alias');
 const edit=await ctx.app.inject({method:'PATCH',url:'/api/user/me',headers:student,payload:{language:'uz',telegramId:'9999999999',username:'forged'}});expect(edit.statusCode).toBe(200);assertNoIdentity(edit.json());
});
it('requires both a valid admin session and users.read + users.private for identity lookup',async()=>{
 const url=`/api/admin/users/${userId}/telegram`;
 expect((await ctx.app.inject({url})).statusCode).toBe(401);expect((await get(url,student)).statusCode).toBe(401);expect((await get(url,reader)).statusCode).toBe(403);expect((await get(url,noRead)).statusCode).toBe(403);
 for(const headers of [root,permitted]){const r=await get(url,headers);expect(r.statusCode,r.body).toBe(200);expect(r.json()).toEqual({telegramId:String(identity.id),username:identity.username,firstName:identity.first_name,lastName:identity.last_name,linked:true});}
});
it('redacts legacy and control lists, nested audit/details, delivery logs and CSV exports for readers',async()=>{
 for(const url of ['/api/admin/users','/api/admin/control/users',`/api/admin/users/${userId}`,`/api/admin/control/users/${userId}/details`,'/api/admin/audit','/api/admin/logs','/api/admin/control/reports/users']){const r=await get(url,reader);expect(r.statusCode,url+' '+r.body).toBe(200);assertNoIdentity(r.json());}
 const csv=await get('/api/admin/control/reports/users?format=csv',reader);expect(csv.statusCode,csv.body).toBe(200);for(const value of [...privateValues,'telegram_id','telegram_username'])expect(csv.body).not.toContain(value);
 const adminCsv=await get('/api/admin/control/reports/users?format=csv',permitted);expect(adminCsv.statusCode).toBe(200);expect(adminCsv.body).toContain(String(identity.id));expect(adminCsv.body).toContain(identity.username);
});
it('does not let unprivileged staff infer identities through Telegram-ID or name search',async()=>{
 for(const search of [String(identity.id),identity.username,identity.first_name]){const encoded=encodeURIComponent(search);for(const base of ['/api/admin/users','/api/admin/control/users']){const r=await get(base+'?search='+encoded,reader);expect(r.statusCode).toBe(200);expect(r.json().total).toBe(0);}}
 expect((await get('/api/admin/users?search='+identity.id,permitted)).json().total).toBe(1);
});
it('prevents staff without private permission from overwriting Telegram names',async()=>{
 const payload={fullName:'Learning Student',grade:7,age:12,city:'',district:''};
 const forbidden=await ctx.app.inject({method:'PATCH',url:`/api/admin/control/users/${userId}`,headers:reader,payload:{...payload,firstName:'forged',lastName:'forged'}});expect(forbidden.statusCode).toBe(403);
 const allowed=await ctx.app.inject({method:'PATCH',url:`/api/admin/control/users/${userId}`,headers:reader,payload});expect(allowed.statusCode,allowed.body).toBe(200);
 const result=await get(`/api/admin/users/${userId}/telegram`,permitted);expect(result.json().firstName).toBe(identity.first_name);expect(result.json().lastName).toBe(identity.last_name);
});
it('enforces permission revocation on the next direct API request',async()=>{
 await ctx.db.query("update admin_roles set permissions=permissions-'users.private' where key='privacy_allowed'");
 expect((await get(`/api/admin/users/${userId}/telegram`,permitted)).statusCode).toBe(403);
 const list=await get('/api/admin/users',permitted);expect(list.statusCode).toBe(200);assertNoIdentity(list.json());
});
it('keeps signed initData validation and internal bot access intact without deleting identity',async()=>{
 const signed=signTelegramInitData(token,identity,Math.floor(Date.now()/1000));const bad=await ctx.app.inject({method:'POST',url:'/api/auth/telegram',payload:{initData:signed.replace('SecretFirst','Tampered')}});expect(bad.statusCode).toBe(401);
 const expired=await ctx.app.inject({method:'POST',url:'/api/auth/telegram',payload:{initData:signTelegramInitData(token,identity,Math.floor(Date.now()/1000)-3600)}});expect(expired.statusCode).toBe(401);
 const [stored]=await ctx.db.query<{telegram_id:string;telegram_username:string;first_name:string;last_name:string}>('select telegram_id::text,telegram_username,first_name,last_name from profiles where id=$1',[userId]);expect(stored).toEqual({telegram_id:String(identity.id),telegram_username:identity.username,first_name:identity.first_name,last_name:identity.last_name});
 const internal=await ctx.app.inject({url:`/api/internal/bot/users/${identity.id}`,headers:{'x-bot-secret':token}});expect(internal.statusCode,internal.body).toBe(200);expect(internal.body).toContain(String(identity.id));
 expect((await get(`/api/internal/bot/users/${identity.id}`)).statusCode).toBe(401);
});
