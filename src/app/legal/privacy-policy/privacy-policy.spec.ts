import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { LEGAL_REVIEWED, PRIVACY_CONTACT, TERMS_VERSION } from '../legal.config';
import { PrivacyPolicy } from './privacy-policy';

describe('PrivacyPolicy', () => {
  let fixture: ComponentFixture<PrivacyPolicy>;
  let el: HTMLElement;
  const text = () => el.textContent ?? '';

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PrivacyPolicy], providers: [provideRouter([])] });
    fixture = TestBed.createComponent(PrivacyPolicy);
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('has a title and states the version it applies to', () => {
    expect(el.querySelector('h1')?.textContent).toContain('Polityka Prywatności');
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

  it('states what is stored, for how long, and where', () => {
    const body = text();
    for (const fact of [
      'adres e-mail i skrót hasła',
      'Odpowiedzi w quizie nie są zapisywane',
      'Nie zapisujemy go w bazie danych',
      'po 7 dniach',
      '30 minutach bezczynności',
      'do 31 dni',
      'Prociv Sp. z o.o.',
      'Gdańsk i Gdynia',
      '__Host-sid',
      'Prezesa Urzędu Ochrony Danych Osobowych',
      'Nie wysyłamy wiadomości marketingowych',
    ]) {
      expect(body).toContain(fact);
    }
  });

  it('describes account deletion honestly: by request until self-service exists', () => {
    expect(text()).toContain('na Twoją prośbę');
  });

  it('links to the Regulamin', () => {
    expect(el.querySelector('a[href="/regulamin"]')).not.toBeNull();
  });
});
