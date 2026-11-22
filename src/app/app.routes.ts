import { Routes } from '@angular/router';

import { ForgotPassword } from './auth/forgot-password/forgot-password';
import { Login } from './auth/login/login';
import { Register } from './auth/register/register';
import { ResetPassword } from './auth/reset-password/reset-password';
import { VerifyEmail } from './auth/verify-email/verify-email';
import { QuizList } from './quiz-list/quiz-list';
import { QuizRun } from './quiz-run/quiz-run';

export const routes: Routes = [
  { path: '', component: QuizList, title: 'Z kim mi po drodze' },
  { path: 'quiz/:id', component: QuizRun, title: 'Quiz | Z kim mi po drodze' },
  { path: 'rejestracja', component: Register, title: 'Rejestracja | Z kim mi po drodze' },
  { path: 'logowanie', component: Login, title: 'Logowanie | Z kim mi po drodze' },
  {
    path: 'weryfikacja',
    component: VerifyEmail,
    title: 'Potwierdzenie adresu | Z kim mi po drodze',
  },
  {
    path: 'zapomniane-haslo',
    component: ForgotPassword,
    title: 'Nie pamiętam hasła | Z kim mi po drodze',
  },
  { path: 'reset-hasla', component: ResetPassword, title: 'Nowe hasło | Z kim mi po drodze' },
  { path: '**', redirectTo: '' },
];
