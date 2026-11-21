-- SAMPLE CONTENT ONLY (S-01). Fictional parties and invented stances, flagged is_sample = 1.
-- Replace with real, sourced content before any public launch (roadmap open question 13).
-- No row means "party has no stance on this question" (e.g. a 50/50 club split).
-- Data statements only, plain INSERTs in one transaction: any error aborts the file and closing the
-- connection rolls everything back (api/migrate.js records a file only after it succeeded).

START TRANSACTION;

INSERT INTO quizzes (id, title, description, is_sample) VALUES
  (1, 'Quiz przykładowy (dane przykładowe)',
   'Przykładowy quiz do sprawdzenia działania aplikacji. Partie i ich stanowiska są zmyślone.', 1);

INSERT INTO parties (id, name) VALUES
  (1, 'Partia Przykładowa A'),
  (2, 'Partia Przykładowa B'),
  (3, 'Partia Przykładowa C'),
  (4, 'Partia Przykładowa D');

INSERT INTO quiz_parties (quiz_id, party_id) VALUES (1, 1), (1, 2), (1, 3), (1, 4);

INSERT INTO questions (id, quiz_id, sort_order, text, weight, source_label, source_url, source_date) VALUES
  (1, 1, 1, 'Czy ustawa powinna wprowadzić czterodniowy tydzień pracy?', 2,
   'Dane przykładowe: projekt ustawy S-1', NULL, '2025-02-11'),
  (2, 1, 2, 'Czy ceny biletów komunikacji miejskiej powinny być obniżone kosztem budżetu państwa?', 1,
   'Dane przykładowe: projekt ustawy S-2', NULL, '2025-03-05'),
  (3, 1, 3, 'Czy w miastach powinny obowiązywać strefy czystego transportu?', 2,
   'Dane przykładowe: projekt ustawy S-3', NULL, '2025-04-16'),
  (4, 1, 4, 'Czy należy zwiększyć wydatki na ochronę zdrowia kosztem innych wydatków?', 3,
   'Dane przykładowe: projekt ustawy S-4', NULL, '2025-05-21'),
  (5, 1, 5, 'Czy rolnicy powinni otrzymywać dopłaty niezależnie od wielkości gospodarstwa?', 2,
   'Dane przykładowe: projekt ustawy S-5', NULL, '2025-06-18'),
  (6, 1, 6, 'Czy podatek od nadmiarowych zysków banków powinien zostać utrzymany?', 3,
   'Dane przykładowe: projekt ustawy S-6', NULL, '2025-07-09'),
  (7, 1, 7, 'Czy szkoły powinny obowiązkowo prowadzić zajęcia z edukacji cyfrowej?', 1,
   'Dane przykładowe: projekt ustawy S-7', NULL, '2025-09-10'),
  (8, 1, 8, 'Czy zakaz handlu w niedzielę powinien zostać zniesiony?', 2,
   'Dane przykładowe: projekt ustawy S-8', NULL, '2025-10-01');

-- Party A: stance on all 8. Party B: all 8. Party C: 7 (no stance on question 8).
-- Party D: only questions 1, 4 and 6 (sparse on purpose, so "brak danych" can occur).
INSERT INTO positions (question_id, party_id, stance, source_label, source_date) VALUES
  (1, 1, 'za',         'Dane przykładowe: głosowanie klubu', '2025-02-11'),
  (2, 1, 'za',         'Dane przykładowe: głosowanie klubu', '2025-03-05'),
  (3, 1, 'przeciw',    'Dane przykładowe: głosowanie klubu', '2025-04-16'),
  (4, 1, 'za',         'Dane przykładowe: głosowanie klubu', '2025-05-21'),
  (5, 1, 'wstrzymuje', 'Dane przykładowe: głosowanie klubu', '2025-06-18'),
  (6, 1, 'za',         'Dane przykładowe: głosowanie klubu', '2025-07-09'),
  (7, 1, 'za',         'Dane przykładowe: głosowanie klubu', '2025-09-10'),
  (8, 1, 'przeciw',    'Dane przykładowe: głosowanie klubu', '2025-10-01'),

  (1, 2, 'przeciw',    'Dane przykładowe: głosowanie klubu', '2025-02-11'),
  (2, 2, 'przeciw',    'Dane przykładowe: głosowanie klubu', '2025-03-05'),
  (3, 2, 'za',         'Dane przykładowe: głosowanie klubu', '2025-04-16'),
  (4, 2, 'za',         'Dane przykładowe: głosowanie klubu', '2025-05-21'),
  (5, 2, 'za',         'Dane przykładowe: głosowanie klubu', '2025-06-18'),
  (6, 2, 'przeciw',    'Dane przykładowe: głosowanie klubu', '2025-07-09'),
  (7, 2, 'za',         'Dane przykładowe: głosowanie klubu', '2025-09-10'),
  (8, 2, 'za',         'Dane przykładowe: głosowanie klubu', '2025-10-01'),

  (1, 3, 'wstrzymuje', 'Dane przykładowe: głosowanie klubu', '2025-02-11'),
  (2, 3, 'za',         'Dane przykładowe: głosowanie klubu', '2025-03-05'),
  (3, 3, 'za',         'Dane przykładowe: głosowanie klubu', '2025-04-16'),
  (4, 3, 'przeciw',    'Dane przykładowe: głosowanie klubu', '2025-05-21'),
  (5, 3, 'przeciw',    'Dane przykładowe: głosowanie klubu', '2025-06-18'),
  (6, 3, 'wstrzymuje', 'Dane przykładowe: głosowanie klubu', '2025-07-09'),
  (7, 3, 'przeciw',    'Dane przykładowe: głosowanie klubu', '2025-09-10'),

  (1, 4, 'za',         'Dane przykładowe: deklaracja', '2025-02-11'),
  (4, 4, 'przeciw',    'Dane przykładowe: deklaracja', '2025-05-21'),
  (6, 4, 'przeciw',    'Dane przykładowe: deklaracja', '2025-07-09');

COMMIT;
