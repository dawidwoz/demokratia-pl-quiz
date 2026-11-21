CREATE TABLE IF NOT EXISTS positions (
  question_id INT UNSIGNED NOT NULL,
  party_id INT UNSIGNED NOT NULL,
  stance ENUM('za', 'przeciw', 'wstrzymuje') NOT NULL,
  justification TEXT NULL,
  source_label VARCHAR(255) NOT NULL,
  source_url VARCHAR(500) NULL,
  source_date DATE NOT NULL,
  PRIMARY KEY (question_id, party_id),
  CONSTRAINT fk_positions_question FOREIGN KEY (question_id) REFERENCES questions (id) ON DELETE CASCADE,
  CONSTRAINT fk_positions_party FOREIGN KEY (party_id) REFERENCES parties (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
