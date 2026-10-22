/* =========================================================
   03_membresia.sql — PAGAR / RENOVAR LA MEMBRESÍA DESDE LA APP
   Ejecutar en la base FitManager (después de 02_registro.sql).

   Crea:
     - usp_PagarMembresiaApp → factura la membresía (trama MEMBRESIA)
   Y da permiso de EXECUTE al mismo usuario que ya ejecuta usp_ObtenerCredencial
   (el usuario con el que se conecta el servidor Node).
   ========================================================= */

/* ---------------------------------------------------------
   0. ¿ESTAMOS EN LA BASE CORRECTA?
      Si SSMS tiene seleccionada otra base (por ejemplo master),
      el procedimiento se crearía ahí y el servidor no lo encontraría
      (error 2812). En ese caso el script se detiene sin crear nada.
      Cambia la base en el selector de SSMS a FitManager y vuelve a ejecutar.
   --------------------------------------------------------- */
SELECT @@SERVERNAME AS servidor, DB_NAME() AS base_actual;
DECLARE @base_actual NVARCHAR(128) = DB_NAME();
IF @base_actual <> 'FitManager'
BEGIN
    RAISERROR('Estás en la base "%s", no en FitManager. Cambia la base en SSMS y vuelve a ejecutar.', 16, 1, @base_actual);
    SET NOEXEC ON; -- no ejecuta nada más de este script
END
IF OBJECT_ID('dbo.usp_FacturarMembresia', 'P') IS NULL
BEGIN
    RAISERROR('En esta base no existe usp_FacturarMembresia: hay que crearlo antes de este script.', 16, 1);
    SET NOEXEC ON;
END
GO

/* ---------------------------------------------------------
   1. PAGAR UNA MEMBRESÍA
      - La sucursal de la factura es la sucursal del cliente.
      - Reutiliza usp_FacturarMembresia (Membresia + Factura +
        DetalleFactura + Pago). Si el cliente aún tiene membresía
        vigente, la nueva empieza el día siguiente a que termine.
      - Si el usuario estaba 'Inactivo' (membresía vencida o
        registrado sin pagar), pasa a 'Activo'. No toca a los
        usuarios Suspendidos o Bloqueados.
      Todo en UNA transacción: o se guarda todo, o nada.
   --------------------------------------------------------- */
CREATE OR ALTER PROCEDURE dbo.usp_PagarMembresiaApp
    @id_cliente         INT,
    @id_tipo_membresia  INT,
    @id_metodo_pago     INT,
    @meses              INT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @id_sucursal INT, @id_usuario INT;
    SELECT @id_sucursal = id_sucursal, @id_usuario = id_usuario
    FROM Cliente WHERE id_cliente = @id_cliente;

    IF @id_usuario IS NULL
        THROW 50040, 'El cliente no existe.', 1;
    IF NOT EXISTS (SELECT 1 FROM MetodoPago WHERE id_metodo_pago = @id_metodo_pago)
        THROW 50041, 'El método de pago no es válido.', 1;
    IF NOT EXISTS (SELECT 1 FROM TipoMembresia WHERE id_tipo_membresia = @id_tipo_membresia)
        THROW 50042, 'El tipo de membresía no existe.', 1;
    IF @meses IS NULL OR @meses < 1 OR @meses > 12
        THROW 50043, 'Se pueden pagar entre 1 y 12 meses.', 1;

    DECLARE @id_activo   INT = (SELECT id_estado FROM Estado WHERE nombre_estado = 'Activo');
    DECLARE @id_inactivo INT = (SELECT id_estado FROM Estado WHERE nombre_estado = 'Inactivo');
    IF @id_activo IS NULL
        THROW 50044, 'No existe el estado "Activo" en la tabla Estado.', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        EXEC dbo.usp_FacturarMembresia
             @id_cliente = @id_cliente, @id_tipo_membresia = @id_tipo_membresia,
             @id_sucursal = @id_sucursal, @id_metodo_pago = @id_metodo_pago, @meses = @meses;

        IF @id_inactivo IS NOT NULL
            UPDATE Usuario SET id_estado = @id_activo
            WHERE id_usuario = @id_usuario AND id_estado = @id_inactivo;

        COMMIT TRANSACTION;

        -- Último resultado: Node lo lee con recordsets.at(-1)
        SELECT MAX(m.fecha_fin) AS pagado_hasta,
               (SELECT precio_base FROM TipoMembresia WHERE id_tipo_membresia = @id_tipo_membresia) * @meses AS total
        FROM Membresia m
        WHERE m.id_cliente = @id_cliente AND m.estado <> 'Suspendida';
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO

/* ---------------------------------------------------------
   2. PERMISOS
      CAMBIO: antes se daba solo al PRIMER usuario encontrado (TOP 1).
      Si en la base existen "FitManager" y "fitmanager_servidor",
      podía quedarse sin permiso justo el que usa el servidor en la nube.
      Ahora se da a TODOS los que ya ejecutan usp_ObtenerCredencial
      y además, por nombre, a los dos usuarios conocidos (como 01_argon2.sql).
   --------------------------------------------------------- */
DECLARE @usuario SYSNAME, @orden NVARCHAR(500), @dados INT = 0;
DECLARE usuarios CURSOR LOCAL FAST_FORWARD FOR
    SELECT pr.name
    FROM sys.database_permissions pe
    JOIN sys.database_principals pr ON pr.principal_id = pe.grantee_principal_id
    WHERE pe.major_id = OBJECT_ID('dbo.usp_ObtenerCredencial')
      AND pe.permission_name = 'EXECUTE'
      AND pe.state_desc = 'GRANT'
    UNION
    SELECT name FROM sys.database_principals
    WHERE name IN ('FitManager', 'fitmanager_servidor');
OPEN usuarios;
FETCH NEXT FROM usuarios INTO @usuario;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @orden = N'GRANT EXECUTE ON dbo.usp_PagarMembresiaApp TO ' + QUOTENAME(@usuario) + N';';
    EXEC (@orden);
    PRINT 'Permiso concedido a: ' + @usuario;
    SET @dados += 1;
    FETCH NEXT FROM usuarios INTO @usuario;
END
CLOSE usuarios;
DEALLOCATE usuarios;

IF @dados = 0
    PRINT 'No se encontró el usuario de la app. Concede el permiso a mano: GRANT EXECUTE ON dbo.usp_PagarMembresiaApp TO [usuario];';
GO

/* ---------------------------------------------------------
   3. REVISIÓN RÁPIDA: deben salir los 2 procedimientos y,
      en la segunda tabla, el usuario del servidor (fitmanager_servidor)
   --------------------------------------------------------- */
SELECT name AS procedimiento FROM sys.procedures
WHERE name IN ('usp_PagarMembresiaApp', 'usp_FacturarMembresia');

SELECT USER_NAME(grantee_principal_id) AS usuario_con_permiso
FROM sys.database_permissions
WHERE major_id = OBJECT_ID('dbo.usp_PagarMembresiaApp') AND permission_name = 'EXECUTE';
GO

SET NOEXEC OFF; -- por si el paso 0 detuvo el script
GO
