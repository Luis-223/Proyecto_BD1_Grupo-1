/* =========================================================
   PROYECTO: Sistema de gestión de gimnasios
   MÓDULO: Usuario / Seguridad / Ubicación
   Orden de creación: catálogos -> entidades -> subtipos -> procedimientos
   ========================================================= */

/* ---------------------------------------------------------
   0. LIMPIEZA (permite re-ejecutar el script sin errores)
   Orden inverso a las dependencias: primero lo que depende
   de otras tablas, al final los catálogos base.
   --------------------------------------------------------- */
IF OBJECT_ID('usp_ValidarLogin', 'P') IS NOT NULL DROP PROCEDURE usp_ValidarLogin;
IF OBJECT_ID('usp_RegistrarContrasena', 'P') IS NOT NULL DROP PROCEDURE usp_RegistrarContrasena;
GO

-- Nivel más dependiente primero (tablas de detalle / conexión)
IF OBJECT_ID('RespuestaSeguridad', 'U') IS NOT NULL DROP TABLE RespuestaSeguridad;
IF OBJECT_ID('Meta', 'U') IS NOT NULL DROP TABLE Meta;
IF OBJECT_ID('Notificacion', 'U') IS NOT NULL DROP TABLE Notificacion;
IF OBJECT_ID('MantenimientoMaquina', 'U') IS NOT NULL DROP TABLE MantenimientoMaquina;
IF OBJECT_ID('MaquinaEquipo', 'U') IS NOT NULL DROP TABLE MaquinaEquipo;
IF OBJECT_ID('EventoGimnasio', 'U') IS NOT NULL DROP TABLE EventoGimnasio;
IF OBJECT_ID('AsignacionEntrenador', 'U') IS NOT NULL DROP TABLE AsignacionEntrenador;
IF OBJECT_ID('ClienteClase', 'U') IS NOT NULL DROP TABLE ClienteClase;
IF OBJECT_ID('ClaseGrupal', 'U') IS NOT NULL DROP TABLE ClaseGrupal;
IF OBJECT_ID('Asistencia', 'U') IS NOT NULL DROP TABLE Asistencia;
IF OBJECT_ID('HistorialRutina', 'U') IS NOT NULL DROP TABLE HistorialRutina;
IF OBJECT_ID('SerieEjercicio', 'U') IS NOT NULL DROP TABLE SerieEjercicio;
IF OBJECT_ID('BloqueEjercicio', 'U') IS NOT NULL DROP TABLE BloqueEjercicio;
IF OBJECT_ID('DiaRutina', 'U') IS NOT NULL DROP TABLE DiaRutina;
IF OBJECT_ID('Rutina', 'U') IS NOT NULL DROP TABLE Rutina;
IF OBJECT_ID('UsuarioRol', 'U') IS NOT NULL DROP TABLE UsuarioRol;
IF OBJECT_ID('DetalleFactura', 'U') IS NOT NULL DROP TABLE DetalleFactura;
IF OBJECT_ID('Pago', 'U') IS NOT NULL DROP TABLE Pago;
IF OBJECT_ID('Membresia', 'U') IS NOT NULL DROP TABLE Membresia;
IF OBJECT_ID('Factura', 'U') IS NOT NULL DROP TABLE Factura;
IF OBJECT_ID('LoginLog', 'U') IS NOT NULL DROP TABLE LoginLog;
IF OBJECT_ID('EjercicioEquipamiento', 'U') IS NOT NULL DROP TABLE EjercicioEquipamiento;
IF OBJECT_ID('AliasUsuario', 'U') IS NOT NULL DROP TABLE AliasUsuario;
IF OBJECT_ID('Entrenador', 'U') IS NOT NULL DROP TABLE Entrenador;
IF OBJECT_ID('Cliente', 'U') IS NOT NULL DROP TABLE Cliente;
IF OBJECT_ID('Ejercicio', 'U') IS NOT NULL DROP TABLE Ejercicio;
IF OBJECT_ID('Usuario', 'U') IS NOT NULL DROP TABLE Usuario;
IF OBJECT_ID('Municipio', 'U') IS NOT NULL DROP TABLE Municipio;
-- Catálogos base (nadie los referencia ya en este punto)
IF OBJECT_ID('NivelEntrenador', 'U') IS NOT NULL DROP TABLE NivelEntrenador;
IF OBJECT_ID('PreguntaSeguridad', 'U') IS NOT NULL DROP TABLE PreguntaSeguridad;
IF OBJECT_ID('Rol', 'U') IS NOT NULL DROP TABLE Rol;
IF OBJECT_ID('Sucursal', 'U') IS NOT NULL DROP TABLE Sucursal;
IF OBJECT_ID('TipoMembresia', 'U') IS NOT NULL DROP TABLE TipoMembresia;
IF OBJECT_ID('MetodoPago', 'U') IS NOT NULL DROP TABLE MetodoPago;
IF OBJECT_ID('NivelDificultad', 'U') IS NOT NULL DROP TABLE NivelDificultad;
IF OBJECT_ID('Equipamiento', 'U') IS NOT NULL DROP TABLE Equipamiento;
IF OBJECT_ID('GrupoMuscular', 'U') IS NOT NULL DROP TABLE GrupoMuscular;
IF OBJECT_ID('Departamento', 'U') IS NOT NULL DROP TABLE Departamento;
IF OBJECT_ID('Estado', 'U') IS NOT NULL DROP TABLE Estado;
IF OBJECT_ID('Pais', 'U') IS NOT NULL DROP TABLE Pais;
IF OBJECT_ID('Genero', 'U') IS NOT NULL DROP TABLE Genero;
GO

