import { Routes } from '@angular/router';

import { QuizList } from './quiz-list/quiz-list';
import { QuizRun } from './quiz-run/quiz-run';

export const routes: Routes = [
  { path: '', component: QuizList, title: 'Z kim mi po drodze' },
  { path: 'quiz/:id', component: QuizRun, title: 'Quiz | Z kim mi po drodze' },
  { path: '**', redirectTo: '' },
];
