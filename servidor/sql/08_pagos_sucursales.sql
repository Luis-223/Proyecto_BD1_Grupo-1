/* =========================================================
   08_pagos_sucursales.sql — MIS PAGOS, MI SUCURSAL Y TODAS LAS SUCURSALES
   Ejecutar en la base FitManager (después de 07_entrenadores.sql),
   con un usuario administrador (este script modifica la tabla Sucursal).
   Se puede ejecutar más de una vez sin errores.

   Cambia la tabla Sucursal (columnas nuevas, todas opcionales):
     - id_municipio → en qué municipio está (para el mapa)
     - latitud / longitud → punto en el mapa. Si quedan vacías, el
       servidor las completa SOLO UNA VEZ con el centro del municipio
       (OpenStreetMap) y las guarda aquí. Si quieres el punto exacto
       de la sucursal, escríbelo tú (sección "A MANO") y el servidor no lo toca.

   Crea:
     - usp_App_ListarPagos               → facturas y pagos del cliente (mis_pagos.tsx)
     - usp_App_ListarSucursales          → todas las sucursales con su municipio (mapas)
     - usp_App_GuardarUbicacionSucursal  → el servidor guarda la ubicación encontrada

   Errores: números 50320 a 50339 (THROW).
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
   1. COLUMNAS NUEVAS EN Sucursal
   --------------------------------------------------------- */
IF COL_LENGTH('dbo.Sucursal', 'id_municipio') IS NULL
    ALTER TABLE dbo.Sucursal ADD id_municipio INT NULL
        CONSTRAINT FK_Sucursal_Municipio FOREIGN KEY REFERENCES dbo.Municipio(id_municipio);
GO
IF COL_LENGTH('dbo.Sucursal', 'latitud') IS NULL
    ALTER TABLE dbo.Sucursal ADD latitud DECIMAL(9,6) NULL;
GO
IF COL_LENGTH('dbo.Sucursal', 'longitud') IS NULL
    ALTER TABLE dbo.Sucursal ADD longitud DECIMAL(9,6) NULL;
GO

/* ---------------------------------------------------------
   2. MUNICIPIO AUTOMÁTICO POR NOMBRE
      Si la sucursal se llama como un municipio ("Chimaltenango",
      "FitManager Antigua Guatemala"...), se le asigna ese municipio.
      Sin importar mayúsculas ni tildes. Solo las que no tienen uno.
      REVISA la tabla del final (paso 7): si alguna quedó mal o vacía,
      corrígela con la sección "A MANO".
   --------------------------------------------------------- */
UPDATE s
SET id_municipio = coincidencia.id_municipio
FROM dbo.Sucursal s
CROSS APPLY (
    SELECT TOP 1 m.id_municipio
    FROM dbo.Municipio m
    WHERE s.nombre_sucursal COLLATE Latin1_General_CI_AI
          LIKE '%' + m.nombre_municipio COLLATE Latin1_General_CI_AI + '%'
    ORDER BY LEN(m.nombre_municipio) DESC      -- "Santa Lucía Cotzumalguapa" antes que "Santa Lucía"
) coincidencia
WHERE s.id_municipio IS NULL;
GO

