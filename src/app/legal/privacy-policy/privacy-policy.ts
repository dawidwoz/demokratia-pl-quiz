import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  CONTROLLER_NAME,
  EFFECTIVE_DATE,
  LEGAL_REVIEWED,
  PRIVACY_CONTACT,
  TERMS_VERSION,
} from '../legal.config';

@Component({
  selector: 'app-privacy-policy',
  imports: [RouterLink],
  templateUrl: './privacy-policy.html',
})
export class PrivacyPolicy {
  protected readonly controller = CONTROLLER_NAME;
  protected readonly contact = PRIVACY_CONTACT;
  protected readonly effectiveDate = EFFECTIVE_DATE;
  protected readonly version = TERMS_VERSION;
  /** True once the owner approved the text; hides the "wersja robocza" banner. Overridable for tests. */
  readonly reviewed = input(LEGAL_REVIEWED);
}
