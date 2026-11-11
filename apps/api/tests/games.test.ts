import { beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createDb, creditCoins } from '@zerolax/db';
import { GAME_IDS, GAME_OPERATIONS, gameAvailableForGrade, type GameId, type GameLevel, type GameSession } from '@zerolax/shared';
import { generateGameQuestion } from '../src/services/games';
import { createTestContext, createTestUser, loginAs, authHeader, type TestContext } from './helpers';
let ctx: TestContext;
let headers: ReturnType<typeof authHeader>;
let admin: ReturnType<typeof authHeader>;
let other: ReturnType<typeof authHeader>;
let userId: string;
let clientIndex=0;
let requestIp="192.0.2.1";
beforeAll(async()=>{
 ctx=await createTestContext();
 const v=await createTestUser(ctx.db);other=authHeader((await loginAs(ctx.app,v.telegramId)).accessToken);
 const r=await ctx.app.inject({method:'POST',url:'/api/admin/auth/login',payload:{email:'admin@zerolax.test',password:'test-admin-password'}});admin=authHeader(r.json().accessToken);
});
beforeEach(async()=>{
 requestIp=`192.0.2.${++clientIndex}`;
 const u=await createTestUser(ctx.db);userId=u.id;headers=authHeader((await loginAs(ctx.app,u.telegramId)).accessToken);
 await ctx.db.query(`update mini_games set enabled=true,questions_per_round=10,rewards='{"correct":1,"completion":2,"perfect":3,"dailyCap":100}' where archived_at is null`);
});
afterAll(async()=>ctx?.close());
const call=(method:'GET'|'POST'|'PUT',path:string,payload?:object,h=headers)=>ctx.app.inject({method,url:'/api/games/user'+path,headers:h,payload,remoteAddress:requestIp});
const manage=(method:'GET'|'PUT',path:string,payload?:object,h=admin)=>ctx.app.inject({method,url:'/api/games/admin'+path,headers:h,payload});
async function start(gameId:GameId='find-answer',grade=1){const r=await call('POST','/start',{gameId,grade});expect(r.statusCode,r.body).toBe(200);return r.json<GameSession>();}
async function solution(s:GameSession){const [q]=await ctx.db.query<{solution:number}>('select solution from mini_game_questions where id=$1',[s.question!.id]);return q.solution;}
async function answer(s:GameSession,value?:number){const r=await call('POST',`/sessions/${s.id}/answer`,{questionId:s.question!.id,answer:{value:value??await solution(s)}});expect(r.statusCode,r.body).toBe(200);return r.json<GameSession>();}