/* ---------------------------------------------------------
   3. MIS PAGOS
      Resultado 1: una fila por factura (la más reciente primero)
      Resultado 2: las líneas de cada factura
      (rutas/cliente.js las junta por id_factura)
   --------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_App_ListarPagos
    @id_cliente INT
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM Cliente WHERE id_cliente = @id_cliente)
        THROW 50320, N'El cliente no existe.', 1;

    SELECT f.id_factura,
           COALESCE(f.numero_factura, CAST(f.id_factura AS VARCHAR(20))) AS numero,
           f.fecha_emision,
           f.total,
           f.estado,
           s.nombre_sucursal AS sucursal,
           ISNULL(pg.metodo, '')  AS metodo,
           pg.fecha_pago,
           pg.referencia,
           ISNULL(pg.pagado, 0)   AS pagado,
           CASE WHEN EXISTS (SELECT 1 FROM DetalleFactura d WHERE d.id_factura = f.id_factura AND d.id_membresia IS NOT NULL)
                THEN 'Membresía'
                WHEN EXISTS (SELECT 1 FROM DetalleFactura d WHERE d.id_factura = f.id_factura AND d.id_producto IS NOT NULL)
                THEN 'Productos'
                ELSE 'Otro' END AS tipo
    FROM Factura f
    JOIN Sucursal s ON s.id_sucursal = f.id_sucursal
    OUTER APPLY (
        SELECT TOP 1 mp.nombre_metodo AS metodo, p.fecha_pago, p.referencia,
               SUM(p.monto) OVER () AS pagado
        FROM Pago p
        JOIN MetodoPago mp ON mp.id_metodo_pago = p.id_metodo_pago
        WHERE p.id_factura = f.id_factura
        ORDER BY p.fecha_pago, p.id_pago
    ) pg
    WHERE f.id_cliente = @id_cliente
    ORDER BY f.fecha_emision DESC, f.id_factura DESC;

    SELECT d.id_factura, d.descripcion, d.cantidad, d.precio_unitario, d.subtotal
    FROM DetalleFactura d
    JOIN Factura f ON f.id_factura = d.id_factura
    WHERE f.id_cliente = @id_cliente
    ORDER BY d.id_factura, d.id_detalle_factura;
END
GO

/* ---------------------------------------------------------
   4. TODAS LAS SUCURSALES (con municipio y ubicación)
      es_mia = 1 en la sucursal del cliente.
   --------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_App_ListarSucursales
    @id_cliente INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @mia INT = (SELECT id_sucursal FROM Cliente WHERE id_cliente = @id_cliente);

    SELECT s.id_sucursal,
           s.nombre_sucursal AS nombre,
           s.direccion,
           s.telefono,
           m.nombre_municipio    AS municipio,
           d.nombre_departamento AS departamento,
           s.latitud,
           s.longitud,
           (SELECT COUNT(*) FROM Entrenador en
            JOIN Usuario u  ON u.id_usuario  = en.id_usuario
            JOIN Estado est ON est.id_estado = u.id_estado
            WHERE en.id_sucursal = s.id_sucursal
              AND LOWER(est.nombre_estado) NOT IN ('inactivo', 'suspendido', 'bloqueado')) AS entrenadores,
           (SELECT COUNT(*) FROM ClaseGrupal cg
            WHERE cg.id_sucursal = s.id_sucursal
              AND cg.fecha_hora >= GETDATE()
              AND cg.fecha_hora <  DATEADD(DAY, 7, GETDATE()))                          AS clases_semana,
           (SELECT COUNT(*) FROM Cliente c WHERE c.id_sucursal = s.id_sucursal)          AS miembros,
           CAST(CASE WHEN s.id_sucursal = @mia THEN 1 ELSE 0 END AS BIT)                  AS es_mia
    FROM Sucursal s
    LEFT JOIN Municipio m    ON m.id_municipio    = s.id_municipio
    LEFT JOIN Departamento d ON d.id_departamento = m.id_departamento
    ORDER BY CASE WHEN s.id_sucursal = @mia THEN 0 ELSE 1 END, s.nombre_sucursal;
END
GO

/* ---------------------------------------------------------
   5. GUARDAR LA UBICACIÓN ENCONTRADA POR EL SERVIDOR
      Solo si la sucursal todavía no tiene una: nunca pisa
      coordenadas escritas a mano.
   --------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_App_GuardarUbicacionSucursal
    @id_sucursal INT,
    @latitud     DECIMAL(9,6),
    @longitud    DECIMAL(9,6)
AS
BEGIN
    SET NOCOUNT ON;

    -- Guatemala está aprox. entre 13.5 y 18.0 de latitud y -92.5 y -88.0 de longitud
    IF @latitud NOT BETWEEN 13 AND 18.5 OR @longitud NOT BETWEEN -92.5 AND -88
        THROW 50321, N'La ubicación está fuera de Guatemala.', 1;

    UPDATE Sucursal
    SET latitud = @latitud, longitud = @longitud
    WHERE id_sucursal = @id_sucursal
      AND (latitud IS NULL OR longitud IS NULL);

    SELECT @@ROWCOUNT AS actualizadas;
END
GO

/* ---------------------------------------------------------
   A MANO (OPCIONAL): MUNICIPIO O PUNTO EXACTO
     Para el punto exacto: en Google Maps, clic derecho sobre la
     sucursal → el primer renglón son "latitud, longitud".

   UPDATE Sucursal SET id_municipio = (SELECT TOP 1 id_municipio FROM Municipio
                                       WHERE nombre_municipio = 'Chimaltenango')
   WHERE id_sucursal = 1;

   UPDATE Sucursal SET latitud = 14.661300, longitud = -90.819400
   WHERE id_sucursal = 1;
   --------------------------------------------------------- */

/* ---------------------------------------------------------
   6. PERMISOS (en Azure ya los tiene por EXECUTE sobre dbo)
   --------------------------------------------------------- */
DECLARE @usuario SYSNAME, @orden NVARCHAR(1000);
DECLARE usuarios CURSOR LOCAL FAST_FORWARD FOR
    SELECT name FROM sys.database_principals
    WHERE name IN ('FitManager', 'fitmanager_servidor');
OPEN usuarios;
FETCH NEXT FROM usuarios INTO @usuario;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @orden = N'GRANT EXECUTE ON dbo.usp_App_ListarPagos TO '              + QUOTENAME(@usuario) + N'; '
               + N'GRANT EXECUTE ON dbo.usp_App_ListarSucursales TO '         + QUOTENAME(@usuario) + N'; '
               + N'GRANT EXECUTE ON dbo.usp_App_GuardarUbicacionSucursal TO ' + QUOTENAME(@usuario) + N';';
    EXEC (@orden);
    PRINT 'Permisos concedidos a: ' + @usuario;
    FETCH NEXT FROM usuarios INTO @usuario;
END
CLOSE usuarios;
DEALLOCATE usuarios;
GO

/* ---------------------------------------------------------
   7. REVISIÓN: cada sucursal con su municipio.
      Si "municipio" sale vacío, la sucursal no tendrá mapa hasta que
      se lo asignes (sección "A MANO") o escribas sus coordenadas.
   --------------------------------------------------------- */
SELECT s.id_sucursal, s.nombre_sucursal, m.nombre_municipio AS municipio,
       d.nombre_departamento AS departamento, s.latitud, s.longitud
FROM Sucursal s
LEFT JOIN Municipio m    ON m.id_municipio    = s.id_municipio
LEFT JOIN Departamento d ON d.id_departamento = m.id_departamento
ORDER BY s.id_sucursal;

SELECT name AS procedimiento FROM sys.procedures
WHERE name IN ('usp_App_ListarPagos', 'usp_App_ListarSucursales', 'usp_App_GuardarUbicacionSucursal');
GO

SET NOEXEC OFF; -- por si el paso 0 detuvo el script
GO
