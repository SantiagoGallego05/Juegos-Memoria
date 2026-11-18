-- Mejoras: tamaño de tablero en Parejas e imagenes propias en Recuerdos.
-- Ejecute este archivo UNA SOLA VEZ si ya tenia la base de datos creada.
-- (Mas facil: en la terminal use `npm run migrar`, que revisa que falta y no repite nada.)
USE juego_recuerdos;

-- 1) Parejas: los juegos ya guardados se hicieron en el tablero de 4 x 2
ALTER TABLE partidas_parejas
  ADD COLUMN columnas TINYINT UNSIGNED NOT NULL DEFAULT 4 AFTER nombre_paciente,
  ADD COLUMN filas    TINYINT UNSIGNED NOT NULL DEFAULT 2 AFTER columnas;

-- 2) Recuerdos: imagenes subidas por los responsables
CREATE TABLE IF NOT EXISTS imagenes_usuario (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id INT UNSIGNED NOT NULL,
  nombre     VARCHAR(100) NOT NULL,
  tipo       VARCHAR(20) NOT NULL,
  bytes      INT UNSIGNED NOT NULL,
  datos      MEDIUMBLOB NOT NULL,
  creada_en  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_imagenes_usuario (usuario_id, creada_en),
  CONSTRAINT fk_imagenes_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB;

ALTER TABLE respuestas
  ADD COLUMN imagen_id INT UNSIGNED NULL AFTER imagen,
  ADD KEY idx_respuestas_imagen (imagen_id),
  ADD CONSTRAINT fk_respuestas_imagen
    FOREIGN KEY (imagen_id) REFERENCES imagenes_usuario (id) ON DELETE SET NULL;