/* ---------------------------------------------------------
   1. CATÁLOGOS (sin dependencias externas)
   --------------------------------------------------------- */
CREATE TABLE Genero (
    id_genero      INT IDENTITY(1,1) PRIMARY KEY,
    nombre_genero  VARCHAR(20) NOT NULL
);
GO

CREATE TABLE Pais (
    id_pais     INT IDENTITY(1,1) PRIMARY KEY,
    nombre_pais VARCHAR(50) NOT NULL
);
GO

CREATE TABLE Estado (
    id_estado          INT IDENTITY(1,1) PRIMARY KEY,
    nombre_estado      VARCHAR(30) NOT NULL,
    referencia_estado  VARCHAR(50) NULL
);
GO

CREATE TABLE Departamento (
    id_departamento          INT IDENTITY(1,1) PRIMARY KEY,
    nombre_departamento      VARCHAR(25) NOT NULL,
    referencia_departamento  VARCHAR(50) NULL
);
GO

/* ---------------------------------------------------------
   2. CATÁLOGO DEPENDIENTE (Municipio depende de Departamento)
   --------------------------------------------------------- */
CREATE TABLE Municipio (
    id_municipio          INT IDENTITY(1,1) PRIMARY KEY,
    id_departamento       INT NOT NULL,
    nombre_municipio      VARCHAR(50) NOT NULL,
    referencia_municipio  VARCHAR(50) NULL,
    CONSTRAINT FK_Municipio_Departamento FOREIGN KEY (id_departamento)
        REFERENCES Departamento(id_departamento)
);
GO

/* ---------------------------------------------------------
   3. USUARIO (depende de Genero, Departamento, Municipio, Pais, Estado)
   --------------------------------------------------------- */
