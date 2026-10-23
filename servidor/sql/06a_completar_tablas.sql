/* =========================================================
   06a_completar_tablas.sql — PONER LA BASE AL DÍA (columnas y tablas que faltan)
   Ejecutar en la base FitManager ANTES de 06_app_escritorio.sql.
   Se puede ejecutar más de una vez sin errores.

   Por qué: la base de Azure se creó con una versión anterior de las
   tablas. Este script agrega lo que tiene FitManager.sql (15/10/2026)
   y todavía falta. SOLO AGREGA: no borra ni cambia datos, y las
   columnas nuevas aceptan NULL (o tienen un valor por defecto), así que
   la app móvil y el servidor Node siguen funcionando igual.
   ========================================================= */

/* ---------------------------------------------------------
   0. ¿ESTAMOS EN LA BASE CORRECTA?
   --------------------------------------------------------- */
SELECT @@SERVERNAME AS servidor, DB_NAME() AS base_actual;
DECLARE @base_actual NVARCHAR(128) = DB_NAME();
IF @base_actual <> 'FitManager'
BEGIN
    RAISERROR('Estás en la base "%s", no en FitManager. Cambia la base en SSMS y vuelve a ejecutar.', 16, 1, @base_actual);
    SET NOEXEC ON;
END
GO

/* ---------------------------------------------------------
   1. FACTURA: estado, empleado que la hizo y número de factura
   --------------------------------------------------------- */
IF COL_LENGTH('dbo.Factura', 'estado') IS NULL
    ALTER TABLE dbo.Factura ADD estado VARCHAR(20) NOT NULL
        CONSTRAINT DF_Factura_Estado DEFAULT ('Pagada') WITH VALUES;   -- las facturas viejas quedan 'Pagada'
GO
IF COL_LENGTH('dbo.Factura', 'id_usuario') IS NULL
    ALTER TABLE dbo.Factura ADD id_usuario INT NULL
        CONSTRAINT FK_Factura_Usuario REFERENCES dbo.Usuario (id_usuario);
GO
IF COL_LENGTH('dbo.Factura', 'numero_factura') IS NULL
    ALTER TABLE dbo.Factura ADD numero_factura VARCHAR(20) NULL;
GO

/* ---------------------------------------------------------
   2. ASIGNACIÓN DE ENTRENADOR: historial (fin, motivo, quién la hizo)
   --------------------------------------------------------- */
IF COL_LENGTH('dbo.AsignacionEntrenador', 'fecha_fin') IS NULL
    ALTER TABLE dbo.AsignacionEntrenador ADD fecha_fin DATE NULL;      -- NULL = asignación actual
GO
IF COL_LENGTH('dbo.AsignacionEntrenador', 'motivo') IS NULL
    ALTER TABLE dbo.AsignacionEntrenador ADD motivo VARCHAR(150) NULL;
GO
IF COL_LENGTH('dbo.AsignacionEntrenador', 'id_usuario') IS NULL
    ALTER TABLE dbo.AsignacionEntrenador ADD id_usuario INT NULL
        CONSTRAINT FK_AsignacionEntrenador_Usuario REFERENCES dbo.Usuario (id_usuario);
GO

/* ---------------------------------------------------------
   3. PAGO: referencia (número de autorización, boleta...)
   --------------------------------------------------------- */
IF COL_LENGTH('dbo.Pago', 'referencia') IS NULL
    ALTER TABLE dbo.Pago ADD referencia VARCHAR(50) NULL;
GO

/* ---------------------------------------------------------
   4. PRODUCTOS (FitStore)
   --------------------------------------------------------- */
IF OBJECT_ID('dbo.CategoriaProducto', 'U') IS NULL
    CREATE TABLE dbo.CategoriaProducto (
        id_categoria     INT IDENTITY(1,1) PRIMARY KEY,
        nombre_categoria VARCHAR(50) NOT NULL,
        descripcion      VARCHAR(150) NULL
    );
GO

IF OBJECT_ID('dbo.Producto', 'U') IS NULL
    CREATE TABLE dbo.Producto (
        id_producto         INT IDENTITY(1,1) PRIMARY KEY,
        codigo              VARCHAR(30) NOT NULL CONSTRAINT UQ_Producto_Codigo UNIQUE,
        nombre_producto     VARCHAR(100) NOT NULL,
        descripcion         VARCHAR(255) NULL,
        precio_venta        DECIMAL(10,2) NOT NULL,
        stock               INT NOT NULL DEFAULT 0,
        id_categoria        INT NOT NULL CONSTRAINT FK_Producto_Categoria REFERENCES dbo.CategoriaProducto (id_categoria),
        requiere_inventario BIT NOT NULL DEFAULT 1,
        activo              BIT NOT NULL DEFAULT 1,
        fecha_registro      DATETIME NOT NULL DEFAULT GETDATE(),
        id_estado           INT NULL CONSTRAINT FK_Producto_Estado REFERENCES dbo.Estado (id_estado)
    );
GO

-- Si Producto ya existía con la versión vieja (sku / precio), se agregan las
-- columnas nuevas y se copian los valores. Las columnas viejas se quedan.
IF COL_LENGTH('dbo.Producto', 'codigo') IS NULL
    ALTER TABLE dbo.Producto ADD codigo VARCHAR(50) NULL;
GO
IF COL_LENGTH('dbo.Producto', 'sku') IS NOT NULL
    EXEC (N'UPDATE dbo.Producto SET codigo = sku WHERE codigo IS NULL;');
