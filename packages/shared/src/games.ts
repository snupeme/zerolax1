import { z } from 'zod';
export const GAME_IDS = ['find-answer', 'what-remains', 'how-many', 'share-equally'] as const;
export type GameId = typeof GAME_IDS[number];
export const GAME_OPERATIONS = { 'find-answer': 'addition', 'what-remains': 'subtraction', 'how-many': 'multiplication', 'share-equally': 'division' } as const;
export type GameOperation = typeof GAME_OPERATIONS[GameId];
export function gameAvailableForGrade(game: GameId, grade: number) { return grade >= (game === 'share-equally' ? 3 : game === 'how-many' ? 2 : 1); }
export const gameDifficultySchema = z.enum(['easy', 'normal', 'hard']);
export type GameDifficulty = z.infer<typeof gameDifficultySchema>;
export const gameRewardsSchema = z.object({ correct:z.number().int().min(0).max(100),completion:z.number().int().min(0).max(100),perfect:z.number().int().min(0).max(100),dailyCap:z.number().int().min(0).max(10000) });
const translations = z.object({uz:z.string().trim().min(1).max(100),ru:z.string().trim().min(1).max(100),en:z.string().trim().min(1).max(100)});
export const gameDefinitionSchema = z.object({enabled:z.boolean(),titles:translations,descriptions:z.object({uz:z.string().trim().min(1).max(1000),ru:z.string().trim().min(1).max(1000),en:z.string().trim().min(1).max(1000)}),illustrationUrl:z.string().max(500).default(''),questionsPerRound:z.number().int().min(1).max(30),rewards:gameRewardsSchema});
export const gameLevelSchema = z.object({grade:z.number().int().min(1).max(5),enabled:z.boolean(),minValue:z.number().int().min(0).max(99998),maxValue:z.number().int().min(4).max(100000),maxGroups:z.number().int().min(2).max(12),maxPerGroup:z.number().int().min(1).max(100),multiStep:z.boolean(),difficulty:gameDifficultySchema}).superRefine((c,ctx)=>{
 if(c.maxValue>[0,20,100,1000,10000,100000][c.grade]||c.maxValue<c.minValue+2)ctx.addIssue({code:'custom',message:'Number range must fit the grade and contain at least three values'});
 if(c.grade<4&&c.multiStep)ctx.addIssue({code:'custom',message:'Two-step questions start at grade 4'});
});
export type GameLevel = z.infer<typeof gameLevelSchema>;
export type GameDefinition = z.infer<typeof gameDefinitionSchema> & {id:GameId};
export interface GameQuestion {id:string;position:number;game:GameId;a:number;b:number;c:number;choices:number[]}
export interface GameAnswer {value:number}
export const gameAnswerSchema=z.object({questionId:z.string().uuid(),answer:z.object({value:z.number().int().min(0).max(1000000)}).strict()}).strict();
export interface GameFeedback {correct:boolean;solution:number;answer:GameAnswer}
export interface GameSession {id:string;gameId:GameId;grade:number;difficulty:GameDifficulty;status:'playing'|'paused'|'completed'|'abandoned';total:number;currentIndex:number;answered:number;correct:number;score:number;coins:number;elapsedMs:number;activeSince:string|null;question:GameQuestion|null;feedback:GameFeedback|null;review?:Array<{question:GameQuestion;feedback:GameFeedback}>}
export interface GameCatalogEntry extends GameDefinition {levels:GameLevel[];bestScore:number;completedRounds:number;accuracy:number}