CREATE TABLE Usuario (
    id_usuario            INT IDENTITY(1,1) PRIMARY KEY,
    id_genero             INT NOT NULL,
    primer_nombre_us      VARCHAR(50) NOT NULL,
    segundo_nombre_us     VARCHAR(50) NULL,
    primer_apellido_us    VARCHAR(50) NOT NULL,
    segundo_apellido_us   VARCHAR(50) NULL,
    apellido_casada       VARCHAR(50) NULL,
    fecha_nacimiento_us   DATE NOT NULL,
    id_departamento       INT NOT NULL,
    id_municipio          INT NOT NULL,
    id_pais               INT NULL,
    nit_dpi               VARCHAR(20) NOT NULL,
    id_estado             INT NOT NULL,
    CONSTRAINT FK_Usuario_Genero       FOREIGN KEY (id_genero)       REFERENCES Genero(id_genero),
    CONSTRAINT FK_Usuario_Departamento FOREIGN KEY (id_departamento) REFERENCES Departamento(id_departamento),
    CONSTRAINT FK_Usuario_Municipio    FOREIGN KEY (id_municipio)    REFERENCES Municipio(id_municipio),
    CONSTRAINT FK_Usuario_Pais         FOREIGN KEY (id_pais)         REFERENCES Pais(id_pais),
    CONSTRAINT FK_Usuario_Estado       FOREIGN KEY (id_estado)       REFERENCES Estado(id_estado),
    CONSTRAINT UQ_Usuario_NitDpi UNIQUE (nit_dpi)
);
GO

/* ---------------------------------------------------------
   4. AUTENTICACIÓN (depende de Usuario)
   --------------------------------------------------------- */
CREATE TABLE AliasUsuario (
    id_alias              INT IDENTITY(1,1) PRIMARY KEY,
    id_usuario            INT NOT NULL,
    alias                 VARCHAR(60) NOT NULL,        -- nombre + apellidos + número random
    correo_recuperacion   VARCHAR(100) NULL,
    telefono              VARCHAR(20) NULL,
    contrasena_hash       VARBINARY(32) NOT NULL,       -- SHA2_256 = 32 bytes, nunca texto plano
    contrasena_salt       UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    fecha_registro        DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_AliasUsuario_Usuario FOREIGN KEY (id_usuario) REFERENCES Usuario(id_usuario),
    CONSTRAINT UQ_AliasUsuario_Alias UNIQUE (alias)
);
GO

/* ---------------------------------------------------------
   5. SUBTIPOS DE USUARIO (herencia 1 a 1, dependen de Usuario)
   --------------------------------------------------------- */
CREATE TABLE Cliente (
    id_cliente               INT IDENTITY(1,1) PRIMARY KEY,
    id_usuario                INT NOT NULL,
    fecha_ingreso_gimnasio    DATE NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_Cliente_Usuario FOREIGN KEY (id_usuario) REFERENCES Usuario(id_usuario),
    CONSTRAINT UQ_Cliente_Usuario UNIQUE (id_usuario)
);
GO

CREATE TABLE Entrenador (
    id_entrenador        INT IDENTITY(1,1) PRIMARY KEY,
    id_usuario           INT NOT NULL,
    especialidad         VARCHAR(50) NULL,
    fecha_contratacion   DATE NULL,
    CONSTRAINT FK_Entrenador_Usuario FOREIGN KEY (id_usuario) REFERENCES Usuario(id_usuario),
    CONSTRAINT UQ_Entrenador_Usuario UNIQUE (id_usuario)
);
GO

/* ---------------------------------------------------------
   6. CATÁLOGO NORMALIZADO DE EJERCICIOS
   --------------------------------------------------------- */
CREATE TABLE GrupoMuscular (
    id_grupo_muscular  INT IDENTITY(1,1) PRIMARY KEY,
    nombre_grupo       VARCHAR(50) NOT NULL UNIQUE
);
GO

CREATE TABLE Equipamiento (
    id_equipamiento       INT IDENTITY(1,1) PRIMARY KEY,
    nombre_equipamiento   VARCHAR(50) NOT NULL UNIQUE
);
GO

CREATE TABLE NivelDificultad (
    id_nivel_dificultad  INT IDENTITY(1,1) PRIMARY KEY,
    nombre_nivel         VARCHAR(30) NOT NULL UNIQUE
);
GO