GO
IF COL_LENGTH('dbo.Producto', 'precio_venta') IS NULL
    ALTER TABLE dbo.Producto ADD precio_venta DECIMAL(10,2) NULL;
GO
IF COL_LENGTH('dbo.Producto', 'precio') IS NOT NULL
    EXEC (N'UPDATE dbo.Producto SET precio_venta = precio WHERE precio_venta IS NULL;');
GO
IF COL_LENGTH('dbo.Producto', 'requiere_inventario') IS NULL
    ALTER TABLE dbo.Producto ADD requiere_inventario BIT NOT NULL
        CONSTRAINT DF_Producto_RequiereInventario DEFAULT (1) WITH VALUES;
GO
IF COL_LENGTH('dbo.Producto', 'activo') IS NULL
    ALTER TABLE dbo.Producto ADD activo BIT NOT NULL
        CONSTRAINT DF_Producto_Activo DEFAULT (1) WITH VALUES;
GO

-- Una línea de factura puede ser de un producto
IF COL_LENGTH('dbo.DetalleFactura', 'id_producto') IS NULL
    ALTER TABLE dbo.DetalleFactura ADD id_producto INT NULL
        CONSTRAINT FK_DetalleFactura_Producto REFERENCES dbo.Producto (id_producto);
GO

/* ---------------------------------------------------------
   5. INVENTARIO POR SUCURSAL Y SUS MOVIMIENTOS
   --------------------------------------------------------- */
IF OBJECT_ID('dbo.InventarioSucursal', 'U') IS NULL
    CREATE TABLE dbo.InventarioSucursal (
        id_producto  INT NOT NULL CONSTRAINT FK_InventarioSucursal_Producto REFERENCES dbo.Producto (id_producto),
        id_sucursal  INT NOT NULL CONSTRAINT FK_InventarioSucursal_Sucursal REFERENCES dbo.Sucursal (id_sucursal),
        stock_actual INT NOT NULL,
        stock_minimo INT NOT NULL,
        CONSTRAINT PK_InventarioSucursal PRIMARY KEY (id_producto, id_sucursal)
    );
GO

IF OBJECT_ID('dbo.MovimientoInventario', 'U') IS NULL
    CREATE TABLE dbo.MovimientoInventario (
        id_movimiento      INT IDENTITY(1,1) CONSTRAINT PK_MovimientoInventario PRIMARY KEY,
        id_producto        INT NOT NULL CONSTRAINT FK_MovimientoInventario_Producto REFERENCES dbo.Producto (id_producto),
        id_sucursal        INT NOT NULL CONSTRAINT FK_MovimientoInventario_Sucursal REFERENCES dbo.Sucursal (id_sucursal),
        tipo_movimiento    VARCHAR(20) NOT NULL,
        cantidad           INT NOT NULL,
        fecha_movimiento   DATETIME NOT NULL DEFAULT GETDATE(),
        id_usuario         INT NOT NULL CONSTRAINT FK_MovimientoInventario_Usuario REFERENCES dbo.Usuario (id_usuario),
        id_detalle_factura INT NULL CONSTRAINT FK_MovimientoInventario_DetalleFactura
                                    REFERENCES dbo.DetalleFactura (id_detalle_factura),
        observacion        VARCHAR(150) NULL
    );
GO

/* ---------------------------------------------------------
   6. HISTORIAL DE CAMBIOS DE HORARIO DE CLASES
   --------------------------------------------------------- */
IF OBJECT_ID('dbo.HistorialCambioHorario', 'U') IS NULL
    CREATE TABLE dbo.HistorialCambioHorario (
        id_cambio_horario   INT IDENTITY(1,1) CONSTRAINT PK_HistorialCambioHorario PRIMARY KEY,
        id_clase            INT NOT NULL CONSTRAINT FK_HistorialCambioHorario_ClaseGrupal
                                     REFERENCES dbo.ClaseGrupal (id_clase),
        fecha_hora_anterior DATETIME NOT NULL,
        fecha_hora_nueva    DATETIME NOT NULL,
        motivo              VARCHAR(150) NULL,
        id_usuario          INT NOT NULL CONSTRAINT FK_HistorialCambioHorario_Usuario
                                     REFERENCES dbo.Usuario (id_usuario),
        fecha_cambio        DATETIME NOT NULL DEFAULT GETDATE()
    );
GO

/* ---------------------------------------------------------
   7. REVISIÓN: todo debe salir 'ok'
   --------------------------------------------------------- */
SELECT c.tabla + '.' + c.columna AS necesita,
       CASE WHEN COL_LENGTH('dbo.' + c.tabla, c.columna) IS NULL THEN 'FALTA' ELSE 'ok' END AS estado
FROM (VALUES
    ('Factura', 'estado'), ('Factura', 'id_usuario'), ('Factura', 'numero_factura'),
    ('AsignacionEntrenador', 'fecha_fin'), ('AsignacionEntrenador', 'motivo'), ('AsignacionEntrenador', 'id_usuario'),
    ('Pago', 'referencia'), ('DetalleFactura', 'id_producto'),
    ('Producto', 'codigo'), ('Producto', 'precio_venta'), ('Producto', 'requiere_inventario'), ('Producto', 'activo'),
    ('InventarioSucursal', 'stock_actual'), ('MovimientoInventario', 'id_detalle_factura'),
    ('HistorialCambioHorario', 'fecha_hora_nueva')
) AS c(tabla, columna)
ORDER BY estado, necesita;
GO

SET NOEXEC OFF; -- por si el paso 0 detuvo el script
GO
