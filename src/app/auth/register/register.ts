import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthApi } from '../auth-api';
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  readProblem,
  registerMessage,
} from '../auth-messages';
import { AuthState } from '../auth-state';

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register.html',
})
export class Register {
  private readonly api = inject(AuthApi);
  private readonly formBuilder = inject(FormBuilder);
  protected readonly auth = inject(AuthState);

  protected readonly minLength = MIN_PASSWORD_LENGTH;
  protected readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: [
      '',
      [
        Validators.required,
        Validators.minLength(MIN_PASSWORD_LENGTH),
        Validators.maxLength(MAX_PASSWORD_LENGTH),
      ],
    ],
    acceptTerms: [false, Validators.requiredTrue],
  });

  protected readonly submitting = signal(false);
  /** The address the mail was requested for; set once the API answered 202. */
  protected readonly sentTo = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { email, password, acceptTerms } = this.form.getRawValue();
    this.error.set(null);
    this.submitting.set(true);
    this.api.register({ email: email.trim(), password, acceptTerms }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.sentTo.set(email.trim());
        // The password is not needed again; do not leave it sitting in the form.
        this.form.controls.password.reset('');
      },
      error: (problem: unknown) => {
        this.submitting.set(false);
        this.error.set(registerMessage(readProblem(problem)));
      },
    });
  }
}