CREATE TABLE Ejercicio (
    id_ejercicio          INT IDENTITY(1,1) PRIMARY KEY,
    nombre_ejercicio      VARCHAR(100) NOT NULL,
    id_grupo_muscular     INT NOT NULL,
    id_nivel_dificultad   INT NOT NULL,
    descripcion           VARCHAR(255) NULL,
    CONSTRAINT FK_Ejercicio_GrupoMuscular FOREIGN KEY (id_grupo_muscular)
        REFERENCES GrupoMuscular(id_grupo_muscular),
    CONSTRAINT FK_Ejercicio_NivelDificultad FOREIGN KEY (id_nivel_dificultad)
        REFERENCES NivelDificultad(id_nivel_dificultad),
    CONSTRAINT UQ_Ejercicio_Nombre UNIQUE (nombre_ejercicio)
);
GO

CREATE TABLE EjercicioEquipamiento (
    id_ejercicio      INT NOT NULL,
    id_equipamiento   INT NOT NULL,
    CONSTRAINT PK_EjercicioEquipamiento PRIMARY KEY (id_ejercicio, id_equipamiento),
    CONSTRAINT FK_EjercicioEquipamiento_Ejercicio FOREIGN KEY (id_ejercicio)
        REFERENCES Ejercicio(id_ejercicio),
    CONSTRAINT FK_EjercicioEquipamiento_Equipamiento FOREIGN KEY (id_equipamiento)
        REFERENCES Equipamiento(id_equipamiento)
);
GO

/* ---------------------------------------------------------
   7. MEMBRESÍAS Y FACTURACIÓN (dependen de Cliente)
   --------------------------------------------------------- */
CREATE TABLE TipoMembresia (
    id_tipo_membresia  INT IDENTITY(1,1) PRIMARY KEY,
    nombre_tipo        VARCHAR(50) NOT NULL,
    duracion_meses     INT NOT NULL,
    precio_base        DECIMAL(10,2) NOT NULL
);
GO

CREATE TABLE Membresia (
    id_membresia        INT IDENTITY(1,1) PRIMARY KEY,
    id_cliente          INT NOT NULL,
    id_tipo_membresia   INT NOT NULL,
    fecha_inicio        DATE NOT NULL,
    fecha_fin           DATE NOT NULL,
    estado              VARCHAR(20) NOT NULL DEFAULT 'Activa',
    CONSTRAINT FK_Membresia_Cliente FOREIGN KEY (id_cliente)
        REFERENCES Cliente(id_cliente),
    CONSTRAINT FK_Membresia_TipoMembresia FOREIGN KEY (id_tipo_membresia)
        REFERENCES TipoMembresia(id_tipo_membresia),
    CONSTRAINT CK_Membresia_Estado CHECK (estado IN ('Activa','Suspendida','Vencida')),
    CONSTRAINT CK_Membresia_Fechas CHECK (fecha_fin > fecha_inicio)
);
GO

CREATE TABLE MetodoPago (
    id_metodo_pago   INT IDENTITY(1,1) PRIMARY KEY,
    nombre_metodo    VARCHAR(30) NOT NULL UNIQUE
);
GO

CREATE TABLE Factura (
    id_factura     INT IDENTITY(1,1) PRIMARY KEY,
    id_cliente     INT NOT NULL,
    fecha_emision  DATETIME NOT NULL DEFAULT GETDATE(),
    total          DECIMAL(10,2) NOT NULL DEFAULT 0,
    CONSTRAINT FK_Factura_Cliente FOREIGN KEY (id_cliente)
        REFERENCES Cliente(id_cliente)
);
GO

