'use strict';

// Plain-text Polish mail bodies (no HTML, no tracking pixels or tracked links). Each function takes
// ready-made URLs and returns { subject, text }.

const SIGNATURE = 'Z kim mi po drodze';

function verification(link) {
  return {
    subject: 'Potwierdź adres e-mail – Z kim mi po drodze',
    text: [
      'Dzień dobry,',
      '',
      'ktoś (mamy nadzieję, że Ty) założył konto w serwisie „Z kim mi po drodze” na ten adres e-mail.',
      'Aby potwierdzić adres i móc się zalogować, otwórz ten link (ważny 24 godziny):',
      '',
      link,
      '',
      'Jeśli to nie Ty zakładałeś konto, po prostu zignoruj tę wiadomość – nic się nie stanie.',
      '',
      SIGNATURE,
    ].join('\n'),
  };
}

function passwordReset(link) {
  return {
    subject: 'Ustaw nowe hasło – Z kim mi po drodze',
    text: [
      'Dzień dobry,',
      '',
      'ktoś poprosił o ustawienie nowego hasła do konta w serwisie „Z kim mi po drodze”.',
      'Aby ustawić nowe hasło, otwórz ten link (ważny 1 godzinę, można go użyć tylko raz):',
      '',
      link,
      '',
      'Jeśli to nie Ty o to prosiłeś, zignoruj tę wiadomość – Twoje dotychczasowe hasło pozostaje bez zmian.',
      '',
      SIGNATURE,
    ].join('\n'),
  };
}

function alreadyRegistered(loginUrl, forgotUrl) {
  return {
    subject: 'Masz już konto – Z kim mi po drodze',
    text: [
      'Dzień dobry,',
      '',
      'ktoś próbował założyć konto w serwisie „Z kim mi po drodze” na ten adres e-mail, ale konto już istnieje.',
      '',
      `Zaloguj się: ${loginUrl}`,
      `Nie pamiętasz hasła? Ustaw nowe: ${forgotUrl}`,
      '',
      'Jeśli to nie Ty próbowałeś założyć konto, zignoruj tę wiadomość.',
      '',
      SIGNATURE,
    ].join('\n'),
  };
}

module.exports = { verification, passwordReset, alreadyRegistered };
