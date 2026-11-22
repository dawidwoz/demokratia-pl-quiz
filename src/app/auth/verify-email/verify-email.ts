import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthApi } from '../auth-api';
import { readProblem } from '../auth-messages';
import { readFragmentToken } from '../fragment-token';

type State = 'loading' | 'ok' | 'invalid' | 'error';

/** Landing page of the verification mail: `/weryfikacja#token=...`. */
@Component({
  selector: 'app-verify-email',
  imports: [RouterLink],
  templateUrl: './verify-email.html',
})
export class VerifyEmail implements OnInit {
  private readonly api = inject(AuthApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly state = signal<State>('loading');

  ngOnInit(): void {
    const token = readFragmentToken(this.route.snapshot.fragment);
    // The one-time token must not stay in the address bar or the history entry.
    void this.router.navigate([], { relativeTo: this.route, replaceUrl: true });
    if (token === null) {
      this.state.set('invalid');
      return;
    }
    this.api
      .verifyEmail(token)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.state.set('ok'),
        error: (problem: unknown) =>
          this.state.set(readProblem(problem).code === 'invalid_token' ? 'invalid' : 'error'),
      });
  }
}