CREATE TABLE DetalleFactura (
    id_detalle_factura  INT IDENTITY(1,1) PRIMARY KEY,
    id_factura          INT NOT NULL,
    id_membresia        INT NULL,
    descripcion         VARCHAR(100) NOT NULL,
    cantidad            INT NOT NULL DEFAULT 1,
    precio_unitario     DECIMAL(10,2) NOT NULL,
    subtotal            AS (cantidad * precio_unitario) PERSISTED,
    CONSTRAINT FK_DetalleFactura_Factura FOREIGN KEY (id_factura)
        REFERENCES Factura(id_factura),
    CONSTRAINT FK_DetalleFactura_Membresia FOREIGN KEY (id_membresia)
        REFERENCES Membresia(id_membresia)
);
GO

CREATE TABLE Pago (
    id_pago         INT IDENTITY(1,1) PRIMARY KEY,
    id_factura      INT NOT NULL,
    id_metodo_pago  INT NOT NULL,
    fecha_pago      DATETIME NOT NULL DEFAULT GETDATE(),
    monto           DECIMAL(10,2) NOT NULL,
    CONSTRAINT FK_Pago_Factura FOREIGN KEY (id_factura)
        REFERENCES Factura(id_factura),
    CONSTRAINT FK_Pago_MetodoPago FOREIGN KEY (id_metodo_pago)
        REFERENCES MetodoPago(id_metodo_pago)
);
GO

/* ---------------------------------------------------------
   8. BITÁCORA DE LOGIN (depende de AliasUsuario)
   --------------------------------------------------------- */
CREATE TABLE LoginLog (
    id_login_log         INT IDENTITY(1,1) PRIMARY KEY,
    id_alias             INT NOT NULL,
    fecha_registro_log   DATETIME NOT NULL DEFAULT GETDATE(),
    resultado            VARCHAR(20) NOT NULL DEFAULT 'Exitoso', -- Exitoso / Fallido
    ip_origen            VARCHAR(45) NULL,
    CONSTRAINT FK_LoginLog_AliasUsuario FOREIGN KEY (id_alias) REFERENCES AliasUsuario(id_alias)
);
GO

/* ---------------------------------------------------------
   9. SUCURSAL Y SEGURIDAD (DCL) — catálogos independientes
   --------------------------------------------------------- */
CREATE TABLE Sucursal (
    id_sucursal      INT IDENTITY(1,1) PRIMARY KEY,
    nombre_sucursal  VARCHAR(100) NOT NULL,
    direccion        VARCHAR(150) NULL,
    telefono         VARCHAR(20) NULL
);
GO

CREATE TABLE Rol (
    id_rol      INT IDENTITY(1,1) PRIMARY KEY,
    nombre_rol  VARCHAR(30) NOT NULL UNIQUE  -- Admin, Entrenador, Cliente, Recepción
);
GO

CREATE TABLE UsuarioRol (
    id_usuario  INT NOT NULL,
    id_rol      INT NOT NULL,
    CONSTRAINT PK_UsuarioRol PRIMARY KEY (id_usuario, id_rol),
    CONSTRAINT FK_UsuarioRol_Usuario FOREIGN KEY (id_usuario) REFERENCES Usuario(id_usuario),
    CONSTRAINT FK_UsuarioRol_Rol FOREIGN KEY (id_rol) REFERENCES Rol(id_rol)
);
GO

-- Clasificación de entrenadores: catálogo de nivel/categoría
CREATE TABLE NivelEntrenador (
    id_nivel_entrenador  INT IDENTITY(1,1) PRIMARY KEY,
    nombre_nivel         VARCHAR(30) NOT NULL UNIQUE   -- Junior, Senior, Certificado...
);
GO

-- Se agrega por ALTER (no en el CREATE original de Entrenador) porque
-- Entrenador se crea antes que NivelEntrenador en el orden de dependencias.
ALTER TABLE Entrenador
    ADD id_nivel_entrenador INT NULL
        CONSTRAINT FK_Entrenador_NivelEntrenador FOREIGN KEY REFERENCES NivelEntrenador(id_nivel_entrenador);
GO

