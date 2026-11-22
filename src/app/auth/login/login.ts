import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthApi } from '../auth-api';
import { genericMessage, loginMessage, readProblem } from '../auth-messages';
import { AuthState } from '../auth-state';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.html',
})
export class Login {
  private readonly api = inject(AuthApi);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);
  protected readonly auth = inject(AuthState);

  protected readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  /** The API said the password was right but the address is not confirmed yet. */
  protected readonly needsVerification = signal(false);
  protected readonly resent = signal(false);

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { email, password } = this.form.getRawValue();
    this.error.set(null);
    this.needsVerification.set(false);
    this.resent.set(false);
    this.submitting.set(true);
    this.auth.login(email.trim(), password).subscribe({
      next: () => {
        this.submitting.set(false);
        void this.router.navigateByUrl('/');
      },
      error: (problem: unknown) => {
        this.submitting.set(false);
        const read = readProblem(problem);
        this.needsVerification.set(read.code === 'email_not_verified');
        this.error.set(loginMessage(read));
      },
    });
  }

  protected resend(): void {
    this.resent.set(false);
    this.api.resendVerification(this.form.getRawValue().email.trim()).subscribe({
      next: () => this.resent.set(true),
      error: (problem: unknown) => this.error.set(genericMessage(readProblem(problem))),
    });
  }
}
