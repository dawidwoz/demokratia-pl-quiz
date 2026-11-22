import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { LEGAL_REVIEWED, PRIVACY_CONTACT, TERMS_VERSION } from '../legal.config';
import { Terms } from './terms';

describe('Terms', () => {
  let fixture: ComponentFixture<Terms>;
  let el: HTMLElement;
  const text = () => el.textContent ?? '';

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Terms], providers: [provideRouter([])] });
    fixture = TestBed.createComponent(Terms);
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('has a title and states the version it applies to', () => {
    expect(el.querySelector('h1')?.textContent).toContain('Regulamin');
    expect(text()).toContain(`Wersja ${TERMS_VERSION}`);
  });

  it('shows the draft banner while the texts are not reviewed, and hides it once they are', () => {
    fixture.componentRef.setInput('reviewed', false);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="draft-banner"]')?.textContent).toContain(
      'Wersja robocza',
    );
    fixture.componentRef.setInput('reviewed', true);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="draft-banner"]')).toBeNull();
  });

  it('follows LEGAL_REVIEWED from the legal config by default', () => {
    expect(el.querySelector('[data-testid="draft-banner"]') !== null).toBe(!LEGAL_REVIEWED);
  });

  it('shows the contact from the legal config', () => {
    expect(el.querySelector('[data-testid="contact"]')?.textContent).toContain(PRIVACY_CONTACT);
  });

  it('says the quiz works without an account and answers are not stored', () => {
    expect(text()).toContain('Z quizu korzystasz bez konta');
    expect(text()).toContain('Odpowiedzi nie są zapisywane');
  });

  it('says results are informational and not electoral advice', () => {
    expect(text()).toContain('nie jest rekomendacją wyborczą');
  });

  it('describes account verification and deletion on request', () => {
    expect(text()).toContain('wygasa po 24 godzinach');
    expect(text()).toContain('poprosić o usunięcie konta');
  });

  it('links to the Polityka Prywatności', () => {
    expect(el.querySelector('a[href="/polityka-prywatnosci"]')).not.toBeNull();
  });
});
