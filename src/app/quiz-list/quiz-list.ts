import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { QuizApi } from '../quiz-api';
import { QuizSummary } from '../quiz.models';

@Component({
  selector: 'app-quiz-list',
  imports: [RouterLink],
  templateUrl: './quiz-list.html',
  styleUrl: './quiz-list.scss',
})
export class QuizList implements OnInit {
  private readonly api = inject(QuizApi);

  protected readonly quizzes = signal<QuizSummary[] | null>(null);
  protected readonly failed = signal(false);

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.failed.set(false);
    this.api.listQuizzes().subscribe({
      next: (quizzes) => this.quizzes.set(quizzes),
      error: () => this.failed.set(true),
    });
  }
}
