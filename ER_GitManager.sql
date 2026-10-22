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
IF OBJECT_ID('sp_ValidarLogin', 'P') IS NOT NULL DROP PROCEDURE sp_ValidarLogin;
IF OBJECT_ID('sp_RegistrarContrasena', 'P') IS NOT NULL DROP PROCEDURE sp_RegistrarContrasena;
GO

-- Nivel más dependiente primero (tablas de detalle / conexión)
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
   9. PROCEDIMIENTOS ALMACENADOS (dependen de las tablas anteriores)
   --------------------------------------------------------- */
CREATE OR ALTER PROCEDURE sp_RegistrarContrasena
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

CREATE OR ALTER PROCEDURE sp_ValidarLogin
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
