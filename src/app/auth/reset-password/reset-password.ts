import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthApi } from '../auth-api';
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  readProblem,
  resetMessage,
} from '../auth-messages';
import { readFragmentToken } from '../fragment-token';

/** Landing page of the reset mail: `/reset-hasla#token=...`. */
@Component({
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './reset-password.html',
})
export class ResetPassword implements OnInit {
  private readonly api = inject(AuthApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);

  private token: string | null = null;

  protected readonly minLength = MIN_PASSWORD_LENGTH;
  protected readonly form = this.formBuilder.nonNullable.group({
    password: [
      '',
      [
        Validators.required,
        Validators.minLength(MIN_PASSWORD_LENGTH),
        Validators.maxLength(MAX_PASSWORD_LENGTH),
      ],
    ],
  });

  protected readonly submitting = signal(false);
  protected readonly done = signal(false);
  /** No usable token in the link, or the API refused it. */
  protected readonly linkInvalid = signal(false);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.token = readFragmentToken(this.route.snapshot.fragment);
    // Keep the one-time token out of the address bar and the history entry.
    void this.router.navigate([], { relativeTo: this.route, replaceUrl: true });
    if (this.token === null) this.linkInvalid.set(true);
  }

  protected submit(): void {
    if (this.token === null) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.error.set(null);
    this.submitting.set(true);
    this.api.resetPassword(this.token, this.form.getRawValue().password).subscribe({
      next: () => {
        this.submitting.set(false);
        this.token = null;
        this.form.reset();
        this.done.set(true);
      },
      error: (problem: unknown) => {
        this.submitting.set(false);
        const read = readProblem(problem);
        if (read.code === 'invalid_token') this.linkInvalid.set(true);
        else this.error.set(resetMessage(read));
      },
    });
  }
}
