CREATE TABLE IF NOT EXISTS quiz_parties (
  quiz_id INT UNSIGNED NOT NULL,
  party_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (quiz_id, party_id),
  CONSTRAINT fk_quiz_parties_quiz FOREIGN KEY (quiz_id) REFERENCES quizzes (id) ON DELETE CASCADE,
  CONSTRAINT fk_quiz_parties_party FOREIGN KEY (party_id) REFERENCES parties (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