-- Test de recuperación de contraseña: preguntas de seguridad (catálogo)
CREATE TABLE PreguntaSeguridad (
    id_pregunta     INT IDENTITY(1,1) PRIMARY KEY,
    texto_pregunta  VARCHAR(150) NOT NULL UNIQUE   -- "¿Nombre de tu mascota?", etc.
);
GO

-- Fechas y horas: calendario general de eventos del gimnasio
CREATE TABLE EventoGimnasio (
    id_evento       INT IDENTITY(1,1) PRIMARY KEY,
    id_sucursal     INT NULL,                 -- NULL si aplica a toda la cadena
    nombre_evento   VARCHAR(100) NOT NULL,
    descripcion     VARCHAR(255) NULL,
    fecha_inicio    DATETIME NOT NULL,
    fecha_fin       DATETIME NOT NULL,
    tipo_evento     VARCHAR(50) NULL,         -- Mantenimiento, Torneo, Promoción, Día festivo...
    CONSTRAINT FK_EventoGimnasio_Sucursal FOREIGN KEY (id_sucursal) REFERENCES Sucursal(id_sucursal),
    CONSTRAINT CK_EventoGimnasio_Fechas CHECK (fecha_fin >= fecha_inicio)
);
GO

/* ---------------------------------------------------------
   10. RUTINAS PERSONALIZADAS (dependen de Cliente, Entrenador, Ejercicio)
   --------------------------------------------------------- */
CREATE TABLE Rutina (
    id_rutina       INT IDENTITY(1,1) PRIMARY KEY,
    id_cliente      INT NOT NULL,
    id_entrenador   INT NOT NULL,
    nombre_rutina   VARCHAR(100) NOT NULL,
    fecha_creacion  DATE NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_Rutina_Cliente FOREIGN KEY (id_cliente) REFERENCES Cliente(id_cliente),
    CONSTRAINT FK_Rutina_Entrenador FOREIGN KEY (id_entrenador) REFERENCES Entrenador(id_entrenador)
);
GO

CREATE TABLE DiaRutina (
    id_dia_rutina  INT IDENTITY(1,1) PRIMARY KEY,
    id_rutina      INT NOT NULL,
    numero_dia     INT NOT NULL,        -- 1, 2, 3...
    nombre_dia     VARCHAR(50) NULL,    -- "Día de pierna", etc.
    CONSTRAINT FK_DiaRutina_Rutina FOREIGN KEY (id_rutina) REFERENCES Rutina(id_rutina),
    CONSTRAINT UQ_DiaRutina UNIQUE (id_rutina, numero_dia)
);
GO

-- Rutina: historial — bitácora de cada vez que el cliente ejecuta un día de su rutina
CREATE TABLE HistorialRutina (
    id_historial       INT IDENTITY(1,1) PRIMARY KEY,
    id_dia_rutina      INT NOT NULL,
    fecha_realizacion  DATE NOT NULL DEFAULT GETDATE(),
    completado         BIT NOT NULL DEFAULT 0,
    observaciones      VARCHAR(255) NULL,
    CONSTRAINT FK_HistorialRutina_DiaRutina FOREIGN KEY (id_dia_rutina)
        REFERENCES DiaRutina(id_dia_rutina)
);
GO

CREATE TABLE BloqueEjercicio (
    id_bloque_ejercicio  INT IDENTITY(1,1) PRIMARY KEY,
    id_dia_rutina        INT NOT NULL,
    id_ejercicio         INT NOT NULL,
    orden                INT NOT NULL,   -- orden del ejercicio dentro del día
    CONSTRAINT FK_BloqueEjercicio_DiaRutina FOREIGN KEY (id_dia_rutina) REFERENCES DiaRutina(id_dia_rutina),
    CONSTRAINT FK_BloqueEjercicio_Ejercicio FOREIGN KEY (id_ejercicio) REFERENCES Ejercicio(id_ejercicio)
);
GO

