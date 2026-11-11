import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Calculator, Shapes, GraduationCap, Globe2, Gamepad2, Brain, BookOpen, ArrowRight } from 'lucide-react';
import type { GameCatalogEntry } from '@zerolax/shared';
import { PageHeader } from '../components/PageHeader';
import { useExamWords } from '../lib/exams';
import { useStudyBack } from '../lib/study';
import { gameRequest } from '../lib/games';

export function ExamsPage(){
 const w=useExamWords();const back=useStudyBack('/',true);
 const games=useQuery({queryKey:['games-catalog'],queryFn:()=>gameRequest<GameCatalogEntry[]>('/')});
 const gameCount=games.data?.filter(g=>g.enabled&&g.levels.some(l=>l.enabled)).length;
 const categories=[
  {to:'/algebra',title:w.algebra,text:w.algebraText,icon:Calculator},
  {to:'/geometry',title:w.geometry,text:w.geometryText,icon:Shapes},
  {to:'/entrance?category=dtm',title:w.dtm,text:w.dtmText,icon:GraduationCap},
  {to:'/entrance?category=sat',title:w.sat,text:w.satText,icon:Globe2},
  {to:'/exams/games',title:w.games,text:w.gamesText,icon:Gamepad2,isGames:true},
  {to:'/iq',title:w.iq,text:w.iqText,icon:Brain},
  {to:'/entrance',title:w.entrance,text:w.entranceText,icon:BookOpen},
 ];
 return <div className="animate-fade-in space-y-5"><PageHeader title={w.title} subtitle={w.subtitle} backTo="/" onBack={back}/><div className="grid gap-3 sm:grid-cols-2">{categories.map(category=><Link key={category.to} to={category.to} className="pressable flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-soft focus-visible:outline focus-visible:outline-primary"><category.icon className="h-7 w-7 text-primary" aria-hidden/><h2 className="font-display text-lg font-extrabold">{category.title}</h2><p className="flex-1 text-sm text-muted-foreground">{category.text}</p>{category.isGames&&<p className="text-sm font-semibold" aria-live="polite">{games.isError?w.countError:`${w.available}: ${gameCount??'…'}`}</p>}<span className="inline-flex items-center gap-2 self-start rounded-lg bg-primary px-4 py-2 font-bold text-primary-foreground">{w.open}<ArrowRight className="h-4 w-4" aria-hidden/></span></Link>)}</div></div>;
}
