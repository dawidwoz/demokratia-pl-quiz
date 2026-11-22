import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { EFFECTIVE_DATE, LEGAL_REVIEWED, PRIVACY_CONTACT, TERMS_VERSION } from '../legal.config';

@Component({
  selector: 'app-terms',
  imports: [RouterLink],
  templateUrl: './terms.html',
})
export class Terms {
  protected readonly contact = PRIVACY_CONTACT;
  protected readonly effectiveDate = EFFECTIVE_DATE;
  protected readonly version = TERMS_VERSION;
  /** True once the owner approved the text; hides the "wersja robocza" banner. Overridable for tests. */
  readonly reviewed = input(LEGAL_REVIEWED);
}