CREATE TABLE SerieEjercicio (
    id_serie             INT IDENTITY(1,1) PRIMARY KEY,
    id_bloque_ejercicio  INT NOT NULL,
    numero_serie         INT NOT NULL,
    repeticiones         INT NOT NULL,
    peso_objetivo        DECIMAL(6,2) NULL,
    descanso_segundos    INT NOT NULL DEFAULT 60,
    CONSTRAINT FK_SerieEjercicio_BloqueEjercicio FOREIGN KEY (id_bloque_ejercicio)
        REFERENCES BloqueEjercicio(id_bloque_ejercicio)
);
GO

/* ---------------------------------------------------------
   11. ASISTENCIA Y CLASES GRUPALES (dependen de Cliente, Sucursal, Entrenador)
   --------------------------------------------------------- */
CREATE TABLE Asistencia (
    id_asistencia       INT IDENTITY(1,1) PRIMARY KEY,
    id_cliente          INT NOT NULL,
    id_sucursal         INT NOT NULL,
    fecha_hora_ingreso  DATETIME NOT NULL DEFAULT GETDATE(),
    membresia_validada  BIT NOT NULL DEFAULT 0,  -- resultado de validar estado de Membresia en tiempo real
    CONSTRAINT FK_Asistencia_Cliente FOREIGN KEY (id_cliente) REFERENCES Cliente(id_cliente),
    CONSTRAINT FK_Asistencia_Sucursal FOREIGN KEY (id_sucursal) REFERENCES Sucursal(id_sucursal)
);
GO

CREATE TABLE ClaseGrupal (
    id_clase       INT IDENTITY(1,1) PRIMARY KEY,
    id_sucursal    INT NOT NULL,
    nombre_clase   VARCHAR(50) NOT NULL,   -- Spinning, Yoga...
    fecha_hora     DATETIME NOT NULL,
    cupo_maximo    INT NOT NULL,
    CONSTRAINT FK_ClaseGrupal_Sucursal FOREIGN KEY (id_sucursal) REFERENCES Sucursal(id_sucursal)
);
GO

CREATE TABLE ClienteClase (
    id_cliente         INT NOT NULL,
    id_clase           INT NOT NULL,
    fecha_inscripcion  DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT PK_ClienteClase PRIMARY KEY (id_cliente, id_clase),
    CONSTRAINT FK_ClienteClase_Cliente FOREIGN KEY (id_cliente) REFERENCES Cliente(id_cliente),
    CONSTRAINT FK_ClienteClase_Clase FOREIGN KEY (id_clase) REFERENCES ClaseGrupal(id_clase)
);
GO

CREATE TABLE AsignacionEntrenador (
    id_asignacion     INT IDENTITY(1,1) PRIMARY KEY,
    id_entrenador     INT NOT NULL,
    id_cliente        INT NULL,
    id_clase          INT NULL,
    fecha_asignacion  DATE NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_AsignacionEntrenador_Entrenador FOREIGN KEY (id_entrenador) REFERENCES Entrenador(id_entrenador),
    CONSTRAINT FK_AsignacionEntrenador_Cliente FOREIGN KEY (id_cliente) REFERENCES Cliente(id_cliente),
    CONSTRAINT FK_AsignacionEntrenador_Clase FOREIGN KEY (id_clase) REFERENCES ClaseGrupal(id_clase),
    -- La asignación es O a un cliente O a una clase grupal, nunca ambos ni ninguno
    CONSTRAINT CK_AsignacionEntrenador_Destino CHECK (
        (id_cliente IS NOT NULL AND id_clase IS NULL) OR
        (id_cliente IS NULL AND id_clase IS NOT NULL)
    )
);
GO

/* ---------------------------------------------------------
   12. EQUIPO TÉCNICO Y MANTENIMIENTO (operación técnica del gimnasio)
   --------------------------------------------------------- */
