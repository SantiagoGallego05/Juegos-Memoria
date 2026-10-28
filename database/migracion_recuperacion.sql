-- Ejecute este archivo UNA SOLA VEZ si ya tenia la base de datos creada con una
-- version anterior. Agrega el correo a los usuarios y la tabla de recuperacion.
-- (Si dice "Duplicate column name 'correo'", ya estaba aplicado: no pasa nada.)
USE juego_recuerdos;

ALTER TABLE usuarios
  ADD COLUMN correo VARCHAR(150) NULL AFTER nombre_responsable,
  ADD UNIQUE KEY uq_usuarios_correo (correo);

CREATE TABLE IF NOT EXISTS recuperaciones (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id INT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expira_en  DATETIME NOT NULL,
  creado_en  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_recuperaciones_token (token_hash),
  KEY idx_recuperaciones_usuario (usuario_id),
  CONSTRAINT fk_recuperaciones_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB;
