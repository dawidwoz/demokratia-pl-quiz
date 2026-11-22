CREATE TABLE IF NOT EXISTS email_tokens (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  purpose ENUM('verify','reset') NOT NULL,
  expires_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_email_tokens_user (user_id),
  CONSTRAINT fk_email_tokens_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