it('archives old definitions and exposes only the four new games',async()=>{
 const list=(await call('GET','/')).json();expect(list.map((g:{id:string})=>g.id)).toEqual([...GAME_IDS]);
 const archive=await manage('GET','/archive');expect(archive.statusCode).toBe(200);expect(archive.json().definitions).toHaveLength(4);expect(archive.json().definitions.every((g:{enabled:boolean;archived_at:string})=>!g.enabled&&g.archived_at)).toBe(true);
 expect((await call('POST','/start',{gameId:'addition',grade:1})).statusCode).toBe(400);
 expect((await call('PUT','/sessions/00000000-0000-4000-8000-000000000000/progress',{})).statusCode).toBe(404);
 expect((await manage('GET','/archive',undefined,headers)).statusCode).toBe(401);
});
it('makes historical sessions and answers readable only through the authorized archive',async()=>{
 const [old]=await ctx.db.query<{id:string}>(`insert into mini_game_sessions(user_id,game_id,grade,difficulty,status,settings,total,correct_count,answered_count,score) values($1,'addition',1,'normal','completed','{}',1,1,1,100) returning id`,[userId]);
 await ctx.db.query(`insert into mini_game_questions(session_id,position,payload,solution,answer,correct,answered_at) values($1,0,'{"game":"addition","a":2,"b":2,"c":0}',4,'{"value":4}',true,now())`,[old.id]);
 expect((await call('GET',`/sessions/${old.id}`)).statusCode).toBe(410);
 expect((await call('GET','/history')).json()).toHaveLength(0);
 const record=await manage('GET',`/archive/sessions/${old.id}`);
 expect(record.statusCode,record.body).toBe(200);expect(record.json().session.score).toBe(100);expect(record.json().questions[0].answer.value).toBe(4);
 expect((await manage('GET',`/archive/sessions/${old.id}`,undefined,headers)).statusCode).toBe(401);
});
it('generates bounded exact arithmetic and three distinct persisted choices across all grades',async()=>{
 const levels=await ctx.db.query<{game_id:GameId;config:GameLevel}>('select l.game_id,l.config from mini_game_levels l join mini_games g on g.id=l.game_id where g.archived_at is null');expect(levels).toHaveLength(20);
 for(const {game_id,config} of levels)for(const difficulty of ['easy','normal','hard'] as const)for(let i=0;i<50;i++){
  const {payload:p,solution:s,remainder}=generateGameQuestion(game_id,config,difficulty);const op=GAME_OPERATIONS[game_id];
  expect(new Set(p.choices).size).toBe(3);expect(p.choices).toContain(s);expect(p.choices.every(n=>Number.isInteger(n)&&n>=0)).toBe(true);
  expect(Math.max(p.a,p.b,p.c,s)).toBeLessThanOrEqual(config.maxValue);expect(s).toBeGreaterThanOrEqual(0);
  expect(s).toBe(op==='addition'?p.a+p.b+p.c:op==='subtraction'?p.a-p.b-p.c:op==='multiplication'?p.a*p.b+p.c:p.a/p.b);
  expect(remainder).toBe(0);if(config.grade<4)expect(p.c).toBe(0);
 }
});
it('enforces curriculum grades even if a client bypasses the game cards',async()=>{
 for(const gameId of GAME_IDS)for(let grade=1;grade<=5;grade++){
  const r=await call('POST','/start',{gameId,grade});expect(r.statusCode,r.body).toBe(gameAvailableForGrade(gameId,grade)?200:403);
  if(r.statusCode===200)await call('POST',`/sessions/${r.json().id}/abandon`,{});
 }
 expect((await call('POST','/start',{gameId:'find-answer',grade:6})).statusCode).toBe(400);
 expect((await call('POST','/start',{gameId:'find-answer',grade:1,difficulty:'hard'})).statusCode).toBe(400);
});
it('protects ownership, order, pause, incomplete completion and forged score fields',async()=>{
 let s=await start();expect(s.total).toBe(10);expect(s.question).not.toHaveProperty('solution');expect(s.question).not.toHaveProperty('visual');expect((await start()).id).toBe(s.id);
 expect((await call('GET',`/sessions/${s.id}`,undefined,other)).statusCode).toBe(404);
 expect((await call('POST',`/sessions/${s.id}/complete`,{})).statusCode).toBe(409);expect((await call('POST',`/sessions/${s.id}/next`,{})).statusCode).toBe(409);
 expect((await call('POST',`/sessions/${s.id}/answer`,{questionId:s.question!.id,answer:{value:999999}})).statusCode).toBe(400);
 expect((await call('POST',`/sessions/${s.id}/answer`,{questionId:s.question!.id,answer:{value:await solution(s)},score:100})).statusCode).toBe(400);
 await call('POST',`/sessions/${s.id}/pause`,{});expect((await call('GET','/active')).json().status).toBe('paused');
 expect((await call('POST',`/sessions/${s.id}/answer`,{questionId:s.question!.id,answer:{value:await solution(s)}})).statusCode).toBe(409);
 s=(await call('POST',`/sessions/${s.id}/resume`,{})).json();expect(s.status).toBe('playing');
});
it('completes ten questions with server grading and credits only once under retries',async()=>{
 let s=await start('how-many',3);
 for(let i=0;i<10;i++){
  const id=s.question!.id;s=await answer(s);expect(s.feedback?.correct).toBe(true);
  const retried=await call('POST',`/sessions/${s.id}/answer`,{questionId:id,answer:{value:s.question!.choices.find(v=>v!==s.feedback!.solution)!}});expect(retried.json().feedback.correct).toBe(true);
  if(i<9){expect(s.coins).toBe(0);s=(await call('POST',`/sessions/${s.id}/next`,{})).json();}
 }
 expect(s.status).toBe('completed');expect(s.correct).toBe(10);expect(s.score).toBe(100);expect(s.coins).toBe(15);expect(s.review).toHaveLength(10);
 await Promise.all([call('POST',`/sessions/${s.id}/complete`,{}),call('POST',`/sessions/${s.id}/complete`,{})]);
 const [ledger]=await ctx.db.query<{n:number}>('select count(*)::int n from coin_transactions where source_id=$1',[s.id]);expect(ledger.n).toBe(1);
 const [p]=await ctx.db.query<{completed_rounds:number}>('select completed_rounds from mini_game_progress where user_id=$1 and game_id=$2',[userId,'how-many']);expect(p.completed_rounds).toBe(1);
 expect((await call('GET','/history')).json().some((r:{id:string})=>r.id===s.id)).toBe(true);
});
it('uses single-choice exact division and retains the first wrong answer on correction',async()=>{
 await ctx.db.query("update mini_games set questions_per_round=1 where id='share-equally'");let s=await start('share-equally',3);const correct=await solution(s);s=await answer(s,s.question!.choices.find(v=>v!==correct));expect(s.score).toBe(0);expect(s.feedback?.solution).toBe(correct);
 s=await answer(s,correct);expect(s.score).toBe(0);expect(s.correct).toBe(0);
 s=await start('share-equally',5);s=await answer(s);expect(s.score).toBe(100);expect(s.coins).toBe(6);
});
it('finishes ten-question rounds for every supported game and grade from 1 through 5',async()=>{
 for(const gameId of GAME_IDS)for(let grade=1;grade<=5;grade++){
  if(!gameAvailableForGrade(gameId,grade))continue;
  requestIp=`198.51.100.${GAME_IDS.indexOf(gameId)*5+grade}`;
  let s=await start(gameId,grade);
  for(let index=0;index<10;index++){
   s=await answer(s);
   if(index<9)s=(await call('POST',`/sessions/${s.id}/next`,{})).json();
  }
  expect(s.status).toBe('completed');expect(s.correct).toBe(10);expect(s.score).toBe(100);expect(s.review).toHaveLength(10);
 }
});
it('enforces disabled games and the shared daily reward cap',async()=>{
 await ctx.db.query("update mini_games set enabled=false where id='find-answer'");expect((await call('POST','/start',{gameId:'find-answer',grade:1})).statusCode).toBe(403);
 await ctx.db.query(`update mini_games set enabled=true,questions_per_round=1,rewards='{"correct":1,"completion":2,"perfect":3,"dailyCap":1}' where id='find-answer'`);
 let s=await answer(await start());expect(s.coins).toBe(1);s=await answer(await start());expect(s.coins).toBe(0);
});
it('lets an existing round finish its saved settings after an admin disables new starts',async()=>{
 await ctx.db.query("update mini_games set questions_per_round=1 where id='find-answer'");
 let s=await start();
 await ctx.db.query("update mini_games set enabled=false,rewards='{}' where id='find-answer'");
 await call('POST',`/sessions/${s.id}/pause`,{});
 const resumed=await call('POST',`/sessions/${s.id}/resume`,{});expect(resumed.statusCode,resumed.body).toBe(200);
 s=await answer(resumed.json());expect(s.score).toBe(100);expect(s.coins).toBe(6);
 expect((await call('POST','/start',{gameId:'find-answer',grade:1})).statusCode).toBe(403);
});
it('persists admin ranges, difficulty, rounds and rewards with audits and grade guards',async()=>{
 const catalog=(await manage('GET','/')).json();const def=catalog.definitions.find((g:{id:string})=>g.id==='find-answer');
 expect((await manage('PUT','/find-answer',{...def,questionsPerRound:3})).statusCode).toBe(200);
 const level=catalog.levels.find((l:{game_id:string;grade:number})=>l.game_id==='find-answer'&&l.grade===1).config;
 expect((await manage('PUT','/find-answer/levels/1',{...level,maxValue:100})).statusCode).toBe(400);
 expect((await manage('PUT','/find-answer/levels/1',{...level,difficulty:'easy'})).statusCode).toBe(200);
 const disabled=catalog.levels.find((l:{game_id:string;grade:number})=>l.game_id==='how-many'&&l.grade===1).config;
 expect((await manage('PUT','/how-many/levels/1',{...disabled,enabled:true})).statusCode).toBe(400);
 const s=await start();expect(s.total).toBe(3);expect(s.difficulty).toBe('easy');expect((await manage('GET','/analytics')).json().games).toHaveLength(4);
 const [a]=await ctx.db.query<{n:number}>("select count(*)::int n from admin_audit_logs where action like 'games.%'");expect(a.n).toBeGreaterThanOrEqual(2);
});
it('keeps old completed scores, answers and coin transactions intact during migration',async()=>{
 const db=await createDb({memory:true});
 try{
  for(const name of ['0001_init','0002_rls','0003_notification_dedupe','0004_learning','0005_admin_control','0006_mini_games'])await db.exec(readFileSync(new URL(`../../../supabase/migrations/${name}.sql`,import.meta.url),'utf8'));
  const user=await createTestUser(db);
  const [old]=await db.query<{id:string}>(`insert into mini_game_sessions(user_id,game_id,grade,difficulty,status,settings,total,correct_count,answered_count,score,coins_earned) values($1,'addition',1,'normal','completed','{}',1,1,1,100,6) returning id`,[user.id]);
  await db.query(`insert into mini_game_questions(session_id,position,payload,solution,answer,correct,answered_at) values($1,0,'{"game":"addition","a":3,"b":2,"c":0}',5,'{"value":5}',true,now())`,[old.id]);
  await creditCoins(db,{userId:user.id,amount:6,type:'mini_game',sourceType:'mini_game',sourceId:old.id,idempotencyKey:'mini-game:'+old.id,description:'Historical round'});
  const [active]=await db.query<{id:string}>(`insert into mini_game_sessions(user_id,game_id,grade,difficulty,settings,total) values($1,'subtraction',1,'normal','{}',10) returning id`,[user.id]);
  await db.exec(readFileSync(new URL('../../../supabase/migrations/0008_simple_games.sql',import.meta.url),'utf8'));
  const [saved]=await db.query<{score:number;coins_earned:number;status:string}>('select score,coins_earned,status from mini_game_sessions where id=$1',[old.id]);expect(saved).toEqual({score:100,coins_earned:6,status:'completed'});
  expect((await db.query<{status:string}>('select status from mini_game_sessions where id=$1',[active.id]))[0].status).toBe('abandoned');
  expect((await db.query('select * from mini_game_questions where session_id=$1',[old.id]))).toHaveLength(1);expect((await db.query('select * from coin_transactions where source_id=$1',[old.id]))).toHaveLength(1);
 }finally{await db.close();}
});