CREATE TABLE MaquinaEquipo (
    id_maquina          INT IDENTITY(1,1) PRIMARY KEY,
    id_sucursal         INT NOT NULL,
    nombre_maquina      VARCHAR(80) NOT NULL,
    fecha_adquisicion   DATE NULL,
    estado              VARCHAR(20) NOT NULL DEFAULT 'Operativa',
    CONSTRAINT FK_MaquinaEquipo_Sucursal FOREIGN KEY (id_sucursal) REFERENCES Sucursal(id_sucursal),
    CONSTRAINT CK_MaquinaEquipo_Estado CHECK (estado IN ('Operativa','Mantenimiento','Fuera de servicio'))
);
GO

CREATE TABLE MantenimientoMaquina (
    id_mantenimiento     INT IDENTITY(1,1) PRIMARY KEY,
    id_maquina           INT NOT NULL,
    fecha_mantenimiento  DATE NOT NULL DEFAULT GETDATE(),
    descripcion          VARCHAR(255) NULL,
    costo                DECIMAL(10,2) NULL,
    CONSTRAINT FK_MantenimientoMaquina_Maquina FOREIGN KEY (id_maquina) REFERENCES MaquinaEquipo(id_maquina)
);
GO

/* ---------------------------------------------------------
   13. NOTIFICACIONES (soporte para reportes/alertas, depende de Cliente)
   --------------------------------------------------------- */
CREATE TABLE Notificacion (
    id_notificacion    INT IDENTITY(1,1) PRIMARY KEY,
    id_cliente         INT NOT NULL,
    tipo_notificacion  VARCHAR(50) NOT NULL,  -- VencimientoMembresia, RiesgoDesercion...
    fecha_generada     DATETIME NOT NULL DEFAULT GETDATE(),
    mensaje            VARCHAR(255) NULL,
    leida              BIT NOT NULL DEFAULT 0,
    CONSTRAINT FK_Notificacion_Cliente FOREIGN KEY (id_cliente) REFERENCES Cliente(id_cliente)
);
GO

/* ---------------------------------------------------------
   14. PROCEDIMIENTOS ALMACENADOS (dependen de las tablas anteriores)
   --------------------------------------------------------- */
CREATE OR ALTER PROCEDURE usp_RegistrarContrasena
    @id_alias INT,
    @contrasena_plana VARCHAR(100)
AS
BEGIN
    DECLARE @salt UNIQUEIDENTIFIER = NEWID();
    DECLARE @hash VARBINARY(32) =
        HASHBYTES('SHA2_256', @contrasena_plana + CAST(@salt AS VARCHAR(36)));

    UPDATE AliasUsuario
    SET contrasena_hash = @hash,
        contrasena_salt = @salt
    WHERE id_alias = @id_alias;
END
GO

CREATE OR ALTER PROCEDURE usp_ValidarLogin
    @alias VARCHAR(60),
    @contrasena_plana VARCHAR(100)
AS
BEGIN
    DECLARE @id_alias INT, @hash_guardado VARBINARY(32), @salt UNIQUEIDENTIFIER;
    DECLARE @hash_calculado VARBINARY(32);
    DECLARE @resultado VARCHAR(20);

    SELECT @id_alias = id_alias, @hash_guardado = contrasena_hash, @salt = contrasena_salt
    FROM AliasUsuario
    WHERE alias = @alias;

    IF @id_alias IS NULL
    BEGIN
        SELECT 'Fallido' AS resultado;
        RETURN;
    END

    SET @hash_calculado = HASHBYTES('SHA2_256', @contrasena_plana + CAST(@salt AS VARCHAR(36)));

    IF @hash_calculado = @hash_guardado
        SET @resultado = 'Exitoso';
    ELSE
        SET @resultado = 'Fallido';

    INSERT INTO LoginLog (id_alias, fecha_registro_log, resultado)
    VALUES (@id_alias, GETDATE(), @resultado);

    SELECT @resultado AS resultado;
END
GO