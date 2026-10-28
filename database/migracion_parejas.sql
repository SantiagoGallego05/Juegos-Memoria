-- Ejecute este archivo SOLO si ya habia creado la base de datos con la
-- version anterior de schema.sql. Agrega la tabla del Juego de Parejas.
USE juego_recuerdos;

CREATE TABLE IF NOT EXISTS partidas_parejas (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id      INT UNSIGNED NOT NULL,
  nombre_paciente VARCHAR(100) NOT NULL,
  intentos        SMALLINT UNSIGNED NOT NULL,
  duracion_seg    SMALLINT UNSIGNED NOT NULL,
  fecha           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pp_usuario_fecha (usuario_id, fecha),
  CONSTRAINT fk_pp_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB;
