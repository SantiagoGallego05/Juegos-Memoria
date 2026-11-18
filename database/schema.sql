-- ============================================================
--  Base de datos del Juego de Recuerdos (MySQL 8+ / MariaDB 10.4+)
-- ============================================================
CREATE DATABASE IF NOT EXISTS juego_recuerdos
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE juego_recuerdos;

-- Responsables / doctores que inician sesion (antes: usuarios.txt)
CREATE TABLE IF NOT EXISTS usuarios (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- utf8mb4_bin: distingue mayusculas/minusculas, igual que el programa en Java
  usuario            VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  password_hash      VARCHAR(100) NOT NULL,   -- hash bcrypt, nunca la clave en texto plano
  nombre_responsable VARCHAR(100) NOT NULL,
  correo             VARCHAR(150) NULL,       -- para recuperar la contraseña (en minusculas)
  creado_en          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_usuario (usuario),
  UNIQUE KEY uq_usuarios_correo (correo)      -- MySQL permite varios NULL en una columna UNIQUE
) ENGINE=InnoDB;

-- Una partida = una vez que un adulto mayor completa las 5 imagenes
-- (antes: un archivo Resultado_*.txt)
CREATE TABLE IF NOT EXISTS partidas (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id      INT UNSIGNED NOT NULL,
  nombre_paciente VARCHAR(100) NOT NULL,
  fecha           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_partidas_usuario_fecha (usuario_id, fecha),
  CONSTRAINT fk_partidas_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Imagenes que cada responsable sube para usarlas en el Juego de Recuerdos.
-- Se guardan en la base de datos (no en el disco) para que no se pierdan en
-- hostings gratuitos, cuyo disco se borra al reiniciar. Cada una es privada de
-- quien la subio.
CREATE TABLE IF NOT EXISTS imagenes_usuario (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id INT UNSIGNED NOT NULL,
  nombre     VARCHAR(100) NOT NULL,
  tipo       VARCHAR(20) NOT NULL,              -- image/jpeg, image/png o image/webp
  bytes      INT UNSIGNED NOT NULL,
  datos      MEDIUMBLOB NOT NULL,               -- hasta 16 MB (se limita a 2 MB desde la aplicacion)
  creada_en  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_imagenes_usuario (usuario_id, creada_en),
  CONSTRAINT fk_imagenes_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Las respuestas de cada imagen de la partida
CREATE TABLE IF NOT EXISTS respuestas (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  partida_id INT UNSIGNED NOT NULL,
  orden      TINYINT UNSIGNED NOT NULL,        -- 1 a 5
  imagen     VARCHAR(255) NOT NULL,            -- nombre del archivo (kawa.jpg) o nombre de la imagen subida
  imagen_id  INT UNSIGNED NULL,                -- solo si es una imagen subida por el responsable
  respuesta  TEXT NOT NULL,                    -- vacio si no respondio
  PRIMARY KEY (id),
  UNIQUE KEY uq_respuestas_partida_orden (partida_id, orden),
  KEY idx_respuestas_imagen (imagen_id),
  CONSTRAINT fk_respuestas_partida
    FOREIGN KEY (partida_id) REFERENCES partidas (id) ON DELETE CASCADE,
  -- si se borra la imagen subida, la respuesta se conserva (imagen_id queda NULL)
  CONSTRAINT fk_respuestas_imagen
    FOREIGN KEY (imagen_id) REFERENCES imagenes_usuario (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Partidas del Juego de Parejas (una fila por partida terminada)
CREATE TABLE IF NOT EXISTS partidas_parejas (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id      INT UNSIGNED NOT NULL,
  nombre_paciente VARCHAR(100) NOT NULL,
  columnas        TINYINT UNSIGNED NOT NULL DEFAULT 4,   -- tamaño del tablero elegido
  filas           TINYINT UNSIGNED NOT NULL DEFAULT 2,   -- (columnas x filas / 2 = parejas)
  intentos        SMALLINT UNSIGNED NOT NULL,   -- minimo posible: igual al numero de parejas
  duracion_seg    SMALLINT UNSIGNED NOT NULL,   -- desde la primera tarjeta hasta la ultima pareja
  fecha           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pp_usuario_fecha (usuario_id, fecha),
  CONSTRAINT fk_pp_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Enlaces de recuperacion de contraseña. Se guarda solo el hash (SHA-256) del
-- token: si alguien viera esta tabla, no podria usar los enlaces.
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
