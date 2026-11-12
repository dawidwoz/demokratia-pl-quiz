CREATE TABLE IF NOT EXISTS questions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  quiz_id INT UNSIGNED NOT NULL,
  sort_order INT UNSIGNED NOT NULL,
  text VARCHAR(500) NOT NULL,
  weight TINYINT UNSIGNED NOT NULL,
  source_label VARCHAR(255) NOT NULL,
  source_url VARCHAR(500) NULL,
  source_date DATE NULL,
  UNIQUE KEY uq_questions_order (quiz_id, sort_order),
  CONSTRAINT chk_questions_weight CHECK (weight BETWEEN 1 AND 3),
  CONSTRAINT fk_questions_quiz FOREIGN KEY (quiz_id) REFERENCES quizzes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
